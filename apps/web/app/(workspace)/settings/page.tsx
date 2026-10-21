"use client";

import Link from "next/link";
import { useWorkspace } from "../../workspace-shell";
import MarketConnection from "../../market-connection";
import StorageConnection from "../../storage-connection";
import "../../settings.css";

export default function SettingsPage() {
  const { session } = useWorkspace();
  return <main className="workspace-page settings-page" id="main">
    <div className="workspace-heading"><div><h1>Settings</h1><p>Your account, storage, and app defaults.</p></div></div>
    <div className="settings-sections">
      <section className="settings-section" aria-labelledby="account-settings">
        <h2 id="account-settings">Account</h2>
        <dl className="settings-rows session-details">
          <div className="settings-row">
            <dt><span className="settings-label">Signed in as</span><span className="settings-hint">Sign out from the account menu.</span></dt>
            <dd className="settings-value settings-username">{session.username}</dd>
          </div>
        </dl>
      </section>

      <section className="settings-section" aria-labelledby="storage-settings">
        <h2 id="storage-settings">Private storage</h2>
        <div>
          <dl className="settings-rows">
            <div className="settings-row">
              <dt><span className="settings-label">Card records</span><span className="settings-hint">Saved privately in this installation.</span></dt>
              <dd><span className="settings-state">Database storage</span></dd>
            </div>
            <StorageConnection />
            <div className="settings-row">
              <dt><span className="settings-label">Recorded finances</span><span className="settings-hint">Your saved costs and sales.</span></dt>
              <dd><Link className="settings-action" href="/reports">View reports <span aria-hidden="true">→</span></Link></dd>
            </div>
          </dl>
          <details className="settings-notes">
            <summary>Installation notes</summary>
            <p>Use the same installation to access your collection on another device. Hosting, backups, account creation, and recovery are managed outside the app; see the installation README.</p>
          </details>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="market-settings">
        <h2 id="market-settings">Market data</h2>
        <dl className="settings-rows">
          <MarketConnection />
          <div className="settings-row">
            <dt><span className="settings-label">Recorded estimates</span><span className="settings-hint">Based on your saved completed-sale evidence.</span></dt>
            <dd><Link className="settings-action" href="/collection">View market data <span aria-hidden="true">→</span></Link></dd>
          </div>
        </dl>
      </section>

      <section className="settings-section" aria-labelledby="display-settings">
        <h2 id="display-settings">Display</h2>
        <dl className="settings-rows">
          <div className="settings-row">
            <dt><span className="settings-label">Appearance</span><span className="settings-hint">The app currently uses a pitch-black theme.</span></dt>
            <dd className="settings-value">Dark</dd>
          </div>
        </dl>
      </section>
    </div>
  </main>;
}
