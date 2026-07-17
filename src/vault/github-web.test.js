import assert from "node:assert/strict";
import test from "node:test";
import {
  GITHUB_WEB_HEADERS,
  GitHubWebPayloadError,
  GitHubWebProxyRequiredError,
  buildDeferredCommitDataUrl,
  buildFileHistoryUrl,
  buildLatestCommitUrl,
  buildTreeCommitInfoUrl,
  buildTreeListUrl,
  createGitHubWebClient,
  parseDeferredCommitData,
  parseFileHistory,
  parseLatestCommit,
  parseTreeCommitInfo,
  parseTreeList,
} from "./github-web.js";

const SOURCE = {
  owner: "MaxTretikov",
  repo: "rlqf",
  ref: "main",
};

const FILE_COMMIT = "24bb90770ea41fbde0c21930db57d6ce36b8499f";
const HEAD_COMMIT = "8ec0b8a572e7e9f3a3aaa042ca4146eefc6b59a1";

const AUTHOR = {
  login: "MaxTretikov",
  displayName: "Max Tretikov",
  avatarUrl: "https://avatars.githubusercontent.com/u/65316544?v=4",
  path: "/MaxTretikov",
  profileName: "Max Tretikov",
  isGitHub: false,
};

const LATEST_FIXTURE = {
  oid: FILE_COMMIT,
  url: `/MaxTretikov/rlqf/commit/${FILE_COMMIT}`,
  date: "2026-04-08T11:34:07.000-07:00",
  shortMessageHtmlLink: `<a href="/MaxTretikov/rlqf/commit/${FILE_COMMIT}">Add &amp; document</a>`,
  bodyMessageHtml: "<p>Initial documentation.</p><p>Includes the vault.</p>",
  author: AUTHOR,
  authors: [AUTHOR],
  committer: AUTHOR,
  committerAttribution: false,
  status: null,
  isSpoofed: false,
};

test("GitHub web URL builders reproduce the official frontend routes", () => {
  assert.equal(
    buildLatestCommitUrl(SOURCE, "docs/index.md"),
    "https://github.com/MaxTretikov/rlqf/latest-commit/main/docs/index.md",
  );
  assert.equal(
    buildTreeCommitInfoUrl(SOURCE, "docs"),
    "https://github.com/MaxTretikov/rlqf/tree-commit-info/main/docs",
  );
  assert.equal(
    buildTreeListUrl(SOURCE, HEAD_COMMIT),
    `https://github.com/MaxTretikov/rlqf/tree-list/${HEAD_COMMIT}?include_directories=true`,
  );
  assert.equal(
    buildFileHistoryUrl(SOURCE, "docs/index.md"),
    "https://github.com/MaxTretikov/rlqf/commits/main/docs/index.md",
  );
  assert.equal(
    buildDeferredCommitDataUrl(SOURCE, "docs/index.md"),
    "https://github.com/MaxTretikov/rlqf/commits/deferred_commit_data/main"
      + "?original_branch=main&path=docs%2Findex.md",
  );
});

test("history URL builder preserves GitHub's opaque pagination and rename parameters", () => {
  const result = new URL(buildFileHistoryUrl(SOURCE, "docs/a file.md", {
    after: `${HEAD_COMMIT} 0`,
    browsingRenameHistory: true,
    newPath: "docs/a file.md",
    originalBranch: "main",
  }));

  assert.equal(result.pathname, "/MaxTretikov/rlqf/commits/main/docs/a%20file.md");
  assert.equal(result.searchParams.get("after"), `${HEAD_COMMIT} 0`);
  assert.equal(result.searchParams.get("browsing_rename_history"), "true");
  assert.equal(result.searchParams.get("new_path"), "docs/a file.md");
  assert.equal(result.searchParams.get("original_branch"), "main");
});

test("latest-commit parser normalizes message, author, URLs, dates, and a plain body", () => {
  const result = parseLatestCommit(LATEST_FIXTURE);

  assert.equal(result.sha, FILE_COMMIT);
  assert.equal(result.shortSha, "24bb907");
  assert.equal(result.message, "Add & document");
  assert.equal(result.body, "Initial documentation.\nIncludes the vault.");
  assert.equal(result.url, `https://github.com/MaxTretikov/rlqf/commit/${FILE_COMMIT}`);
  assert.equal(result.date, "2026-04-08T11:34:07.000-07:00");
  assert.deepEqual(result.author, {
    login: "MaxTretikov",
    name: "Max Tretikov",
    avatarUrl: "https://avatars.githubusercontent.com/u/65316544?v=4",
    url: "https://github.com/MaxTretikov",
    isGitHub: false,
  });
});

test("tree-commit-info parser handles GitHub's nested HTML-link value", () => {
  const result = parseTreeCommitInfo({
    entries: {
      "index.md": {
        oid: FILE_COMMIT,
        url: `/MaxTretikov/rlqf/commit/${FILE_COMMIT}`,
        date: "2026-04-08T11:34:07.000-07:00",
        shortMessageHtmlLink: {
          value: `<a title="Add docs" href="/MaxTretikov/rlqf/commit/${FILE_COMMIT}">Add docs</a>`,
        },
      },
    },
  });

  assert.equal(result.entries["index.md"].name, "index.md");
  assert.equal(result.entries["index.md"].message, "Add docs");
  assert.equal(result.entries["index.md"].sha, FILE_COMMIT);
});

