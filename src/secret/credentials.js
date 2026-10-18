const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const ACCESS_VERSION = 1;
export const PASSWORD_ITERATIONS = 600_000;

export function canonicalUsername(value) {
  return String(value || "").trim().toLowerCase();
}

export function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export async function usernameKey(username) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(canonicalUsername(username)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function passwordKey(password, salt, usage) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

function encryptionOptions(username, iv) {
  return { name: "AES-GCM", iv, additionalData: encoder.encode(`secret-access:${ACCESS_VERSION}:${canonicalUsername(username)}`) };
}

export async function encryptAccess(username, password, payload) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(password, salt, "encrypt");
  const ciphertext = await crypto.subtle.encrypt(encryptionOptions(username, iv), key, encoder.encode(JSON.stringify(payload)));
  return { salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export async function unlockAccess(manifest, username, password) {
  if (manifest?.version !== ACCESS_VERSION) throw new Error("This access file is unsupported. Reload the page and try again.");
  try {
    const envelope = manifest.users[await usernameKey(username)];
    if (!envelope) throw new Error("Unknown account");
    const key = await passwordKey(password, fromBase64(envelope.salt), "decrypt");
    const plaintext = await crypto.subtle.decrypt(encryptionOptions(username, fromBase64(envelope.iv)), key, fromBase64(envelope.ciphertext));
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error("Username or password is incorrect.");
  }
}
