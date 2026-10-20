# Changelog

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
