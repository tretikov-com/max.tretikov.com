import assert from "node:assert/strict";
import test from "node:test";
import { waitForPrintAssets } from "./print.js";

function articleWith(images = [], fonts = Promise.resolve()) {
  return {
    isConnected: true,
    ownerDocument: { fonts: { ready: fonts } },
    querySelectorAll: () => images,
  };
}

test("printing waits for both fonts and image decoding, including lazy figures", async () => {
  let finishFonts;
  let finishImage;
  const fonts = new Promise((resolve) => { finishFonts = resolve; });
  const decoded = new Promise((resolve) => { finishImage = resolve; });
  const image = { loading: "lazy", decode: () => decoded };
  let ready = false;
  const pending = waitForPrintAssets(articleWith([image], fonts)).then(() => { ready = true; });

  assert.equal(image.loading, "eager");
  finishFonts();
  await Promise.resolve();
  assert.equal(ready, false);
  finishImage();
  await pending;
  assert.equal(ready, true);
});

test("failed figures prevent an incomplete print and allow a later retry", async () => {
  const image = { decode: () => Promise.reject(new Error("Network error")) };
  const article = articleWith([image]);
  await assert.rejects(waitForPrintAssets(article), /figure could not load/);
  image.decode = () => Promise.resolve();
  await waitForPrintAssets(article);
});

test("stalled resources time out instead of leaving print permanently busy", async () => {
  await assert.rejects(
    waitForPrintAssets(articleWith([], new Promise(() => {})), 5),
    /still loading/,
  );
});

test("printing requires an attached document", async () => {
  await assert.rejects(waitForPrintAssets(null), /no longer open/);
});
