// CONFIGURATION
const REPO_OWNER = "ecwgrpmkt-stack";
const REPO_NAME = "360_gallery";
const IMAGE_FOLDER_PATH = "images";
const BRANCH_FALLBACK = "main"; 

// GLOBALS
let images = []; 
let currentIndex = 0;
let viewer = null;
let activeImageSrc = null;

// TIMERS
let idleTimer = null;
let slideTimer = null;
const IDLE_DELAY = 3000;       
const AUTO_PLAY_DELAY = 60000; 

// DRAWING GLOBALS
let isDrawingMode = false;
let isDrawing = false;
let drawCtx = null;
let canvas = null;
let currentBrushSize = 5;
let currentColor = "#ff0000";
let isEraser = false;

// HISTORY SYSTEM
let drawingHistory = [];
let historyStep = -1;
const MAX_HISTORY = 3;

// --- 1. INITIALIZATION ---

async function initGallery() {
    initDrawingTools();
    console.log("Initializing Gallery...");

    try {
        const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${IMAGE_FOLDER_PATH}`;
        const response = await fetch(apiUrl);

        if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);

        const data = await response.json();
        images = data
            .filter(file => file.name.match(/\.(jpg|jpeg|png)$/i))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}))
            .map(file => {
                const rawUrl = file.download_url;
                const optimizedSrc = `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=8000&we&q=85&output=webp`;
                return { src: optimizedSrc, originalPath: rawUrl };
            });

        finishInit();
    } catch (error) {
        console.warn("Switching to Fallback Mode...", error);
        loadFallbackImages();
    }
}

function loadFallbackImages() {
    const fallbackList = [];
    for (let i = 1; i <= 15; i++) {
        const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH_FALLBACK}/${IMAGE_FOLDER_PATH}/img${i}.jpg`;
        const optimizedSrc = `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=8000&we&q=85&output=webp`;
        fallbackList.push({ src: optimizedSrc, originalPath: rawUrl });
    }
    images = fallbackList;
    finishInit();
}

function finishInit() {
    if (images.length === 0) {
        alert("Error: No images found.");
        return;
    }
    buildThumbnails();
    loadViewer(currentIndex);
}

// --- 2. DRAWING & HISTORY LOGIC ---

function initDrawingTools() {
    canvas = document.getElementById("drawingCanvas");
    drawCtx = canvas.getContext("2d");

    // Initial resize to match layout
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Elements
    const pencilBtn = document.getElementById("pencilBtn");
    const brushSizeBtn = document.getElementById("brushSizeBtn");
    const colorPaletteBtn = document.getElementById("colorPaletteBtn");
    const eraserBtn = document.getElementById("eraserBtn");
    const clearBtn = document.getElementById("clearBtn");
    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");
    const sizeSlider = document.getElementById("sizeSlider");

    // Handlers
    pencilBtn.onclick = () => { isDrawingMode = !isDrawingMode; toggleDrawingState(); };
    
    brushSizeBtn.onclick = () => togglePopup("brushPopup");
    sizeSlider.oninput = (e) => { currentBrushSize = e.target.value; };

    colorPaletteBtn.onclick = () => {
        togglePopup("colorPopup");
        if (isEraser) { isEraser = false; eraserBtn.classList.remove("active"); }
    };
    
    document.querySelectorAll(".color-swatch").forEach(swatch => {
        swatch.onclick = () => {
            currentColor = swatch.getAttribute("data-color");
            document.getElementById("colorPopup").style.display = "none";
            // Auto-enable drawing when color selected
            if (!isDrawingMode) {
                isDrawingMode = true;
                toggleDrawingState();
            }
        };
    });

    eraserBtn.onclick = () => {
        if (!isDrawingMode) return;
        isEraser = !isEraser;
        eraserBtn.classList.toggle("active", isEraser);
    };

    clearBtn.onclick = () => {
        clearCanvas();
        // Also exit drawing mode on clear
        if (isDrawingMode) { isDrawingMode = false; toggleDrawingState(); }
    };

    undoBtn.onclick = undoLastStroke;
    redoBtn.onclick = redoLastStroke;

    // Canvas Events
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseout', stopDraw);
    
    // Touch Events
    canvas.addEventListener('touchstart', (e) => { if(e.cancelable) e.preventDefault(); startDraw(e.touches[0]); }, {passive: false});
    canvas.addEventListener('touchmove', (e) => { if(e.cancelable) e.preventDefault(); draw(e.touches[0]); }, {passive: false});
    canvas.addEventListener('touchend', stopDraw);
}

