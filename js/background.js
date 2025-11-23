// --- CONFIGURATION ---
const config = {
    // Global
    cameraZ: 30,
    
    // Background (Attractor) Controls
    enableAttractor: true,
    bgParticleCount: 1500,
    bgParticleSize: 0.12,
    bgColor: 0x88ccff, // Soft blue-white
    
    // Image Particle Controls
    imgParticleCount: 2000, // Particles per image
    imgParticleSize: 0.18,  // Slightly larger for visibility
    imgOscillationSpeed: 0.5,
    imgOscillationAmp: 0.2,
    imgJitter: 0.02,
    
    // Post-Processing
    bloomStrength: 1.0,
    bloomThreshold: 0.1,
    trailLength: 0.85,
};

// --- SCENE SETUP ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById('canvas-container').appendChild(renderer.domElement);
camera.position.z = config.cameraZ;

// --- GENERATE TEXTURE (Round Dot) ---
function getSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}
const particleTexture = getSprite();

// --- BACKGROUND ATTRACTOR SYSTEM ---
let bgParticlesMesh;
if (config.enableAttractor) {
    const pos = new Float32Array(config.bgParticleCount * 3);
    for (let i = 0; i < config.bgParticleCount * 3; i++) {
        pos[i] = (Math.random() - 0.5) * 15;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    
    const material = new THREE.PointsMaterial({
        color: config.bgColor,
        size: config.bgParticleSize,
        map: particleTexture,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    bgParticlesMesh = new THREE.Points(geometry, material);
    scene.add(bgParticlesMesh);
}

// --- IMAGE PARTICLE SYSTEM ---
// We hold objects: { mesh: THREE.Points, el: HTMLElement, loaded: bool }
const imageSystems = [];

function initImageParticles() {
    const placeholders = document.querySelectorAll('.paper-thumb-mount');
    
    // Intersection Observer for Lazy Loading
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                loadImageForElement(entry.target);
                observer.unobserve(entry.target); // Only load once
            }
        });
    }, { rootMargin: "100px" }); // Start loading 200px before it enters screen

    placeholders.forEach(el => observer.observe(el));
}

