// LEVEL / ANGLE (📐): drag a handle to a target angle CCW from horizontal.
// Friday: target can exceed a full turn (400-1040 deg); a spiral shows winding.
import { COLORS, DEG, text, raf, delay, clamp } from "../engine.js";

const CX = 400;
const CY = 250;
const LINE_LEN = 185;
const FRAME = 450;
const HANDLE_R = 9;
const GRAB_R = 60;
const HORIZ_LEN = 230;
const SPIRAL_STEP = 20;

const norm360 = (a) => ((a % 360) + 360) % 360;
const angularDist = (a, b) => {
  const d = norm360(a - b);
  return Math.min(d, 360 - d);
};
const wrap180 = (a) => ((a + 540) % 360) - 180;
const cosD = (a) => Math.cos(a * DEG);
const nsinD = (a) => -Math.sin(a * DEG); // screen Y grows downward

const targetLabel = (p) => `${p.targetAngle}° counterclockwise`;

function fmtTurns(a) {
  const sign = a < 0 ? "-" : "";
  const n = Math.abs(a);
  const turns = Math.floor(n / 360);
  const rem = n - turns * 360;
  return turns === 0
    ? `${sign}${rem.toFixed(0)}°`
    : `${sign}${turns} turn${turns === 1 ? "" : "s"} + ${rem.toFixed(0)}°`;
}

function drawLine(g, angle, color, width) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(CX, CY);
  g.lineTo(CX + cosD(angle) * LINE_LEN, CY + nsinD(angle) * LINE_LEN);
  g.stroke();
  g.restore();
}

// Small arc indicator for sub-360 angles.
function drawArc(g, angle, radius, color, alpha) {
  if (angle < 1) return;
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(CX, CY, radius, 0, -angle * DEG, true);
  g.stroke();
  g.restore();
}

