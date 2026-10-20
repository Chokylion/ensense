// Puzzle identity (date -> number/variant), event metadata, scoring and share.

const EPOCH = { y: 2026, m: 7, d: 18 }; // puzzle #1
const FRIDAY_FROM_PUZZLE = 14; // "joker" Fridays begin at this puzzle number
const FRIDAY_DOW = 5; // UTC day-of-week for Friday
const EPOCH_UTC = Date.UTC(EPOCH.y, EPOCH.m - 1, EPOCH.d);
const DAY_MS = 86400000;

export const JOKER = "🃏";

// Fixed play order. Radar + share use this ordering.
export const EVENT_ORDER = ["count", "predict", "level", "tempo", "split"];

export const EVENT_META = {
  count: { emoji: "🔢", name: "Count" },
  predict: { emoji: "🎯", name: "Track" },
  level: { emoji: "📐", name: "Angle" },
  tempo: { emoji: "🥁", name: "Tempo" },
  split: { emoji: "✂️", name: "Split" },
};

// Gaussian tolerance per event. Larger error relative to sigma -> lower score.
const SIGMA = {
  count: { sigma: 0.2, friday: 0.32 },
  predict: { sigma: 60, friday: 90 },
  level: { sigma: 8, friday: 14 },
  tempo: { sigma: 60, friday: 85 },
  split: { sigma: 0.05, friday: 0.1 },
};

function parseUTC(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function puzzleNo(dateStr) {
  return Math.round((parseUTC(dateStr) - EPOCH_UTC) / DAY_MS) + 1;
}

export function computeVariant(dateStr) {
  if (new Date(parseUTC(dateStr)).getUTCDay() !== FRIDAY_DOW) return "normal";
  return puzzleNo(dateStr) >= FRIDAY_FROM_PUZZLE ? "friday" : "normal";
}

// Local YYYY-MM-DD for a Date (defaults to today).
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function nextDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d + 1);
}

// Date object for puzzle number n (local time).
export function puzzleDate(n) {
  return new Date(EPOCH.y, EPOCH.m - 1, EPOCH.d + (n - 1));
}

export function badge(no, variant) {
  return variant === "friday" ? `#${no} ${JOKER}` : `#${no}`;
}

export function sigmaFor(id, variant = "normal") {
  const s = SIGMA[id];
  return variant === "friday" ? s.friday : s.sigma;
}

// Map a raw error (in each event's native units) to a 0-100 score.
export function scoreFor(rawError, sigma) {
  return Math.round(100 * Math.exp(-0.5 * (rawError / sigma) ** 2));
}

export function gradeFor(score) {
  if (score >= 95) return "S";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function mean(nums) {
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

const SHARE_URL = "";

export function shareText(no, scores, variant = "normal") {
  const avg = mean(EVENT_ORDER.map((id) => scores[id]));
  const line = EVENT_ORDER.map((id) => `${EVENT_META[id].emoji} ${scores[id]}`).join("  ");
  const joker = variant === "friday" ? ` ${JOKER}` : "";
  return `Ensense #${no}${joker} - ${gradeFor(avg)} (${avg})\n${line}\n${SHARE_URL}`;
}
