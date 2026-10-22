import { projectHref, resolveVaultTarget } from "./model.js";
import { assetObjectUrl } from "./github.js";

export const HTML_DOCUMENT_SANDBOX = "allow-scripts allow-top-navigation-by-user-activation";
const HTML_SIZE_MESSAGE = "vault:html-size";

function reportHtmlSize(type) {
  let pending;
  let previousHeight;
  const measure = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      const body = document.body;
      const style = getComputedStyle(body);
      const height = Math.ceil(body.getBoundingClientRect().height
        + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0));
      if (height > 0 && height !== previousHeight) {
        previousHeight = height;
        parent.postMessage({ type, height }, "*");
      }
    });
  };
  new ResizeObserver(measure).observe(document.body);
  addEventListener("resize", measure);
  addEventListener("load", measure, { once: true });
  addEventListener("message", (event) => {
    if (event.source === parent && event.data?.type === `${type}:request`) {
      previousHeight = undefined;
      measure();
    }
  });
  document.fonts.ready.then(measure);
  measure();
}

export function fitHtmlDocument(frame) {
  if (!frame) return () => {};
  const view = frame.ownerDocument.defaultView;
  const requestSize = () => frame.contentWindow?.postMessage({ type: `${HTML_SIZE_MESSAGE}:request` }, "*");
  const resize = (event) => {
    const data = event.data;
    if (event.source !== frame.contentWindow || data?.type !== HTML_SIZE_MESSAGE
      || typeof data.height !== "number" || !Number.isFinite(data.height) || data.height <= 0) return;
    const style = view.getComputedStyle(frame);
    const border = style.boxSizing === "border-box"
      ? (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0) : 0;
    frame.style.height = `${Math.ceil(data.height + border)}px`;
  };
  view.addEventListener("message", resize);
  frame.addEventListener("load", requestSize);
  requestSize();
  return () => {
    view.removeEventListener("message", resize);
    frame.removeEventListener("load", requestSize);
  };
}

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
  const sizing = document.createElement("script");
  sizing.textContent = `(${reportHtmlSize.toString()})(${JSON.stringify(HTML_SIZE_MESSAGE)});`;
  document.body.append(sizing);
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
      cleanups.push(fitHtmlDocument(frame));
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
