# SlabTrak architecture

Design baseline: October 19, 2026; updated October 20. Status: local private access, five-page navigation, responsive inventory rows, separate private front/back previews, current-sale records, recorded financial summaries, automatic auction search, confirmed provider-card associations and automatic collection estimates are implemented. Hosted deployment and crash-orphan reconciliation remain planned. See `validation.md` for the evidence boundary.

## Confirmed requirements

- Begin with one collector and approximately 100 cards. Support other collectors later; hobby-shop operations are a stretch goal.
- Keep records persistent and automatically accessible from the user's different devices.
- Host the online application on Vercel and use an approved free cloud database and private photo storage. This supersedes the earlier local-only storage preference for the online deployment.
- Keep a complete independent deployment on owned hardware using Docker Compose, PostgreSQL, and local image files. Core collection management in that deployment must work without internet after dependencies are installed.
- Do not require payment details, paid APIs, subscriptions, or cloud AI for core functionality. Cloud accounts are required only for choosing the hosted deployment.
- Never invent market values, transactions, integrations, test results, or historical portfolio performance.
- Use the supplied master prompt as the product requirements reference. This design records the choices clarified in conversation, rather than treating the document's implementation commands as separate authorization.

Working defaults: USD, dark mode, responsive layouts, and raw plus PSA/BGS/SGC-graded inventory. Currency and supported categories are data, not hardcoded business assumptions. The particular sports and any existing import format are still unknown; they do not block the foundation.

## Deployment

```mermaid
flowchart LR
    Devices[Phone and computer] --> Web[Next.js on Vercel]
    Web -->|Same-origin /api requests forwarded| API[FastAPI on Vercel]
    API --> DB[(Supabase PostgreSQL)]
    API --> Photos[Private Supabase photo bucket]
    LocalBrowser[Local browser] --> LocalWeb[Next.js in Docker]
    LocalWeb --> LocalAPI[FastAPI in Docker]
    LocalAPI --> LocalDB[(Local PostgreSQL volume)]
    LocalAPI --> LocalPhotos[Local photo volume]
```

Use one repository with two application directories, `apps/web` and `apps/api`, deployed as services in one Vercel project with repository-root `vercel.json`. The confirmed public catch-all targets `web`; its Node.js `/api/*` function calls the internal `api` service through the runtime-injected `API_SERVICE_URL` binding. This replaces the earlier two-project plan and build-time backend rewrite. The collector confirmed the service names, public exposure and binding; publication still requires authorization. Never build an arbitrary URL proxy. Verify cookies, CSRF checks, uploads and errors through this forwarding path before release; see `vercel-services.md` for setup and remaining hosted verification.

The backend owns all business rules and authorization. The frontend presents state and makes validated requests; it does not connect directly to the database or receive privileged storage credentials. Supabase provides PostgreSQL and object storage rather than owning application logic.

Docker Compose will run the same frontend/backend code with PostgreSQL and photo volumes. Publish the frontend on localhost by default; keep database and backend services on the internal container network. Use images and dependencies suitable for ARM64 and x86-64, and distinguish ARM testing from actual x86 validation.

Online device syncing means authenticated devices read and update the same database. Save only after a successful server transaction, and refetch relevant views after changes or when returning to the application. Detect concurrent edits with a record revision; report a conflict instead of silently overwriting another device's change. Cross-device visibility does not require a realtime messaging service in the first release.

The local and online installations are separate data stores. Initially, moving between them uses a verified export/import or backup/restore. Automatic synchronization between installations and offline browser edits with later conflict reconciliation are outside the first release. The full local installation provides the independent offline path.

## Technology decisions