function loadImageForElement(el) {
    const src = el.getAttribute('data-src');
    if (!src) return;

    new THREE.TextureLoader().load(src, (texture) => {
        // 1. Analyze pixels to create particles
        const w = 100; // Resample resolution width
        const h = 100; // Resample resolution height
        // Create a temporary canvas to read pixel data
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(texture.image, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;

        // 2. Select random pixels that aren't black/transparent
        const positions = [];
        const colors = [];
        const basePos = []; // To remember original spot for vibration

        for (let i = 0; i < config.imgParticleCount; i++) {
            // Pick a random pixel
            const x = Math.floor(Math.random() * w);
            const y = Math.floor(Math.random() * h);
            const index = (y * w + x) * 4;

            const r = data[index] / 255;
            const g = data[index + 1] / 255;
            const b = data[index + 2] / 255;
            const a = data[index + 3];

            if (a > 50 && (r+g+b) > 0.1) {
                // Normalize to 0..1 range
                const nx = (x / w) - 0.5;
                const ny = 0.5 - (y / h); // Flip Y for 3D

                positions.push(nx, ny, 0);
                basePos.push(nx, ny, 0);
                colors.push(r, g, b);
            }
        }

        if (positions.length === 0) return;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        // Custom attribute for animation base
        geometry.setAttribute('basePos', new THREE.Float32BufferAttribute(basePos, 3));

        const material = new THREE.PointsMaterial({
            size: config.imgParticleSize,
            map: particleTexture,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const mesh = new THREE.Points(geometry, material);
        scene.add(mesh);

        imageSystems.push({ mesh, el, timeOffset: Math.random() * 100 });
    });
}

// Listen for the custom event from loader.js
document.addEventListener('papersLoaded', initImageParticles);

// --- POST PROCESSING ---
const composer = new THREE.EffectComposer(renderer);
const renderPass = new THREE.RenderPass(scene, camera);
composer.addPass(renderPass);

const afterimagePass = new THREE.AfterimagePass();
afterimagePass.uniforms["damp"].value = config.trailLength;
composer.addPass(afterimagePass);

const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    config.bloomStrength, 0.4, config.bloomThreshold
);
composer.addPass(bloomPass);

// --- ANIMATION ---
const clock = new THREE.Clock();

// Helper: Map Screen Pixels to 3D World Coordinates
function updateImagePositions() {
    // Calculate how many world units fit in the view at z=0 (approx paper depth)
    // Formula: height = 2 * dist * tan(fov/2)
    // We assume image particles are at Z=0. Camera is at Z=20.
    const dist = config.cameraZ;
    const vFOV = THREE.Math.degToRad(camera.fov);
    const visibleHeight = 2 * Math.tan(vFOV / 2) * dist;
    const visibleWidth = visibleHeight * camera.aspect;

    imageSystems.forEach(sys => {
        const rect = sys.el.getBoundingClientRect();
        
        // If off screen, maybe skip updating geometry for perf?
        // For now, we update to ensure trails look right entering screen.

        // Normalize Screen Coordinates to [-0.5, 0.5]
        const centerX = (rect.left + rect.width / 2) / window.innerWidth - 0.5;
        const centerY = -( (rect.top + rect.height / 2) / window.innerHeight - 0.5 ); // Invert Y

        // Map to World Units
        sys.mesh.position.x = centerX * visibleWidth;
        sys.mesh.position.y = centerY * visibleHeight;
        
        // Scale the mesh to match the div size
        // rect.width / window.innerWidth gives fraction of screen.
        const scaleX = (rect.width / window.innerWidth) * visibleWidth;
        const scaleY = (rect.height / window.innerHeight) * visibleHeight;
        
        // Our particles are defined in -0.5 to 0.5 range, so scale fits exactly
        sys.mesh.scale.set(scaleX, scaleY, 1);
    });
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    // 1. Evolve Background Attractor (Sprott R)
    if (bgParticlesMesh) {
        const positions = bgParticlesMesh.geometry.attributes.position.array;
        const dt = delta * 0.5; // slow speed

        for (let i = 0; i < config.bgParticleCount; i++) {
            let x = positions[i * 3];
            let y = positions[i * 3 + 1];
            let z = positions[i * 3 + 2];

            // Attractor Math
            const dx = 0.9 - y;
            const dy = 0.4 + z;
            const dz = x * y - z;

            x += dx * dt;
            y += dy * dt;
            z += dz * dt;

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
        }
        bgParticlesMesh.geometry.attributes.position.needsUpdate = true;
        bgParticlesMesh.rotation.y += 0.001;
    }

    // 2. Animate Image Particles (Vibration/Oscillation)
    imageSystems.forEach(sys => {
        const positions = sys.mesh.geometry.attributes.position.array;
        const bases = sys.mesh.geometry.attributes.basePos.array; // Original spots
        const colors = sys.mesh.geometry.attributes.color.array;
        
        for (let i = 0; i < config.imgParticleCount; i++) {
            const ix = i * 3;
            
            // Wavy vertical oscillation
            const wave = Math.sin(time * config.imgOscillationSpeed + bases[ix] * 5 + sys.timeOffset);
            
            // Jitter
            const jitterX = (Math.random() - 0.5) * config.imgJitter * 0.1;
            
            // Apply
            positions[ix] = bases[ix] + jitterX;
            positions[ix+1] = bases[ix+1] + wave * config.imgOscillationAmp * 0.1; 
            
            // Hue Shift (Modify Red channel slightly)
            colors[ix] = Math.min(1, Math.max(0, colors[ix] + Math.sin(time) * 0.01));
        }
        sys.mesh.geometry.attributes.position.needsUpdate = true;
        sys.mesh.geometry.attributes.color.needsUpdate = true;
    });

    // 3. Sync positions with DOM
    updateImagePositions();

    composer.render();
}

animate();

// --- RESIZE ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});