import React, { useEffect, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import "./vault.css";
import { readFileHistory, saveFileHistory } from "./cache.js";
import {
  fetchFileHistory,
  fetchProjectSummary,
  fetchRepositoryHistory,
  loadSnapshotAtCommit,
  loadSourceSnapshot,
  syncSource,
} from "./github.js";
import {
  isFullCommitSha,
  parseProjectsPath,
  projectHref,
  rawGithubUrl,
  resolveAssetTarget,
  resolveNoteTarget,
  resolveRepositoryTarget,
} from "./model.js";
import { navigateTo } from "../navigation.js";
import { configuredSources } from "./sources.js";

const EXTERNAL_PROTOCOL = /^(?:[a-z]+:|\/\/)/i;
let rendererPromise;

function loadRenderer() {
  if (!rendererPromise) rendererPromise = import("./renderer.js");
  return rendererPromise;
}

function formatCommit(sha) {
  if (!sha) return "NO SNAPSHOT";
  if (sha.startsWith("local-")) return "LOCAL FIXTURE";
  return sha.slice(0, 8).toUpperCase();
}

function formatHistoryDate(value) {
  if (!value) return "DATE UNAVAILABLE";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).toUpperCase();
}

function sourceMetadata(source) {
  if (source.kind === "inline") return "LOCAL / INTERFACE FIXTURE";
  const root = source.root ? `/${source.root}` : "/";
  return `GITHUB / ${source.owner}/${source.repo} / ${source.ref || "main"}${root}`;
}

function ProjectsHeader({ detail, status }) {
  return <header className="vault-header">
    <a className="vault-wordmark" href="/" aria-label="Return to Max Tretikov home">
      <span className="vault-wordmark-bracket">[</span>
      <span>MAX TRETIKOV</span>
      <span className="vault-wordmark-bracket">]</span>
    </a>
    <div className="vault-header-rule" aria-hidden="true" />
    <div className="vault-header-meta">
      <span>PROJECT INDEX</span>
      {detail && <span>{detail}</span>}
      {status && <span className={`vault-status vault-status--${status.tone || "idle"}`}>
        <i aria-hidden="true" />{status.label}
      </span>}
    </div>
  </header>;
}

function EmptyProjects() {
  return <main className="projects-empty">
    <div className="projects-empty-index">00</div>
    <section>
      <p className="vault-eyebrow">REPOSITORY ARRAY / UNCONFIGURED</p>
      <h1>NO PUBLIC VAULTS<br />HAVE BEEN INDEXED.</h1>
      <p>
        Add a repository descriptor to <code>src/vault/sources.js</code>. The reader will
        track its branch head, download a complete commit snapshot, and keep the last
        good copy in IndexedDB.
      </p>
      <a href="/" className="vault-action">RETURN TO FIELD <span>→</span></a>
    </section>
  </main>;
}

function ProjectsIndex({ sources }) {
  const [activeSourceId, setActiveSourceId] = useState(sources[0]?.id || null);
  const [summaries, setSummaries] = useState({});
  const activeSource = sources.find((source) => source.id === activeSourceId) || sources[0];

  useEffect(() => {
    const controller = new AbortController();
    let live = true;

    sources.forEach((source) => {
      fetchProjectSummary(source, { signal: controller.signal })
        .then((summary) => {
          if (!live) return;
          setSummaries((previous) => ({ ...previous, [source.id]: summary }));
        })
        .catch((error) => {
          if (!live || error.name === "AbortError") return;
          setSummaries((previous) => ({
            ...previous,
            [source.id]: source.kind === "inline"
              ? source.label
              : `${source.owner}/${source.repo}`,
          }));
        });
    });

    return () => {
      live = false;
      controller.abort();
    };
  }, [sources]);

  return <div className="vault-screen">
    <ProjectsHeader detail={`${String(sources.length).padStart(2, "0")} VAULT${sources.length === 1 ? "" : "S"}`} />
    {sources.length === 0 ? <EmptyProjects /> : <main className="projects-index">
      <div className="projects-intro">
        <p className="vault-eyebrow">PUBLIC KNOWLEDGE SYSTEMS / LIVE REPOSITORIES</p>
        <h1>PROJECT<br />VAULTS</h1>
        <p className="projects-intro-copy" id="project-summary">
          {summaries[activeSource?.id] || "READING REPOSITORY DESCRIPTION…"}
        </p>
      </div>
      <div className="project-list">
        {sources.map((source, index) => <a
          aria-describedby="project-summary"
          className="project-card"
          href={projectHref(source.id)}
          key={source.id}
          onFocus={() => setActiveSourceId(source.id)}
          onMouseEnter={() => setActiveSourceId(source.id)}
        >
          <span className="project-card-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="project-card-body">
            <span className="project-card-title">{source.label}</span>
            <span className="project-card-source">{sourceMetadata(source)}</span>
          </span>
          <span className="project-card-arrow" aria-hidden="true">↗</span>
        </a>)}
      </div>
      <div className="projects-axis" aria-hidden="true">
        <span>LOCAL CACHE</span><i /><span>GITHUB HEAD</span><i /><span>QUARTZ OFM</span>
      </div>
    </main>}
  </div>;
}

function FolderTreeNode({
  node,
  sourceId,
  activePath,
  depth,
  onFileSelect,
  revision,
}) {
  const containsActivePath = Boolean(
    activePath && (activePath === node.path || activePath.startsWith(`${node.path}/`)),
  );
  const [open, setOpen] = useState(depth < 2 || containsActivePath);

  useEffect(() => {
    if (containsActivePath) setOpen(true);
  }, [containsActivePath]);

  return <li className="vault-tree-folder">
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary><span className="vault-tree-fold">+</span>{node.name}</summary>
      <ul>{node.children.map((child) => <FileTreeNode
        activePath={activePath}
        depth={depth + 1}
        key={`${child.type}:${child.path}`}
        node={child}
        onFileSelect={onFileSelect}
        revision={revision}
        sourceId={sourceId}
      />)}</ul>
    </details>
  </li>;
}

