const REPO_URL = "ecwgrpmkt-stack/360_gallery";
const ADMIN_PASS = "ecw123";
let currentToken = localStorage.getItem('gh_token') || "";

window.onload = () => { if (currentToken) loadAssets(); };

// --- UI HELPERS ---
const showLoader = () => document.getElementById('loading-modal').style.display = 'flex';
const hideLoader = () => document.getElementById('loading-modal').style.display = 'none';

// --- SECURITY: LOCK/UNLOCK ---
function toggleLock(type) {
    const field = type === 'token' ? document.getElementById('gh-token') : document.getElementById('gh-repo');
    const icon = document.getElementById(`lock-icon-${type}`);

    if (field.readOnly) {
        const pass = prompt("Admin Credential Required:");
        if (pass === ADMIN_PASS) {
            field.readOnly = false;
            field.type = "text";
            field.value = type === 'token' ? currentToken : REPO_URL;
            icon.className = "fas fa-lock-open";
        } else { alert("Access Denied"); }
    } else {
        if (type === 'token') {
            currentToken = field.value;
            localStorage.setItem('gh_token', currentToken);
        }
        field.readOnly = true;
        field.type = "password";
        field.value = "********************";
        icon.className = "fas fa-lock";
        loadAssets();
    }
}

// --- CORE: READ (LOAD ASSETS) ---
async function loadAssets() {
    if (!currentToken) return;
    const tbody = document.getElementById('asset-table');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center"><i class="fas fa-spinner fa-spin"></i> Fetching repository...</td></tr>';
    
    try {
        // Add cache buster ?t= to force fresh data
        const res = await fetch(`https://api.github.com/repos/${REPO_URL}/contents/images?t=${Date.now()}`, {
            headers: { 'Authorization': `token ${currentToken}` }
        });
        if(!res.ok) throw new Error("Invalid Token or Repo");
        
        const files = await res.json();
        tbody.innerHTML = "";

        files.forEach(file => {
            if (file.type === "file") {
                const isHidden = file.name.startsWith('hidden_');
                const displayName = isHidden ? file.name.replace('hidden_', '') : file.name;
                
                tbody.innerHTML += `
                    <tr>
                        <td><img src="${file.download_url}" class="thumb"></td>
                        <td>${displayName}</td>
                        <td><span class="status-badge ${isHidden ? 'status-hidden' : 'status-live'}">${isHidden ? 'HIDDEN' : 'LIVE'}</span></td>
                        <td style="display:flex; gap:8px">
                            <button class="btn btn-secondary" title="${isHidden ? 'Show' : 'Hide'}" onclick="toggleVisibility('${file.name}', ${isHidden}, '${file.sha}')">
                                <i class="fas ${isHidden ? 'fa-eye' : 'fa-eye-slash'}"></i>
                            </button>
                            <button class="btn btn-secondary" title="Rename" onclick="openRename('${file.name}', '${file.sha}')"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-secondary" title="Delete" style="color:#ff4444" onclick="deleteAsset('${file.name}', '${file.sha}')"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            }
        });
    } catch (e) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#ff4444;">Error: ${e.message}</td></tr>`; }
}

// --- CORE: CREATE (UPLOAD BASE64) ---
async function handleUpload(input) {
    const file = input.files[0];
    if (!file) return;

    showLoader();
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64Content = e.target.result.split(',')[1]; // Remove data:image/jpeg;base64,
        try {
            await fetch(`https://api.github.com/repos/${REPO_URL}/contents/images/${file.name}`, {
                method: 'PUT',
                headers: { 'Authorization': `token ${currentToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: `Admin: Uploaded ${file.name}`, content: base64Content })
            });
            input.value = ""; // Reset input
            loadAssets();
        } catch (err) { alert("Upload Failed."); }
        finally { hideLoader(); }
    };
    reader.readAsDataURL(file);
}

// --- CORE: UPDATE (RENAME / HIDE) ---
async function toggleVisibility(oldName, currentlyHidden, sha) {
    const newName = currentlyHidden ? oldName.replace('hidden_', '') : 'hidden_' + oldName;
    await renameFileOnGithub(oldName, newName, sha);
}

let renameSha = "", oldFileName = "";
function openRename(name, sha) {
    oldFileName = name; renameSha = sha;
    const dot = name.lastIndexOf('.');
    document.getElementById('rename-input').value = name.substring(0, dot).replace('hidden_', '');
    document.getElementById('ext-label').innerText = name.substring(dot);
    document.getElementById('rename-modal').style.display = 'flex';
}

function closeModal() { document.getElementById('rename-modal').style.display = 'none'; }

document.getElementById('confirm-rename').onclick = async () => {
    const newBase = document.getElementById('rename-input').value.trim();
    if(!newBase) return alert("Name cannot be empty");
    const ext = document.getElementById('ext-label').innerText;
    
    // Preserve hidden status if it was hidden
    const prefix = oldFileName.startsWith('hidden_') ? 'hidden_' : '';
    await renameFileOnGithub(oldFileName, prefix + newBase + ext, renameSha);
    closeModal();
};

async function renameFileOnGithub(oldName, newName, sha) {
    showLoader();
    try {
        // 1. Get original content
        const getRes = await fetch(`https://api.github.com/repos/${REPO_URL}/contents/images/${oldName}?t=${Date.now()}`, { headers: { 'Authorization': `token ${currentToken}` }});
        const fileData = await getRes.json();

        // 2. Create new file
        await fetch(`https://api.github.com/repos/${REPO_URL}/contents/images/${newName}`, {
            method: 'PUT',
            headers: { 'Authorization': `token ${currentToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `Admin: Renamed ${oldName} to ${newName}`, content: fileData.content })
        });

        // 3. Delete old file
        await fetch(`https://api.github.com/repos/${REPO_URL}/contents/images/${oldName}`, {
            method: 'DELETE',
            headers: { 'Authorization': `token ${currentToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `Admin: Deleted old file ${oldName}`, sha: sha })
        });
        loadAssets();
    } catch (error) { alert("Rename operation failed."); console.error(error); }
    finally { hideLoader(); }
}

// --- CORE: DELETE ---
async function deleteAsset(name, sha) {
    if(!confirm(`Are you sure you want to permanently delete ${name}?`)) return;
    showLoader();
    try {
        await fetch(`https://api.github.com/repos/${REPO_URL}/contents/images/${name}`, {
            method: 'DELETE',
            headers: { 'Authorization': `token ${currentToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `Admin: Deleted ${name}`, sha: sha })
        });
        loadAssets();
    } catch (error) { alert("Delete failed."); }
    finally { hideLoader(); }
}
