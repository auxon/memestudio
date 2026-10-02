#!/usr/bin/env node
// Crawl the full Twetch meme library metadata (paginated) -> index.jsonl.
// Usage: node crawl.mjs [--q query] [--limit N] [--out dir]
// Wraps `bsv twetch memes` so auth/quotas stay daemon-side.
import { execFileSync } from "node:child_process";
import { mkdirSync, appendFileSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const Q = opt("--q", "");
const LIMIT = parseInt(opt("--limit", "100"), 10);
const OUT = opt("--out", join(process.env.HOME, "memestudio", "evals", "library"));
mkdirSync(OUT, { recursive: true });

const seen = new Set();
const idxPath = join(OUT, "index.jsonl");
if (existsSync(idxPath)) {
  for (const line of readFileSync(idxPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      seen.add(JSON.parse(line).id);
    } catch { /* skip */ }
  }
}
console.error(`resuming: ${seen.size} already indexed`);

let cursor = null;
let pages = 0;
let total = null;
for (;;) {
  const a = ["twetch", "memes"];
  if (Q) a.push(Q);
  a.push("--limit", String(LIMIT));
  if (cursor) a.push("--cursor", cursor);
  const raw = execFileSync("bsv", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const d = JSON.parse(raw);
  if (total === null) {
    total = d.total ?? null;
    console.error(`library total: ${total}`);
  }
  let fresh = 0;
  for (const it of d.items ?? []) {
    if (!it.id || seen.has(it.id)) continue;
    seen.add(it.id);
    fresh++;
    appendFileSync(idxPath, JSON.stringify({
      id: it.id,
      title: it.title ?? "",
      folder: it.folderSlug ?? it.folder ?? "",
      format: it.format ?? "",
      mediaUrl: it.mediaUrl ?? "",
      previewUrl: it.previewUrl ?? "",
      tags: it.tags ?? [],
      bytes: it.bytes ?? null,
      uploadedAtMs: it.uploadedAtMs ?? null,
      tokenNumber: it.tokenNumber ?? null,
      url: it.url ?? "",
    }) + "\n");
  }
  pages++;
  console.error(`page ${pages}: +${fresh} (indexed ${seen.size}${total ? `/${total}` : ""})`);
  cursor = d.nextCursor ?? null;
  if (!cursor || fresh === 0) break;
  await new Promise((r) => setTimeout(r, 1500));
}
writeFileSync(join(OUT, `manifest${Q ? "-" + Q.replace(/\W+/g, "_") : ""}.json`), JSON.stringify({ q: Q, pages, indexed: seen.size, total, at: Date.now() }, null, 2));
console.error(`done: ${seen.size} items in ${idxPath}`);
