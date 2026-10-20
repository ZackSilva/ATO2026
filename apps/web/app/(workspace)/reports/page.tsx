"use client";

import RecordedFinances from "../../recorded-finances";
import { useWorkspace } from "../../workspace-shell";

export default function ReportsPage() {
  const { onExpired } = useWorkspace();
  return <main className="workspace-page reports-page" id="main">
    <div className="workspace-heading"><div><h1>Reports</h1><p>Your recorded spending, sales, and profit. Separate from market estimates.</p></div></div>
    <RecordedFinances refreshKey={0} onExpired={onExpired} />
  </main>;
}
