import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessManifest } from "../../scripts/secret-access.mjs";
import { completeLoginIdentity, forgetLogin, readSavedLogin, rememberLogin, restoreLogin } from "./session.js";

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const config = {
  token: "synthetic-project-token",
  projects: [{ id: "research", owner: "example", repo: "research" }],
  users: [{ username: "ada", password: "synthetic-password-1234", author: { name: "Ada", email: "ada@example.com" }, projects: ["research"] }],
};

test("saved logins restore against the latest access configuration and sign-out clears them", async () => {
  const storage = memoryStorage();
  const user = config.users[0];
  rememberLogin({ username: " ADA ", password: user.password }, storage);
  assert.deepEqual(readSavedLogin(storage), { username: "ada", password: user.password });
  const updated = structuredClone(config);
  updated.token = "rotated-project-token";
  updated.projects.push({ id: "other", owner: "example", repo: "other" });
  updated.users[0].projects.push("other");
  const manifest = await buildAccessManifest(JSON.stringify(updated));
  const access = await restoreLogin(manifest, storage);
  assert.equal(access.token, updated.token);
  assert.deepEqual(access.projects.map(project => project.id), ["research", "other"]);
  assert.ok(!JSON.stringify([...storage.values.values()]).includes(updated.token));
  forgetLogin(storage);
  assert.equal(storage.values.size, 0);
  assert.equal(await restoreLogin(manifest, storage), null);
});

test("a removed account or changed password clears a saved login", async () => {
  const storage = memoryStorage();
  const user = config.users[0];
  for (const change of [next => { next.users = []; }, next => { next.users[0].password = "different-password-1234"; }]) {
    const updated = structuredClone(config);
    change(updated);
    rememberLogin(user, storage);
    assert.equal(await restoreLogin(await buildAccessManifest(JSON.stringify(updated)), storage), null);
    assert.equal(storage.values.size, 0);
  }
});

test("unavailable or malformed browser storage falls back to manual sign-in", async () => {
  const blocked = {
    getItem() { throw new Error("Storage blocked"); },
    setItem() { throw new Error("Storage blocked"); },
    removeItem() { throw new Error("Storage blocked"); },
  };
  assert.doesNotThrow(() => rememberLogin({ username: "ada", password: "password" }, blocked));
  assert.doesNotThrow(() => forgetLogin(blocked));
  assert.equal(await restoreLogin(null, blocked), null);
  const storage = memoryStorage();
  for (const value of ["{", "null", '{"username":"ada"}']) {
    rememberLogin({ username: "ada", password: "password" }, storage);
    storage.values.set([...storage.values.keys()][0], value);
    assert.equal(readSavedLogin(storage), null);
    assert.equal(storage.values.size, 0);
  }
});

test("invitations without an author require a supplied identity and restore it after sign-in", async () => {
  const input = structuredClone(config);
  delete input.users[0].author;
  const manifest = await buildAccessManifest(JSON.stringify(input));
  const storage = memoryStorage();
  const user = input.users[0];
  rememberLogin(user, storage);
  assert.equal(await restoreLogin(manifest, storage), null);
  assert.equal(storage.values.size, 0);

  const author = { name: "Ada Lovelace", email: "ada@example.com" };
  rememberLogin({ ...user, author }, storage);
  const access = await restoreLogin(manifest, storage);
  assert.deepEqual(access.author, author);
  assert.equal(access.token, config.token);
  assert.deepEqual(access.projects.map(project => project.id), ["research"]);
  assert.ok(!JSON.stringify([...storage.values.values()]).includes(config.token));

  const configured = await restoreLogin(await buildAccessManifest(JSON.stringify(config)), storage);
  assert.deepEqual(configured.author, config.users[0].author);
});

test("identity completion requires a full name and email and preserves configured identities", () => {
  const invitation = { username: "ada", token: config.token };
  for (const author of [undefined, {}, { name: "Ada" }, { name: "", email: "ada@example.com" }, { name: "Ada\nLovelace", email: "ada@example.com" }, { name: "Ada", email: "invalid" }]) {
    assert.equal(completeLoginIdentity(invitation, author), null);
  }
  const complete = completeLoginIdentity(invitation, { name: " Ada Lovelace ", email: " ada@example.com " });
  assert.deepEqual(complete.author, { name: "Ada Lovelace", email: "ada@example.com" });
  assert.equal(invitation.author, undefined);
  const configured = { ...invitation, author: config.users[0].author };
  assert.deepEqual(completeLoginIdentity(configured, { name: "Other", email: "other@example.com" }).author, configured.author);
});
