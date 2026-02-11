// CONFIGURATION
const REPO_OWNER = "ecwgrpmkt-stack";
const REPO_NAME = "360_gallery";
const IMAGE_FOLDER = "images";

// --- 1. AUTH & INIT ---
if (sessionStorage.getItem('ecw_auth') !== 'true') window.location.href = 'index.html';
function logout() { sessionStorage.removeItem('ecw_auth'); window.location.href = 'index.html'; }

// --- 2. SMART TOKEN LOCK LOGIC ---
const tokenInput = document.getElementById('githubToken');
const tokenLockBtn = document.getElementById('tokenLockBtn');

let isTokenLocked = true; 
const savedToken = localStorage.getItem('ecw_gh_token');

// Smart Initialization
if (savedToken) {
    // We have a saved token. Keep it locked.
    tokenInput.value = savedToken;
    lockTokenField();
} else {
    // No token saved yet. Auto-unlock it for the user.
    unlockTokenField();
}

function unlockTokenField() {
    tokenInput.readOnly = false;      
    tokenInput.disabled = false;      
    tokenInput.type = 'text';         
    tokenInput.style.backgroundColor = "rgba(0,0,0,0.2)";
    tokenInput.style.color = "#ffffff";
    tokenLockBtn.innerText = '🔓'; 
    tokenLockBtn.title = 'Lock & Save';
    isTokenLocked = false;
}

function lockTokenField() {
    tokenInput.readOnly = true;       
    tokenInput.type = 'password';     
    tokenInput.style.backgroundColor = "rgba(0,0,0,0.6)";
    tokenInput.style.color = "#888888";
    tokenLockBtn.innerText = '🔒'; 
    tokenLockBtn.title = 'Unlock to Edit';
    isTokenLocked = true;
    
    // Save only if there is actual text
    if (tokenInput.value.trim() !== '') {
        localStorage.setItem('ecw_gh_token', tokenInput.value.trim());
    }
}

tokenLockBtn.addEventListener('click', () => {
    if (isTokenLocked) {
        unlockTokenField();
        tokenInput.focus();
    } else {
        lockTokenField();
    }
});

// Copy Repo Link
document.getElementById('copyRepoBtn').onclick = () => {
    const repoUrl = document.getElementById('repoUrl');
    repoUrl.select();
    document.execCommand('copy');
    alert('Repository link copied to clipboard!');
};

// --- MODAL CONTROLLER ---
const modal = document.getElementById('customModal');
function closeModal() { modal.classList.remove('active'); }

// --- 3. ROW BUILDER ---
function buildRowHTML(file) {
    const isDisabled = file.name.startsWith("disabled_");
    const cleanName = isDisabled ? file.name.replace("disabled_", "") : file.name;
    const statusBadge = isDisabled ? `<span class="badge warning">Hidden</span>` : `<span class="badge success">Live</span>`;
    const safeName = file.name.replace(/'/g, "\\'"); 
    const fastThumbUrl = `https://wsrv.nl/?url=${encodeURIComponent(file.download_url)}&w=150&q=60&output=webp`;

    const actions = `
        <div class="action-buttons">
            <button onclick="openRenameModal('${safeName}', '${file.sha}', '${file.download_url}')" class="btn-mini btn-blue" title="Rename">✎</button>
            <button onclick="toggleVisibility('${safeName}', '${file.sha}', '${file.download_url}')" class="btn-mini btn-yellow" title="${isDisabled ? 'Show' : 'Hide'}">${isDisabled ? '👁️' : '🚫'}</button>
            <button onclick="openDeleteModal('${safeName}', '${file.sha}')" class="btn-mini btn-red" title="Delete">🗑️</button>
        </div>
    `;
    
    return `
        <td><img src="${fastThumbUrl}" class="admin-thumb" style="opacity: ${isDisabled ? 0.5 : 1}"></td>
        <td style="color: ${isDisabled ? '#888' : '#fff'}">${cleanName}</td>
        <td class="dim-cell">...</td>
        <td>${statusBadge}</td>
        <td>${actions}</td>
    `;
}

// --- 4. FAST LOAD IMAGES ---
async function loadImages() {
    const tableBody = document.getElementById('imageTableBody');
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px;">Fetching repository data...</td></tr>`;
    
    try {
        const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${IMAGE_FOLDER}?t=${Date.now()}`);
        if (!response.ok) throw new Error("Failed to fetch image list. Check repository status.");
        
        const data = await response.json();
        const images = data.filter(file => file.name.match(/\.(jpg|jpeg|png)$/i));

        tableBody.innerHTML = ""; 

        for (const file of images) {
            const row = document.createElement('tr');
            row.id = `row-${file.sha}`; 
            row.innerHTML = buildRowHTML(file);
            tableBody.appendChild(row);
            analyzeImage(file.download_url, row.querySelector('.dim-cell'));
        }
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    }
}

function analyzeImage(url, cellElement) {
    const img = new Image(); img.crossOrigin = "Anonymous"; img.src = url;
    img.onload = function() { cellElement.innerText = `${img.naturalWidth} x ${img.naturalHeight}`; };
}

// --- 5. GITHUB API HELPER ---
async function githubRequest(endpoint, method = 'GET', body = null) {
    const rawToken = document.getElementById('githubToken').value;
    const cleanToken = rawToken.replace(/[^a-zA-Z0-9_\-]/g, ''); 
    
    if (!cleanToken) {
        // Auto-unlock the field so they can enter it
        if(isTokenLocked) unlockTokenField();
        tokenInput.focus();
        throw new Error("Please enter and lock your GitHub Token first.");
    }
    
    const options = {
        method: method,
        headers: { 
            'Authorization': `token ${cleanToken}`, 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        }
    };
    if (body) options.body = JSON.stringify(body);
    
    const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/${endpoint}`, options);
    
    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || `API Error: ${response.status}`);
    }
    return response;
}

