# pg-seedbed

Laravel-style **seeders and factories for Node.js and PostgreSQL**. Same folder layout, same commands, same ideas as Laravel's [database seeding](https://laravel.com/docs/12.x/seeding), plus deterministic ids, idempotent upserts and safety guards.

- **`database/seeders/`** with a `DatabaseSeeder` entry point, discovered automatically. No list to maintain.
- **`pg-seedbed run`** (`db:seed`), **`--class`**, **`make:seeder`**, and a production prompt with **`--force`**.
- **`this.call()`, `callOnce()`, `callSilent()`** to compose seeders, with per-seeder timing output.
- **Factories** with `state`, `sequence`, `afterMaking`, `afterCreating` and `has` (relations).
- **Deterministic ids** (UUID v5 from a natural key): the same user has the same id on every machine.
- **Idempotent by construction**: writes are `INSERT ... ON CONFLICT`, so seeding twice is safe.
- **Secure by default**: refuses production/staging, remote hosts and unlisted databases. Values are bound parameters; identifiers are validated, never interpolated.
- **No ORM, no runtime dependencies**: just `pg`. Works beside Prisma, Drizzle, Knex, TypeORM or raw SQL. First-class NestJS module.

## Install

`pg-seedbed` is not on npm yet. Install it straight from GitHub, pinned to a commit so builds are reproducible (it is built on install):

```bash
npm i -D github:Euras-Tech/pg-seedbed#<commit-sha> pg
```

With **pnpm 10**, allow the build of the git-hosted package once, in your `pnpm-workspace.yaml`:

```yaml
onlyBuiltDependencies:
  - pg-seedbed
```

```bash
pnpm add -D github:Euras-Tech/pg-seedbed#<commit-sha> pg
```

After the npm release this becomes `pnpm add -D pg-seedbed pg` (and the allowlist is no longer needed).

Requires Node.js 20+ and `pg` 8. The NestJS module (`pg-seedbed/nest`) also needs `@nestjs/common` and `@nestjs/core` 11 installed.

## Quick start

```bash
npx pg-seedbed make:seeder UserSeeder     # creates database/seeders/UserSeeder.ts (.mjs without a tsconfig.json)
```

```
database/
  factories/UserFactory.ts      factories (convention)
  seeders/DatabaseSeeder.ts     the entry point, run by default
  seeders/UserSeeder.ts         every seeder in this folder is discovered automatically
seedbed.config.ts               optional: idNamespace, guard
```

`database/factories/UserFactory.ts`

```ts
import { defineFactory, type Ids } from 'pg-seedbed';

export const userFactory = (ids: Ids) =>
  defineFactory(({ seq }) => {
    const email = `user${seq}@example.test`;
    return { id: ids('user', email), email, full_name: `User ${seq}` };
  });
```

`database/seeders/UserSeeder.ts`

```ts
import { Seeder } from 'pg-seedbed';
import { userFactory } from '../factories/UserFactory';

export class UserSeeder extends Seeder {
  async run(): Promise<void> {
    await userFactory(this.ids).createMany(this.db, 'users', { conflict: ['email'] }, 50);
  }
}
```

`database/seeders/DatabaseSeeder.ts`

```ts
import { Seeder } from 'pg-seedbed';
import { PostSeeder } from './PostSeeder';
import { UserSeeder } from './UserSeeder';

export class DatabaseSeeder extends Seeder {
  async run(): Promise<void> {
    await this.call([UserSeeder, PostSeeder]); // controls the seeding order
  }
}
```

`seedbed.config.ts` (optional)

```ts
import { defineConfig } from 'pg-seedbed';

export default defineConfig({
  idNamespace: '6f1d2c9a-4b7e-4f3a-9c55-2a8e0d7b1c34', // any fixed UUID, unique to your project
  guard: { allowedDatabases: ['myapp_dev', 'myapp_test'] },
});
```

Run it:

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/myapp_dev

