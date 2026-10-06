# Security policy

## Supported versions

Only the latest minor release receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private vulnerability reporting
(`Security` tab, `Report a vulnerability`) on this repository. Include a description, the affected
version and, if possible, a minimal reproduction.

You can expect an acknowledgement within 3 working days and a fix or mitigation plan within 14 days.
Reporters are credited in the changelog unless they prefer otherwise.

## Scope

In scope: SQL injection through the public API, bypass of the environment guard, leaking credentials in
logs or errors, unsafe handling of connection strings, and supply-chain issues in the published package.

Out of scope: seeding a database you explicitly allow-listed or forced with `--force`, and data contained in your own seeders.

## Design notes

- Values are always bound parameters; table and column names are validated against a strict pattern.
- The guard refuses `production`/`staging`, remote hosts and unlisted databases by default. `--force` (like Laravel's) skips the environment check only: host and database checks always apply, and the CLI asks for confirmation on a terminal.
- The package has no runtime dependencies and is published with npm provenance.
