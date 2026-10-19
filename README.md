# SlabTrak

Your Collection, Simplified.

**Demo release: `v0.1.0-demo.1`** · [GitHub repository](https://github.com/ZackSilva/slabtrak) · [Release notes](CHANGELOG.md)

SlabTrak will manage raw and graded trading cards, acquisition costs, sales, photos, and collections. Later releases will add evidence-based market research, deal discovery, local OCR, and optional local AI.

## Current status

The local app now includes private sign-in and a working card inventory displayed as rows with image previews. You can add, view, edit, search, filter, sort, archive, restore, and deliberately delete physical cards. Records include card identity, raw/graded condition, grading company and BGS subgrades, serial numbers, acquisition costs, dates, seller, and notes. One private preview photo per physical card can be uploaded, replaced, viewed, or removed. Separate front/back photos, sales, imports/exports, full backup/restore, and hosted deployment remain later increments.

A configurable overview chart and compact row sparklines demonstrate collection value, purchase totals, and unrealized gain/loss. Choose all time, last year, last six months, last three months, last month, or last week. **Financial chart and row values are fictional demo data in USD**; all time shows two simulated years for your current active cards. Filtering the row list does not change the overview. Real purchase records remain in the card editor, and known recorded acquisition costs are separately labeled in rows.

The initial collection is approximately 100 cards. The online application will use Vercel with a Supabase Free database and private photo storage so the same collection can be accessed from multiple devices. An independent Docker Compose deployment will retain local database and photo storage. No paid service or AI API is planned.

## Project records

- [Fresh UI review](docs/ui-review.md): independent screenshot-based recommendations and their evidence limits.
- [Design system](docs/design-system.md): brand, pitch-black palette, typography, layout, and components; review the live examples at http://localhost:3000/design.
- [Architecture](docs/architecture.md): deployment, authentication, data model, storage, cost constraints, and engineering decisions.
- [Development roadmap](docs/roadmap.md): working increments, first-release acceptance checks, and later milestones.
- [Project state](project-state.md): confirmed decisions, outstanding setup information, and next action.
- [Validation](docs/validation.md): executed checks and remaining evidence gaps.
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

Search finds players/subjects, sets, manufacturers, card numbers, parallels, category, certification, grading company, notes, and seller. Use **Show → Archive** to find archived cards, then open a card to restore it. Permanent deletion requires a second confirmation. Records refresh when you return to the browser window; a conflicting edit offers an explicit reload instead of overwriting a newer save.

Choose a thumbnail to open a larger image. In **View / edit**, choose **Upload photo** or **Replace photo** to attach your own JPEG, PNG, or WebP image (up to 4 MB and 16 megapixels). Save a new card before adding its photo. Uploaded images are re-encoded as JPEG previews at up to 1,200 pixels on the longest side; metadata is removed. Each preview stays private to its owner and survives ordinary container replacement in the named `photos` volume.

The four requested example cards have reference images with source links recorded in `data/example-cards.json`. **REFERENCE** labels distinguish these images from photos of your own copies; the pictured slab's grade and certification are not imported into your record. Replace a reference image with your own photo when recording a physical card you own.

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

Migrations are explicit operations, not actions run on API requests. Hosted migrations require a separate review of their destination and changes.

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

The browser helper requires Node.js 24 on PATH and installed Google Chrome. It starts temporary servers, uses generated credentials in the isolated test database, checks desktop/phone widths, and stops those servers afterward. It refuses occupied ports. Phone emulation is not an actual phone test. CI uses its own isolated database and Chromium.

Return to the internal-only database configuration with `docker compose up -d db api web`. API documentation is available at `http://127.0.0.1:8000/docs` when the development API port is explicitly enabled; it is disabled by secure hosted configuration.
