import { copyFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

await copyFile(
  new URL("dist/index.html", root),
  new URL("dist/404.html", root),
);

// One authored file, two conventional names. public/AGENTS.md is the source;
// /CLAUDE.md is the alias agents reaching for the Claude-specific name expect.
await copyFile(
  new URL("dist/AGENTS.md", root),
  new URL("dist/CLAUDE.md", root),
);
