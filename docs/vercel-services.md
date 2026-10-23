# Vercel Services deployment

Updated October 21, 2026. The Services routing and database setup are documented below; hosted database health has been checked separately. The private photo adapter is implemented, but this source change does not create a bucket or configure Vercel secrets. Live hosted photo checks remain pending.

## One project, two services

Import `ZackSilva/slabtrak` as a new Vercel project. Set its Root Directory to the repository root and its Framework Preset to **Services**. The root `vercel.json` defines `api` (FastAPI in `apps/api`) and `web` (Next.js in `apps/web`). Do not create separate projects or select `apps/web` as this project's root.

Confirmed routing:

| Caller/path | Destination | Access |
| --- | --- | --- |
| Browser `/`, `/collection`, `/reports`, `/discover`, `/settings`, static assets | `web` | Public entry point; collection pages require sign-in. |
| Browser `/api/*` | `web` Node.js API forwarding function | Public same-origin API surface; backend authentication and CSRF checks still apply. |
| `web` forwarding function | `api`, through `API_SERVICE_URL` | Internal service binding. `api` has no public rewrite. |

The catch-all public rewrite deliberately targets `web`. A direct `/api/(.*) → api` rewrite would bypass the web forwarding function. The owner confirmed this change from the initial suggested configuration. No URL prefix is stripped: `/api/cards` remains `/api/cards` in FastAPI. A binding URL's deployment-specific base path is retained.

Vercel injects `API_SERVICE_URL` into `web` functions at runtime. Do not add it to project environment settings, `.env`, Docker configuration, `NEXT_PUBLIC_*` variables or build arguments. `next.config.ts` never reads the binding. Middleware does not call the API. The browser continues using relative `/api` paths and never receives the internal URL.

For local Docker only, `API_INTERNAL_URL=http://api:8000` is supplied to the frontend container at runtime. Ordinary host development defaults to `http://127.0.0.1:8000`. A Vercel runtime without its binding returns an explicit connection error instead of using localhost. The forwarding function preserves browser cookies, original Origin, CSRF headers, raw upload bytes and queries; limits request bodies, refuses upstream redirects, keeps separate Set-Cookie headers and disables caching.

## Environment and remaining hosting work

Configure secrets in Vercel settings, never source control or chat:

- `DATABASE_URL`: a reachable PostgreSQL connection using the restricted application role and the `postgresql+psycopg://` driver. The local Docker `db` hostname is not reachable from Vercel. The current API requires this setting to initialize.
- `APP_ORIGIN`: the exact stable public HTTPS website origin, without a path. Origin checks remain exact; preview deployments need their own matching configuration and isolated database.
- `COOKIE_SECURE=true`: required with a remote origin.
- `CARDSIGHT_API_KEY`: optional server-only provider key. Keep local development certificates and trust overrides out of hosted settings.

Apply migrations deliberately with a separate migration connection and the required application role/schema grants before using a hosted database. Do not run migrations on each request or build. Create the owner account through the existing operator procedure; public registration remains disabled.

The saved research-query update requires migration `0011` **before deploying its API code**. It adds a non-null `market_query` text field, defaulting existing cards to an empty query, and records the new migration revision. It does not change purchase costs, sale evidence, photos or confirmed market matches. For an existing `0010` installation, apply only the `0010` → `0011` upgrade; do not rerun initialization. Verify revision `0011` before promoting the deployment. Run migrations through the operator connection, never the application's restricted role.

### CardSight for every collector on this installation

Set `CARDSIGHT_API_KEY` in the Vercel project's **Production** environment to the operator's CardSight API key, then deploy again. The key in a local `.env` file is not sent to Vercel by a Git push. Keep the key server-only; do not add a `NEXT_PUBLIC_` copy or ask collectors to configure their own key.

The existing API uses this one deployment-level key for every signed-in collector's Discover searches, card matching and automatic estimates. Accounts retain separate cards, confirmed matches and saved records. All provider requests share the operator's CardSight allowance; caches and request pacing are per process, so they do not provide a shared quota ledger across Vercel workers.

After the new deployment is Ready, sign in and check **Settings → Market data** for **Key configured**, then perform a Discover search. Configuration status confirms only that a key is present; successful search verifies provider access. Repeat from a separate collector account to check guest access. Each live search consumes provider allowance.

### Row-level security and backend access

Migration `0010` adds a `slabtrak_backend` policy on the seven application tables, restricted to the server-only `slabtrak_app` database role. It leaves existing RLS settings unchanged. When RLS is enabled, table grants alone are insufficient: without applicable policies, an otherwise reachable database can reject the failed-login counter insert with a storage error. A passing health check only proves an account SELECT can execute, not that writes or account visibility work.

