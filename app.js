// CONFIGURATION
const REPO_OWNER = "ecwgrpmkt-stack";
const REPO_NAME = "360_gallery";
const IMAGE_FOLDER = "images";

let images = []; 
let currentIndex = 0;
let viewer = null;
let activeImageSrc = null;
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
let drawingHistory = [];
let historyStep = -1;
const MAX_HISTORY = 5;

// --- 1. ROBUST IMAGE LOADING ---
async function initGallery() {
    initDrawingTools();
    console.log("Loading Gallery...");
    try {
        const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${IMAGE_FOLDER}`;
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error("API Limit or Error");

        const data = await response.json();
        images = data
            // FILTER: Valid Image AND does NOT start with 'disabled_'
            .filter(file => file.name.match(/\.(jpg|jpeg|png)$/i) && !file.name.startsWith("disabled_"))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}))
            .map(file => ({
                src: `https://wsrv.nl/?url=${encodeURIComponent(file.download_url)}&w=8000&we&q=85&output=webp`,
                originalPath: file.download_url
            }));
        finishInit();
    } catch (error) {
        console.warn("API Failed, attempting Brute Force Loading...", error);
        await bruteForceLoadImages();
    }
}

async function bruteForceLoadImages() {
    const detectedImages = [];
    const maxRetries = 15;
    for (let i = 1; i <= maxRetries; i++) {
        // Assume 'main' branch
        const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${IMAGE_FOLDER}/img${i}.jpg`;
        detectedImages.push({
            src: `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=8000&we&q=85&output=webp`,
            originalPath: rawUrl
        });
    }
    images = detectedImages;
    finishInit();
}

function finishInit() {
    if (images.length === 0) {
        alert("Critical: No images found.");
        return;
    }
    buildThumbnails();
    loadViewer(currentIndex);
}

// --- 2. DRAWING & UI LOGIC ---
function initDrawingTools() {
    canvas = document.getElementById("drawingCanvas");
    drawCtx = canvas.getContext("2d");
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    document.getElementById("pencilBtn").onclick = () => { isDrawingMode = !isDrawingMode; toggleDrawingState(); };
    document.getElementById("brushSizeBtn").onclick = () => togglePopup("brushPopup");
    document.getElementById("sizeSlider").oninput = (e) => { currentBrushSize = e.target.value; };
    document.getElementById("colorPaletteBtn").onclick = () => {
        togglePopup("colorPopup");
        if (isEraser) toggleEraser(false);
    };
    document.querySelectorAll(".color-swatch").forEach(swatch => {
        swatch.onclick = () => {
            currentColor = swatch.getAttribute("data-color");
            document.getElementById("colorPopup").style.display = "none";
            if (!isDrawingMode) { isDrawingMode = true; toggleDrawingState(); }
        };
    });
    document.getElementById("eraserBtn").onclick = () => {
        if (!isDrawingMode) return;
        toggleEraser(!isEraser);
    };
    document.getElementById("clearBtn").onclick = () => {
        clearCanvas();
        if (isDrawingMode) { isDrawingMode = false; toggleDrawingState(); }
    };
    document.getElementById("undoBtn").onclick = undoLastStroke;
    document.getElementById("redoBtn").onclick = redoLastStroke;

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseout', stopDraw);
    canvas.addEventListener('touchstart', (e) => { if(e.cancelable) e.preventDefault(); startDraw(e.touches[0]); }, {passive: false});
    canvas.addEventListener('touchmove', (e) => { if(e.cancelable) e.preventDefault(); draw(e.touches[0]); }, {passive: false});
    canvas.addEventListener('touchend', stopDraw);
}

function resizeCanvas() {
    if (canvas && canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth - 170; // Correct Canvas Width
        canvas.height = canvas.parentElement.clientHeight;
    }
}

function toggleEraser(active) {
    isEraser = active;
    document.getElementById("eraserBtn").classList.toggle("active", active);
}

function togglePopup(id) {
    const popups = document.querySelectorAll(".tool-popup");
    popups.forEach(p => p.style.display = (p.id === id && p.style.display !== "flex") ? "flex" : "none");
}

function toggleDrawingState() {
    const pencilBtn = document.getElementById("pencilBtn");
    const lockIcon = document.getElementById("lockIndicatorTool");
    const historyTools = document.getElementById("historyTools");
    const controls = document.getElementById("controls");

    if (isDrawingMode) {
        pencilBtn.classList.add("active");
        lockIcon.style.display = "block";
        historyTools.style.display = "flex";
        canvas.classList.add("active");
        controls.classList.add("disabled");
        resetIdleTimer();
        if(viewer) viewer.stopAutoRotate();
        if (drawingHistory.length === 0) saveHistoryState();
    } else {
        pencilBtn.classList.remove("active");
        lockIcon.style.display = "none";
        historyTools.style.display = "none";
        document.querySelectorAll(".tool-popup").forEach(p => p.style.display = "none");
        canvas.classList.remove("active");
        controls.classList.remove("disabled");
        clearCanvas(); 
        toggleEraser(false);
        startIdleCountdown();
    }
}

function clearCanvas() {
    drawCtx.clearRect(0, 0, canvas.width, canvas.height);
    drawingHistory = [];
    historyStep = -1;
}

// HISTORY & DRAWING
function saveHistoryState() {
    historyStep++;
    if (historyStep < drawingHistory.length) drawingHistory.length = historyStep;
    drawingHistory.push(canvas.toDataURL());
    if (drawingHistory.length > MAX_HISTORY + 1) { drawingHistory.shift(); historyStep--; }
}
function undoLastStroke() { if (historyStep > 0) { historyStep--; loadHistoryState(drawingHistory[historyStep]); } }
function redoLastStroke() { if (historyStep < drawingHistory.length - 1) { historyStep++; loadHistoryState(drawingHistory[historyStep]); } }
function loadHistoryState(dataUrl) {
    const img = new Image(); img.src = dataUrl;
    img.onload = () => { drawCtx.clearRect(0, 0, canvas.width, canvas.height); drawCtx.drawImage(img, 0, 0); };
}
function startDraw(e) {
    if (!isDrawingMode) return;
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawCtx.beginPath(); drawCtx.moveTo(x, y);
}
function draw(e) {
    if (!isDrawing || !isDrawingMode) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawCtx.lineWidth = currentBrushSize; drawCtx.lineCap = "round";
    drawCtx.strokeStyle = isEraser ? "rgba(0,0,0,1)" : currentColor;
    drawCtx.globalCompositeOperation = isEraser ? "destination-out" : "source-over";
    drawCtx.lineTo(x, y); drawCtx.stroke();
}
function stopDraw() { if (isDrawing) { isDrawing = false; drawCtx.closePath(); saveHistoryState(); } }

// --- 3. VIEWER LOGIC ---
function loadViewer(index) {
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
        const preloadImg = new Image(); preloadImg.crossOrigin = "Anonymous"; preloadImg.src = images[nextIndex].src;
    }
}
function detectAndSetupScene(aspectRatio, imageSrc) {
    if (viewer) viewer.destroy();
    let config = {
        type: "equirectangular", panorama: imageSrc, autoLoad: true, showControls: false, crossOrigin: "anonymous", yaw: 0, pitch: 0, autoRotate: 0 
    };
    const isFullSphere = aspectRatio >= 1.9 && aspectRatio <= 2.1;
    if (isFullSphere) {
        updateBadge("360"); config.haov = 360; config.vaov = 180; config.hfov = 100; config.minHfov = 50; config.maxHfov = 120;
    } else {
        updateBadge("pano");
        const assumedVerticalFOV = 60; let calculatedHorizontalFOV = assumedVerticalFOV * aspectRatio;
        if (calculatedHorizontalFOV > 360) calculatedHorizontalFOV = 360;
        config.haov = calculatedHorizontalFOV; config.vaov = assumedVerticalFOV; config.vOffset = 0;           
        if (calculatedHorizontalFOV < 360) {
            const halfWidth = calculatedHorizontalFOV / 2; config.minYaw = -halfWidth; config.maxYaw = halfWidth;
        }
        config.minPitch = -assumedVerticalFOV / 2; config.maxPitch = assumedVerticalFOV / 2;
        config.hfov = assumedVerticalFOV; config.minHfov = 30; config.maxHfov = assumedVerticalFOV + 20; 
    }
    viewer = pannellum.viewer('viewer', config);
    const viewerContainer = document.getElementById('viewer');
    viewerContainer.onmousedown = resetIdleTimer; viewerContainer.ontouchstart = resetIdleTimer;
    viewerContainer.onmouseup = startIdleCountdown; viewerContainer.ontouchend = startIdleCountdown;
    updateThumbs(); startIdleCountdown();
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
    if (isDrawingMode) { isDrawingMode = false; toggleDrawingState(); }
    const loader = document.getElementById('ecwLoader');
    loader.classList.add('active');
    setTimeout(() => {
        currentIndex = index; loadViewer(currentIndex);
        setTimeout(() => { loader.classList.remove('active'); }, 500); 
    }, 2000);
}
function buildThumbnails() {
    const panel = document.getElementById("thumbPanel"); panel.innerHTML = "";
    images.forEach((img, i) => {
        const thumb = document.createElement("img");
        thumb.src = `https://wsrv.nl/?url=${encodeURIComponent(img.originalPath)}&w=200&q=70&output=webp`;
        thumb.className = "thumb"; thumb.crossOrigin = "Anonymous"; 
        thumb.onclick = () => { resetIdleTimer(); transitionToImage(i); };
        panel.appendChild(thumb);
    });
}
function updateThumbs() {
    document.querySelectorAll(".thumb").forEach((t, i) => {
        t.classList.toggle("active", i === currentIndex);
        if(i === currentIndex) t.scrollIntoView({ behavior: "smooth", block: "center" });
    });
}
function startIdleCountdown() {
    clearTimeout(idleTimer); clearTimeout(slideTimer); if (isDrawingMode) return;
    idleTimer = setTimeout(onIdleStart, IDLE_DELAY); slideTimer = setTimeout(onAutoPlayNext, AUTO_PLAY_DELAY);
}
function resetIdleTimer() {
    clearTimeout(idleTimer); clearTimeout(slideTimer);
    document.getElementById('idleIndicator').classList.remove('visible'); if (viewer) viewer.stopAutoRotate();
}
function onIdleStart() {
    if (isDrawingMode) return; document.getElementById('idleIndicator').classList.add('visible');
    if (viewer) { const maxFov = viewer.getHfovBounds ? viewer.getHfovBounds()[1] : 120; viewer.setHfov(maxFov, 1000); viewer.setPitch(0, 1000); viewer.startAutoRotate(-5); }
}
function onAutoPlayNext() {
    if (isDrawingMode) return; let nextIndex = (currentIndex + 1) % images.length; transitionToImage(nextIndex);
}
document.getElementById("prevBtn").onclick = () => { resetIdleTimer(); let newIndex = (currentIndex - 1 + images.length) % images.length; transitionToImage(newIndex); };
document.getElementById("nextBtn").onclick = () => { resetIdleTimer(); let newIndex = (currentIndex + 1) % images.length; transitionToImage(newIndex); };
const fsBtn = document.getElementById("fsBtn");
fsBtn.onclick = () => { resetIdleTimer(); if (!document.fullscreenElement) { document.getElementById("app").requestFullscreen().catch(console.log); } else { document.exitFullscreen(); } };

initGallery();
