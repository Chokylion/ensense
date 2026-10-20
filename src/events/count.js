// COUNT (🔢): dots flash briefly; estimate how many. Friday: dots drift/bounce.
import { COLORS, text, raf, delay, pingPong } from "../engine.js";

const DOT_R = 5;
const MIN_GAP = 16; // minimum center-to-center spacing
const AREA = { x: 50, y: 50, w: 700, h: 400 };
const FLASH_NORMAL = 2000;
const FLASH_FRIDAY = 2600;
const BOUNDS = {
  x0: AREA.x + DOT_R,
  x1: AREA.x + AREA.w - DOT_R,
  y0: AREA.y + DOT_R,
  y1: AREA.y + AREA.h - DOT_R,
};

const flashMs = (variant) => (variant === "friday" ? FLASH_FRIDAY : FLASH_NORMAL);

function dotsAt(piece, t) {
  if (piece.variant !== "friday") return piece.dots;
  return piece.dots.map((d, i) => ({
    x: pingPong(d.x + piece.vel[i].x * t, BOUNDS.x0, BOUNDS.x1),
    y: pingPong(d.y + piece.vel[i].y * t, BOUNDS.y0, BOUNDS.y1),
  }));
}

function layoutDots(rng, count) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let tries = 0; tries < 2000; tries++) {
      const x = rng.range(AREA.x + DOT_R, AREA.x + AREA.w - DOT_R);
      const y = rng.range(AREA.y + DOT_R, AREA.y + AREA.h - DOT_R);
      if (pts.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 >= MIN_GAP ** 2)) {
        pts.push({ x, y });
        placed = true;
        break;
      }
    }
    if (!placed) return null;
  }
  return pts;
}

function drawDots(stage, dots, alpha = 1) {
  const g = stage.g;
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = COLORS.ink;
  for (const d of dots) {
    g.beginPath();
    g.arc(d.x, d.y, DOT_R, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function askCount(ctx) {
  return new Promise((resolve) => {
    const form = document.createElement("form");
    form.className = "count-form";
    form.innerHTML = `
      <label for="count-in">How many dots?</label>
      <input id="count-in" type="text" inputmode="numeric" autocomplete="off"
             spellcheck="false" maxlength="3" aria-label="Your dot count">
      <button type="submit" class="btn primary">Submit</button>`;
    ctx.hud.append(form);
    const input = form.querySelector("input");
    input.focus();
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const n = parseInt(input.value.trim(), 10);
      if (!Number.isFinite(n) || n < 0) {
        input.value = "";
        input.focus();
        return;
      }
      form.remove();
      resolve(n);
    });
  });
}

export const count = {
  id: "count",
  instruction: (p) =>
    p.variant === "friday"
      ? "The dots will not hold still. They flash for two and a half seconds, drifting and bouncing the whole time. How many were there?"
      : "Dots will flash for two seconds. How many were there?",

  generate(rng, variant) {
    const n = rng.int(45, 85);
    for (let attempt = 0; attempt < 100; attempt++) {
      const dots = layoutDots(rng, n);
      if (!dots) continue;
      const vel = dots.map(() => {
        if (variant !== "friday") return { x: 0, y: 0 };
        const ang = rng.range(0, 2 * Math.PI);
        const sp = rng.range(34, 76);
        return { x: Math.cos(ang) * sp, y: Math.sin(ang) * sp };
      });
      return { variant, n, dots, vel };
    }
    throw new Error("count: dot layout generation failed");
  },

  async run(ctx, piece) {
    const { stage } = ctx;
    for (const s of ["3", "2", "1"]) {
      const t0 = performance.now();
      for (;;) {
        const dt = performance.now() - t0;
        if (dt >= 650) break;
        stage.clear();
        const alpha = ctx.reducedMotion ? 1 : Math.max(0.3, 1 - (dt / 650) * 0.7);
        text(stage.g, s, 400, 250, { size: 120, align: "center", baseline: "middle", weight: 600, alpha });
        await raf();
      }
    }
    const dur = flashMs(piece.variant);
    const t0 = performance.now();
    for (;;) {
      const dt = performance.now() - t0;
      if (dt >= dur) break;
      stage.clear();
      drawDots(stage, dotsAt(piece, dt / 1000));
      await raf();
    }
    stage.clear();
    const guess = await askCount(ctx);
    const diff = Math.abs(guess - piece.n);
    return {
      rawError: Math.abs(guess - piece.n) / piece.n,
      human: diff === 0 ? "exactly right" : `off by ${diff} dot${diff === 1 ? "" : "s"}`,
      detail: { guess },
    };
  },

  async reveal(ctx, piece, result) {
    const { guess } = result.detail;
    ctx.stage.clear();
    drawDots(ctx.stage, dotsAt(piece, flashMs(piece.variant) / 1000), 0.3);
    text(ctx.stage.g, String(piece.n), 400, 235, {
      size: 110,
      color: COLORS.truth,
      align: "center",
      baseline: "middle",
      weight: 600,
    });
    text(ctx.stage.g, `you said ${guess}`, 400, 322, { size: 24, color: COLORS.signal, align: "center" });
    await delay(1800);
  },
};
