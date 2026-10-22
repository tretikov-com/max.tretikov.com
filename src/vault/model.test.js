import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVaultTree,
  createSnapshot,
  isFullCommitSha,
  parseFrontmatter,
  parseProjectsPath,
  projectHref,
  resolveAssetTarget,
  resolveNoteTarget,
  resolveRepositoryTarget,
  resolveVaultTarget,
} from "./model.js";

test("frontmatter is separated from note content", () => {
  const result = parseFrontmatter("---\ntitle: Field Note\ntags: [one, two]\n---\n# Body");
  assert.equal(result.data.title, "Field Note");
  assert.deepEqual(result.data.tags, ["one", "two"]);
  assert.equal(result.body, "# Body");
});

test("vault tree sorts folders before files and preserves exact filenames", () => {
  const tree = buildVaultTree([
    { path: "z.md", content: "# Last" },
    { path: "Notes/b.md", content: "---\ntitle: Beta\n---\n" },
    { path: "Notes/a.md", content: "# Alpha" },
    { path: "diagram.svg", type: "asset" },
  ]);
  assert.equal(tree.children[0].type, "folder");
  assert.equal(tree.children[0].name, "Notes");
  assert.deepEqual(tree.children[0].children.map((node) => node.name), ["a.md", "b.md"]);
  assert.deepEqual(tree.children.slice(1).map((node) => node.name), ["diagram.svg", "z.md"]);
  assert.equal(tree.children[1].fileType, "asset");
});

test("hidden figure folders stay in the snapshot and resolve from README embeds", () => {
  const source = { id: "research", hideFromTree: { paths: ["figures/"] } };
  const snapshot = createSnapshot(source, "revision", [
    { path: "README.md", type: "markdown", content: "![[figures/chart#^plot]]\n\n![Plot](figures/plot.svg)" },
    { path: "figures/chart.md", type: "markdown", content: "Chart data" },
    { path: "figures/plot.svg", type: "asset" },
    { path: "figures/nested/plot.png", type: "asset" },
    { path: "figures-notes/guide.md", type: "markdown", content: "# Guide" },
  ]);
  const tree = buildVaultTree(snapshot.files, source.hideFromTree);
  assert.deepEqual(tree.children.map((node) => node.name), ["figures-notes", "README.md"]);
  assert.equal(tree.fileCount, 2);
  assert.equal(snapshot.files.length, 5);
  const paths = snapshot.files.map((file) => file.path);
  assert.deepEqual(resolveNoteTarget("figures/chart#^plot", "README.md", paths), { path: "figures/chart.md", anchor: "^plot" });
  assert.equal(resolveAssetTarget("figures/plot.svg", "README.md", paths), "figures/plot.svg");
  assert.equal(resolveAssetTarget("figures/nested/plot.png", "README.md", paths), "figures/nested/plot.png");
  assert.equal(snapshot.files.find((file) => file.path === "figures/chart.md").content, "Chart data");
  assert.ok(snapshot.tree.children.some((node) => node.name === "figures"));
});

test("extension filters hide matching files case-insensitively and omit empty folders", () => {
  const files = [
    { path: "README.md" },
    { path: "figures/chart.md" },
    { path: "figures/plot.SVG", type: "asset" },
    { path: "attachments/preview.PNG", type: "asset" },
    { path: "chart.html", type: "asset" },
    { path: "plot.svg.md" },
    { path: "notes/private.md" },
  ];
  const tree = buildVaultTree(files, { paths: ["notes/private.md"], extensions: [".SVG", ".png", ".html"] });
  assert.deepEqual(tree.children.map((node) => node.name), ["figures", "plot.svg.md", "README.md"]);
  assert.deepEqual(tree.children[0].children.map((node) => node.name), ["chart.md"]);
  assert.equal(tree.fileCount, 3);
  assert.equal(buildVaultTree(files).fileCount, files.length);
});