The backend role can access rows allowed by its existing table grants; the API authenticates collectors and enforces owner isolation. These policies do not implement database isolation between collectors. Keep `slabtrak` outside the exposed Data API schemas, never grant browser roles membership in `slabtrak_app`, and keep its connection string server-only. The policies do not target `PUBLIC`, `anon` or `authenticated`, grant `BYPASSRLS`, or rely on Supabase Auth's `auth.uid()`; SlabTrak uses its own sessions. The migration version table remains operator-only. A downgrade removes these policies without changing RLS flags.

For an installation already at `0009`, apply only the `0010` upgrade, not the original initialization script. Verify seven role-specific policies and revision `0010`. A nonexistent-user sign-in should then return 401 instead of 503; create the hosted owner separately before attempting a successful sign-in. Database policy changes take effect without redeploying the application.

### Private hosted photo storage

The API supports private Supabase Storage without changing the database or adding dependencies. Docker keeps `PHOTO_STORAGE_BACKEND=local` and its named `photos` volume by default. For Vercel, complete these operator steps before deploying the storage increment:

1. In the intended Supabase project, create the `card-photos` Storage bucket with **Public OFF**, allowed MIME type `image/jpeg`, and file-size limit **1 MiB / 1,048,576 bytes**. Do not add public read access or `anon`/`authenticated` policies.
2. Obtain a new server-only Supabase secret key beginning `sb_secret_`. Use neither a browser publishable/anon key nor a legacy JWT `service_role` key. Enter the real value directly in provider settings, never chat or Git.
3. Add all four values below to the Vercel project's **Production** runtime environment before deploying the reviewed commit. Keep the existing database, origin and cookie settings. Do not set `API_SERVICE_URL`; Services injects that binding.

| Setting | Production value |
| --- | --- |
| `PHOTO_STORAGE_BACKEND` | `supabase` |
| `SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` — the HTTPS project origin, without a path, query or credentials. |
| `SUPABASE_SECRET_KEY` | The server-only `sb_secret_…` key. No `NEXT_PUBLIC_` copy. |
| `SUPABASE_STORAGE_BUCKET` | `card-photos` (also the application default). |

SlabTrak uses its own accounts and sessions, not Supabase Auth. The secret bypasses storage RLS, so the API must enforce collector ownership before every read or mutation; storage policies for browser roles do not provide that isolation. The adapter sends this key only in the Storage REST `apikey` header. Browser requests use the existing authenticated SlabTrak photo routes and never receive storage credentials, public URLs or signed URLs. Objects have opaque `ownerUUID/photoUUID.jpg` paths.

Incoming uploads still accept JPEG, PNG or WebP up to 4 MiB and 16 megapixels. The API strips metadata, normalizes orientation and produces JPEG previews capped at 1,200 pixels and 1 MiB; the bucket accepts only those processed images. Selecting `supabase` without valid required settings fails API startup. A storage error never silently falls back to Vercel's temporary local filesystem.

Existing local cards and photos are not copied by these settings. Local and hosted installations remain independent, and this increment includes no operator transfer or automatic synchronization.

After an authorized deployment, verify front/back upload, view, replacement and removal, another account's denied access, unauthenticated denial, missing-object and service-error behavior, two-device reads, and the same photo after a redeployment. Confirm Settings reports Supabase storage. Local/mock checks do not prove the real key, bucket limits or hosted persistence; record actual results in `validation.md` before calling this hosted path verified. Photo storage is designed to survive application redeployment because objects live outside Vercel, but live proof remains pending.

Price-cache retention and quota coordination across hosted instances also remain open.

## Local Services check

Use a current Vercel CLI that supports Services. Supply a connection to the isolated development database and set `APP_ORIGIN` to the local URL printed by Vercel. Run from the repository root:

```sh
vercel dev -L
```

The `-L` option runs locally without Vercel cloud authentication; Vercel injects service bindings. No Supabase account or hosted deployment is needed for this routing check. The existing `scripts/check_browser.py` suite also exercises the forwarding function against the isolated local FastAPI/PostgreSQL app; it does not by itself prove Vercel binding injection.

Review actual local CLI and browser results in `validation.md`. Hosted verification must additionally cover HTTPS cookies, sign-in/out, rejected origins/CSRF, owner isolation, photo persistence, API errors and deployment protection. Generated reports and `.vercel` settings stay outside Git. `.vercelignore` excludes private local material from manual CLI uploads; deployment credentials are not repository files.

## Sources

- [Vercel Services setup](https://vercel.com/kb/guide/vercel-services)
- [Service configuration](https://vercel.com/docs/services/config-reference)
- [Service bindings](https://vercel.com/docs/services/bindings)
- [Service routing](https://vercel.com/docs/services/routing)
- [Services pricing and limits](https://vercel.com/docs/services/pricing)
