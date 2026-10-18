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

export function rememberLogin(username, password, storage = browserStorage()) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ username: canonicalUsername(username), password }));
  } catch { /* Sign-in can still succeed when browser storage is unavailable. */ }
}

export async function restoreLogin(manifest, storage = browserStorage()) {
  const login = readSavedLogin(storage);
  if (!login) return null;
  try { return await unlockAccess(manifest, login.username, login.password); }
  catch {
    forgetLogin(storage);
    return null;
  }
}
