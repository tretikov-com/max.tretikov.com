import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessManifest } from "../../scripts/secret-access.mjs";
import { fromBase64, toBase64, unlockAccess, usernameKey } from "./credentials.js";

const config = {
  token: "synthetic-shared-token",
  projects: [
    { id: "research", label: "Research", owner: "example", repo: "private-research", root: "docs" },
    { id: "other", owner: "example", repo: "other" },
  ],
  users: [{ username: "Ada", password: "synthetic-password-1234", author: { name: "Ada Lovelace", email: "ada@example.com" }, projects: ["research"] }],
};

test("build encrypts per-user access and unlocks only assigned repositories", async () => {
  const manifest = await buildAccessManifest(JSON.stringify(config));
  const serialized = JSON.stringify(manifest);
  for (const value of ["Ada", "synthetic-shared-token", "synthetic-password-1234", "private-research", "ada@example.com"]) {
    assert.ok(!serialized.includes(value));
  }
  const access = await unlockAccess(manifest, " ADA ", config.users[0].password);
  assert.equal(access.username, "ada");
  assert.equal(access.token, config.token);
  assert.deepEqual(access.author, config.users[0].author);
  assert.deepEqual(access.projects.map((project) => project.id), ["research"]);
  assert.equal(access.projects[0].ref, "main");
  assert.deepEqual(access.projects[0].exclude, [".obsidian"]);
  await assert.rejects(unlockAccess(manifest, "ada", "wrong password"), /Username or password is incorrect/);
  await assert.rejects(unlockAccess(manifest, "unknown", "wrong password"), /Username or password is incorrect/);
  const id = await usernameKey("ada");
  const damaged = structuredClone(manifest);
  const bytes = fromBase64(damaged.users[id].ciphertext);
  bytes[0] ^= 1;
  damaged.users[id].ciphertext = toBase64(bytes);
  await assert.rejects(unlockAccess(damaged, "ada", config.users[0].password), /Username or password is incorrect/);
});

test("configuration errors fail the build without echoing input credentials", async () => {
  const invalid = structuredClone(config);
  invalid.users[0].projects = ["missing"];
  await assert.rejects(buildAccessManifest(JSON.stringify(invalid)), /configured project IDs/);
  invalid.users[0].projects = ["research"];
  invalid.users[0].password = "short";
  await assert.rejects(buildAccessManifest(JSON.stringify(invalid)), /at least 16 characters/);
  await assert.rejects(buildAccessManifest('{"token":"do-not-echo-this"'), (error) => !error.message.includes("do-not-echo-this"));
  assert.deepEqual(await buildAccessManifest(""), { version: 1, users: {} });
});

test("private source visibility settings survive encrypted access without excluding files", async () => {
  const input = structuredClone(config);
  input.projects[0].hideFromTree = { paths: ["figures"], extensions: [".svg", ".png"] };
  const manifest = await buildAccessManifest(JSON.stringify(input));
  const access = await unlockAccess(manifest, input.users[0].username, input.users[0].password);
  assert.deepEqual(access.projects[0].hideFromTree, input.projects[0].hideFromTree);
  assert.deepEqual(access.projects[0].exclude, [".obsidian"]);
});

test("invalid tree visibility settings fail configuration validation", async () => {
  for (const hidden of [
    null,
    ["figures"],
    { paths: "figures" },
    { paths: ["../figures"] },
    { paths: [""] },
    { extensions: "png" },
    { extensions: ["png"] },
    { extensions: [".png/other"] },
  ]) {
    const input = structuredClone(config);
    input.projects[0].hideFromTree = hidden;
    await assert.rejects(buildAccessManifest(JSON.stringify(input)), /hideFromTree/);
  }
});


test("individual sign-ins unlock one shared GitHub token and retain distinct contributor identities", async () => {
  const shared = structuredClone(config);
  shared.acceptanceToken = "synthetic-shared-receipt-token";
  shared.users.push({ username: "Grace", password: "another-synthetic-password-1234", author: { name: "Grace Hopper", email: "grace@example.com" }, projects: ["other"] });
  const manifest = await buildAccessManifest(JSON.stringify(shared));
  const ada = await unlockAccess(manifest, "ada", shared.users[0].password);
  const grace = await unlockAccess(manifest, "grace", shared.users[1].password);
  assert.equal(ada.token, shared.token);
  assert.equal(grace.token, shared.token);
  assert.equal(ada.acceptanceToken, shared.acceptanceToken);
  assert.equal(grace.acceptanceToken, shared.acceptanceToken);
  assert.ok(!JSON.stringify(manifest).includes(shared.acceptanceToken));
  assert.deepEqual(ada.author, shared.users[0].author);
  assert.deepEqual(grace.author, shared.users[1].author);
  assert.deepEqual(ada.projects.map((project) => project.id), ["research"]);
  assert.deepEqual(grace.projects.map((project) => project.id), ["other"]);
});
