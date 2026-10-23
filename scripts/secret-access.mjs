import { ACCESS_VERSION, canonicalUsername, encryptAccess, usernameKey } from "../src/secret/credentials.js";

function requireValue(condition, message) {
  if (!condition) throw new Error(`SECRET_PROJECT_ACCESS: ${message}`);
}

function validPath(value) {
  return typeof value === "string" && !value.startsWith("/") && !value.includes("\\")
    && !value.split("/").some((part) => part === ".." || part === ".git");
}

export async function buildAccessManifest(input) {
  if (!input?.trim()) return { version: ACCESS_VERSION, users: {} };
  let config;
  try { config = JSON.parse(input); } catch { throw new Error("SECRET_PROJECT_ACCESS must contain valid JSON."); }
  requireValue(Array.isArray(config?.projects) && Array.isArray(config?.users), "projects and users must be arrays.");
  requireValue(config.users.length === 0 || (typeof config.token === "string" && config.token.trim().length > 0), "token must contain the shared, repository-scoped GitHub token.");
  requireValue(config.acceptanceToken === undefined || (typeof config.acceptanceToken === "string" && config.acceptanceToken.trim().length > 0), "acceptanceToken must contain the shared receipt-repository token when supplied.");
  const projects = new Map();
  for (const project of config.projects) {
    requireValue(/^[a-z0-9][a-z0-9-]*$/.test(project.id || "") && !projects.has(project.id), "project IDs must be unique lowercase slugs.");
    requireValue(/^[\w.-]+$/.test(project.owner || "") && /^[\w.-]+$/.test(project.repo || ""), "each project needs a GitHub owner and repository.");
    requireValue(validPath(project.root || ""), "project roots must be relative repository paths.");
    requireValue(!project.exclude || (Array.isArray(project.exclude) && project.exclude.every(validPath)), "exclude must contain relative paths.");
    if (project.hideFromTree !== undefined) {
      const hidden = project.hideFromTree;
      requireValue(hidden && typeof hidden === "object" && !Array.isArray(hidden), "hideFromTree must contain paths and/or extensions arrays.");
      requireValue(hidden.paths === undefined || (Array.isArray(hidden.paths) && hidden.paths.every((path) => validPath(path) && path.trim())), "hideFromTree.paths must contain nonempty relative vault paths.");
      requireValue(hidden.extensions === undefined || (Array.isArray(hidden.extensions) && hidden.extensions.every((extension) => typeof extension === "string" && /^\.[a-z0-9][a-z0-9._-]*$/i.test(extension))), "hideFromTree.extensions must contain file extensions beginning with a dot.");
    }
    requireValue(!project.ref || (typeof project.ref === "string" && !/[\s~^:?*\[\\]/.test(project.ref)), "ref must name a branch.");
    projects.set(project.id, {
      id: project.id,
      label: String(project.label || project.id),
      owner: project.owner,
      repo: project.repo,
      ref: project.ref || "main",
      root: (project.root || "").replace(/\/+$/, ""),
      exclude: project.exclude || [".obsidian"],
      ...(project.hideFromTree ? { hideFromTree: project.hideFromTree } : {}),
    });
  }
  const users = {};
  for (const user of config.users) {
    const username = canonicalUsername(user.username);
    requireValue(/^[a-z0-9][a-z0-9._-]{0,63}$/.test(username), "usernames must contain letters, numbers, dots, underscores, or hyphens.");
    const id = await usernameKey(username);
    requireValue(!Object.hasOwn(users, id), "usernames must be unique.");
    requireValue(typeof user.password === "string" && user.password.length >= 16, "passwords must contain at least 16 characters; use randomly generated passwords.");
    if (user.author !== undefined) {
      requireValue(typeof user.author?.name === "string" && user.author.name.trim() && !/[\r\n]/.test(user.author.name), "author must include a name.");
      requireValue(typeof user.author?.email === "string" && /^[^\s@]+@[^\s@]+$/.test(user.author.email), "author must include an email.");
    }
    requireValue(Array.isArray(user.projects) && user.projects.every((id) => projects.has(id)), "each user's projects must reference configured project IDs.");
    users[id] = await encryptAccess(username, user.password, {
      username,
      ...(user.author ? { author: { name: user.author.name.trim(), email: user.author.email } } : {}),
      token: config.token.trim(),
      ...(config.acceptanceToken ? { acceptanceToken: config.acceptanceToken.trim() } : {}),
      projects: [...new Set(user.projects)].map((id) => projects.get(id)),
    });
  }
  return { version: ACCESS_VERSION, users };
}

export function secretAccessPlugin(input) {
  let manifest;
  const load = () => (manifest ||= buildAccessManifest(input));
  return {
    name: "secret-project-access",
    async buildStart() { await load(); },
    configureServer(server) {
      server.middlewares.use("/secret-access.json", async (_request, response, next) => {
        try {
          response.setHeader("Content-Type", "application/json");
          response.setHeader("Cache-Control", "no-store");
          response.end(JSON.stringify(await load()));
        } catch { next(new Error("SECRET_PROJECT_ACCESS configuration is invalid.")); }
      });
    },
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: "secret-access.json", source: JSON.stringify(await load()) });
    },
  };
}
