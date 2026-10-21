# SlabTrak

![SlabTrak — Your collection, simplified.](docs/assets/readme-banner.svg)

[![GitHub CI Checks](https://github.com/ZackSilva/slabtrak/actions/workflows/checks.yml/badge.svg?branch=main)](https://github.com/ZackSilva/slabtrak/actions/workflows/checks.yml)
[![License: PolyForm Noncommercial](docs/assets/license-badge.svg)](LICENSE)

A private workspace for trading-card collectors. Keep your raw and graded cards, purchase costs, sales and market evidence together in one clean interface.

[Get started](docs/getting-started.md) · [FAQ](docs/faq.md) · [Documentation](docs/README.md) · [Roadmap](docs/roadmap.md)

## Your collection, at a glance

- **Find and record your cards.** Search the catalog, review editable details, and save each physical copy with its own photos, grading and costs.
- **Understand your numbers.** Track acquisition costs, sale proceeds after fees and profit in collection-based reports.
- **Research recent sales.** Search completed auctions, inspect listing previews and explore sales directly from a graph.
- **Estimate when you're ready.** Choose **Estimate Value**, confirm the exact raw or graded card match, and retrieve comparable auction sales automatically. You can also save without pricing.

Estimates depend on matching evidence. Unknown costs and unsupported values stay unknown, currencies stay separate, and historical charts summarize sales evidence rather than investment returns. [How pricing works →](docs/market-data.md)

Optional [PSA certificate proposals](docs/certificate-lookups.md) require approved API account access; other graders retain manual entry and official verification links.

[![SlabTrak collection showing card rows, grading details and value history](docs/assets/screenshots/collection-desktop.png)](docs/gallery.md)

*Preview with fictional cards, illustrative prices and original placeholder artwork. [See desktop, reports and mobile views →](docs/gallery.md)*

## Run locally

With Docker running and Python 3 installed, run from the repository folder:

```sh
python3 scripts/setup_local.py
docker compose build
docker compose up -d db
docker compose run --rm --build migrate
docker compose run --rm api python -m slabtrak.cli create-owner --username collector
docker compose up -d api web
```

Open **http://localhost:3000** and sign in with the owner credentials you just created. The password prompt is hidden. [Full setup and maintenance →](docs/getting-started.md)

## Explore the project

| I want to… | Start here |
| --- | --- |
| Preview the app and common questions | [Screenshot gallery](docs/gallery.md) · [FAQ](docs/faq.md) |
| Manage cards, sales and reports | [User guide](docs/user-guide.md) |
| Set up Vercel and Supabase | [Deployment guide](docs/vercel-services.md) |
| Develop, test or contribute | [Development](docs/development.md) · [Contributing](CONTRIBUTING.md) |
| Understand the implementation | [Architecture](docs/architecture.md) · [Design system](docs/design-system.md) |
| Review evidence and changes | [Validation](docs/validation.md) · [Release notes](CHANGELOG.md) |

Built with **Next.js**, **FastAPI** and **PostgreSQL**, with Docker for local use and Vercel/Supabase for hosting.

## Project status

**Beta — v0.1.0-beta.1.** Run your own installation using the setup guides; this repository does not offer a public hosted service. Accounts are operator-created, and public sign-up is pending. Private hosted photos require [Supabase Storage setup](docs/vercel-services.md#private-hosted-photo-storage); hosted persistence and two-device checks remain pending. Local and hosted installations keep separate data. See the [roadmap](docs/roadmap.md) for what comes next.

## License

Source available under [PolyForm Noncommercial 1.0.0](LICENSE). Commercial use outside the license's permissions requires a separate license; [third-party notices](docs/dependencies.md) retain their own terms.
