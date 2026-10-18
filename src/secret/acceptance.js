import { githubRequest, repositoryApiUrl } from "../vault/github.js";
import { canonicalUsername, fromBase64, toBase64 } from "./credentials.js";
import { attributedCommitMessage } from "./attribution.js";

export const ACCEPTANCE_REPOSITORY = { owner: "tretikov-com", repo: "nda-acceptances", ref: "main" };
export const NDA_NOTICE_TEXT = "By logging in, I agree to the Non-Disclosure Agreement (NDA).";
export const NDA_ACTION_LABEL = "SIGN IN →";
const encoder = new TextEncoder();

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function matchesReceipt(receipt, expected) {
  return receipt?.schemaVersion === 1
    && receipt.event === "nda.accepted"
    && receipt.account?.username === expected.account.username
    && receipt.account?.name === expected.account.name
    && receipt.account?.email === expected.account.email
    && receipt.agreement?.version === expected.agreement.version
    && receipt.agreement?.sha256 === expected.agreement.sha256
    && receipt.agreement?.markdown === expected.agreement.markdown
    && receipt.noticeText === expected.noticeText
    && receipt.actionLabel === expected.actionLabel;
}

async function readReceipt(source, path, expected) {
  let data;
  try {
    ({ data } = await githubRequest(source, repositoryApiUrl(source, `contents/${path}?ref=${encodeURIComponent(source.ref)}`)));
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
  if (data.type !== "file" || data.encoding !== "base64") throw new Error("The saved NDA acceptance is unreadable.");
  let receipt;
  try { receipt = JSON.parse(new TextDecoder().decode(fromBase64(data.content.replace(/\s/g, "")))); }
  catch { throw new Error("The saved NDA acceptance is unreadable."); }
  if (!matchesReceipt(receipt, expected)) throw new Error("The saved NDA acceptance does not match this account and agreement. Contact Max before signing in.");
  return { path, url: data.html_url, receipt };
}

export async function recordNdaAcceptance(access, agreement, { origin } = {}) {
  const source = { ...ACCEPTANCE_REPOSITORY, private: true, token: access.acceptanceToken || access.token };
  if (!source.token || !access.username || !access.author?.name || !access.author?.email) {
    throw new Error("NDA recording requires a configured account and the shared GitHub token.");
  }
  if (!agreement?.version || !agreement?.markdown) throw new Error("The current NDA document could not be loaded.");

  const account = { username: canonicalUsername(access.username), name: access.author.name, email: access.author.email };
  const agreementHash = await sha256(agreement.markdown);
  const accountHash = await sha256(JSON.stringify(account));
  const path = `acceptances/${accountHash}/${agreementHash}.json`;
  const receipt = {
    schemaVersion: 1,
    event: "nda.accepted",
    id: crypto.randomUUID(),
    account,
    agreement: { version: agreement.version, sha256: agreementHash, url: agreement.href, markdown: agreement.markdown },
    noticeText: NDA_NOTICE_TEXT,
    actionLabel: NDA_ACTION_LABEL,
    clientAcceptedAt: new Date().toISOString(),
    origin: origin || null,
  };

  // A stable account-and-document path makes retries and repeated sign-ins idempotent.
  const existing = await readReceipt(source, path, receipt);
  if (existing) return existing;
  try {
    const { data } = await githubRequest(source, repositoryApiUrl(source, `contents/${path}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branch: source.ref,
        message: attributedCommitMessage(`Record NDA acceptance for ${account.username} (${agreement.version})`, access),
        content: toBase64(encoder.encode(`${JSON.stringify(receipt, null, 2)}\n`)),
      }),
    });
    return { path, url: data.content?.html_url, commitSha: data.commit?.sha, receipt };
  } catch (error) {
    // Two tabs may create the same file together. Never overwrite a receipt.
    if (error.status === 409 || error.status === 422) {
      const saved = await readReceipt(source, path, receipt);
      if (saved) return saved;
    }
    throw error;
  }
}
