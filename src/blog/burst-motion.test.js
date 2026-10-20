import test from "node:test";
import assert from "node:assert/strict";
import { burstFragmentPose, createBurstTransition, DEFAULT_BURST_TRANSITION } from "./burst-motion.js";
import { createBurstGeometry, sampleBurstGeometry } from "./burst-geometry.js";

test("transition selection avoids both recent choreographies, including return trips", () => {
  const recent = [];
  const seen = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    const transition = createBurstTransition(Math.imul(seed, 2654435761), recent, { x: 600, y: 400 });
    assert.ok(!recent.includes(transition.mode));
    assert.ok(transition.duration >= 580 && transition.duration <= 740);
    seen.add(transition.mode);
    recent.push(transition.mode);
    if (recent.length > 2) recent.shift();
  }
  assert.equal(seen.size, 4);
});

test("choreographies have distinct trajectories and preserve exact arrival poses", () => {
  const poses = [];
  for (let mode = 0; mode < 4; mode++) {
    const transition = { ...DEFAULT_BURST_TRANSITION, mode, origin: { x: 800, y: 300 } };
    const start = burstFragmentPose(100, 200, 800, 450, .08, .9, 45, 0, transition);
    const end = burstFragmentPose(100, 200, 800, 450, .08, .9, 45, 1, transition);
    assert.ok(Math.abs(start.x - 100) < .000001 && Math.abs(start.y - 200) < .000001);
    assert.ok(Math.abs(end.x - 800) < .000001 && Math.abs(end.y - 450) < .000001);
    assert.ok(Math.abs(end.scale - 1) < .000001 && Math.abs(end.sin) < .000001);
    poses.push(burstFragmentPose(100, 200, 800, 450, .08, .9, 45, .48, transition));
  }
  for (let a = 0; a < poses.length; a++) for (let b = a + 1; b < poses.length; b++) {
    assert.ok(Math.hypot(poses[a].x - poses[b].x, poses[a].y - poses[b].y) > 10);
  }
});

test("every choreography can be interrupted and retargeted without a position jump", () => {
  const colors = { accent: "#8b5bd1", ink: "#50435e", edge: "#988ca5", paper: "#f7f7f5" };
  const from = createBurstGeometry(1200, 800, colors, 43107, { x: 600, y: 400 }).vertices;
  const to = createBurstGeometry(1200, 800, colors, 9001, { x: 948, y: 304 }).vertices;
  for (let mode = 0; mode < 4; mode++) {
    const transition = { ...DEFAULT_BURST_TRANSITION, mode, origin: { x: 948, y: 304 } };
    const interrupted = sampleBurstGeometry(from, to, .37, transition);
    assert.ok(interrupted.every(Number.isFinite));
    const next = { ...transition, mode: (mode + 1) % 4 };
    assert.equal(sampleBurstGeometry(interrupted, from, 0, next), interrupted);
    const early = sampleBurstGeometry(interrupted, from, .000001, next);
    for (let index = 0; index < early.length; index += 12) {
      assert.ok(Math.abs(early[index] - interrupted[index]) < .01);
      assert.ok(Math.abs(early[index + 1] - interrupted[index + 1]) < .01);
    }
  }
});
