// --- CONFIGURATION ---
const config = {
    particleCount: 10000,
    particleSize: 0.1,
    color: 0xffffff,        // White particles
    bloomStrength: 1.,     // Glow intensity
    bloomThreshold: 0.1,    // Threshold for glow
    bloomRadius: 0.5,       // Softness of glow
    trailLength: 0.1,      // 0.0 = no trails, 0.99 = infinite trails
    simulationSpeed: 0.3,   // Speed of evolution
    zoom: 15                // Camera zoom distance
};

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

// --- SCENE SETUP ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false }); // Antialias off for post-proc performance

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// --- ATTRACTOR MATH (Sprott Case R) ---
// Equations: dx = 0.9 - y, dy = 0.4 + z, dz = xy - z
const positions = new Float32Array(config.particleCount * 3);
const geometry = new THREE.BufferGeometry();

// Initialize random positions
for (let i = 0; i < config.particleCount * 3; i++) {
    positions[i] = (Math.random() - 0.5) * 10;
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

const material = new THREE.PointsMaterial({
    color: config.color,
    size: config.particleSize,
    transparent: true,
    opacity: 0.8,
    map: getCircleTexture(),
    blending: THREE.AdditiveBlending // Adds brightness when particles overlap
});

const particles = new THREE.Points(geometry, material);
scene.add(particles);

camera.position.z = config.zoom;

// --- POST PROCESSING (Bloom + Trails) ---
const composer = new THREE.EffectComposer(renderer);
const renderPass = new THREE.RenderPass(scene, camera);
composer.addPass(renderPass);

// 1. Trails (Afterimage)
const afterimagePass = new THREE.AfterimagePass();
afterimagePass.uniforms["damp"].value = config.trailLength;
composer.addPass(afterimagePass);

// 2. Bloom (Glow)
const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    config.bloomStrength,
    config.bloomRadius,
    config.bloomThreshold
);
composer.addPass(bloomPass);

// --- ANIMATION LOOP ---
const clock = new THREE.Clock();
let time = 0;

// Mouse interaction
let mouseX = 0;
let mouseY = 0;
document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX - window.innerWidth / 2) * 0.001;
    mouseY = (e.clientY - window.innerHeight / 2) * 0.001;
});

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    // Evolve the system
    const positions = particles.geometry.attributes.position.array;
    const dt = delta * config.simulationSpeed;

    for (let i = 0; i < config.particleCount; i++) {
        let x = positions[i * 3];
        let y = positions[i * 3 + 1];
        let z = positions[i * 3 + 2];

        // Sprott Case R equations
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

    particles.geometry.attributes.position.needsUpdate = true;

    // Slow rotation of the whole system
    particles.rotation.y += 0.002;
    particles.rotation.z += 0.001;

    // Gentle parallax
    particles.rotation.x += (mouseY - particles.rotation.x) * 0.05;
    particles.rotation.y += (mouseX - particles.rotation.y) * 0.05;

    // Use composer instead of standard renderer
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