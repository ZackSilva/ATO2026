# SlabTrak architecture

Design baseline: October 19, 2026. Status: local private access, responsive inventory rows, and separate private front/back preview images are implemented. Hosted deployment and crash-orphan reconciliation remain planned. See `validation.md` for the evidence boundary.

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

Use one repository with two application directories, `apps/web` and `apps/api`. Both directories now contain the private-access implementation. Each directory will map to its own Vercel project. Use one stable production application URL; configure the frontend's `/api` forwarding to a fixed, trusted backend URL. Never build an arbitrary URL proxy. Verify cookies, CSRF checks, uploads, and error responses through that forwarding path before release.

The backend owns all business rules and authorization. The frontend presents state and makes validated requests; it does not connect directly to the database or receive privileged storage credentials. Supabase provides PostgreSQL and object storage rather than owning application logic.

Docker Compose will run the same frontend/backend code with PostgreSQL and photo volumes. Publish the frontend on localhost by default; keep database and backend services on the internal container network. Use images and dependencies suitable for ARM64 and x86-64, and distinguish ARM testing from actual x86 validation.

Online device syncing means authenticated devices read and update the same database. Save only after a successful server transaction, and refetch relevant views after changes or when returning to the application. Detect concurrent edits with a record revision; report a conflict instead of silently overwriting another device's change. Cross-device visibility does not require a realtime messaging service in the first release.

The local and online installations are separate data stores. Initially, moving between them uses a verified export/import or backup/restore. Automatic synchronization between installations and offline browser edits with later conflict reconciliation are outside the first release. The full local installation provides the independent offline path.

## Technology decisions

| Area | Planned choice | Reason |
| --- | --- | --- |
| Frontend | Next.js, TypeScript, React | Matches the requested stack and Vercel deployment. |
| UI | Tailwind CSS and selected shadcn/ui components | Accessible building blocks and a restrained dark interface. |
| Charts | Recharts where supported by real data | Basic acquisition, sale, and holdings breakdowns; no invented valuation curves. |
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

## Data model

Migration `0002` adds owner-scoped immutable `card_definitions` and separate `owned_copies`. An exact fingerprint of the trimmed identity fields shares matching definitions within an account; correcting one copy selects a new identity without changing its siblings. A composite foreign key prevents references to another owner's definition. Acquisition fields currently live on the physical-copy row; a separate acquisition entity and structured multi-subject links remain planned. The subject field currently stores the entered player/subject text. Unreferenced identity rows can remain after a copy is corrected or removed; private copy notes, grading, and acquisition fields are deleted with the copy.

Inventory writes require the signed-in session, trusted origin, and CSRF token. Updates/deletions require the version the editor loaded; a row lock and SQLAlchemy version counter prevent a stale write. List/detail queries, filters, pagination, and summary counts all enforce the owner. Decimal monetary responses are strings; missing components stay null. Summary tiles contain actual inventory counts, with no portfolio valuation.

The broader entity plan follows; only the entities described above and the account/session foundation are implemented so far.

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

Apply foreign keys, owner consistency, nonnegative cost constraints, and appropriate uniqueness rules. Suspected duplicates require review: two matching owned cards may be distinct physical copies. Do not make catalog text globally unique across all owners. Do not treat a certification number as externally verified without a legitimate lookup result.

Use exact decimal money calculations and ISO currency codes. Unknown values remain null and are displayed as unknown. Sum only compatible currencies; initial UI defaults to USD and separates other currencies rather than inventing exchange rates. Acquisition cost includes all recorded acquisition expenses; realized profit is sale proceeds less selling expenses and acquisition cost. Display an unknown result if required cost data is missing.

Inventory deletion requires a clear confirmation and transaction rules. A sold copy must retain the acquisition and sale history used in realized-profit calculations; removal of transaction history is an explicit action with a preview of its effect on totals. Archive records when the user wants to hide them while retaining history.

Milestone 1 summaries show owned-card count, recorded acquisition cost, recorded sales, and realized results where complete. Estimated market value and unrealized performance remain unavailable until Milestone 2 provides adequate evidence. No default cost-to-value substitution.

## Image storage and backups

