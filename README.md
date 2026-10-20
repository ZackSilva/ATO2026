# SlabTrak

Your Collection, Simplified.

**Demo release: `v0.1.0-demo.3`** · [GitHub repository](https://github.com/ZackSilva/slabtrak) · [Release notes](CHANGELOG.md)

SlabTrak manages raw and graded trading cards, acquisition costs, sales, photos, and evidence-backed market estimates. Later releases will add broader market research, deal discovery, local OCR, and optional local AI.

## Current status

The local app now includes private sign-in and a working card inventory displayed as rows with image previews. You can add, view, edit, search, filter, sort, archive, restore, mark sold, and deliberately delete physical cards. Records include card identity, raw/graded condition, grading company and BGS subgrades, serial numbers, acquisition costs, dates, seller, notes, and sale results. Separate private front and back photos can be uploaded, replaced, viewed, or removed independently. Inventory imports/exports, full backup/restore, and hosted deployment remain later increments. Grading and current-sale records are included in `v0.1.0-demo.3`; the working version adds automatic auction search, raw-condition matching and evidence freshness.

The local working version has five pages: **Home** for collection estimates, sale-evidence history, and counts, **My Collection** for your cards, **Reports** for recorded finances, **Discover** for automatic completed-auction searches, and **Settings** for account, storage, and market-data information. Each page has its own URL; navigation, reload, and browser history retain private access. The card list no longer contains dashboard charts or detailed reports.

**Reports** shows current collection estimates followed by recorded spending, sales after fees, and profit after complete acquisition costs. **Sales and cost breakdown** expands gross sales, selling fees, cost of cards still owned, and a separate purchase-price-only comparison. The estimate snapshot is independent of the spending period; all figures use saved records and evidence, without a data-source selector. Choose all time, last year, last six months, last three months, last month, or last week, and select one recorded currency at a time. These totals include every saved card, including archived cards, independently of collection filters and pagination. Unknown amounts remain unknown; known subtotals show their coverage and whether they are incomplete. Enter explicit zero for acquisition expenses that did not apply if you want complete-cost profit calculated.

Recorded activity charts show daily spending, sales, fees, proceeds, or profit on their actual transaction dates. Undated records count toward all-time totals but not dated ranges or charts. Future-dated transactions are excluded through today and flagged; date boundaries use UTC. Cost of cards still owned is a current snapshot across all dates, including archived cards, and does not change with the period selector. Reports keeps estimate history and a raw-versus-graded value chart visible alongside recorded finances. Financial activity charts also start expanded on phones and can be collapsed with **Hide financial chart**. Editing, reversing a sale, or deleting a card changes these summaries and their past activity: they summarize current records rather than an immutable transaction ledger.

**Automatic estimate calculations support both raw and graded cards.** Open a card and choose **View sold comparables** to review its saved historical evidence, or **Find recent auction sales** to search automatically in Discover. With at least three matching sales within 180 days, the app calculates a median and observed range. Raw estimates match the recorded raw-condition category with low confidence; unassessed sales match only unassessed cards. Graded estimates use the same grading company and grade; other grades remain visible as context. Identity, currency, and recency must match. Evidence older than 90 days is flagged for refresh without removing history or automatically excluding sales inside the 180-day window. Purchase records and recorded sales never change when a comparable is added. Missing evidence shows **Insufficient Market Data**, and Home labels its known estimate subtotal with coverage rather than claiming a complete collection value.

**Automatic sales search uses CardSight AI.** Discover submits your card query to the server, which requests completed auctions only and returns dates, prices, grading context, sources and a graph. Buy It Now records are excluded because CardSight describes them as asking prices. Users never upload or manually enter market sales. Query results remain transient and do not overwrite collection estimates, personal costs or sales. Associating a canonical provider card with an owned copy and refreshing collection valuations automatically remains the next market-data increment. See [Market data research](docs/market-data.md) for provider limits and observed access. Migration `0007` adds raw-condition categories defaulted to unassessed, preserving existing grading, costs and evidence; rebuild and run the migration service before starting the updated API.

Home opens with the current known estimate subtotal, coverage, and a sale-evidence history chart. The chart holds today’s supported unsold-card cohort fixed and recomputes each card’s median from its matching sales in each historical 180-day window, requiring at least three matches per card. Missing support stays a gap. This describes saved evidence for the current cohort, not past holdings or investment returns; currencies stay separate. Collection mini graphs show actual matching saved sale dates and prices, with **Not enough sale history** when fewer than two sales are recorded. There are no fictional runtime values or data-source choices. Purchase costs remain separately labeled and unknown costs stay blank in the editor; sold-card figures use saved amounts. Mini graphs remain visible on phones, **More card details** expands secondary information, and Add card stays beside the My Collection heading.

The initial collection is approximately 100 cards. The online application will use Vercel with a Supabase Free database and private photo storage so the same collection can be accessed from multiple devices. An independent Docker Compose deployment will retain local database and photo storage. No paid service or AI API is planned.

## Project records

The refreshed five-card historical collection is documented in [Historical sales research](docs/historical-sales-research.md), with 113 dated source-reported observations from late 2024–2026. Card details and the sold-comparables page retain interactive sales graphs, including for sold cards. Missing dates and personal purchase costs remain unknown.

For an evidence-backed valuation demonstration, see [Researched valuation example](docs/valuation-example.md). It preserves unknown purchase costs and distinguishes reported sales from independently verified transactions.

Open [Personal.code-workspace](Personal.code-workspace) in VS Code to use this repository as the **Personal** workspace. It includes only SlabTrak, labels the window Personal, limits Git discovery to this folder's subtree, and disables searching through symlinks. Personal agent instructions remain local and are excluded from Git. These are workflow controls, not an operating-system access restriction; other repositories and accounts are not reconfigured.

- [Fresh UI review](docs/ui-review.md): independent screenshot-based recommendations and their evidence limits.
- [Design system](docs/design-system.md): brand, pitch-black palette, typography, layout, and components; review the live examples at http://localhost:3000/design.
- [Architecture](docs/architecture.md): deployment, authentication, data model, storage, cost constraints, and engineering decisions.
- [Development roadmap](docs/roadmap.md): working increments, first-release acceptance checks, and later milestones.
- [Validation](docs/validation.md): executed checks and remaining evidence gaps.
- [Market data](docs/market-data.md): verified provider access limits and the free recorded-comparables workflow.
- [Dependencies](docs/dependencies.md): versions, licenses, audits, and lockfiles.

Free hosting has quotas and availability limits. The application will include backup and restore rather than treating an online provider as the only copy of collection data. The local deployment will remain independent of cloud accounts.

No Vercel/Supabase deployment has been performed. Do not enter credentials or private collection records into Git.

## Start locally

You need Docker running and Python 3 to generate private local configuration. The application runs in containers; Node.js and application Python packages need not be installed on your Mac.

From the repository folder, run these commands in order:

```sh
python3 scripts/setup_local.py
docker compose build
docker compose up -d db
docker compose run --rm --build migrate
docker compose run --rm api python -m slabtrak.cli create-owner --username collector
docker compose up -d api web
```

The owner command asks for a password twice without displaying it. Use 12–128 characters and keep it private. Replace `collector` with your preferred username if desired. Public registration is disabled. The configuration command preserves an existing `.env` rather than replacing database credentials.

Open **http://localhost:3000**. Use that exact hostname: the default security configuration permits this origin, not another hostname or port. The normal setup exposes only the frontend on localhost; PostgreSQL and the API stay on the internal container network.

If this workspace is already running and you have not created an account, use:

```sh
docker compose exec api python -m slabtrak.cli create-owner --username collector
```

An existing owner cannot be overwritten by `create-owner`.

## Use your collection

The account menu is in the top-right header. Open it to see the signed-in username or choose **Sign out**. It closes with Escape, an outside click, or when keyboard focus leaves it.

After signing in, choose **Add card**. Only the player/subject is required; each saved entry represents one physical card. Enter a second entry for another copy, even if its printed card details match. Matching definitions are shared within your account, while grading, serial numbers, notes, and costs stay separate for each copy.

Blank costs mean unknown. Enter `0` for a cost you know was zero. A total acquisition cost appears only when purchase price, shipping, tax, and other costs are all known; otherwise the screen labels the recorded costs as incomplete. These amounts are acquisition records, not market valuations, and different currencies are not combined.

Click a card row, its title, or its thumbnail to open read-only details: identity, grading, photos, acquisition costs, seller, and notes. The title is also a keyboard-accessible button. **Edit** is a separate action in the row and detail view; only the editor contains editable fields and save/archive/delete controls. Saving or canceling an edit opened from details returns to that view. Missing costs remain unknown, distinct from a recorded zero.

To record **PSA 9**, choose **Edit → Condition → Graded**, set **Grading company** to PSA, and enter 9 in **Grade**. BGS records can also store subgrades. Grading is recorded by you; the app does not verify a certification with the grading company.

To record a sale, choose **Edit → Ownership status → Sold**. Enter the gross **Sale price**, total **Sale fees**, and an optional **Sold on** date in the card's currency. Enter 0 when no fees were charged. The editor previews **Net sale = sale price − fees**, **Profit vs purchase price = net sale − purchase price**, and **Profit after all acquisition costs = net sale − purchase price − shipping − tax − other costs**. Unknown purchase costs stay unknown. A negative result is a loss; fees can exceed the sale price. These amounts are computed exactly in cents/decimals and remain separate from market estimates.

Sold cards leave active collection counts and the current estimate cohort. Find them under **Filters → Show → Sold**; their rows and read-only details show recorded sale figures. A sold card cannot also be archived. Choosing **In collection** and saving clears its current sale record; canceling preserves it. This is one editable sale per physical copy, with no sale-event history, refund ledger, automatic fee schedule, currency conversion, or immutable transaction ledger.

Search finds players/subjects, sets, manufacturers, card numbers, parallels, category, certification, grading company, notes, and seller. Use **Filters → Show → Archive** to find archived cards, then choose **Edit** to restore one. Permanent deletion requires a second confirmation. Records refresh when you return to the browser window; a conflicting edit offers an explicit reload instead of overwriting a newer save.

In card details, switch between **Front** and **Back**, then choose **Enlarge photos** for a larger image. **Edit** lets you upload, replace, or remove the selected side's JPEG, PNG, or WebP image (up to 4 MB and 16 megapixels per side). Save a new card before adding its photos. Photo changes save separately and retain unsaved editor fields until you save or close the editor. Uploaded images are re-encoded as JPEG previews at up to 1,200 pixels on the longest side; metadata is removed. Both previews stay private to their owner and survive ordinary container replacement in the named `photos` volume. Existing images are retained as fronts; a back-only card uses its back as the thumbnail.

The four requested example cards have reference images with source links recorded in `data/example-cards.json`. **REFERENCE** labels distinguish these images from photos of your own copies; the pictured slab's grade and certification are not imported into your record. At the owner's request, the local examples now use illustrative PSA grades (Jordan 9, Barkley 8, Brady 9, Sanders 10), explicitly explained in their notes. Those manually assigned example grades are not verified grading claims. Their purchase costs remain unknown and none is marked sold. The public JSON documents the examples; another installation does not automatically seed them. Replace a reference image with your own photo when recording a physical card you own.

## Automatic sales search

Create a free [CardSight account](https://app.cardsight.ai), then add its API key to your local ignored `.env` as `CARDSIGHT_API_KEY`. Never commit the real key or use a `NEXT_PUBLIC_` setting for it. Recreate the API after changing configuration:

```sh
docker compose up -d --no-deps --force-recreate api
```

Open **Discover**, enter a card description and choose **Search sales**. Expand **Search filters** for raw/graded condition, grading company/grade and time range. Entering or editing text does not spend a search request until you submit. A card's **Find recent auction sales** link prefills the query for you. Results show reported completed auctions and source links; the graph describes only those returned prices, which may span multiple card issues or variants. Incomplete and non-auction observations are excluded. No manual sales entry or CSV import is part of this flow.

Each returned sale appears in an individual row with its listing-image preview, title, grade/condition, date, price and original source link. Hover or tap a point in the graph to inspect that sale and highlight its row. The selected-sale panel includes the photo and source link; arrow keys and Previous/Next controls also reach overlapping points. Missing or failed images show a fallback without hiding the sale. These are marketplace listing photos, not photos of your owned copy. Changing the graph period or inspecting a point makes no extra provider search request.

Saved-card graphs in card details and Sold comparables also expose individual sale details and source links when you hover, tap or use the arrow keys. Expand Sales for the dated records behind the graph; closing the dropdown leaves the graph and selected sale visible. Matching follows the API's exact card/currency/condition/grade rules. Saved sales retain optional original-listing image references and use the same previews as Discover. Older records without available images show a fallback; an owned-card photo is never substituted for a listing image. The full Recorded sales list is also collapsible.

The free plan currently advertises 750 calls/month, shared by this installation's users. The server holds the key, requests up to 100 results, filters the response and stores no provider records in PostgreSQL, files or browser storage. Search results are separate from the existing five-card historical collection evidence. Connection, invalid-key, quota and empty-result states remain distinct; a configured key is not proof of successful provider access. TLS certificate validation remains enabled. Hosted environment values must be set independently when deploying.

## Stop and restart

```sh
docker compose stop
docker compose up -d db api web
```

The database uses a named Docker volume and survives service restarts and ordinary container replacement. Do not use `docker compose down --volumes`; it deletes the database volume. `.env` contains local database credentials and is ignored by Git.

## Password recovery

With the API running:

```sh
docker compose exec api python -m slabtrak.cli reset-password --username collector
```

Enter the new password at the private prompts. Recovery revokes that account's sessions on every device and requires operator access to the installation. No public recovery endpoint or email service is involved.

## Update

Retain your source checkpoint and database backup before reviewing and applying new source changes:

```sh
docker compose build
docker compose stop api web
docker compose run --rm --build migrate
docker compose up -d api web
```

Use `--build` for the migration command so the one-off migration image contains the current migration files. Building the API image alone does not refresh a previously built migration image. Migrations are explicit operations, not actions run on API requests. Hosted migrations require a separate review of their destination and changes.

## Database backup

This operator backup contains account/session data, card records, acquisition details, and credential hashes, and must remain private:

```sh
mkdir -p backups
chmod 700 backups
umask 077
docker compose exec -T db pg_dump -U slabtrak_admin -d slabtrak --format=custom > backups/collection.dump
```

Use a new filename to retain older backups. `backups/` is ignored by Git. This dump does not include the private preview files in the named `photos` volume; retain a separate copy of that volume for complete operator recovery. Full collection/image backup and a beginner-facing restore workflow are not implemented. Recovery must first restore into a separate empty installation and be checked before replacing working data.

## Developer checks

The local checks used an ARM Mac with PostgreSQL 17 in Docker, Python 3.12, and Node.js 24. Normal application use gets those runtimes from containers. For host-side development, install locked dependencies in an isolated environment:

```sh
uv sync --project apps/api --python 3.12
cd apps/web
npm ci
npm run lint
npm run typecheck
npm test
npm run build
cd ../..
```

The build uses Next.js's supported Webpack path and prepares standalone static assets. The Geist UI font is bundled locally with its license; the interface makes no third-party font requests and loads no analytics, paid components, or AI services.

Before integration/browser checks, stop the normal frontend/API and expose development-only localhost ports. Tests reset only the reserved `slabtrak_test` database, leaving the normal `slabtrak` database separate:

```sh
docker compose stop api web
docker compose -f compose.yaml -f compose.dev.yaml up -d db
apps/api/.venv/bin/python scripts/check_api.py
PYTHONPATH=apps/api apps/api/.venv/bin/python scripts/check_browser.py
```

The browser helper requires Node.js 24 on PATH and installed Google Chrome. Standard browser checks blank the provider key and do not consume search quota. A separate live check deliberately spends one CardSight request: set `SLABTRAK_TEST_LIVE_MARKET=1` and pass `--config playwright.live.config.ts` to the same helper. Run it only after standard checks finish; it uses the isolated database and generates a separate report. If the environment needs extra CA trust, supply its local-only `SSL_CERT_FILE` without committing certificate files. It starts temporary servers, uses generated credentials in the isolated test database, checks desktop/phone widths, and stops those servers afterward. It refuses occupied ports. Phone emulation is not an actual phone test. CI uses its own isolated database and Chromium.

Browser checks run headlessly and produce an HTML report with results and screenshots without opening browser windows. To include recordings, use `SLABTRAK_TEST_EVIDENCE=1 PYTHONPATH=apps/api apps/api/.venv/bin/python scripts/check_browser.py`, with the same stopped services and development database ports as above. Videos are recorded in the background. The report is saved at `apps/web/playwright-report/index.html`; `npx playwright show-report` from `apps/web` serves it for manual review. Generated reports stay outside Git. Recordings can show entered test data, so keep using disposable test accounts rather than your normal collection. The helper also forwards Playwright options such as `--project=desktop` or `--grep` for a focused check. Visible browser runs are reserved for an explicit request.

Return to the internal-only database configuration with `docker compose up -d db api web`. API documentation is available at `http://127.0.0.1:8000/docs` when the development API port is explicitly enabled; it is disabled by secure hosted configuration.

## License

SlabTrak's original source is available under [PolyForm Noncommercial 1.0.0](LICENSE). The license permits review, use, modification, and redistribution for its permitted purposes, including personal hobby use without an anticipated commercial application. Commercial use outside those permissions requires a separate license from the copyright holder. The license also expressly permits use by the organizations identified in its Noncommercial Organizations section.

This is source-available software with noncommercial restrictions. Redistribution must preserve the license terms or their URL and the Required Notice in `LICENSE`. Third-party dependencies, bundled fonts, and card images retain their existing terms; SlabTrak's license does not grant rights to those materials. See [Dependencies](docs/dependencies.md) for dependency and font notices.
