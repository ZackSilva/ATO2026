# Dependency record

Reviewed October 19, 2026. Exact versions and hashes are in `apps/api/uv.lock`, the exported Python requirements lockfiles, and `apps/web/package-lock.json`. [The metadata inventory](dependencies.json) covers 60 installed Python packages and 286 frontend lockfile entries, including development packages and optional platform variants. Not all optional platform binaries are installed on the Mac.

| Component | Version | Declared license |
| --- | --- | --- |
| Next.js | 16.4.2 | MIT |
| React / React DOM | 19.3.1 | MIT |
| Tailwind CSS / PostCSS integration | 4.3.3 | MIT |
| TypeScript | 5.9.3 | Apache-2.0 |
| FastAPI | 0.149.0 | MIT |
| SQLAlchemy | 2.1.5 | MIT |
| Pydantic Settings | 2.16.0 | MIT |
| Alembic | 1.20.0 | MIT |
| Psycopg / binary distribution | 3.3.6 | LGPL-3.0-only |
| Argon2 CFFI | 25.1.0 | MIT |
| Uvicorn | 0.54.0 | BSD-3-Clause |
| Pillow | 13.0.0 | MIT-CMU |
| Pytest | 9.1.1 | MIT |
| Ruff | 0.17.1 | MIT |
| Vitest | 5.0.5 | MIT |
| Playwright | 1.64.1 | Apache-2.0 |

No subscription or hosted account is needed by these packages. shadcn/ui and charts are not installed because this slice does not need them yet. Redis, Celery, cloud AI, and OCR packages are not installed.

License metadata comes from official npm/PyPI records and installed distributions. Preserve notices and review redistribution obligations when packaging releases. Psycopg and bundled libvips declare LGPL licenses; Lightning CSS and Certifi declare MPL licenses; caniuse-lite's dataset declares CC-BY-4.0. These are not proprietary paid components. The inventory is not a substitute for reviewing all notices in bundled native libraries. SlabTrak's original source is licensed under [PolyForm Noncommercial 1.0.0](../LICENSE), a source-available license with noncommercial restrictions. Third-party dependencies, bundled fonts, and card images retain their existing terms and are not relicensed under SlabTrak's grant.

The frontend audit reported zero known vulnerabilities after replacing an unnecessary lint-preset dependency chain; frontend dependencies have not changed for preview support. pip-audit was rerun after adding Pillow 13.0.0 and reported zero known vulnerabilities in pinned Python runtime requirements; development-only tools were outside that audit's scope. Pillow's version, Python support, and MIT-CMU license were checked against PyPI metadata and its official documentation. TypeScript 5.9.3 fits the selected lint tooling's supported range.

Node.js 24.22.0 and Python 3.12.15 were used locally. Docker uses patch-version Node/Python tags and a digest-pinned PostgreSQL 17 image. These need reviewed updates; package audits do not scan operating-system image vulnerabilities. GitHub Actions are pinned to official release commit hashes; the workflow has not run on GitHub.

No known vulnerabilities is a point-in-time result, not a security certification. Hosted plans and quotas are separate from library licenses.

The design system also bundles the unmodified Geist Latin variable font from the pinned Next.js distribution. Geist uses the SIL Open Font License 1.1; the font, upstream license, provenance, and SHA-256 are retained in `apps/web/app/fonts/`. This adds no npm dependency or remote font requests. See the [official Geist source](https://github.com/vercel/geist-font).

The current beta release is `v0.1.0-beta.1`. Frontend/API release metadata advertises `0.1.0-beta.1`; Python package/uv project metadata uses the equivalent `0.1.0b1` for packaging compatibility. Runtime and development dependency versions and hashes are unchanged. See [the changelog](../CHANGELOG.md) for release details.