function FileTreeNode({
  node,
  sourceId,
  activePath,
  depth = 0,
  onFileSelect,
  revision,
}) {
  if (node.type === "folder") {
    return <FolderTreeNode
      activePath={activePath}
      depth={depth}
      node={node}
      onFileSelect={onFileSelect}
      revision={revision}
      sourceId={sourceId}
    />;
  }

  return <li>
    <a
      className={node.path === activePath ? "vault-tree-note is-active" : "vault-tree-note"}
      href={projectHref(sourceId, node.path, { revision })}
      onClick={(event) => {
        if (
          event.button === 0
          && !event.metaKey
          && !event.ctrlKey
          && !event.shiftKey
          && !event.altKey
        ) onFileSelect?.();
      }}
      title={node.path}
    >
      <span className="vault-tree-glyph" aria-hidden="true">
        {node.fileType === "markdown" ? "◇" : "□"}
      </span>
      <span>{node.name}</span>
    </a>
  </li>;
}

function VaultSidebar({
  activePath,
  buttonRef,
  historyOpen,
  onFileSelect,
  onHistory,
  revision,
  snapshot,
  source,
}) {
  const commit = snapshot.headCommit || {};
  const message = commit.message || "Commit message unavailable";
  const committedAt = commit.committedAt || commit.authoredAt || snapshot.committedAt;
  const stateLabel = revision ? "CHECKED OUT" : "HEAD COMMIT";
  const commitLabel = formatCommit(snapshot.commitSha);

  return <aside className="vault-sidebar">
    <div className="vault-sidebar-head">
      <span>{source.root ? `${source.root} / TREE` : "FILE SYSTEM"}</span>
      <span>{snapshot.files.length} FILES</span>
    </div>
    <nav aria-label={`${source.label} files`}>
      <ul className="vault-tree-root">
        {snapshot.tree.children.map((node) => <FileTreeNode
          activePath={activePath}
          key={`${node.type}:${node.path}`}
          node={node}
          onFileSelect={onFileSelect}
          revision={revision}
          sourceId={source.id}
        />)}
      </ul>
    </nav>
    <button
      aria-controls="vault-repository-history"
      aria-expanded={historyOpen}
      aria-label={`Open repository history. ${stateLabel}: ${message}, ${commitLabel}`}
      className="vault-sidebar-foot"
      onClick={onHistory}
      ref={buttonRef}
      type="button"
    >
      <span>{stateLabel}</span>
      <strong>{commitLabel}</strong>
      <span className="vault-sidebar-commit-message">{message}</span>
      {committedAt && <time dateTime={committedAt}>
        {formatHistoryDate(committedAt)}
      </time>}
      <span className="vault-sidebar-history-affordance">VIEW HISTORY →</span>
    </button>
  </aside>;
}

function findFile(snapshot, path) {
  return snapshot.files.find((file) => file.path === path);
}

