import test from "node:test";
import assert from "node:assert/strict";
import { BURST_VERTEX_STRIDE, createBurstGeometry, sampleBurstGeometry } from "./burst-geometry.js";

const colors = { accent: "#8b5bd1", ink: "#50435e", edge: "#988ca5", paper: "#f7f7f5" };
const geometry = (seed, width = 1200, origin = { x: 600, y: 400 }) => createBurstGeometry(width, 800, colors, seed, origin).vertices;

test("seeded burst meshes stay compatible across posts and small screens", () => {
  for (const width of [600, 1200]) {
    const first = geometry(43107, width);
    assert.deepEqual(geometry(43107, width), first);
    for (const seed of [0, 1, 9001, 9012, 4294967295]) {
      const next = geometry(seed, width, { x: width * .79, y: 304 });
      assert.equal(next.length, first.length);
      assert.ok(next.every(Number.isFinite));
      for (let index = 11; index < first.length; index += BURST_VERTEX_STRIDE) assert.equal(next[index], first[index]);
    }
    assert.notDeepEqual(geometry(9001, width), first);
  }
});

test("fragments follow distinct curved, rotating poses between exact endpoints", () => {
  const from = geometry(43107);
  const to = geometry(9001, 1200, { x: 948, y: 304 });
  assert.equal(sampleBurstGeometry(from, to, 0), from);
  assert.equal(sampleBurstGeometry(from, to, 1), to);
  const middle = sampleBurstGeometry(from, to, .45);
  assert.ok(middle.every(Number.isFinite));
  const motions = new Set();
  let curved = 0;
  for (let index = 0; index < to.length; index += BURST_VERTEX_STRIDE) {
    motions.add(`${to[index + 8]}:${to[index + 9]}:${to[index + 10]}`);
    const dx = to[index + 2] - from[index + 2];
    const dy = to[index + 3] - from[index + 3];
    const cross = dx * (middle[index + 3] - from[index + 3]) - dy * (middle[index + 2] - from[index + 2]);
    if (Math.abs(cross) > 1) curved++;
  }
  assert.ok(motions.size > 300);
  assert.ok(curved > to.length / BURST_VERTEX_STRIDE / 2);
});

test("interrupted reconstruction starts from the sampled pose without a position jump", () => {
  const from = geometry(43107);
  const to = geometry(9001, 1200, { x: 948, y: 304 });
  const interrupted = sampleBurstGeometry(from, to, .31);
  const next = geometry(9002, 1200, { x: 252, y: 496 });
  assert.equal(sampleBurstGeometry(interrupted, next, 0), interrupted);
  const early = sampleBurstGeometry(interrupted, next, .000001);
  for (let index = 0; index < early.length; index += BURST_VERTEX_STRIDE) {
    assert.ok(Math.abs(early[index] - interrupted[index]) < .01);
    assert.ok(Math.abs(early[index + 1] - interrupted[index + 1]) < .01);
  }
  assert.equal(sampleBurstGeometry(interrupted, next, 1), next);
});
