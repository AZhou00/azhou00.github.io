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
    velocityColorScale: 1,     // How much velocity affects color transition
    colorMap: {
        approaching: { r: 100, g: 150, b: 255 },  // Blue for moving toward observer
        neutral: { r: 255, g: 255, b: 255 },      // White for no velocity
        receding: { r: 255, g: 100, b: 100 }      // Red for moving away
    }
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

// Linear interpolation between two colors
function lerpColor(color1, color2, t) {
    t = Math.max(0, Math.min(1, t)); // Clamp t between 0 and 1
    return {
        r: (color1.r + (color2.r - color1.r) * t) / 255,
        g: (color1.g + (color2.g - color1.g) * t) / 255,
        b: (color1.b + (color2.b - color1.b) * t) / 255
    };
}

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

        // Map velocity to color (Doppler shift simulation)
        const velocityFactor = losVelocity * config.velocityColorScale;
        let rgb;
        if (velocityFactor > 0) {
            // Moving away: interpolate neutral -> red
            rgb = lerpColor(config.colorMap.neutral, config.colorMap.receding, velocityFactor);
        } else {
            // Moving toward: interpolate blue -> neutral
            rgb = lerpColor(config.colorMap.approaching, config.colorMap.neutral, 1 + velocityFactor);
        }
        
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
