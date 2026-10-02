// Classify the whole downloaded library with Clef: template + hook + QA.
// Usage: node classify.mjs [--in index.jsonl] [--img library] [--out predictions.jsonl]
//   [--limit N] [--concurrency 2] [--since <id>]
// Resume-safe: skips ids already in predictions.jsonl. Checkpoints every 25.
// Costs ~$0.005/16 images at current token rates; 10k images ≈ $3-4.
import { readFileSync, appendFileSync, existsSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { classifyMeme } from "../clef.mjs";
import { fileFor, shardFor } from "./download.mjs";
import { createHash } from "node:crypto";
import { readFileSync as _readEnv } from "node:fs";

// credentials: shell env wins, else evals/.env (never committed)
for (const line of (() => { try { return _readEnv(new URL("../.env", import.meta.url), "utf8").split("\n"); } catch { return []; } })()) {
  const m = line.match(/^\s*([A-Za-z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.error("FATAL: no Clef credentials (env or .env). Refusing to write stub records.");
  process.exit(2);
}

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const IN = opt("--in", "index.jsonl");
const IMG = opt("--img", "library");
const OUT = opt("--out", "predictions.jsonl");
const LIMIT = parseInt(opt("--limit", "100000"), 10);
const CONC = Math.min(4, parseInt(opt("--concurrency", "2"), 10));

const done = new Set();
if (existsSync(OUT)) {
  for (const line of readFileSync(OUT, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if (!rec.error) done.add(rec.id); // errors retry on re-run
    } catch { /* skip */ }
  }
}

function findImage(id) {
  const shard = (id.slice(0, 2) || "xx").replace(/\W/g, "x");
  const dir = join(IMG, shard);
  if (!existsSync(dir)) return null;
  const base = id;
  for (const f of readdirSync(dir)) {
    if (f.startsWith(base + ".") && [".jpg", ".png", ".webp", ".gif"].includes(extname(f))) {
      return join(dir, f);
    }
  }
  // ids contain slashes (slug-style) — shard lookup fails; scan fallback
  return null;
}

function findImageScan(id, cache) {
  if (cache.has(id)) return cache.get(id);
  return null;
}

const items = [];
for (const line of readFileSync(IN, "utf8").split("\n")) {
  if (!line.trim() || items.length >= LIMIT) continue;
  try {
    const it = JSON.parse(line);
    if (!done.has(it.id)) items.push(it);
  } catch { /* skip */ }
}
console.error(`todo=${items.length} (done=${done.size})`);

let ok = 0, fail = 0, n = 0;
async function worker() {
  while (items.length) {
    const it = items.shift();
    // resolve image by content-hash filename (see download.mjs fileFor)
    // GIFs included: clef.mjs normalizes first frame to JPEG.
    const dir = join(IMG, shardFor(it.id));
    let img = null, ext = null;
    if (existsSync(dir)) {
      for (const e of ["jpg", "png", "webp", "gif"]) {
        const cand = join(dir, fileFor(it.id, e));
        if (existsSync(cand)) {
          img = cand;
          ext = e;
          break;
        }
      }
      if (!img) {
        appendFileSync(OUT, JSON.stringify({ id: it.id, error: "gif-or-missing (clef takes png/jpeg/webp)" }) + "\n");
        continue;
      }
    }
    if (!img) {
      appendFileSync(OUT, JSON.stringify({ id: it.id, error: "no-image" }) + "\n");
      continue;
    }
    try {
      const r = await classifyMeme({
        imagePath: img,
        caption: it.title ?? "",
        contentType: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg",
      });
      appendFileSync(OUT, JSON.stringify({
        id: it.id,
        template: r.template,
        hook: r.hook,
        qa: r.qa,
        usage: r.usage,
        latencyMs: r.latencyMs,
      }) + "\n");
      ok++;
    } catch (e) {
      appendFileSync(OUT, JSON.stringify({ id: it.id, error: String(e.message ?? e).slice(0, 200) }) + "\n");
      fail++;
      if (/4\d\d/.test(String(e.message))) await new Promise((r) => setTimeout(r, 5000));
    }
    n++;
    if (n % 25 === 0) console.error(`n=${n} ok=${ok} fail=${fail} queued=${items.length}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.error(`FINISH ok=${ok} fail=${fail}`);
