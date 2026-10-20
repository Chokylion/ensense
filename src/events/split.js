// SPLIT (✂️): mark the point a given fraction/percent along a line from one
// end. Friday uses improper fractions (>1), so the mark goes past the line.
import { COLORS, text, line, tick, bracket, raf, delay, clamp } from "../engine.js";

const LEFT = 100;
const RIGHT = 700;
const MID_Y = 250;
const SPAN = RIGHT - LEFT;
const FRIDAY_LEFT = 400 - 320 / 2; // 240
const FRIDAY_RIGHT = 400 + 320 / 2; // 560
const FRIDAY_MARK_LO = 40;
const FRIDAY_MARK_HI = 760;
const MAX_DEN = 15;
const MIN_FRAC = 0.15;
const MAX_FRAC = 0.85;
const PERCENT_CHANCE = 0.25;
const PCT_LO = 15;
const PCT_HI = 85;

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

// Reduced proper fractions in a reasonable range (normal variant pool).
function buildFractions() {
  const out = [];
  for (let den = 3; den <= MAX_DEN; den++) {
    for (let num = 1; num < den; num++) {
      if (gcd(num, den) !== 1 || num * 2 === den) continue;
      const v = num / den;
      if (v < MIN_FRAC || v > MAX_FRAC) continue;
      out.push([num, den]);
    }
  }
  return out;
}
const FRACTIONS = buildFractions();
const FRIDAY_FRACTIONS = [
  [6, 5],
  [5, 4],
  [9, 7],
  [4, 3],
  [11, 8],
  [7, 5],
  [3, 2],
  [8, 5],
];

const fromLabel = (p) => (p.fromLeft ? "left" : "right");
const amountLabel = (p) => (p.mode === "percent" ? `${p.num}%` : `${p.num}/${p.den}`);

function drawBase(stage, piece) {
  const g = stage.g;
  stage.clear();
  g.save();
  g.strokeStyle = COLORS.ink;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(piece.x1, MID_Y);
  g.lineTo(piece.x2, MID_Y);
  g.stroke();
  g.restore();
  tick(g, piece.x1, MID_Y, 18, COLORS.ink, 3);
  tick(g, piece.x2, MID_Y, 18, COLORS.ink, 3);
  text(g, `${amountLabel(piece)} from the ${fromLabel(piece)} end`, 400, 130, {
    size: 22,
    color: COLORS.inkDim,
    align: "center",
  });
}

