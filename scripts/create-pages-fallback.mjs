import { copyFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

await copyFile(
  new URL("dist/index.html", root),
  new URL("dist/404.html", root),
);

// One authored file, three conventional names. public/AGENTS.md is the source;
// /CLAUDE.md is the Claude-specific alias, while /AGENTS.txt gives clients that
// cannot consume text/markdown an equivalent text/plain endpoint.
await copyFile(
  new URL("dist/AGENTS.md", root),
  new URL("dist/CLAUDE.md", root),
);
await copyFile(
  new URL("dist/AGENTS.md", root),
  new URL("dist/AGENTS.txt", root),
);
