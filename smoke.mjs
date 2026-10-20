import { Rng } from "./src/rng.js";
import { puzzleNo, computeVariant, scoreFor, sigmaFor, gradeFor, mean, shareText } from "./src/puzzle.js";
import { count } from "./src/events/count.js";
import { predict } from "./src/events/predict.js";
import { level } from "./src/events/level.js";
import { tempo } from "./src/events/tempo.js";
import { split } from "./src/events/split.js";

let fail = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

// Deterministic RNG
const a = new Rng("2026-01-30"), b = new Rng("2026-01-30");
ok(a.next() === b.next() && a.int(0, 1000) === b.int(0, 1000), "RNG deterministic for same seed");
ok(new Rng("x").next() !== new Rng("y").next(), "RNG differs by seed");

// Puzzle numbering / variant
ok(puzzleNo("2026-07-18") === 1, "epoch is puzzle #1");
ok(puzzleNo("2026-07-28") === 11, "day offset -> puzzle number");
ok(["normal", "friday"].includes(computeVariant("2026-11-13")), "variant resolves");

// Scoring curve
ok(scoreFor(0, 0.2) === 100, "zero error -> 100");
ok(scoreFor(0.2, 0.2) === 61, "1 sigma -> ~61");
ok(gradeFor(96) === "S" && gradeFor(50) === "D" && gradeFor(10) === "F", "grades");
ok(mean([100, 0, 50, 50, 50]) === 50, "mean");
ok(shareText(5, { count: 90, predict: 80, level: 70, tempo: 60, split: 50 }, "friday").includes("🃏"), "share text joker");

// Every event generates valid pieces for both variants
for (const ev of [count, predict, level, tempo, split]) {
  for (const variant of ["normal", "friday"]) {
    const rng = new Rng(`${ev.id}-${variant}-seed`);
    const piece = ev.generate(rng, variant);
    ok(piece && piece.variant === variant, `${ev.id}/${variant} generate ok`);
    ok(typeof ev.instruction(piece) === "string" && ev.instruction(piece).length > 0, `${ev.id}/${variant} instruction`);
    const sig = sigmaFor(ev.id, variant);
    ok(sig > 0 && scoreFor(0, sig) === 100, `${ev.id}/${variant} sigma scored`);
  }
}

// Spot-check physics / geometry invariants
const pr = predict.generate(new Rng("pr-f"), "friday");
ok(pr.bounces >= 1 && pr.landingX >= 80 && pr.landingX <= 720, "friday predict bounces + in-bounds");
const lv = level.generate(new Rng("lv-f"), "friday");
ok(lv.targetAngle >= 400 && lv.targetAngle <= 1040, "friday level target > full turn");
const sp = split.generate(new Rng("sp-f"), "friday");
ok(sp.num / sp.den > 1, "friday split fraction improper");

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
