import assert from "node:assert/strict";
import test from "node:test";
import { fetchBlogSnapshot } from "./github.js";
import { blogPostNumber, blogPostPath } from "./config.js";

const source = { owner: "writer", repo: "site", category: "Announcements" };
const repository = {
  id: "repo-id", isPrivate: false, hasDiscussionsEnabled: true,
  discussionCategories: { nodes: [{ id: "blog-id", name: "Announcements", slug: "announcements" }] },
};
const post = (number, body = "Hello **world**.") => ({
  number, title: `Post ${number}`, body, bodyText: "Hello world.",
  url: `https://github.com/writer/site/discussions/${number}`,
  createdAt: `2026-10-${String(number).padStart(2, "0")}T12:00:00Z`,
  updatedAt: "2026-10-18T12:00:00Z", author: { login: "writer", url: "https://github.com/writer" },
});
const page = (nodes, hasNextPage = false, endCursor = null) => ({
  discussions: { nodes, pageInfo: { hasNextPage, endCursor } },
});

function mockGitHub(responses, requests = []) {
  return async (url, options) => {
    requests.push({ url, ...options, request: JSON.parse(options.body) });
    const response = responses.shift();
    assert.ok(response, "Unexpected GitHub request");
    return { ok: true, json: async () => ({ data: { repository: response } }) };
  };
}

test("blog sync selects the category, paginates all posts, and emits only public content", async () => {
  const requests = [];
  const snapshot = await fetchBlogSnapshot(source, "test-token", mockGitHub([
    repository, page([post(1)], true, "page-2"), page([post(2)]),
  ], requests));
  assert.deepEqual(snapshot.posts.map(({ number }) => number), [2, 1]);
  assert.equal(snapshot.repository, "writer/site");
  assert.equal(snapshot.category.id, "blog-id");
  assert.equal(snapshot.posts[0].html, "<p>Hello <strong>world</strong>.</p>");
  assert.equal(requests[1].request.variables.categoryId, "blog-id");
  assert.equal(requests[2].request.variables.after, "page-2");
  assert.equal(requests[0].headers.Authorization, "Bearer test-token");
  assert.ok(!JSON.stringify(snapshot).includes("test-token"));
});

test("an empty blog is a successful snapshot", async () => {
  const snapshot = await fetchBlogSnapshot(source, "token", mockGitHub([repository, page([])]));
  assert.deepEqual(snapshot.posts, []);
});

test("sync refuses private repositories and missing categories", async () => {
  await assert.rejects(fetchBlogSnapshot(source, "token", mockGitHub([{ ...repository, isPrivate: true }])), /public repository/);
  await assert.rejects(fetchBlogSnapshot({ ...source, category: "Missing" }, "token", mockGitHub([repository])), /was not found/);
});

test("HTTP and GraphQL errors fail the sync", async () => {
  await assert.rejects(fetchBlogSnapshot(source, "token", async () => ({ ok: false, status: 403 })), /HTTP 403/);
  await assert.rejects(fetchBlogSnapshot(source, "token", async () => ({ ok: true, json: async () => ({ errors: [{ message: "Access denied" }] }) })), /Access denied/);
});

test("invalid pagination does not publish a partial snapshot", async () => {
  await assert.rejects(fetchBlogSnapshot(source, "token", mockGitHub([
    repository, page([post(1)], true, "same"), page([post(2)], true, "same"),
  ])), /pagination cursor/);
});

test("post routes use exact stable discussion numbers", () => {
  assert.equal(blogPostPath(12), "/blog/12");
  assert.equal(blogPostNumber("/blog/12/"), 12);
  for (const path of ["/blog", "/blog/0", "/blog/-1", "/blog/01", "/blog/12/extra", "/blog/9007199254740992"]) {
    assert.equal(blogPostNumber(path), null);
  }
});