| Area | Planned choice | Reason |
| --- | --- | --- |
| Frontend | Next.js, TypeScript, React | Matches the requested stack and Vercel deployment. |
| UI | Tailwind CSS and selected shadcn/ui components | Accessible building blocks and a restrained dark interface. |
| Charts | Small SVG components; Recharts remains optional | Recorded activity uses actual transaction dates. Home recomputes historical rolling estimates from available matching evidence; row and detail graphs show actual sale dates and prices. |
| API | FastAPI, Pydantic, SQLAlchemy, Alembic | Shared validation, persistence, migrations, and OpenAPI documentation across both deployments. |
| Database | PostgreSQL; pooled connections online | One relational model across hosted and local installations. |
| Photos | Private Supabase storage online; local files in Docker | Durable files independent of Vercel's temporary filesystem. |
| Authentication | Application-managed accounts and server sessions | Same login behavior locally and online without an external identity-service dependency. |
| Tests | Pytest, Vitest, Playwright | API/database behavior, calculations, UI logic, and real browser journeys. |
| Background services | None for Milestone 1 | Avoid Redis/Celery until a measured workload needs them. |

Pin compatible stable versions and lock dependencies when implementing. Before installation, review direct/transitive licenses, runtime requirements, security advisories, and any hosted-service dependency. Record package versions and source license links in a dependency inventory. Do not treat an open-source package as proof that its associated hosted service is free. No paid components are selected; dependency-level license verification remains an implementation gate.

Use a small database connection budget in Vercel. Select the Supabase connection mode and SQLAlchemy driver settings together, including prepared-statement compatibility, and test them against the actual hosted database. Run schema migrations as an explicit release operation, never automatically on every request or cold start.

## Identity and authorization

Start with a private owner account; public registration is disabled. Additional collectors will receive separate accounts and separate records. Do not add shop organizations, staff roles, subscription billing, or inventory reservations yet.

Use Argon2id password hashing and cryptographically random opaque sessions. Store only session-token hashes in PostgreSQL. Use HttpOnly cookies, Secure in hosted HTTPS, an appropriate SameSite policy, expiry, logout revocation, and CSRF protection on mutations. Rate-limit login attempts with shared state rather than relying on process-local memory in serverless functions. Never log passwords, tokens, database URLs, or signed photo URLs.

Bootstrap the owner through a controlled setup procedure, with public signup off. Any hosted bootstrap secret is one-time, supplied through environment configuration, and removed afterward. Provide an operator-controlled recovery path without requiring a paid email service. Password reset and recovery must not expose an unauthenticated account takeover route.

Every collection query and mutation must enforce the authenticated owner. Use a dedicated application schema that is not exposed through Supabase's public Data API, separate migration and runtime privileges, and no anonymous database access. Owner consistency must also hold for foreign-key relationships and imported records. Prove isolation with two-account integration tests, including images, backups, imports, search, and aggregate totals.

Migration `0010` supplies role-specific RLS policies for the trusted server-only `slabtrak_app` role without changing existing RLS flags. With RLS enabled, that role retains its existing row access and table privileges; collector isolation remains enforced by the API, not by these backend policies. Browser/Supabase Auth roles receive no policy or role membership. The API integration suite enables RLS on all seven application tables so authentication, owner scoping and writes exercise this hosted configuration.

## Data model

Migration `0002` adds owner-scoped immutable `card_definitions` and separate `owned_copies`. An exact fingerprint of the trimmed identity fields shares matching definitions within an account; correcting one copy selects a new identity without changing its siblings. A composite foreign key prevents references to another owner's definition. Acquisition fields currently live on the physical-copy row; a separate acquisition entity and structured multi-subject links remain planned. The subject field currently stores the entered player/subject text. Unreferenced identity rows can remain after a copy is corrected or removed; private copy notes, grading, and acquisition fields are deleted with the copy.

Inventory writes require the signed-in session, trusted origin, and CSRF token. Updates/deletions require the version the editor loaded; a row lock and SQLAlchemy version counter prevent a stale write. List/detail queries, filters, pagination, and summary counts all enforce the owner. Decimal monetary responses are strings; missing components stay null. Summary tiles contain actual inventory counts, with no portfolio valuation.

The broader entity plan follows; implemented inventory, financial and market-evidence additions are described in this document. Separate acquisitions, sale events, organization and import entities remain planned.

