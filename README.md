# pg-seedbed

Laravel-style **seeders and factories for Node.js and PostgreSQL**. Deterministic ids, idempotent upserts, safety guards that refuse to touch the wrong database, a CLI, and a first-class NestJS module.

- **Seeders as classes**, composed with `this.call(...)` like Laravel's `DatabaseSeeder`.
- **Deterministic ids** (UUID v5 from a natural key): the same user has the same id on every machine, so tokens, fixtures and foreign keys stay stable.
- **Idempotent by construction**: `upsert()` and factories use `INSERT ... ON CONFLICT`, so seeding twice is safe.
- **Secure by default**: refuses `NODE_ENV=production`/`staging`, remote hosts and unlisted databases. All values are bound parameters; identifiers are validated, never interpolated.
- **No ORM, no runtime dependencies**: just `pg`. Works beside Prisma, Drizzle, Knex, TypeORM or raw SQL.
- **One transaction per run**: a failing seeder rolls everything back.
- **Typed**, dual ESM/CJS, Node 20+.

## Install

```bash
pnpm add -D pg-seedbed pg     # or npm i -D / yarn add -D
```

Requires Node.js 20+ and `pg` 8. The NestJS module (`pg-seedbed/nest`) needs `@nestjs/common` and `@nestjs/core` 11.

## Quick start

`seeders.ts`

```ts
import { Seeder, defineFactory } from 'pg-seedbed';

export class UserSeeder extends Seeder {
  async run(): Promise<void> {
    const users = defineFactory(({ seq }) => ({
      id: this.ids('user', `user${seq}@example.test`), // stable across runs and machines
      email: `user${seq}@example.test`,
      full_name: `User ${seq}`,
    }));
    await users.createMany(this.db, 'users', { conflict: ['email'] }, 5);
  }
}

export class DatabaseSeeder extends Seeder {
  async run(): Promise<void> {
    await this.call(UserSeeder); // add more seeders here, in dependency order
  }
}
```

`seedbed.config.ts`

```ts
import { defineConfig } from 'pg-seedbed';
import { DatabaseSeeder, UserSeeder } from './seeders';

export default defineConfig({
  seeders: [DatabaseSeeder, UserSeeder],
  idNamespace: '6f1d2c9a-4b7e-4f3a-9c55-2a8e0d7b1c34', // any fixed UUID, unique to your project
  guard: { allowedDatabases: ['myapp_dev', 'myapp_test'] },
});
```

Run it:

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/myapp_dev

pg-seedbed run                       # DatabaseSeeder (the default entry point)
pg-seedbed run --class UserSeeder    # one seeder, like `php artisan db:seed --class=`
```

TypeScript config files run through [`tsx`](https://tsx.is): `NODE_OPTIONS='--import tsx' pg-seedbed run`. Plain `seedbed.config.mjs` / `.js` / `.cjs` need nothing extra (Node 22.18+ can also load `.ts` natively). Complete examples are in [`examples/`](./examples).

## Laravel mapping

| Laravel                               | pg-seedbed                                         |
| ------------------------------------- | -------------------------------------------------- |
| `class UserSeeder extends Seeder`     | `class UserSeeder extends Seeder`                  |
| `public function run()`               | `async run()`                                      |
| `$this->call([UserSeeder::class])`    | `await this.call(UserSeeder)`                      |
| `php artisan db:seed`                 | `pg-seedbed run`                                   |
| `db:seed --class=UserSeeder`          | `pg-seedbed run --class UserSeeder`                |
| `User::factory()->count(5)->create()` | `factory.createMany(db, 'users', { conflict }, 5)` |
| `->state([...])`                      | `factory.state({ ... })`                           |
| `updateOrCreate()`                    | `upsert()` / `factory.create()`                    |
| `$this->command->info()`              | `this.log.info()`                                  |

Unlike Laravel there is **no seed tracking table**, and `migrate:fresh` is not included: seeders are expected to be idempotent upserts. Run your migration tool first.

## Deterministic ids

```ts
import { createIds } from 'pg-seedbed';

