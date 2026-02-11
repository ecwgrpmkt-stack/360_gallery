const REPO_OWNER = "ecwgrpmkt-stack";
const REPO_NAME = "360_gallery";
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/images?t=${Date.now()}`;

let viewer = null;
let visibleImages = [];
let currentIndex = 0;
let idleTimer, autoPlayTimer;

// Drawing State Variables
let isDrawingMode = false;
let isDrawing = false;
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let paths = [];
let redoStack = [];
let currentPath = [];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('ecwLoader').classList.add('active');
    if (canvas) resizeCanvas();
    await loadGalleryData();
    
    if (visibleImages.length > 0) {
        initViewer(visibleImages[0].download_url);
        renderThumbnails();
    } else {
        document.getElementById('ecwLoader').classList.remove('active');
        document.getElementById('panorama').innerHTML = "<h2 style='color:white; text-align:center; padding-top:20%; font-family:sans-serif;'>No public images available.</h2>";
    }
});

// --- CORE LOGIC: FETCH & FILTER ---
async function loadGalleryData() {
    try {
        const response = await fetch(GITHUB_API_URL);
        const allFiles = await response.json();
        
        // Critical Filter: Ignore files starting with 'hidden_'
        visibleImages = allFiles.filter(file => {
            return file.type === "file" && 
                   file.name.match(/\.(jpg|jpeg|png|webp)$/i) && 
                   !file.name.startsWith('hidden_');
        });
    } catch (error) { console.error("Gallery Load Error:", error); }
}

// --- VIEWER INTEGRATION ---
function initViewer(imageUrl) {
    if (viewer) viewer.destroy();

    viewer = pannellum.viewer('panorama', {
        "type": "equirectangular",
        "panorama": imageUrl,
        "autoLoad": true,
        "showControls": false,
        "mouseZoom": true,
        "autoRotate": -2
    });

    viewer.on('load', () => {
        document.getElementById('ecwLoader').classList.remove('active');
        startTimers();
        clearCanvas(); // Clear drawings when switching scenes
    });

    viewer.on('error', () => { autoPlayNext(); });
    viewer.on('mousedown', startTimers);
    viewer.on('touchstart', startTimers);
}

function switchScene(index) {
    if (index === currentIndex) return;
    currentIndex = index;
    document.getElementById('ecwLoader').classList.add('active');
    initViewer(visibleImages[currentIndex].download_url);
    updateActiveThumbnail();
}

// --- THUMBNAIL RENDERING (SIDEBAR) ---
function renderThumbnails() {
    const container = document.getElementById('thumbPanel');
    if (!container) return;
    container.innerHTML = "";
    
    visibleImages.forEach((img, index) => {
        const imgElement = document.createElement('img');
        imgElement.src = img.download_url;
        imgElement.className = `thumb ${index === 0 ? 'active' : ''}`;
        imgElement.onclick = () => switchScene(index);
        container.appendChild(imgElement);
    });
}

function updateActiveThumbnail() {
    document.querySelectorAll('.thumb').forEach((thumb, index) => {
        thumb.classList.toggle('active', index === currentIndex);
    });
}

// --- TIMERS & UX ---
function startTimers() {
    clearTimeout(idleTimer);
    clearTimeout(autoPlayTimer);
    document.getElementById('idleIndicator').classList.remove('visible');
    
    if(!isDrawingMode) {
        idleTimer = setTimeout(() => {
            document.getElementById('idleIndicator').classList.add('visible');
        }, 4000);
        autoPlayTimer = setTimeout(autoPlayNext, 60000);
    }
}

function autoPlayNext() {
    if (visibleImages.length <= 1) return;
    switchScene((currentIndex + 1) % visibleImages.length);
}

window.addEventListener('mousemove', startTimers);
window.addEventListener('keydown', startTimers);

// --- DRAWING CANVAS LOGIC ---
if (document.getElementById('toggleDraw')) {
    document.getElementById('toggleDraw').addEventListener('click', () => {
        isDrawingMode = !isDrawingMode;
        document.getElementById('toggleDraw').classList.toggle('active');
        document.getElementById('drawTools').style.display = isDrawingMode ? 'flex' : 'none';
        
        if (isDrawingMode) {
            canvas.classList.add('active');
            clearTimeout(autoPlayTimer); 
            if (viewer) viewer.setPitch(viewer.getPitch()); 
        } else {
            canvas.classList.remove('active');
            startTimers();
        }
    });

    function resizeCanvas() {
        const viewerDiv = document.getElementById('viewer');
        if (viewerDiv) {
            canvas.width = viewerDiv.clientWidth;
            canvas.height = viewerDiv.clientHeight;
            redrawCanvas();
        }
    }
    window.addEventListener('resize', resizeCanvas);

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    canvas.addEventListener('touchstart', (e) => startDrawing(e.touches[0]));
    canvas.addEventListener('touchmove', (e) => draw(e.touches[0]));
    canvas.addEventListener('touchend', stopDrawing);

    function startDrawing(e) {
        if (!isDrawingMode) return;
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        currentPath = [{ x, y }];
        ctx.beginPath();
        ctx.moveTo(x, y);
    }

    function draw(e) {
        if (!isDrawing || !isDrawingMode) return;
        if (e.preventDefault) e.preventDefault(); 
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        ctx.lineWidth = document.getElementById('brushSize').value;
        ctx.lineCap = 'round';
        ctx.strokeStyle = document.getElementById('colorPicker').value;
        
        ctx.lineTo(x, y);
        ctx.stroke();
        currentPath.push({ x, y });
    }

    function stopDrawing() {
        if (!isDrawing) return;
        isDrawing = false;
        if (currentPath.length > 0) {
            paths.push({
                color: document.getElementById('colorPicker').value,
                size: document.getElementById('brushSize').value,
                points: currentPath
            });
            redoStack = []; 
        }
    }

    document.getElementById('undoBtn').addEventListener('click', () => {
        if (paths.length === 0) return;
        redoStack.push(paths.pop());
        redrawCanvas();
    });

    document.getElementById('redoBtn').addEventListener('click', () => {
        if (redoStack.length === 0) return;
        paths.push(redoStack.pop());
        redrawCanvas();
    });

    document.getElementById('clearBtn').addEventListener('click', clearCanvas);

    function clearCanvas() {
        paths = [];
        redoStack = [];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function redrawCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        paths.forEach(path => {
            ctx.beginPath();
            ctx.lineWidth = path.size;
            ctx.lineCap = 'round';
            ctx.strokeStyle = path.color;
            
            for (let i = 0; i < path.points.length; i++) {
                if (i === 0) ctx.moveTo(path.points[i].x, path.points[i].y);
                else ctx.lineTo(path.points[i].x, path.points[i].y);
            }
            ctx.stroke();
        });
    }
}
