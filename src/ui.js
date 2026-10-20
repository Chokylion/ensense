// DOM helpers, radar chart, results view, share + comparison stats.
import { COLORS } from "./engine.js";
import {
  EVENT_ORDER,
  EVENT_META,
  computeVariant,
  nextDay,
  shareText as buildShare,
} from "./puzzle.js";
import { submit } from "./net.js";

const screen = document.getElementById("screen");
const stageEl = document.getElementById("stage");

export function el(tag, cls = "", txt = "") {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (txt) node.textContent = txt;
  return node;
}

export function showScreen(node) {
  screen.replaceChildren(node);
  screen.hidden = false;
  stageEl.hidden = true;
}

export function showStage() {
  screen.hidden = true;
  screen.replaceChildren();
  stageEl.hidden = false;
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.hidden = true;
  }, 1600);
}

export function navRow(...buttons) {
  const row = el("div", "nav-row");
  for (const [label, action] of buttons) {
    const b = el("button", "btn", label);
    b.addEventListener("click", () => {
      b.blur();
      action();
    });
    row.append(b);
  }
  return row;
}

// Pentagon radar of the five event scores (0-100).
function radarSvg(scores) {
  const pt = (i, r) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [180 + r * Math.cos(ang), 168 + r * Math.sin(ang)];
  };
  const poly = (rf) =>
    Array.from({ length: 5 }, (_, i) => pt(i, rf(i)).map((v) => v.toFixed(1)).join(",")).join(" ");
  const grid = [0.25, 0.5, 0.75, 1]
    .map((d) => `<polygon points="${poly(() => 106 * d)}" fill="none" stroke="${COLORS.faint}" stroke-width="1"/>`)
    .join("");
  const spokes = Array.from({ length: 5 }, (_, i) => {
    const [x, y] = pt(i, 106);
    return `<line x1="180" y1="168" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${COLORS.faint}" stroke-width="1"/>`;
  }).join("");
  const labels = EVENT_ORDER.map((id, i) => {
    const [x, y] = pt(i, 130);
    const dy = i === 0 ? -2 : i === 2 || i === 3 ? 12 : 5;
    const m = EVENT_META[id];
    return `<text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="middle" font-size="12" font-family="ui-monospace, Menlo, monospace" fill="${COLORS.inkDim}">${m.emoji} ${m.name}</text>`;
  }).join("");
  const dots = Array.from({ length: 5 }, (_, i) => {
    const [x, y] = pt(i, (106 * scores[i]) / 100);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${COLORS.signal}"/>`;
  }).join("");
  const area = `<polygon points="${poly((i) => (106 * scores[i]) / 100)}" fill="${COLORS.signal}" fill-opacity="0.14" stroke="${COLORS.signal}" stroke-width="2"/>`;
  return `<svg class="radar" viewBox="0 0 360 336" role="img" aria-label="Per-event score radar">${grid}${spokes}${area}${dots}${labels}</svg>`;
}

async function copy(textStr) {
  try {
    await navigator.clipboard.writeText(textStr);
    toast("Copied");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = textStr;
    document.body.append(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast("Copied");
    } catch {
      toast("Copy failed");
    }
    ta.remove();
  }
}

async function fetchStats(res, root, line, dayWord) {
  const data = await submit(res);
  if (!data) {
    line.textContent = "no server connection · playing solo";
    return;
  }
  if (data.players < 2) {
    line.textContent =
      dayWord === "today"
        ? "you're the first player today, check back later"
        : "first recorded run for that day";
    return;
  }
  const total = data.metrics.total;
  line.textContent = `beats ${total.beats}% of ${data.players} players ${dayWord} · average ${Math.round(total.mean ?? 0)}`;
  for (const ev of res.events) {
    const m = data.metrics[ev.id];
    if (!m || m.beats === null) continue;
    const pct = root.querySelector(`.row[data-id="${ev.id}"] .pct`);
    if (pct) pct.textContent = ` · beats ${m.beats}%`;
  }
}

export function renderResults(res, opts = {}) {
  const {
    withStats = false,
    share = true,
    statsDayWord = "today",
    variant = computeVariant(res.date),
    stepLabel,
    extra,
    footer,
  } = opts;

  const root = el("div", "results");
  root.append(el("div", "step", stepLabel ?? `ENSENSE #${res.puzzle}`));

  const total = el("div", "total");
  total.append(el("span", "total-num", String(res.total)), el("span", "total-grade", res.grade));
  root.append(total);

  let statsLine = null;
  if (withStats) {
    statsLine = el("div", "stats-line", "comparing with other players…");
    root.append(statsLine);
  }

  const radarWrap = el("div", "radar-wrap");
  radarWrap.innerHTML = radarSvg(res.events.map((e) => e.score));
  root.append(radarWrap);

  const rows = el("div", "rows");
  for (const ev of res.events) {
    const meta = EVENT_META[ev.id];
    const row = el("div", "row");
    row.dataset.id = ev.id;
    const human = el("span", "human", ev.human);
    human.append(el("span", "pct"));
    row.append(
      el("span", "emoji", meta.emoji),
      el("span", "name", meta.name),
      human,
      el("span", "pts", String(ev.score)),
      el("span", "grade", ev.grade)
    );
    rows.append(row);
  }
  root.append(rows);

  if (statsLine) fetchStats(res, root, statsLine, statsDayWord);

  if (share) {
    const btn = el("button", "btn primary", "Share");
    const scores = Object.fromEntries(res.events.map((e) => [e.id, e.score]));
    btn.addEventListener("click", () => void copy(buildShare(res.puzzle, scores, variant)));
    root.append(btn);
  }

  if (extra) root.append(extra);

  if (footer !== null) {
    const f =
      footer ??
      `Come back tomorrow: #${res.puzzle + 1} on ${nextDay(res.date).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      })}`;
    root.append(el("div", "footer", f));
  }
  return root;
}
