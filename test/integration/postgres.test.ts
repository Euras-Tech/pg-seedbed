/* eslint-disable @typescript-eslint/no-extraneous-class -- Nest modules are decorated classes */
import 'reflect-metadata';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli-core';
import { defineFactory } from '../../src/factory';
import { runSeeders } from '../../src/runner';
import { Seeder, silentLogger } from '../../src/seeder';
import { SeedbedModule, SeedbedService } from '../../src/nest';

const URL_ =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:55432/seedbed_test';
const NAMESPACE = '6f1d2c9a-4b7e-4f3a-9c55-2a8e0d7b1c34';
const guard = { allowedDatabases: ['seedbed_test'] };

interface User {
  id: string;
  email: string;
  name: string;
}

const userFactory = defineFactory<User>(({ seq }) => ({
  id: '',
  email: `user${seq}@example.test`,
  name: `User ${seq}`,
}));

class UserSeeder extends Seeder {
  async run(): Promise<void> {
    for (const email of ['a@example.test', 'b@example.test', 'c@example.test']) {
      await userFactory.create(
        this.db,
        'seedbed_it.users',
        { conflict: ['email'] },
        { id: this.ids('user', email), email, name: email.split('@')[0] ?? '' },
      );
    }
  }
}

class DatabaseSeeder extends Seeder {
  async run(): Promise<void> {
    await this.call(UserSeeder);
  }
}

class BrokenSeeder extends Seeder {
  async run(): Promise<void> {
    await this.db.query(
      `INSERT INTO seedbed_it.users (id, email, name) VALUES ($1, 'x@y.test', 'X')`,
      [this.ids('user', 'x')],
    );
    throw new Error('late failure');
  }
}

let admin: pg.Client;

async function users(): Promise<{ id: string; email: string; name: string }[]> {
  const { rows } = await admin.query<User>(
    'SELECT id, email, name FROM seedbed_it.users ORDER BY email',
  );
  return rows;
}

beforeAll(async () => {
  admin = new pg.Client({ connectionString: URL_ });
  await admin.connect();
  await admin.query('DROP SCHEMA IF EXISTS seedbed_it CASCADE');
  await admin.query('CREATE SCHEMA seedbed_it');
  await admin.query(
    'CREATE TABLE seedbed_it.users (id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL)',
  );
});

beforeEach(async () => {
  await admin.query('TRUNCATE seedbed_it.users');
});

afterAll(async () => {
  await admin.query('DROP SCHEMA IF EXISTS seedbed_it CASCADE');
  await admin.end();
});

const options = {
  seeders: [DatabaseSeeder, UserSeeder, BrokenSeeder],
  connectionString: URL_,
  guard,
  idNamespace: NAMESPACE,
  logger: silentLogger,
};

describe('runSeeders against Postgres', () => {
  it('seeds, and is idempotent when run again', async () => {
    await runSeeders(options);
    const first = await users();
    await runSeeders(options);
    expect(await users()).toEqual(first);
    expect(first.map((user) => user.email)).toEqual([
      'a@example.test',
      'b@example.test',
      'c@example.test',
    ]);
  });

  it('keeps ids deterministic across a full wipe and reseed', async () => {
    await runSeeders(options);
    const before = await users();
    await admin.query('TRUNCATE seedbed_it.users');
    await runSeeders(options);
    expect(await users()).toEqual(before);
  });

  it('refreshes changed values on re-run', async () => {
    await runSeeders(options);
    await admin.query(`UPDATE seedbed_it.users SET name = 'tampered'`);
    await runSeeders(options);
    expect((await users()).map((user) => user.name)).toEqual(['a', 'b', 'c']);
  });

  it('runs one seeder by class name', async () => {
    const result = await runSeeders({ ...options, seeder: 'UserSeeder' });
    expect(result.ran).toEqual(['UserSeeder']);
    expect(await users()).toHaveLength(3);
  });

  it('rolls everything back when a seeder fails late', async () => {
    await expect(runSeeders({ ...options, seeder: 'BrokenSeeder' })).rejects.toThrow(
      'late failure',
    );
    expect(await users()).toHaveLength(0);
  });

  it('refuses a database outside the allow-list, before seeding anything', async () => {
    await expect(
      runSeeders({ ...options, guard: { allowedDatabases: ['other'] } }),
    ).rejects.toThrow('not in allowedDatabases');
    expect(await users()).toHaveLength(0);
  });
});

describe('pg-seedbed CLI against Postgres', () => {
  it('runs the config from disk, twice, with the same result', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pg-seedbed-cli-'));
    try {
      await writeFile(
        join(dir, 'seedbed.config.mjs'),
        `class DatabaseSeeder {
          attach(context) { this.context = context; }
          async run() {
            await this.context.db.query(
              "INSERT INTO seedbed_it.users (id, email, name) VALUES ($1, 'cli@example.test', 'CLI') ON CONFLICT (email) DO NOTHING",
              [this.context.ids('user', 'cli')],
            );
          }
        }
        export default { seeders: [DatabaseSeeder], idNamespace: '${NAMESPACE}', guard: { allowedDatabases: ['seedbed_test'] } };`,
      );
      const out: string[] = [];
      const io = {
        cwd: dir,
        env: { DATABASE_URL: URL_ },
        out: (m: string) => out.push(m),
        err: (m: string) => out.push(m),
        version: 'test',
      };
      expect(await runCli(['run'], io)).toBe(0);
      expect(await runCli([], io)).toBe(0);
      expect(await users()).toHaveLength(1);
      expect(out.join('\n')).toContain('Done: DatabaseSeeder');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

const TABLE_NAME = Symbol('TABLE_NAME');

@Injectable()
class NestUserSeeder extends Seeder {
  constructor(@Inject(TABLE_NAME) private readonly table: string) {
    super();
  }

  async run(): Promise<void> {
    await userFactory.create(
      this.db,
      this.table,
      { conflict: ['email'] },
      { id: this.ids('user', 'nest'), email: 'nest@example.test', name: 'Nest' },
    );
  }
}

@Module({
  providers: [{ provide: TABLE_NAME, useValue: 'seedbed_it.users' }],
  exports: [TABLE_NAME],
})
class TableModule {}

@Module({
  imports: [
    SeedbedModule.forRoot({
      imports: [TableModule],
      seeders: [NestUserSeeder],
      defaultSeeder: NestUserSeeder,
      connectionString: URL_,
      guard,
      idNamespace: NAMESPACE,
      logger: silentLogger,
    }),
  ],
})
class NestAppModule {}

describe('SeedbedModule against Postgres', () => {
  it('runs a seeder that uses injected providers, idempotently', async () => {
    const app = await NestFactory.createApplicationContext(NestAppModule, {
      logger: false,
      abortOnError: false,
    });
    try {
      const service = app.get(SeedbedService);
      await service.run();
      await service.run();
      expect(await users()).toEqual([
        expect.objectContaining({ email: 'nest@example.test', name: 'Nest' }),
      ]);
    } finally {
      await app.close();
    }
  });
});