test("tree-list parser preserves the official path and directory arrays", () => {
  assert.deepEqual(parseTreeList({
    paths: ["docs/index.md", "docs/meta/references.md"],
    directories: ["docs", "docs/meta"],
  }), {
    paths: ["docs/index.md", "docs/meta/references.md"],
    directories: ["docs", "docs/meta"],
  });
});

test("file-history parser flattens commit groups and preserves cursor metadata", () => {
  const result = parseFileHistory({
    payload: {
      commitGroups: [{
        title: "Apr 8, 2026",
        commits: [{
          oid: FILE_COMMIT,
          url: `/MaxTretikov/rlqf/commit/${FILE_COMMIT}`,
          authoredDate: "2026-04-08T11:34:07.000-07:00",
          committedDate: "2026-04-08T11:34:07.000-07:00",
          shortMessage: "Add docs",
          bodyMessageHtml: "<p>Add all research notes.</p>",
          authors: [AUTHOR],
          committer: AUTHOR,
        }],
      }],
      currentCommit: { oid: HEAD_COMMIT },
      filters: {
        currentBlobPath: "docs/index.md",
        pagination: {
          startCursor: `${HEAD_COMMIT} 0`,
          endCursor: `${HEAD_COMMIT} 0`,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      },
      metadata: {
        deferredDataUrl: "/MaxTretikov/rlqf/commits/deferred_commit_data/main"
          + "?original_branch=main&path=docs%2Findex.md",
        deferredContributorUrl: "/MaxTretikov/rlqf/commits/deferred_commit_contributors",
      },
      repo: {
        id: 1205206617,
        defaultBranch: "main",
        name: "rlqf",
        ownerLogin: "MaxTretikov",
        public: true,
        private: false,
      },
      refInfo: { name: "main", currentOid: HEAD_COMMIT },
      title: "History for docs/index.md - MaxTretikov/rlqf",
    },
  });

  assert.equal(result.commits.length, 1);
  assert.equal(result.groups[0].title, "Apr 8, 2026");
  assert.equal(result.commits[0].message, "Add docs");
  assert.equal(result.commits[0].body, "Add all research notes.");
  assert.equal(result.headSha, HEAD_COMMIT);
  assert.equal(result.path, "docs/index.md");
  assert.equal(result.pagination.hasNextPage, false);
  assert.match(result.deferredUrl, /deferred_commit_data\/main/);
  assert.deepEqual(result.repository, {
    id: 1205206617,
    owner: "MaxTretikov",
    name: "rlqf",
    defaultBranch: "main",
    ownerAvatar: null,
    public: true,
    private: false,
  });
});

test("deferred parser indexes verification metadata and rename history by SHA", () => {
  const result = parseDeferredCommitData({
    deferredCommits: [{
      oid: FILE_COMMIT,
      commentCount: 2,
      statusCheckStatus: "success",
      verifiedStatus: "unsigned",
      signatureInformation: { hasSignature: false },
      onBehalfOf: null,
    }],
    renameHistory: {
      historyUrl: `/MaxTretikov/rlqf/commits/${FILE_COMMIT}`
        + "?browsing_rename_history=true&new_path=docs/index.md&original_branch=main",
      hasRenameCommits: false,
      oldName: null,
    },
  });

  assert.equal(result.commits[0].commentCount, 2);
  assert.equal(result.bySha[FILE_COMMIT].status, "success");
  assert.equal(result.renameHistory.hasRenameCommits, false);
  assert.match(result.renameHistory.historyUrl, /browsing_rename_history=true/);
});

test("client refuses network access until an explicit proxy is configured", async () => {
  let calls = 0;
  const client = createGitHubWebClient({
    fetchImpl: async () => {
      calls += 1;
      throw new Error("fetch should not run");
    },
  });

  await assert.rejects(
    client.fetchLatestCommit(SOURCE, "docs/index.md"),
    GitHubWebProxyRequiredError,
  );
  assert.equal(calls, 0);
});

test("client sends official React headers through the configured proxy", async () => {
  let request;
  const client = createGitHubWebClient({
    webProxy: "/github-web",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => LATEST_FIXTURE,
      };
    },
  });

  const result = await client.fetchLatestCommit(SOURCE, "docs/index.md");
  assert.equal(result.sha, FILE_COMMIT);
  assert.match(request.url, /^\/github-web\?url=/);
  for (const [name, value] of Object.entries(GITHUB_WEB_HEADERS)) {
    assert.equal(request.options.headers.get(name), value);
  }
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.credentials, "same-origin");
});

test("a proxy that resolves back to github.com is rejected before fetch", async () => {
  let calls = 0;
  const client = createGitHubWebClient({
    webProxy: (upstreamUrl) => upstreamUrl,
    fetchImpl: async () => {
      calls += 1;
    },
  });

  await assert.rejects(
    client.fetchLatestCommit(SOURCE, "docs/index.md"),
    GitHubWebProxyRequiredError,
  );
  assert.equal(calls, 0);
});

test("malformed frontend payloads fail loudly instead of producing partial metadata", () => {
  assert.throws(() => parseLatestCommit({}), GitHubWebPayloadError);
  assert.throws(() => parseTreeCommitInfo({ entries: [] }), GitHubWebPayloadError);
  assert.throws(() => parseFileHistory({ payload: {} }), GitHubWebPayloadError);
});
