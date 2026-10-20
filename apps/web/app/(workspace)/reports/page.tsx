"use client";

import { useState } from "react";
import type { ValueRange } from "../../../lib/collection-values";
import RecordedFinances from "../../recorded-finances";
import MarketOverview from "../../market-overview";
import CollectionValueChart from "../../value-chart";
import CollectionBreakdown from "../../collection-breakdown";
import { useWorkspace } from "../../workspace-shell";
import "../../report-charts.css";

export default function ReportsPage() {
  const { onExpired } = useWorkspace();
  const [range, setRange] = useState<ValueRange>("1m");
  return <main className="workspace-page reports-page" id="main">
    <div className="workspace-heading"><div><h1>Reports</h1><p>Your collection value, spending, and sales.</p></div></div>
    <MarketOverview onExpired={onExpired} title="Collection value" caption="Current snapshot · independent of the spending period" />
    <div className="report-visualizations">
      <CollectionValueChart range={range} onRangeChange={setRange} refreshKey={0} onExpired={onExpired} showSummary={false} />
      <CollectionBreakdown onExpired={onExpired} />
    </div>
    <RecordedFinances refreshKey={0} onExpired={onExpired} />
  </main>;
}
