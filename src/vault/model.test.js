import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVaultTree,
  createSnapshot,
  parseFrontmatter,
  parseProjectsPath,
  projectHref,
  resolveAssetTarget,
  resolveNoteTarget,
  resolveRepositoryTarget,
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

test("project routes preserve nested note paths", () => {
  const pathname = projectHref("research notes", "A folder/Field #1.md");
  assert.equal(pathname, "/projects/research%20notes/A%20folder/Field%20%231.md");
  assert.deepEqual(parseProjectsPath(pathname), {
    sourceId: "research notes",
    notePath: "A folder/Field #1.md",
    anchor: null,
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
  });
});

test("project index and trailing slashes resolve to the project root", () => {
  assert.deepEqual(parseProjectsPath("/projects"), {
    sourceId: null,
    notePath: null,
    anchor: null,
  });
  assert.deepEqual(parseProjectsPath("/projects/docs/"), {
    sourceId: "docs",
    notePath: null,
    anchor: null,
  });
  assert.deepEqual(parseProjectsPath("/projects-old"), {
    sourceId: null,
    notePath: null,
    anchor: null,
  });
});

test("malformed route escapes do not crash path parsing", () => {
  assert.deepEqual(parseProjectsPath("/projects/docs/Notes/%E0%A4%A.md"), {
    sourceId: "docs",
    notePath: "Notes/%E0%A4%A.md",
    anchor: null,
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
