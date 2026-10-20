// Shared rendering engine: palette, fonts, logical-coordinate canvas, and
// low-level draw helpers used by every event.

export const COLORS = {
  bg: "#0C1014",
  ink: "#E6EDF3",
  inkDim: "rgba(230,237,243,0.55)",
  faint: "rgba(230,237,243,0.16)",
  ghost: "rgba(230,237,243,0.08)",
  signal: "#2ED9FF",
  truth: "#4BD88A",
};

const MONO = "ui-monospace, 'SF Mono', 'Cascadia Mono', 'JetBrains Mono', Menlo, Consolas, monospace";
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// Every event draws into a fixed 800x500 logical coordinate space; the Stage
// scales that onto the real (device-pixel-ratio aware) canvas.
export const LOGICAL_W = 800;
export const LOGICAL_H = 500;

export const DEG = Math.PI / 180;

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d");
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.g.setTransform(w / LOGICAL_W, 0, 0, h / LOGICAL_H, 0, 0);
  }

  clear() {
    const g = this.g;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.restore();
  }

  toLogical(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * LOGICAL_W,
      y: ((e.clientY - rect.top) / rect.height) * LOGICAL_H,
    };
  }
}

// text(ctx, str, x, y, { size, weight, font, color, align, baseline, alpha })
export function text(g, str, x, y, o = {}) {
  g.save();
  g.font = `${o.weight ?? 500} ${o.size ?? 16}px ${o.font === "sans" ? SANS : MONO}`;
  g.fillStyle = o.color ?? COLORS.ink;
  g.textAlign = o.align ?? "left";
  g.textBaseline = o.baseline ?? "alphabetic";
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  g.fillText(str, x, y);
  g.restore();
}

// line(ctx, x1, y1, x2, y2, color, width)
export function line(g, x1, y1, x2, y2, color, width = 2) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
  g.restore();
}

// tick(ctx, x, y, length, color, width): a vertical mark centered on (x, y)
export function tick(g, x, y, length, color, width = 2) {
  line(g, x, y - length / 2, x, y + length / 2, color, width);
}

// bracket(ctx, xA, xB, y, label, color): an error-span bracket with a centered label
export function bracket(g, xA, xB, y, label, color) {
  const lo = Math.min(xA, xB);
  const hi = Math.max(xA, xB);
  g.save();
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(lo, y - 7);
  g.lineTo(lo, y);
  g.lineTo(hi, y);
  g.lineTo(hi, y - 7);
  g.stroke();
  g.restore();
  text(g, label, (lo + hi) / 2, y + 17, { size: 15, color, align: "center" });
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const raf = () => new Promise((r) => requestAnimationFrame(r));
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Triangle wave: reflect v back and forth between lo and hi (used for drift/bounce).
export function pingPong(v, lo, hi) {
  const span = hi - lo;
  if (span <= 0) return lo;
  const t = (((v - lo) % (2 * span)) + 2 * span) % (2 * span);
  return lo + (t <= span ? t : 2 * span - t);
}
