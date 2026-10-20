# SlabTrak development roadmap

Updated October 20, 2026. Increments 1 and 2 are implemented locally, along with basic search, filters, sorting, pagination, notes, and inventory-count summaries. Collection rows open read-only card details, with explicit Edit actions and independent authenticated front/back previews. Increment 3 is partial: crash-orphan reconciliation and private hosted storage remain open. Mobile layouts use expandable charts and row details. Increment 5 now includes current-sale recording, per-card results, currency-separated recorded financial summaries, and dated acquisition/sale/profit charts across every saved record. Coverage exposes missing costs; current inventory cost includes archived cards independently of the transaction period. Immutable sale-event history, refunds, richer holdings breakdowns, and currency conversion remain open. Structured multi-subject links, collections/tags/watchlists, imports, and hosted deployment also remain open. See `validation.md`; the full first-release acceptance checks are not yet complete.

The workspace now has Home, My Collection, Reports, Discover, and Settings. Reports contains detailed finances; Home shows high-level collection/estimate coverage. The first part of Milestone 2 is also implemented locally: private recorded comparables and automatic estimates for both raw and graded cards. Live ingestion, condition-specific raw matching, and supported cross-grade estimation remain priorities rather than completed capabilities.

## Milestone 1 — Usable collection management

| Increment | Working result | Required verification |
| --- | --- | --- |
| 1. Foundation and private access | Next.js frontend, FastAPI, PostgreSQL migrations, owner bootstrap, login/logout, and local Compose deployment. | Apply migrations to an empty database; log in; reject unauthorized access; restart services without losing account data; inspect dependency licenses and lock versions. |
| 2. Inventory | Distinct definitions and physical copies; raw/PSA/BGS/SGC grading, BGS subgrades, subject/category fields, serial details, acquisition costs, and create/edit/archive/delete. | Add two copies of one definition; retain different grades/costs; validate bad inputs; confirm persistence across restart; prove another account cannot access or reference them. |
| 3. Photos | Validated front/back images with a local storage implementation and private hosted implementation. | Upload, view, replace, and remove; reject malformed and oversized files; prohibit other users' access; verify interrupted-upload handling and storage cleanup. |
| 4. Organization and finding cards | Collections, tags, notes, watchlists, global collection search, sorting, pagination, and combined filters. | Check results against known inventory; retain state through navigation; test keyboard use, narrow layout, empty results, and network failures. |
| 5. Transactions and summaries | Sale recording, fees, acquisition totals, realized results, holdings breakdowns, and dark dashboard. | Check exact decimal calculations with complete and missing costs, sold-card exclusion, multiple currencies, and two-account isolation. Never label missing valuations as zero. |
| 6. Imports and recovery | CSV/JSON import preview, duplicate review, inventory exports, full backups with photos, and restore. | Reject invalid rows safely; distinguish identical copies from duplicate imports; round-trip a full backup into an empty database; compare images, relationships, dates, and totals. |
| 7. Hosted release | Vercel frontend/API with Supabase database and private photo storage; portable local mode and beginner instructions. | Run the deployment checks below, record real results, and retain the released source version and recovery copy. |

First-release documentation must include actual tested start/stop/update/backup/restore commands, environment templates without secrets, generated API documentation, a dependency inventory, known limitations, security notes, and a changelog. CI must run meaningful unit/integration checks without production credentials, plus browser checks where supported.

## First-release acceptance checks

1. A fresh installation starts through the documented procedure, applies migrations, and creates a private owner account. Public registration is disabled.
2. A collector can add, edit, find, archive, and deliberately remove raw and graded cards with the requested descriptive fields and acquisition costs.
3. Two owned copies of the same card remain distinct records. Grading companies and BGS subgrades are represented without claiming external certification verification.
4. Front/back photos survive service restarts. Images and all related records remain inaccessible to another account.
5. Collections, tags, notes, watchlists, combined filters, and sorting perform their stated actions; no decorative controls imply missing functionality.
6. Recorded acquisition totals and realized results reconcile exactly with entered transactions. Unknown costs or valuations are presented as unknown, and incompatible currencies are not added together.
7. CSV/JSON import reports invalid rows and possible duplicates before writing. Exported inventory can be reimported with explicit conflict handling.
8. Full backup and restore preserve records and actual image files. A deliberately invalid restore does not destroy the existing collection.
9. Changes saved from one authenticated browser appear when another authenticated device refreshes or refocuses the collection. A stale edit cannot silently overwrite a newer version.
10. The local deployment's collection functions operate with internet disconnected after setup. Local/cloud installations are documented as separate stores; offline cloud-sync editing is not claimed.
11. Relevant Pytest, Vitest, Playwright, lint, and type checks run on the implemented version. Failures, untested browsers, and missing x86 validation remain visible.
12. The actual hosted version passes login/logout, CRUD, photo privacy, persistence after redeployment, and two-device checks. Provider quota or account blockers are recorded rather than described as success.

## Milestone 2 — Market intelligence

Initial local implementation now supports private manual completed-sale entry and automatic raw/graded median estimates from at least three matching sales within 180 days. It retains identity, grade, price, currency, date, source/URL, and explicit unverified status; exact duplicate URLs/records are rejected. Same-grader/same-grade sales support graded estimates; raw-only sales support low-confidence raw estimates. Other grades remain research context. Home shows an expanded demo chart and separate covered-estimate subtotals. Collection rows offer explicitly labeled Demo values/mini graphs and a Recorded market data view with actual estimates or Insufficient Market Data. Neither demo view changes recorded amounts or fills missing market evidence.

Next, add verified free provider ingestion where available, condition-specific raw assessment/matching, CSV preview/import, shipping treatment, richer transaction/verification types, outlier review, recency weighting, and evidence-based cross-grade inference. Automatic estimates for both raw and graded cards are a core product requirement. Do not substitute asking prices, a fixed raw-to-slab multiplier, or generated numbers for sold-price evidence. Build genuine history from recorded observations, not fabricated past values. See `market-data.md` for dated provider research; no live feed is currently connected.

External providers require separate investigation of legitimate free access and terms before an adapter is enabled. No provider access is assumed or promised.

## Milestone 3 — Deal Scout

Add manual listings and CSVs, watchlist-driven saved searches, comparable-based explanations, cost assumptions, and in-app alerts. A submitted URL is a reference; it does not automatically authorize fetching or scraping the marketplace. Do not flag undervaluation without enough comparable evidence, and do not automate purchasing.

## Milestone 4 — Vision

Add local image preprocessing, Tesseract/OpenCV extraction, confidence and human review, and confirmed card creation. Benchmark on actual card/slab photos before claiming accuracy. Keep OCR workloads on owned hardware unless a later verified deployment option fits the zero-cost constraints. Legitimate grading-company lookup access is optional.

## Milestone 5 — Advanced intelligence

Add optional Ollama with validated collection-query tools, references to real records, richer evidence-based analytics, and measured performance improvements. Model availability, hardware fit, and licenses must be verified. The application must work without an AI model. Shared hobby-shop inventory, staff access, commercial hosting, and broader integrations require a separate product and cost design.

## Release practice

Record the exact source version, data migrations, deployment destination, observed tests, limitations, and recovery procedure for every release. Commits, pushes, hosted migrations, account changes, and publication require authorization appropriate to that concrete action. Do not use production data in previews or claim a feature complete from a mock screen, green build, or code inspection alone.
