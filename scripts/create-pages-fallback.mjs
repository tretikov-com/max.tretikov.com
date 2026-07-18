import { copyFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

await copyFile(
  new URL("dist/index.html", root),
  new URL("dist/404.html", root),
);
