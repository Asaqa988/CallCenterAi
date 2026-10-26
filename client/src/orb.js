// A voice-reactive orb drawn on a 2D canvas. It has no dependencies and no
// knowledge of Pipecat: main.js feeds it a mode and an audio level (0..1).

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const PALETTES = {
  dark: {
    idle: ["#A963FE", "#818CF8", "#5B3FD6"],
    listening: ["#14CECA", "#818CF8", "#3B82F6"],
    speaking: ["#A963FE", "#F472B6", "#818CF8"],
    muted: ["#6B6577", "#4B4757", "#3A3646"],
  },
  light: {
    idle: ["#8B5CF6", "#6366F1", "#A78BFA"],
    listening: ["#14CECA", "#38BDF8", "#6366F1"],
    speaking: ["#8B5CF6", "#EC4899", "#6366F1"],
    muted: ["#A8A3B8", "#C4C0D0", "#B5B0C4"],
  },
};

const lerp = (a, b, t) => a + (b - a) * t;
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export function createOrb(canvas) {
  const ctx = canvas.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let size = 0;
  let dpr = 1;
  let mode = "idle";
  let target = 0;
  let level = 0;
  let t = 0;
  let last = performance.now();
  let colors = PALETTES.dark.idle.map(hex);
  let ripples = [];
  let rippleClock = 0;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = Math.max(1, Math.round(r.width));
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function palette() {
    const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    return PALETTES[theme][mode] || PALETTES[theme].idle;
  }

  function blobRadius(angle, R, amp) {
    const n =
      Math.sin(angle * 3 + t * 1.3) * 0.5 +
      Math.sin(angle * 5 - t * 1.9) * 0.3 +
      Math.sin(angle * 2 + t * 0.7) * 0.2;
    return R * (1 + amp * n);
  }

  function draw(now) {
    // Always schedule the next frame, so one bad frame can't stop the orb.
    requestAnimationFrame(draw);
    if (!Number.isFinite(level)) level = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const calm = reduced.matches;
    t += dt * (calm ? 0.25 : 1) * (mode === "connecting" ? 2.2 : 1);

    // Ease the level so the orb breathes instead of flickering.
    const k = target > level ? 0.35 : 0.08;
    level += (target - level) * k;
    const lv = calm ? level * 0.35 : level;

    // Ease the colors toward the palette of the current mode.
    const want = palette().map(hex);
    colors = colors.map((c, i) => c.map((v, j) => lerp(v, want[i][j], 0.07)));

    const w = size;
    const cx = w / 2;
    const cy = w / 2;
    const breath = Math.sin(t * 1.4) * 0.025;
    const R = w * 0.27 * (1 + breath + lv * 0.16);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, w);

    // Outer glow.
    // Keep the glow inside the canvas, or its edge shows up as a faint square.
    const glow = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, Math.min(R * 2.3, w * 0.5));
    glow.addColorStop(0, rgba(colors[0], 0.38 + lv * 0.3));
    glow.addColorStop(0.5, rgba(colors[1], 0.12 + lv * 0.12));
    glow.addColorStop(1, rgba(colors[1], 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, w);

    // Ripples travel outward while someone is talking.
    if (!calm && lv > 0.08 && (mode === "speaking" || mode === "listening")) {
      rippleClock += dt;
      if (rippleClock > 0.45) {
        rippleClock = 0;
        ripples.push({ r: R * 1.05, a: 0.35 + lv * 0.3 });
      }
    }
    ripples = ripples.filter((p) => p.a > 0.01 && p.r < w * 0.49);
    for (const p of ripples) {
      p.r += dt * w * 0.16;
      p.a *= 1 - dt * 1.8;
      ctx.strokeStyle = rgba(colors[1], p.a);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, p.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // The organic outline of the orb.
    const amp = 0.035 + lv * 0.14;
    ctx.beginPath();
    const steps = 96;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const r = blobRadius(a, R, amp);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();

    ctx.save();
    ctx.clip();
    const base = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.1, cx, cy, R * 1.15);
    base.addColorStop(0, rgba(colors[1], 1));
    base.addColorStop(1, rgba(colors[2], 1));
    ctx.fillStyle = base;
    ctx.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4);

    // Moving color blobs inside the orb.
    for (let i = 0; i < 4; i++) {
      const a = t * (0.6 + i * 0.25) * (i % 2 ? -1 : 1) + i * 1.7;
      const d = R * (0.28 + lv * 0.35);
      const bx = cx + Math.cos(a) * d;
      const by = cy + Math.sin(a * 1.1) * d;
      const br = R * (0.75 + lv * 0.25);
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, rgba(colors[i % 3], 0.85));
      g.addColorStop(1, rgba(colors[i % 3], 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4);
    }

    // Soft highlight.
    const hl = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, 0, cx - R * 0.35, cy - R * 0.45, R * 0.8);
    hl.addColorStop(0, "rgba(255,255,255,0.45)");
    hl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hl;
    ctx.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4);
    ctx.restore();

    // Connecting spinner arc.
    if (mode === "connecting") {
      ctx.strokeStyle = rgba(colors[0], 0.9);
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.28, t * 3, t * 3 + Math.PI * 0.9);
      ctx.stroke();
    }
  }
  requestAnimationFrame(draw);

  return {
    setMode(m) {
      mode = m;
    },
    setLevel(v) {
      // Raw levels from the audio stack are small; boost and clamp them.
      // Non-numeric values would otherwise poison every frame after them.
      target = Number.isFinite(v) ? Math.max(0, Math.min(1, v * 2.6)) : 0;
    },
  };
}
