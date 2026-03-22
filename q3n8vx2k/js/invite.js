const AUTH_KEY = "inv_auth";

(function gate() {
  if (!sessionStorage.getItem(AUTH_KEY)) location.replace("login.html");
})();

let myConfetti = null;

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* canvas-confetti: particleCount, angle, spread, startVelocity, decay (0–1, higher = slower slowdown),
   gravity, ticks (lifetime), drift, flat, colors[], shapes[], scalar, origin {x,y}, zIndex */
const CONFETTI_COLORS = [
  "#c4a574",
  "#8b7355",
  "#e8b4a0",
  "#f4d58a",
  "#a8d4e6",
  "#d4b8e8",
  "#f5f0e8",
];

const CONFETTI_TICKS = 2400;

function baseConfetti(opts) {
  return {
    spread: 48,
    startVelocity: 20,
    decay: 0.995,
    gravity: 2.05,
    ticks: CONFETTI_TICKS,
    colors: CONFETTI_COLORS,
    scalar: 1.1,
    disableForReducedMotion: true,
    ...opts,
  };
}

/** 12 cannon positions (same for load + accept): sides + top/bottom edges */
function randomEdgeOrigins() {
  const r = (a, b) => a + Math.random() * (b - a);
  return [
    { x: 0, y: r(0.12, 0.32) },
    { x: 0, y: r(0.38, 0.62) },
    { x: 0, y: r(0.68, 0.88) },
    { x: 1, y: r(0.12, 0.32) },
    { x: 1, y: r(0.38, 0.62) },
    { x: 1, y: r(0.68, 0.88) },
    { x: r(0.12, 0.32), y: 0 },
    { x: r(0.38, 0.62), y: 0 },
    { x: r(0.68, 0.88), y: 0 },
    { x: r(0.12, 0.32), y: 1 },
    { x: r(0.38, 0.62), y: 1 },
    { x: r(0.68, 0.88), y: 1 },
  ];
}

/** Same edge bursts as page load: 12 cannons × baseConfetti */
function fireEdgeCannons() {
  randomEdgeOrigins().forEach((origin, i) => {
    setTimeout(() => {
      myConfetti(baseConfetti({ particleCount: 64, origin }));
    }, i * 70);
  });
}

/**
 * Gentle “waterfall” shower: weak gravity, low speed, slow drips (not base cannon physics).
 * angle 270° = downward (90° is up in canvas-confetti).
 * startDelayMs: begins after edge cannons (stagger ends ~770ms + buffer).
 */
const WATERFALL_SHOWER = {
  startDelayMs: 4000,
  steps: 52,
  stepMs: 120,
  particleCount: 5,
  spread: 24,
  angle: 270,
  gravity: 0.14,
  startVelocity: 4,
  decay: 0.9988,
  ticks: 3800,
};

function waterfallConfetti(opts = {}) {
  if (!myConfetti || reducedMotion()) return;
  const r = (a, b) => a + Math.random() * (b - a);
  const cfg = { ...WATERFALL_SHOWER, ...opts };
  const {
    steps,
    stepMs,
    particleCount,
    spread,
    angle,
    gravity,
    startVelocity,
    decay,
    startDelayMs,
    ticks,
  } = cfg;
  for (let i = 0; i < steps; i++) {
    setTimeout(() => {
      myConfetti(
        baseConfetti({
          angle,
          spread,
          gravity,
          startVelocity,
          decay,
          ticks,
          origin: { x: r(0.06, 0.94), y: r(0, 0.03) },
          particleCount,
          drift: r(-0.06, 0.06),
        }),
      );
    }, startDelayMs + i * stepMs);
  }
}

function updateAcceptButton() {
  const city = document.getElementById("field-city").value.trim();
  const time = document.getElementById("field-time").value.trim();
  document.getElementById("accept-btn").disabled = !(city && time);
}

async function fontsReady() {
  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch (_) {
    /* ignore */
  }
}

function edgeConfetti() {
  if (!myConfetti || reducedMotion()) return;
  fireEdgeCannons();
  waterfallConfetti();
}

function acceptConfetti() {
  if (!myConfetti || reducedMotion()) return;
  fireEdgeCannons();
  waterfallConfetti();
}

