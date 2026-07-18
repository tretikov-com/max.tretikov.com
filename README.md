# max.tretikov.com

The Max landing page and a browser-native, GitHub-backed reader for public
Obsidian vaults. The first configured project is
[`MaxTretikov/rlqf`](https://github.com/MaxTretikov/rlqf); its `docs/` directory
appears under **Projects → RLQF**.

## Add a vault

Add a descriptor to `VAULT_SOURCES` in `src/vault/sources.js`:

```js
export const VAULT_SOURCES = [
  {
    id: "rlqf",
    label: "RLQF",
    description: "Repository documentation rendered as a live Obsidian vault.",
    owner: "MaxTretikov",
    repo: "rlqf",
    ref: "main",
    root: "docs",
    exclude: [".obsidian"],
    pollIntervalMs: 5 * 60 * 1000,
    webProxy: import.meta.env.VITE_GITHUB_WEB_PROXY || null,
  },
];
```

`root`, `exclude`, and `pollIntervalMs` are optional. Repositories must be public.
The full tree under `root` is indexed, including non-Markdown repository objects.
Markdown is rendered in place; other files receive a repository-object view and an
immutable raw link.

## Snapshot model

The reader asks GitHub for the branch head using an ETag. If the commit has not
changed, it keeps the active snapshot. For a new commit, it downloads the recursive
tree and every Markdown file, reusing unchanged blob contents from the prior snapshot.

IndexedDB stores:

- one repository record containing the active commit and ETag;
- one snapshot record containing the tree and commit metadata;
- one record per file, keyed by repository, commit, and path;
- selected-file history pages, keyed by repository, HEAD, path, and page.

The snapshot switch is transactional, so a partially downloaded update never replaces
the last good vault. Non-Markdown assets are indexed with the tree and served from an
immutable, commit-addressed `raw.githubusercontent.com` URL when a note references them.
While the reader is open, it polls the configured branch every five minutes by default.

Markdown is transformed by the MIT-licensed Quartz Obsidian-flavored Markdown package.
The surrounding explorer, commit cache, link resolver, asset resolver, and recursive
transclusion pass are local to this site. KaTeX and Mermaid are rendered in the browser.
Quartz's license is shipped with the built site in `THIRD_PARTY_NOTICES.txt`.

## GitHub frontend transport

The reader has an adapter for the same JSON routes used by GitHub's current React
frontend:

- `latest-commit/{ref}/{path}`
- `tree-commit-info/{ref}/{path}`
- `tree-list/{head}?include_directories=true`
- `commits/{ref}/{path}` and its cursor pagination
- `commits/deferred_commit_data/{ref}`

These contracts are parsed and tested in `src/vault/github-web.js`. GitHub deliberately
does not grant cross-origin access to `github.com` frontend responses, and its own
`verifiedFetch` rejects another origin. A static GitHub Pages browser therefore cannot
read those responses directly.

By default, the deployed site reproduces the same semantics using the CORS-readable
public REST metadata endpoints plus commit-addressed `raw.githubusercontent.com`
content. The first commit returned for the selected file drives the message/SHA control
at the top right; clicking it opens that file's history.

To use the literal frontend routes, set `VITE_GITHUB_WEB_PROXY` to a same-origin or
CORS-enabled, allowlisted edge endpoint. The client sends the official React request
headers through the proxy and appends the canonical upstream URL as the `url` query
parameter. The proxy must reject arbitrary origins/repositories and should forward
ETag/cache headers. If no proxy is configured, no request is attempted against the
unreadable `github.com` routes.

## Development

```sh
npm install
npm test
npm run dev
```

`npm run build` writes the deployable site to `dist/`. The Pages workflow builds and
deploys that directory on pushes to `main`; configure the repository's Pages source as
**GitHub Actions** before its first run.