function resizeCanvas() {
    if (canvas && canvas.parentElement) {
        // MATCH CSS: Width is parent width minus sidebar (140px)
        canvas.width = canvas.parentElement.clientWidth - 140;
        canvas.height = canvas.parentElement.clientHeight;
        
        // Note: Resizing clears canvas. If persistence is needed, we'd redraw history here.
        // For now, we accept clear-on-resize to keep logic simple.
    }
}

function togglePopup(id) {
    const popups = document.querySelectorAll(".tool-popup");
    popups.forEach(p => {
        p.style.display = (p.id === id && p.style.display !== "flex") ? "flex" : "none";
    });
}

function toggleDrawingState() {
    const pencilBtn = document.getElementById("pencilBtn");
    const lockIcon = document.getElementById("lockIndicatorTool");
    const controls = document.getElementById("controls");

    if (isDrawingMode) {
        // ACTIVATE
        pencilBtn.classList.add("active");
        lockIcon.style.display = "block";
        canvas.classList.add("active");
        controls.classList.add("disabled"); // Dim bottom controls

        // Pause idle
        resetIdleTimer();
        if(viewer) viewer.stopAutoRotate();

        // Init history if fresh
        if (drawingHistory.length === 0) saveHistoryState();

    } else {
        // DEACTIVATE
        pencilBtn.classList.remove("active");
        lockIcon.style.display = "none";
        document.querySelectorAll(".tool-popup").forEach(p => p.style.display = "none");
        
        canvas.classList.remove("active");
        controls.classList.remove("disabled");

        clearCanvas(); // VANISH drawings
        
        isEraser = false;
        document.getElementById("eraserBtn").classList.remove("active");
        
        startIdleCountdown();
    }
}

function clearCanvas() {
    drawCtx.clearRect(0, 0, canvas.width, canvas.height);
    drawingHistory = [];
    historyStep = -1;
}

// HISTORY
function saveHistoryState() {
    historyStep++;
    if (historyStep < drawingHistory.length) drawingHistory.length = historyStep;
    drawingHistory.push(canvas.toDataURL());
    if (drawingHistory.length > MAX_HISTORY + 1) {
        drawingHistory.shift();
        historyStep--;
    }
}

function undoLastStroke() {
    if (historyStep > 0) {
        historyStep--;
        loadHistoryState(drawingHistory[historyStep]);
    }
}

function redoLastStroke() {
    if (historyStep < drawingHistory.length - 1) {
        historyStep++;
        loadHistoryState(drawingHistory[historyStep]);
    }
}

function loadHistoryState(dataUrl) {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
        drawCtx.clearRect(0, 0, canvas.width, canvas.height);
        drawCtx.drawImage(img, 0, 0);
    };
}

// DRAWING
function startDraw(e) {
    if (!isDrawingMode) return;
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawCtx.beginPath();
    drawCtx.moveTo(x, y);
}

function draw(e) {
    if (!isDrawing || !isDrawingMode) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    drawCtx.lineWidth = currentBrushSize;
    drawCtx.lineCap = "round";
    drawCtx.strokeStyle = isEraser ? "rgba(0,0,0,1)" : currentColor;
    drawCtx.globalCompositeOperation = isEraser ? "destination-out" : "source-over";
    
    drawCtx.lineTo(x, y);
    drawCtx.stroke();
}