// --- 6. MODAL WORKFLOWS ---
function openDeleteModal(filename, sha) {
    document.getElementById('modalTitle').innerText = "Delete Image";
    document.getElementById('modalBody').innerHTML = `
        <p>Are you sure you want to permanently delete <strong>${filename}</strong>?</p>
        <p style="color:#ff3333; font-size:0.9rem; margin-top:5px;">This action cannot be undone.</p>
        <div id="modalStatus" style="margin-top:10px; font-weight:bold;"></div>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="modal-btn btn-cancel" onclick="closeModal()">Cancel</button>
        <button class="modal-btn btn-confirm" id="confirmActionBtn" onclick="executeDelete('${filename}', '${sha}')">Yes, Delete</button>
    `;
    modal.classList.add('active');
}

async function executeDelete(filename, sha) {
    const btn = document.getElementById('confirmActionBtn');
    const statusMsg = document.getElementById('modalStatus');
    btn.innerText = "Deleting..."; btn.disabled = true;
    statusMsg.innerHTML = `<span style="color:orange">Removing from GitHub...</span>`;
    
    try {
        await githubRequest(`contents/${IMAGE_FOLDER}/${encodeURIComponent(filename)}`, 'DELETE', { 
            message: `Delete ${filename} via Admin Panel`, sha: sha 
        });
        document.getElementById(`row-${sha}`).remove();
        closeModal();
    } catch (err) {
        statusMsg.innerHTML = `<span style="color:red">Failed: ${err.message}</span>`;
        btn.innerText = "Yes, Delete"; btn.disabled = false;
    }
}

function openRenameModal(oldName, sha, downloadUrl) {
    const lastDot = oldName.lastIndexOf('.');
    const baseName = oldName.substring(0, lastDot);
    const ext = oldName.substring(lastDot);

    document.getElementById('modalTitle').innerText = "Rename Image";
    document.getElementById('modalBody').innerHTML = `
        <label style="color:#888; font-size:0.9rem;">New Filename</label>
        <div class="rename-input-group">
            <input type="text" id="renameBaseInput" value="${baseName}" autocomplete="off">
            <span class="rename-ext">${ext}</span>
        </div>
        <div id="modalStatus" style="margin-top:10px; font-weight:bold;"></div>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="modal-btn btn-cancel" onclick="closeModal()">Cancel</button>
        <button class="modal-btn btn-save" id="confirmActionBtn" onclick="executeRename('${oldName}', '${ext}', '${sha}', '${downloadUrl}')">Save</button>
    `;
    modal.classList.add('active');
    setTimeout(() => { document.getElementById('renameBaseInput').focus(); }, 100);
}

async function executeRename(oldName, ext, sha, downloadUrl) {
    const baseInput = document.getElementById('renameBaseInput').value.trim();
    const safeBaseInput = baseInput.replace(/[^a-zA-Z0-9.\-_]/g, '_'); 

    if (!safeBaseInput) { document.getElementById('modalStatus').innerHTML = `<span style="color:red">Filename cannot be empty.</span>`; return; }
    
    const newName = safeBaseInput + ext;
    if (newName === oldName) { closeModal(); return; }

    performRename(oldName, newName, sha, downloadUrl, "Saving rename...");
}

async function toggleVisibility(filename, sha, downloadUrl) {
    const isHidden = filename.startsWith("disabled_");
    const newName = isHidden ? filename.replace("disabled_", "") : `disabled_${filename}`;
    performRename(filename, newName, sha, downloadUrl, "Toggling visibility...");
}

