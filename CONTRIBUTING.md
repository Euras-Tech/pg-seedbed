# Contributing to pg-seedbed

Thanks for helping. This is a small, security-sensitive library, so changes are kept small and tested.

## Setup

```bash
pnpm install
docker compose up -d --wait db      # Postgres 16 on 127.0.0.1:55432 for integration tests
pnpm check                          # lint, format, typecheck, unit tests + coverage, build, package checks
pnpm test:integration               # needs the database above
```

Node.js 20 or newer. The default database URL used by the integration tests is
`postgres://postgres:postgres@localhost:55432/seedbed_test`; override it with `DATABASE_URL`.

## Guidelines

- **Test first.** Every behaviour change needs a unit test; anything touching SQL, transactions or the CLI also needs an integration test.
- **Security first.** Values must stay bound parameters. Identifiers must go through `quoteTable`/`quoteColumn`. Error messages must never contain credentials. Do not add a way to bypass the environment guard.
- **No runtime dependencies.** `pg` is a peer dependency; Nest is an optional peer.
- **Keep the API small.** Open an issue before adding public API.
- Coverage gates (90% lines/functions/statements, 85% branches) are enforced in CI.

## Pull requests

1. Fork and branch from `main`.
2. Add a changeset: `pnpm changeset` (patch for fixes, minor for features, major for breaking changes).
3. Make sure `pnpm check` and `pnpm test:integration` pass.
4. Use [Conventional Commits](https://www.conventionalcommits.org) style messages.

## Releasing (maintainers)

Versioning uses [Changesets](https://github.com/changesets/changesets). The `Release` workflow is manual and publishes with npm provenance after running every check.

## Conduct

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).
