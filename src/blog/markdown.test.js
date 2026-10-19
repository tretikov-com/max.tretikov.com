import assert from "node:assert/strict";
import test from "node:test";
import { renderBlogMarkdown } from "./markdown.js";

test("blog Markdown supports headings, GFM tables, task lists, code, and math", async () => {
  const html = await renderBlogMarkdown("## A result\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n\n```js\nconst x = 1;\n```\n\n$E = mc^2$");
  assert.match(html, /<h2 id="a-result">A result<\/h2>/);
  assert.match(html, /<table>/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /language-js/);
  assert.match(html, /class="katex"/);
});

test("discussion Markdown cannot execute HTML or unsafe links", async () => {
  const html = await renderBlogMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">\n\n[click](javascript:alert%281%29)\n\n![alt](https://example.com/image.png)');
  assert.doesNotMatch(html, /<script|onerror|javascript:/i);
  assert.match(html, /https:\/\/example.com\/image.png/);
});
