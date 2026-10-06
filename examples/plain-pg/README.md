# Plain `pg` example (Laravel layout)

```
database/
  schema.sql                 your migrations live wherever you like
  factories/UserFactory.ts   factories
  seeders/DatabaseSeeder.ts  entry point, found automatically
  seeders/UserSeeder.ts      found automatically, no list to maintain
seedbed.config.ts            optional: idNamespace and guard
```

```bash
createdb myapp_dev && psql myapp_dev -f database/schema.sql
export DATABASE_URL=postgres://localhost:5432/myapp_dev

NODE_OPTIONS='--import tsx' pg-seedbed run                      # DatabaseSeeder
NODE_OPTIONS='--import tsx' pg-seedbed run --class UserSeeder   # one seeder
```

Run it twice: the second run changes nothing, and the ids are identical.
