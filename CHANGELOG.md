# Changelog

## Unreleased

- Add custom auction research within **Estimate Value**, with an owner-scoped saved query per physical card. Keep research results separate from confirmed estimates and saved comparable evidence; searches run only on explicit submission.
- Preserve the current estimate, exact-card confirmation and sales graphs. Save query changes with revision checks, retain them during ordinary card edits, and report provider errors without automatic retry loops.
- Add migration `0011` for the saved-query field. Apply it before deploying this update; no dependency or release-version changes.

## v0.1.0-beta.1 — October 21, 2026

- Add catalog search to card entry with explicitly chosen, editable identity details. Put **Estimate Value** near the top of the editor and in read-only card details: save the physical copy first, retrieve candidate matches automatically, and require **Use this match** before automatic pricing. Keep **Save card** independent of pricing with an estimate action afterward; rename the Sold comparables pricing section **Estimate Value**. Catalog requests use bounded transient caching and share provider quotas; typing makes no requests.
- Add reviewed PSA certificate proposals on certificate-field blur when server configuration and approved PSA API access are available. **Use certificate details** explicitly fills identity/grade, preserving existing manufacturer/year entries when the proposal lacks them and leaving all costs unchanged; pricing still requires a separate confirmed catalog match. BGS, SGC, CGC and TAG keep manual grading/certificate entry and official verification links. The live PSA attempt returned HTTP 403 requiring approved-customer access; no successful live lookup is claimed. See [coverage and setup](docs/certificate-lookups.md).
- Add automatic CardSight auction search, confirmed per-copy card matches, automatic collection estimates and linked listing previews. Keep unsupported identities, conditions and missing costs unknown.
- Add an explicitly selected private Supabase Storage photo backend while retaining Docker local storage by default. Reuse existing front/back photo keys, normalize uploads to bounded metadata-free JPEGs, and serve images through owner-authenticated API routes. Document private-bucket setup and four required Vercel Production settings; no database migration, dependency change or local-data transfer. Live hosted privacy, two-device and redeployment checks remain pending.
- Configure one Vercel Services project with a public Next.js frontend and an internal FastAPI backend connected through a runtime binding. Add migration `0010` for backend-only access when application tables have RLS enabled.
- Refresh the repository front page with the existing brand, a concise feature summary and a local quick start. Move detailed usage, maintenance and development instructions into focused guides.

- Keep interactive sales graphs in read-only card details and on the comparable-sales page, including sold cards. Refresh the example collection with five historically better-covered issues and 113 source-reported observations across 2024–2026; retain unknown personal costs and explicit source/coverage limits. Add opt-in archival evidence imports without changing current estimate recency.

- Restore Reports visualizations with saved-evidence estimate history, raw-versus-graded current values, and transaction charts expanded by default on phones. Unknown costs/estimates remain unknown; no separate data-source mode.

- Use saved collection records and comparable-sale evidence throughout Home, My Collection, and Reports. Remove runtime fictional values, data-source switches, and synthetic row trends; preserve unknown costs and separately labeled recorded sale results.
- Lead Home with the current known estimate subtotal and coverage. Plot rolling 180-day medians for a fixed cohort of today’s supported unsold cards, requiring three matching sales per card and leaving unsupported dates as gaps. This evidence history does not represent past holdings or investment returns.
- Show collection mini graphs from actual matching saved sale dates and prices. Fewer than two observations shows Not enough sale history; missing estimate support stays Insufficient Market Data. Keep matching currencies and grades separate, with unverified raw-condition and manual-source disclosures.
- Make Reports show real collection estimates before recorded spending and sale results. Group detailed costs and fees behind disclosure and clarify missing-cost and empty-history states.
- Replace the collection toolbar with compact search and collapsible filters. Give Settings clear individual rows and truthful account, storage, market-data, and display statuses.
- Add a dated, manually researched sale-evidence example and an operator importer that appends comparables to existing exact card identities, preserves unknown costs, preflights conflicts, and supports safe repeat imports.
- Add the Personal VS Code workspace with SlabTrak as its only folder, an explicit Personal window title, limited repository discovery, and local-only personal agent instructions.
- Split the workspace into Home, My Collection, Reports, Discover, and Settings with persistent private navigation, direct URLs, active-page state, reload, and history support. Move detailed financial summaries to Reports.
- Add automatic raw/graded estimate calculations from private user-recorded completed-sale comparables. Require three matching sales within 180 days, use exact median/range, and expose coverage, sources, recency, and confidence. Other grades remain research context; no live pricing feed or cross-grade conversion is claimed.
- Add separate comparable management without editable fields in card details. Guard stale card identities and duplicate evidence; preserve owner isolation and CSRF validation.
- License SlabTrak's original source under PolyForm Noncommercial 1.0.0 with canonical terms and copyright notice, frontend/API SPDX metadata, and documentation distinguishing original code from third-party materials. No dependency versions change.
- Add additive migration `0006` for comparable records, without changing existing cards. Document current free-data research and provider access limitations.
- Add owner-scoped recorded financial summaries across all saved cards, independent of collection filters and pagination: acquisition spending, current inventory cost, gross sales, fees, net proceeds, realized profit after complete acquisition costs, and a separately labeled purchase-price comparison.
- Separate currencies and disclose unknown costs, partial totals, and complete-record coverage. Include archived cards and preserve explicit zero amounts.
- Add configurable dated activity charts with six periods, six metrics, keyboard/touch exploration, and a compact phone disclosure. Flag undated and future-dated records; use UTC boundaries and actual event dates.
- Refresh summaries after card changes and on window focus; provide recovery after connection errors.

