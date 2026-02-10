// CONFIGURATION
const REPO_OWNER = "ecwgrpmkt-stack";
const REPO_NAME = "360_gallery";
const IMAGE_FOLDER_PATH = "images";

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

// --- 1. INITIALIZATION ---

async function initGallery() {
    initDrawingTools();

    try {
        console.log("Fetching image list from GitHub...");
        const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${IMAGE_FOLDER_PATH}`;
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            // Rate limit exceeded or API error? Trigger fallback!
            throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();

        // Process GitHub Data
        images = data
            .filter(file => file.name.match(/\.(jpg|jpeg|png)$/i))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}))
            .map(file => {
                // FIX: Removed "@${BRANCH_NAME}"
                // This URL format automatically finds the DEFAULT branch (master or main)
                const rawCdnSrc = `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}/${file.path}`;
                
                // Smart Resize & Optimization Proxy
                const optimizedSrc = `https://wsrv.nl/?url=${encodeURIComponent(rawCdnSrc)}&w=8000&we&q=85&output=webp`;

                return { 
                    src: optimizedSrc,
                    originalPath: rawCdnSrc 
                };
            });

        if (images.length === 0) throw new Error("Folder found but no images inside.");

        console.log(`Successfully loaded ${images.length} images from GitHub API.`);
        finishInit();

    } catch (error) {
        console.warn("API load failed, switching to FALLBACK mode:", error);
        loadFallbackImages();
    }
}

// Fallback: If API fails, try to load images img1.jpg through img20.jpg manually
function loadFallbackImages() {
    const fallbackList = [];
    // Try to guess filenames img1.jpg to img20.jpg
    for (let i = 1; i <= 20; i++) {
        // Construct path assuming default branch
        const path = `${IMAGE_FOLDER_PATH}/img${i}.jpg`; 
        const rawCdnSrc = `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}/${path}`;
        const optimizedSrc = `https://wsrv.nl/?url=${encodeURIComponent(rawCdnSrc)}&w=8000&we&q=85&output=webp`;
        
        fallbackList.push({
            src: optimizedSrc,
            originalPath: rawCdnSrc
        });
    }
    
    images = fallbackList;
    console.log("Loaded Fallback Image List (img1-img20)");
    finishInit();
}

function finishInit() {
    if (images.length === 0) {
        alert("Could not load any images. Please check your repository structure.");
        return;
    }
    buildThumbnails();
    loadViewer(currentIndex);
}

// --- 2. DRAWING LOGIC ---

function initDrawingTools() {
    canvas = document.getElementById("drawingCanvas");
    drawCtx = canvas.getContext("2d");

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const pencilBtn = document.getElementById("pencilBtn");
    const brushSizeBtn = document.getElementById("brushSizeBtn");
    const colorPaletteBtn = document.getElementById("colorPaletteBtn");
    const eraserBtn = document.getElementById("eraserBtn");
    const clearBtn = document.getElementById("clearBtn");
    const sizeSlider = document.getElementById("sizeSlider");

    // Toggle Drawing Mode
    pencilBtn.onclick = () => {
        isDrawingMode = !isDrawingMode;
        toggleDrawingState();
    };

    // Brush Size
    brushSizeBtn.onclick = () => {
        togglePopup("brushPopup");
    };
    sizeSlider.oninput = (e) => {
        currentBrushSize = e.target.value;
    };

    // Color Palette
    colorPaletteBtn.onclick = () => {
        togglePopup("colorPopup");
        if (isEraser) {
            isEraser = false;
            eraserBtn.classList.remove("active");
        }
    };
    document.querySelectorAll(".color-swatch").forEach(swatch => {
        swatch.onclick = () => {
            currentColor = swatch.getAttribute("data-color");
            document.getElementById("colorPopup").style.display = "none";
        };
    });

    // Eraser
    eraserBtn.onclick = () => {
        if (!isDrawingMode) return;
        isEraser = !isEraser;
        eraserBtn.classList.toggle("active", isEraser);
    };

    // Clear
    clearBtn.onclick = () => {
        drawCtx.clearRect(0, 0, canvas.width, canvas.height);
        if (isDrawingMode) {
            isDrawingMode = false;
            toggleDrawingState();
        }
    };

    // Events
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseout', stopDraw);
    
    canvas.addEventListener('touchstart', (e) => {
        if(e.cancelable) e.preventDefault(); 
        startDraw(e.touches[0]);
    }, {passive: false});
    canvas.addEventListener('touchmove', (e) => {
        if(e.cancelable) e.preventDefault();
        draw(e.touches[0]);
    }, {passive: false});
    canvas.addEventListener('touchend', stopDraw);
}

function resizeCanvas() {
    if (canvas && canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
    }
}

function togglePopup(id) {
    const popups = document.querySelectorAll(".tool-popup");
    popups.forEach(p => {
        if (p.id === id) {
            p.style.display = p.style.display === "flex" ? "none" : "flex";
        } else {
            p.style.display = "none";
        }
    });
}

function toggleDrawingState() {
    const pencilBtn = document.getElementById("pencilBtn");
    const lockIcon = document.getElementById("lockIndicatorTool");
    const eraserBtn = document.getElementById("eraserBtn");

    if (isDrawingMode) {
        pencilBtn.classList.add("active");
        lockIcon.style.display = "block";
        canvas.style.pointerEvents = "auto";
        
        resetIdleTimer();
        clearTimeout(idleTimer);
        clearTimeout(slideTimer);
        if(viewer) viewer.stopAutoRotate();
    } else {
        pencilBtn.classList.remove("active");
        eraserBtn.classList.remove("active");
        lockIcon.style.display = "none";
        document.querySelectorAll(".tool-popup").forEach(p => p.style.display = "none");
        canvas.style.pointerEvents = "none";
        isEraser = false;
        startIdleCountdown();
    }
}

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

    if (isEraser) {
        drawCtx.globalCompositeOperation = "destination-out";
        drawCtx.strokeStyle = "rgba(0,0,0,1)";
    } else {
        drawCtx.globalCompositeOperation = "source-over";
        drawCtx.strokeStyle = currentColor;
    }

    drawCtx.lineTo(x, y);
    drawCtx.stroke();
}

function stopDraw() {
    isDrawing = false;
    drawCtx.closePath();
}

// --- 3. VIEWER LOGIC ---

function loadViewer(index) {
    if (images.length === 0) return;

    const imgData = images[index];
    activeImageSrc = imgData.src;

    // Use wsrv.nl to pre-fetch the main image data effectively
    const tempImg = new Image();
    tempImg.crossOrigin = "Anonymous"; 
    tempImg.src = imgData.src;
    
    tempImg.onload = function() {
        if (tempImg.src.indexOf(activeImageSrc) === -1) return;
        const aspectRatio = tempImg.naturalWidth / tempImg.naturalHeight;
        detectAndSetupScene(aspectRatio, imgData.src);
        preloadNextImage(index);
    };

    // If main image fails (e.g. 404), alert
    tempImg.onerror = function() {
        console.error("Failed to load image source:", imgData.
