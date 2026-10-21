# Frequently asked questions

[Documentation](README.md) · [Get started](getting-started.md) · [User guide](user-guide.md)

## What is SlabTrak? Is there an iPhone app?

SlabTrak is an early-preview browser app for tracking cards, costs, personal sales and market evidence. It supports raw and graded inventory on phones and computers. There is no native iOS app. See the [user guide](user-guide.md).

## Can I sign up for the hosted app?

Hosted access is private. The operator must bootstrap the first owner account through the controlled setup procedure. Public signup and a collector invitation flow are not available. Running your own installation also requires creating its owner. See [setup](getting-started.md) and [hosting](vercel-services.md).

## Can I use the same collection on different devices?

Sign in to the same account on the same hosted installation from each device. Browsers share one database, and views refresh after saves or when you return. Offline browser editing with later synchronization is not available. Hosting still has [remaining work](vercel-services.md#environment-and-remaining-hosting-work).

## Will installing locally copy my online collection?

No. Local Docker and hosted installations use separate databases and photo storage. Installing locally does not download or synchronize an online collection. Moving records or photos between installations requires a separately planned, verified transfer; there is no automatic local-to-hosted sync. See [architecture](architecture.md#deployment).

## Can I use SlabTrak without a market-data provider?

Yes. Core local collection management, photos, costs, personal sale records and reports work without a provider key. After dependencies are installed, the local installation supports these functions without internet. Live auction searches and automatic provider pricing need provider access; missing estimates stay unavailable. Start with [local setup](getting-started.md).

## Do I need a subscription or my own API key?

The operator optionally configures a CardSight key on the server; collectors do not enter it in the browser. Provider account terms, access and quotas apply, and research, matching and pricing share that allowance. A configured key does not guarantee a successful request. Check the current provider links in [market data](market-data.md) before choosing access.

## Where do estimates come from?

Automatic estimates use provider-reported completed auctions for a confirmed exact card match. At least three matching sales within 180 days support a median estimate. Missing, insufficient or failed pricing remains unavailable; purchase cost never fills the gap. Results are evidence-based estimates, with coverage and freshness limits, rather than independently verified sale prices. See [matching and evidence](market-data.md#automatic-collector-workflow).

## Which raw and graded cards can receive live prices?

Live pricing currently supports USD, raw cards with unassessed condition, and exact supported grader/grade labels. Condition-specific raw pricing, other currencies, autograph/relic identities and unsupported or unverifiable variants remain unavailable. Recording a card or grade does not guarantee pricing coverage, and grades are not converted using multipliers. See [coverage limits](market-data.md#automatic-collector-workflow).

## Are purchase costs and sale proceeds the same as market value?

No. Costs and your own sale figures are saved records; market estimates are separate. Blank costs mean unknown, while an explicit zero means a known zero. Complete-cost profit requires all acquisition components. Reports keep currencies separate and disclose incomplete totals. See [recorded finances](user-guide.md#reports-and-recorded-finances).

## Can I upload market-sale CSVs or enter comparable sales manually?

The collector interface has no manual market-sale entry or CSV import. Discover retrieves auction results through the provider. You can record the sale of your own physical card, including its sale price, fees and date; that is separate from market research. See [recording personal sales](user-guide.md#record-grading-and-sales).

## Where are my card photos stored?

Local uploads persist in Docker's named photo volume. Durable hosted photo storage is still pending; Vercel's temporary filesystem is insufficient for it. Do not treat the hosted preview as a completed persistent photo-storage solution. See [photo behavior](user-guide.md#front-and-back-photos) and [hosting limitations](vercel-services.md).

## What license covers the source?

SlabTrak is source available under [PolyForm Noncommercial 1.0.0](../LICENSE). Read that license for its permissions and conditions; commercial use outside those permissions requires a separate license. Dependencies retain their own terms, documented in [third-party notices](dependencies.md).
