// App orchestration: home, play-through, reveal, archive, practice, dev modes.
import { Stage, delay } from "./engine.js";
import { Rng } from "./rng.js";
import {
  EVENT_ORDER,
  EVENT_META,
  JOKER,
  badge,
  computeVariant,
  puzzleNo,
  puzzleDate,
  localDate,
  sigmaFor,
  scoreFor,
  gradeFor,
  mean,
} from "./puzzle.js";
import { count } from "./events/count.js";
import { predict } from "./events/predict.js";
import { level } from "./events/level.js";
import { tempo } from "./events/tempo.js";
import { split } from "./events/split.js";
import { el, showScreen, showStage, navRow, renderResults } from "./ui.js";
import { loadResult, saveResult } from "./net.js";

const REVEAL_HOLD = 1000;

const stage = new Stage(document.getElementById("cv"));
const hud = document.getElementById("hud");
const EVENTS = [count, predict, level, tempo, split];

// Lazily-created shared AudioContext (needs a user gesture to start).
let audioCtx = null;
function ensureAudio() {
  const Ctor = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctor) return;
  try {
    if (!audioCtx) audioCtx = new Ctor();
    audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

const ctx = {
  stage,
  hud,
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  audio: () => audioCtx,
};

// ---- URL params (dev/sharing hooks) ----
const params = new URLSearchParams(location.search);
const seedParam = params.get("seed");
const eventParam = params.get("event");
const variantParam = params.get("variant");
const replayMode = params.get("replay") === "1";
const variantOverride = variantParam === "friday" || variantParam === "normal" ? variantParam : null;

const today = localDate();
const todayPuzzle = puzzleNo(today);
const dayVariant = (date) => variantOverride ?? computeVariant(date);
const todayVariant = dayVariant(today);

const setHeader = (txt) => {
  document.getElementById("hdr-no").textContent = txt;
};
setHeader(badge(todayPuzzle, todayVariant));

function introCard(event, piece, step) {
  return new Promise((resolve) => {
    const meta = EVENT_META[event.id];
    const card = el("div", "card");
    card.append(el("div", "step", step), el("div", "tag", `${meta.emoji} ${meta.name}`), el("p", "", event.instruction(piece)));
    const btn = el("button", "btn primary", "Ready");
    btn.addEventListener("click", () => {
      ensureAudio();
      btn.blur();
      resolve();
    });
    card.append(btn);
    showScreen(card);
    btn.focus();
  });
}

function showChip(score, human) {
  const chip = el("div", "chip");
  chip.append(el("b", "", String(score)), document.createTextNode(` pts · ${human}`));
  hud.append(chip);
}
function hideChip() {
  hud.querySelector(".chip")?.remove();
}

async function runEvent(event, piece, step, variant) {
  await introCard(event, piece, step);
  showStage();
  stage.clear();
  const result = await event.run(ctx, piece);
  const score = scoreFor(result.rawError, sigmaFor(event.id, variant));
  showChip(score, result.human);
  await event.reveal(ctx, piece, result);
  await delay(REVEAL_HOLD);
  hideChip();
  return { id: event.id, score, grade: gradeFor(score), human: result.human };
}

async function playAll(opts) {
  const rng = new Rng(opts.seed);
  const pieces = EVENTS.map((ev) => ev.generate(rng, opts.variant));
  const events = [];
  for (let i = 0; i < EVENTS.length; i++) {
    events.push(await runEvent(EVENTS[i], pieces[i], `EVENT ${i + 1} OF 5`, opts.variant));
  }
  const total = mean(events.map((e) => e.score));
  const record = { v: 1, date: opts.date, puzzle: opts.puzzle, total, grade: gradeFor(total), events };
  if (opts.record) saveResult(record);
  return record;
}

function showResults(res) {
  const isToday = res.date === today;
  const variant = dayVariant(res.date);
  setHeader(badge(res.puzzle, variant));
  showScreen(
    renderResults(res, {
      withStats: true,
      variant,
      statsDayWord: isToday ? "today" : "that day",
      extra: navRow(["Archive", showArchive], ["Keep playing", practice]),
      footer: isToday
        ? undefined
        : `from the archive · ${puzzleDate(res.puzzle).toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}`,
    })
  );
}

async function playDate(date) {
  const puzzle = puzzleNo(date);
  const saved = loadResult(date);
  if (saved && !replayMode) {
    showResults(saved);
    return;
  }
  const variant = dayVariant(date);
  setHeader(badge(puzzle, variant));
  const res = await playAll({ seed: date, date, puzzle, variant, record: true });
  showResults(res);
}

async function practice() {
  setHeader("practice");
  const seed = `free-${Math.random().toString(36).slice(2)}`;
  const res = await playAll({ seed, date: today, puzzle: todayPuzzle, variant: todayVariant, record: false });
  showScreen(
    renderResults(res, {
      withStats: false,
      share: false,
      variant: todayVariant,
      stepLabel: "PRACTICE ROUND",
      footer: "practice round · not recorded",
      extra: navRow(["Keep playing", practice], ["Archive", showArchive], ["Home", home]),
    })
  );
}

function showArchive() {
  setHeader(badge(todayPuzzle, todayVariant));
  const card = el("div", "card archive");
  card.append(el("div", "step", "ARCHIVE"));
  const list = el("div", "arch-list");
  for (let n = todayPuzzle; n >= 1; n--) {
    const date = localDate(puzzleDate(n));
    const saved = loadResult(date);
    const row = el("button", "arch-row");
    const joker = computeVariant(date) === "friday" ? ` ${JOKER}` : "";
    const label = puzzleDate(n).toLocaleDateString(undefined, { month: "short", day: "numeric" }) + joker;
    row.append(
      el("span", "arch-no", `#${n}`),
      el("span", "arch-date", n === todayPuzzle ? `${label} · today` : label),
      el("span", "arch-score", saved ? `${saved.total} ${saved.grade}` : "play ▸")
    );
    row.addEventListener("click", () => {
      row.blur();
      playDate(date);
    });
    list.append(row);
  }
  card.append(list, navRow(["Back", home]));
  showScreen(card);
}

function home() {
  setHeader(badge(todayPuzzle, todayVariant));
  const saved = loadResult(today);
  if (saved && !replayMode && seedParam === null) {
    showResults(saved);
    return;
  }
  homeCard();
}

function homeCard() {
  const card = el("div", "card");
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  card.append(
    el("div", "wordmark", "ENSENSE"),
    el("div", "step", `#${todayPuzzle} · ${dateLabel}`),
    el("div", "emoji-row", EVENT_ORDER.map((id) => EVENT_META[id].emoji).join(" ")),
    el("p", "", "Five tiny tests of perceptual instinct. Two minutes. One score.")
  );
  const btn = el("button", "btn primary", "Play");
  btn.addEventListener("click", () => {
    ensureAudio();
    btn.blur();
    if (seedParam !== null) {
      (async () => {
        const res = await playAll({
          seed: seedParam,
          date: today,
          puzzle: todayPuzzle,
          variant: todayVariant,
          record: false,
        });
        showScreen(
          renderResults(res, {
            withStats: false,
            share: false,
            variant: todayVariant,
            stepLabel: `DEV SEED: ${seedParam}`,
            footer: "dev seed · not recorded",
            extra: navRow(["Home", home]),
          })
        );
      })();
    } else {
      playDate(today);
    }
  });
  card.append(btn);
  card.append(navRow(["Archive", showArchive], ["Keep playing", practice]));
  if (seedParam !== null) card.append(el("div", "step", `DEV SEED: ${seedParam} (not recorded)`));
  showScreen(card);
  btn.focus();
}

async function devEvent(event) {
  const variant = variantOverride ?? "normal";
  for (;;) {
    const rng = new Rng(`dev-${Math.random().toString(36).slice(2)}`);
    const piece = event.generate(rng, variant);
    const result = await runEvent(event, piece, "DEV MODE · SINGLE EVENT", variant);
    const card = el("div", "card");
    card.append(
      el("div", "step", "DEV MODE"),
      el("div", "tag", `${EVENT_META[event.id].emoji} ${result.score} pts (${result.grade})`),
      el("p", "", result.human)
    );
    const btn = el("button", "btn primary", "Run again");
    card.append(btn);
    showScreen(card);
    await new Promise((r) =>
      btn.addEventListener("click", () => {
        btn.blur();
        r();
      })
    );
  }
}

function boot() {
  const id = EVENT_ORDER.includes(eventParam) ? eventParam : null;
  if (id) {
    devEvent(EVENTS.find((e) => e.id === id));
    return;
  }
  home();
}

boot();
