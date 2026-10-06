import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli-core';

const URL_ =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:55432/seedbed_test';
const NAMESPACE = '6f1d2c9a-4b7e-4f3a-9c55-2a8e0d7b1c34';

let admin: pg.Client;
let dir: string;

beforeAll(async () => {
  admin = new pg.Client({ connectionString: URL_ });
  await admin.connect();
  await admin.query('DROP SCHEMA IF EXISTS seedbed_disc CASCADE');
  await admin.query('CREATE SCHEMA seedbed_disc');
  await admin.query(
    'CREATE TABLE seedbed_disc.users (id uuid PRIMARY KEY, email text UNIQUE NOT NULL)',
  );
  dir = await mkdtemp(join(tmpdir(), 'pg-seedbed-disc-'));
});

beforeEach(async () => {
  await admin.query('TRUNCATE seedbed_disc.users');
});

afterAll(async () => {
  await admin.query('DROP SCHEMA IF EXISTS seedbed_disc CASCADE');
  await admin.end();
  await rm(dir, { recursive: true, force: true });
});

const seeder = (name: string, body: string) =>
  `export class ${name} {
    attach(context) { this.context = context; }
    async run() { ${body} }
  }\n`;

async function run(args: string[], config?: string) {
  const out: string[] = [];
  const io = {
    cwd: dir,
    env: { DATABASE_URL: URL_ },
    out: (m: string) => out.push(m),
    err: (m: string) => out.push(m),
    version: 'test',
  };
  if (config) await writeFile(join(dir, 'seedbed.config.mjs'), config);
  return { code: await runCli(args, io), out: out.join('\n') };
}

describe('Laravel-style layout, no config file', () => {
  it('discovers database/seeders, runs DatabaseSeeder and the seeders it calls', async () => {
    await mkdir(join(dir, 'database/seeders'), { recursive: true });
    await writeFile(
      join(dir, 'database/seeders/UserSeeder.mjs'),
      seeder(
        'UserSeeder',
        `await this.context.db.query(
          "INSERT INTO seedbed_disc.users (id, email) VALUES ($1, 'disc@example.test') ON CONFLICT (email) DO NOTHING",
          [this.context.ids('user', 'disc')],
        );`,
      ),
    );
    // DatabaseSeeder reaches UserSeeder through the context's call(), by class.
    await writeFile(
      join(dir, 'database/seeders/DatabaseSeeder.mjs'),
      `import { UserSeeder } from './UserSeeder.mjs';
      export class DatabaseSeeder {
        attach(context) { this.context = context; }
        async run() { await this.context.call(UserSeeder); }
      }\n`,
    );

    // Without idNamespace, ids() is unavailable: the run fails and rolls back.
    const noNamespace = await run([]);
    expect(noNamespace.code).toBe(1);
    expect(noNamespace.out).toContain('idNamespace');

    // The config is optional in general, but this seeder needs a namespace.
    const first = await run(
      [],
      `export default { idNamespace: '${NAMESPACE}', guard: { allowedDatabases: ['seedbed_test'] } };`,
    );
    expect(first.code).toBe(0);
    expect(first.out).toContain('Seeding DatabaseSeeder');
    expect(first.out).toContain('Seeding UserSeeder');
    expect((await admin.query('SELECT 1 FROM seedbed_disc.users')).rowCount).toBe(1);

    const again = await run([]);
    expect(again.code).toBe(0);
    expect((await admin.query('SELECT 1 FROM seedbed_disc.users')).rowCount).toBe(1);

    const single = await run(['--class', 'UserSeeder']);
    expect(single.code).toBe(0);
    expect(single.out).not.toContain('Seeding DatabaseSeeder');
  });
});
