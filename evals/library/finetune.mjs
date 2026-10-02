// Package classified library into an RL fine-tune dataset (Clef RLCD-ready).
// Usage: node finetune.mjs [--pred predictions.jsonl] [--in index.jsonl]
//   [--img library] [--out finetune]
// Joins predictions with index metadata; emits:
//   train.jsonl  {image, state, questions, answers} per item (answers =
//                model predictions, human-verified subset flagged)
//   card.json    dataset card: counts, agreement stats, taxonomy, license
//   review.tsv   low-confidence disagreements for human review
// License note: Twetch library items are third-party memes of unknown
// provenance. Treat train.jsonl as INTERNAL eval/fine-tune material;
// clear rights before any redistribution.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { canonicalFromItem, normalizeTitle } from "./normalize.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const PRED = opt("--pred", "predictions.jsonl");
const IN = opt("--in", "index.jsonl");
const IMG = opt("--img", "library");
const OUT = opt("--out", "finetune");
mkdirSync(OUT, { recursive: true });

const meta = new Map();
for (const line of readFileSync(IN, "utf8").split("\n")) {
  if (!line.trim()) continue;
  try {
    const it = JSON.parse(line);
    meta.set(it.id, it);
  } catch { /* skip */ }
}

let nPred = 0, nAgree = 0, nImg = 0;
const hookDist = {};
const low = [];
const out = [];
if (existsSync(PRED)) {
  for (const line of readFileSync(PRED, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let p;
    try {
      p = JSON.parse(line);
    } catch { continue; }
    if (p.error || !p.template) continue;
    const it = meta.get(p.id);
    if (!it) continue;
    nPred++;
    const fam = normalizeTitle(it.title);
    const { canon, via } = canonicalFromItem(it, fam);
    const agree = canon !== null && canon === p.template.choice;
    if (agree) nAgree++;
    const conf = p.template.confidence ?? 0;
    if (!agree || conf < 0.6) {
      low.push([p.id, it.title ?? "", canon ?? "?", p.template.choice, (conf ?? 0).toFixed(2)].join("\t"));
    }
    const shard = createHash("sha256").update(p.id).digest("hex").slice(0, 2);
    const exts = ["jpg", "png", "webp"];
    let img = null;
    for (const e of exts) {
      const cand = join(IMG, shard, createHash("sha256").update(p.id).digest("hex").slice(0, 16) + "." + e);
      if (existsSync(cand)) {
        img = cand;
        break;
      }
    }
    if (img) nImg++;
    const h = p.hook?.choice ?? "meta";
    hookDist[h] = (hookDist[h] ?? 0) + 1;
    out.push(JSON.stringify({
      image: img,
      state: { caption: it.title ?? "", tags: it.tags ?? [], folder: it.folder ?? "" },
      questions: "template+hook+qa (see clef.mjs taxonomy)",
      answers: {
        template: p.template.choice,
        template_probs: p.template.probabilities ?? undefined,
        hook: p.hook?.choice ?? null,
        qa_score: p.qa?.score ?? null,
      },
      label_source: agree ? "library-agree" : "model-only",
      library_canon: canon,
      library_via: via,
      confidence: conf,
    }));
  }
}

writeFileSync(join(OUT, "train.jsonl"), out.join("\n") + (out.length ? "\n" : ""));
writeFileSync(join(OUT, "review.tsv"), "id\ttitle\tlibrary_canon\tpredicted\tconf\n" + low.join("\n") + (low.length ? "\n" : ""));
const card = {
  name: "twetch-meme-library-clef-v1",
  at: Date.now(),
  items_indexed: meta.size,
  items_predicted: nPred,
  items_with_image: nImg,
  library_model_agreement: nPred ? +(nAgree / nPred).toFixed(3) : null,
  hook_distribution: hookDist,
  review_queue: low.length,
  taxonomy: "template (22 families + unknown), hook (money/custody/trust/philosophy/meta), qa (clean/minor/blocked)",
  license_note: "INTERNAL ONLY — third-party meme images of unknown provenance; clear rights before redistributing.",
};
writeFileSync(join(OUT, "card.json"), JSON.stringify(card, null, 2));
console.error(`predicted=${nPred} with_image=${nImg} agreement=${card.library_model_agreement} review=${low.length} hook=${JSON.stringify(hookDist)}`);
console.error(`wrote ${OUT}/train.jsonl + review.tsv + card.json`);
