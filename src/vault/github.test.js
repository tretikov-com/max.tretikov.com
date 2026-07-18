import assert from "node:assert/strict";
import test from "node:test";
import { extractMarkdownSummary } from "./github.js";

test("project summary uses the first meaningful index line", () => {
  const markdown = `---
title: Metadata title
---

# Reinforcement Learning with Quantum Feedback

Longer body copy.
`;

  assert.equal(
    extractMarkdownSummary(markdown),
    "Reinforcement Learning with Quantum Feedback",
  );
});

test("project summary removes lightweight Markdown formatting", () => {
  assert.equal(
    extractMarkdownSummary("**A [linked](https://example.com) description**"),
    "A linked description",
  );
});
