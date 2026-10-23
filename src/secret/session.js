import { canonicalUsername, unlockAccess } from "./credentials.js";

const STORAGE_KEY = "max.secret-project-login";

function browserStorage() {
  try { return globalThis.localStorage; }
  catch { return null; }
}

export function forgetLogin(storage = browserStorage()) {
  try { storage?.removeItem(STORAGE_KEY); }
  catch { /* Sign-out still clears the in-memory session if storage is unavailable. */ }
}

export function readSavedLogin(storage = browserStorage()) {
  try {
    const login = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
    if (typeof login?.username === "string" && login.username
      && typeof login.password === "string" && login.password) return login;
  } catch { /* Invalid or unavailable storage falls back to the sign-in form. */ }
  forgetLogin(storage);
  return null;
}

export function completeLoginIdentity(access, author) {
  const identity = access.author || author;
  const name = typeof identity?.name === "string" ? identity.name.trim() : "";
  const email = typeof identity?.email === "string" ? identity.email.trim() : "";
  if (!name || /[\r\n]/.test(name) || !/^[^\s@]+@[^\s@]+$/.test(email)) return null;
  return { ...access, author: { name, email } };
}

export function rememberLogin({ username, password, author }, storage = browserStorage()) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ username: canonicalUsername(username), password, author }));
  } catch { /* Sign-in can still succeed when browser storage is unavailable. */ }
}

export async function restoreLogin(manifest, storage = browserStorage()) {
  const login = readSavedLogin(storage);
  if (!login) return null;
  try {
    const access = completeLoginIdentity(await unlockAccess(manifest, login.username, login.password), login.author);
    if (access) return access;
    forgetLogin(storage);
    return null;
  }
  catch {
    forgetLogin(storage);
    return null;
  }
}
