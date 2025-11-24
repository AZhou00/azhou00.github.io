// --- CONFIGURATION ---
const ENABLE_BACKGROUND = true;  // Set to false to disable the background animation

const config = {
    particleCount: 2000,
    particleSize: 0.05,
    bloomStrength: 1,
    bloomThreshold: 0.1,
    bloomRadius: 0.2,
    trailLength: 0.8,          // 0.0 = no trails, 0.99 = infinite trails
    simulationSpeed: 0.1,
    zoom: 15,
    noiseStrength: 0.1,        // Random perturbation strength
    diffusion: 0.05,           // Random walk diffusion
    resetProbability: 0.0005,   // Probability to reinitialize a particle per frame
    velocityColorScale: 1,    // How much velocity affects color hue
    baseColor: {               // Base color for neutral velocity (RGB 0-255)
        r: 186,                // Red component
        g: 129,                 // Green component
        b: 129                  // Blue component (deeper red/burgundy)
    },
    colorSaturation: 1       // Color saturation (0.0 = white, 1.0 = full color)
};

// Exit early if background is disabled
if (!ENABLE_BACKGROUND) {
    console.log("Background animation disabled");
} else {

// --- HELPER FUNCTIONS ---
function getCircleTexture() {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const center = size / 2;
    const radius = size / 2;
    context.beginPath();
    context.arc(center, center, radius, 0, 2 * Math.PI);
    context.fillStyle = '#ffffff';
    context.fill();
    return new THREE.CanvasTexture(canvas);
}

// Convert RGB (0-255) to Hue (0-360)
function rgbToHue(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    
    if (delta === 0) return 0;
    
    let hue;
    if (max === r) {
        hue = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
        hue = 60 * ((b - r) / delta + 2);
    } else {
        hue = 60 * ((r - g) / delta + 4);
    }
    
    return (hue + 360) % 360;
}

// Convert HSV to RGB (simpler than the hue-only conversion)
function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r, g, b;
    
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    
    return { r: r + m, g: g + m, b: b + m };
}

// Calculate base hue from config
const baseHue = rgbToHue(config.baseColor.r, config.baseColor.g, config.baseColor.b);

// --- SCENE SETUP ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById('canvas-container').appendChild(renderer.domElement);

camera.position.z = config.zoom;

// --- PARTICLE SYSTEM ---
const positions = new Float32Array(config.particleCount * 3);
const velocities = new Float32Array(config.particleCount * 3);
const colors = new Float32Array(config.particleCount * 3);
const geometry = new THREE.BufferGeometry();

// Initialize particles
for (let i = 0; i < config.particleCount; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 20;
    positions[i3 + 1] = (Math.random() - 0.5) * 20;
    positions[i3 + 2] = (Math.random() - 0.5) * 20;
    velocities[i3] = 0;
    velocities[i3 + 1] = 0;
    velocities[i3 + 2] = 0;
    colors[i3] = 1.0;
    colors[i3 + 1] = 1.0;
    colors[i3 + 2] = 1.0;
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const material = new THREE.PointsMaterial({
    size: config.particleSize,
    transparent: true,
    opacity: 0.8,
    map: getCircleTexture(),
    blending: THREE.AdditiveBlending,
    vertexColors: true
});

const particles = new THREE.Points(geometry, material);
scene.add(particles);

// --- POST PROCESSING ---
const composer = new THREE.EffectComposer(renderer);
composer.addPass(new THREE.RenderPass(scene, camera));

const afterimagePass = new THREE.AfterimagePass();
afterimagePass.uniforms["damp"].value = config.trailLength;
composer.addPass(afterimagePass);

const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    config.bloomStrength,
    config.bloomRadius,
    config.bloomThreshold
);
composer.addPass(bloomPass);

// --- ANIMATION ---
const clock = new THREE.Clock();
let mouseX = 0;
let mouseY = 0;

document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX - window.innerWidth / 2) * 0.001;
    mouseY = (e.clientY - window.innerHeight / 2) * 0.001;
});

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const dt = delta * config.simulationSpeed;
    const positions = particles.geometry.attributes.position.array;
    const colors = particles.geometry.attributes.color.array;

    // Get camera direction in particle's local coordinate frame
    // 1. Start with camera forward direction in camera space
    const cameraDir = new THREE.Vector3(0, 0, -1);
    // 2. Transform to world space
    cameraDir.applyQuaternion(camera.quaternion);
    // 3. Transform to particle local space (inverse of particle rotation)
    const particleQuatInv = particles.quaternion.clone().invert();
    cameraDir.applyQuaternion(particleQuatInv);

    for (let i = 0; i < config.particleCount; i++) {
        const i3 = i * 3;
        let x = positions[i3];
        let y = positions[i3 + 1];
        let z = positions[i3 + 2];

        // Randomly reinitialize particles
        if (Math.random() < config.resetProbability) {
            x = (Math.random() - 0.5) * 20;
            y = (Math.random() - 0.5) * 20;
            z = (Math.random() - 0.5) * 20;
            velocities[i3] = velocities[i3 + 1] = velocities[i3 + 2] = 0;
        } else {
            // Sprott Case R equations with noise
            const dx = (0.9 - y) + (Math.random() - 0.5) * config.noiseStrength;
            const dy = (0.4 + z) + (Math.random() - 0.5) * config.noiseStrength;
            const dz = (x * y - z) + (Math.random() - 0.5) * config.noiseStrength;

            // Add diffusion
            const diffX = (Math.random() - 0.5) * config.diffusion;
            const diffY = (Math.random() - 0.5) * config.diffusion;
            const diffZ = (Math.random() - 0.5) * config.diffusion;

            // Store velocity
            velocities[i3] = dx + diffX;
            velocities[i3 + 1] = dy + diffY;
            velocities[i3 + 2] = dz + diffZ;

            // Update position
            x += velocities[i3] * dt;
            y += velocities[i3 + 1] * dt;
            z += velocities[i3 + 2] * dt;
        }

        positions[i3] = x;
        positions[i3 + 1] = y;
        positions[i3 + 2] = z;

        // Calculate line-of-sight velocity (dot product with camera direction)
        const losVelocity = velocities[i3] * cameraDir.x + 
                           velocities[i3 + 1] * cameraDir.y + 
                           velocities[i3 + 2] * cameraDir.z;

        // Map velocity to color
        // Shift hue based on line-of-sight velocity relative to base color
        const hue = baseHue + losVelocity * config.velocityColorScale;
        const rgb = hsvToRgb(hue, config.colorSaturation, 1.0);
        
        colors[i3] = rgb.r;
        colors[i3 + 1] = rgb.g;
        colors[i3 + 2] = rgb.b;
    }

    particles.geometry.attributes.position.needsUpdate = true;
    particles.geometry.attributes.color.needsUpdate = true;

    // Rotate system
    particles.rotation.y += 0.002;
    particles.rotation.z += 0.001;

    // Mouse parallax
    particles.rotation.x += (mouseY - particles.rotation.x) * 0.05;
    particles.rotation.y += (mouseX - particles.rotation.y) * 0.05;

    composer.render();
}

animate();

// --- RESIZE HANDLER ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

} // End of ENABLE_BACKGROUND check
