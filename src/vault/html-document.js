import { projectHref, resolveVaultTarget } from "./model.js";
import { assetObjectUrl } from "./github.js";

export const HTML_DOCUMENT_SANDBOX = "allow-scripts allow-top-navigation-by-user-activation";

export function prepareHtmlDocument(html, { file, snapshot, source, revision, origin }) {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("base").forEach((base) => base.remove());
  const base = document.createElement("base");
  base.href = new URL(projectHref(source, file.path, { revision }), origin).href;
  base.target = "_top";
  document.head.prepend(base);

  const paths = snapshot.files.map((candidate) => candidate.path);
  for (const link of document.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href");
    if (!href || /^(?:[a-z]+:|\/\/)/i.test(href)) continue;
    if (href.startsWith("#")) {
      link.setAttribute("href", `about:srcdoc${href}`);
      link.setAttribute("target", "_self");
      continue;
    }
    const target = resolveVaultTarget(href, file.path, paths);
    if (target) {
      link.href = new URL(`${projectHref(source, target.path, { revision })}${target.anchor ? `#${target.anchor}` : ""}`, origin).href;
    }
  }
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

// A linked preview image stays available for print while its HTML runs on screen.
export async function renderHtmlPreviews(article, { file, snapshot, source, revision, signal }) {
  const cleanups = [];
  const cleanup = () => {
    signal?.removeEventListener("abort", cleanup);
    cleanups.splice(0).reverse().forEach((dispose) => dispose());
  };
  if (signal?.aborted) return cleanup;
  signal?.addEventListener("abort", cleanup, { once: true });
  const paths = snapshot.files.map((candidate) => candidate.path);
  for (const link of [...article.querySelectorAll("a:has(> img)")]) {
    const href = link.dataset.vaultTarget || link.getAttribute("href");
    if (!href || /^(?:[a-z]+:|\/\/)/i.test(href)) continue;
    const contextPath = link.closest("[data-source-path]")?.dataset.sourcePath || file.path;
    const target = resolveVaultTarget(href, contextPath, paths);
    const asset = snapshot.files.find((candidate) => candidate.path === target?.path);
    if (!asset || !/\.html?$/i.test(asset.path)) continue;
    try {
      const url = await assetObjectUrl(source, snapshot.commitSha, asset, { signal });
      if (source.private) {
        if (signal?.aborted) { URL.revokeObjectURL(url); return cleanup; }
        cleanups.push(() => URL.revokeObjectURL(url));
      }
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Unable to load the HTML preview (${response.status}).`);
      const html = prepareHtmlDocument(await response.text(), { file: asset, snapshot, source, revision, origin: article.ownerDocument.location.origin });
      if (signal?.aborted) return cleanup;
      const wrapper = article.ownerDocument.createElement("span");
      wrapper.className = "vault-html-embed";
      const frame = article.ownerDocument.createElement("iframe");
      frame.className = "vault-html-document";
      frame.setAttribute("sandbox", HTML_DOCUMENT_SANDBOX);
      frame.setAttribute("referrerpolicy", "no-referrer");
      frame.title = link.querySelector("img").alt || asset.path;
      frame.srcdoc = html;
      link.replaceWith(wrapper);
      wrapper.append(frame, link);
      cleanups.push(() => wrapper.replaceWith(link));
    } catch {
      if (signal?.aborted) return cleanup;
      // A working preview image still links to the full document on fetch failure.
    }
  }
  return cleanup;
}
