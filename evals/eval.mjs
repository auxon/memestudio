// Eval harness: template-ID accuracy, hook macro P/R + confusion,
// QA catch-rate, engagement-by-hook briefing. Usage:
//   node eval.mjs [--stub] [--out results.json]
// Live mode needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyMeme } from "./clef.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// local secrets (never committed, see .gitignore): KEY=VALUE lines
for (const f of [join(HERE, ".env"), join(process.env.HOME, ".config", "memestudio", "env")]) {
  if (!process.env.CLOUDFLARE_API_TOKEN && existsSync(f)) {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_]+)=(.*)$/);
      if (m) process.env[m[1]] ??= m[2].trim();
    }
  }
}
const MEME_DIR = join(HERE, "..", "..", "Pictures", "bsvOS-memes");
const stub = process.argv.includes("--stub");
const outIdx = process.argv.indexOf("--out");

const ds = JSON.parse(readFileSync(join(HERE, "dataset.json"), "utf8"));
const certain = ds.posts.filter((p) => p.certain && p.template);

let correctT = 0, scoredT = 0;
const hooks = ["money", "custody", "trust", "philosophy", "meta"];
const cm = Object.fromEntries(hooks.map((h) => [h, Object.fromEntries(hooks.map((p) => [p, 0]))]));
let hookScored = 0;
const lat = [];
const pending = [];
const missing = [];

for (const p of certain) {
  const img = p.file ? join(process.env.HOME, "Pictures", "bsvOS-memes", p.file) : null;
  if (!img || !existsSync(img)) {
    missing.push(p.txid);
    continue;
  }
  const r = await classifyMeme({ imagePath: img, caption: p.text, stub });
  if (r.stub) {
    pending.push(p.txid);
    continue;
  }
  lat.push(r.latencyMs);
  const predT = r.template?.option ?? r.template;
  if (predT) {
    scoredT++;
    if (predT === p.template) correctT++;
  }
  const predH = r.hook?.option ?? r.hook;
  if (predH && cm[p.hook] && cm[p.hook][predH] !== undefined) {
    cm[p.hook][predH]++;
    hookScored++;
  }
}

const hookPR = {};
for (const h of hooks) {
  const tp = cm[h][h];
  const pred = hooks.reduce((s, t) => s + cm[t][h], 0);
  const act = hooks.reduce((s, p) => s + cm[h][p], 0);
  hookPR[h] = {
    precision: pred ? +(tp / pred).toFixed(3) : null,
    recall: act ? +(tp / act).toFixed(3) : null,
    support: act,
  };
}

// engagement briefing, straight from labels (reproduces the 5-0 read)
const byHook = {};
for (const p of ds.posts) {
  (byHook[p.hook] ??= { n: 0, total: 0 });
  byHook[p.hook].n++;
  byHook[p.hook].total += p.score;
}
for (const h of Object.keys(byHook)) {
  byHook[h].avg = +(byHook[h].total / byHook[h].n).toFixed(2);
}

const results = {
  stub,
  template: { accuracy: scoredT ? +(correctT / scoredT).toFixed(3) : null, correct: correctT, scored: scoredT },
  hook: { macro: hookPR, confusion: cm, scored: hookScored },
  latencyMs: lat.length ? { p50: lat.sort((a, b) => a - b)[Math.floor(lat.length / 2)], n: lat.length } : null,
  engagementByHook: byHook,
  pending,
  missingFiles: missing,
  note: stub
    ? "stub mode: metrics plumbing verified, predictions pending live Clef credentials."
    : "live mode.",
};
console.log(JSON.stringify(results, null, 2));
if (outIdx > 0) writeFileSync(process.argv[outIdx + 1], JSON.stringify(results, null, 2));
