import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessManifest } from "../../scripts/secret-access.mjs";
import { forgetLogin, readSavedLogin, rememberLogin, restoreLogin } from "./session.js";

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
  rememberLogin(" ADA ", user.password, storage);
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
    rememberLogin(user.username, user.password, storage);
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
  assert.doesNotThrow(() => rememberLogin("ada", "password", blocked));
  assert.doesNotThrow(() => forgetLogin(blocked));
  assert.equal(await restoreLogin(null, blocked), null);
  const storage = memoryStorage();
  for (const value of ["{", "null", '{"username":"ada"}']) {
    rememberLogin("ada", "password", storage);
    storage.values.set([...storage.values.keys()][0], value);
    assert.equal(readSavedLogin(storage), null);
    assert.equal(storage.values.size, 0);
  }
});