First beta release, following the demo prereleases. Frontend/API use `0.1.0-beta.1`; Python package metadata uses the equivalent `0.1.0b1`. Dependency versions are unchanged. Validation includes 418 passing full API tests, 75 passing final focused API checks and 80 passing desktop/phone browser journeys, plus a real CardSight search-to-estimate journey; see [validation evidence](docs/validation.md#estimate-value-entry-and-certificate-proposals). PSA live autofill remains blocked by provider account approval. Financial summaries reflect mutable current records; immutable sale-event history, refunds and currency conversion remain future work. Automatic auction retrieval and confirmed-card estimates are implemented; condition-specific raw pricing, cross-grade modeling and live hosted photo verification remain open.

## v0.1.0-demo.3 — October 20, 2026

- Record a sold card's gross price, total fees, and optional sale date. Display exact proceeds after fees, profit versus purchase price, and profit after complete acquisition costs, preserving unknown amounts and losses.
- Sold filtering and badges; exclude sold cards from active counts and fictional collection-value charts. Keep recorded sale figures separate from demo valuations. Explicitly returning a card to collection clears its current sale record.
- Preserve sale data during legacy metadata edits, owner isolation, revision checks, and private photo operations. Additive migration `0005` leaves existing cards unsold with no invented financial data.
- Improve PSA grading defaults and examples; add clearly labeled illustrative grades to the four existing local demo records without changing photos or purchase costs.
- Expand headless test coverage for sale arithmetic, privacy, persistence, grading, and sale reversal, with report screenshots and background recordings.

This local Docker prerelease requires additive migration `0005`; rebuild and run the migration service before starting the updated API. Existing cards migrate as unsold without invented prices or fees. The public example JSON documents illustrative grades; no owner database, photos, credentials, backups, or reports are included.

Validation: 77 PostgreSQL API checks, 34 frontend unit checks, and 26 headless desktop/phone browser journeys passed, plus lint, type checks, and production builds. Release/tag, frontend, and API use `0.1.0-demo.3`; Python metadata uses `0.1.0.dev3`. Dependency versions are unchanged. Sale-event history, refunds, fee schedules, currency conversion, aggregate realized-profit reports, and hosted deployment remain future work.

## v0.1.0-demo.2 — October 20, 2026

- Clicking a card row opens a read-only detail view with identity, grading, front/back photos, recorded acquisition costs, and notes. Separate Edit actions preserve the existing editor; saving or canceling returns to details when opened there. Keyboard navigation and focus restoration are supported.
- Headless browser checks produce reviewable HTML reports and screenshots, with optional background recordings; visible browser automation requires an explicit request.
- Separate front/back photos with independent upload, replacement, removal, private preview, and back-only thumbnail support. Additive migration `0004` preserves existing fronts and reference metadata.
- Compact mobile overview and expandable row details, Add card near the welcome heading, readable supporting labels, clearer demo/reference labeling, and a shared trend-period selector near the collection.

This prerelease adds local collection usability and private two-sided photos. Migration `0004` is additive; rebuild and run the migration service before starting the updated API. Existing front-photo links and metadata are preserved. Financial demo values remain fictional and separate from recorded costs.

Validation includes 41 PostgreSQL API checks from the photo increment, 20 frontend unit checks, and 22 final headless desktop/phone browser journeys, plus lint, type checks, and production builds. The release/tag, frontend, and API use `0.1.0-demo.2`; Python metadata uses `0.1.0.dev2`. No dependency versions changed. Reports, recordings, private data/photos, credentials, and backups are excluded from Git. Hosted deployment, crash-orphan reconciliation, physical phones, Safari, and full backup/restore remain pending.

## v0.1.0-demo.1 — October 19, 2026

First SlabTrak demo prerelease. This is a local Docker application with a working private collection; the financial overview demonstrates the intended UI using explicitly fictional values.

### Included

- Private owner sign-in, persistent sessions, and a header account dropdown with sign-out.
- Card creation, editing, search, condition/archive filters, sorting, pagination, archive/restore, and confirmed permanent deletion.
- Owner-scoped physical copies, raw/graded details, serial numbers, and exact recorded acquisition costs, with stale-edit protection.
- Private preview photo upload, replacement, removal, and larger viewing; labeled reference-image support.
- Pitch-black design system, preserved text wordmark, graded-slab icon, responsive rows, and a live `/design` reference.
- Configurable demo value, gain/loss, and purchase-total graphs with all-time/year/six-month/three-month/month/week ranges and per-card sparklines.
- Docker Compose, explicit PostgreSQL migrations, locked dependencies, test helpers, and GitHub checks.

### Demo data and limits

Financial graph and row values are fictional display-only USD examples, not market estimates or recorded purchase prices. All time represents two simulated years for the current active cards, not historical ownership. Real acquisition records remain separately labeled and editable. Public reference-card identity/source metadata is included in `data/example-cards.json`; no owner account, collection database, private photos, credentials, or backup is shipped. The four locally added example records are not automatically seeded into another installation.

Vercel/Supabase hosting, actual market valuation, separate front/back photos, sale transactions, collection organization, imports/exports, and full collection/photo backup and restore remain future work. Follow the README for local setup; hosted cross-device access has not been deployed or verified. Physical phones, Safari, x86 runtime, and independent security/accessibility audits remain unverified.

### Version and verification

The release/tag and frontend use `0.1.0-demo.1`. The Python package uses `0.1.0.dev1`, a PEP 440-compatible development identifier; the API advertises `0.1.0-demo.1`.

Local verification covers 31 PostgreSQL API checks, 20 frontend unit checks, and 20 desktop/phone-emulated Chrome journeys, plus Ruff, ESLint, TypeScript, and production builds. See [validation](docs/validation.md) for the check history and evidence limits. The browser helper uses the platform temporary directory so it can run on both macOS and the Ubuntu GitHub runner; remote CI results are recorded on GitHub.