| Entity | Responsibility and main relationships |
| --- | --- |
| Account | Owner identity, password hash, and preferences. |
| Session | Token hash, account, expiry, and revocation. |
| Card definition | Owner-scoped identity: year, sport/category, manufacturer, set, number, parallel, variation, autograph, memorabilia, and production limit. Multiple physical copies can reference one definition. |
| Card subject | Player or other subject; link multiple subjects to a definition without duplicating the card. |
| Owned copy | A particular physical card: definition, owner, condition, serial number, holding/sold status, grading company, grade, certification, qualifiers, and BGS subgrades. |
| Acquisition | Copy, date, seller, price, shipping, taxes, other costs, and currency. Initial release records one acquisition per owned copy. |
| Sale | Copy, date, gross proceeds, selling fees, shipping expense, other costs, and currency. One sale per copy in the first release. |
| Card image | Copy, front/back designation, storage key, content type, dimensions, size, and checksum. |
| Collection and membership | Owner-defined groups; a copy may belong to more than one collection. |
| Tag and assignment | Owner-scoped labels attached to copies. Notes remain private to their owner. |
| Watchlist and item | Owner's watched card definitions, with optional notes; listing ingestion arrives in Milestone 3. |
| Import record | Owner, format, result summary, source hash, time, and duplicate decisions. |

Migration `0006` also implements private `comparable_sales`: immutable card definition and owner, positive completed-sale price, currency, raw/graded details, sale date, source name/URL, duplicate key, and creation time. These saved historical sources are unverified; source URLs are stored and displayed without fetching them. Migration `0007` adds raw-condition categories defaulted to unassessed. Provider responses never populate this table. Shipping and independent source verification remain outside this model; estimates explicitly exclude shipping and taxes.

Migration `0009` adds `market_links`, one confirmed association per owned copy: provider card, parallel and grade UUIDs, a signature of its identity/condition/grading/currency, and confirmation time. Its foreign key cascades on copy deletion. No provider sale rows or derived valuation snapshots are persisted; existing saved historical evidence, acquisition costs and personal sales remain unchanged.

Apply foreign keys, owner consistency, nonnegative cost constraints, and appropriate uniqueness rules. Suspected duplicates require review: two matching owned cards may be distinct physical copies. Do not make catalog text globally unique across all owners. Do not treat a certification number as externally verified without a legitimate lookup result.

Use exact decimal money calculations and ISO currency codes. Unknown values remain null and are displayed as unknown. Sum only compatible currencies; initial UI defaults to USD and separates other currencies rather than inventing exchange rates. Acquisition cost includes all recorded acquisition expenses; realized profit is sale proceeds less selling expenses and acquisition cost. Display an unknown result if required cost data is missing.

Inventory deletion requires a clear confirmation. The current implementation permanently removes the copy and its current financial record, changing summaries and past charts. An immutable transaction ledger and a preview of the exact financial effect of deletion remain planned. Archive unsold records when the user wants to hide them while retaining their acquisition information.

Milestone 1 summaries show owned-card count, recorded acquisition cost, recorded sales, and realized results where complete. Market estimates are shown separately with evidence coverage; missing values never become purchase costs or zero. Unrealized performance remains outside the current financial projection.

## Image storage and backups

Migration `0003` adds a nullable opaque preview key, image kind, and source to each physical copy. The default local backend stores previews as `ownerUUID/photoUUID.jpg` in the named Docker `photos` volume; they are not web-public assets or database blobs. The explicitly selected Supabase backend uses the same opaque paths in a private bucket, reusing the existing UUID columns without a database migration or dependency change. Every image GET checks the authenticated owner. Upload/removal also require origin/CSRF checks and the current card revision. Replacing a preview changes its opaque URL and removes the old file after commit; a failed commit removes the newly written file. Deleting a card removes its previews. Migration `0004` extends this storage to an independent back image while preserving existing front keys and metadata; original-resolution archives remain unimplemented.

Pillow decodes only JPEG, PNG, and WebP still images, bounds input to 4 MiB/16 megapixels, normalizes orientation, flattens transparency onto white, and re-encodes a JPEG without EXIF/GPS metadata. Previews have a 1,200-pixel maximum edge and a 1 MiB (1,048,576-byte) maximum output size. Client image errors fall back to an explicit missing-image state. Reference images on the four example cards are labeled and keep source links; no pictured grade/certification is assigned to those records. The API does not fetch arbitrary image URLs.

