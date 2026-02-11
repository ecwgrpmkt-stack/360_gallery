// --- ADMIN CONFIG ---
const ADMIN_PASSWORD = "ecw123"; 
let currentFile = null;

// On Load
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('gh_token');
    if (token) document.getElementById('gh-token').value = token;
    fetchGalleryImages();
});

// --- TOKEN LOCK/UNLOCK LOGIC ---
const tokenField = document.getElementById('gh-token');
const lockBtn = document.getElementById('lock-toggle');
const lockIcon = document.getElementById('lock-icon');

lockBtn.addEventListener('click', () => {
    if (tokenField.readOnly) {
        // Attempt Unlock
        const pass = prompt("Enter Admin Credential to Unlock:");
        if (pass === ADMIN_PASSWORD) {
            tokenField.readOnly = false;
            tokenField.type = "text";
            lockIcon.className = "fas fa-lock-open";
            tokenField.focus();
        } else {
            alert("Unauthorized Access!");
        }
    } else {
        // Lock and Save
        tokenField.readOnly = true;
        tokenField.type = "password";
        lockIcon.className = "fas fa-lock";
        localStorage.setItem('gh_token', tokenField.value);
    }
});

// --- RENAME MODAL LOGIC ---
function openRename(fileName) {
    currentFile = fileName;
    const dotIndex = fileName.lastIndexOf('.');
    const namePart = fileName.substring(0, dotIndex);
    const extPart = fileName.substring(dotIndex);

    document.getElementById('new-name-field').value = namePart;
    document.getElementById('ext-lock-label').innerText = extPart;
    document.getElementById('rename-modal').style.display = 'flex';
}

function closeRenameModal() {
    document.getElementById('rename-modal').style.display = 'none';
}

document.getElementById('confirm-rename').addEventListener('click', () => {
    const newName = document.getElementById('new-name-field').value.trim();
    const extension = document.getElementById('ext-lock-label').innerText;
    
    if (newName) {
        const finalFullName = newName + extension;
        console.log(`Debug: Renaming ${currentFile} to ${finalFullName}`);
        // Run GitHub API Rename Function here
        closeRenameModal();
    }
});

// --- MOCK API DATA (Replace with your actual Fetch logic) ---
function fetchGalleryImages() {
    const list = document.getElementById('image-list');
    // Mock Data for Debugging
    const images = [
        { name: 'lobby_view.jpg', url: 'https://via.placeholder.com/150' },
        { name: 'main_hall.png', url: 'https://via.placeholder.com/150' }
    ];

    list.innerHTML = images.map(img => `
        <tr>
            <td><img src="${img.url}" class="img-thumb"></td>
            <td>${img.name}</td>
            <td class="action-btns">
                <button class="btn-rename" onclick="openRename('${img.name}')"><i class="fas fa-edit"></i></button>
                <button class="btn-delete"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}
