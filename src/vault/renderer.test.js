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

test("Quartz preserves Charts blocks and their literal data for browser rendering", async () => {
  const result = await renderMarkdown(`
\`\`\`chart
type: bar
labels: ['<script>alert(1)</script>']
series:
  - title: Samples
    data: [3]
\`\`\`

\`\`\`advanced-chart
{"type":"pie","data":{"labels":["A"],"datasets":[{"data":[1]}]}}
\`\`\`
`);
  assert.match(result.html, /<pre><code class="language-chart">/);
  assert.match(result.html, /<pre><code class="language-advanced-chart">/);
  assert.match(result.html, /&#x3C;script>alert\(1\)&#x3C;\/script>/);
  assert.doesNotMatch(result.html, /<script>/);
});

test("block-scoped chart embeds retain the sanitized anchor and disclosure markup", async () => {
  const chart = await renderMarkdown(`
\`\`\`chart
type: pie
labels: [A, B]
series:
  - title: Samples
    data: [3, 5]
legend: false
width: "min(100%, 560px)"
\`\`\`

^chart-example
`, { path: "figures/chart.md" });
  assert.match(chart.html, /<pre id="user-content-chart-example"><code class="language-chart">/);

  const readme = await renderMarkdown(`
<details hidden class="interactive-chart">
<summary>Interactive chart</summary>

![[figures/chart#^chart-example]]

</details>
`, { path: "README.md" });
  assert.match(readme.html, /<details class="interactive-chart">/);
  assert.match(readme.html, /data-url="figures\/chart" data-block="#\^chart-example"/);
  assert.doesNotMatch(readme.html, /\bhidden\b/);
});