const ids = createIds('6f1d2c9a-4b7e-4f3a-9c55-2a8e0d7b1c34');
ids('user', 'awa@example.test'); // same UUID v5, always
```

Inside a seeder use `this.ids(...)` (set `idNamespace` in the config). Key parts are encoded unambiguously, so `('a:b', 'c')` never collides with `('a', 'b:c')`. Pick **one namespace per project and never change it**: changing it changes every id.

## Factories

```ts
const posts = defineFactory<Post>(({ seq, rand }) => ({
  title: `Post ${seq}`,
  views: rand.int(0, 1000), // reproducible: row N always gets the same value
}));

posts.make(); // in memory
posts.makeMany(3, { published: true }); // with overrides
posts.state({ published: true }).make(); // reusable variation
await posts.createMany(db, 'app.posts', { conflict: ['slug'] }, 10); // upserts
```

Randomness is a small seeded PRNG, so data is reproducible without a faker dependency. Use faker if you like: call `faker.seed(...)` inside the definition.

## Safety model

`runSeeders` (and the CLI and the Nest module) call `assertSafeTarget` before connecting:

- refuses when `NODE_ENV` or `APP_ENV` is `production` or `staging` (configurable);
- refuses any host that is not `localhost`, `127.0.0.1`, `::1` or a Unix socket, unless you list it in `allowedHosts` (for example a Docker Compose service name such as `db`);
- with `allowedDatabases`, refuses any other database name. **Set it.** It is the check that stops a copied `DATABASE_URL` from seeding the wrong database;
- error messages never contain credentials.

There is intentionally no flag to seed production. If you pass your own `client` instead of a `connectionString`, the guard is skipped and the target is your responsibility.

SQL helpers validate table and column names against a strict pattern (letters, digits, underscore) and reject anything else rather than trying to escape it. Values are always bound parameters.

## NestJS

```ts
// app.module.ts
@Module({
  imports: [
    SeedbedModule.forRoot({
      imports: [UsersModule], // modules whose providers your seeders inject
      seeders: [DatabaseSeeder, UserSeeder],
      connectionString: process.env.DATABASE_URL ?? '',
      idNamespace: '6f1d2c9a-4b7e-4f3a-9c55-2a8e0d7b1c34',
      guard: { allowedDatabases: ['myapp_dev'] },
    }),
  ],
})
export class AppModule {}

// seed.ts: a standalone entry point, no HTTP server
const app = await NestFactory.createApplicationContext(AppModule);
await app.get(SeedbedService).run(process.argv[2]); // optional class name
await app.close();
```

Seeders are Nest providers, so they can use constructor injection. Do not run seeds from `onModuleInit`: that runs on every start. See [`examples/nest`](./examples/nest).

## CLI

```
pg-seedbed [run] [options]

  -c, --class <Name>   Run one seeder by class name (default: DatabaseSeeder)
      --config <path>  Config file (default: seedbed.config.{mjs,js,cjs,mts,ts})
      --url-env <VAR>  Environment variable with the connection URL (default: DATABASE_URL)
  -h, --help
  -v, --version
```

Exit codes: `0` success, `1` seeding or configuration failure, `2` invalid usage.

## API

| Export                                | Purpose                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `Seeder`                              | Base class: `run()`, `this.call()`, `this.db`, `this.ids`, `this.random`, `this.log` |
| `runSeeders(options)`                 | Programmatic runner (guard, transaction, rollback)                                   |
| `defineConfig`, `loadConfig`          | Config helpers used by the CLI                                                       |
| `createIds`, `uuidV5`                 | Deterministic UUID v5 ids                                                            |
| `defineFactory`                       | Typed factories with `make`, `makeMany`, `state`, `create`, `createMany`             |
| `upsert`, `quoteTable`, `quoteColumn` | Safe `INSERT ... ON CONFLICT` and identifier validation                              |
| `assertSafeTarget`, `SeedGuardError`  | The environment guard, usable on its own                                             |
| `createRandom`                        | Seeded PRNG (`next`, `int`, `pick`, `bool`)                                          |
| `pg-seedbed/nest`                     | `SeedbedModule.forRoot()`, `SeedbedService`                                          |

All options are typed; see the `.d.ts` files or your editor's autocompletion.

## Compatibility

Node.js 20, 22 and 24 (tested in CI), PostgreSQL 12+ (`ON CONFLICT`; CI runs 16), `pg` 8, NestJS 11. Module resolution must understand `exports` (Node 16+ / bundler).

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md). Report security problems privately as described in [SECURITY.md](./SECURITY.md).

## License

[Apache-2.0](./LICENSE)
