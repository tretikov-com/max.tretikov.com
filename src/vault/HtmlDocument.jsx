import React, { useEffect, useState } from "react";
import { HTML_DOCUMENT_SANDBOX, prepareHtmlDocument } from "./html-document.js";

export default function HtmlDocument({ file, revision, snapshot, source, url }) {
  const [document, setDocument] = useState({ url: null, html: null, error: null });

  useEffect(() => {
    if (!url) return undefined;
    const controller = new AbortController();
    let live = true;
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`The HTML document could not load (${response.status}).`);
        const html = await response.text();
        return prepareHtmlDocument(html, { file, revision, snapshot, source, origin: window.location.origin });
      })
      .then((html) => { if (live) setDocument({ url, html, error: null }); })
      .catch((error) => { if (live) setDocument({ url, html: null, error }); });
    return () => {
      live = false;
      controller.abort();
    };
  }, [file, revision, snapshot, source, url]);

  if (document.url === url && document.error) return <p role="alert">{document.error.message}</p>;
  if (!url || document.url !== url || !document.html) return <p role="status">LOADING HTML DOCUMENT…</p>;
  return <iframe
    className="vault-html-document"
    referrerPolicy="no-referrer"
    sandbox={HTML_DOCUMENT_SANDBOX}
    srcDoc={document.html}
    title={file.path.split("/").at(-1)}
  />;
}