function stopDraw() {
    if (isDrawing) {
        isDrawing = false;
        drawCtx.closePath();
        saveHistoryState();
    }
}

// --- 3. VIEWER LOGIC ---

function loadViewer(index) {
    if (!images[index]) return;
    const imgData = images[index];
    activeImageSrc = imgData.src;

    const tempImg = new Image();
    tempImg.crossOrigin = "Anonymous"; 
    tempImg.src = imgData.src;
    
    tempImg.onload = function() {
        if (tempImg.src.indexOf(activeImageSrc) === -1) return;
        const aspectRatio = tempImg.naturalWidth / tempImg.naturalHeight;
        detectAndSetupScene(aspectRatio, imgData.src);
        preloadNextImage(index);
    };
}

function preloadNextImage(currentIndex) {
    const nextIndex = (currentIndex + 1) % images.length;
    if (images[nextIndex]) {
        const preloadImg = new Image();
        preloadImg.crossOrigin = "Anonymous";
        preloadImg.src = images[nextIndex].src;
    }
}

function detectAndSetupScene(aspectRatio, imageSrc) {
    if (viewer) viewer.destroy();

    let config = {
        type: "equirectangular",
        panorama: imageSrc,
        autoLoad: true,
        showControls: false,
        crossOrigin: "anonymous", 
        yaw: 0, pitch: 0, autoRotate: 0 
    };

    const isFullSphere = aspectRatio >= 1.9 && aspectRatio <= 2.1;

    if (isFullSphere) {
        updateBadge("360");
        config.haov = 360; config.vaov = 180;
        config.hfov = 100; config.minHfov = 50; config.maxHfov = 120;
    } else {
        updateBadge("pano");
        const assumedVerticalFOV = 60; 
        let calculatedHorizontalFOV = assumedVerticalFOV * aspectRatio;
        if (calculatedHorizontalFOV > 360) calculatedHorizontalFOV = 360;

        config.haov = calculatedHorizontalFOV; config.vaov = assumedVerticalFOV; config.vOffset = 0;           
        if (calculatedHorizontalFOV < 360) {
            const halfWidth = calculatedHorizontalFOV / 2;
            config.minYaw = -halfWidth; config.maxYaw = halfWidth;
        }
        config.minPitch = -assumedVerticalFOV / 2; config.maxPitch = assumedVerticalFOV / 2;
        config.hfov = assumedVerticalFOV; config.minHfov = 30; config.maxHfov = assumedVerticalFOV + 20; 
    }

    viewer = pannellum.viewer('viewer', config);

    const viewerContainer = document.getElementById('viewer');
    viewerContainer.onmousedown = resetIdleTimer;
    viewerContainer.ontouchstart = resetIdleTimer;
    viewerContainer.onmouseup = startIdleCountdown;
    viewerContainer.ontouchend = startIdleCountdown;

    updateThumbs();
    startIdleCountdown();
}

function updateBadge(type) {
    const badge = document.getElementById('badge360');
    if (type === "360") {
        badge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21.5 12a9.5 9.5 0 1 1-9.5-9.5"/><path d="M12 7v5l3 3"/><circle cx="12" cy="12" r="2"/></svg><span>360° View</span>`;
    } else {
        badge.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="2" y="8" width="20" height="8" rx="2"></rect><line x1="2" y1="12" x2="22" y2="12" stroke-dasharray="2 2"></line></svg><span>Panorama View</span>`;
    }
}

function transitionToImage(index) {
    // Force Exit Drawing Mode if active
    if (isDrawingMode) {
        isDrawingMode = false;
        toggleDrawingState(); // This clears the canvas & resets controls
    }

    const overlay = document.getElementById('fadeOverlay');
    overlay.classList.add('active');
    setTimeout(() => {
        currentIndex = index;
        loadViewer(currentIndex);
        setTimeout(() => { overlay.classList.remove('active'); }, 500); 
    }, 500);
}

function buildThumbnails() {
    const panel = document.getElementById("thumbPanel");
