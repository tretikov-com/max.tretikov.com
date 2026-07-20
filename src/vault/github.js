import {
  markRepositoryChecked,
  readActiveSnapshot,
  readSnapshot,
  saveHistoricalSnapshot,
  saveSnapshot,
} from "./cache.js";
import { createGitHubWebClient } from "./github-web.js";
import {
  createSnapshot,
  isMarkdownPath,
  parseFrontmatter,
  rawGithubUrl,
  stripSourceRoot,
} from "./model.js";

const API_VERSION = "2022-11-28";
const DEFAULT_CONCURRENCY = 6;
const projectSummaryCache = new Map();

function apiHeaders(extra = {}) {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    ...extra,
  };
}

async function githubRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: apiHeaders(options.headers),
  });

  if (response.status === 304) return { response, data: null };
  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.json()).message || "";
    } catch {
      detail = await response.text();
    }
    const remaining = response.headers.get("x-ratelimit-remaining");
    const suffix = remaining === "0" ? " GitHub's public API rate limit is exhausted for this network." : "";
    throw new Error(`GitHub returned ${response.status}${detail ? `: ${detail}` : ""}.${suffix}`);
  }
  return { response, data: await response.json() };
}

async function mapConcurrent(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function shouldIncludePath(source, path) {
  if (!path || path.split("/").some((part) => part === ".git")) return false;
  const exclusions = source.exclude || [];
  return !exclusions.some((excluded) => path === excluded || path.startsWith(`${excluded}/`));
}

function splitCommitMessage(message) {
  const [subject = "", ...body] = String(message || "").split(/\r?\n/);
  return {
    message: subject.trim() || "Untitled commit",
    body: body.join("\n").trim(),
  };
}

export function extractMarkdownSummary(markdown) {
  const { body } = parseFrontmatter(markdown);
  const firstLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => (
      line
      && !line.startsWith("<!--")
      && !line.startsWith("```")
    ));

  return String(firstLine || "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
}

async function fetchIndexSummary(source, signal) {
  const root = String(source.root || "").replace(/^\/+|\/+$/g, "");
  const candidates = ["index.md", "README.md", "index.markdown", "README.markdown"];

  for (const filename of candidates) {
    const repositoryPath = [root, filename].filter(Boolean).join("/");
    const response = await fetch(rawGithubUrl(source, source.ref || "main", repositoryPath), { signal });
    if (!response.ok) continue;
    const summary = extractMarkdownSummary(await response.text());
    if (summary) return summary;
  }
  return "";
}

export async function fetchProjectSummary(source, options = {}) {
  if (source.kind === "inline") {
    const index = source.files.find((file) => /(?:^|\/)(?:index|readme)\.md(?:own)?$/i.test(file.path));
    return extractMarkdownSummary(index?.content || "") || source.label;
  }

  const cacheKey = [
    source.owner,
    source.repo,
    source.ref || "main",
    source.root || "",
  ].join("/");
  if (projectSummaryCache.has(cacheKey)) return projectSummaryCache.get(cacheKey);

  const request = (async () => {
    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}`;
      const { data } = await githubRequest(url, { signal: options.signal });
      const description = String(data.description || "").trim();
      if (description) return description;
    } catch (error) {
      if (error.name === "AbortError") throw error;
    }

    const indexSummary = await fetchIndexSummary(source, options.signal);
    return indexSummary || `${source.owner}/${source.repo}`;
  })();

  projectSummaryCache.set(cacheKey, request);
  try {
    return await request;
  } catch (error) {
    projectSummaryCache.delete(cacheKey);
    throw error;
  }
}

export function normalizeApiCommit(commit) {
  const text = splitCommitMessage(commit?.commit?.message);
  const account = commit?.author || commit?.committer;
  const gitAuthor = commit?.commit?.author || commit?.commit?.committer;
  const author = {
    login: account?.login || null,
    name: gitAuthor?.name || account?.login || "Unknown author",
    avatarUrl: account?.avatar_url || null,
    url: account?.html_url || null,
  };
  return {
    sha: commit?.sha || "",
    shortSha: (commit?.sha || "").slice(0, 7),
    message: text.message,
    body: text.body,
    bodyHtml: null,
    url: commit?.html_url || null,
    authoredAt: commit?.commit?.author?.date || null,
    committedAt: commit?.commit?.committer?.date || commit?.commit?.author?.date || null,
    author,
    authors: [author],
    committer: commit?.committer ? {
      login: commit.committer.login || null,
      name: commit.commit.committer?.name || commit.committer.login || "Unknown committer",
      avatarUrl: commit.committer.avatar_url || null,
      url: commit.committer.html_url || null,
    } : null,
    treeSha: commit?.commit?.tree?.sha || null,
    parents: (commit?.parents || []).map((parent) => ({
      sha: parent.sha || "",
      url: parent.html_url || null,
    })).filter((parent) => parent.sha),
    verification: commit?.commit?.verification || null,
  };
}

async function fetchCommit(source, ref, options = {}) {
  const encodedRef = encodeURIComponent(String(ref || source.ref || "main"));
  const url = `https://api.github.com/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/commits/${encodedRef}`;
  const headers = options.etag ? { "If-None-Match": options.etag } : {};
  const { response, data } = await githubRequest(url, {
    headers,
    signal: options.signal,
  });
  return { data, etag: response.headers.get("etag") || options.etag || null };
}

async function fetchTree(source, treeSha, options = {}) {
  const url = `https://api.github.com/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`;
  const { data } = await githubRequest(url, { signal: options.signal });
  if (data.truncated) {
    throw new Error("This repository tree exceeds GitHub's recursive tree limit; subtree pagination is not implemented yet.");
  }
  return data.tree;
}

async function fetchMarkdown(source, commitSha, entry, options = {}) {
  const response = await fetch(rawGithubUrl(source, commitSha, entry.repoPath), {
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`Unable to fetch ${entry.repoPath}: ${response.status}`);
  return response.text();
}

function validateGitHubSource(source) {
  if (!source?.owner || !source?.repo) {
    throw new Error(`Vault source ${source?.id || "(unknown)"} is missing owner or repo.`);
  }
}

function requireFullCommitSha(value) {
  const sha = String(value || "").trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(sha)) {
    throw new TypeError("A full Git commit SHA is required.");
  }
  return sha;
}

async function materializeSnapshot(source, commit, previousSnapshot = null, options = {}) {
  const commitSha = requireFullCommitSha(commit?.sha);
  const treeSha = commit?.commit?.tree?.sha;
  if (!treeSha) throw new Error(`GitHub commit ${commitSha} does not include a tree.`);

  const tree = await fetchTree(source, treeSha, options);
  const entries = tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => {
      const relativePath = stripSourceRoot(entry.path, source.root || "");
      if (relativePath == null || !shouldIncludePath(source, relativePath)) return null;
      return {
        path: relativePath,
        repoPath: entry.path,
        blobSha: entry.sha,
        size: entry.size || 0,
        type: isMarkdownPath(relativePath) ? "markdown" : "asset",
      };
    })
    .filter(Boolean);

  const previousByBlob = new Map(
    (previousSnapshot?.files || [])
      .filter((file) => file.type === "markdown" && typeof file.content === "string")
      .map((file) => [file.blobSha, file.content]),
  );
  const markdownEntries = entries.filter((entry) => entry.type === "markdown");
  const contents = await mapConcurrent(
    markdownEntries,
    source.concurrency || DEFAULT_CONCURRENCY,
    (entry) => (
      previousByBlob.has(entry.blobSha)
        ? previousByBlob.get(entry.blobSha)
        : fetchMarkdown(source, commitSha, entry, options)
    ),
  );
  const contentByPath = new Map(
    markdownEntries.map((entry, index) => [entry.path, contents[index]]),
  );
  const files = entries.map((entry) => ({
    ...entry,
    content: contentByPath.has(entry.path) ? contentByPath.get(entry.path) : null,
  }));
  const normalizedCommit = normalizeApiCommit(commit);

  return createSnapshot(source, commitSha, files, {
    sourceKind: "github",
    treeSha,
    committedAt: normalizedCommit.committedAt,
    headCommit: normalizedCommit,
    commit: normalizedCommit,
  });
}

export async function loadSourceSnapshot(source) {
  if (source.kind === "inline") {
    return createSnapshot(
      source,
      "local-interface-fixture",
      source.files.map((file) => ({ ...file, type: "markdown", repoPath: file.path })),
      {
        sourceKind: "inline",
        headCommit: {
          sha: "local-interface-fixture",
          shortSha: "local",
          message: "Local interface fixture",
          body: "",
          url: null,
          authoredAt: null,
          committedAt: null,
          author: { name: "Local browser", login: null, avatarUrl: null, url: null },
          authors: [],
        },
      },
    );
  }
  return readActiveSnapshot(source);
}

export async function syncSource(source, previousSnapshot = null) {
  if (source.kind === "inline") return loadSourceSnapshot(source);
  validateGitHubSource(source);

  const previous = previousSnapshot || await readActiveSnapshot(source);
  const canValidateByEtag = Boolean(previous?.headCommit);
  const { data: commit, etag } = await fetchCommit(
    source,
    source.ref || "main",
    { etag: canValidateByEtag ? previous?.repository?.etag : null },
  );

  if (!commit || (commit.sha === previous?.commitSha && previous?.headCommit)) {
    const repository = await markRepositoryChecked(source, {
      etag,
      activeCommit: previous?.commitSha,
    });
    return previous ? { ...previous, repository } : previous;
  }

  const snapshot = await materializeSnapshot(source, commit, previous);
  return saveSnapshot(source, snapshot, { etag });
}

export async function loadSnapshotAtCommit(
  source,
  fullSha,
  previousSnapshot = null,
  options = {},
) {
  if (source.kind === "inline") {
    const snapshot = await loadSourceSnapshot(source);
    if (String(fullSha || "") !== snapshot.commitSha) {
      throw new Error(`Inline source ${source.id} does not contain commit ${fullSha}.`);
    }
    return snapshot;
  }

  validateGitHubSource(source);
  const requestedSha = requireFullCommitSha(fullSha);
  const useCache = options.cache !== false;

  if (useCache) {
    try {
      const cached = await readSnapshot(source, requestedSha);
      if (cached) return cached;
    } catch {
      // IndexedDB is an optimization; a storage failure must not block an exact checkout.
    }
  }

  const { data: commit } = await fetchCommit(source, requestedSha, {
    signal: options.signal,
  });
  const canonicalSha = requireFullCommitSha(commit?.sha);
  if (canonicalSha.toLowerCase() !== requestedSha.toLowerCase()) {
    throw new Error(`GitHub resolved ${requestedSha} to a different commit (${canonicalSha}).`);
  }

  let reusableSnapshot = previousSnapshot;
  if (!reusableSnapshot && useCache) {
    try {
      reusableSnapshot = await readActiveSnapshot(source);
    } catch {
      reusableSnapshot = null;
    }
  }

  const snapshot = await materializeSnapshot(source, commit, reusableSnapshot, {
    signal: options.signal,
  });
  if (!useCache) return snapshot;

  try {
    return await saveHistoricalSnapshot(source, snapshot);
  } catch {
    // The immutable snapshot is still usable when browser storage is unavailable or full.
    return snapshot;
  }
}

function nextPageFromLink(header) {
  if (!header) return null;
  const next = header.split(",").find((part) => /\brel="next"/.test(part));
  if (!next) return null;
  const url = next.match(/<([^>]+)>/)?.[1];
  const page = url ? new URL(url).searchParams.get("page") : null;
  return page ? Number(page) : null;
}

function historyRef(source, options) {
  return String(options.headSha || source.ref || "main");
}

async function fetchApiHistory(source, repositoryPath, options = {}) {
  const page = Number(options.page || 1);
  const selectedRef = historyRef(source, options);
  const params = new URLSearchParams({
    sha: selectedRef,
    per_page: "100",
    page: String(page),
  });
  if (repositoryPath) params.set("path", repositoryPath);

  const url = `https://api.github.com/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/commits?${params}`;
  const { response, data } = await githubRequest(url, { signal: options.signal });
  const nextPage = nextPageFromLink(response.headers.get("link"));
  return {
    transport: "github-api",
    path: repositoryPath || null,
    headSha: selectedRef,
    commits: data.map(normalizeApiCommit),
    pagination: {
      hasNextPage: Boolean(nextPage),
      nextPage,
      endCursor: null,
    },
  };
}

export async function fetchFileHistory(source, repositoryPath, options = {}) {
  if (source.kind === "inline") {
    const snapshot = await loadSourceSnapshot(source);
    return {
      transport: "inline",
      path: repositoryPath,
      headSha: snapshot.commitSha,
      commits: [snapshot.headCommit],
      pagination: { hasNextPage: false, nextPage: null, endCursor: null },
    };
  }

  if (source.webProxy) {
    const client = createGitHubWebClient({ webProxy: source.webProxy });
    const selectedRef = historyRef(source, options);
    const historySource = { ...source, ref: selectedRef };
    const history = await client.fetchFileHistory(historySource, repositoryPath, {
      ...options,
      headSha: selectedRef,
    });
    return {
      ...history,
      headSha: history.headSha || selectedRef,
      transport: "github-web",
    };
  }

  return fetchApiHistory(source, repositoryPath, options);
}

export async function fetchRepositoryHistory(source, options = {}) {
  if (source.kind === "inline") {
    const snapshot = await loadSourceSnapshot(source);
    return {
      transport: "inline",
      path: null,
      headSha: snapshot.commitSha,
      commits: [snapshot.headCommit],
      pagination: { hasNextPage: false, nextPage: null, endCursor: null },
    };
  }

  if (source.webProxy) {
    const client = createGitHubWebClient({ webProxy: source.webProxy });
    const selectedRef = historyRef(source, options);
    const historySource = { ...source, ref: selectedRef };
    const history = await client.fetchRepositoryHistory(historySource, {
      ...options,
      headSha: selectedRef,
    });
    return {
      ...history,
      path: null,
      headSha: history.headSha || selectedRef,
      transport: "github-web",
    };
  }

  return fetchApiHistory(source, null, options);
}
