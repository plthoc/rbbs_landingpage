const COUNTDOWN_END_KEY = "rbbs_countdown_end_v4";
const COUNTDOWN_DAYS = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const GRAY = { r: 90, g: 90, b: 90 };
const WHITE = { r: 255, g: 255, b: 255 };
const SNOW_CHARS = "«»·+*#@%&.:;[]{}|/\\<>~^";
const SNOW_WAVE_SPEED = 1.45;
const SNOW_FONT_SIZE = 12;
const SNOW_OPACITY = 0.06;
const SNOW_RENDER_SCALE = 0.7;

const COLOR_LUT = Array.from({ length: 256 }, (_, i) => {
  const t = i / 255;
  const r = Math.round(GRAY.r + (WHITE.r - GRAY.r) * t);
  const g = Math.round(GRAY.g + (WHITE.g - GRAY.g) * t);
  const b = Math.round(GRAY.b + (WHITE.b - GRAY.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
});

function getCountdownEnd() {
  const now = Date.now();
  const fallback = () => new Date(now + COUNTDOWN_DAYS * MS_PER_DAY);

  try {
    const stored = localStorage.getItem(COUNTDOWN_END_KEY);
    if (stored) {
      const end = new Date(stored);
      if (!Number.isNaN(end.getTime()) && end.getTime() > now) {
        return end;
      }
    }
    const end = fallback();
    localStorage.setItem(COUNTDOWN_END_KEY, end.toISOString());
    return end;
  } catch {
    return fallback();
  }
}

function startCountdown() {
  const el = document.getElementById("countdown");
  if (!el) return;

  const end = getCountdownEnd();
  const tick = () => updateCountdown(end, el);
  tick();
  setInterval(tick, 1000);
}

function padUnit(value, unit) {
  return `${value}${unit}`;
}

function updateCountdown(end, el) {
  const diff = Math.max(0, end.getTime() - Date.now());
  const days = Math.floor(diff / MS_PER_DAY);
  const hours = Math.floor((diff % MS_PER_DAY) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  el.textContent = `${padUnit(days, "d")} : ${padUnit(hours, "h")} : ${padUnit(minutes, "m")} : ${padUnit(seconds, "s")}`;
}

function buildAsciiDom(container, text) {
  const lines = text.split("\n");
  const cells = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  lines.forEach((line, y) => {
    for (let x = 0; x < line.length; x++) {
      const ch = line[x];
      const span = document.createElement("span");
      span.className = "c";
      span.textContent = ch;
      if (ch.trim() !== "") {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        cells.push({ el: span, x, y });
      }
      container.appendChild(span);
    }
    if (y < lines.length - 1) container.appendChild(document.createTextNode("\n"));
  });

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const span = Math.max(maxX - minX, maxY - minY, 1);

  return cells.map(({ el, x, y }) => {
    const nx = (x - centerX) / span;
    const ny = (y - centerY) / span;
    return {
      el,
      nx,
      ny,
      dist: Math.hypot(nx, ny),
      jitter: (((x * 17) ^ (y * 31)) % 628) / 100,
      fall: 0,
      gy: 0,
    };
  });
}

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function colorAt(brightness) {
  return COLOR_LUT[Math.max(0, Math.min(255, (brightness * 255) | 0))];
}

function waveBrightness(t, { nx, ny, dist, jitter, fall, gy = 0 }) {
  const nyShift = ny + ((gy + t * 0.06 + fall * 0.02) % 1) * 0.35;
  const sweep = Math.sin(t * 0.72 + nx * 3.6 + nyShift * 2.4 + jitter * 0.35);
  const ripple = Math.sin(t * 0.95 - dist * 7.5 + jitter * 0.55);
  const drift = Math.sin(t * 0.38 + nx * 1.2 - nyShift * 1.8 + jitter) * 0.4;
  return smoothstep((sweep * 0.48 + ripple * 0.42 + drift * 0.1 + 1) * 0.5);
}

function createSnowRenderer(canvas) {
  const ctx = canvas.getContext("2d", { alpha: true });
  let cells = [];
  let width = 0;
  let height = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = dpr * SNOW_RENDER_SCALE;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.font = `300 ${SNOW_FONT_SIZE}px "IBM Plex Mono", "Courier New", monospace`;
    ctx.textBaseline = "top";

    const charW = ctx.measureText("M").width || 7;
    const charH = SNOW_FONT_SIZE * 1.05;
    const cols = Math.ceil(width / charW) + 1;
    const rows = Math.ceil(height / charH) + 1;
    const centerX = (cols - 1) / 2;
    const centerY = (rows - 1) / 2;
    const span = Math.max(cols, rows) / 2;
    const next = [];

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ch = SNOW_CHARS[(Math.random() * SNOW_CHARS.length) | 0];
        const nx = (x - centerX) / span;
        const ny = (y - centerY) / span;
        next.push({
          ch,
          px: x * charW,
          py: y * charH,
          nx,
          ny,
          dist: Math.hypot(nx, ny),
          jitter: (((x * 13) ^ (y * 29)) % 628) / 100,
          fall: Math.random() * Math.PI * 2,
          gy: y / rows,
        });
      }
    }

    cells = next;
  }

  function draw(time) {
    const t = time * 0.001 * SNOW_WAVE_SPEED;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = SNOW_OPACITY;
    ctx.font = `300 ${SNOW_FONT_SIZE}px "IBM Plex Mono", "Courier New", monospace`;
    ctx.textBaseline = "top";

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      ctx.fillStyle = colorAt(waveBrightness(t, cell));
      ctx.fillText(cell.ch, cell.px, cell.py);
    }

    ctx.globalAlpha = 1;
  }

  return { resize, draw };
}

let logoCells = [];

function startLogoAnimation() {
  function frame(time) {
    const t = time * 0.001;
    for (let i = 0; i < logoCells.length; i++) {
      const cell = logoCells[i];
      cell.el.style.color = colorAt(waveBrightness(t, cell));
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function startSnowAnimation(snow) {
  let lastDraw = 0;

  function frame(time) {
    if (time - lastDraw >= 33) {
      snow.draw(time);
      lastDraw = time;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

async function init() {
  const asciiEl = document.getElementById("ascii-art");
  const snowCanvas = document.getElementById("ascii-snow");

  if (document.fonts?.ready) await document.fonts.ready;

  logoCells = buildAsciiDom(asciiEl, ASCII_ART);
  const snow = createSnowRenderer(snowCanvas);
  snow.resize();

  startLogoAnimation();
  startSnowAnimation(snow);

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => snow.resize(), 200);
  });

}

startCountdown();
init();