export const split = {
  id: "split",
  instruction: (p) =>
    p.variant === "friday"
      ? `Mark the exact point ${amountLabel(p)} of the way from the ${fromLabel(p)} end. That is more than the whole line, so keep going off the end of it. Releasing locks it in.`
      : `Mark the exact point ${amountLabel(p)} of the way from the ${fromLabel(p)} end. Releasing locks it in.`,

  generate(rng, variant) {
    const friday = variant === "friday";
    const roll = rng.next();
    const percent = !friday && roll < PERCENT_CHANCE;
    let num, den;
    if (percent) {
      den = 100;
      const f = rng.int(PCT_LO, PCT_HI - 1);
      num = f >= 50 ? f + 1 : f; // never exactly 50%
    } else {
      [num, den] = rng.pick(friday ? FRIDAY_FRACTIONS : FRACTIONS);
    }
    const fromLeft = rng.bool();
    const frac = num / den;
    const left = friday ? FRIDAY_LEFT : LEFT;
    const right = friday ? FRIDAY_RIGHT : RIGHT;
    const span = right - left;
    const targetX = fromLeft ? left + frac * span : right - frac * span;
    return { variant, mode: percent ? "percent" : "fraction", num, den, fromLeft, x1: left, x2: right, targetX };
  },

  run(ctx, piece) {
    return new Promise((resolve) => {
      const { stage } = ctx;
      const canvas = stage.canvas;
      const friday = piece.variant === "friday";
      const span = piece.x2 - piece.x1;
      const lo = friday ? FRIDAY_MARK_LO : piece.x1;
      const hi = friday ? FRIDAY_MARK_HI : piece.x2;
      let done = false;
      let dragging = false;
      let pid = -1;
      let markX = null;

      const render = () => {
        drawBase(stage, piece);
        const g = stage.g;
        if (markX !== null) {
          const base = piece.fromLeft ? piece.x1 : piece.x2;
          g.save();
          g.fillStyle = COLORS.signal;
          g.globalAlpha = 0.5;
          g.fillRect(Math.min(base, markX), MID_Y - 5, Math.abs(markX - base), 10);
          g.restore();
          g.save();
          g.globalAlpha = dragging ? 1 : 0.8;
          tick(g, markX, MID_Y, dragging ? 34 : 26, COLORS.signal, dragging ? 2.5 : 1.5);
          g.restore();
        }
        text(g, dragging ? "release to lock" : "press, slide, release to lock", 400, 380, {
          size: 13,
          color: COLORS.inkDim,
          align: "center",
        });
      };

      const finish = (x) => {
        done = true;
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onCancel);
        const v = clamp(x, lo, hi);
        const err = Math.abs(v - piece.targetX) / span;
        resolve({ rawError: err, human: `${(err * 100).toFixed(1)}% off the mark`, detail: { clickX: v } });
      };

      const onMove = (e) => {
        if (done || (dragging && e.pointerId !== pid)) return;
        markX = clamp(stage.toLogical(e).x, lo, hi);
        render();
      };
      const onDown = (e) => {
        if (done || dragging) return;
        dragging = true;
        pid = e.pointerId;
        canvas.setPointerCapture(e.pointerId);
        markX = clamp(stage.toLogical(e).x, lo, hi);
        render();
      };
      const onUp = (e) => {
        if (done || !dragging || e.pointerId !== pid) return;
        finish(stage.toLogical(e).x);
      };
      const onCancel = (e) => {
        if (done || !dragging || e.pointerId !== pid) return;
        dragging = false;
        pid = -1;
        render();
      };

      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onCancel);
      render();
    });
  },

  async reveal(ctx, piece, result) {
    const { clickX } = result.detail;
    const g = ctx.stage.g;
    const friday = piece.variant === "friday";
    drawBase(ctx.stage, piece);
    tick(g, clickX, MID_Y, 30, COLORS.signal, 2.5);
    tick(g, piece.targetX, MID_Y, 42, COLORS.truth, 2.5);
    bracket(g, clickX, piece.targetX, MID_Y - 46, `${(result.rawError * 100).toFixed(1)}%`, COLORS.ink);

    const rulerY = 350;
    const span = piece.x2 - piece.x1;
    const dir = piece.fromLeft ? 1 : -1;
    const base = piece.fromLeft ? piece.x1 : piece.x2;
    const denom = piece.mode === "percent" ? 10 : piece.den;
    const ticks = piece.mode === "percent" ? 10 : Math.max(piece.den, piece.num);
    const endX = base + dir * (ticks / denom) * span;
    line(g, Math.min(base, endX), rulerY, Math.max(base, endX), rulerY, COLORS.faint, 2);

    const fillW = (piece.num / piece.den) * span;
    const fillStart = piece.fromLeft ? base : base - fillW;
    g.save();
    g.fillStyle = COLORS.truth;
    g.globalAlpha = 0.22;
    g.fillRect(fillStart, rulerY - 7, fillW, 14);
    g.restore();
    for (let k = 0; k <= ticks; k++) tick(g, base + dir * (k / denom) * span, rulerY, 16, COLORS.inkDim, 1.5);
    if (friday) {
      tick(g, base + dir * span, rulerY, 28, COLORS.ink, 2.5);
      text(g, "1", base + dir * span, rulerY + 34, { size: 14, color: COLORS.ink, align: "center" });
    }
    text(g, amountLabel(piece), fillStart + fillW / 2, friday ? rulerY - 20 : rulerY + 34, {
      size: 15,
      color: COLORS.truth,
      align: "center",
    });
    await delay(2200);
  },
};
