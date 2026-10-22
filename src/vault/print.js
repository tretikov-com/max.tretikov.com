// Keep the live anchors intact while preventing PDF link annotations.
export function installPrintLinkHandling(article) {
  if (!article) return () => {};
  const view = article.ownerDocument.defaultView;
  const removed = [];
  const restore = () => {
    removed.splice(0).forEach(([link, attribute]) => link.setAttributeNode(attribute));
  };
  const beforePrint = () => {
    restore();
    for (const link of article.querySelectorAll("a, area")) {
      for (const name of ["href", "xlink:href"]) {
        const attribute = link.getAttributeNode(name);
        if (!attribute) continue;
        removed.push([link, attribute]);
        link.removeAttributeNode(attribute);
      }
    }
  };
  view.addEventListener("beforeprint", beforePrint);
  view.addEventListener("afterprint", restore);
  return () => {
    view.removeEventListener("beforeprint", beforePrint);
    view.removeEventListener("afterprint", restore);
    restore();
  };
}

// Wait for printed figures, including the live HTML preview's SVG fallback.
export async function waitForPrintAssets(article, timeoutMs = 15_000) {
  if (!article?.isConnected) throw new Error("The project brief is no longer open.");
  const images = [...article.querySelectorAll("img")].filter((image) => !image.closest(".print-hidden"));

  let timer;
  try {
    await Promise.race([
      Promise.all([
        article.ownerDocument.fonts.ready,
        ...images.map((image) => {
          image.loading = "eager";
          return image.decode().catch(() => {
            throw new Error("A figure could not load. Check your connection and try again.");
          });
        }),
      ]),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Fonts or figures are still loading. Try printing again in a moment."));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
