import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown } from "./renderer.js";

test("Quartz adapter renders Obsidian syntax, math, and Mermaid markers", async () => {
  const result = await renderMarkdown(`---
title: Renderer fixture
---

# Renderer fixture

> [!info] Snapshot status
> The cache is ready.

Open [[Notes/Target|the target]] and ==mark this==.

Inline $E = mc^2$.

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`
`, { path: "index.md" });

  assert.match(result.html, /class="callout info"/);
  assert.match(result.html, /href="Notes\/Target"/);
  assert.match(result.html, /class="text-highlight"/);
  assert.match(result.html, /class="katex"/);
  assert.match(result.html, /class="mermaid"/);
  assert.equal(result.frontmatter.title, "Renderer fixture");
  assert.equal(result.hasMermaid, true);
});

test("Quartz adapter emits a resolvable placeholder for note transclusion", async () => {
  const result = await renderMarkdown("![[Notes/Embedded#Section]]", { path: "index.md" });
  assert.match(result.html, /class="transclude"/);
  assert.match(result.html, /data-url="notes\/embedded"/);
  assert.match(result.html, /data-block="#section"/);
});

test("unsafe HTML is sanitized", async () => {
  const result = await renderMarkdown('<script>alert("x")</script><p onclick="x()">safe</p>');
  assert.doesNotMatch(result.html, /script|onclick/);
  assert.match(result.html, /safe/);
});
