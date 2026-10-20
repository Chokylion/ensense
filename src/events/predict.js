// PREDICT / TRACK (🎯): watch a thrown ball, click where it lands after it
// vanishes. Friday: weak gravity and live side walls, so it ricochets.
import { COLORS, DEG, text, line, tick, bracket, clamp, raf, delay, pingPong } from "../engine.js";

const G_NORMAL = 900;
const G_FRIDAY = 420;
const GROUND = 450;
const WALL_L = 24;
const WALL_R = 776;
const BALL_R = 7;
const FADE_MS = 80;

function bounceCount(x0, landRaw, lo, hi) {
  const dist = Math.abs(landRaw - x0);
  const first = landRaw > x0 ? hi - x0 : x0 - lo;
  if (dist <= first) return 0;
  return 1 + Math.floor((dist - first) / (hi - lo));
}

function ballAt(piece, t) {
  const x = piece.x0 + piece.vx * t;
  return {
    x: piece.variant === "friday" ? pingPong(x, WALL_L, WALL_R) : x,
    y: GROUND - (piece.vy * t - 0.5 * piece.g * t * t),
  };
}

function drawField(g, piece) {
  line(g, 0, GROUND, 800, GROUND, COLORS.faint, 1);
  line(g, 30, GROUND, 770, GROUND, COLORS.inkDim, 2);
  tick(g, piece.x0, GROUND, 14, COLORS.faint, 2);
  if (piece.variant === "friday") {
    for (const wx of [WALL_L, WALL_R]) line(g, wx, 18, wx, GROUND, COLORS.inkDim, 2);
  }
}

export const predict = {
  id: "predict",
  instruction: (p) =>
    p.variant === "friday"
      ? "Watch the ball. Gravity is weak today and the side walls are live: it will ricochet. When it disappears, click where it will land."
      : "Watch the ball. When it disappears, click where it will land.",

  generate(rng, variant) {
    const friday = variant === "friday";
    const g = friday ? G_FRIDAY : G_NORMAL;
    for (let i = 0; i < 1000; i++) {
      const x0 = rng.range(60, 140);
      const speed = friday ? rng.range(560, 860) : rng.range(520, 650);
      const ang = (friday ? rng.range(42, 66) : rng.range(50, 70)) * DEG;
      const vx = speed * Math.cos(ang);
      const vy = speed * Math.sin(ang);
      const T = (2 * vy) / g;
      const landRaw = x0 + vx * T;
      if (GROUND - (vy * vy) / (2 * g) < 30) continue; // apex above canvas
      if (!friday) {
        if (landRaw >= 450 && landRaw <= 760)
          return { variant, x0, vx, vy, T, landingX: landRaw, g, bounces: 0 };
        continue;
      }
      const bounces = bounceCount(x0, landRaw, WALL_L, WALL_R);
      const landing = pingPong(landRaw, WALL_L, WALL_R);
      if (bounces >= 1 && landing >= 80 && landing <= 720 && Math.abs(landing - x0) > 120 && T <= 3)
        return { variant, x0, vx, vy, T, landingX: landing, g, bounces };
    }
    throw new Error("predict: trajectory generation failed");
  },

  run(ctx, piece) {
    return new Promise((resolve) => {
      const { stage } = ctx;
      const g = stage.g;
      const t0 = performance.now();
      const hideAt = 0.45 * piece.T * 1000;
      let frameId = 0;
      let done = false;

      const finish = (x) => {
        done = true;
        cancelAnimationFrame(frameId);
        stage.canvas.removeEventListener("pointerdown", onDown);
        const err = Math.abs(x - piece.landingX);
        resolve({
          rawError: err,
          human: `${Math.round(err)} px from the landing spot`,
          detail: { clickX: x },
        });
      };

      const onDown = (e) => {
        const t = performance.now() - t0;
        if (done || t < hideAt + FADE_MS) return;
        finish(clamp(stage.toLogical(e).x, 0, 800));
      };
      stage.canvas.addEventListener("pointerdown", onDown);

      const frame = () => {
        if (done) return;
        const t = performance.now() - t0;
        stage.clear();
        drawField(g, piece);
        const vis = t < hideAt ? 1 : Math.max(0, 1 - (t - hideAt) / FADE_MS);
        if (vis > 0) {
          const { x, y } = ballAt(piece, Math.min(t / 1000, piece.T));
          g.save();
          g.globalAlpha = vis;
          g.fillStyle = COLORS.ink;
          g.beginPath();
          g.arc(x, y, BALL_R, 0, Math.PI * 2);
          g.fill();
          g.restore();
        } else {
          text(g, "Click where it lands", 400, 60, { size: 16, color: COLORS.inkDim, align: "center" });
        }
        frameId = requestAnimationFrame(frame);
      };
      frameId = requestAnimationFrame(frame);
    });
  },

  async reveal(ctx, piece, result) {
    const { clickX } = result.detail;
    const g = ctx.stage.g;
    ctx.stage.clear();
    drawField(g, piece);
    const steps = piece.variant === "friday" ? 240 : 60;
    g.save();
    g.strokeStyle = COLORS.inkDim;
    g.lineWidth = 2;
    g.setLineDash([2, 8]);
    g.lineCap = "round";
    g.beginPath();
    for (let s = 0; s <= steps; s++) {
      const { x, y } = ballAt(piece, (s / steps) * piece.T);
      s === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
    g.restore();

    g.fillStyle = COLORS.truth;
    g.beginPath();
    g.arc(piece.landingX, GROUND, 5, 0, Math.PI * 2);
    g.fill();
    line(g, piece.landingX, GROUND - 22, piece.landingX, GROUND - 8, COLORS.truth, 2);

    g.fillStyle = COLORS.signal;
    g.beginPath();
    g.arc(clickX, GROUND, 5, 0, Math.PI * 2);
    g.fill();
    line(g, clickX, GROUND - 22, clickX, GROUND - 8, COLORS.signal, 2);

    bracket(g, clickX, piece.landingX, GROUND + 30, `${Math.round(result.rawError)} px`, COLORS.ink);
    if (piece.variant === "friday")
      text(g, `${piece.bounces} ricochet${piece.bounces === 1 ? "" : "s"}`, 34, 42, {
        size: 15,
        color: COLORS.inkDim,
      });
    await delay(1800);
  },
};
