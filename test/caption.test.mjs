import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPORT_TARGET_BYTES,
  MEDIA_MAX_BYTES,
  POST_TEXT_BUDGET,
  createPostConfirm,
  estimateFeeSats,
  fitText,
  layoutCaption,
  splitCaption,
  splitParagraph,
} from "../caption.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// Proportional stub: deterministic without a canvas.
const stubMeasure = (text, px) => text.length * px * 0.6;

test("splitParagraph wraps words and splits over-long words", () => {
  assert.deepEqual(splitParagraph("hello world", 5), ["hello", "world"]);
  assert.deepEqual(splitParagraph("a bb ccc", 4), ["a bb", "ccc"]);
  assert.deepEqual(splitParagraph("abcdefgh", 3), ["abc", "def", "gh"]);
  assert.deepEqual(splitParagraph("", 10), []);
  assert.deepEqual(splitParagraph("   ", 10), []);
});

test("splitCaption keeps explicit lines and drops blanks", () => {
  assert.deepEqual(splitCaption("top\nbottom"), ["top", "bottom"]);
  assert.deepEqual(splitCaption("a\n\nb", 10), ["a", "b"]);
  assert.deepEqual(splitCaption("", 10), []);
});

test("fitText shrinks until the widest line fits, floors at minSize", () => {
  const r = fitText({ lines: ["hello world"], maxWidth: 100, baseSize: 40, minSize: 10, measure: stubMeasure });
  assert.equal(r.size, 14);
  assert.equal(r.fits, true);
  const miss = fitText({ lines: ["x".repeat(100)], maxWidth: 10, baseSize: 40, minSize: 20, measure: stubMeasure });
  assert.equal(miss.size, 20);
  assert.equal(miss.fits, false);
});

test("layoutCaption places top text at the top and bottom text at the bottom", () => {
  const l = layoutCaption({ top: "hi", bottom: "there", width: 500, height: 400, measure: stubMeasure });
  assert.ok(l.top.firstBaselineY > 0 && l.top.firstBaselineY < 200);
  assert.ok(l.bottom.lastBaselineY > 200 && l.bottom.lastBaselineY <= 400);
  assert.equal(l.fits, true);
});

test("post confirm arms on first press and fires on the second within the window", () => {
  let t = 1000;
  const c = createPostConfirm({ windowMs: 10000, now: () => t });
  assert.equal(c.press(), "arm");
  assert.equal(c.armed(), true);
  t += 9999;
  assert.equal(c.press(), "fire");
  assert.equal(c.armed(), false);
});

test("an expired arm needs a fresh arm, and reset disarms", () => {
  let t = 0;
  const c = createPostConfirm({ windowMs: 10000, now: () => t });
  assert.equal(c.press(), "arm");
  t += 10001;
  assert.equal(c.armed(), false);
  assert.equal(c.press(), "arm");
  c.reset();
  assert.equal(c.press(), "arm");
});

test("budgets leave room for the media ref and the media cap", () => {
  assert.ok(POST_TEXT_BUDGET + 100 <= 2000);
  assert.ok(EXPORT_TARGET_BYTES < MEDIA_MAX_BYTES);
  assert.ok(estimateFeeSats(80_000) >= 80_000);
});

test("manifest carries the localhost slot identity and a spend cap", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(here, "..", "manifest.json"), "utf8"));
  assert.equal(raw.name, "Meme Studio");
  assert.equal(raw.start_url, "https://localhost:2121/memestudio/");
  assert.equal(raw.metanet.groupPermissions.spendingAuthorization.amount, 1_000_000);
});
