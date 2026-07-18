import YAML from "yaml";

const MARKDOWN_EXTENSION = /\.md(?:own)?$/i;

export function normalizePath(value) {
  const parts = [];
  String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .forEach((part) => {
      if (!part || part === ".") return;
      if (part === "..") parts.pop();
      else parts.push(part);
    });
  return parts.join("/");
}

export function parseFrontmatter(markdown) {
  const source = String(markdown || "");
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    return { data: {}, body: source };
  }

  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { data: {}, body: source };

  let data = {};
  try {
    data = YAML.parse(match[1]) || {};
  } catch (error) {
    data = { frontmatterError: error.message };
  }

  return { data, body: source.slice(match[0].length) };
}

export function noteTitle(path, markdown) {
  const { data, body } = parseFrontmatter(markdown);
  if (typeof data.title === "string" && data.title.trim()) return data.title.trim();
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.replace(/\s+#+\s*$/, "").trim();
  if (heading) return heading;
  const filename = normalizePath(path).split("/").pop() || "UNTITLED";
  return filename.replace(MARKDOWN_EXTENSION, "").replace(/[-_]+/g, " ");
}

export function isMarkdownPath(path) {
  return MARKDOWN_EXTENSION.test(path);
}

export function stripSourceRoot(path, root = "") {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(root);
  if (!normalizedRoot) return normalizedPath;
  if (normalizedPath === normalizedRoot) return "";
  return normalizedPath.startsWith(`${normalizedRoot}/`)
    ? normalizedPath.slice(normalizedRoot.length + 1)
    : null;
}

function compareNodes(a, b) {
  if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

export function buildVaultTree(files) {
  const root = { type: "folder", name: "ROOT", path: "", children: [] };
  const folders = new Map([["", root]]);

  files
    .filter((file) => normalizePath(file.path))
    .forEach((file) => {
      const path = normalizePath(file.path);
      const parts = path.split("/");
      let parent = root;
      let parentPath = "";

      parts.slice(0, -1).forEach((name) => {
        const folderPath = parentPath ? `${parentPath}/${name}` : name;
        let folder = folders.get(folderPath);
        if (!folder) {
          folder = { type: "folder", name, path: folderPath, children: [] };
          folders.set(folderPath, folder);
          parent.children.push(folder);
        }
        parent = folder;
        parentPath = folderPath;
      });

      parent.children.push({
        type: "file",
        name: parts.at(-1),
        filename: parts.at(-1),
        path,
        fileType: file.type || (isMarkdownPath(path) ? "markdown" : "asset"),
      });
    });

  const sort = (node) => {
    if (!node.children) return;
    node.children.sort(compareNodes);
    node.children.forEach(sort);
  };
  sort(root);
  return root;
}

export function chooseInitialNote(files) {
  const markdown = files.filter((file) => isMarkdownPath(file.path));
  const priorities = [
    /^index\.md$/i,
    /^readme\.md$/i,
    /\/index\.md$/i,
    /\/readme\.md$/i,
  ];
  for (const pattern of priorities) {
    const file = markdown.find((candidate) => pattern.test(candidate.path));
    if (file) return file.path;
  }
  return markdown[0]?.path || null;
}

export function createSnapshot(source, commitSha, files, extra = {}) {
  const normalizedFiles = files.map((file) => ({ ...file, path: normalizePath(file.path) }));
  return {
    key: `${source.id}@${commitSha}`,
    repoId: source.id,
    commitSha,
    ref: source.ref || "main",
    files: normalizedFiles,
    tree: buildVaultTree(normalizedFiles),
    initialNote: chooseInitialNote(normalizedFiles),
    createdAt: Date.now(),
    ...extra,
  };
}

export function encodeNotePath(path) {
  return normalizePath(path).split("/").map(encodeURIComponent).join("/");
}

export function projectHref(sourceId, path) {
  const base = `/projects/${encodeURIComponent(sourceId)}`;
  return path ? `${base}/${encodeNotePath(path)}` : base;
}

export function parseProjectsPath(pathname, hash = "") {
  const match = String(pathname || "").match(/^\/projects(?:\/(.*))?$/);
  const raw = String(match?.[1] || "").replace(/\/+$/, "");
  if (!raw) return { sourceId: null, notePath: null, anchor: null };
  const encodedAnchor = String(hash || "").replace(/^#/, "");
  const anchor = encodedAnchor ? safeDecode(encodedAnchor) : null;
  const [sourcePart, ...pathParts] = raw.split("/");
  return {
    sourceId: safeDecode(sourcePart),
    notePath: pathParts.length ? normalizePath(pathParts.map(safeDecode).join("/")) : null,
    anchor,
  };
}

function withoutMarkdownExtension(path) {
  return path.replace(MARKDOWN_EXTENSION, "");
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function comparableSlug(path, stripMarkdown = false) {
  const comparable = stripMarkdown ? withoutMarkdownExtension(path) : path;
  return normalizePath(comparable)
    .split("/")
    .map((part) => safeDecode(part).trim().toLowerCase().replace(/[\s_]+/g, "-"))
    .join("/");
}

export function resolveNoteTarget(target, currentPath, filePaths) {
  const [rawPath, rawAnchor = ""] = String(target || "").split("#", 2);
  const decodedPath = safeDecode(rawPath || "").replace(/^\/+/, "");
  const requested = normalizePath(decodedPath);
  if (!requested) return { path: currentPath, anchor: rawAnchor };

  const paths = filePaths.filter(isMarkdownPath).map(normalizePath);
  const currentDirectory = normalizePath(currentPath).split("/").slice(0, -1).join("/");
  const explicitlyRelative = /^\.{1,2}(?:\/|$)/.test(decodedPath);
  const candidates = [];
  const pushCandidate = (candidate) => {
    const normalized = normalizePath(candidate);
    if (!normalized) return;
    candidates.push(normalized);
    if (!MARKDOWN_EXTENSION.test(normalized)) {
      candidates.push(`${normalized}.md`, `${normalized}.markdown`, `${normalized}/index.md`);
    }
  };

  if (explicitlyRelative) {
    pushCandidate(`${currentDirectory}/${decodedPath}`);
  } else {
    pushCandidate(requested);
    if (currentDirectory) pushCandidate(`${currentDirectory}/${decodedPath}`);
  }

  for (const candidate of candidates) {
    const exact = paths.find((path) => path === candidate);
    if (exact) return { path: exact, anchor: rawAnchor };
  }

  const lowercaseCandidates = candidates.map((candidate) => candidate.toLowerCase());
  const caseInsensitive = paths.find((path) => lowercaseCandidates.includes(path.toLowerCase()));
  if (caseInsensitive) return { path: caseInsensitive, anchor: rawAnchor };

  const candidateSlugs = new Set(candidates.map((candidate) => comparableSlug(candidate, true)));
  const slugMatch = paths.find((path) => candidateSlugs.has(comparableSlug(path, true)));
  if (slugMatch) return { path: slugMatch, anchor: rawAnchor };

  const suffixRequest = explicitlyRelative
    ? normalizePath(`${currentDirectory}/${decodedPath}`)
    : requested;
  const requestedStem = withoutMarkdownExtension(suffixRequest).toLowerCase();
  const suffixMatches = paths
    .filter((path) => withoutMarkdownExtension(path).toLowerCase().endsWith(`/${requestedStem}`)
      || withoutMarkdownExtension(path).toLowerCase() === requestedStem)
    .sort((a, b) => a.length - b.length);

  if (suffixMatches[0]) return { path: suffixMatches[0], anchor: rawAnchor };

  const requestedSlug = comparableSlug(suffixRequest, true);
  const slugSuffixMatches = paths
    .filter((path) => comparableSlug(path, true).endsWith(`/${requestedSlug}`)
      || comparableSlug(path, true) === requestedSlug)
    .sort((a, b) => a.length - b.length);
  return slugSuffixMatches[0] ? { path: slugSuffixMatches[0], anchor: rawAnchor } : null;
}

export function resolveAssetTarget(target, currentPath, allPaths) {
  const decodedPath = safeDecode(String(target || "").split("#", 1)[0]).replace(/^\/+/, "");
  const requested = normalizePath(decodedPath);
  if (!requested) return null;
  const currentDirectory = normalizePath(currentPath).split("/").slice(0, -1).join("/");
  const explicitlyRelative = /^\.{1,2}(?:\/|$)/.test(decodedPath);
  const candidates = explicitlyRelative
    ? [`${currentDirectory}/${decodedPath}`]
    : [requested, currentDirectory && `${currentDirectory}/${decodedPath}`].filter(Boolean);
  for (const candidate of candidates) {
    const exact = allPaths.find((path) => normalizePath(path) === normalizePath(candidate));
    if (exact) return normalizePath(exact);
  }
  const suffixRequest = explicitlyRelative
    ? normalizePath(`${currentDirectory}/${decodedPath}`)
    : requested;
  const directSuffix = allPaths.find((path) => (
    normalizePath(path).toLowerCase().endsWith(`/${suffixRequest.toLowerCase()}`)
    || normalizePath(path).toLowerCase() === suffixRequest.toLowerCase()
  ));
  if (directSuffix) return directSuffix;
  const requestedSlug = comparableSlug(suffixRequest);
  return allPaths.find((path) => comparableSlug(path).endsWith(`/${requestedSlug}`)
    || comparableSlug(path) === requestedSlug) || null;
}

export function resolveRepositoryTarget(target, currentRepositoryPath) {
  const decodedPath = safeDecode(String(target || "").split(/[?#]/, 1)[0]);
  if (!decodedPath) return normalizePath(currentRepositoryPath);
  if (decodedPath.startsWith("/")) return normalizePath(decodedPath);
  const currentDirectory = normalizePath(currentRepositoryPath).split("/").slice(0, -1).join("/");
  return normalizePath(`${currentDirectory}/${decodedPath}`);
}

export function rawGithubUrl(source, commitSha, repositoryPath) {
  const encodedPath = normalizePath(repositoryPath).split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/${encodeURIComponent(commitSha)}/${encodedPath}`;
}
