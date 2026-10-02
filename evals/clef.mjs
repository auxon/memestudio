// Clef vision client (Workers AI). Jev-API compatible shape:
// { state, questions } -> typed answers with probabilities.
// Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLEF_MODEL (default below).
// Model id + request shape per https://developers.cloudflare.com/workers-ai/models/clef
// TO-CONFIRM on first live call; harness runs --stub until then.
import { readFileSync } from "node:fs";

const MODEL = process.env.CLEF_MODEL ?? "@cf/cloudflare/clef";
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? "";

export function imageToDataUrl(path) {
  const buf = readFileSync(path);
  const ext = path.endsWith(".png") ? "png" : "jpeg";
  return `data:image/${ext};base64,${buf.toString("base64")}`;
}

/**
 * Classify one meme: template id + hook bucket + QA flags.
 * Returns { template:{option,confidence}, hook:{...}, qa:{...}, latencyMs, stub }
 */
export async function classifyMeme({ imagePath, caption, stub = false }) {
  if (stub || !TOKEN || !ACCOUNT) {
    return { stub: true, template: null, hook: null, qa: null, latencyMs: 0 };
  }
  const started = Date.now();
  const body = {
    state: { image: imageToDataUrl(imagePath), caption },
    questions: {
      template: {
        type: "choice",
        instructions: "Which meme template is this image?",
        criteria: {
          options: [
            "roll-safe", "drake", "distracted-boyfriend", "two-buttons",
            "expanding-brain", "change-my-mind", "success-kid",
            "woman-yelling-cat", "gru-plan", "stonks", "batman-slap",
            "is-this-pigeon", "morpheus", "oprah", "futurama-fry",
            "boromir", "keyboard-typing", "computer-guy", "trojan-horse",
            "euphoria", "announcement", "unknown",
          ],
        },
      },
      hook: {
        type: "choice",
        instructions: "Which engagement angle does the image+caption use?",
        criteria: { options: ["money", "custody", "trust", "philosophy", "meta"] },
      },
      qa: {
        type: "score",
        instructions: "Rate caption problems (higher = worse).",
        criteria: { levels: ["clean", "minor", "blocked"] },
      },
    },
  };
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODEL}`,
    { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!r.ok) throw new Error(`clef ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return { stub: false, ...(j.result ?? j), latencyMs: Date.now() - started };
}
