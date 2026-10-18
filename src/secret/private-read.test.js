import assert from "node:assert/strict";
import test from "node:test";
import { assetObjectUrl, fetchFileHistory, fetchProjectSummary, githubRequest, loadSnapshotAtCommit, syncSource } from "../vault/github.js";
import { readActiveSnapshot, readSnapshot, saveHistoricalSnapshot, saveSnapshot } from "../vault/cache.js";

const source = { private: true, id: "private", owner: "example", repo: "research", root: "docs", ref: "main", token: "synthetic-token", webProxy: "https://proxy.example.com" };
const sha = "a".repeat(40);
const commit = { sha, commit: { message: "Private note", tree: { sha: "tree" }, author: { name: "Ada" } }, parents: [] };

async function mockFetch(implementation, run) {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  try { return await run(); } finally { globalThis.fetch = original; }
}

test("private snapshots, Unicode notes, histories, summaries, and assets use only authenticated GitHub API calls", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  await mockFetch(async (url, options) => {
    const endpoint = new URL(url);
    assert.equal(endpoint.origin, "https://api.github.com");
    assert.equal(options.headers.Authorization, "Bearer synthetic-token");
    assert.equal(options.cache, "no-store");
    calls.push(endpoint.pathname);
    if (endpoint.pathname.endsWith("/commits/main") || endpoint.pathname.endsWith(`/commits/${sha}`)) return Response.json(commit);
    if (endpoint.pathname.endsWith("/git/trees/tree")) return Response.json({ tree: [{ path: "docs/index.md", type: "blob", mode: "100644", sha: "blob" }] });
    if (endpoint.pathname.endsWith("/git/blobs/blob")) return Response.json({ encoding: "base64", content: btoa(String.fromCharCode(...new TextEncoder().encode("# βιολογία 🧬"))) });
    if (endpoint.pathname.endsWith("/commits")) return Response.json([commit]);
    if (endpoint.pathname.endsWith("/research")) return Response.json({ description: "Confidential research" });
    throw new Error("Unexpected request");
  }, async () => {
    const snapshot = await syncSource(source);
    assert.equal(snapshot.files[0].content, "# βιολογία 🧬");
    assert.equal(snapshot.files[0].mode, "100644");
    assert.ok(!JSON.stringify(snapshot).includes("synthetic-token"));
    assert.equal((await loadSnapshotAtCommit(source, sha)).commitSha, sha);
    assert.equal((await fetchFileHistory(source, "docs/index.md", { headSha: sha })).commits.length, 1);
    assert.equal(await fetchProjectSummary(source), "Confidential research");
    const url = await assetObjectUrl(source, sha, { path: "sample.bin", blobSha: "blob" });
    try { assert.equal(await (await originalFetch(url)).text(), "# βιολογία 🧬"); }
    finally { URL.revokeObjectURL(url); }
  });
  assert.ok(calls.length >= 9);
});

test("private content bypasses IndexedDB even with the same ID as a public vault", async () => {
  assert.equal(await readActiveSnapshot(source), null);
  assert.equal(await readSnapshot(source, sha), null);
  const snapshot = { commitSha: sha, files: [{ content: "Private" }] };
  assert.equal((await saveSnapshot(source, snapshot)).files[0].content, "Private");
  assert.equal(await saveHistoricalSnapshot(source, snapshot), snapshot);
});

test("credentials cannot be sent to a proxy, raw host, or arbitrary origin", async () => {
  for (const url of ["https://raw.githubusercontent.com/example/research/main/docs/index.md", "https://proxy.example.com", "https://evil.example/api.github.com"]) {
    await assert.rejects(githubRequest(source, url), /only be sent to the GitHub API/);
  }
});

test("signing out aborts authenticated requests even when a view has its own signal", async () => {
  const session = new AbortController();
  const view = new AbortController();
  await mockFetch(async (_url, options) => {
    session.abort();
    assert.equal(options.signal.aborted, true);
    throw new DOMException("Signed out", "AbortError");
  }, () => assert.rejects(githubRequest({ ...source, signal: session.signal }, "https://api.github.com/repos/example/research", { signal: view.signal }), { name: "AbortError" }));
});
