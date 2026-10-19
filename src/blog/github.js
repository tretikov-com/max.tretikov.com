import { renderBlogMarkdown } from "./markdown.js";

const REPOSITORY_QUERY = `query BlogRepository($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    id isPrivate hasDiscussionsEnabled
    discussionCategories(first: 100) { nodes { id name slug } }
  }
}`;

const POSTS_QUERY = `query BlogPosts($owner: String!, $repo: String!, $categoryId: ID!, $after: String) {
  repository(owner: $owner, name: $repo) {
    discussions(first: 50, after: $after, categoryId: $categoryId, orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title body bodyText url createdAt updatedAt
        author { login url }
      }
    }
  }
}`;

async function queryGitHub(query, variables, token, fetchImpl) {
  const response = await fetchImpl("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "max-tretikov-blog",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub blog sync failed (HTTP ${response.status}).`);
  const result = await response.json();
  if (result.errors?.length) {
    throw new Error(`GitHub blog sync failed: ${result.errors.map(({ message }) => message).join("; ")}`);
  }
  if (!result.data?.repository) throw new Error("Blog repository is unavailable.");
  return result.data.repository;
}

export async function fetchBlogSnapshot(source, token, fetchImpl = fetch) {
  if (!token) throw new Error("A GitHub token with Discussions read access is required to sync the blog.");
  const variables = { owner: source.owner, repo: source.repo };
  const repository = await queryGitHub(REPOSITORY_QUERY, variables, token, fetchImpl);
  if (repository.isPrivate) throw new Error("The blog must use a public repository.");
  if (!repository.hasDiscussionsEnabled) throw new Error("Enable Discussions in the blog repository first.");
  const category = repository.discussionCategories.nodes.find(({ name }) => name === source.category);
  if (!category) throw new Error(`Blog category "${source.category}" was not found.`);

  const posts = [];
  let after = null;
  const cursors = new Set();
  do {
    const page = await queryGitHub(POSTS_QUERY, { ...variables, categoryId: category.id, after }, token, fetchImpl);
    for (const post of page.discussions.nodes) {
      const text = post.bodyText.replace(/\s+/g, " ").trim();
      const excerpt = text.length > 220 ? `${text.slice(0, 220).replace(/\s+\S*$/, "")}…` : text;
      posts.push({
        number: post.number,
        title: post.title,
        url: post.url,
        author: post.author,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        excerpt,
        readingMinutes: Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length / 220)),
        html: await renderBlogMarkdown(post.body),
      });
    }
    const { hasNextPage, endCursor } = page.discussions.pageInfo;
    after = hasNextPage ? endCursor : null;
    if (hasNextPage && (!after || cursors.has(after))) throw new Error("GitHub returned an invalid blog pagination cursor.");
    cursors.add(after);
  } while (after);

  posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number);
  return {
    repository: `${source.owner}/${source.repo}`,
    repositoryId: repository.id,
    category,
    syncedAt: new Date().toISOString(),
    posts,
  };
}