pg-seedbed run                       # DatabaseSeeder, like `php artisan db:seed`
pg-seedbed run --class UserSeeder    # one seeder, like `db:seed --class=UserSeeder`
```

```
[pg-seedbed] Seeding DatabaseSeeder
[pg-seedbed] Seeding UserSeeder
[pg-seedbed] Seeded UserSeeder (12 ms)
[pg-seedbed] Seeded DatabaseSeeder (14 ms)
Done: DatabaseSeeder (2 seeder(s), 14 ms).
```

TypeScript files run through [`tsx`](https://tsx.is): `NODE_OPTIONS='--import tsx' pg-seedbed run` (Node 22.18+ can also load `.ts` natively). Plain `.mjs`/`.js`/`.cjs` seeders need nothing extra. Complete examples are in [`examples/`](./examples).

## Laravel mapping

| Laravel                                | pg-seedbed                                                     |
| -------------------------------------- | -------------------------------------------------------------- |
| `database/seeders/`, `DatabaseSeeder`  | `database/seeders/`, `DatabaseSeeder` (auto-discovered)        |
| `php artisan make:seeder UserSeeder`   | `pg-seedbed make:seeder UserSeeder`                            |
| `class UserSeeder extends Seeder`      | `class UserSeeder extends Seeder`                              |
| `public function run()`                | `async run()`                                                  |
| `$this->call([A::class, B::class])`    | `await this.call([A, B])` (or `this.call(A, B)`)               |
| `$this->callOnce(A::class)`            | `await this.callOnce(A)`                                       |
| `$this->callSilent(A::class)`          | `await this.callSilent(A)`                                     |
| `php artisan db:seed`                  | `pg-seedbed run`                                               |
| `db:seed --class=UserSeeder`           | `pg-seedbed run --class UserSeeder`                            |
| `db:seed --force` (production prompt)  | `pg-seedbed run --force` (prompt on a terminal)                |
| `DB::table('users')->insert([...])`    | `this.db.query(...)` or `upsert(this.db, 'users', {...}, ...)` |
| `User::factory()->count(50)->create()` | `factory.createMany(db, 'users', { conflict }, 50)`            |
| `->state([...])`                       | `factory.state({ ... })`                                       |
| `->sequence(...)`                      | `factory.sequence(a, b, c)`                                    |
| `->has(Post::factory()->count(2))`     | `factory.has(posts, { table, upsert, count: 2, link })`        |
| `afterMaking()`, `afterCreating()`     | `factory.afterMaking(cb)`, `factory.afterCreating(cb)`         |
| `updateOrCreate()` idiom               | `upsert()` / `factory.create()`: always idempotent             |
| Type-hinted `run()` dependencies       | NestJS constructor injection (see below)                       |
| `migrate:fresh --seed`                 | Not included: run your migration tool, then `pg-seedbed run`   |
| `WithoutModelEvents`, mass assignment  | Not applicable: there are no models                            |

Differences by design: there is **no seed tracking table** (seeders are idempotent upserts), and ids are deterministic.

## Writing seeders

Inside `run()` you have `this.db` (a `pg` client in one transaction), `this.ids(...)`, `this.random`, `this.log` and:

```ts
await this.call(UserSeeder, PostSeeder); // in order, one by one or as arrays
await this.callOnce(RolesSeeder); // skipped if already run through callOnce in this run
await this.callSilent(NoisySeeder); // without its own output
```

The whole run is one transaction: if any seeder fails, everything is rolled back.

## Factories

```ts
const posts = defineFactory<Post>(({ seq, rand }) => ({
  id: ids('post', String(seq)),
  title: `Post ${seq}`,
  views: rand.int(0, 1000), // reproducible: row N always gets the same value
  user_id: '',
}));

const users = defineFactory<User>(({ seq }) => ({ id: ids('user', String(seq)), role: 'member' }))
  .sequence({ role: 'admin' }, { role: 'editor' }, { role: 'member' }) // cycles row by row
  .afterMaking((user) => {
    user.email = user.email.toLowerCase(); // before storing
  })
  .has(posts, {
    // 2 posts per user
    table: 'posts',
    upsert: { conflict: ['id'] },
    count: 2,
    link: (user) => ({ user_id: user.id }),
  });

await users.createMany(this.db, 'users', { conflict: ['id'] }, 50); // 50 users, 100 posts
```

`make()`/`makeMany()` build rows in memory, `state()` adds reusable variations, `afterCreating((row, db) => ...)` runs after the upsert. Randomness is a small seeded PRNG, so data is reproducible without a faker dependency (use faker if you like: call `faker.seed(...)` inside the definition).

## Deterministic ids

```ts
import { createIds } from 'pg-seedbed';