Migration `0003` adds a nullable opaque preview key, image kind, and source to each physical copy. Local preview files use owner UUID/image UUID paths in the named Docker `photos` volume; they are not web-public assets or database blobs. Every image GET checks the authenticated owner. Upload/removal also require origin/CSRF checks and the current card revision. Replacing a preview changes its opaque URL and removes the old file after commit; a failed commit removes the newly written file. Deleting a card removes its previews. Migration `0004` extends this storage to an independent back image while preserving existing front keys and metadata; original-resolution archives remain unimplemented.

Pillow decodes only JPEG, PNG, and WebP still images, bounds input to 4 MB/16 megapixels, normalizes orientation, flattens transparency onto white, and re-encodes a JPEG without EXIF/GPS metadata. Previews have a 1,200-pixel maximum edge and a 1 MB maximum output size. Client image errors fall back to an explicit missing-image state. Reference images on the four example cards are labeled and keep source links; no pictured grade/certification is assigned to those records. The API does not fetch arbitrary image URLs.

Filesystem and SQL changes are coordinated within each request, but a process crash between a completed file write and database commit can still leave an orphan file. Automated orphan reconciliation, independent front/back images, verified complete backup/restore, and private Supabase storage remain release work. Local filesystem storage must not be used as durable Vercel storage.

Validate decoded content, dimensions, size, and supported image types. Reject SVG and executable content for card uploads. Generate opaque storage keys, remove unnecessary metadata, and make display-sized images to keep storage bounded. Present an explicit limit and a useful error when a photo cannot be accepted. Target about 1 MB or less per processed photo as a starting default; 200 such images would be about 200 MB, an estimate rather than a measured collection size.

The backend verifies ownership before accepting uploads or returning images. Keep hosted buckets private; provide short-lived authorized access when needed. The local storage path must stay inside the configured photo volume. Never use user-supplied filenames as trusted paths. Reconcile interrupted uploads so failures do not create invisible orphan files or successful-looking records without photos.

Offer a full user backup containing inventory, collections, tags, notes, acquisitions, sales, and image files with a versioned manifest and checksums. CSV is an inventory interchange format, not a full backup. JSON exports must document whether photos are included; full backups must actually contain them. Exclude session tokens, password hashes, and service credentials from user backups.

Restore must validate the format and ownership, show conflicts, preserve the existing collection until validation succeeds, and roll back incomplete changes. Test a complete restore into an empty database and verify photos and financial totals. Operational recovery also needs database backup plus storage backup; a database dump alone does not restore image objects.

## Cost and availability boundaries

Supabase currently lists a 500 MB database, 1 GB file storage, and usage/transfer quotas on Free. It lists pausing after one week of inactivity, no included automatic database backups, and no uptime SLA. Vercel Hobby also has usage limits and noncommercial-personal-use restrictions. Verify these terms at setup; never activate a paid plan, trial, add-on, or automatic upgrade to bypass a limit.

Durable records mean database commits survive page reloads and application deployments. They do not mean guaranteed provider availability or protection against accidental deletion. Maintain portable backups, report outages clearly, and keep the local deployment usable. Growth to a commercial hobby-shop product requires a new hosting and cost review; the personal free deployment is not a promise of free commercial hosting.

## Deployment preparation

Before publishing, identify the exact Vercel account/team, frontend and backend projects, stable URLs, intended audience, Supabase project/region, private bucket, and source version. The user completes account sign-in and enters secrets through local environment files or provider settings, never in chat or Git.

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

The existing bounded image processing and private local storage are reused. Replacing or removing one side preserves the other. Deleting a physical copy removes both photo files after the database commits; failed commits retain old files and remove a new uncommitted upload. Files orphaned by an abrupt process crash still need operator reconciliation; this update does not claim to implement it. Private hosted storage remains a later provider integration.

## Separate card viewing and editing

Collection row bodies, titles, and thumbnails open a read-only `CardDetail` dialog populated from the authenticated card record. Native title buttons provide keyboard access; Edit and inline disclosures retain independent actions. The detail view renders labeled text, photos, and recorded costs without form fields or save/archive/delete/upload controls. It makes no mutation request. Existing owner scoping and optimistic revision checks continue to protect editor writes.

The detail component retains its selected photo side while its native dialog closes temporarily for editing or image enlargement; only one dialog is open at a time. Returning restores focus to the originating detail control. Successful saves, conflict reloads, and photo updates refresh the retained detail record; canceling leaves the saved record intact. Closing details restores the original row control or the collection heading if that row was removed. No API, database, dependency, or hosting changes are needed for this view.
