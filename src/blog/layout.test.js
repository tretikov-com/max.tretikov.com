import assert from "node:assert/strict";
import test from "node:test";
import { arrangeBlogPosts, BURST_SLOTS } from "./layout.js";

const posts = (count) => Array.from({ length: count }, (_, index) => ({
  number: index + 1,
  createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
}));

test("empty and small archives use only occupied burst slots", () => {
  for (const count of [0, 1, 3, 7, 8]) {
    const result = arrangeBlogPosts(posts(count));
    assert.equal(result.featured.length, count);
    assert.deepEqual(result.archive, []);
  }
  assert.equal(new Set(BURST_SLOTS.map(({ x, y }) => `${x}:${y}`)).size, 8);
});

test("the newest eight enter the burst and every older post remains in order", () => {
  const input = posts(35);
  const { featured, archive } = arrangeBlogPosts(input);
  assert.deepEqual(featured.map(({ number }) => number), [35, 34, 33, 32, 31, 30, 29, 28]);
  assert.deepEqual(archive.map(({ number }) => number), Array.from({ length: 27 }, (_, index) => 27 - index));
  assert.equal(input[0].number, 1);
});

test("a newly published post takes the first slot and pushes the ninth into the archive", () => {
  const before = arrangeBlogPosts(posts(8));
  const after = arrangeBlogPosts(posts(9));
  assert.equal(after.featured[0].number, 9);
  assert.deepEqual(after.featured.slice(1), before.featured.slice(0, 7));
  assert.equal(after.archive[0].number, before.featured[7].number);
});
