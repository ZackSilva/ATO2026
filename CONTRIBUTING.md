# Contributing to SlabTrak

SlabTrak is an early personal project. Reviews, reproducible bug reports and focused improvements are welcome. Use is subject to [PolyForm Noncommercial 1.0.0](LICENSE).

## Before changing code

Read the [local setup](docs/getting-started.md), [architecture](docs/architecture.md) and [development guide](docs/development.md). Keep changes focused on one behavior and use the existing design system for interface work.

## Report an issue

Describe what you did, what you expected and what happened. Include the app version or commit and whether you used the local or hosted app. Remove passwords, API keys, connection strings and private collection details from logs and screenshots.

## Propose a change

Explain the resulting behavior and the checks you ran. Include desktop and phone evidence for interface changes, and distinguish fixture tests from live-provider verification. Follow the development guide for an isolated test database; never run destructive checks against a collection database.

Keep secrets, private data/photos, backups, local agent instructions and generated test reports out of commits. Do not change the license, release versions or deployment configuration incidentally to an unrelated fix.
