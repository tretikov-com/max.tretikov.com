export const GITHUB_WEB_ORIGIN = "https://github.com";

export const GITHUB_WEB_HEADERS = Object.freeze({
  Accept: "application/json",
  "Content-Type": "application/json",
  "GitHub-Is-React": "true",
  "GitHub-Verified-Fetch": "true",
  "X-Requested-With": "XMLHttpRequest",
});

export class GitHubWebPayloadError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "GitHubWebPayloadError";
  }
}

export class GitHubWebProxyRequiredError extends Error {
  constructor(message = "GitHub web endpoints require an explicitly configured same-origin proxy.") {
    super(message);
    this.name = "GitHubWebProxyRequiredError";
  }
}

function requiredString(value, label) {
  const result = String(value || "").trim();
  if (!result) throw new TypeError(`${label} is required.`);
  return result;
}

function sourceParts(source) {
  if (!source || typeof source !== "object") throw new TypeError("A GitHub source is required.");
  return {
    owner: requiredString(source.owner, "source.owner"),
    repo: requiredString(source.repo, "source.repo"),
    ref: requiredString(source.ref || "main", "source.ref"),
  };
}

function repositoryPath(value, { allowEmpty = false } = {}) {
  const parts = [];
  String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .forEach((part) => {
      if (!part || part === ".") return;
      if (part === "..") {
        if (!parts.length) throw new TypeError("Repository paths cannot escape the repository root.");
        parts.pop();
        return;
      }
      parts.push(part);
    });
  if (!parts.length && !allowEmpty) throw new TypeError("A repository path is required.");
  return parts.join("/");
}

function encodePath(value, options) {
  return repositoryPath(value, options).split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function repositoryRoute(source, endpoint, suffix = "") {
  const { owner, repo } = sourceParts(source);
  const tail = suffix ? `/${suffix}` : "";
  return `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${endpoint}${tail}`;
}

function githubUrl(path) {
  return new URL(path, GITHUB_WEB_ORIGIN).href;
}

export function buildLatestCommitUrl(source, path) {
  const { ref } = sourceParts(source);
  return githubUrl(repositoryRoute(
    source,
    "latest-commit",
    `${encodeURIComponent(ref)}/${encodePath(path)}`,
  ));
}

export function buildTreeCommitInfoUrl(source, path) {
  const { ref } = sourceParts(source);
  return githubUrl(repositoryRoute(
    source,
    "tree-commit-info",
    `${encodeURIComponent(ref)}/${encodePath(path)}`,
  ));
}

export function buildTreeListUrl(source, headSha, options = {}) {
  const url = new URL(githubUrl(repositoryRoute(
    source,
    "tree-list",
    encodeURIComponent(requiredString(headSha, "headSha")),
  )));
  url.searchParams.set(
    "include_directories",
    options.includeDirectories === false ? "false" : "true",
  );
  return url.href;
}

const HISTORY_QUERY_KEYS = [
  ["after", "after"],
  ["before", "before"],
  ["author", "author"],
  ["since", "since"],
  ["until", "until"],
  ["browsingRenameHistory", "browsing_rename_history"],
  ["newPath", "new_path"],
  ["originalBranch", "original_branch"],
];

export function buildFileHistoryUrl(source, path = "", options = {}) {
  const { ref } = sourceParts(source);
  const historyRef = requiredString(options.headSha || ref, "history ref");
  const encodedPath = encodePath(path, { allowEmpty: true });
  const url = new URL(githubUrl(repositoryRoute(
    source,
    "commits",
    [encodeURIComponent(historyRef), encodedPath].filter(Boolean).join("/"),
  )));
  for (const [property, parameter] of HISTORY_QUERY_KEYS) {
    const value = options[property];
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(parameter, String(value));
    }
  }
  return url.href;
}

export function buildRepositoryHistoryUrl(source, options = {}) {
  return buildFileHistoryUrl(source, "", options);
}

export function buildDeferredCommitDataUrl(source, path, options = {}) {
  const { ref } = sourceParts(source);
  const branch = options.originalBranch || ref;
  const url = new URL(githubUrl(repositoryRoute(
    source,
    "commits/deferred_commit_data",
    encodeURIComponent(ref),
  )));
  url.searchParams.set("original_branch", branch);
  url.searchParams.set("path", repositoryPath(path));
  return url.href;
}

