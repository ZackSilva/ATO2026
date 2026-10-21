# Development and testing

[Documentation](README.md) · [Architecture](architecture.md) · [Validation evidence](validation.md)

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

The browser helper requires Node.js 24 on PATH and installed Google Chrome. Standard browser checks blank the provider key and do not consume search quota. Separate live checks deliberately consume CardSight quota for searches, matching and pricing: set `SLABTRAK_TEST_LIVE_MARKET=1` and pass `--config playwright.live.config.ts` to the same helper. Run it only after standard checks finish; it uses the isolated database and generates a separate report. If the environment needs extra CA trust, supply its local-only `SSL_CERT_FILE` without committing certificate files. It starts temporary servers, uses generated credentials in the isolated test database, checks desktop/phone widths, and stops those servers afterward. It refuses occupied ports. Phone emulation is not an actual phone test. CI uses its own isolated database and Chromium.

Browser checks run headlessly and produce an HTML report with results and screenshots without opening browser windows. To include recordings, use `SLABTRAK_TEST_EVIDENCE=1 PYTHONPATH=apps/api apps/api/.venv/bin/python scripts/check_browser.py`, with the same stopped services and development database ports as above. Videos are recorded in the background. The report is saved at `apps/web/playwright-report/index.html`; `npx playwright show-report` from `apps/web` serves it for manual review. Generated reports stay outside Git. Recordings can show entered test data, so keep using disposable test accounts rather than your normal collection. The helper also forwards Playwright options such as `--project=desktop` or `--grep` for a focused check. Visible browser runs are reserved for an explicit request.

Return to the internal-only database configuration with `docker compose up -d db api web`. API documentation is available at `http://127.0.0.1:8000/docs` when the development API port is explicitly enabled; it is disabled by secure hosted configuration.

## Database access model

The API test fixture applies current migrations and enables RLS on all application tables. Migration `0010` supplies policies only for the trusted `slabtrak_app` server role; the API enforces collector ownership. Tests must use an isolated database whose name ends in `_test`. Never point this suite at a collection or hosted deployment database.

## Review changes

Keep fixes scoped, describe the behavior they change, and distinguish mocked checks from live provider or hosted evidence. For an interface change, retain headless screenshots at desktop and phone widths. See [CONTRIBUTING](../CONTRIBUTING.md) and the [validation record](validation.md).
