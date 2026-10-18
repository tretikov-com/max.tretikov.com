import { githubRequest, repositoryApiUrl } from "../vault/github.js";
import { isMarkdownPath } from "../vault/model.js";
import { attributedCommitMessage } from "./attribution.js";

export function validateNotePath(path) {
  const parts = String(path).split("/");
  if (!path || !isMarkdownPath(path) || parts.some((part) => !part || part === "." || part === ".." || part.startsWith("."))
    || /[\\\x00-\x1f\x7f]/.test(path)) {
    throw new Error("Use a relative Markdown path, such as Research/New idea.md.");
  }
  return path;
}

function request(source, path, body) {
  return githubRequest(source, repositoryApiUrl(source, path), body ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } : {});
}

export async function openReviewPullRequest(source, review) {
  const params = new URLSearchParams({ state: "all", head: `${source.owner}:${review.branch}`, base: source.ref });
  const { data: existing } = await request(source, `pulls?${params}`);
  if (existing.length) return { ...review, url: existing[0].html_url, number: existing[0].number };
  const { data } = await request(source, "pulls", {
    title: review.title,
    head: review.branch,
    base: source.ref,
    body: review.body,
  });
  return { ...review, url: data.html_url, number: data.number };
}

export async function submitNoteReview(source, snapshot, { path, content, message, existingFile }) {
  if (!source.private || !source.token || !source.author) throw new Error("Sign in before submitting an edit.");
  validateNotePath(path);
  const title = String(message || "").trim();
  if (!title) throw new Error("Add a commit message before submitting.");
  if (!snapshot?.treeSha || !snapshot?.commitSha) throw new Error("Load a branch snapshot before editing.");
  if (existingFile && existingFile.path !== path) throw new Error("An existing note's path cannot change in this editor.");
  if (!existingFile && snapshot.files.some((file) => file.path.toLowerCase() === path.toLowerCase())) {
    throw new Error("A file already exists at that path. Open it and choose Edit note.");
  }
  if (existingFile && existingFile.content === content) throw new Error("The note has no changes to submit.");
  const exclusions = source.exclude || [];
  if (exclusions.some((excluded) => path === excluded || path.startsWith(`${excluded}/`))) {
    throw new Error("That path is excluded from this project's vault.");
  }
  const repoPath = [source.root, path].filter(Boolean).join("/");
  const { data: blob } = await request(source, "git/blobs", { content, encoding: "utf-8" });
  const { data: tree } = await request(source, "git/trees", {
    base_tree: snapshot.treeSha,
    tree: [{ path: repoPath, mode: existingFile?.mode || "100644", type: "blob", sha: blob.sha }],
  });
  const { data: commit } = await request(source, "git/commits", {
    message: attributedCommitMessage(title, source),
    tree: tree.sha,
    parents: [snapshot.commitSha],
  });
  const branch = `review/${source.username}/${crypto.randomUUID()}`;
  await request(source, "git/refs", { ref: `refs/heads/${branch}`, sha: commit.sha });
  const review = {
    branch,
    title,
    body: `Update ${repoPath}.\n\nSubmitted by ${source.author.name} through the project editor.`,
    compareUrl: `https://github.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/compare/${encodeURIComponent(source.ref)}...${encodeURIComponent(branch)}`,
  };
  try {
    return await openReviewPullRequest(source, review);
  } catch (error) {
    error.review = review;
    throw error;
  }
}