function parseInput(payload, label) {
  let result = payload;
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch (error) {
      throw new GitHubWebPayloadError(`${label} is not valid JSON.`, { cause: error });
    }
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new GitHubWebPayloadError(`${label} must be a JSON object.`);
  }
  return result;
}

function unwrapPayload(payload, label) {
  const result = parseInput(payload, label);
  return result.payload && typeof result.payload === "object" ? result.payload : result;
}

function absoluteGitHubUrl(value) {
  if (!value) return null;
  try {
    return new URL(String(value), GITHUB_WEB_ORIGIN).href;
  } catch {
    return null;
  }
}

const HTML_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: "\u00a0",
  quot: "\"",
};

function decodeHtmlEntities(value) {
  return String(value || "").replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
    (match, decimal, hexadecimal, named) => {
      if (decimal || hexadecimal) {
        const codePoint = Number.parseInt(decimal || hexadecimal, decimal ? 10 : 16);
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
      return HTML_ENTITIES[named?.toLowerCase()] ?? match;
    },
  );
}

function textFromHtml(value) {
  const html = typeof value === "object" && value ? value.value : value;
  if (!html) return "";
  return decodeHtmlEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:blockquote|div|h[1-6]|li|p|pre)>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  ).replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeAuthor(author) {
  if (!author || typeof author !== "object") return null;
  const login = author.login || null;
  return {
    login,
    name: author.displayName || author.profileName || author.name || login,
    avatarUrl: author.avatarUrl || author.avatar_url || null,
    url: absoluteGitHubUrl(author.path || author.htmlUrl || author.html_url),
    isGitHub: Boolean(author.isGitHub),
  };
}

function commitMessage(commit) {
  const message = commit.shortMessage || commit.message || commit.commit?.message;
  if (message) return String(message).split(/\r?\n/, 1)[0];
  return textFromHtml(
    commit.shortMessageHtmlLink
    || commit.shortMessageMarkdownLink
    || commit.shortMessageMarkdown,
  );
}

function normalizeCommit(commit) {
  if (!commit || typeof commit !== "object") return null;
  const sha = commit.oid || commit.sha;
  if (!sha) return null;

  const listedAuthors = Array.isArray(commit.authors)
    ? commit.authors.map(normalizeAuthor).filter(Boolean)
    : [];
  const directAuthor = normalizeAuthor(commit.author);
  const authors = listedAuthors.length ? listedAuthors : directAuthor ? [directAuthor] : [];
  const authoredAt = commit.authoredDate || commit.date || commit.author?.date || null;
  const committedAt = commit.committedDate || commit.date || commit.committer?.date || authoredAt;

  return {
    sha: String(sha),
    shortSha: String(sha).slice(0, 7),
    message: commitMessage(commit),
    body: textFromHtml(commit.bodyMessageHtml),
    bodyHtml: commit.bodyMessageHtml || "",
    url: absoluteGitHubUrl(commit.url || commit.htmlUrl || commit.html_url),
    date: committedAt || authoredAt,
    authoredAt,
    committedAt,
    author: directAuthor || authors[0] || null,
    authors,
    committer: normalizeAuthor(commit.committer),
    committerAttribution: Boolean(commit.committerAttribution),
    pusher: normalizeAuthor(commit.pusher),
    pushedAt: commit.pushedDate || null,
    isSpoofed: Boolean(commit.isSpoofed),
  };
}

function requireCommit(commit, label) {
  const result = normalizeCommit(commit);
  if (!result) throw new GitHubWebPayloadError(`${label} does not contain a commit oid.`);
  return result;
}

export function parseLatestCommit(payload) {
  const root = unwrapPayload(payload, "Latest-commit payload");
  const commit = root.latestCommit && typeof root.latestCommit === "object"
    ? root.latestCommit
    : root;
  return {
    ...requireCommit(commit, "Latest-commit payload"),
    status: commit.status || null,
    statusChecksAliveChannel: commit.statusChecksAliveChannel || null,
  };
}

