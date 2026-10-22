import assert from "node:assert/strict";
import test from "node:test";
import { fitHtmlDocument } from "./html-document.js";

function frameFixture() {
  const view = new EventTarget();
  view.getComputedStyle = () => ({ boxSizing: "border-box", borderTopWidth: "1px", borderBottomWidth: "1px" });
  const frame = new EventTarget();
  const requests = [];
  Object.assign(frame, {
    ownerDocument: { defaultView: view },
    contentWindow: { postMessage: (...args) => requests.push(args) },
    style: {},
    offsetHeight: 640,
    clientHeight: 638,
  });
  const message = (height, source = frame.contentWindow, type = "vault:html-size") => {
    view.dispatchEvent(Object.assign(new Event("message"), { data: { type, height }, source }));
  };
  return { frame, requests, message };
}

test("HTML frames fit growing and shrinking content, including their border", () => {
  const { frame, requests, message } = frameFixture();
  const cleanup = fitHtmlDocument(frame);
  assert.equal(requests.length, 1);
  frame.dispatchEvent(new Event("load"));
  assert.equal(requests.length, 2);
  message(920.5);
  assert.equal(frame.style.height, "923px");
  frame.offsetHeight = frame.clientHeight = 0; // A print fallback can hide the frame.
  message(750);
  assert.equal(frame.style.height, "752px");
  cleanup();
  frame.dispatchEvent(new Event("load"));
  message(1200);
  assert.equal(requests.length, 2);
  assert.equal(frame.style.height, "752px");
});

test("HTML frame sizing ignores other windows and malformed measurements", () => {
  const { frame, message } = frameFixture();
  const cleanup = fitHtmlDocument(frame);
  message(900, null);
  message(900, frame.contentWindow, "unrelated-message");
  for (const height of [0, -1, NaN, Infinity, "900", null]) message(height);
  assert.equal(frame.style.height, undefined);
  message(900);
  assert.equal(frame.style.height, "902px");
  cleanup();
});
