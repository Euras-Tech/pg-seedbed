# NestJS example

Seeders are Nest providers, so constructor injection works. The entry point boots a standalone
application context (no HTTP server) and runs `SeedbedService`.

```bash
export DATABASE_URL=postgres://localhost:5432/myapp_dev
npx tsx examples/nest/seed.ts              # default seeder
npx tsx examples/nest/seed.ts UsersSeeder  # one seeder by class name
```

Add it to your `package.json` as `"seed": "tsx src/seed.ts"`. Do not seed from `onModuleInit`: that would run on every application start.