function cleanInternalTarget(value) {
  return String(value || "")
    .replace(/\.html(?=#|$)/i, "")
    .replace(/%20/g, " ");
}

function transclusionNodes(container, blockReference) {
  if (!blockReference) return [...container.childNodes];
  const reference = decodeURIComponent(blockReference.replace(/^#/, ""));
  const target = [...container.querySelectorAll("[id]")].find((node) => (
    node.id === reference || node.id === reference.replace(/^\^/, "")
  ));
  if (!target) return [];
  if (!/^h[1-6]$/i.test(target.tagName)) return [target];

  const rank = Number(target.tagName.slice(1));
  const nodes = [target];
  let sibling = target.nextSibling;
  while (sibling) {
    if (sibling.nodeType === Node.ELEMENT_NODE && /^h[1-6]$/i.test(sibling.tagName)) {
      if (Number(sibling.tagName.slice(1)) <= rank) break;
    }
    nodes.push(sibling);
    sibling = sibling.nextSibling;
  }
  return nodes;
}

async function expandTransclusions(scope, snapshot, parentPath, depth = 0, ancestry = new Set()) {
  const placeholders = [...scope.querySelectorAll("blockquote.transclude:not([data-hydrated])")];
  const paths = snapshot.files.map((candidate) => candidate.path);

  for (const block of placeholders) {
    const target = resolveNoteTarget(block.dataset.url || "", parentPath, paths);
    if (!target) {
      block.dataset.hydrated = "missing";
      block.classList.add("is-missing");
      continue;
    }
    if (depth >= 4 || ancestry.has(target.path)) {
      block.dataset.hydrated = "recursive";
      block.classList.add("is-recursive");
      continue;
    }

    const embedded = findFile(snapshot, target.path);
    if (!embedded) continue;
    const { renderMarkdown } = await loadRenderer();
    const result = await renderMarkdown(embedded.content || "", { path: embedded.path });
    const parsed = document.createElement("div");
    parsed.innerHTML = result.html;
    const nodes = transclusionNodes(parsed, block.dataset.block || "");

    block.replaceChildren();
    block.dataset.hydrated = nodes.length ? "ready" : "missing-block";
    block.dataset.sourcePath = embedded.path;
    if (block.dataset.embedAlias) {
      const label = document.createElement("div");
      label.className = "transclude-label";
      label.textContent = block.dataset.embedAlias;
      block.append(label);
    }
    const content = document.createElement("div");
    content.className = "transclude-content";
    content.dataset.sourcePath = embedded.path;
    if (nodes.length) nodes.forEach((node) => content.append(node));
    else content.textContent = `Embedded block ${block.dataset.block || ""} was not found in ${embedded.path}.`;
    block.append(content);

    await expandTransclusions(
      content,
      snapshot,
      embedded.path,
      depth + 1,
      new Set([...ancestry, target.path]),
    );
  }
}

function useRenderedNote(file) {
  const [rendered, setRendered] = useState({ html: "", frontmatter: {}, hasMermaid: false, error: null });

  useEffect(() => {
    let live = true;
    setRendered((previous) => ({ ...previous, html: "", error: null }));
    loadRenderer()
      .then(({ renderMarkdown }) => renderMarkdown(file?.content || "", { path: file?.path || "index.md" }))
      .then((result) => live && setRendered({ ...result, error: null }))
      .catch((error) => live && setRendered({ html: "", frontmatter: {}, hasMermaid: false, error }));
    return () => { live = false; };
  }, [file?.path, file?.blobSha, file?.content]);

  return rendered;
}

function useSelectedFileHistory(source, snapshot, file) {
  const [history, setHistory] = useState({
    status: "idle",
    commits: [],
    pagination: { hasNextPage: false },
    error: null,
    moreError: null,
    loadingMore: false,
    transport: null,
    requestKey: null,
  });

  useEffect(() => {
    if (!file?.repoPath || !snapshot?.commitSha) {
      setHistory({
        status: "idle",
        commits: [],
        pagination: { hasNextPage: false },
        error: null,
        moreError: null,
        loadingMore: false,
        transport: null,
        requestKey: null,
      });
      return undefined;
    }

    let live = true;
    const controller = new AbortController();
    const requestKey = `${source.id}@${snapshot.commitSha}:${file.repoPath}`;
    setHistory({
      status: "loading",
      commits: [],
      pagination: { hasNextPage: false },
      error: null,
      moreError: null,
      loadingMore: false,
      transport: null,
      requestKey,
    });

    const load = async () => {
      let cached = null;
      try {
        cached = source.kind === "inline"
          ? null
          : await readFileHistory(source.id, file.repoPath, snapshot.commitSha, 1);
      } catch {
        cached = null;
      }

      if (cached) {
        if (live) setHistory({
          ...cached,
          status: "ready",
          error: null,
          moreError: null,
          loadingMore: false,
          requestKey,
        });
        return;
      }

      const requestSource = source.kind === "inline"
        ? source
        : { ...source, ref: snapshot.commitSha };
      const fetched = await fetchFileHistory(requestSource, file.repoPath, {
        headSha: snapshot.commitSha,
        page: 1,
        signal: controller.signal,
      });
      if (!live) return;
      const cacheable = {
        ...fetched,
        headSha: fetched.headSha || snapshot.commitSha,
      };
      const normalized = {
        ...cacheable,
        status: "ready",
        error: null,
        moreError: null,
        loadingMore: false,
        requestKey,
      };
      setHistory(normalized);
      if (source.kind !== "inline") {
        saveFileHistory(source.id, file.repoPath, snapshot.commitSha, 1, cacheable).catch(() => {});
      }
    };

    load().catch((error) => {
      if (!live || error.name === "AbortError") return;
      setHistory({
        status: "error",
        commits: [],
        pagination: { hasNextPage: false },
        error,
        moreError: null,
        loadingMore: false,
        transport: null,
        requestKey,
      });
    });

    return () => {
      live = false;
      controller.abort();
    };
  }, [
    file?.path,
    file?.repoPath,
    snapshot?.commitSha,
    source.id,
    source.kind,
    source.webProxy,
  ]);

  const loadMore = async () => {
    if (
      history.status !== "ready"
      || history.loadingMore
      || !history.pagination?.hasNextPage
      || !file?.repoPath
    ) return;

    const pageKey = history.transport === "github-web"
      ? history.pagination.endCursor
      : history.pagination.nextPage;
    if (pageKey === null || pageKey === undefined || pageKey === "") return;

    const requestKey = `${source.id}@${snapshot.commitSha}:${file.repoPath}`;
    setHistory((previous) => previous.requestKey === requestKey
      ? { ...previous, loadingMore: true, moreError: null }
      : previous);

    try {
      let next = source.kind === "inline"
        ? null
        : await readFileHistory(source.id, file.repoPath, snapshot.commitSha, pageKey);
      if (!next) {
        const requestSource = source.kind === "inline"
          ? source
          : { ...source, ref: snapshot.commitSha };
        next = await fetchFileHistory(requestSource, file.repoPath, {
          headSha: snapshot.commitSha,
          page: history.transport === "github-api" ? pageKey : undefined,
          after: history.transport === "github-web" ? pageKey : undefined,
        });
        if (source.kind !== "inline") {
          saveFileHistory(
            source.id,
            file.repoPath,
            snapshot.commitSha,
            pageKey,
            next,
          ).catch(() => {});
        }
      }

      setHistory((previous) => {
        if (previous.requestKey !== requestKey) return previous;
        const commits = [...previous.commits, ...(next.commits || [])];
        const uniqueCommits = commits.filter((commit, index) => (
          commits.findIndex((candidate) => candidate.sha === commit.sha) === index
        ));
        return {
          ...previous,
          commits: uniqueCommits,
          groups: [...(previous.groups || []), ...(next.groups || [])],
          pagination: next.pagination || { hasNextPage: false },
          loadingMore: false,
          moreError: null,
        };
      });
    } catch (error) {
      setHistory((previous) => previous.requestKey === requestKey
        ? { ...previous, loadingMore: false, moreError: error }
        : previous);
    }
  };

  return { ...history, loadMore };
}

function useRepositoryHistory(source, headSnapshot, enabled) {
  const [history, setHistory] = useState({
    status: "idle",
    commits: [],
    pagination: { hasNextPage: false },
    error: null,
    moreError: null,
    loadingMore: false,
    transport: null,
    requestKey: null,
  });
  const moreControllerRef = useRef(null);

  useEffect(() => {
    moreControllerRef.current?.abort();
    if (!enabled || !headSnapshot?.commitSha) {
      setHistory({
        status: "idle",
        commits: [],
        pagination: { hasNextPage: false },
        error: null,
        moreError: null,
        loadingMore: false,
        transport: null,
        requestKey: null,
      });
      return undefined;
    }

    let live = true;
    const controller = new AbortController();
    const requestKey = `${source.id}@${headSnapshot.commitSha}:repository`;
    setHistory({
      status: "loading",
      commits: [],
      pagination: { hasNextPage: false },
      error: null,
      moreError: null,
      loadingMore: false,
      transport: null,
      requestKey,
    });

    fetchRepositoryHistory(source, {
      headSha: headSnapshot.commitSha,
      page: 1,
      signal: controller.signal,
    }).then((result) => {
      if (!live) return;
      setHistory({
        ...result,
        headSha: result.headSha || headSnapshot.commitSha,
        status: "ready",
        error: null,
        moreError: null,
        loadingMore: false,
        requestKey,
      });
    }).catch((error) => {
      if (!live || error.name === "AbortError") return;
      setHistory({
        status: "error",
        commits: [],
        pagination: { hasNextPage: false },
        error,
        moreError: null,
        loadingMore: false,
        transport: null,
        requestKey,
      });
    });

    return () => {
      live = false;
      controller.abort();
      moreControllerRef.current?.abort();
    };
  }, [
    enabled,
    headSnapshot?.commitSha,
    source.id,
    source.kind,
    source.ref,
    source.webProxy,
  ]);

  const loadMore = async () => {
    if (
      history.status !== "ready"
      || history.loadingMore
      || !history.pagination?.hasNextPage
    ) return;

    const pageKey = history.transport === "github-web"
      ? history.pagination.endCursor
      : history.pagination.nextPage;
    if (pageKey === null || pageKey === undefined || pageKey === "") return;

    const requestKey = `${source.id}@${headSnapshot.commitSha}:repository`;
    const controller = new AbortController();
    moreControllerRef.current?.abort();
    moreControllerRef.current = controller;
    setHistory((previous) => previous.requestKey === requestKey
      ? { ...previous, loadingMore: true, moreError: null }
      : previous);

    try {
      const next = await fetchRepositoryHistory(source, {
        headSha: headSnapshot.commitSha,
        page: history.transport === "github-api" ? pageKey : undefined,
        after: history.transport === "github-web" ? pageKey : undefined,
        signal: controller.signal,
      });

      setHistory((previous) => {
        if (previous.requestKey !== requestKey) return previous;
        const commits = [...previous.commits, ...(next.commits || [])];
        const uniqueCommits = commits.filter((commit, index) => (
          commits.findIndex((candidate) => candidate.sha === commit.sha) === index
        ));
        return {
          ...previous,
          commits: uniqueCommits,
          groups: [...(previous.groups || []), ...(next.groups || [])],
          pagination: next.pagination || { hasNextPage: false },
          loadingMore: false,
          moreError: null,
        };
      });
    } catch (error) {
      if (error.name === "AbortError") return;
      setHistory((previous) => previous.requestKey === requestKey
        ? { ...previous, loadingMore: false, moreError: error }
        : previous);
    } finally {
      if (moreControllerRef.current === controller) moreControllerRef.current = null;
    }
  };

  return { ...history, loadMore };
}

function CommitControl({ expanded, history, onOpen }) {
  const latest = history.commits?.[0];
  const label = history.status === "loading"
    ? "RESOLVING FILE COMMIT"
    : latest?.message || (history.status === "error" ? "HISTORY UNAVAILABLE" : "NO FILE COMMITS");
  const sha = latest?.shortSha || latest?.sha?.slice(0, 7) || "—";

  return <button
    aria-controls="vault-file-history"
    aria-expanded={expanded}
    className="vault-commit-control"
    type="button"
    onClick={onOpen}
  >
    <span>{label}</span>
    <strong>{sha}</strong>
  </button>;
}

function DocumentMeta({ file, history, historyOpen, onHistory }) {
  return <div className="vault-document-meta">
    <span className="vault-document-path">{file.path}</span>
    <CommitControl expanded={historyOpen} history={history} onOpen={onHistory} />
  </div>;
}

function VaultReader({
  anchor,
  file,
  history,
  historyOpen,
  onHistory,
  revision,
  snapshot,
  source,
}) {
  const articleRef = useRef(null);
  const rendered = useRenderedNote(file);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !rendered.html) return undefined;

    const click = (event) => {
      const link = event.target.closest("a[href]");
      if (!link || !article.contains(link)) return;
      const href = link.getAttribute("href");
      if (!href || EXTERNAL_PROTOCOL.test(href)) return;

      if (href.startsWith("#")) {
        event.preventDefault();
        navigateTo(`${projectHref(source.id, file.path, { revision })}${href}`);
        return;
      }

      const target = resolveNoteTarget(
        cleanInternalTarget(href),
        link.closest("[data-source-path]")?.dataset.sourcePath || file.path,
        snapshot.files.map((candidate) => candidate.path),
      );
      if (target) {
        event.preventDefault();
        navigateTo(`${projectHref(source.id, target.path, { revision })}${target.anchor ? `#${target.anchor}` : ""}`);
        return;
      }

      const sourcePath = link.closest("[data-source-path]")?.dataset.sourcePath || file.path;
      const assetPath = resolveAssetTarget(
        cleanInternalTarget(href),
        sourcePath,
        snapshot.files.map((candidate) => candidate.path),
      );
      if (assetPath) {
        event.preventDefault();
        navigateTo(projectHref(source.id, assetPath, { revision }));
        return;
      }

      if (source.kind !== "inline") {
        const contextFile = findFile(snapshot, sourcePath) || file;
        const repositoryPath = resolveRepositoryTarget(href, contextFile.repoPath);
        link.setAttribute(
          "href",
          `https://github.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/blob/${encodeURIComponent(snapshot.commitSha)}/${repositoryPath.split("/").map(encodeURIComponent).join("/")}`,
        );
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noreferrer");
      }
    };
    article.addEventListener("click", click);

    let cancelled = false;
    const prepare = async () => {
      await expandTransclusions(article, snapshot, file.path, 0, new Set([file.path]));
      if (cancelled) return;

      if (anchor) {
        const decodedAnchor = decodeURIComponent(anchor).replace(/^\^/, "");
        const anchorTarget = [...article.querySelectorAll("[id]")].find((node) => node.id === decodedAnchor);
        anchorTarget?.scrollIntoView({ block: "start" });
      }

      const allPaths = snapshot.files.map((candidate) => candidate.path);
      const assetNodes = article.querySelectorAll("img[src], video[src], audio[src], source[src], iframe[src], object[data]");
      assetNodes.forEach((node) => {
        const attribute = node.tagName === "OBJECT" ? "data" : "src";
        const sourceUrl = node.getAttribute(attribute);
        if (!sourceUrl || EXTERNAL_PROTOCOL.test(sourceUrl) || sourceUrl.startsWith("data:")) return;
        const contextPath = node.closest("[data-source-path]")?.dataset.sourcePath || file.path;
        const assetPath = resolveAssetTarget(sourceUrl, contextPath, allPaths);
        const asset = snapshot.files.find((candidate) => candidate.path === assetPath);
        if (asset && source.kind !== "inline") {
          node.setAttribute(attribute, rawGithubUrl(source, snapshot.commitSha, asset.repoPath));
        }
      });

      const diagrams = [...article.querySelectorAll("code.mermaid")];
      if (!diagrams.length) return;
      const { default: mermaid } = await import("mermaid");
      if (cancelled) return;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        fontFamily: "Space Mono, monospace",
        themeVariables: {
          background: "#f6f6f5",
          primaryColor: "#ded9e8",
          primaryTextColor: "#17151d",
          primaryBorderColor: "#534763",
          lineColor: "#534763",
          secondaryColor: "#f6f6f5",
          tertiaryColor: "#ebe9ef",
        },
      });
      await mermaid.run({ nodes: diagrams, suppressErrors: true });
    };
    prepare().catch(() => {});

    return () => {
      cancelled = true;
      article.removeEventListener("click", click);
    };
  }, [anchor, file.path, rendered.html, revision, snapshot, source]);

  if (rendered.error) return <div className="vault-reader-error">
    <p className="vault-eyebrow">RENDER FAILURE</p>
    <h2>THE NOTE COULD NOT BE TRANSFORMED.</h2>
    <pre>{rendered.error.message}</pre>
  </div>;

  if (!rendered.html) return <div className="vault-reader-loading">TRANSFORMING NOTE / QUARTZ OFM…</div>;

  return <>
    <DocumentMeta
      file={file}
      history={history}
      historyOpen={historyOpen}
      onHistory={onHistory}
    />
    <article
      className="vault-article"
      dangerouslySetInnerHTML={{ __html: rendered.html }}
      ref={articleRef}
    />
  </>;
}

