# Meme vision evals (Clef)

Classifies meme images (template + hook + QA) with Cloudflare's Clef
vision decision model, scored against 32 labeled Twetch posts.

## Layout

- `dataset.json` — 32 posts: txid, image file, template, hook bucket,
  caption, engagement (likes×3 + replies×2 + branches). `certain:true`
  rows (21) are safe eval material; batch-1 file↔post joins are
  `certain:false` except the 5 raw-template posts.
- `clef.mjs` — Workers AI client (exact schema-input/output shapes).
  Reads `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`,
  `CLEF_VARIANT` (`clef`|`clef-flash`, default flash).
- `eval.mjs` — template top-1 accuracy, hook macro P/R + confusion,
  latency p50, engagement-by-hook briefing.

## Run

```bash
node eval.mjs --stub [--out results.json]   # plumbing check, no credentials
node eval.mjs [--out results.json]          # live (needs env creds above)
```

## Live wiring (MemeStudio app)

The daemon exposes `classifyMeme` RPC (`packages/walletd/src/rpc.ts`,
client `packages/walletd/src/clef.ts`, tests `clef.test.mjs`) backed by
`CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` in the daemon
environment. MemeStudio's editor has a **Vision check** button that
calls it with the template URL + caption and shows template match,
angle, and QA — advisory only, never blocks posting. Same questions
and taxonomy as this harness, so eval results transfer directly.

## Known caveats

- `trust` bucket has 1 sample — hook recall there is decorative until
  more trust memes ship. Don't fine-tune on this distribution.
- Batch-1 (pre-fix, Files=2) rows have no image files; template-ID
  eval covers batches 2–4 only.
- Engagement is sparse (total score 5, all on one post) — the briefing
  reproduces the money-beats-philosophy read, but treat per-template
  averages as anecdotal until n grows.
