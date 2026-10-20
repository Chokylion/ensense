// TEMPO (🥁): tap along with 4 on-beats; when clicks stop, keep the pulse for
// 8 more beats. Friday: tap the quiet OFF-beats landing in the gaps.
import { COLORS, text, line, tick, raf, delay, clamp } from "../engine.js";

const ON_BEATS = 4;
const OFF_BEATS = 8;
const SCHEDULE_AHEAD = 400; // ms lookahead for scheduling clicks
const OFF_SCHEDULE_AHEAD = 120;

const offPhase = (variant) => (variant === "friday" ? 0.5 : 1);

// Score the 8 continuation taps: anchor off the on-beat taps, measure drift
// (systematic rush/drag), jitter (spread) and any whole-beat slip.
function evaluate(onTaps, beats, offTaps, T, phase) {
  const lastBeat = beats[beats.length - 1];
  let anchor = lastBeat;
  if (onTaps.length > 0) {
    const offs = onTaps.map((t) => {
      let best = Infinity;
      for (const b of beats) {
        const d = t - b;
        if (Math.abs(d) < Math.abs(best)) best = d;
      }
      return best;
    });
    anchor = lastBeat + offs.reduce((a, b) => a + b, 0) / offs.length;
  }
  const resid = offTaps.map((t, i) => t - (anchor + (i + phase) * T));
  const mean = resid.reduce((a, b) => a + b, 0) / resid.length;
  const slip = Math.round(mean / T);
  const adj = resid.map((r) => r - slip * T);
  const drift0 = mean - slip * T;
  const drift = Math.abs(drift0);
  const jitter = Math.sqrt(adj.reduce((a, b) => a + (b - drift0) ** 2, 0) / adj.length);
  return { e: 0.6 * drift + 0.4 * jitter, drift, jitter, mean: drift0, a: adj, slip };
}

function fmtSlip(slip) {
  if (slip === 0) return null;
  const n = Math.abs(slip);
  return `${n} beat${n === 1 ? "" : "s"} ${slip > 0 ? "late" : "early"}`;
}

function humanLine(s) {
  const parts = [
    s.drift < 1 ? "on tempo" : `${s.mean < 0 ? "rushed" : "dragged"} ${s.drift.toFixed(0)} ms/beat`,
    `±${s.jitter.toFixed(0)} ms`,
  ];
  const slip = fmtSlip(s.slip);
  if (slip) parts.push(`in ${slip}`);
  return parts.join(" · ");
}

// A short percussive click at scheduled audio time.
function click(audio, when, freq = 1000, gain = 0.5) {
  const osc = audio.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const g = audio.createGain();
  g.gain.setValueAtTime(1e-4, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.003);
  g.gain.exponentialRampToValueAtTime(1e-4, when + 0.03);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(when);
  osc.stop(when + 0.05);
}

