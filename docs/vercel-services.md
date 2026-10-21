# Vercel Services deployment

Prepared October 20, 2026. The owner confirmed the service names, public exposure and binding. No Vercel project, deployment, database or storage bucket has been created by this change.

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

Supabase integration is still pending. The existing photo implementation uses local files and cannot provide durable storage on Vercel. A private object-storage adapter and data/photo transfer need a separate increment. Until then, do not treat a successful build as a persistent, fully usable hosted collection. Price-cache retention and quota coordination across hosted instances also remain open. Keep the normal local installation independent.

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
