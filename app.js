// CONFIGURATION: GitHub Repository Details
const REPO_OWNER = "ecwgrpmkt-stack";
const REPO_NAME = "360_gallery";
const BRANCH_NAME = "main"; // Check if your repo uses 'main' or 'master'
const IMAGE_FOLDER_PATH = "images";

// Global Variables
let images = []; 
let currentIndex = 0;
let viewer = null;
let activeImageSrc = null;

// TIMERS
let idleTimer = null;
let slideTimer = null;
const IDLE_DELAY = 3000;       // 3 seconds: Show Hand & Zoom Out
const AUTO_PLAY_DELAY = 60000; // 60 seconds: Auto-Advance Slide

// --- 1. INITIALIZATION: Fetch Images from GitHub ---

async function initGallery() {
    try {
        console.log("Fetching image list from GitHub...");
        const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${IMAGE_FOLDER_PATH}`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`GitHub API Error: ${response.statusText}`);
        
        const data = await response.json();

        // Filter and Format the data
        images = data
            .filter(file => file.name.match(/\.(jpg|jpeg|png)$/i)) // Only image files
            .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'})) // Natural Sort
            .map(file => {
                // 1. Construct the fast CDN URL (bypass raw.githubusercontent for speed)
                const rawCdnSrc = `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${BRANCH_NAME}/${file.path}`;
                
                // 2. APPLY RESOLUTION LIMIT (Device Crash Prevention)
                // Using wsrv.nl to resize on the fly:
                // &w=8000 -> Resize width to max 8000px (Height scales automatically)
                // &we     -> Without Enlargement (Don't stretch small images)
                // &q=85   -> High Quality
                const optimizedSrc = `https://wsrv.nl/?url=${encodeURIComponent(rawCdnSrc)}&w=8000&we&q=85&output=webp`;

                return { 
                    src: optimizedSrc,
                    originalPath: rawCdnSrc // Keep original link for thumbnails
                };
            });

        if (images.length === 0) {
            alert("No images found in the GitHub repository folder.");
            return;
        }

        console.log(`Loaded ${images.length} images.`);
        
        // Start the App
        buildThumbnails();
        loadViewer(currentIndex);

    } catch (error) {
        console.error("Failed to load images:", error);
        alert("Could not load images. Check console for details.");
    }
}

// --- MAIN VIEWER LOGIC ---

function loadViewer(index) {
    if (images.length === 0) return;

    const imgData = images[index];
    activeImageSrc = imgData.src;

    // Pre-load Image to analyze dimensions
    const tempImg = new Image();
    tempImg.crossOrigin = "Anonymous"; 
    tempImg.src = imgData.src;
    
    tempImg.onload = function() {
        // Prevent race condition if user switched image quickly
        if (tempImg.src.indexOf(activeImageSrc) === -1) return;

        const aspectRatio = tempImg.naturalWidth / tempImg.naturalHeight;
        detectAndSetupScene(aspectRatio, imgData.src);
        
        // Optimization: Pre-load the NEXT image in background
        preloadNextImage(index);
    };
    
    tempImg.onerror = function() {
        console.error("Error loading image:", imgData.src);
    };
}

function preloadNextImage(currentIndex) {
    const nextIndex = (currentIndex + 1) % images.length;
    const preloadImg = new Image();
    preloadImg.crossOrigin = "Anonymous";
    preloadImg.src = images[nextIndex].src;
}

function detectAndSetupScene(aspectRatio, imageSrc) {
    if (viewer) {
        viewer.destroy();
    }

    let config = {
        type: "equirectangular",
        panorama: imageSrc,
        autoLoad: true,
        showControls: false,
        crossOrigin: "anonymous", 
        yaw: 0,
        pitch: 0,
        autoRotate: 0 
    };

    // --- LOGIC: Detect Projection Type ---
    
    // Standard 360 Sphere is 2:1 ratio (approx 2.0)
    const isFullSphere = aspectRatio >= 1.9 && aspectRatio <= 2.1;

    if (isFullSphere) {
        // --- TYPE A: FULL 360 SPHERE ---
        updateBadge("360");
        config.haov = 360; // Full Horizontal
        config.vaov = 180; // Full Vertical
        config.hfov = 100; // Default Zoom
        config.minHfov = 50;
        config.maxHfov = 120;
    } else {
        // --- TYPE B: CYLINDRICAL / PARTIAL PANORAMA ---
        updateBadge("pano");

        // Assume standard vertical FOV for phone cameras (approx 60 degrees)
        const assumedVerticalFOV = 60; 
        
        // Calculate exact Horizontal degrees based on aspect ratio
        let calculatedHorizontalFOV = assumedVerticalFOV * aspectRatio;

        // Cap at 360
        if (calculatedHorizontalFOV > 360) calculatedHorizontalFOV = 360;

        config.haov = calculatedHorizontalFOV;  
        config.vaov = assumedVerticalFOV;       
        config.vOffset = 0;           
        
        // SEAM PREVENTION: 
        // If image is less than 360 deg, restrict Yaw so it stops at edges.
        if (calculatedHorizontalFOV < 360) {
            const halfWidth = calculatedHorizontalFOV / 2;
            config.minYaw = -halfWidth;
            config.maxYaw = halfWidth;
        }

        // Lock Vertical limits (prevent looking at black bars)
        config.minPitch = -assumedVerticalFOV / 2;
        config.maxPitch = assumedVerticalFOV / 2;
        
        // Adjust Zoom for Pano
        config.hfov = assumedVerticalFOV; 
        config.minHfov = 30;
        config.maxHfov = assumedVerticalFOV + 20; 
    }

    // Initialize Viewer
    viewer = pannellum.viewer('viewer', config);

    // Attach Idle Detection Events
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
        badge.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <path d="M21.5 12a9.5 9.5 0 1 1-9.5-9.5"/>
                <path d="M12 7v5l3 3"/>
                <circle cx="12" cy="12" r="2"/>
            </svg>
            <span>360° View</span>
        `;
    } else {
        // Panorama Icon
        badge.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <rect x="2" y="8" width="20" height="8" rx="2"></rect>
                <line x1="2" y1="12" x2="22" y2="12" stroke-dasharray="2 2"></line>
            </svg>
            <span>Panorama View</span>
        `;
    }
}

