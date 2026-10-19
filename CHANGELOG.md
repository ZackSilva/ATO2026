# Changelog

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
