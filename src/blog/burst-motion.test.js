import test from "node:test";
import assert from "node:assert/strict";
import { BURST_TWEEN_MS, burstProgress } from "./burst-motion.js";

test("local movement settles monotonically without bounce or overshoot", () => {
  assert.ok(BURST_TWEEN_MS <= 300);
  for (const delay of [0, .05, .12, .18]) {
    assert.equal(burstProgress(0, delay), 0);
    assert.equal(burstProgress(1, delay), 1);
    let previous = 0;
    for (let frame = 1; frame <= 100; frame++) {
      const current = burstProgress(frame / 100, delay);
      assert.ok(current >= previous && current <= 1);
      previous = current;
    }
  }
});
