// Local persistence + optional server stats. The server endpoint is optional;
// everything degrades gracefully to solo play if /api/submit is unavailable.

const PLAYER_KEY = "ensense:player";
const resultKey = (date) => `ensense:${date}`;

export function playerId() {
  try {
    let id = localStorage.getItem(PLAYER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(PLAYER_KEY, id);
    }
    return id;
  } catch {
    return "anonymous-fallback";
  }
}

export function loadResult(date) {
  try {
    const raw = localStorage.getItem(resultKey(date));
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o.v !== 1 || !Array.isArray(o.events) || o.events.length !== 5) return null;
    return o;
  } catch {
    return null;
  }
}

export function saveResult(res) {
  try {
    localStorage.setItem(resultKey(res.date), JSON.stringify(res));
  } catch {}
}

export async function submit(res) {
  try {
    const scores = Object.fromEntries(res.events.map((e) => [e.id, e.score]));
    const r = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: res.date, player: playerId(), scores }),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