for (const directory of ["print", ".print"]) {
  test(`${directory}/ fallback directories stay hidden while their assets remain resolvable`, () => {
    const snapshot = createSnapshot({ id: "research" }, "revision", [
      { path: "README.md", type: "markdown" },
      { path: `${directory}/preview.svg`, type: "asset" },
      { path: `${directory}/preview.png`, type: "asset" },
      { path: `notes/${directory}/figure.svg`, type: "asset" },
      { path: "notes/guide.md", type: "markdown" },
      { path: `${directory}-notes.md`, type: "markdown" },
    ]);
    assert.equal(snapshot.files.length, 6);
    assert.equal(snapshot.tree.fileCount, 3);
    assert.deepEqual(snapshot.tree.children.map((node) => node.name), ["notes", `${directory}-notes.md`, "README.md"]);
    assert.deepEqual(snapshot.tree.children[0].children.map((node) => node.name), ["guide.md"]);
    const paths = snapshot.files.map((file) => file.path);
    assert.equal(resolveAssetTarget(`${directory}/preview.svg`, "README.md", paths), `${directory}/preview.svg`);
    assert.equal(resolveAssetTarget(`${directory}/figure.svg`, "notes/guide.md", paths), `notes/${directory}/figure.svg`);
    assert.deepEqual(resolveVaultTarget(`${directory}/preview.png`, "README.md", paths), { path: `${directory}/preview.png`, anchor: "" });
  });
}

test("project routes preserve nested note paths", () => {
  const pathname = projectHref("research notes", "A folder/Field #1.md");
  assert.equal(pathname, "/projects/research%20notes/A%20folder/Field%20%231.md");
  assert.deepEqual(parseProjectsPath(pathname), {
    sourceId: "research notes",
    notePath: "A folder/Field #1.md",
    anchor: null,
    revision: null,
    revisionInvalid: false,
  });
});

test("project routes separate note anchors from the encoded path", () => {
  assert.deepEqual(parseProjectsPath(
    "/projects/docs/Notes/Field.md",
    "#proof-sketch",
  ), {
    sourceId: "docs",
    notePath: "Notes/Field.md",
    anchor: "proof-sketch",
    revision: null,
    revisionInvalid: false,
  });
});

test("project index and trailing slashes resolve to the project root", () => {
  assert.deepEqual(parseProjectsPath("/projects"), {
    sourceId: null,
    notePath: null,
    anchor: null,
    revision: null,
    revisionInvalid: false,
  });
  assert.deepEqual(parseProjectsPath("/projects/docs/"), {
    sourceId: "docs",
    notePath: null,
    anchor: null,
    revision: null,
    revisionInvalid: false,
  });
  assert.deepEqual(parseProjectsPath("/projects-old"), {
    sourceId: null,
    notePath: null,
    anchor: null,
    revision: null,
    revisionInvalid: false,
  });
});

test("malformed route escapes do not crash path parsing", () => {
  assert.deepEqual(parseProjectsPath("/projects/docs/Notes/%E0%A4%A.md"), {
    sourceId: "docs",
    notePath: "Notes/%E0%A4%A.md",
    anchor: null,
    revision: null,
    revisionInvalid: false,
  });
});

test("project routes preserve a full immutable revision alongside note anchors", () => {
  const revision = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";
  const href = projectHref("docs", "Notes/Field.md", { revision });
  assert.equal(
    href,
    "/projects/docs/Notes/Field.md?rev=abcdef0123456789abcdef0123456789abcdef01",
  );
  assert.deepEqual(parseProjectsPath(
    "/projects/docs/Notes/Field.md",
    "#proof",
    "?rev=ABCDEF0123456789ABCDEF0123456789ABCDEF01",
  ), {
    sourceId: "docs",
    notePath: "Notes/Field.md",
    anchor: "proof",
    revision: "abcdef0123456789abcdef0123456789abcdef01",
    revisionInvalid: false,
  });
});

