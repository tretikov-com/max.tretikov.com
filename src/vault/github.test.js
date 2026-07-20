import assert from "node:assert/strict";
import test from "node:test";
import {
  extractMarkdownSummary,
  fetchFileHistory,
  fetchRepositoryHistory,
  loadSnapshotAtCommit,
} from "./github.js";

const SOURCE = {
  id: "rlqf",
  kind: "github",
  owner: "MaxTretikov",
  repo: "rlqf",
  ref: "main",
  root: "docs",
  exclude: [],
};

const COMMIT_SHA = "1234567890abcdef1234567890abcdef12345678";
const TREE_SHA = "234567890abcdef1234567890abcdef123456789";
const PARENT_SHA = "34567890abcdef1234567890abcdef1234567890";
const REUSED_BLOB_SHA = "4567890abcdef1234567890abcdef12345678901";
const CHANGED_BLOB_SHA = "567890abcdef1234567890abcdef123456789012";

function jsonResponse(data, options = {}) {
  return new Response(JSON.stringify(data), {
    status: options.status || 200,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
}

async function withMockFetch(fetchImpl, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function apiCommit(sha = COMMIT_SHA) {
  return {
    sha,
    html_url: `https://github.com/MaxTretikov/rlqf/commit/${sha}`,
    author: {
      login: "MaxTretikov",
      avatar_url: "https://avatars.githubusercontent.com/u/1",
      html_url: "https://github.com/MaxTretikov",
    },
    commit: {
      message: "Render an exact revision\n\nKeep the complete historical docs tree.",
      tree: { sha: TREE_SHA },
      author: {
        name: "Max Tretikov",
        email: "max@example.com",
        date: "2026-07-19T18:00:00Z",
      },
      committer: {
        name: "Max Tretikov",
        email: "max@example.com",
        date: "2026-07-19T18:01:00Z",
      },
      verification: { verified: true, reason: "valid" },
    },
    parents: [{
      sha: PARENT_SHA,
      html_url: `https://github.com/MaxTretikov/rlqf/commit/${PARENT_SHA}`,
    }],
  };
}

test("project summary uses the first meaningful index line", () => {
  const markdown = `---
title: Metadata title
---

# Reinforcement Learning with Quantum Feedback

Longer body copy.
`;

  assert.equal(
    extractMarkdownSummary(markdown),
    "Reinforcement Learning with Quantum Feedback",
  );
});

test("project summary removes lightweight Markdown formatting", () => {
  assert.equal(
    extractMarkdownSummary("**A [linked](https://example.com) description**"),
    "A linked description",
  );
});

test("exact commit checkout uses its canonical tree and raw URLs while reusing unchanged blobs", async () => {
  const calls = [];
  const controller = new AbortController();
  const previousSnapshot = {
    commitSha: PARENT_SHA,
    files: [
      {
        path: "unchanged.md",
        repoPath: "docs/unchanged.md",
        blobSha: REUSED_BLOB_SHA,
        type: "markdown",
        content: "# Reused without another request",
      },
    ],
  };

  const snapshot = await withMockFetch(async (url, options = {}) => {
    calls.push({ url: String(url), signal: options.signal });
    if (String(url) === `https://api.github.com/repos/MaxTretikov/rlqf/commits/${COMMIT_SHA}`) {
      return jsonResponse(apiCommit());
    }
    if (String(url) === `https://api.github.com/repos/MaxTretikov/rlqf/git/trees/${TREE_SHA}?recursive=1`) {
      return jsonResponse({
        sha: TREE_SHA,
        truncated: false,
        tree: [
          {
            path: "docs/unchanged.md",
            type: "blob",
            sha: REUSED_BLOB_SHA,
            size: 12,
          },
          {
            path: "docs/changed note.md",
            type: "blob",
            sha: CHANGED_BLOB_SHA,
            size: 24,
          },
          {
            path: "docs/diagram.svg",
            type: "blob",
            sha: "67890abcdef1234567890abcdef1234567890123",
            size: 48,
          },
          {
            path: "src/ignored.md",
            type: "blob",
            sha: "7890abcdef1234567890abcdef12345678901234",
            size: 96,
          },
        ],
      });
    }
    if (
      String(url)
      === `https://raw.githubusercontent.com/MaxTretikov/rlqf/${COMMIT_SHA}/docs/changed%20note.md`
    ) {
      return new Response("# Fresh historical content", { status: 200 });
    }
    throw new Error(`Unexpected request: ${url}`);
  }, () => loadSnapshotAtCommit(
    SOURCE,
    COMMIT_SHA,
    previousSnapshot,
    { cache: false, signal: controller.signal },
  ));

  assert.equal(snapshot.commitSha, COMMIT_SHA);
  assert.equal(snapshot.treeSha, TREE_SHA);
  assert.equal(snapshot.headCommit.message, "Render an exact revision");
  assert.equal(snapshot.headCommit.body, "Keep the complete historical docs tree.");
  assert.equal(snapshot.headCommit.treeSha, TREE_SHA);
  assert.deepEqual(snapshot.headCommit.parents, [{
    sha: PARENT_SHA,
    url: `https://github.com/MaxTretikov/rlqf/commit/${PARENT_SHA}`,
  }]);
  assert.equal(snapshot.headCommit.verification.verified, true);
  assert.deepEqual(snapshot.files.map((file) => file.path), [
    "unchanged.md",
    "changed note.md",
    "diagram.svg",
  ]);
  assert.equal(
    snapshot.files.find((file) => file.path === "unchanged.md").content,
    "# Reused without another request",
  );
  assert.equal(
    snapshot.files.find((file) => file.path === "changed note.md").content,
    "# Fresh historical content",
  );
  assert.equal(snapshot.files.find((file) => file.path === "diagram.svg").content, null);
  assert.equal(calls.length, 3);
  assert.equal(calls.some(({ url }) => url.includes("unchanged.md")), false);
  assert.equal(calls.every(({ signal }) => signal === controller.signal), true);
});

test("repository history is unfiltered and queries the selected commit with pagination", async () => {
  let requestedUrl;
  const result = await withMockFetch(async (url) => {
    requestedUrl = new URL(String(url));
    return jsonResponse([apiCommit()], {
      headers: {
        link: `<https://api.github.com/repositories/1/commits?sha=${COMMIT_SHA}&per_page=100&page=3>; rel="next"`,
      },
    });
  }, () => fetchRepositoryHistory(SOURCE, { headSha: COMMIT_SHA, page: 2 }));

  assert.equal(requestedUrl.pathname, "/repos/MaxTretikov/rlqf/commits");
  assert.equal(requestedUrl.searchParams.get("sha"), COMMIT_SHA);
  assert.equal(requestedUrl.searchParams.get("path"), null);
  assert.equal(requestedUrl.searchParams.get("page"), "2");
  assert.equal(result.path, null);
  assert.equal(result.headSha, COMMIT_SHA);
  assert.equal(result.commits[0].message, "Render an exact revision");
  assert.deepEqual(result.pagination, {
    hasNextPage: true,
    nextPage: 3,
    endCursor: null,
  });
});

test("file history uses the selected snapshot SHA instead of the configured branch", async () => {
  let requestedUrl;
  const result = await withMockFetch(async (url) => {
    requestedUrl = new URL(String(url));
    return jsonResponse([]);
  }, () => fetchFileHistory(SOURCE, "docs/index.md", { headSha: COMMIT_SHA }));

  assert.equal(requestedUrl.searchParams.get("sha"), COMMIT_SHA);
  assert.equal(requestedUrl.searchParams.get("path"), "docs/index.md");
  assert.equal(result.headSha, COMMIT_SHA);
});

test("proxied file history replaces the source branch with the selected snapshot SHA", async () => {
  let upstreamUrl;
  const source = {
    ...SOURCE,
    webProxy: (upstream) => {
      upstreamUrl = new URL(upstream);
      return "/github-web";
    },
  };

  const result = await withMockFetch(async (url) => {
    assert.equal(String(url), "/github-web");
    return jsonResponse({
      payload: {
        commitGroups: [],
        currentCommit: { oid: COMMIT_SHA },
        filters: {
          currentBlobPath: "docs/index.md",
          pagination: { hasNextPage: false, hasPreviousPage: false },
        },
        refInfo: { name: COMMIT_SHA, currentOid: COMMIT_SHA },
      },
    });
  }, () => fetchFileHistory(source, "docs/index.md", { headSha: COMMIT_SHA }));

  assert.equal(
    upstreamUrl.pathname,
    `/MaxTretikov/rlqf/commits/${COMMIT_SHA}/docs/index.md`,
  );
  assert.equal(result.headSha, COMMIT_SHA);
  assert.equal(result.transport, "github-web");
});
