import React, { useEffect, useState } from "react";
import { NDA_DOCUMENT } from "./nda-document.js";
import "../vault/vault.css";
import "./nda.css";

export default function NdaPage() {
  const [rendered, setRendered] = useState({ html: null, error: null });

  useEffect(() => {
    const previousTitle = window.document.title;
    window.document.title = "Non-Disclosure Agreement / Max Tretikov";
    window.document.documentElement.dataset.view = "vault";
    window.document.body.dataset.view = "vault";
    let live = true;
    import("../vault/renderer.js")
      .then(({ renderMarkdown }) => renderMarkdown(NDA_DOCUMENT.markdown, { path: "nda.md" }))
      .then(({ html }) => { if (live) setRendered({ html, error: null }); })
      .catch((error) => { if (live) setRendered({ html: null, error }); });
    return () => {
      live = false;
      window.document.title = previousTitle;
      delete window.document.documentElement.dataset.view;
      delete window.document.body.dataset.view;
    };
  }, []);

  return <div className="vault-screen nda-screen">
    <header className="vault-header">
      <a className="vault-wordmark" href="/">[ MAX TRETIKOV ]</a>
      <div className="vault-header-rule" aria-hidden="true" />
      <a className="vault-secondary-action" href="/projects/secret">BACK TO SIGN IN →</a>
    </header>
    <main className="nda-content">
      {!rendered.html && !rendered.error && <p role="status">Loading agreement…</p>}
      {rendered.error && <p role="alert">The agreement could not be displayed. Please reload before signing in.</p>}
      {rendered.html && <article className="vault-article nda-article" dangerouslySetInnerHTML={{ __html: rendered.html }} />}
      <p className="vault-caption">SECRET PROJECTS / CONFIDENTIALITY</p>
      <a className="vault-action nda-return" href="/projects/secret">BACK TO SIGN IN →</a>
    </main>
  </div>;
}
