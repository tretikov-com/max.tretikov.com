import assert from "node:assert/strict";
import test from "node:test";
import { installPrintLinkHandling, waitForPrintAssets } from "./print.js";

function printFixture() {
  const view = new EventTarget();
  const attributes = new Map([
    ["href", { name: "href", value: "/projects/rfna/evidence.md" }],
    ["xlink:href", { name: "xlink:href", value: "#diagram", namespaceURI: "http://www.w3.org/1999/xlink" }],
  ]);
  const original = [...attributes.values()];
  const link = {
    getAttributeNode: (name) => attributes.get(name),
    removeAttributeNode: (attribute) => attributes.delete(attribute.name),
    setAttributeNode: (attribute) => attributes.set(attribute.name, attribute),
  };
  const article = { ownerDocument: { defaultView: view }, querySelectorAll: () => [link] };
  return { article, view, attributes, original };
}

test("native print removes link targets and restores the original attributes afterward", () => {
  const { article, view, attributes, original } = printFixture();
  const cleanup = installPrintLinkHandling(article);
  assert.deepEqual([...attributes.values()], original);
  view.dispatchEvent(new Event("beforeprint"));
  assert.equal(attributes.size, 0);
  view.dispatchEvent(new Event("beforeprint"));
  view.dispatchEvent(new Event("afterprint"));
  assert.deepEqual([...attributes.values()], original);
  cleanup();
});

test("leaving a document during print restores links and removes print listeners", () => {
  const { article, view, attributes, original } = printFixture();
  const cleanup = installPrintLinkHandling(article);
  view.dispatchEvent(new Event("beforeprint"));
  cleanup();
  assert.deepEqual([...attributes.values()], original);
  view.dispatchEvent(new Event("beforeprint"));
  assert.deepEqual([...attributes.values()], original);
});

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