// Spiral for angles past a full turn (Friday).
function drawSpiral(g, angle, r0, color, alpha, width) {
  if (angle <= 0) return;
  const steps = clamp(Math.round(angle / 3), 24, 1500);
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  for (let s = 0; s <= steps; s++) {
    const a = (angle * s) / steps;
    const r = r0 + SPIRAL_STEP * (a / 360);
    const x = CX + Math.cos(a * DEG) * r;
    const y = CY - Math.sin(a * DEG) * r;
    s === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.stroke();
  g.restore();
}

function spiralLabelPos(angle, r0) {
  const r = r0 + SPIRAL_STEP * (angle / 360) + 18;
  return { x: CX + Math.cos(angle * DEG) * r, y: CY - Math.sin(angle * DEG) * r };
}

// Little CCW arrow hint near the line.
function drawArrowHint(g) {
  const r = LINE_LEN + 28;
  const end = 38 * DEG;
  g.save();
  g.strokeStyle = COLORS.inkDim;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(CX, CY, r, -6 * DEG, -end, true);
  g.stroke();
  const ax = CX + Math.cos(end) * r;
  const ay = CY - Math.sin(end) * r;
  const tx = -Math.sin(end);
  const ty = -Math.cos(end);
  g.fillStyle = COLORS.inkDim;
  g.beginPath();
  g.moveTo(ax + tx * 9, ay + ty * 9);
  g.lineTo(ax - tx * 3 - ty * 5, ay - ty * 3 + tx * 5);
  g.lineTo(ax - tx * 3 + ty * 5, ay - ty * 3 - tx * 5);
  g.closePath();
  g.fill();
  g.restore();
}

function drawScene(stage, piece, angle, frameAlpha, showTruth) {
  const g = stage.g;
  stage.clear();
  const fi = piece.frameAngle * DEG;
  if (frameAlpha > 0) {
    g.save();
    g.globalAlpha = frameAlpha;
    g.strokeStyle = COLORS.ghost;
    g.lineWidth = 1.5;
    for (const off of piece.stripeOffsets) {
      const mx = CX - Math.sin(fi) * off;
      const my = CY + Math.cos(fi) * off;
      g.beginPath();
      g.moveTo(mx - Math.cos(fi) * 600, my - Math.sin(fi) * 600);
      g.lineTo(mx + Math.cos(fi) * 600, my + Math.sin(fi) * 600);
      g.stroke();
    }
    g.strokeStyle = COLORS.faint;
    g.lineWidth = 1.5;
    g.translate(CX, CY);
    g.rotate(fi);
    g.strokeRect(-FRAME / 2, -FRAME / 2, FRAME, FRAME);
    g.restore();
  }
  g.save();
  g.strokeStyle = COLORS.inkDim;
  g.lineWidth = 1.5;
  g.setLineDash([6, 6]);
  g.beginPath();
  g.moveTo(CX, CY);
  g.lineTo(CX + HORIZ_LEN, CY);
  g.stroke();
  g.restore();
  text(g, "horizontal", CX + HORIZ_LEN + 8, CY + 4, { size: 11, color: COLORS.inkDim });

  const friday = piece.variant === "friday";
  if (showTruth) {
    if (friday) {
      drawSpiral(g, piece.targetAngle, 46, COLORS.truth, 0.9, 2);
      const p = spiralLabelPos(piece.targetAngle, 46);
      text(g, `${piece.targetAngle}°`, p.x, p.y + 4, { size: 14, color: COLORS.truth, align: "center" });
    } else {
      drawArc(g, piece.targetAngle, 60, COLORS.truth, 0.9);
      const l = (-piece.targetAngle / 2) * DEG;
      text(g, `${piece.targetAngle}°`, CX + Math.cos(l) * 84, CY + Math.sin(l) * 84 + 4, {
        size: 14,
        color: COLORS.truth,
        align: "center",
      });
    }
    drawLine(g, piece.targetAngle, COLORS.truth, 2);
  }
  friday ? drawSpiral(g, angle, 34, COLORS.signal, 0.85, 2.5) : drawArc(g, angle, 42, COLORS.signal, 0.8);
  drawLine(g, angle, COLORS.signal, 4);
  g.fillStyle = COLORS.inkDim;
  g.beginPath();
  g.arc(CX, CY, 2.5, 0, Math.PI * 2);
  g.fill();
}

export const level = {
  id: "level",
  instruction: (p) =>
    p.variant === "friday"
      ? `Drag the handle to exactly ${p.targetAngle}° counterclockwise from the dashed horizontal. Yes, that is past a full turn: keep winding, and watch the spiral to know how far you have gone. Releasing locks it in.`
      : `Drag the handle to swing the line to exactly ${p.targetAngle}° counterclockwise from the dashed horizontal. Releasing locks it in.`,

  generate(rng, variant) {
    const targetAngle = variant === "friday" ? rng.int(400, 1040) : rng.int(5, 355);
    const frameAngle = rng.sign() * rng.range(8, 15);
    const stripeCount = rng.int(2, 3);
    const stripeOffsets = Array.from({ length: stripeCount }, () => rng.range(-190, 190));
    return { variant, targetAngle, frameAngle, stripeOffsets };
  },

  run(ctx, piece) {
    return new Promise((resolve) => {
      const { stage } = ctx;
      const canvas = stage.canvas;
      const friday = piece.variant === "friday";
      let angle = 0; // accumulated (can exceed 360 on Friday)
      let lastPointer = 0;
      let dragging = false;
      let interacted = false;
      let locked = false;

      const handlePos = () => ({
        x: CX + cosD(angle) * LINE_LEN,
        y: CY + nsinD(angle) * LINE_LEN,
      });
      const nearHandle = (p) => {
        const h = handlePos();
        return Math.hypot(p.x - h.x, p.y - h.y) <= GRAB_R;
      };
      const pointerAngle = (p) => norm360(Math.atan2(-(p.y - CY), p.x - CX) / DEG);
      const display = () => (friday ? angle : norm360(angle));

      const render = (active) => {
        drawScene(stage, piece, display(), 1, false);
        const g = stage.g;
        if (!interacted) drawArrowHint(g);
        const h = handlePos();
        g.save();
        g.fillStyle = COLORS.bg;
        g.strokeStyle = COLORS.signal;
        g.lineWidth = dragging || active ? 3 : 2;
        g.beginPath();
        g.arc(h.x, h.y, HANDLE_R, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.restore();
        text(g, `match ${targetLabel(piece)}`, 400, 44, { size: 20, align: "center" });
        text(g, "drag the handle, release to lock", 400, 68, { size: 13, color: COLORS.inkDim, align: "center" });
      };

      const onDown = (e) => {
        if (locked || dragging) return;
        const p = stage.toLogical(e);
        if (!nearHandle(p)) return;
        dragging = true;
        interacted = true;
        lastPointer = pointerAngle(p);
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = "grabbing";
        render(true);
      };
      const onMove = (e) => {
        if (locked) return;
        const p = stage.toLogical(e);
        if (dragging) {
          const a = pointerAngle(p);
          angle += wrap180(a - lastPointer);
          lastPointer = a;
          render(true);
        } else {
          const near = nearHandle(p);
          canvas.style.cursor = near ? "grab" : "";
          render(near);
        }
      };
      const onUp = () => {
        if (locked || !dragging) return;
        locked = true;
        canvas.style.cursor = "";
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onUp);
        const finalAngle = display();
        const err = friday
          ? Math.abs(finalAngle - piece.targetAngle)
          : angularDist(finalAngle, piece.targetAngle);
        resolve({
          rawError: err,
          human: `${err.toFixed(1)}° off target`,
          detail: { finalAngle },
        });
      };

      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);
      render(false);
    });
  },

  async reveal(ctx, piece, result) {
    const { finalAngle } = result.detail;
    const friday = piece.variant === "friday";
    const dur = ctx.reducedMotion ? 0 : 600;
    const t0 = performance.now();
    for (;;) {
      const t = performance.now() - t0;
      const frameAlpha = dur === 0 ? 0 : Math.max(0, 1 - t / dur);
      drawScene(ctx.stage, piece, finalAngle, frameAlpha, true);
      const g = ctx.stage.g;
      if (friday) {
        text(g, `target ${targetLabel(piece)} · ${fmtTurns(piece.targetAngle)}`, 400, 452, {
          size: 18,
          color: COLORS.truth,
          align: "center",
        });
        text(g, `you wound ${fmtTurns(finalAngle)}`, 400, 478, { size: 15, color: COLORS.signal, align: "center" });
      } else {
        text(g, `target ${targetLabel(piece)}`, 400, 472, { size: 18, color: COLORS.truth, align: "center" });
      }
      text(
        g,
        `${result.rawError.toFixed(1)}°`,
        clamp(CX + cosD(finalAngle) * (LINE_LEN + 30), 40, 760),
        clamp(CY + nsinD(finalAngle) * (LINE_LEN + 30), 62, 452),
        { size: 20, color: COLORS.signal, align: "center" }
      );
      if (frameAlpha === 0) break;
      await raf();
    }
    await delay(1600);
  },
};
