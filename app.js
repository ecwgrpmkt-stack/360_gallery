const images = [
    { src: "images/img1.jpg" }, { src: "images/img2.jpg" },
    { src: "images/img3.jpg" }, { src: "images/img4.jpg" },
    { src: "images/img5.jpg" }, { src: "images/img6.jpg" },
    { src: "images/img7.jpg" }, { src: "images/img8.jpg" },
    { src: "images/img9.jpg" }, { src: "images/img10.jpg" }
];

let currentIndex = 0;
let viewer = null;
let activeImageSrc = null; // Track current image to prevent race conditions

// TIMERS
let idleTimer = null;
let slideTimer = null;
const IDLE_DELAY = 3000;       
const AUTO_PLAY_DELAY = 60000; 

// --- MAIN VIEWER LOGIC ---

function loadViewer(index) {
    const imgData = images[index];
    activeImageSrc = imgData.src;

    // 1. Pre-load Image to detect Aspect Ratio / Projection Type
    const tempImg = new Image();
    tempImg.src = imgData.src;
    
    tempImg.onload = function() {
        // Prevent loading if user switched image while this was loading
        if (tempImg.src.indexOf(activeImageSrc) === -1) return;

        const aspectRatio = tempImg.naturalWidth / tempImg.naturalHeight;
        detectAndSetupScene(aspectRatio, imgData.src);
    };
}

function detectAndSetupScene(aspectRatio, imageSrc) {
    // 1. Destroy existing viewer
    if (viewer) {
        viewer.destroy();
    }

    let config = {
        type: "equirectangular",
        panorama: imageSrc,
        autoLoad: true,
        showControls: false,
        yaw: 0,
        pitch: 0,
        autoRotate: 0 
    };

    // 2. Logic: Detect 360 vs Panorama
    // Standard 360 is 2:1 ratio (2.0). We allow a small margin (1.9 - 2.1).
    const isFull360 = aspectRatio >= 1.9 && aspectRatio <= 2.1;

    if (isFull360) {
        // --- 360 MODE ---
        updateBadge("360");
        config.hfov = 100;
        config.minHfov = 50;
        config.maxHfov = 120;
        // Defaults cover full 360 sphere
    } else {
        // --- PANORAMA / CYLINDRICAL MODE ---
        updateBadge("pano");
        
        // We assume a standard Vertical Angle of View (VAOV) for panoramas (e.g., 60 degrees)
        // Then we calculate how wide the image should be based on that slice.
        // HAOV = VAOV * AspectRatio
        const estimatedVAOV = 60; 
        const estimatedHAOV = Math.min(estimatedVAOV * aspectRatio, 360); // Cap at 360

        config.haov = estimatedHAOV;  // Horizontal Angle of View
        config.vaov = estimatedVAOV;  // Vertical Angle of View
        config.vOffset = 0;           // Center vertically
        
        // Lock the view so they can't look at black sky/floor
        config.minPitch = -estimatedVAOV / 2;
        config.maxPitch = estimatedVAOV / 2;
        config.minYaw = -estimatedHAOV / 2;
        config.maxYaw = estimatedHAOV / 2;
        
        // Adjust zoom levels for the partial view
        config.hfov = estimatedVAOV; // Start zoomed to fit height
        config.minHfov = 30;
        config.maxHfov = estimatedVAOV + 20; 
    }

    // 3. Initialize Viewer
    viewer = pannellum.viewer('viewer', config);

    // 4. Attach Events
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
        // Panorama Icon (Wide Rectangle style)
        badge.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <rect x="2" y="7" width="20" height="10" rx="2" ry="2"></rect>
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

        // Wait for load, then fade in
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
        thumb.src = img.src;
        thumb.className = "thumb";
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
        // Only zoom out if strict 360 mode, or safely adjust for pano
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

// Fullscreen Logic
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

// --- INITIALIZATION ---
buildThumbnails();
loadViewer(currentIndex);