export function parseTreeCommitInfo(payload) {
  const root = unwrapPayload(payload, "Tree-commit-info payload");
  if (!root.entries || typeof root.entries !== "object" || Array.isArray(root.entries)) {
    throw new GitHubWebPayloadError("Tree-commit-info payload does not contain an entries object.");
  }

  const entries = {};
  for (const [name, value] of Object.entries(root.entries)) {
    entries[name] = {
      name,
      ...requireCommit(value, `Tree-commit-info entry ${name}`),
    };
  }
  return { entries };
}

export function parseTreeList(payload) {
  const root = unwrapPayload(payload, "Tree-list payload");
  if (!Array.isArray(root.paths)) {
    throw new GitHubWebPayloadError("Tree-list payload does not contain a paths array.");
  }
  if (root.directories !== undefined && !Array.isArray(root.directories)) {
    throw new GitHubWebPayloadError("Tree-list directories must be an array.");
  }
  return {
    paths: root.paths.map(String),
    directories: (root.directories || []).map(String),
  };
}

function normalizeRepository(repo) {
  if (!repo || typeof repo !== "object") return null;
  return {
    id: repo.id ?? null,
    owner: repo.ownerLogin || null,
    name: repo.name || null,
    defaultBranch: repo.defaultBranch || null,
    ownerAvatar: repo.ownerAvatar || null,
    public: Boolean(repo.public),
    private: Boolean(repo.private),
  };
}

export function parseFileHistory(payload) {
  const root = unwrapPayload(payload, "File-history payload");
  if (!Array.isArray(root.commitGroups)) {
    throw new GitHubWebPayloadError("File-history payload does not contain commitGroups.");
  }

  const groups = root.commitGroups.map((group, groupIndex) => {
    if (!group || !Array.isArray(group.commits)) {
      throw new GitHubWebPayloadError(`File-history group ${groupIndex} does not contain commits.`);
    }
    return {
      title: group.title || "",
      commits: group.commits.map((commit, commitIndex) => (
        requireCommit(commit, `File-history commit ${groupIndex}:${commitIndex}`)
      )),
    };
  });

  const pagination = root.filters?.pagination || {};
  return {
    groups,
    commits: groups.flatMap((group) => group.commits),
    headSha: root.currentCommit?.oid || root.refInfo?.currentOid || null,
    path: root.filters?.currentBlobPath || null,
    ref: root.refInfo?.name || null,
    pagination: {
      startCursor: pagination.startCursor || null,
      endCursor: pagination.endCursor || null,
      hasNextPage: Boolean(pagination.hasNextPage),
      hasPreviousPage: Boolean(pagination.hasPreviousPage),
    },
    filters: {
      author: root.filters?.author || null,
      since: root.filters?.since || null,
      until: root.filters?.until || null,
      newPath: root.filters?.newPath || null,
      originalBranch: root.filters?.originalBranch || null,
    },
    deferredUrl: absoluteGitHubUrl(root.metadata?.deferredDataUrl),
    deferredContributorUrl: absoluteGitHubUrl(root.metadata?.deferredContributorUrl),
    browsingRenameHistory: root.metadata?.browsingRenameHistory || null,
    repository: normalizeRepository(root.repo),
    title: root.title || null,
  };
}

export function parseDeferredCommitData(payload) {
  const root = unwrapPayload(payload, "Deferred-commit payload");
  if (!Array.isArray(root.deferredCommits)) {
    throw new GitHubWebPayloadError("Deferred-commit payload does not contain deferredCommits.");
  }

  const commits = root.deferredCommits.map((commit, index) => {
    const sha = commit?.oid || commit?.sha;
    if (!sha) throw new GitHubWebPayloadError(`Deferred commit ${index} does not contain an oid.`);
    return {
      sha: String(sha),
      shortSha: String(sha).slice(0, 7),
      commentCount: Number(commit.commentCount || 0),
      status: commit.statusCheckStatus || null,
      verifiedStatus: commit.verifiedStatus || null,
      signature: commit.signatureInformation || null,
      onBehalfOf: commit.onBehalfOf || null,
    };
  });

  const rename = root.renameHistory;
  const renameHistory = rename && typeof rename === "object"
    ? {
        historyUrl: absoluteGitHubUrl(rename.historyUrl),
        hasRenameCommits: Boolean(rename.hasRenameCommits),
        oldName: rename.oldName || null,
      }
    : null;

  return {
    commits,
    bySha: Object.fromEntries(commits.map((commit) => [commit.sha, commit])),
    renameHistory,
  };
}

