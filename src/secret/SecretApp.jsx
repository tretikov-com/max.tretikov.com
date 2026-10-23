import React, { useEffect, useState } from "react";
import SiteHeader from "../SiteHeader.jsx";
import VaultApp from "../vault/VaultApp.jsx";
import SessionAccount from "./SessionAccount.jsx";
import { unlockAccess } from "./credentials.js";
import { NDA_ACTION_LABEL, recordNdaAcceptance } from "./acceptance.js";
import { NDA_DOCUMENT } from "./nda-document.js";
import { completeLoginIdentity, forgetLogin, readSavedLogin, rememberLogin, restoreLogin } from "./session.js";
import "./secret.css";

let activeSession = null;

function startSession(access) {
  const controller = new AbortController();
  return {
    username: access.username,
    author: access.author,
    controller,
    sources: access.projects.map((project) => ({
      ...project,
      private: true,
      token: access.token,
      username: access.username,
      author: access.author,
      signal: controller.signal,
    })),
  };
}

export default function SecretApp({ route }) {
  const [session, setSession] = useState(activeSession);
  const [manifest, setManifest] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [identity, setIdentity] = useState(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(() => !activeSession && Boolean(readSavedLogin()));
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.view = "vault";
    document.body.dataset.view = "vault";
    return () => {
      delete document.documentElement.dataset.view;
      delete document.body.dataset.view;
    };
  }, [session]);

  useEffect(() => {
    if (session) return;
    const controller = new AbortController();
    setManifest(null);
    setError(null);
    setRestoring(Boolean(readSavedLogin()));
    fetch("/secret-access.json", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The access file could not be loaded.");
        const value = await response.json();
        if (value.version !== 1 || !value.users) throw new Error("The access file is invalid.");
        const access = await restoreLogin(value);
        if (controller.signal.aborted) return;
        setManifest(value);
        if (access) {
          activeSession = startSession(access);
          setSession(activeSession);
        }
      })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure); })
      .finally(() => { if (!controller.signal.aborted) setRestoring(false); });
    return () => controller.abort();
  }, [session, attempt]);

  const signIn = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const invitation = await unlockAccess(manifest, username, password);
      if (!invitation.author && identity?.username !== invitation.username) {
        setIdentity({ username: invitation.username, name: "", email: "" });
        return;
      }
      const access = completeLoginIdentity(invitation, identity);
      if (!access) throw new Error("Enter your full name and a valid email address.");
      try {
        await recordNdaAcceptance(access, NDA_DOCUMENT, { origin: window.location.origin });
      } catch (failure) {
        throw new Error(`Your NDA acceptance could not be saved, so sign-in has not completed. Please retry or contact Max. ${failure.message}`);
      }
      rememberLogin({ username: access.username, password, author: access.author });
      activeSession = startSession(access);
      setSession(activeSession);
      setPassword("");
      setIdentity(null);
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  };

  if (session) return <VaultApp
    route={route}
    sources={session.sources}
    privateProjects
    account={<SessionAccount name={session.author.name} onSignOut={() => {
      forgetLogin();
      session.controller.abort();
      activeSession = null;
      setSession(null);
    }} />}
  />;

  if (restoring) return <div className="vault-screen secret-screen">
    <SiteHeader />
    <div className="route-loading" role="status">RESTORING SESSION…</div>
  </div>;

  const configured = manifest && Object.keys(manifest.users).length > 0;
  return <div className="vault-screen secret-screen">
    <SiteHeader actions={
      <a className="vault-secondary-action" href="/projects">PUBLIC PROJECTS ↗</a>
    } />
    <main className="secret-entry">
      <section className="secret-entry-intro">
        <h1>SECRET<br />PROJECTS</h1>
        <p>Ideas in progress. Sign in to read, edit, and contribute.</p>
        <div className="secret-entry-mark" aria-hidden="true"><i /><i /><i /><i /></div>
      </section>
      <form className="secret-login" onSubmit={signIn}>
        <p className="vault-eyebrow">COLLABORATOR ACCESS</p>
        <label>USERNAME<input autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(event) => { setUsername(event.target.value); setIdentity(null); }} required disabled={busy} /></label>
        <label>PASSWORD<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} /></label>
        {identity && <>
          <p className="secret-login-detail" role="status">Before signing in, add your full name and email for your NDA acceptance and contributions.</p>
          <label>FULL NAME<input autoComplete="name" value={identity.name} onChange={(event) => setIdentity({ ...identity, name: event.target.value })} required disabled={busy} autoFocus /></label>
          <label>EMAIL<input type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={identity.email} onChange={(event) => setIdentity({ ...identity, email: event.target.value })} required disabled={busy} /></label>
        </>}
        <p className="secret-login-detail">Use the credentials Max shared with you. This browser keeps you signed in until you sign out.</p>
        {error && <p className="secret-error" role="alert">{error.message}</p>}
        {!manifest && !error && <p role="status">Loading access…</p>}
        {manifest && !configured && <p role="status">Invitations aren’t configured yet. Check back when Max has shared your access.</p>}
        {!manifest && error && <button className="vault-secondary-action" type="button" onClick={() => setAttempt((value) => value + 1)}>RETRY CONNECTION</button>}
        <p className="secret-login-agreement" id="sign-in-agreement">
          By logging in, I agree to the <a href={NDA_DOCUMENT.href} target="_blank" rel="noreferrer">Non-Disclosure Agreement (NDA)</a>.
        </p>
        <button aria-describedby="sign-in-agreement" className="vault-action" type="submit" disabled={!configured || busy}>{busy ? "SIGNING IN…" : NDA_ACTION_LABEL}</button>
      </form>
      <footer className="vault-plate-meta">
        <p>PRIVATE RESEARCH / INVITED COLLABORATORS</p>
      </footer>
    </main>
  </div>;
}
