// Normalize library titles into template families for training labels.
// Usage: node normalize.mjs [--in index.jsonl] [--out families.json]
// Pure function normalizeTitle() is unit-testable; see test below.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export function normalizeTitle(title) {
  let s = (title ?? "").toLowerCase();
  // strip quotes/emoji-ish ornament, keep letters/numbers/spaces/hyphen
  s = s.replace(/["“”‘’'⚠️‼️⁉️]/g, "");
  s = s.replace(/[^a-z0-9\s-]/g, " ");
  s = s.replace(/[\s-]+/g, " ").trim();
  // strip template-ish suffixes/prefixes (longest first)
  const cuts = [
    "meme template", "meme templates", "reaction meme", "meme reaction",
    "template", "reaction", "meme", "memes",
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of cuts) {
      if (s.endsWith(" " + c)) { s = s.slice(0, -(c.length + 1)); changed = true; }
      if (s.startsWith(c + " ")) { s = s.slice(c.length + 1); changed = true; }
    }
    if (s === "meme" || s === "template") s = "";
  }
  return s.replace(/[\s-]+/g, " ").trim();
}

// Canonical eval taxonomy -> family keys it covers.
export const FAMILY_MAP = {
  "roll-safe": ["roll safe", "rollsafe"],
  drake: ["drake", "drake hotline"],
  "distracted-boyfriend": ["distracted boyfriend", "boyfriend"],
  "two-buttons": ["two buttons", "daily struggle", "buttons"],
  "expanding-brain": ["expanding brain", "brain"],
  "change-my-mind": ["change my mind", "change"],
  "success-kid": ["success kid", "success"],
  "woman-yelling-cat": ["woman yelling", "yelling cat", "cat"],
  "gru-plan": ["gru plan", "gru"],
  stonks: ["stonks", "stonk"],
  "batman-slap": ["batman slap", "batman"],
  "is-this-pigeon": ["pigeon", "is this"],
  morpheus: ["morpheus", "matrix morpheus", "what if i told you"],
  oprah: ["oprah", "you get"],
  "futurama-fry": ["futurama fry", "fry", "not sure if"],
  boromir: ["boromir", "one does not simply"],
  "keyboard-typing": ["keyboard typing", "typing"],
  "computer-guy": ["computer guy"],
  "trojan-horse": ["trojan horse", "trojan"],
  euphoria: ["euphoria"],
};

export function toCanonical(family) {
  const words = new Set(family.split(" "));
  for (const [canon, aliases] of Object.entries(FAMILY_MAP)) {
    if (canon === family || words.has(canon.replace(/-/g, " ")) || words.has(canon)) return canon;
    for (const a of [...aliases].sort((x, y) => y.length - x.length)) {
      if (words.has(a)) return canon;
    }
  }
  return null;
}

/** Canonical id from all library signals: slug-id, title family, tags. */
export function canonicalFromItem(it, family) {
  const direct = toCanonical(family);
  if (direct) return { canon: direct, via: "title" };
  const slug = `${it.id ?? ""} ${(it.tags ?? []).join(" ")}`.toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
  const words = new Set(slug.split(/[\s-]+/).filter(Boolean));
  const cands = [];
  for (const [canon, aliases] of Object.entries(FAMILY_MAP)) {
    for (const a of [canon.replace(/-/g, " "), canon, ...aliases]) {
      if (words.has(a)) cands.push([canon, a]);
    }
  }
  // longest alias wins; guard the known false friend (brainlet != expanding-brain)
  cands.sort((x, y) => y[1].length - x[1].length);
  for (const [canon, a] of cands) {
    if (canon === "expanding-brain" && /\b(brainlet|brainlet)\b/.test(slug) && a === "brain") continue;
    return { canon, via: "slug-tag" };
  }
  return { canon: null, via: null };
}

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const inPath = opt("--in", "index.jsonl");
  const outPath = opt("--out", "families.json");
  if (!existsSync(inPath)) {
    console.error(`no index at ${inPath}`);
    process.exit(1);
  }
  const fams = {};
  let n = 0;
  for (const line of readFileSync(inPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const it = JSON.parse(line);
    n++;
    const fam = normalizeTitle(it.title) || "(blank)";
    (fams[fam] ??= { n: 0, ids: [], folders: {}, formats: {} });
    fams[fam].n++;
    if (fams[fam].ids.length < 50) fams[fam].ids.push(it.id);
    const fo = it.folder || "?";
    fams[fam].folders[fo] = (fams[fam].folders[fo] ?? 0) + 1;
    fams[fam].formats[it.format || "?"] = (fams[fam].formats[it.format || "?"] ?? 0) + 1;
  }
  const rows = Object.entries(fams)
    .map(([family, v]) => ({ family, canon: toCanonical(family), ...v }))
    .sort((a, b) => b.n - a.n);
  writeFileSync(outPath, JSON.stringify({ items: n, families: rows.length, rows }, null, 1));
  console.log(`items=${n} families=${rows.length} -> ${outPath}`);
  console.log("top 15:", rows.slice(0, 15).map((r) => `${r.n}x ${r.family}${r.canon ? ` [${r.canon}]` : ""}`).join(" | "));
  console.log("canonical hits:", rows.filter((r) => r.canon).reduce((s, r) => s + r.n, 0));
}

// inline self-test (node normalize.mjs --selftest)
if (args.includes("--selftest")) {
  const cases = [
    ['Vinny Lingham "Trade Offer" Meme Template', "vinny lingham trade offer"],
    ["Laughing Leo meme template", "laughing leo"],
    ["stonks meme", "stonks"],
    ["stonks meme template", "stonks"],
    ["Batman Slapping Robin meme template", "batman slapping robin"],
    ["Is This A Pigeon meme template", "is this a pigeon"],
    ["  Gru's Plan meme template  ", "grus plan"],
    ["MEME", ""],
  ];
  let fail = 0;
  for (const [inp, want] of cases) {
    const got = normalizeTitle(inp);
    if (got !== want) {
      fail++;
      console.error(`FAIL ${JSON.stringify(inp)} -> ${JSON.stringify(got)} (want ${JSON.stringify(want)})`);
    }
  }
  console.log(fail ? `${fail} FAILURES` : "selftest green");
  process.exit(fail ? 1 : 0);
}
