import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { ACCEPTANCE_REPOSITORY, NDA_ACTION_LABEL, NDA_NOTICE_TEXT, recordNdaAcceptance } from "./acceptance.js";

const access = {
  username: "ada",
  author: { name: "Ada Lovelace", email: "ada@example.com" },
  token: "synthetic-shared-token",
  projects: [{ repo: "do-not-record-this-private-project" }],
};
const agreement = { version: "2026-10-17", href: "/nda", markdown: "# NDA\n\nConfidential research: βιολογία 🧬.\n" };

async function mockFetch(implementation, run) {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  try { return await run(); } finally { globalThis.fetch = original; }
}

function notFound() { return Response.json({ message: "Not Found" }, { status: 404 }); }
function fileResponse(receipt) {
  return Response.json({ type: "file", encoding: "base64", content: Buffer.from(JSON.stringify(receipt)).toString("base64"), html_url: "https://github.com/tretikov-com/nda-acceptances/blob/main/receipt.json" });
}

test("NDA receipt preserves the full agreement and identity before a confirmed GitHub write", async () => {
  const calls = [];
  let saved;
  const result = await mockFetch(async (url, options) => {
    assert.equal(new URL(url).origin, "https://api.github.com");
    assert.ok(new URL(url).pathname.startsWith(`/repos/${ACCEPTANCE_REPOSITORY.owner}/${ACCEPTANCE_REPOSITORY.repo}/contents/acceptances/`));
    assert.equal(options.headers.Authorization, "Bearer synthetic-shared-token");
    assert.equal(options.cache, "no-store");
    calls.push({ url, options });
    if (!options.method) return notFound();
    assert.equal(options.method, "PUT");
    const body = JSON.parse(options.body);
    assert.equal(body.branch, "main");
    assert.equal(body.message, `Record NDA acceptance for ada (${agreement.version})\n\nSubmitted by Ada Lovelace <ada@example.com> (ada).`);
    assert.equal(body.author, undefined);
    assert.ok(!Object.hasOwn(body, "sha"));
    saved = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
    return Response.json({ content: { html_url: "https://github.com/tretikov-com/nda-acceptances/blob/main/receipt.json" }, commit: { sha: "receipt-commit" } }, { status: 201 });
  }, () => recordNdaAcceptance(access, agreement, { origin: "https://max.tretikov.com" }));
  assert.equal(calls.length, 2);
  assert.equal(result.commitSha, "receipt-commit");
  assert.equal(saved.event, "nda.accepted");
  assert.equal(saved.agreement.markdown, agreement.markdown);
  assert.equal(saved.agreement.version, agreement.version);
  assert.equal(saved.agreement.sha256, createHash("sha256").update(agreement.markdown).digest("hex"));
  assert.deepEqual(saved.account, { username: "ada", ...access.author });
  assert.equal(saved.noticeText, NDA_NOTICE_TEXT);
  assert.equal(saved.actionLabel, NDA_ACTION_LABEL);
  assert.equal(saved.origin, "https://max.tretikov.com");
  assert.ok(Number.isFinite(Date.parse(saved.clientAcceptedAt)));
  assert.match(result.path, /^acceptances\/[0-9a-f]{64}\/[0-9a-f]{64}\.json$/);
  for (const value of [access.token, access.projects[0].repo]) assert.ok(!JSON.stringify(saved).includes(value));
});

test("repeated sign-ins reuse a matching receipt; agreement or identity changes require a new path", async () => {
  const receipts = new Map();
  const paths = [];
  let writes = 0;
  await mockFetch(async (url, options) => {
    const path = new URL(url).pathname;
    paths.push(path);
    if (!options.method) return receipts.has(path) ? fileResponse(receipts.get(path)) : notFound();
    writes += 1;
    receipts.set(path, JSON.parse(Buffer.from(JSON.parse(options.body).content, "base64").toString()));
    return Response.json({ content: {}, commit: { sha: `commit-${writes}` } }, { status: 201 });
  }, async () => {
    await recordNdaAcceptance(access, agreement);
    await recordNdaAcceptance(access, agreement);
    assert.equal(writes, 1);
    await recordNdaAcceptance(access, { ...agreement, markdown: `${agreement.markdown}\nUpdated.` });
    await recordNdaAcceptance({ ...access, author: { ...access.author, email: "different@example.com" } }, agreement);
    assert.equal(writes, 3);
    assert.equal(new Set(paths).size, 3);
  });
});

test("concurrent sign-ins recover the same receipt without overwriting it", async () => {
  let saved;
  let reads = 0;
  await mockFetch(async (_url, options) => {
    if (!options.method) return ++reads === 1 ? notFound() : fileResponse(saved);
    saved = JSON.parse(Buffer.from(JSON.parse(options.body).content, "base64").toString());
    return Response.json({ message: "File already exists" }, { status: 422 });
  }, async () => assert.ok((await recordNdaAcceptance(access, agreement)).receipt));
  assert.equal(reads, 2);
});

test("permission failures and mismatched saved receipts reject sign-in recording", async () => {
  await mockFetch(async () => Response.json({ message: "Forbidden" }, { status: 403 }), () => assert.rejects(recordNdaAcceptance(access, agreement), (error) => error.status === 403));
  await mockFetch(async () => fileResponse({ event: "nda.accepted", account: { username: "someone-else" } }), () => assert.rejects(recordNdaAcceptance(access, agreement), /does not match/));
  await mockFetch(() => { throw new Error("Must not request"); }, () => assert.rejects(recordNdaAcceptance({ ...access, token: null }, agreement), /configured account/));
});

test("receipt requests use the shared receipt token for a different resource owner", async () => {
  await mockFetch(async (_url, options) => {
    assert.equal(options.headers.Authorization, "Bearer synthetic-shared-receipt-token");
    if (!options.method) return notFound();
    return Response.json({ content: {}, commit: { sha: "receipt" } }, { status: 201 });
  }, () => recordNdaAcceptance({ ...access, acceptanceToken: "synthetic-shared-receipt-token" }, agreement));
});
