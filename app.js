// CONFIGURATION: GitHub Repository Details
const REPO_OWNER = "ecwgrpmkt-stack";
const REPO_NAME = "360_gallery";
const BRANCH_NAME = "main"; // Assuming 'main' branch. Change to 'master' if needed.
const IMAGE_FOLDER_PATH = "images";

// We will populate this array dynamically
let images = []; 

let currentIndex = 0;
let viewer = null;
let activeImageSrc = null;

// TIMERS
let idleTimer = null;
let slideTimer = null;
const IDLE_DELAY = 3000;       
const AUTO_PLAY_DELAY = 60000; 

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
            .filter(file => file.name.match(/\.(jpg|jpeg|png)$/i))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}))
            .map(file => {
                // OPTIMIZATION 1: Use jsDelivr CDN for faster delivery than raw.github
                // Format: https://cdn.jsdelivr.net/gh/USER/REPO@BRANCH/PATH
                const cdnSrc = `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${BRANCH_NAME}/${file.path}`;
                
                return { 
                    src: cdnSrc,
                    originalPath: file.download_url // Fallback if needed
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
        alert("Could not load images. Check console.");
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
        if (tempImg.src.indexOf(activeImageSrc) === -1) return;

        const aspectRatio = tempImg.naturalWidth / tempImg.naturalHeight;
        detectAndSetupScene(aspectRatio, imgData.src);
        
        // OPTIMIZATION 3: Pre-load the NEXT image in the background
        preloadNextImage(index);
    };
    
    tempImg.onerror = function() {
        console.error("Error loading image:", imgData.src);
    };
}

// Helper to pre-load the next image for instant transition
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
    const isFullSphere = aspectRatio >= 1.9 && aspectRatio <= 2.1;

    if (isFullSphere) {
        // TYPE A: FULL 360 SPHERE
        updateBadge("360");
        config.haov = 360;
        config.vaov = 180;
        config.hfov = 100;
        config.minHfov = 50;
        config.maxHfov = 120;
    } else {
        // TYPE B: CYLINDRICAL / PARTIAL PANORAMA
        updateBadge("pano");

        const assumedVerticalFOV = 60; 
        let calculatedHorizontalFOV = assumedVerticalFOV * aspectRatio;

        if (calculatedHorizontalFOV > 360) calculatedHorizontalFOV = 360;

        config.haov = calculatedHorizontalFOV;  
        config.vaov = assumedVerticalFOV;       
        config.vOffset = 0;           
        
        if (calculatedHorizontalFOV < 360) {
            const halfWidth = calculatedHorizontalFOV / 2;
            config.minYaw = -halfWidth;
            config.maxYaw = halfWidth;
        }

        config.minPitch = -assumedVerticalFOV / 2;
        config.maxPitch = assumedVerticalFOV / 2;
        config.hfov = assumedVerticalFOV; 
        config.minHfov = 30;
        config.maxHfov = assumedVerticalFOV + 20; 
    }

    viewer = pannellum.viewer('viewer', config);

    // Attach Idle Events
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
    overlay.classList.add('active');

    setTimeout(() => {
        currentIndex = index;
        loadViewer(currentIndex);
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
        
        // OPTIMIZATION 2: Use wsrv.nl to resize images on the fly!
        // This requests a small 200px version of the CDN image.
        // Format: https://wsrv.nl/?url=[IMAGE_URL]&w=200&q=70
        const thumbUrl = `https://wsrv.nl/?url=${encodeURIComponent(img.src)}&w=200&q=70&output=webp`;

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
    idleTimer = setTimeout(onIdleStart, IDLE_DELAY);
    slideTimer = setTimeout(onAutoPlayNext, AUTO_PLAY_DELAY);
}

function resetIdleTimer() {
    clearTimeout(idleTimer);
    clearTimeout(slideTimer);
    document.getElementById('idleIndicator').classList.remove('visible');
    if (viewer) viewer.stopAutoRotate();
}

function onIdleStart() {
    document.getElementById('idleIndicator').classList.add('visible');
    if (viewer) {
        const maxFov = viewer.getHfovBounds ? viewer.getHfovBounds()[1] : 120;
        viewer.setHfov(maxFov, 1000); 
        viewer.setPitch(0, 1000);
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

const fsBtn = document.getElementById("fsBtn");
const appContainer = document.getElementById("app");
fsBtn.onclick = () => {
    resetIdleTimer();
    if (!document.fullscreenElement) {
        appContainer.requestFullscreen().catch(err => console.log(err));
    } else {
        document.exitFullscreen();
    }
};

// --- START ---
initGallery();