export const tempo = {
  id: "tempo",
  instruction: (p) =>
    p.variant === "friday"
      ? "Tap along with the loud clicks. After 4 on-beat taps it stops. Then keep the pulse going on the quiet ticks in between: 8 off-beats, landing squarely in the gaps."
      : "Tap along with the beat. After 4 on-beat taps it stops. Keep tapping, 8 more beats.",

  generate(rng, variant) {
    const bpm = rng.int(75, 130);
    return { variant, bpm, T: 60000 / bpm };
  },

  run(ctx, piece) {
    return new Promise((resolve) => {
      const { stage } = ctx;
      const g = stage.g;
      const audio = ctx.audio();
      const start = performance.now() + 900;
      const tapWindow = piece.T / 3;
      const friday = piece.variant === "friday";
      const phase = offPhase(piece.variant);
      const beats = [];
      const offSched = [];
      let nextBeat = start;
      let nextOff = start + piece.T / 2;
      let stopped = false;
      let cutoff = Infinity;
      const onTaps = [];
      const offTaps = [];
      let lastTap = -Infinity;
      let frameId = 0;
      let done = false;

      const finish = () => {
        done = true;
        cancelAnimationFrame(frameId);
        stage.canvas.removeEventListener("pointerdown", onTap);
        globalThis.removeEventListener("keydown", onKey);
        const s = evaluate(onTaps, beats, offTaps, piece.T, phase);
        resolve({ rawError: s.e, human: humanLine(s), detail: s });
      };

      const tap = () => {
        if (done) return;
        const now = performance.now();
        lastTap = now;
        if (now < cutoff) {
          if (!beats.some((b) => Math.abs(now - b) <= tapWindow)) return;
          onTaps.push(now);
          if (!stopped && onTaps.length >= ON_BEATS) {
            stopped = true;
            cutoff = beats[beats.length - 1] + (friday ? piece.T / 4 : piece.T / 2);
          }
          return;
        }
        offTaps.push(now);
        if (offTaps.length >= OFF_BEATS) finish();
      };
      const onTap = () => tap();
      const onKey = (e) => {
        if (e.code !== "Space" || e.repeat) return;
        e.preventDefault();
        tap();
      };
      stage.canvas.addEventListener("pointerdown", onTap);
      globalThis.addEventListener("keydown", onKey);

      const frame = () => {
        if (done) return;
        const now = performance.now();
        while (!stopped && nextBeat - now < SCHEDULE_AHEAD) {
          beats.push(nextBeat);
          if (audio) click(audio, audio.currentTime + (nextBeat - now) / 1000);
          nextBeat += piece.T;
        }
        while (friday && !stopped && nextOff - now < OFF_SCHEDULE_AHEAD) {
          if (nextOff > now) {
            offSched.push(nextOff);
            if (audio) click(audio, audio.currentTime + (nextOff - now) / 1000, 660, 0.22);
          }
          nextOff += piece.T;
        }

        stage.clear();
        if (now < cutoff) {
          let pulse = 0.15;
          for (let i = beats.length - 1; i >= 0; i--) {
            if (beats[i] <= now) {
              pulse = Math.max(0.15, 1 - (now - beats[i]) / (piece.T * 0.6));
              break;
            }
          }
          g.save();
          g.globalAlpha = pulse;
          g.strokeStyle = COLORS.ink;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(400, 230, 64, 0, Math.PI * 2);
          g.stroke();
          g.restore();
          if (friday) {
            let ghost = 0;
            for (let i = offSched.length - 1; i >= 0; i--) {
              if (offSched[i] <= now) {
                ghost = Math.max(0, 0.5 - (now - offSched[i]) / (piece.T * 0.5));
                break;
              }
            }
            if (ghost > 0) {
              g.save();
              g.globalAlpha = ghost;
              g.strokeStyle = COLORS.ink;
              g.lineWidth = 2;
              g.setLineDash([4, 6]);
              g.beginPath();
              g.arc(400, 230, 34, 0, Math.PI * 2);
              g.stroke();
              g.restore();
            }
          }
          for (let i = 0; i < ON_BEATS; i++) {
            const dx = 400 - ((ON_BEATS - 1) * 28) / 2 + i * 28;
            g.save();
            g.beginPath();
            g.arc(dx, 330, 6, 0, Math.PI * 2);
            if (i < Math.min(onTaps.length, ON_BEATS)) {
              g.fillStyle = COLORS.signal;
              g.fill();
            } else {
              g.strokeStyle = COLORS.faint;
              g.lineWidth = 2;
              g.stroke();
            }
            g.restore();
          }
          const ready = friday ? "tap along with the loud clicks" : "tap along with the beat";
          text(g, now < start ? "get ready" : ready, 400, 380, { size: 16, color: COLORS.inkDim, align: "center" });
          text(
            g,
            friday
              ? "when they stop, tap the quiet off-beats · 8 of them"
              : "when the clicks stop, keep the beat going for 8 more taps",
            400,
            406,
            { size: 13, color: COLORS.inkDim, align: "center" }
          );
        } else {
          g.save();
          g.globalAlpha = 0.1;
          g.strokeStyle = COLORS.ink;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(400, 230, 64, 0, Math.PI * 2);
          g.stroke();
          g.restore();
          text(g, friday ? "tap the off-beats" : "keep the beat going", 400, 380, {
            size: 16,
            color: COLORS.inkDim,
            align: "center",
          });
          text(g, `${OFF_BEATS - offTaps.length} left`, 770, 42, { size: 14, color: COLORS.inkDim, align: "right" });
        }
        const sinceTap = now - lastTap;
        if (sinceTap < 150) {
          g.save();
          g.globalAlpha = 1 - sinceTap / 150;
          g.fillStyle = COLORS.signal;
          g.beginPath();
          g.arc(400, 230, 8, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
        frameId = requestAnimationFrame(frame);
      };
      frameId = requestAnimationFrame(frame);
    });
  },

  async reveal(ctx, piece, result) {
    const s = result.detail;
    const g = ctx.stage.g;
    ctx.stage.clear();
    const midY = 235;
    const startX = 130;
    const gap = 540 / 7;
    line(g, 90, midY, 710, midY, COLORS.faint, 1);
    text(g, "early", 84, midY - 30, { size: 12, color: COLORS.inkDim, align: "right" });
    text(g, "late", 84, midY + 36, { size: 12, color: COLORS.inkDim, align: "right" });
    if (piece.variant === "friday") {
      for (let d = 0; d <= s.a.length; d++) tick(g, startX + (d - 0.5) * gap, midY, 10, COLORS.faint, 2);
      text(g, "off-beats", 84, midY + 4, { size: 12, color: COLORS.inkDim, align: "right" });
    }
    for (let d = 0; d < s.a.length; d++) {
      const hx = startX + d * gap;
      tick(g, hx, midY, 16, COLORS.ink, 2);
      const dx = clamp((s.a[d] / piece.T) * gap, -gap * 0.55, gap * 0.55);
      const y = s.a[d] <= 0 ? midY - 26 : midY + 26;
      g.fillStyle = COLORS.signal;
      g.beginPath();
      g.arc(hx + dx, y, 5, 0, Math.PI * 2);
      g.fill();
    }
    text(g, `drift ${s.drift.toFixed(0)} ms · jitter ${s.jitter.toFixed(0)} ms`, 400, 340, { size: 21, align: "center" });
    const summary = s.drift < 1 ? "Right on tempo." : `You ${s.mean < 0 ? "rushed" : "dragged"} by ${s.drift.toFixed(0)} ms/beat.`;
    text(g, summary, 400, 374, { size: 16, color: COLORS.inkDim, align: "center", font: "sans" });
    const slip = fmtSlip(s.slip);
    if (slip)
      text(g, `You came in ${slip}, and were scored from there.`, 400, 402, {
        size: 14,
        color: COLORS.inkDim,
        align: "center",
        font: "sans",
      });
    await delay(2400);
  },
};
