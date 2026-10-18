import React, { useEffect, useState } from "react";
import { openReviewPullRequest, submitNoteReview } from "./github-edit.js";

export default function VaultEditor({ source, snapshot, file, onClose }) {
  const [path, setPath] = useState(file?.path || "");
  const [content, setContent] = useState(file?.content || "");
  const [message, setMessage] = useState(file ? `Update ${file.path}` : "");
  const [phase, setPhase] = useState("editing");
  const [error, setError] = useState(null);
  const [review, setReview] = useState(null);
  const busy = phase === "saving";
  const dirty = phase !== "done" && (content !== (file?.content || "") || (!file && path));

  useEffect(() => {
    if (!dirty || review) return;
    const beforeUnload = (event) => { event.preventDefault(); event.returnValue = ""; };
    const beforeNavigation = (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link || link.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!window.confirm("Leave this page and discard your unsent changes?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigation, true);
    };
  }, [dirty, review]);

  const submit = async (event) => {
    event.preventDefault();
    setPhase("saving");
    setError(null);
    try {
      const result = review
        ? await openReviewPullRequest(source, review)
        : await submitNoteReview(source, snapshot, { path, content, message, existingFile: file });
      setReview(result);
      setPhase("done");
    } catch (failure) {
      if (failure.review) setReview(failure.review);
      setError(failure);
      setPhase("editing");
    }
  };

  if (phase === "done") return <section className="secret-editor-result" aria-live="polite">
    <h1>PR #{review.number}</h1>
    <p>{review.title}</p>
    <a className="vault-action" href={review.url} target="_blank" rel="noreferrer">OPEN PULL REQUEST ↗</a>
    <p>The project will update here when the pull request is merged.</p>
    <button className="vault-secondary-action" type="button" onClick={onClose}>RETURN TO READING</button>
    <p className="vault-caption">SUBMITTED FOR REVIEW</p>
  </section>;

  return <form className="secret-editor" onSubmit={submit}>
    <div className="secret-editor-heading">
      <p className="vault-eyebrow">{file ? "EDIT NOTE" : "NEW NOTE"} / MARKDOWN</p>
      <button className="vault-secondary-action" disabled={busy} onClick={() => {
        if (!dirty || review || window.confirm("Discard your unsent changes?")) onClose();
      }} type="button">CANCEL</button>
    </div>
    <label>NOTE PATH
      <input autoFocus={!file} disabled={busy || Boolean(file) || Boolean(review)} value={path} onChange={(event) => setPath(event.target.value)} placeholder="Research/New idea.md" required />
    </label>
    <label>MARKDOWN
      <textarea autoFocus={Boolean(file)} disabled={busy || Boolean(review)} value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} aria-label="Note Markdown" />
    </label>
    <label>COMMIT MESSAGE
      <input disabled={busy || Boolean(review)} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Describe your change" required />
    </label>
    <p className="secret-editor-author">CONTRIBUTOR / {source.author.name} &lt;{source.author.email}&gt;</p>
    {error && <p className="secret-error" role="alert">{error.message}</p>}
    {review && <p>Your commit is saved on a review branch. Retry opening the PR, or <a href={review.compareUrl} target="_blank" rel="noreferrer">open it on GitHub</a>.</p>}
    <button className="vault-action" disabled={busy} type="submit">{busy ? "SUBMITTING…" : review ? "RETRY PULL REQUEST →" : "CREATE PULL REQUEST →"}</button>
  </form>;
}
