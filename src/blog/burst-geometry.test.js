import test from "node:test";
import assert from "node:assert/strict";
import { BURST_VERTEX_STRIDE, createBurstGeometry, createLocalBurstGeometry, sampleBurstGeometry } from "./burst-geometry.js";

import { BURST_SLOTS } from "./layout.js";

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

test("hover changes only a small local cluster while structural shards and colors stay fixed", () => {
  const base = createBurstGeometry(1200, 800, colors, 43107, { x: 600, y: 400 });
  const neighborhoods = [];
  for (const [slot, position] of BURST_SLOTS.entries()) {
    const target = { x: position.x * 12, y: position.y * 8 };
    const local = createLocalBurstGeometry(base, target, 9001 + slot);
    assert.ok(local.movedIds.length > 0 && local.movedIds.length <= 14);
    assert.ok(local.movedIds.every((id) => id >= 21));
    assert.deepEqual(createLocalBurstGeometry(base, target, 9001 + slot).vertices, local.vertices);
    let changed = 0;
    for (let index = 0; index < base.vertices.length; index += BURST_VERTEX_STRIDE) {
      const distance = Math.hypot(local.vertices[index] - base.vertices[index], local.vertices[index + 1] - base.vertices[index + 1]);
      assert.ok(distance <= 10);
      if (distance > 0) {
        changed++;
        const id = local.vertices[index + 11];
        assert.ok(local.movedIds.includes(id));
        const piece = base.pieces[id];
        assert.ok(Math.hypot(piece.center[0] - target.x, piece.center[1] - target.y) < 280);
      }
      for (let channel = 4; channel < BURST_VERTEX_STRIDE; channel++) assert.equal(local.vertices[index + channel], base.vertices[index + channel]);
    }
    assert.ok(changed / (base.vertices.length / BURST_VERTEX_STRIDE) < .1);
    neighborhoods.push(local.movedIds.slice().sort((a, b) => a - b).join(","));
  }
  assert.equal(new Set(neighborhoods).size, BURST_SLOTS.length);
});

test("rapid local hover changes stay near the original drawing and begin without a jump", () => {
  const base = createBurstGeometry(1200, 800, colors, 43107, { x: 600, y: 400 });
  const first = createLocalBurstGeometry(base, { x: 948, y: 304 }, 9001).vertices;
  const next = createLocalBurstGeometry(base, { x: 252, y: 496 }, 9002).vertices;
  const interrupted = sampleBurstGeometry(base.vertices, first, .37);
  assert.equal(sampleBurstGeometry(interrupted, next, 0), interrupted);
  assert.equal(sampleBurstGeometry(interrupted, next, 1), next);
  const early = sampleBurstGeometry(interrupted, next, .000001);
  const middle = sampleBurstGeometry(interrupted, next, .5);
  assert.ok(middle.every(Number.isFinite));
  for (let index = 0; index < early.length; index += BURST_VERTEX_STRIDE) {
    assert.ok(Math.abs(early[index] - interrupted[index]) < .001);
    assert.ok(Math.abs(early[index + 1] - interrupted[index + 1]) < .001);
    assert.ok(Math.hypot(middle[index] - base.vertices[index], middle[index + 1] - base.vertices[index + 1]) <= 10);
  }
});
