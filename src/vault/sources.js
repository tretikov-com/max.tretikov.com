// Add public GitHub vaults here. Each source is fetched in the visitor's browser,
// snapshotted by commit SHA, and cached in IndexedDB.
//
const githubWebProxy = import.meta.env?.VITE_GITHUB_WEB_PROXY || null;

export const VAULT_SOURCES = [
  {
    id: "rlqf",
    label: "RLQF",
    description: "Repository documentation rendered as a live, commit-addressed Obsidian vault.",
    owner: "MaxTretikov",
    repo: "rlqf",
    ref: "main",
    root: "docs",
    pollIntervalMs: 5 * 60 * 1000,
    webProxy: githubWebProxy,
  },
];

const DEMO_FILES = [
  {
    path: "index.md",
    content: `---
title: Vault Interface Test
tags: [system, demo]
---

# Vault Interface Test

This local development vault exercises the browser adapter around Quartz's
Obsidian-flavored Markdown transformer.

> [!info] Commit-addressed reader
> Repository snapshots stay readable while the next commit is downloaded and indexed.

- Open [[Notes/Rendering pipeline]]
- Inspect [[Notes/Link resolution|link resolution]]
`,
  },
  {
    path: "Notes/Rendering pipeline.md",
    content: `---
title: Rendering pipeline
---

# Rendering pipeline

Quartz parses the note while the surrounding interface remains custom.

Inline math: $E = mc^2$

$$
\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}
$$

\`\`\`mermaid
flowchart LR
  G[GitHub] --> I[IndexedDB]
  I --> Q[Quartz transforms]
  Q --> V[Vault reader]
\`\`\`

## Browser-owned transclusion

![[Notes/Embedded signal#Signal]]

Return to [[index|the vault index]].
`,
  },
  {
    path: "Notes/Link resolution.md",
    content: `# Link resolution

The complete repository tree supplies the candidate paths used to resolve
shortest-form Obsidian links.

==Unresolved links remain visible== rather than silently navigating elsewhere.
`,
  },
  {
    path: "Notes/Embedded signal.md",
    content: `# Embedded signal

## Signal

> [!abstract] Expansion pass
> Quartz emits the transclusion marker; the browser resolves it against this commit snapshot.

Relative links inside the embed retain their source-note context: [[Link resolution]].

## Excluded section

This section should not appear in the heading-scoped transclusion.
`,
  },
];

export const DEMO_SOURCE = {
  id: "interface-test",
  label: "INTERFACE TEST VAULT",
  description: "Local fixture: wikilinks, transclusions, callouts, math, and Mermaid.",
  kind: "inline",
  ref: "local",
  files: DEMO_FILES,
};

export function configuredSources() {
  const isDevelopment = Boolean(import.meta.env?.DEV);
  return VAULT_SOURCES.length === 0 && isDevelopment
    ? [DEMO_SOURCE]
    : VAULT_SOURCES;
}
