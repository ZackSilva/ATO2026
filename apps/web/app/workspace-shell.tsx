"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError, type Session } from "../lib/api";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./workspace.css";
import Brand from "../components/brand";
import AccountMenu from "../components/account-menu";

type WorkspaceSession = { session: Session; onExpired: () => void };
const WorkspaceContext = createContext<WorkspaceSession | null>(null);

export function useWorkspace(): WorkspaceSession {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("Workspace pages require a signed-in session.");
  return workspace;
}

const navigation = [
  { href: "/", label: "Home" },
  { href: "/collection", label: "My Collection" },
  { href: "/reports", label: "Reports" },
  { href: "/discover", label: "Discover" },
  { href: "/settings", label: "Settings" },
];

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState(false);
  const requestId = useRef(0);
  const pendingMutation = useRef(false);
  const expired = useCallback(() => { setSession(null); }, []);

  const refresh = useCallback(async () => {
    if (pendingMutation.current) return;
    const id = ++requestId.current;
    try {
      const current = await api<Session>("/auth/me");
      if (id === requestId.current) { setSession(current); setConnectionError(false); setError(""); }
    } catch (failure) {
      if (id !== requestId.current) return;
      if (failure instanceof ApiError && failure.status === 401) {
        setSession(null); setConnectionError(false);
      } else {
        setConnectionError(true); setError((failure as Error).message);
      }
    } finally { if (id === requestId.current) setLoading(false); }
  }, []);

  useEffect(() => {
    // Cancel the initial request before it starts if React remounts this effect.
    const initialCheck = window.setTimeout(() => { void refresh(); }, 0);
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    return () => { window.clearTimeout(initialCheck); window.removeEventListener("focus", focus); };
  }, [refresh]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const id = ++requestId.current;
    pendingMutation.current = true;
    setBusy(true); setError("");
    try {
      const current = await api<Session>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: fields.get("username"), password: fields.get("password") }),
      });
      if (id === requestId.current) { setSession(current); setConnectionError(false); form.reset(); }
    } catch (failure) { if (id === requestId.current) setError((failure as Error).message); }
    finally { pendingMutation.current = false; setBusy(false); }
  }

  async function signOut() {
    if (!session) return;
    const id = ++requestId.current;
    pendingMutation.current = true;
    setBusy(true); setError("");
    try {
      await api<void>("/auth/logout", { method: "POST", headers: { "X-CSRF-Token": session.csrf_token } });
      if (id === requestId.current) setSession(null);
    } catch (failure) {
      if (id === requestId.current) {
        if (failure instanceof ApiError && failure.status === 401) setSession(null);
        else setError((failure as Error).message);
      }
    } finally { pendingMutation.current = false; setBusy(false); }
  }

  return <div className="app-shell">
    <header className="site-header">
      <Brand />
      {session && !loading ? <AccountMenu username={session.username} busy={busy} onSignOut={() => void signOut()} /> : <span className="header-note">YOUR COLLECTION, SIMPLIFIED.</span>}
    </header>
    {session && !connectionError && !loading ? <>
      {error && <p className="error" id="access-error" role="alert">{error}</p>}
      <nav className="workspace-navigation" aria-label="Workspace">
        {navigation.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href || item.href !== "/" && pathname.startsWith(`${item.href}/`) ? "page" : undefined}>{item.label}</Link>)}
      </nav>
      <WorkspaceContext.Provider value={{ session, onExpired: expired }}>{children}</WorkspaceContext.Provider>
    </> : <main id="main">
      <div className="intro">
        <span className="eyebrow">THE COLLECTOR’S WORKSPACE</span>
        <h1>Every card has a story.<br /><span>Keep yours together.</span></h1>
        <p>A private home for the collection you’re building.<br className="desktop-break" /> Your cards, your records, your perspective.</p>
        <div className="card-art" aria-hidden="true">
          <div className="slab back-slab"><div className="slab-label"><i /><i /></div><div className="card-face"><span>ST</span></div></div>
          <div className="slab front-slab"><div className="slab-label"><i /><i /></div><div className="card-face"><div className="court" /><span>THE<br />PERSONAL<br />COLLECTION.</span><small>SLABTRAK / YOUR VAULT</small></div></div>
        </div>
      </div>
      <section className="access-panel" aria-labelledby="panel-title" aria-busy={loading || busy}>
        {loading ? <div role="status"><span className="eyebrow">PRIVATE ACCESS</span><h2 id="panel-title">Opening your workspace…</h2><p>Checking your session.</p></div>
          : connectionError ? <div><span className="eyebrow">CONNECTION INTERRUPTED</span><h2 id="panel-title">Let’s reconnect.</h2><p>We couldn’t verify your session. Your records have not been changed.</p><button className="primary" onClick={() => { setLoading(true); void refresh(); }}>Try again</button></div>
          : <div>
            <span className="eyebrow">WELCOME TO YOUR VAULT</span><h2 id="panel-title">Sign in to SlabTrak.</h2>
            <p>Pick up where your collection left off.</p>
            <form onSubmit={signIn}>
              <label htmlFor="username">Username</label>
              <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={64} required disabled={busy} aria-describedby={error ? "access-error" : undefined} />
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete="current-password" maxLength={128} required disabled={busy} aria-describedby={error ? "access-error" : undefined} />
              <button className="primary" disabled={busy} type="submit">{busy ? "Signing in…" : "Open my workspace"}<span aria-hidden="true">↗</span></button>
            </form>
            <p className="setup-note">Private installation. Create or recover your owner account using the setup instructions in the README.</p>
          </div>}
        {error && <p className="error" id="access-error" role="alert">{error}</p>}
      </section>
    </main>}
    <footer><span>BUILT AROUND WHAT YOU COLLECT.</span><span><a href="/design">Design system</a><span aria-hidden="true"> · </span>SlabTrak</span></footer>
  </div>;
}