function proxyStringTarget(webProxy, upstreamUrl) {
  if (webProxy.includes("{url}")) {
    return webProxy.replace("{url}", encodeURIComponent(upstreamUrl));
  }
  const separator = webProxy.includes("?")
    ? webProxy.endsWith("?") || webProxy.endsWith("&") ? "" : "&"
    : "?";
  return `${webProxy}${separator}url=${encodeURIComponent(upstreamUrl)}`;
}

function assertProxyTarget(target) {
  const value = target instanceof URL ? target.href : String(target || "");
  if (!value) throw new TypeError("webProxy must return a request URL.");
  const base = globalThis.location?.origin || "https://github-web-proxy.invalid";
  const parsed = new URL(value, base);
  if (parsed.origin === GITHUB_WEB_ORIGIN) {
    throw new GitHubWebProxyRequiredError(
      "webProxy resolved directly to github.com; browser requests would be blocked by CORS.",
    );
  }
  return value;
}

function canonicalDeferredUrl(value) {
  const url = new URL(String(value || ""), GITHUB_WEB_ORIGIN);
  if (
    url.origin !== GITHUB_WEB_ORIGIN
    || !url.pathname.includes("/commits/deferred_commit_data/")
  ) {
    throw new TypeError("Deferred commit data must use GitHub's deferred_commit_data route.");
  }
  return url.href;
}

export function createGitHubWebClient(options = {}) {
  const { webProxy, fetchImpl = globalThis.fetch } = options;

  async function requestJson(upstreamUrl, endpoint, signal) {
    if (!webProxy) throw new GitHubWebProxyRequiredError();
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");

    const configuredTarget = typeof webProxy === "function"
      ? await webProxy(upstreamUrl, { endpoint })
      : proxyStringTarget(requiredString(webProxy, "webProxy"), upstreamUrl);
    const target = assertProxyTarget(configuredTarget);
    const headers = new Headers(GITHUB_WEB_HEADERS);
    const response = await fetchImpl(target, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers,
      signal,
    });

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        // Preserve the response status when a proxy does not expose a body.
      }
      throw new Error(
        `GitHub web proxy returned ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}`,
      );
    }
    try {
      return await response.json();
    } catch (error) {
      throw new GitHubWebPayloadError("GitHub web proxy did not return JSON.", { cause: error });
    }
  }

  return {
    async fetchLatestCommit(source, path, request = {}) {
      const data = await requestJson(buildLatestCommitUrl(source, path), "latest-commit", request.signal);
      return parseLatestCommit(data);
    },

    async fetchTreeCommitInfo(source, path, request = {}) {
      const data = await requestJson(
        buildTreeCommitInfoUrl(source, path),
        "tree-commit-info",
        request.signal,
      );
      return parseTreeCommitInfo(data);
    },

    async fetchTreeList(source, headSha, request = {}) {
      const data = await requestJson(
        buildTreeListUrl(source, headSha, request),
        "tree-list",
        request.signal,
      );
      return parseTreeList(data);
    },

    async fetchFileHistory(source, path, request = {}) {
      const { signal, ...query } = request;
      const data = await requestJson(
        buildFileHistoryUrl(source, path, query),
        "commits",
        signal,
      );
      return parseFileHistory(data);
    },

    async fetchRepositoryHistory(source, request = {}) {
      const { signal, ...query } = request;
      const data = await requestJson(
        buildRepositoryHistoryUrl(source, query),
        "commits",
        signal,
      );
      return parseFileHistory(data);
    },

    async fetchDeferredCommitData(url, request = {}) {
      const data = await requestJson(
        canonicalDeferredUrl(url),
        "deferred-commit-data",
        request.signal,
      );
      return parseDeferredCommitData(data);
    },
  };
}
