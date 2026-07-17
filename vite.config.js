import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectDir = fileURLToPath(new URL(".", import.meta.url));

function git(...args) {
  return execFileSync("git", args, {
    cwd: projectDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function readGitMetadata() {
  const revision = git("rev-parse", "--short=7", "HEAD").toUpperCase();
  const lineDelta = git("show", "--format=", "--numstat", "HEAD")
    .split(/\r?\n/)
    .reduce(
      (total, row) => {
        const [added, removed] = row.split("\t", 2);
        if (/^\d+$/.test(added)) total.additions += Number(added);
        if (/^\d+$/.test(removed)) total.deletions += Number(removed);
        return total;
      },
      { additions: 0, deletions: 0 },
    );

  return { revision, ...lineDelta };
}

export default defineConfig(() => {
  const { revision, additions, deletions } = readGitMetadata();

  return {
    base: "./",
    define: {
      __GIT_REVISION__: JSON.stringify(revision),
      __GIT_ADDITIONS__: JSON.stringify(additions),
      __GIT_DELETIONS__: JSON.stringify(deletions),
    },
    resolve: {
      alias: {
        path: "path-browserify",
        process: "process/browser",
        url: "url/",
      },
    },
    build: {
      target: "es2022",
    },
  };
});