Photo storage and SQL changes are coordinated within each request, but a process crash between a completed object write and database commit can still leave an orphan. Automated orphan reconciliation and verified complete backup/restore remain release work. Private Supabase Storage support is implemented; actual hosted privacy, two-device reads and persistence after redeployment still need live verification. Local filesystem storage must not be used as durable Vercel storage.

Validate decoded content, dimensions, size, and supported image types. Reject SVG and executable content for card uploads. Generate opaque storage keys, remove unnecessary metadata, and make display-sized images to keep storage bounded. Present an explicit limit and a useful error when a photo cannot be accepted. Processed photos are capped at 1 MiB each; 200 maximum-sized images would occupy about 200 MiB, an upper-bound estimate rather than a measured collection size.

The backend verifies ownership before accepting uploads or returning images. Hosted buckets remain private; the API reads authenticated storage objects and returns image bytes without issuing public or signed URLs. A server-only `sb_secret_…` key is sent in the Storage REST `apikey` header, never as a legacy JWT or browser credential. This key bypasses storage RLS, so owner authorization belongs to the SlabTrak API; SlabTrak uses its own sessions, not Supabase Auth. Do not add `anon` or `authenticated` storage policies. The local storage path stays inside the configured volume, and neither backend trusts user-supplied filenames as paths. Reconciliation after interrupted uploads remains future work.

