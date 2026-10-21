import test from "node:test";
import assert from "node:assert/strict";
import { burstEyeFromGlyph, watchBurstEnvironment } from "./burst-alignment.js";

test("the eye follows the glyph baseline across aspect ratios, scaling, and backing-store densities", () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);
  for (const [width, height, left] of [[496.8, 320, -104], [662.4, 320, -125], [1200, 800, 40], [1440, 800, 560]]) {
    for (const scale of [.75, 1, 1.25, 2]) for (const dpr of [1, 1.25, 1.5, 2, 3, 4]) {
      const canvasRect = { left, top: 72, width: width * scale, height: height * scale };
      const baselineRect = { left: left + width * .47 * scale, top: 72 + height * .56 * scale };
      for (const metrics of [
        { actualBoundingBoxLeft: -4, actualBoundingBoxRight: 65, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 2 },
        { actualBoundingBoxLeft: 0, actualBoundingBoxRight: 74, actualBoundingBoxAscent: 78, actualBoundingBoxDescent: 0 },
      ]) {
        const eye = burstEyeFromGlyph({ width, height, canvasRect, baselineRect, metrics });
        const inkX = baselineRect.left + (metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft) / 2 * scale;
        const inkY = baselineRect.top + (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2 * scale;
        // Project through the physical-pixel backing store and back to screen space.
        close(canvasRect.left + eye.origin.x * dpr / (width * dpr) * canvasRect.width, inkX);
        close(canvasRect.top + eye.origin.y * dpr / (height * dpr) * canvasRect.height, inkY);
      }
    }
  }
});

test("a font swap updates the eye even when the line box and baseline do not move", () => {
  const layout = { width: 1200, height: 800, canvasRect: { left: 40, top: 72, width: 1200, height: 800 }, baselineRect: { left: 600, top: 510 } };
  const first = burstEyeFromGlyph({ ...layout, metrics: { actualBoundingBoxLeft: -3, actualBoundingBoxRight: 60, actualBoundingBoxAscent: 68, actualBoundingBoxDescent: 1 } });
  const loaded = burstEyeFromGlyph({ ...layout, metrics: { actualBoundingBoxLeft: -5, actualBoundingBoxRight: 68, actualBoundingBoxAscent: 74, actualBoundingBoxDescent: 3 } });
  assert.notDeepEqual(first.origin, loaded.origin);
  assert.notDeepEqual(first.radius, loaded.radius);
});

function environment() {
  const view = new EventTarget();
  view.devicePixelRatio = 1;
  view.visualViewport = new EventTarget();
  view.queries = [];
  view.matchMedia = (media) => {
    const query = Object.assign(new EventTarget(), { media });
    view.queries.push(query);
    return query;
  };
  const fonts = new EventTarget();
  let resolveFonts;
  fonts.ready = new Promise((resolve) => { resolveFonts = resolve; });
  return { view, fonts, resolveFonts };
}

test("fonts, viewport changes, and moving between displays remeasure without idle polling", async () => {
  const { view, fonts, resolveFonts } = environment();
  let changes = 0;
  const stop = watchBurstEnvironment(view, fonts, () => changes++);
  assert.equal(changes, 0);
  view.dispatchEvent(new Event("resize"));
  view.visualViewport.dispatchEvent(new Event("resize"));
  fonts.dispatchEvent(new Event("loadingdone"));
  view.devicePixelRatio = 2;
  view.queries[0].dispatchEvent(new Event("change"));
  assert.equal(view.queries[1].media, "(resolution: 2dppx)");
  assert.equal(changes, 4);
  view.queries[0].dispatchEvent(new Event("change"));
  assert.equal(changes, 4);
  resolveFonts();
  await fonts.ready;
  assert.equal(changes, 5);
  stop();
  view.dispatchEvent(new Event("resize"));
  view.visualViewport.dispatchEvent(new Event("resize"));
  fonts.dispatchEvent(new Event("loadingdone"));
  view.queries[1].dispatchEvent(new Event("change"));
  assert.equal(changes, 5);
});

test("font loading that finishes after unmount does not schedule another render", async () => {
  const { view, fonts, resolveFonts } = environment();
  let changes = 0;
  const stop = watchBurstEnvironment(view, fonts, () => changes++);
  stop();
  resolveFonts();
  await fonts.ready;
  assert.equal(changes, 0);
});
