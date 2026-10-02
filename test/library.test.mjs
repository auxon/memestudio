import { test } from "node:test";
import assert from "node:assert/strict";
import { families, searchLibrary, toItem } from "../library.js";

const IDX = {
  rows: [
    { id: "a", t: "Stonks Guy", f: "stonks", h: "money", u: "https://x/s.jpg", p: "https://x/s.jpg", g: ["stonks", "money"] },
    { id: "b", t: "Pepe Laugh", f: "pepe", h: null, u: "https://x/p.png", p: "https://x/p.png", g: ["pepe", "laugh"] },
    { id: "c", t: "Wojak Cry", f: "wojak", h: "philosophy", u: "https://x/w.jpg", p: "https://x/w.jpg", g: ["wojak", "cry"] },
    { id: "d", t: "No Family", f: null, h: null, u: "https://x/n.jpg", p: "https://x/n.jpg", g: [] },
  ],
};

test("families counts most-common first, skips nulls", () => {
  assert.deepEqual(families(IDX).map((x) => x.family), ["stonks", "pepe", "wojak"]);
});

test("q matches across title/tags/family, all words required", () => {
  assert.deepEqual(searchLibrary(IDX, { q: "pepe laugh" }).map((r) => r.id), ["b"]);
  assert.deepEqual(searchLibrary(IDX, { q: "stonks money" }).map((r) => r.id), ["a"]);
  assert.deepEqual(searchLibrary(IDX, { q: "stonks cry" }).map((r) => r.id), []);
  assert.equal(searchLibrary(IDX, { q: "" }).length, 4);
});

test("family filter restricts", () => {
  assert.deepEqual(searchLibrary(IDX, { family: "wojak" }).map((r) => r.id), ["c"]);
});

test("hookFirst floats matches stably", () => {
  const got = searchLibrary(IDX, { hookFirst: "money" }).map((r) => r.id);
  assert.equal(got[0], "a");
  assert.equal(got.length, 4);
});

test("toItem adapts rows to the caption flow shape", () => {
  const it = toItem(IDX.rows[0]);
  assert.equal(it.mediaUrl, "https://x/s.jpg");
  assert.equal(it.title, "Stonks Guy");
  const gif = toItem({ ...IDX.rows[0], u: "https://x/a.gif?v=3" });
  assert.equal(gif.format, "gif");
});
