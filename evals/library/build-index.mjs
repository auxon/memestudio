// Build the shippable library index: index.jsonl (+ predictions) ->
// library-index.json (compact rows for the MemeStudio browser tab).
// Usage: node build-index.mjs [--in index.jsonl] [--pred predictions-v2.jsonl]
//   [--out ../../library-index.json]
// No image bytes: thumbnails + full images load from Twetch CDN at use time.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTitle, canonicalFromItem } from "./normalize.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const IN = opt("--in", join(HERE, "index.jsonl"));
const OUT = opt("--out", join(HERE, "..", "..", "library-index.json"));
let PRED = opt("--pred", "");
if (!PRED) {
  for (const c of ["predictions-v2.jsonl", "predictions.jsonl"]) {
    if (existsSync(join(HERE, c))) {
      PRED = join(HERE, c);
      break;
    }
  }
}

const preds = new Map();
if (PRED && existsSync(PRED)) {
  for (const line of readFileSync(PRED, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const p = JSON.parse(line);
      if (!p.error && p.template) preds.set(p.id, p);
    } catch { /* skip */ }
  }
}

const rows = [];
for (const line of readFileSync(IN, "utf8").split("\n")) {
  if (!line.trim()) continue;
  let it;
  try {
    it = JSON.parse(line);
  } catch { continue; }
  if (!it.mediaUrl) continue;
  const fam = normalizeTitle(it.title);
  const { canon } = canonicalFromItem(it, fam);
  const p = preds.get(it.id);
  rows.push({
    id: it.id,
    t: it.title ?? "",
    f: p?.template?.choice && p.template.choice !== "unknown" ? p.template.choice : canon,
    h: p?.hook?.choice ?? null,
    u: it.mediaUrl,
    // previewUrl omitted when identical to mediaUrl (thumb() falls back)
    ...(it.previewUrl && it.previewUrl !== it.mediaUrl ? { p: it.previewUrl } : {}),
    w: it.url ?? "",
    g: (it.tags ?? []).slice(0, 6),
  });
}

writeFileSync(OUT, JSON.stringify({ v: 1, n: rows.length, at: Date.now(), rows }));
console.error(`index: ${rows.length} rows (${preds.size} with predictions) -> ${OUT}`);
const famCount = {};
for (const r of rows) famCount[r.f ?? "(none)"] = (famCount[r.f ?? "(none)"] ?? 0) + 1;
console.error("top families:", Object.entries(famCount).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(" "));
