# max.tretikov.com

The Max landing page and a browser-native, GitHub-backed reader for public
Obsidian vaults. The first configured project is
[`MaxTretikov/rlqf`](https://github.com/MaxTretikov/rlqf); its `docs/` directory
appears under **Projects → RLQF**.

`/projects/secret` provides invited collaborators with password-gated access to
private vaults, Markdown editing, and pull-request submission with contributor
attribution in commit messages. Configure the shared token, repositories, and users
in the `SECRET_PROJECT_ACCESS` GitHub Actions secret; see
[Secret projects](docs/secret-projects.md) for setup and access management.

## Blog

`/blog` publishes GitHub Discussions from the site's public repository, using the
**Announcements** category. Create or edit a discussion in
[`tretikov-com/max.tretikov.com`](https://github.com/tretikov-com/max.tretikov.com/discussions/categories/announcements)
to publish a post. Its discussion number is its stable URL, such as `/blog/12`.
The discussion title and Markdown body are the post title and content. Moving a
discussion out of Announcements or deleting it unpublishes the post on the next build.

GitHub Actions rebuilds the site when discussions are created, edited, deleted,
transferred, or moved between categories. The build reads all pages of posts with
the workflow's `GITHUB_TOKEN` and `discussions: read` permission. Credentials stay
in the build process. The browser receives only the public snapshot in
`src/blog/posts.json`. Post content updates when the Pages deployment completes.

Comments and reactions use [giscus](https://giscus.app), mapped by discussion number
to the post itself. Install the [giscus GitHub app](https://github.com/apps/giscus)
for **only this repository** to enable the embedded conversation. Readers sign in
with their own GitHub account to participate, and can also use the direct GitHub
link. Moderation happens in Discussions. Comments and reactions update live without
a site rebuild.

`src/blog/config.js` selects the repository and category. To refresh the saved
snapshot locally, use `npm run sync:blog` with an authenticated `gh` CLI or a
`GITHUB_TOKEN` / `GH_TOKEN` with Discussions read access. `npm run build` refreshes
the snapshot when either token is set; otherwise it uses the saved snapshot so
local development works without GitHub credentials. A configured sync fails the
build on API errors rather than publishing an incomplete blog.

The index fans the newest eight posts out from the central **Blog.** heading, using
fixed positions. New posts take the first position and shift the others through
the sequence. Older posts appear in a chronological archive below, initially
showing 20 entries with a **Show more posts** control. Hover or keyboard focus
shows an excerpt; selecting a title opens the post. Numbers and dates in
`DD Mon YYYY` format appear on every post link. Below 960px, the titles form a
readable stack. When there are no published posts, the localhost dev server uses
the examples in `src/blog/dev-posts.js`. These examples are excluded from
production builds and never create GitHub discussions.

The procedural background crossfades between two Canvas 2D layers. Selecting a
post generates a fresh burst with a seed derived from its discussion number and
an origin behind that link. Each selection or resize needs one new drawing;
there is no persistent animation loop. Each layer's backing resolution is capped
at 1.5× and 1.4 million pixels, with fewer fragments on smaller canvases. Small
screens retain the central burst. Canvas observers and pending resize frames are
released when leaving the blog index.

## Add a vault

Add a descriptor to `VAULT_SOURCES` in `src/vault/sources.js`:

```js
export const VAULT_SOURCES = [
  {
    id: "rlqf",
    label: "RLQF",
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
immutable raw link. HTML files open at their project URL in an isolated document viewer
that runs their scripts. Self-contained interactive HTML works directly; links to other
vault files return to the site reader and preserve a selected historical revision.
Private HTML is loaded through authenticated GitHub access and stays in the browser
session. The document frame cannot read the site's saved login or parent page.
An image linked to a vault HTML file displays the live HTML inside the note. Its
original image remains the PDF/print fallback and stays visible if the HTML cannot load.

To hide supporting files from navigation, add `hideFromTree` to the source descriptor:

```js
hideFromTree: {
  paths: ["figures"],
  extensions: [".png", ".svg", ".html"],
},
```

`paths` matches files or whole folders relative to `root`; `extensions` matches filename
suffixes without regard to case. Either list can be omitted. The file count includes
only visible entries. Hidden files stay in the loaded snapshot and remain available to
Markdown images, chart transclusions, direct links, historical revisions, and printing.
These settings also apply to already cached snapshots. `exclude` instead prevents
loading the files, so use `hideFromTree` for supporting assets.

The **Repository history** control at the bottom of the file tree opens repository history. Selecting
a revision checks out the complete configured tree at that immutable commit and records
the selection as `?rev=<commit-sha>`, so it survives refreshes and can be shared. The
tracked branch continues updating independently, and **Return to HEAD** restores it.

## Snapshot model

The reader asks GitHub for the branch head using an ETag. If the commit has not
changed, it keeps the active snapshot. For a new commit, it downloads the recursive
tree and every Markdown file, reusing unchanged blob contents from the prior snapshot.

IndexedDB stores:

- one repository record containing the active commit and ETag;
- one active branch snapshot plus up to four recently viewed immutable revisions,
  each containing its tree and commit metadata;
- one record per file, keyed by repository, commit, and path;
- selected-file history pages, keyed by repository, HEAD, path, and page.

The snapshot switch is transactional, so a partially downloaded update never replaces
the last good vault. Non-Markdown assets are indexed with the tree and served from an
immutable, commit-addressed `raw.githubusercontent.com` URL when a note references them.
While the reader is open, it polls the configured branch every five minutes by default.

Markdown is transformed by the MIT-licensed Quartz Obsidian-flavored Markdown package.
The surrounding explorer, commit cache, link resolver, asset resolver, and recursive
transclusion pass are local to this site. KaTeX, Mermaid, and Obsidian Charts are rendered in the browser.
Quartz's license is shipped with the built site in `THIRD_PARTY_NOTICES.txt`.

### Charts

Notes and transcluded notes support [Obsidian Charts](https://github.com/phibr0/obsidian-charts)
with inline YAML data:

````markdown
```chart
type: line
labels: [Baseline, Experiment]
series:
  - title: Accuracy
    data: [72, 91]
beginAtZero: true
yTitle: Accuracy (%)
```
````

Supported types are `bar`, `line`, `pie`, `doughnut`, `radar`, `polarArea`, `scatter`,
`bubble`, and `sankey`. Series accept Chart.js dataset options. Chart modifiers include
width, fill, tension, stacking, axis limits and titles, legend settings, per-label colors,
and time axes. `advanced-chart` blocks accept JSON Chart.js configurations. JavaScript
callbacks, Dataview, and `id`/`file` references to Markdown tables are not supported.
Invalid charts display an error beside their source block. Chart.js and the date/Sankey
adapters load only when needed; charts resize for printing and are released on navigation.

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
content. The document toolbar's **History** control opens the selected file's
revision log, including commit messages and hashes.

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

`npm run build` writes the deployable site to `dist/`, including a `404.html` app shell
so clean client routes such as `/projects/rlqf` survive direct GitHub Pages visits. Its
postbuild hook also renders `/resume` with Google Chrome and writes the verified Letter
PDF to `dist/Maksim-Tretikov-Resume.pdf`; set `CHROME_BIN` if Chrome is installed in a
nonstandard location. The Pages workflow builds and deploys that directory on pushes to
`main`; configure the repository's Pages source as **GitHub Actions** before its first run.
