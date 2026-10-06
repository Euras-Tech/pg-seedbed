# Plain `pg` example

```bash
createdb myapp_dev && psql myapp_dev -f schema.sql
export DATABASE_URL=postgres://localhost:5432/myapp_dev

NODE_OPTIONS='--import tsx' pg-seedbed run                      # DatabaseSeeder
NODE_OPTIONS='--import tsx' pg-seedbed run --class UserSeeder   # one seeder
```

Run it twice: the second run changes nothing, and the ids are identical.