function AssetReader({ file, history, historyOpen, onHistory, snapshot, source }) {
  const extension = file.path.split(".").pop()?.toUpperCase() || "FILE";
  const rawUrl = source.kind === "inline"
    ? null
    : rawGithubUrl(source, snapshot.commitSha, file.repoPath);
  const image = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(file.path);

  return <>
    <DocumentMeta
      file={file}
      history={history}
      historyOpen={historyOpen}
      onHistory={onHistory}
    />
    <div className="vault-asset">
      <p className="vault-eyebrow">REPOSITORY OBJECT / {extension}</p>
      <h1>{file.path.split("/").at(-1)}</h1>
      <dl>
        <div><dt>PATH</dt><dd>{file.repoPath}</dd></div>
        <div><dt>OBJECT</dt><dd>{file.blobSha?.slice(0, 12) || "UNAVAILABLE"}</dd></div>
        <div><dt>SIZE</dt><dd>{file.size ? `${file.size.toLocaleString()} BYTES` : "UNAVAILABLE"}</dd></div>
      </dl>
      {image && rawUrl && <img src={rawUrl} alt={file.path.split("/").at(-1)} />}
      {rawUrl && <a className="vault-action" href={rawUrl} rel="noreferrer" target="_blank">
        OPEN RAW OBJECT <span>↗</span>
      </a>}
    </div>
  </>;
}