async function generatePdf() {
  const el = document.getElementById("invite-page");
  const status = document.getElementById("pdf-status");
  if (!el) {
    status.textContent = "无法生成 PDF。";
    return;
  }
  status.textContent = "正在生成 PDF…";

  const opt = {
    margin: 8,
    filename: "invitation.pdf",
    image: { type: "jpeg", quality: 0.92 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      letterRendering: true,
      logging: false,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: -window.scrollY,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.scrollHeight,
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
  };

  try {
    const w = html2pdf().set(opt).from(el).save();
    if (w?.then) await w;
    status.textContent = "已下载 PDF。";
  } catch (e) {
    console.error(e);
    status.textContent = "生成 PDF 时出错，请重试。";
  }
}

/**
 * Gutter field: Three.js Points + Sprott + AfterimagePass (same core as ../js/background.js).
 *
 * Stock AfterimageShader uses max(…) for bright-on-dark. We use “ink” feedback on light bg:
 * ink = (uBg - color)+, then out = uBg - (inkNew + inkOld * damp). Current particles stay full
 * strength; damp only scales *old* ink (long trails). Plain mix(texelNew, texelOld, damp) would
 * multiply the *whole* frame by (1-damp), crushing particles when damp is high. Ping-pong RTs
 * are cleared to --page-bg so frame 0 isn’t black. UnrealBloomPass omitted.
 */
function initGutterParticles() {
  const canvas = document.getElementById("gutter-particles");
  if (!canvas || reducedMotion() || typeof THREE === "undefined") return;

  const pageBgColor = new THREE.Color();
  {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--page-bg")
      .trim();
    const hex6 = /^#?([0-9a-fA-F]{6})$/;
    const m = hex6.exec(raw);
    if (m) pageBgColor.setHex(parseInt(m[1], 16));
    else {
      try {
        pageBgColor.set(raw || "#faf6ef");
      } catch (_) {
        pageBgColor.setHex(0xfaf6ef);
      }
    }
  }

  const config = {
    particleCount: 2000,
    particleSize: 0.05,
    /** Same as background.js `trailLength` → AfterimagePass `damp` (we use a patched shader). */
    trailLength: 0.98,
    /** Dark grey for dots and afterimage trails (same as former 2D dot fill). */
    particleColor: 0x454340,
    simulationSpeed: 0.1,
    zoom: 15,
    noiseStrength: 0.1,
    diffusion: 0.05,
    resetProbability: 0.0005,
  };

  function getCircleTexture() {
    const size = 32;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const context = c.getContext("2d");
    const center = size / 2;
    const radius = size / 2;
    context.beginPath();
    context.arc(center, center, radius, 0, 2 * Math.PI);
    context.fillStyle = "#ffffff";
    context.fill();
    return new THREE.CanvasTexture(c);
  }

  const scene = new THREE.Scene();
  scene.background = pageBgColor;
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
  );
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: false,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(pageBgColor, 1);

  camera.position.z = config.zoom;

  const positions = new Float32Array(config.particleCount * 3);
  const velocities = new Float32Array(config.particleCount * 3);
  const geometry = new THREE.BufferGeometry();

  for (let i = 0; i < config.particleCount; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 20;
    positions[i3 + 1] = (Math.random() - 0.5) * 20;
    positions[i3 + 2] = (Math.random() - 0.5) * 20;
    velocities[i3] = 0;
    velocities[i3 + 1] = 0;
    velocities[i3 + 2] = 0;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const particleGray = new THREE.Color(config.particleColor);

  const material = new THREE.PointsMaterial({
    size: config.particleSize,
    color: particleGray,
    transparent: true,
    opacity: 0.85,
    map: getCircleTexture(),
    blending: THREE.NormalBlending,
    depthWrite: false,
    vertexColors: false,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  if (THREE.AfterimageShader) {
    THREE.AfterimageShader.uniforms.uBg = {
      value: new THREE.Vector3(pageBgColor.r, pageBgColor.g, pageBgColor.b),
    };
    THREE.AfterimageShader.fragmentShader = `
      uniform float damp;
      uniform vec3 uBg;
      uniform sampler2D tOld;
      uniform sampler2D tNew;
      varying vec2 vUv;
      void main() {
        vec3 n = texture2D( tNew, vUv ).rgb;
        vec3 o = texture2D( tOld, vUv ).rgb;
        vec3 inkN = max( vec3( 0.0 ), uBg - n );
        vec3 inkO = max( vec3( 0.0 ), uBg - o );
        vec3 ink = inkN + inkO * damp;
        ink = min( ink, vec3( 0.94 ) );
        gl_FragColor = vec4( uBg - ink, 1.0 );
      }
    `;
  }

  const composer = new THREE.EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new THREE.RenderPass(scene, camera));

  const afterimagePass = new THREE.AfterimagePass(config.trailLength);
  composer.addPass(afterimagePass);

  function clearAfterimageBuffersToPageBg() {
    const prev = renderer.getRenderTarget();
    renderer.setClearColor(pageBgColor.r, pageBgColor.g, pageBgColor.b, 1);
    renderer.setRenderTarget(afterimagePass.textureOld);
    renderer.clear();
    renderer.setRenderTarget(afterimagePass.textureComp);
    renderer.clear();
    renderer.setRenderTarget(prev);
  }
  clearAfterimageBuffersToPageBg();

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const dt = delta * config.simulationSpeed;
    const pos = points.geometry.attributes.position.array;

    for (let i = 0; i < config.particleCount; i++) {
      const i3 = i * 3;
      let x = pos[i3];
      let y = pos[i3 + 1];
      let z = pos[i3 + 2];

      if (Math.random() < config.resetProbability) {
        x = (Math.random() - 0.5) * 20;
        y = (Math.random() - 0.5) * 20;
        z = (Math.random() - 0.5) * 20;
        velocities[i3] = velocities[i3 + 1] = velocities[i3 + 2] = 0;
      } else {
        const dx = 0.9 - y + (Math.random() - 0.5) * config.noiseStrength;
        const dy = 0.4 + z + (Math.random() - 0.5) * config.noiseStrength;
        const dz = x * y - z + (Math.random() - 0.5) * config.noiseStrength;

        const diffX = (Math.random() - 0.5) * config.diffusion;
        const diffY = (Math.random() - 0.5) * config.diffusion;
        const diffZ = (Math.random() - 0.5) * config.diffusion;

        velocities[i3] = dx + diffX;
        velocities[i3 + 1] = dy + diffY;
        velocities[i3 + 2] = dz + diffZ;

        x += velocities[i3] * dt;
        y += velocities[i3 + 1] * dt;
        z += velocities[i3 + 2] * dt;
      }

      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z;
    }

    points.geometry.attributes.position.needsUpdate = true;

    points.rotation.y += 0.002;
    points.rotation.z += 0.001;

    composer.render();
  }

  animate();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.setPixelRatio(renderer.getPixelRatio());
    clearAfterimageBuffersToPageBg();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initGutterParticles();

  const canvas = document.getElementById("confetti-canvas");
  if (canvas && typeof confetti === "function") {
    myConfetti = confetti.create(canvas, {
      resize: true,
      useWorker: false,
      disableForReducedMotion: true,
    });
  }

  const city = document.getElementById("field-city");
  const time = document.getElementById("field-time");
  const btn = document.getElementById("accept-btn");
  const noBtn = document.getElementById("no-btn");

  function jumpNoButton() {
    if (!noBtn) return;
    const pad = 12;
    const w = noBtn.offsetWidth;
    const h = noBtn.offsetHeight;
    const spanX = Math.max(0, window.innerWidth - w - 2 * pad);
    const spanY = Math.max(0, window.innerHeight - h - 2 * pad);
    const destLeft = pad + Math.random() * spanX;
    const destTop = pad + Math.random() * spanY;
    const instant = reducedMotion();

    const applyDest = () => {
      noBtn.style.left = `${destLeft}px`;
      noBtn.style.top = `${destTop}px`;
    };

    if (noBtn.style.position !== "fixed") {
      const rect = noBtn.getBoundingClientRect();
      noBtn.style.position = "fixed";
      noBtn.style.left = `${rect.left}px`;
      noBtn.style.top = `${rect.top}px`;
      noBtn.style.zIndex = "20";
      noBtn.classList.add("no-btn--floating");
      if (instant) {
        applyDest();
        return;
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(applyDest);
      });
      return;
    }

    applyDest();
  }

  noBtn?.addEventListener("click", jumpNoButton);

  city.addEventListener("input", updateAcceptButton);
  time.addEventListener("input", updateAcceptButton);
  updateAcceptButton();

  fontsReady().then(edgeConfetti);

  btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    acceptConfetti();
    await fontsReady();
    await new Promise((r) => setTimeout(r, 3000));
    await generatePdf();
  });
});
