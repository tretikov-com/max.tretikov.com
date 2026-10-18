import assert from "node:assert/strict";
import test from "node:test";
import { openReviewPullRequest, submitNoteReview, validateNotePath } from "./github-edit.js";
import { projectHref, parseProjectsPath } from "../vault/model.js";

const source = { private: true, id: "research", owner: "example", repo: "research", ref: "main", root: "docs", username: "ada", token: "test-token", author: { name: "Ada", email: "ada@example.com" } };
const file = { path: "Research/Idea.md", content: "# Old", mode: "100755" };
const snapshot = { commitSha: "a".repeat(40), treeSha: "b".repeat(40), files: [file] };

async function mockFetch(implementation, run) {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  try { return await run(); } finally { globalThis.fetch = original; }
}

function json(value, status = 200) { return Response.json(value, { status }); }

test("private routes preserve their namespace, revision, note path, and anchors", () => {
  const href = projectHref(source, "Research/Idea.md", { revision: snapshot.commitSha });
  assert.equal(href, `/projects/secret/research/Research/Idea.md?rev=${snapshot.commitSha}`);
  assert.deepEqual(parseProjectsPath("/projects/secret/research/Research/Idea.md", "#idea", `?rev=${snapshot.commitSha}`), {
    sourceId: "research", notePath: "Research/Idea.md", anchor: "idea", revision: snapshot.commitSha, revisionInvalid: false,
  });
  assert.equal(parseProjectsPath("/projects/secret/").sourceId, null);
});

test("submitting Unicode edits creates a commit at the viewed snapshot and a PR without changing main", async () => {
  const calls = [];
  const review = await mockFetch(async (url, options) => {
    assert.ok(String(url).startsWith("https://api.github.com/repos/example/research/"));
    assert.equal(options.headers.Authorization, "Bearer test-token");
    const path = new URL(url).pathname.replace("/repos/example/research/", "");
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method: options.method || "GET", body });
    if (path === "git/blobs") return json({ sha: "blob" }, 201);
    if (path === "git/trees") return json({ sha: "tree" }, 201);
    if (path === "git/commits") return json({ sha: "commit" }, 201);
    if (path === "git/refs") return json({ ref: body.ref }, 201);
    if (path === "pulls" && !body) return json([]);
    if (path === "pulls") return json({ html_url: "https://github.com/example/research/pull/12", number: 12 }, 201);
    throw new Error("Unexpected request");
  }, () => submitNoteReview(source, snapshot, { path: file.path, content: "# βιολογία 🧬", message: "Clarify research", existingFile: file }));
  assert.equal(review.number, 12);
  assert.deepEqual(calls[0].body, { content: "# βιολογία 🧬", encoding: "utf-8" });
  assert.deepEqual(calls[1].body, { base_tree: snapshot.treeSha, tree: [{ path: "docs/Research/Idea.md", mode: "100755", type: "blob", sha: "blob" }] });
  assert.deepEqual(calls[2].body, { message: "Clarify research\n\nSubmitted by Ada <ada@example.com> (ada).", tree: "tree", parents: [snapshot.commitSha] });
  assert.match(calls[3].body.ref, /^refs\/heads\/review\/ada\//);
  assert.ok(calls.every((call) => call.method !== "PATCH"));
  assert.equal(calls.at(-1).body.base, "main");
});

test("a failed PR preserves the saved branch and a retry recovers an existing PR", async () => {
  let savedReview;
  await mockFetch(async (url, options) => {
    if (String(url).includes("/pulls")) return json({ message: "PR permission required" }, 403);
    return json({ sha: "saved" }, 201);
  }, async () => {
    await assert.rejects(submitNoteReview(source, snapshot, { path: "New.md", content: "# New", message: "Add note" }), (error) => {
      savedReview = error.review;
      return Boolean(savedReview?.branch && savedReview.compareUrl);
    });
  });
  await mockFetch(async (_url, options) => {
    assert.equal(options.method, undefined);
    return json([{ number: 9, html_url: "https://github.com/example/research/pull/9" }]);
  }, async () => assert.equal((await openReviewPullRequest(source, savedReview)).number, 9));
});

test("invalid, duplicate, excluded, and unchanged note submissions make no requests", async () => {
  for (const path of ["../outside.md", "/absolute.md", ".github/workflows/run.md", "test.txt", "Research//New.md", "a\\b.md"]) {
    assert.throws(() => validateNotePath(path));
  }
  await mockFetch(() => { throw new Error("Network must not run"); }, async () => {
    await assert.rejects(submitNoteReview(source, snapshot, { path: file.path, content: "# New", message: "Duplicate" }), /already exists/);
    await assert.rejects(submitNoteReview(source, snapshot, { path: file.path, content: file.content, message: "Same", existingFile: file }), /no changes/);
    await assert.rejects(submitNoteReview({ ...source, exclude: ["Private"] }, snapshot, { path: "Private/New.md", content: "x", message: "Excluded" }), /excluded/);
  });
});