`PHOTO_STORAGE_BACKEND` defaults to `local`; `supabase` requires a valid HTTPS `SUPABASE_URL` origin and `SUPABASE_SECRET_KEY`, with `SUPABASE_STORAGE_BUCKET=card-photos` by default. Missing or invalid required settings fail startup. Storage outages return an error without silently falling back to local files. Configure the private bucket for `image/jpeg` and 1,048,576 bytes; see [deployment setup](vercel-services.md#private-hosted-photo-storage). Existing local database records and photo objects are not migrated by changing the backend; no transfer workflow is included in this increment.

Offer a full user backup containing inventory, collections, tags, notes, acquisitions, sales, and image files with a versioned manifest and checksums. CSV is an inventory interchange format, not a full backup. JSON exports must document whether photos are included; full backups must actually contain them. Exclude session tokens, password hashes, and service credentials from user backups.

Restore must validate the format and ownership, show conflicts, preserve the existing collection until validation succeeds, and roll back incomplete changes. Test a complete restore into an empty database and verify photos and financial totals. Operational recovery also needs database backup plus storage backup; a database dump alone does not restore image objects.

## Cost and availability boundaries

Supabase currently lists a 500 MB database, 1 GB file storage, and usage/transfer quotas on Free. It lists pausing after one week of inactivity, no included automatic database backups, and no uptime SLA. Vercel Hobby also has usage limits and noncommercial-personal-use restrictions. Verify these terms at setup; never activate a paid plan, trial, add-on, or automatic upgrade to bypass a limit.

Durable records mean database commits survive page reloads and application deployments. They do not mean guaranteed provider availability or protection against accidental deletion. Maintain portable backups, report outages clearly, and keep the local deployment usable. Growth to a commercial hobby-shop product requires a new hosting and cost review; the personal free deployment is not a promise of free commercial hosting.

## Deployment preparation

Before publishing, identify the exact Vercel account/team and Services project, confirm service names/bindings/public paths, stable URL, intended audience, Supabase project/region, private bucket and source version. The user completes account sign-in and enters secrets through local environment files or provider settings, never in chat or Git.

Keep local development and previews away from the real collection database. If only one free database is available, use isolated development data locally rather than pointing unreviewed previews at production. Verify that deployment protection does not accidentally block frontend-to-backend requests. Run hosted migrations deliberately, then verify login, add/edit/search, photo access, restart persistence, cross-device access, and backup/restore on the deployed version.

## References

Provider documentation reviewed October 19, 2026; not evidence that an account or deployment has been configured.

- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [FastAPI on Vercel](https://vercel.com/docs/frameworks/backend/fastapi)
- [Vercel function filesystem](https://vercel.com/docs/functions/runtimes#file-system-support)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [Supabase pricing and limits](https://supabase.com/pricing)
- [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase schemas and API exposure](https://supabase.com/docs/guides/api/using-custom-schemas)
- [Supabase private storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)

## Independent front/back previews

Migration `0004` adds nullable back-photo keys and separate kind/source metadata to each physical copy. Existing `photo_*` columns, keys, reference metadata, and default `/photo` URLs remain the front side. `GET`, `PUT`, and `DELETE /api/cards/{id}/photo` accept `side=front|back`, defaulting to front. Back URLs include `side=back`; every request remains owner scoped and non-cacheable. Both sides share the copy revision, so a stale photo mutation cannot overwrite a newer change on either side.

The existing bounded image processing is shared by the private local and Supabase storage backends. Replacing or removing one side preserves the other. Deleting a physical copy removes both photo files after the database commits; failed commits retain old files and remove a new uncommitted upload. Files orphaned by an abrupt process crash still need operator reconciliation; this update does not claim to implement it. Hosted storage setup and live deployment verification remain required; local photos are not automatically transferred.

## Separate card viewing and editing

Collection row bodies, titles, and thumbnails open a read-only `CardDetail` dialog populated from the authenticated card record. Native title buttons provide keyboard access; Edit and inline disclosures retain independent actions. The detail view renders labeled text, photos, and recorded costs without form fields or save/archive/delete/upload controls. It makes no mutation request. Existing owner scoping and optimistic revision checks continue to protect editor writes.

The detail component retains its selected photo side while its native dialog closes temporarily for editing or image enlargement; only one dialog is open at a time. Returning restores focus to the originating detail control. Successful saves, conflict reloads, and photo updates refresh the retained detail record; canceling leaves the saved record intact. Closing details restores the original row control or the collection heading if that row was removed. No API, database, dependency, or hosting changes are needed for this view.

## Current sale record

Migration `0005` adds `sold` (false by default), nullable decimal `sale_price` and `sale_fees`, and optional `sold_on` to each physical copy. Sold cards require explicit nonnegative price and fees, including zero. Fees may exceed price, producing negative proceeds. Database and input constraints prohibit simultaneous sold/archive states and sale fields on an unsold record. Existing copies migrate as unsold without changing their other fields or revisions.

Server-side Decimal arithmetic derives `sale_net`, `net_profit` against purchase price, and `profit_after_costs` against all four recorded acquisition amounts. Missing purchase price prevents purchase-based profit; any missing acquisition amount prevents the complete-cost result. Computed fields are output-only. The editor previews the same formulas with bounded integer cents; persisted API output remains authoritative. Every amount uses the copy's single recorded currency, without exchange-rate conversion.

Sales use the existing owner-scoped, CSRF-protected, revision-checked card update. Legacy metadata requests omitting all sale fields retain the current sale instead of silently clearing it. Explicitly returning a copy to collection clears the current sale fields; this is an editable current sale record, not an event ledger. Photo updates retain sale/grade metadata. Sold cards are omitted from active lists/counts and the current collection estimate overview, while `status=sold` and `status=all` retain access to the records. Sold rows show recorded proceeds/profit rather than current market estimates.

## Recorded financial projection

Authenticated `GET /api/finances?range=all|1y|6m|3m|1m|1w` selects every physical copy belonging to the current owner. It is read-only, uses existing models without a migration, and ignores inventory list filters and pagination. Currency groups are independent; the API returns Decimal strings, not binary floating-point totals. Each metric includes amount, known count, complete count, and eligible count. No eligible records produce zero; eligible records with no known amounts produce null. Known acquisition components form a disclosed subtotal. Complete-cost profit includes only sales with all four acquisition amounts present, while the separately labeled purchase-price comparison requires only purchase price. Zero is an explicit known amount.

Spending uses acquisition date and sales/results use sale date, retaining the original acquisition basis even when purchased outside the sale period. All-time totals include undated transactions; dated ranges and sparse daily chart series exclude them and disclose counts. Future-dated activity is excluded until its date and counted separately. All periods end on the current UTC date, inclusively; a week includes today and six prior days, and month/year subtraction clamps to the calendar month end. Current owned cost includes every unsold copy, including archived and undated/future-dated acquisitions, independently of the selected transaction period.

The frontend requests this projection after saves/deletions and window focus, cancels obsolete requests, separates currencies, and hides stale values during loading or failure. Chart bars represent daily activity on actual dates; calendar gaps are retained and no market or ownership history is fabricated. The separate collection estimate chart uses available matching completed-sale observations, not a stored valuation ledger. Corrections, sale reversals, and deletion change the saved records and therefore past activity; this projection does not provide an immutable accounting ledger.

## Workspace pages and comparable-based estimates

The Next.js `(workspace)` route-group layout retains one authenticated client shell and session context across `/`, `/collection`, `/reports`, `/discover`, and `/settings`. Navigation uses real links and active-page semantics. Page content and its data hooks mount only after successful session validation. Direct links show the same private sign-in screen when anonymous; server APIs independently enforce authorization. The `/design` reference remains outside the private workspace. Home opens with current known estimates and an expanded evidence-based history chart, followed by collection counts and estimate coverage; Reports owns detailed finances, estimate history and raw-versus-graded value breakdowns. Collection rows show actual estimates and matching sale mini graphs. Card details retain interactive sale graphs. There are no runtime demo values or data-source selectors; unsupported historical periods remain gaps and purchase costs stay independent. Sold rows always use recorded results. Settings currently describes the account, installation, and actual data-source status; Discover now performs automatic CardSight auction searches; AI recommendations remain unimplemented.

`GET /api/estimates` calculates estimates for all the owner's unsold cards, including archived copies, with Decimal median and observed min/max from at least three completed sales within the inclusive 180-day UTC window. Confirmed copies retrieve exact CardSight auctions when their transient cache needs refresh; unlinked copies use saved evidence. Live pricing requires USD, the exact base/parallel and grading-label IDs, or raw condition left unassessed. Unsupported raw conditions, currencies, autograph/relic identities, separate variations and unverified variants produce no live amount. Saved raw evidence still matches its recorded condition category. Graded evidence requires matching grader and grade; numeric 9 and 9.0 match. Three or four graded sales have low confidence; five or more have medium confidence. Evidence absent or older than 90 days is flagged without changing the 180-day eligibility window. No grade conversion, exchange rate or cost substitution is applied. Home sums supported estimates within one currency and displays coverage; missing estimates stay null.

`GET /api/cards/{id}/comparables` returns exact transient provider evidence for a linked copy, with preserved saved evidence separately under `saved_history`; unlinked copies return saved evidence directly. Provider failures or insufficient matches do not silently substitute historical estimates for a linked copy. The `/collection/{id}/market` page exposes matching controls, sales graphs and separate saved history, with no manual entry/import workflow. Retained authenticated, trusted-origin, CSRF-protected evidence-maintenance APIs enforce expected definition IDs and owner-scoped duplicate rejection. Saved evidence is shared only between the owner's matching definitions and survives a copy's correction/deletion on the prior definition. Source URLs are displayed without server fetching. These APIs never mutate acquisition costs, personal sales or owned-copy grading.

Saved historical evidence and transient provider observations remain distinct. Automatic search does not mutate either owned-copy records or saved evidence. See `market-data.md` for checked access and retention boundaries. Market-wide analytics, long-term provider-history retention, outlier review and defensible cross-grade inference remain open.

## Confirmed provider associations and automatic pricing

Owner-scoped `/api/cards/{id}/market-link` routes expose association status, propose catalog candidates, confirm/remove a match and request refresh. Mutations require CSRF and a trusted origin. Catalog search proposes candidates only; confirmation rechecks provider card details, exact issue/release/subset, available sport/manufacturer references, parallel applicability and the selected grade's company/type. The collector confirms each physical copy once using **Find exact card → Use this match**. A changed identity, grading, raw condition or currency invalidates the signature. Copy-row locking and expected provider identity/confirmation time reject stale writes; copies and links are reloaded after network work before reporting prices.

Exact pricing uses `/v1/pricing/{card_id}` or bulk `/v1/pricing/` with `listing_type=auction`, explicit base/parallel and raw/grade-ID filters. Response identities, filter echoes, grading groups and rows are checked before calculating estimates. Automatic reads process at most three filter groups, up to 100 cards per group; single-card results cap at 500 rows and bulk results at 50 per card. They are bounded recent snapshots, not complete sale-history downloads. Linked-copy failures remain explicit and saved history stays separate.

Pricing caches are bounded server memory with a 24-hour expiry; reference caches expire after 30 minutes. Entries are purged on consumption and periodically, and all caches clear on shutdown. These durations are application choices, not provider-approved numeric TTLs: CardSight's terms permit only limited short-term caching and require purge/refresh and termination deletion. Manual **Refresh estimate** respects a five-minute cooldown; failures have a short retry delay. Search, matching and pricing share the configured account quota. No provider sale or derived-estimate archive is written to PostgreSQL, disk or browser storage, and separate workers/restarts have independent caches. Unknown purchase costs remain unknown.

## Automatic auction search

The collector's market workflow is automatic query-to-sales retrieval; manual entry and CSV upload are absent. Discover calls authenticated `GET /api/market/status` for key-configuration status and trusted-origin/CSRF-protected `POST /api/market/search` for an explicit query. Search accepts query, period, raw/graded filter and optional grader/grade. The fixed server endpoint is CardSight `/v1/pricing/search` with `listing_type=auction` and limit 100. The API key stays in server configuration; redirects are refused so it cannot be forwarded elsewhere. Response size and timeout are bounded. Numeric prices use Decimal and auctions with invalid/future dates, invalid amounts or contradictory currency are excluded. Missing grade context is raw according to the provider schema, except suspicious graded titles remain unknown. Graded filters use normalized exact grades and graders, without cross-grade multipliers.

Discover responses are transient: no comparables, prices, identity links or financial records are written by search; HTTP responses are no-store and the client retains results only in component memory. Search graphs describe potentially mixed matches rather than the collector's holdings. A fuzzy listing result never confirms a provider association or drives a collection estimate. Existing saved card/history evidence is preserved. The retained historical-evidence maintenance API and operator fixture loader are not the collector's sales workflow.

CardSight documents Buy It Now pricing as asking prices, so fixed-price observations are excluded even if the upstream response ignores the auction filter. Runtime configuration supports an optional server-only `CARDSIGHT_API_KEY`; blank means setup needed. A configured key only enables an attempt, not a claim that live access was verified. Quota, authorization, network and invalid-response failures remain explicit and clear any prior client results.

## Linked auction observations and listing previews

Available card history uses the same interactive chart in the read-only card dialog and Sold comparables page, with saved historical evidence shown separately for linked cards. The comparable endpoint returns `matching_sale_ids` from the shared backend matching function used for estimates, so the chart retains each observation's original source identity without repeating grading or raw-condition rules in the browser. A selected-sale panel and collapsible matched list preserve same-day and duplicate-price records independently. Saved observations may retain an optional `image_url` from their original listing; additive migration `0008` leaves existing records null. The input validator shares public-HTTPS checks with Discover; browsers load previews directly and fall back on missing/failed images. Owned-copy photos are never presented as listing photos. Sales lists use independent native disclosures; the graph and selected-sale panel remain expanded. Inspecting graph points makes no extra provider request or persistence change.

Discover passes complete auction objects through the typed history-window projection, preserving their stable provider-derived IDs, original sources and image URLs. Graph selection uses both horizontal date and vertical price in screen pixels, so same-date sales at different prices remain selectable. Keyboard and Previous/Next controls select exact-overlap observations individually. The adjacent persistent selected-sale region exposes title, grade/condition, date, price, image and source; the corresponding list row is highlighted. Date-range changes reset selection to the newest visible observation or clear it when empty. The list retains all returned query results.

Image URLs are nullable and validated separately from sales: only HTTPS public-host previews without credentials or control characters are accepted. An invalid or missing image does not discard valid sales evidence. Browsers load previews lazily with no referrer and show a fallback after load failure. The API never downloads/proxies images or attaches provider credentials to their requests; no image metadata or files enter collection storage. Images remain external listing references, separate from private owned-card uploads.