test("invalid or abbreviated revisions are rejected and never serialized", () => {
  assert.equal(isFullCommitSha("abcdef0123456789abcdef0123456789abcdef01"), true);
  assert.equal(isFullCommitSha("abcdef0"), false);
  assert.equal(
    projectHref("docs", "index.md", { revision: "abcdef0" }),
    "/projects/docs/index.md",
  );
  assert.deepEqual(parseProjectsPath(
    "/projects/docs/index.md",
    "",
    "?rev=abcdef0",
  ), {
    sourceId: "docs",
    notePath: "index.md",
    anchor: null,
    revision: null,
    revisionInvalid: true,
  });
});

test("Obsidian shortest-form links resolve against the entire repository tree", () => {
  const paths = ["index.md", "Areas/Physics/Maxwell equations.md", "Areas/Math/Index.md"];
  assert.deepEqual(resolveNoteTarget("Maxwell equations", "index.md", paths), {
    path: "Areas/Physics/Maxwell equations.md",
    anchor: "",
  });
  assert.deepEqual(resolveNoteTarget("../Math/Index#Proof", "Areas/Physics/Current.md", paths), {
    path: "Areas/Math/Index.md",
    anchor: "Proof",
  });
});

test("explicit parent traversal is resolved before shortest-name matching", () => {
  const paths = [
    "Areas/Physics/Current.md",
    "Areas/Math/Index.md",
    "Other/Math/Index.md",
  ];
  assert.deepEqual(resolveNoteTarget("../Math/Index", "Areas/Physics/Current.md", paths), {
    path: "Areas/Math/Index.md",
    anchor: "",
  });
});

test("Quartz-slugified targets resolve to filenames containing spaces", () => {
  const paths = ["index.md", "Notes/Embedded signal.md"];
  assert.deepEqual(resolveNoteTarget("notes/embedded-signal#signal", "index.md", paths), {
    path: "Notes/Embedded signal.md",
    anchor: "signal",
  });
});

test("relative asset paths resolve beside the current note", () => {
  const paths = ["Notes/Field.md", "Notes/assets/diagram.svg", "other/diagram.svg"];
  assert.equal(resolveAssetTarget("assets/diagram.svg", "Notes/Field.md", paths), "Notes/assets/diagram.svg");
});

test("HTML document links resolve to actual assets before generated Markdown URLs", () => {
  const paths = ["README.md", "figures/chart.html", "figures/chart.md", "research/Evidence.md"];
  assert.deepEqual(resolveVaultTarget("figures/chart.html", "README.md", paths), { path: "figures/chart.html", anchor: "" });
  assert.deepEqual(resolveVaultTarget("../research/Evidence.html#methods", "figures/chart.html", paths), { path: "research/Evidence.md", anchor: "methods" });
  assert.deepEqual(resolveVaultTarget("../research/Evidence.md?view=1#methods", "figures/chart.html", paths), { path: "research/Evidence.md", anchor: "methods" });
});

test("explicit asset parent traversal does not fall through to a same-name suffix", () => {
  const paths = [
    "Areas/Physics/Current.md",
    "Areas/figures/plot.svg",
    "Other/figures/plot.svg",
  ];
  assert.equal(
    resolveAssetTarget("../figures/plot.svg", "Areas/Physics/Current.md", paths),
    "Areas/figures/plot.svg",
  );
});

test("repository targets retain parent traversal outside the configured docs root", () => {
  assert.equal(
    resolveRepositoryTarget("../README.md", "docs/guide/index.md"),
    "docs/README.md",
  );
  assert.equal(resolveRepositoryTarget("../README.md", "docs/index.md"), "README.md");
});

test("snapshots are keyed by source and immutable commit", () => {
  const snapshot = createSnapshot(
    { id: "docs", ref: "main" },
    "abc123",
    [{ path: "README.md", content: "# Read me", type: "markdown" }],
  );
  assert.equal(snapshot.key, "docs@abc123");
  assert.equal(snapshot.initialNote, "README.md");
});
