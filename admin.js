// CONFIGURATION
const REPO_OWNER = "ecwgrpmkt-stack";
const REPO_NAME = "360_gallery";
const IMAGE_FOLDER = "images";

// 1. AUTH & INIT
if (sessionStorage.getItem('ecw_auth') !== 'true') window.location.href = 'index.html';
function logout() { sessionStorage.removeItem('ecw_auth'); window.location.href = 'index.html'; }

// UI FUNCTIONALITY: Bulletproof Token Lock
const tokenInput = document.getElementById('githubToken');
const tokenLockBtn = document.getElementById('tokenLockBtn');

const savedToken = localStorage.getItem('ecw_gh_token');
if (savedToken) tokenInput.value = savedToken;

tokenLockBtn.onclick = () => {
    // Check if it has the attribute instead of a variable flag
    if (tokenInput.hasAttribute('readonly')) {
        // UNLOCK IT (Forcefully remove restriction)
        tokenInput.type = 'text'; 
        tokenInput.removeAttribute('readonly');
        
        // Visual cue that it is editable
        tokenInput.style.backgroundColor = "rgba(0,0,0,0.2)";
        tokenInput.style.color = "#fff";
        
        tokenLockBtn.innerText = '🔓'; 
        tokenLockBtn.title = 'Lock & Save';
        tokenInput.focus();
    } else {
        // LOCK IT
        tokenInput.type = 'password'; 
        tokenInput.setAttribute('readonly', 'true');
        
        // Visual cue that it is locked
        tokenInput.style.backgroundColor = "rgba(0,0,0,0.6)";
        tokenInput.style.color = "#888";
        
        tokenLockBtn.innerText = '🔒'; 
        tokenLockBtn.title = 'Unlock to Edit';
        
        // Save automatically when locked
        localStorage.setItem('ecw_gh_token', tokenInput.value.trim());
    }
};

document.getElementById('copyRepoBtn').onclick = () => {
    document.getElementById('repoUrl').select();
    document.execCommand('copy');
    alert('Repository link copied to clipboard!');
};

// --- MODAL CONTROLLER ---
const modal = document.getElementById('customModal');
function closeModal() { modal.classList.remove('active'); }

// --- 2. ROW BUILDER (For Instant UI Updates) ---
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

// --- 3. FAST LOAD IMAGES ---
async function loadImages() {
    const tableBody = document.getElementById('imageTableBody');
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px;">Fetching repository data...</td></tr>`;
    
    try {
        const response = await fetch(`https://api.github