// --- TRANSITION EFFECT ---
function transitionToImage(index) {
    const overlay = document.getElementById('fadeOverlay');
    
    // 1. Fade Out
    overlay.classList.add('active');

    // 2. Wait, then Load
    setTimeout(() => {
        currentIndex = index;
        loadViewer(currentIndex);

        // 3. Fade In
        setTimeout(() => {
            overlay.classList.remove('active');
        }, 500); 
    }, 500);
}

// --- THUMBNAIL LOGIC ---
function buildThumbnails() {
    const panel = document.getElementById("thumbPanel");
    panel.innerHTML = "";

    images.forEach((img, i) => {
        const thumb = document.createElement("img");
        
        // THUMBNAIL OPTIMIZATION (Tiny size for sidebar speed)
        // Using original path (CDN) but asking wsrv.nl to make it 200px wide
        const thumbUrl = `https://wsrv.nl/?url=${encodeURIComponent(img.originalPath)}&w=200&q=70&output=webp`;

        thumb.src = thumbUrl;
        thumb.className = "thumb";
        thumb.crossOrigin = "Anonymous"; 
        
        thumb.onclick = () => {
            resetIdleTimer();
            transitionToImage(i);
        };
        panel.appendChild(thumb);
    });
}

function updateThumbs() {
    document.querySelectorAll(".thumb").forEach((t, i) => {
        t.classList.toggle("active", i === currentIndex);
        if(i === currentIndex) {
            t.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    });
}

// --- IDLE & AUTO-PLAY SYSTEM ---

function startIdleCountdown() {
    clearTimeout(idleTimer);
    clearTimeout(slideTimer);

    // Timer 1: Show Hand & Zoom Out
    idleTimer = setTimeout(onIdleStart, IDLE_DELAY);

    // Timer 2: Auto-Advance Slide
    slideTimer = setTimeout(onAutoPlayNext, AUTO_PLAY_DELAY);
}

function resetIdleTimer() {
    // User interacted
    clearTimeout(idleTimer);
    clearTimeout(slideTimer);
    document.getElementById('idleIndicator').classList.remove('visible');
    if (viewer) viewer.stopAutoRotate();
}

function onIdleStart() {
    document.getElementById('idleIndicator').classList.add('visible');
    if (viewer) {
        // Safely get max zoom out level
        const maxFov = viewer.getHfovBounds ? viewer.getHfovBounds()[1] : 120;
        viewer.setHfov(maxFov, 1000); 
        viewer.setPitch(0, 1000);
        
        // Start rotation (negative is left)
        viewer.startAutoRotate(-5); 
    }
}

function onAutoPlayNext() {
    let nextIndex = (currentIndex + 1) % images.length;
    transitionToImage(nextIndex);
}

// --- CONTROLS ---

document.getElementById("prevBtn").onclick = () => {
    resetIdleTimer();
    let newIndex = (currentIndex - 1 + images.length) % images.length;
    transitionToImage(newIndex);
};

document.getElementById("nextBtn").onclick = () => {
    resetIdleTimer();
    let newIndex = (currentIndex + 1) % images.length;
    transitionToImage(newIndex);
};

// Custom Fullscreen (Keeps sidebar visible)
const fsBtn = document.getElementById("fsBtn");
const appContainer = document.getElementById("app");

fsBtn.onclick = () => {
    resetIdleTimer();
    if (!document.fullscreenElement) {
        appContainer.requestFullscreen().catch(err => {
            console.log(`Error enabling fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
};

// --- START ---
// Initialize the gallery
initGallery();
