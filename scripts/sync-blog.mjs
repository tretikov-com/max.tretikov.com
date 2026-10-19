import { execFileSync } from "node:child_process";
import { writeFile, rename, rm } from "node:fs/promises";
import { BLOG_SOURCE } from "../src/blog/config.js";
import { fetchBlogSnapshot } from "../src/blog/github.js";

let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token && process.argv.includes("--if-configured")) {
  console.log("Blog: using the saved snapshot. Run npm run sync:blog to refresh it from GitHub.");
} else {
  if (!token) {
    try {
      token = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      throw new Error("Set GITHUB_TOKEN with Discussions read access, or sign in with gh auth login.");
    }
  }
  const snapshot = await fetchBlogSnapshot(BLOG_SOURCE, token);
  const output = new URL("../src/blog/posts.json", import.meta.url);
  const temporary = new URL(`${output.href}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`);
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`Blog: synced ${snapshot.posts.length} posts from ${snapshot.repository} / ${snapshot.category.name}.`);
}
