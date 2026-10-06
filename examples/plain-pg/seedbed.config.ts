import { defineConfig } from 'pg-seedbed';
import { DatabaseSeeder, UserSeeder } from './seeders';

export default defineConfig({
  seeders: [DatabaseSeeder, UserSeeder],
  // Any fixed UUID, unique to your project. Never change it: it determines every id.
  idNamespace: '6f1d2c9a-4b7e-4f3a-9c55-2a8e0d7b1c34',
  guard: { allowedDatabases: ['myapp_dev', 'myapp_test'] },
});