const ids = createIds('6f1d2c9a-4b7e-4f3a-9c55-2a8e0d7b1c34');
ids('user', 'awa@example.test'); // same UUID v5, always
```

Inside a seeder use `this.ids(...)` (set `idNamespace` in the config). Key parts are encoded unambiguously, so `('a:b', 'c')` never collides with `('a', 'b:c')`. Pick **one namespace per project and never change it**: changing it changes every id.

## Safety model

Before connecting, `pg-seedbed` checks the target:

- refuses when `NODE_ENV` or `APP_ENV` is `production` or `staging` (configurable);
- refuses any host that is not `localhost`, `127.0.0.1`, `::1` or a Unix socket, unless you list it in `allowedHosts` (for example a Docker Compose service name such as `db`);
- with `allowedDatabases`, refuses any other database name. **Set it.** It stops a copied `DATABASE_URL` from seeding the wrong database;
- error messages never contain credentials.

**Production, like Laravel:** on a terminal the CLI asks for confirmation when the environment is production or staging; in scripts and CI it fails and tells you to pass `--force`. `--force` (`guard: { force: true }`) skips **only the environment check**. The host and database checks still apply, so a remote production database must also be listed in `allowedHosts` and `allowedDatabases`. Nothing seeds production by accident.

If you pass your own `client` instead of a `connectionString` to `runSeeders`, the guard is skipped and the target is your responsibility.

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

Seeders are Nest providers, so constructor injection works (Laravel's type-hinted `run()` dependencies). Nest registers providers explicitly, so the module takes a `seeders` list instead of discovering files. Do not run seeds from `onModuleInit`: that runs on every start. See [`examples/nest`](./examples/nest).

## CLI

```
pg-seedbed [run] [options]       Run the seeders
pg-seedbed make:seeder <Name>    Create database/seeders/<Name>.ts (or .mjs without tsconfig.json)

  -c, --class <Name>   Run one seeder by class name (default: DatabaseSeeder)
      --force          Seed even when NODE_ENV/APP_ENV is production or staging
      --config <path>  Config file (default: seedbed.config.{mjs,js,cjs,mts,ts}, optional)
      --url-env <VAR>  Environment variable with the connection URL (default: DATABASE_URL)
  -h, --help
  -v, --version
```

Config options: `seedersDir` (default `database/seeders`), `seeders` (explicit list instead of discovery), `defaultSeeder`, `connectionEnv`, `guard`, `idNamespace`, `randomSeed`, `transaction`.

Exit codes: `0` success, `1` seeding or configuration failure, `2` invalid usage.

## API

| Export                                    | Purpose                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Seeder`                                  | Base class: `run()`, `call`, `callOnce`, `callSilent`, `db`, `ids`, `random`, `log`                               |
| `runSeeders(options)`                     | Programmatic runner (guard, transaction, rollback)                                                                |
| `discoverSeeders(dir)`, `makeSeeder(...)` | What the CLI uses for discovery and `make:seeder`                                                                 |
| `defineConfig`, `loadConfig`              | Config helpers used by the CLI                                                                                    |
| `createIds`, `uuidV5`                     | Deterministic UUID v5 ids                                                                                         |
| `defineFactory`                           | Factories: `make`, `makeMany`, `state`, `sequence`, `afterMaking`, `afterCreating`, `has`, `create`, `createMany` |
| `upsert`, `quoteTable`, `quoteColumn`     | Safe `INSERT ... ON CONFLICT` and identifier validation                                                           |
| `assertSafeTarget`, `SeedGuardError`      | The environment guard, usable on its own                                                                          |
| `createRandom`                            | Seeded PRNG (`next`, `int`, `pick`, `bool`)                                                                       |
| `pg-seedbed/nest`                         | `SeedbedModule.forRoot()`, `SeedbedService`                                                                       |

All options are typed; see the `.d.ts` files or your editor's autocompletion.

## Compatibility

Node.js 20, 22 and 24 (tested in CI), PostgreSQL 12+ (`ON CONFLICT`; CI runs 16), `pg` 8, NestJS 11. Module resolution must understand `exports` (Node 16+ / bundler).

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md). Report security problems privately as described in [SECURITY.md](./SECURITY.md).

## License

[Apache-2.0](./LICENSE)