function CommitHistory({
  emptyLabel,
  githubHistoryUrl,
  history,
  renderAction,
}) {
  return <>
    {history.status === "loading" && <div
      aria-live="polite"
      className="vault-history-state"
      role="status"
    >
      LOADING COMMIT GROUPS…
    </div>}
    {history.status === "error" && <div className="vault-history-state is-error" role="alert">
      <strong>HISTORY REQUEST FAILED</strong>
      <span>{history.error?.message}</span>
      {githubHistoryUrl && <a href={githubHistoryUrl} rel="noreferrer" target="_blank">OPEN ON GITHUB ↗</a>}
    </div>}
    {history.status === "ready" && history.commits.length === 0 && <div className="vault-history-state">
      {emptyLabel}
    </div>}

    {history.commits?.length > 0 && <ol className="vault-history-list">
      {history.commits.map((commit, index) => {
        const shortSha = (commit.shortSha || commit.sha?.slice(0, 7) || "LOCAL").toUpperCase();
        return <li key={commit.sha || `${commit.message}:${index}`}>
          <div className="vault-history-index">{String(index + 1).padStart(2, "0")}</div>
          <div className="vault-history-entry">
            <div className="vault-history-message">
              <h2>{commit.message}</h2>
              {commit.body && <p>{commit.body}</p>}
            </div>
            <div className="vault-history-facts">
              <span>{commit.author?.name || commit.authors?.[0]?.name || commit.authors?.[0]?.login || "UNKNOWN AUTHOR"}</span>
              <time dateTime={commit.committedAt || commit.authoredAt || undefined}>
                {formatHistoryDate(commit.committedAt || commit.authoredAt)}
              </time>
              <div className="vault-history-entry-actions">
                {renderAction?.(commit)}
                {commit.url
                  ? <a
                    aria-label={`Open commit ${shortSha} on GitHub`}
                    href={commit.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    GITHUB / {shortSha} ↗
                  </a>
                  : <strong>{shortSha}</strong>}
              </div>
            </div>
          </div>
        </li>;
      })}
    </ol>}

    {history.pagination?.hasNextPage && <div className="vault-history-more">
      <button type="button" disabled={history.loadingMore} onClick={history.loadMore}>
        {history.loadingMore ? "LOADING NEXT COMMIT GROUP…" : "LOAD EARLIER COMMITS ↓"}
      </button>
      {history.moreError && <span aria-live="polite">{history.moreError.message}</span>}
    </div>}
  </>;
}

function FileHistoryPanel({ file, history, onClose, snapshot, source }) {
  const githubHistoryUrl = source.kind === "inline"
    ? null
    : `https://github.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/commits/${encodeURIComponent(snapshot.commitSha)}/${file.repoPath.split("/").map(encodeURIComponent).join("/")}`;

  return <div
    aria-busy={history.status === "loading"}
    aria-labelledby="vault-file-history-title"
    className="vault-history"
    id="vault-file-history"
    role="region"
  >
    <div className="vault-history-head">
      <div>
        <p className="vault-eyebrow">FILE REVISION LOG / {history.transport || "PENDING"}</p>
        <h1 id="vault-file-history-title">{file.path.split("/").at(-1)}</h1>
        <code>{file.path}</code>
      </div>
      <button type="button" onClick={onClose}>← RETURN TO FILE</button>
    </div>

    <CommitHistory
      emptyLabel="NO COMMITS WERE RETURNED FOR THIS PATH."
      githubHistoryUrl={githubHistoryUrl}
      history={history}
    />

    <div className="vault-history-foot">
      <span>VIEWED SNAPSHOT / {formatCommit(snapshot.commitSha)}</span>
      {githubHistoryUrl && <a href={githubHistoryUrl} rel="noreferrer" target="_blank">VERIFY ON GITHUB ↗</a>}
    </div>
  </div>;
}

function RepositoryHistoryPanel({
  currentSnapshot,
  headSnapshot,
  history,
  onClose,
  onSelect,
  panelRef,
  revision,
  source,
}) {
  const githubHistoryUrl = source.kind === "inline"
    ? null
    : `https://github.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/commits/${encodeURIComponent(source.ref || "main")}`;
  const currentSha = currentSnapshot.commitSha?.toLowerCase();
  const headSha = headSnapshot.commitSha?.toLowerCase();
  const checkedOut = Boolean(revision);

  return <div
    aria-busy={history.status === "loading"}
    aria-labelledby="vault-repository-history-title"
    className="vault-history"
    id="vault-repository-history"
    ref={panelRef}
    role="region"
    tabIndex={-1}
  >
    <div className="vault-history-head">
      <div>
        <p className="vault-eyebrow">BRANCH REVISION LOG / {history.transport || "PENDING"}</p>
        <h1 id="vault-repository-history-title">{source.label} TREE</h1>
        <code>{sourceMetadata(source)}</code>
      </div>
      <div className="vault-history-head-actions">
        {checkedOut && <button type="button" onClick={() => onSelect(null)}>RETURN TO HEAD</button>}
        <button type="button" onClick={onClose}>← RETURN TO CURRENT FILE</button>
      </div>
    </div>

    <CommitHistory
      emptyLabel="NO COMMITS WERE RETURNED FOR THIS BRANCH."
      githubHistoryUrl={githubHistoryUrl}
      history={history}
      renderAction={(commit) => {
        const commitSha = commit.sha?.toLowerCase();
        const isCurrent = commitSha === currentSha;
        const isHead = commitSha === headSha;
        const label = isCurrent ? "CURRENT" : isHead ? "RETURN TO HEAD" : "CHECK OUT";
        return <button
          aria-current={isCurrent ? "true" : undefined}
          aria-label={`${label === "CHECK OUT" ? "Check out repository tree at" : label.toLowerCase()} commit ${commit.sha}`}
          className="vault-history-checkout"
          disabled={isCurrent || !isFullCommitSha(commit.sha)}
          onClick={() => onSelect(isHead ? null : commit.sha)}
          type="button"
        >
          {label}
        </button>;
      }}
    />

    <div className="vault-history-foot">
      <span>VIEWING / {formatCommit(currentSnapshot.commitSha)}</span>
      <span>HEAD / {formatCommit(headSnapshot.commitSha)}</span>
      {githubHistoryUrl && <a href={githubHistoryUrl} rel="noreferrer" target="_blank">VERIFY BRANCH ON GITHUB ↗</a>}
    </div>
  </div>;
}

function MissingNote({ path, revision, source }) {
  return <div className="vault-reader-error">
    <p className="vault-eyebrow">PATH RESOLUTION FAILURE</p>
    <h2>NOTE NOT FOUND.</h2>
    <code>{path}</code>
    <a className="vault-action" href={projectHref(source.id, null, { revision })}>OPEN VAULT ROOT <span>→</span></a>
  </div>;
}

function VaultView({ anchor, notePath, revision, source }) {
  const [headSnapshot, setHeadSnapshot] = useState(null);
  const [checkout, setCheckout] = useState({
    revision: null,
    status: "idle",
    snapshot: null,
    error: null,
  });
  const [phase, setPhase] = useState("loading");
  const [warning, setWarning] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [historyMode, setHistoryMode] = useState(null);
  const repositoryButtonRef = useRef(null);
  const repositoryPanelRef = useRef(null);

  useEffect(() => {
    let live = true;
    let pollTimer;
    let currentSnapshot = null;
    let refreshing = false;
    setPhase("loading");
    setWarning(null);

    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      setPhase("checking");
      try {
        const fresh = await syncSource(source, currentSnapshot);
        if (!live) return;
        if (fresh) {
          currentSnapshot = fresh;
          setHeadSnapshot(fresh);
        }
        setWarning(null);
        setPhase("ready");
      } catch (error) {
        if (!live) return;
        setWarning(error);
        setPhase(currentSnapshot ? "stale" : "error");
      } finally {
        refreshing = false;
      }
    };

    (async () => {
      try {
        currentSnapshot = await loadSourceSnapshot(source);
        if (!live) return;
        if (currentSnapshot) setHeadSnapshot(currentSnapshot);
        await refresh();
        if (live && source.kind !== "inline") {
          pollTimer = window.setInterval(refresh, source.pollIntervalMs || 5 * 60 * 1000);
        }
      } catch (error) {
        if (!live) return;
        setWarning(error);
        setPhase("error");
      }
    })();

    return () => {
      live = false;
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [source, attempt]);

  const headAvailable = Boolean(headSnapshot);
  useEffect(() => {
    if (!revision) {
      setCheckout({
        revision: null,
        status: "idle",
        snapshot: null,
        error: null,
      });
      return undefined;
    }
    if (!headAvailable) {
      setCheckout({
        revision,
        status: "waiting",
        snapshot: null,
        error: null,
      });
      return undefined;
    }

    const requestedRevision = revision.toLowerCase();
    if (headSnapshot.commitSha?.toLowerCase() === requestedRevision) {
      setCheckout({
        revision: requestedRevision,
        status: "ready",
        snapshot: headSnapshot,
        error: null,
      });
      return undefined;
    }

    let live = true;
    const controller = new AbortController();
    setCheckout({
      revision: requestedRevision,
      status: "loading",
      snapshot: null,
      error: null,
    });

    loadSnapshotAtCommit(source, requestedRevision, headSnapshot, {
      signal: controller.signal,
    }).then((snapshot) => {
      if (!live) return;
      if (snapshot?.commitSha?.toLowerCase() !== requestedRevision) {
        throw new Error("GitHub returned a different commit than the requested revision.");
      }
      setCheckout({
        revision: requestedRevision,
        status: "ready",
        snapshot,
        error: null,
      });
    }).catch((error) => {
      if (!live || error.name === "AbortError") return;
      setCheckout({
        revision: requestedRevision,
        status: "error",
        snapshot: null,
        error,
      });
    });

    return () => {
      live = false;
      controller.abort();
    };
  }, [headAvailable, revision, source]);

  const snapshot = revision ? checkout.snapshot : headSnapshot;
  const requestedFile = snapshot && notePath ? findFile(snapshot, notePath) : null;
  const selectedPath = revision && notePath && !requestedFile
    ? snapshot?.initialNote
    : notePath || snapshot?.initialNote;
  const file = snapshot && selectedPath ? findFile(snapshot, selectedPath) : null;
  const history = useSelectedFileHistory(source, snapshot, file);
  const repositoryHistory = useRepositoryHistory(
    source,
    headSnapshot,
    historyMode === "repository",
  );

  useEffect(() => {
    setHistoryMode(null);
    if (file?.path) window.scrollTo({ top: 0, left: 0 });
  }, [file?.path, snapshot?.commitSha]);

  useEffect(() => {
    if (
      !revision
      || checkout.status !== "ready"
      || !snapshot
      || !notePath
      || requestedFile
      || !snapshot.initialNote
    ) return;
    navigateTo(projectHref(source.id, snapshot.initialNote, { revision }), { replace: true });
  }, [
    checkout.status,
    notePath,
    requestedFile,
    revision,
    snapshot,
    source.id,
  ]);

  useEffect(() => {
    if (historyMode !== "repository") return undefined;
    const frame = window.requestAnimationFrame(() => repositoryPanelRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [historyMode]);

  const closeRepositoryHistory = () => {
    setHistoryMode(null);
    window.requestAnimationFrame(() => repositoryButtonRef.current?.focus());
  };

  const selectRevision = (nextRevision) => {
    const normalizedRevision = isFullCommitSha(nextRevision)
      ? String(nextRevision).toLowerCase()
      : null;
    const targetSnapshot = normalizedRevision ? null : headSnapshot;
    const targetPath = targetSnapshot && selectedPath && findFile(targetSnapshot, selectedPath)
      ? selectedPath
      : targetSnapshot?.initialNote || selectedPath;
    navigateTo(
      `${projectHref(source.id, targetPath, { revision: normalizedRevision })}${window.location.hash}`,
    );
    setHistoryMode(null);
  };

  const status = revision
    ? checkout.status === "error"
      ? { label: "REVISION ERROR", tone: "warn" }
      : checkout.status === "ready"
        ? { label: "COMMIT CHECKED OUT", tone: "warn" }
        : { label: "CHECKING OUT COMMIT", tone: "active" }
    : phase === "checking"
      ? { label: headSnapshot ? "CHECKING HEAD" : "FETCHING VAULT", tone: "active" }
      : phase === "stale"
        ? { label: "CACHED / OFFLINE", tone: "warn" }
        : phase === "error"
          ? { label: "SOURCE ERROR", tone: "warn" }
          : { label: "SNAPSHOT READY", tone: "ready" };

  if (!headSnapshot && phase !== "error") return <div className="vault-screen">
    <ProjectsHeader detail={source.label} status={status} />
    <div className="vault-fetching">
      <div className="vault-fetching-mark" aria-hidden="true"><i /><i /><i /><i /></div>
      <p>NEGOTIATING REPOSITORY TREE</p>
      <span>{sourceMetadata(source)}</span>
    </div>
  </div>;

  if (!headSnapshot) return <div className="vault-screen">
    <ProjectsHeader detail={source.label} status={status} />
    <div className="vault-reader-error vault-source-error">
      <p className="vault-eyebrow">REMOTE SOURCE FAILURE</p>
      <h2>NO LOCAL SNAPSHOT IS AVAILABLE.</h2>
      <pre>{warning?.message}</pre>
      <button className="vault-action" type="button" onClick={() => setAttempt((value) => value + 1)}>RETRY CONNECTION <span>→</span></button>
      <a className="vault-secondary-action" href="/projects">RETURN TO PROJECT INDEX</a>
    </div>
  </div>;

  if (revision && checkout.status === "error") return <div className="vault-screen">
    <ProjectsHeader detail={source.label} status={status} />
    <div className="vault-reader-error vault-source-error">
      <p className="vault-eyebrow">HISTORICAL SNAPSHOT FAILURE</p>
      <h2>THE REQUESTED COMMIT COULD NOT BE LOADED.</h2>
      <code>{revision}</code>
      <pre>{checkout.error?.message}</pre>
      <a
        className="vault-action"
        href={projectHref(
          source.id,
          notePath && findFile(headSnapshot, notePath)
            ? notePath
            : headSnapshot.initialNote,
        )}
      >
        RETURN TO HEAD <span>→</span>
      </a>
    </div>
  </div>;

  if (revision && !snapshot) return <div className="vault-screen">
    <ProjectsHeader detail={source.label} status={status} />
    <div className="vault-fetching">
      <div className="vault-fetching-mark" aria-hidden="true"><i /><i /><i /><i /></div>
      <p>LOADING COMMIT SNAPSHOT</p>
      <span>{formatCommit(revision)} / {sourceMetadata(source)}</span>
    </div>
  </div>;

  return <div className="vault-screen">
    <ProjectsHeader detail={source.label} status={status} />
    {warning && <div className="vault-warning" role="status">
      <span>SYNC WARNING</span>
      <p>
        {warning.message} {revision
          ? "The checked-out commit remains pinned."
          : "The cached HEAD remains active."}
      </p>
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>RETRY</button>
    </div>}
    <main className="vault-layout">
      <VaultSidebar
        activePath={selectedPath}
        buttonRef={repositoryButtonRef}
        historyOpen={historyMode === "repository"}
        onFileSelect={() => setHistoryMode(null)}
        onHistory={() => {
          if (historyMode === "repository") closeRepositoryHistory();
          else setHistoryMode("repository");
        }}
        revision={revision}
        snapshot={snapshot}
        source={source}
      />
      <section
        aria-busy={checkout.status === "loading"}
        className="vault-reader"
      >
        {historyMode === "repository"
          ? <RepositoryHistoryPanel
            currentSnapshot={snapshot}
            headSnapshot={headSnapshot}
            history={repositoryHistory}
            onClose={closeRepositoryHistory}
            onSelect={selectRevision}
            panelRef={repositoryPanelRef}
            revision={revision}
            source={source}
          />
          : file && historyMode === "file"
          ? <FileHistoryPanel
            file={file}
            history={history}
            onClose={() => setHistoryMode(null)}
            snapshot={snapshot}
            source={source}
          />
          : file?.type === "markdown"
            ? <VaultReader
              anchor={anchor}
              file={file}
              history={history}
              historyOpen={historyMode === "file"}
              onHistory={() => setHistoryMode("file")}
              revision={revision}
              snapshot={snapshot}
              source={source}
            />
            : file
              ? <AssetReader
                file={file}
                history={history}
                historyOpen={historyMode === "file"}
                onHistory={() => setHistoryMode("file")}
                snapshot={snapshot}
                source={source}
              />
              : <MissingNote path={selectedPath} revision={revision} source={source} />}
      </section>
    </main>
  </div>;
}

export default function VaultApp({ route }) {
  const sources = useMemo(() => configuredSources(), []);
  const {
    anchor,
    notePath,
    revision,
    revisionInvalid,
    sourceId,
  } = parseProjectsPath(route.pathname, route.hash, route.search);
  const source = sources.find((candidate) => candidate.id === sourceId);

  useEffect(() => {
    document.body.dataset.view = "vault";
    return () => { delete document.body.dataset.view; };
  }, []);

  if (!sourceId) return <ProjectsIndex sources={sources} />;
  if (revisionInvalid) return <div className="vault-screen">
    <ProjectsHeader detail="INVALID REVISION" status={{ label: "ROUTE ERROR", tone: "warn" }} />
    <div className="vault-reader-error vault-source-error">
      <p className="vault-eyebrow">COMMIT LOOKUP REJECTED</p>
      <h2>A FULL 40-CHARACTER COMMIT SHA IS REQUIRED.</h2>
      <a className="vault-action" href={projectHref(sourceId, notePath)}>
        RETURN TO HEAD <span>→</span>
      </a>
    </div>
  </div>;
  if (!source) return <div className="vault-screen">
    <ProjectsHeader detail="UNKNOWN SOURCE" status={{ label: "ROUTE ERROR", tone: "warn" }} />
    <div className="vault-reader-error vault-source-error">
      <p className="vault-eyebrow">PROJECT LOOKUP FAILURE</p>
      <h2>THE REQUESTED VAULT IS NOT CONFIGURED.</h2>
      <code>{sourceId}</code>
      <a className="vault-action" href="/projects">RETURN TO PROJECT INDEX <span>→</span></a>
    </div>
  </div>;

  return <VaultView
    anchor={anchor}
    notePath={notePath}
    revision={revision}
    source={source}
  />;
}
