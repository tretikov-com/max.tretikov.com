// Wait for the same fonts and figures the reader displays before opening print.
export async function waitForPrintAssets(article, timeoutMs = 15_000) {
  if (!article?.isConnected) throw new Error("The project brief is no longer open.");

  let timer;
  try {
    await Promise.race([
      Promise.all([
        article.ownerDocument.fonts.ready,
        ...[...article.querySelectorAll("img")].map((image) => {
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
