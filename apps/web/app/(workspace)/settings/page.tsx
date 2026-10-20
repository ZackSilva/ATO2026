"use client";

import Link from "next/link";
import { useWorkspace } from "../../workspace-shell";

export default function SettingsPage() {
  const { session } = useWorkspace();
  return <main className="workspace-page" id="main">
    <div className="workspace-heading"><div><h1>Settings</h1><p>Your account and installation.</p></div></div>
    <section className="workspace-section" aria-labelledby="account-settings"><h2 id="account-settings">Account</h2><dl className="session-details"><div><dt>Signed in as</dt><dd>{session.username}</dd></div></dl><p>Use the account menu in the top right to sign out. Account creation and recovery are managed using the installation instructions in the README.</p></section>
    <section className="workspace-section" aria-labelledby="storage-settings"><h2 id="storage-settings">Private storage</h2><p>This installation stores card records in its database and photos in private storage. Records persist across reloads; sign in to the same installation to access your collection from another device.</p><p>Hosting, backups, and storage configuration are managed outside the app. Additional preferences will appear here as those features become available.</p><Link className="workspace-text-link" href="/reports">View your recorded finances <span aria-hidden="true">↗</span></Link></section>
    <section className="workspace-section" aria-labelledby="market-settings"><h2 id="market-settings">Market data</h2><p>Live provider: not connected. Current estimates use your privately recorded completed-sale comparables, with a minimum of three matching sales in the last 180 days. Shipping, taxes, and selling fees are excluded from these market prices.</p><p>Raw and graded cards are supported. Graded matching uses the same grader and grade. Raw condition and sale sources are unverified; no grade multipliers or exchange rates are invented.</p><Link className="workspace-text-link" href="/collection">Manage evidence from a card’s details ↗</Link></section>
  </main>;
}