async function performRename(oldName, newName, oldSha, downloadUrl, loadingMsg) {
    const statusMsg = document.getElementById('modalStatus') || document.getElementById('uploadStatus');
    const btn = document.getElementById('confirmActionBtn');
    
    if(btn) { btn.innerText = "Processing..."; btn.disabled = true; }
    statusMsg.innerHTML = `<span style="color:orange">${loadingMsg}</span>`;

    try {
        const fetchRes = await fetch(downloadUrl);
        if (!fetchRes.ok) throw new Error("Could not download original file.");
        const blob = await fetchRes.blob();
        
        const reader = new FileReader(); reader.readAsDataURL(blob);
        reader.onloadend = async function() {
            try {
                const base64data = reader.result.split(',')[1];
                
                const putRes = await githubRequest(`contents/${IMAGE_FOLDER}/${encodeURIComponent(newName)}`, 'PUT', { 
                    message: `Rename ${oldName} to ${newName}`, content: base64data 
                });
                const newFileData = await putRes.json();
                
                await githubRequest(`contents/${IMAGE_FOLDER}/${encodeURIComponent(oldName)}`, 'DELETE', { 
                    message: `Cleanup old file`, sha: oldSha 
                });
                
                const row = document.getElementById(`row-${oldSha}`);
                row.id = `row-${newFileData.content.sha}`; 
                row.innerHTML = buildRowHTML(newFileData.content); 
                analyzeImage(newFileData.content.download_url, row.querySelector('.dim-cell'));
                
                if(modal.classList.contains('active')) closeModal();
                statusMsg.innerHTML = `<span style="color:#00ff00">Success!</span>`;
                setTimeout(() => statusMsg.innerHTML = '', 3000);
            } catch (apiErr) {
                statusMsg.innerHTML = `<span style="color:red">API Error: ${apiErr.message}</span>`;
                if(btn) { btn.innerText = "Save"; btn.disabled = false; }
            }
        };
    } catch (err) {
        statusMsg.innerHTML = `<span style="color:red">Error: ${err.message}</span>`;
        if(btn) { btn.innerText = "Save"; btn.disabled = false; }
    }
}

// --- 7. UPLOAD NEW IMAGE ---
document.getElementById('fileInput').addEventListener('change', async function() {
    const file = this.files[0];
    const statusMsg = document.getElementById('uploadStatus');
    if (!file) return;

    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > 25) {
        statusMsg.innerHTML = `<span style="color:red">Error: File is too large (${fileSizeMB.toFixed(1)}MB). Max size is 25MB.</span>`;
        return;
    }

    const safeFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

    try {
        const token = document.getElementById('githubToken').value.trim();
        if (!token) {
            if(isTokenLocked) unlockTokenField();
            document.getElementById('githubToken').focus();
            throw new Error("GitHub Token required. Please enter and lock it.");
        }
        
        // Auto-lock and save if they hit upload while it's unlocked
        if(!isTokenLocked) lockTokenField();

        statusMsg.innerHTML = `<span style="color:orange">Reading file...</span>`;

        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = async function() {
            try {
                const base64Content = reader.result.split(',')[1];
                statusMsg.innerHTML = `<span style="color:orange">Checking existing files...</span>`;

                let existingSha = null;
                try {
                    const checkRes = await githubRequest(`contents/${IMAGE_FOLDER}/${encodeURIComponent(safeFileName)}`, 'GET');
                    const existingFile = await checkRes.json();
                    existingSha = existingFile.sha;
                } catch (e) { }

                statusMsg.innerHTML = `<span style="color:orange">Uploading to GitHub...</span>`;
                const requestBody = { message: `Upload ${safeFileName}`, content: base64Content };
                if (existingSha) requestBody.sha = existingSha;

                const uploadRes = await githubRequest(`contents/${IMAGE_FOLDER}/${encodeURIComponent(safeFileName)}`, 'PUT', requestBody);
                const newFileData = await uploadRes.json();
                
                statusMsg.innerHTML = `<span style="color:#00ff00">Upload Complete!</span>`; 
                
                const tableBody = document.getElementById('imageTableBody');
                if(tableBody.innerText.includes('Fetching')) tableBody.innerHTML = '';
                
                if (existingSha) {
                    const oldRow = document.getElementById(`row-${existingSha}`);
                    if (oldRow) oldRow.remove();
                }

                const newRow = document.createElement('tr');
                newRow.id = `row-${newFileData.content.sha}`;
                newRow.innerHTML = buildRowHTML(newFileData.content);
                tableBody.prepend(newRow); 
                analyzeImage(newFileData.content.download_url, newRow.querySelector('.dim-cell'));
                
                setTimeout(() => statusMsg.innerHTML = '', 3000);
            } catch (err) { statusMsg.innerHTML = `<span style="color:red">Upload Failed: ${err.message}</span>`; }
        };
    } catch (error) { statusMsg.innerHTML = `<span style="color:red">${error.message}</span>`; }
});

// Start
loadImages();
