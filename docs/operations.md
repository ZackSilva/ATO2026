# Maintain a local installation

[Documentation](README.md) · [First-time setup](getting-started.md) · [Hosted deployment](vercel-services.md)

These commands apply to the local Docker installation. Hosted credentials, migrations and photo storage require their own setup. Run commands from the repository root.

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
