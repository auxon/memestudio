// Clef vision client (Workers AI).
// Shapes per https://developers.cloudflare.com/workers-ai/models/clef
// (schema-input.json / schema-output.json, fetched 2026-10-02).
// Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN,
//       CLEF_VARIANT=clef|clef-flash (default flash: 38ms, cheapest).
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const VARIANT = () =>
  (process.env.CLEF_VARIANT ?? "clef").trim() || "clef";
// NOTE 2026-10-02: API rejects 'clef-flash' ("Use 'clef'"). Revisit flash
// for the hot path once served.
const ACCOUNT = () => process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const TOKEN = () => process.env.CLOUDFLARE_API_TOKEN ?? "";

const TEMPLATES = {
  "roll-safe": "man tapping temple, smug obvious-advice",
  drake: "two-panel preference: rejecting top, approving bottom",
  "distracted-boyfriend": "man checking out another woman, labeled choice",
  "two-buttons": "sweating choice between two red buttons",
  "expanding-brain": "4-stage glowing brain escalation",
  "change-my-mind": "man at table with sign, hot take",
  "success-kid": "fist-pumping toddler on beach",
  "woman-yelling-cat": "yelling woman vs unimpressed cat at dinner",
  "gru-plan": "gru 4-panel scheming board",
  stonks: "suit man before rising stock chart",
  "batman-slap": "batman slapping robin mid-sentence",
  "is-this-pigeon": "man gesturing at butterfly, mislabeling",
  morpheus: "what if I told you matrix headshot",
  oprah: "you get a car, everybody gets",
  "futurama-fry": "squinting fry, not sure if",
  boromir: "one does not simply walk into",
  "keyboard-typing": "hands on keyboard closeup",
  "computer-guy": "man pointing at monitor",
  "trojan-horse": "wooden horse at gates",
  euphoria: "that euphoria feeling reaction",
  announcement: "text announcement, no meme template",
  unknown: "none of the above",
};

/**
 * Classify one meme: template id + hook bucket + QA flags.
 * Returns { template:{choice,confidence}, hook:{...}, qa:{score,confidence},
 *           usage, latencyMs, stub }
 */
export async function classifyMeme({ imagePath, caption, stub = false, contentType = null }) {
  const token = TOKEN(), account = ACCOUNT(), variant = VARIANT();
  if (stub || !token || !account) {
    return { stub: true, template: null, hook: null, qa: null, latencyMs: 0 };
  }
  const started = Date.now();
  const rawDisk = readFileSync(imagePath);
  // Normalize via ImageMagick: media extensions lie (webp served as .jpg),
  // GIFs reduce to first frame ([0]). 512px keeps template ID accurate
  // while staying far inside the 65k token budget (empirically ~86k
  // tokens/MP at 1024px — too dense). Cache key versions the recipe.
  const normDir = join(tmpdir(), "clef-norm");
  mkdirSync(normDir, { recursive: true });
  const normKey = createHash("sha256").update(rawDisk).digest("hex").slice(0, 16) + "-512.jpg";
  const normPath = join(normDir, normKey);
  if (!existsSync(normPath)) {
    execFileSync("magick", [imagePath + "[0]", "-resize", "512x512>", "-quality", 70, "jpg:" + normPath]);
  }
  const buf = readFileSync(normPath);
  if (buf.length > 4 * 1024 * 1024) {
    throw new Error(`image over 4MiB Clef limit: ${imagePath}`);
  }
  const ct = "image/jpeg";
  const body = {
    model: variant,
    state: { caption },
    images: [{ content_type: ct, base64: buf.toString("base64") }],
    questions: {
      template: {
        type: "choice",
        instructions: "Which meme template is this image? Answer unknown if none match.",
        criteria: TEMPLATES,
      },
      hook: {
        type: "choice",
        instructions: "Which engagement angle does the image plus caption use?",
        criteria: {
          money: "getting paid, fees, escrow, payouts, prices, earnings",
          custody: "keys, seeds, wallets, self-custody, who holds what",
          trust: "reputation, trust scores, verification, age vs credibility",
          philosophy: "identity, purpose, vibes, manifestos with no money ask",
          meta: "about the meme program itself, raw templates",
        },
      },
      qa: {
        type: "score",
        instructions: "Rate caption problems: overlap with faces, illegible contrast, blank frames.",
        criteria: ["clean", "minor", "blocked"],
      },
    },
  };
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/cloudflare/clef`,
    { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!r.ok) throw new Error(`clef ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const a = j.result?.answers ?? j.answers ?? {};
  const pick = (ans) =>
    ans && ans.choice !== undefined
      ? { choice: ans.choice, confidence: ans.probabilities?.[ans.choice] ?? ans.confidence ?? null }
      : null;
  return {
    stub: false,
    template: pick(a.template),
    hook: pick(a.hook),
    qa: a.qa ? { score: a.qa.score, confidence: a.qa.confidence ?? null } : null,
    usage: j.result?.usage ?? j.usage ?? null,
    latencyMs: Date.now() - started,
  };
}
