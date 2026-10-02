#!/usr/bin/env node
// Download library images: index.jsonl -> library/<shard>/<hash>.<ext>
// Usage: node download.mjs [--in index.jsonl] [--out library] [--n 8] [--max-mb 2000]
// Skips existing files (resume-safe). Paces + retries politely.
// Import-safe: `import { fileFor } from "./download.mjs"` runs nothing.
import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const IN = opt("--in", "index.jsonl");
const OUT = opt("--out", "library");
const CONC = parseInt(opt("--n", "6"), 10);
const MAX_MB = parseFloat(opt("--max-mb", "2000"));

export function extFor(it) {
  const u = (it.mediaUrl || "").split("?")[0];
  const e = extname(u).toLowerCase().replace(".", "");
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(e)) return e === "jpeg" ? "jpg" : e;
  return ({ jpg: "jpg", png: "png", webp: "webp", gif: "gif" })[it.format] ?? "jpg";
}

// Stable filename: sha256(id) — library ids contain slashes/spaces.
export function fileFor(id, ext) {
  return createHash("sha256").update(id).digest("hex").slice(0, 16) + "." + ext;
}

export function shardFor(id) {
  return createHash("sha256").update(id).digest("hex").slice(0, 2);
}

async function main() {
  const items = [];
  for (const line of readFileSync(IN, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const it = JSON.parse(line);
      if (it.mediaUrl) items.push(it);
    } catch { /* skip */ }
  }
  let done = 0, skipped = 0, failed = 0, bytes = 0;
  const queue = [...items];
  async function worker() {
    while (queue.length) {
      const it = queue.shift();
      const dir = join(OUT, shardFor(it.id));
      const dest = join(dir, fileFor(it.id, extFor(it)));
      if (existsSync(dest) && statSync(dest).size > 0) {
        skipped++;
        continue;
      }
      if (bytes > MAX_MB * 1024 * 1024) {
        queue.length = 0;
        console.error("byte budget hit, stopping");
        break;
      }
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 45000);
        const r = await fetch(it.mediaUrl, { signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok) throw new Error(`http ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length === 0 || buf.length > 2 * 1024 * 1024) throw new Error(`bad size ${buf.length}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(dest, buf);
        bytes += buf.length;
        done++;
      } catch (e) {
        failed++;
      }
      if ((done + failed) % 100 === 0) {
        console.error(`done=${done} skipped=${skipped} failed=${failed} MB=${(bytes / 1048576).toFixed(0)} queued=${queue.length}`);
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.error(`FINISH done=${done} skipped=${skipped} failed=${failed} MB=${(bytes / 1048576).toFixed(1)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
