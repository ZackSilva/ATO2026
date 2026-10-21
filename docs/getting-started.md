# Run SlabTrak locally

[Documentation](README.md) · [Using SlabTrak](user-guide.md) · [Maintenance](operations.md)

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

## Optional VS Code workspace

Open [Personal.code-workspace](../Personal.code-workspace) to use the repository as the Personal workspace. It contains only SlabTrak, limits Git discovery to this folder, and keeps personal agent instructions local. This is a workflow boundary, not an operating-system sandbox.

## Next steps

- [Use your collection](user-guide.md): cards, grading, photos, sales, reports and estimates.
- [Automatic sales search](market-data.md#configure-cardsight-and-inspect-sales): optional server-side CardSight configuration.
- [Maintain this installation](operations.md): updates, password recovery and backups.
- [Deploy on Vercel](vercel-services.md): hosted PostgreSQL, runtime bindings and remaining photo-storage work. Local and hosted installations are separate stores; local credentials and records are not automatically copied online.
