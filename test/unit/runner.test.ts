import { describe, expect, it } from 'vitest';
import { runSeeders } from '../../src/runner';
import { Seeder, silentLogger } from '../../src/seeder';
import { fakeDb } from './helpers';

const NAMESPACE = '6f1d2c9a-4b7e-4f3a-9c55-2a8e0d7b1c34';
const events: string[] = [];

class UserSeeder extends Seeder {
  async run(): Promise<void> {
    events.push('users');
    await this.db.query('SELECT users');
  }
}

class PostSeeder extends Seeder {
  async run(): Promise<void> {
    events.push('posts');
    await this.db.query('SELECT posts');
  }
}

class DatabaseSeeder extends Seeder {
  async run(): Promise<void> {
    await this.call(UserSeeder, PostSeeder);
  }
}

class FailingSeeder extends Seeder {
  async run(): Promise<void> {
    await this.db.query('SELECT fail');
    throw new Error('seed failed');
  }
}

const base = { seeders: [DatabaseSeeder, UserSeeder, PostSeeder], logger: silentLogger };

describe('runSeeders', () => {
  it('runs the DatabaseSeeder by default, in order, inside one transaction', async () => {
    events.length = 0;
    const { db, calls } = fakeDb();
    const result = await runSeeders({ ...base, client: db });
    expect(events).toEqual(['users', 'posts']);
    expect(result).toMatchObject({
      entry: 'DatabaseSeeder',
      ran: ['DatabaseSeeder', 'UserSeeder', 'PostSeeder'],
    });
    expect(calls.map((call) => call.text)).toEqual([
      'BEGIN',
      'SELECT users',
      'SELECT posts',
      'COMMIT',
    ]);
  });

  it('runs a single seeder by class name', async () => {
    events.length = 0;
    const { db } = fakeDb();
    const result = await runSeeders({ ...base, client: db, seeder: 'PostSeeder' });
    expect(events).toEqual(['posts']);
    expect(result.entry).toBe('PostSeeder');
  });

  it('prefers an explicit defaultSeeder', async () => {
    const { db } = fakeDb();
    const result = await runSeeders({ ...base, client: db, defaultSeeder: UserSeeder });
    expect(result.entry).toBe('UserSeeder');
  });

  it('rolls back and rethrows when a seeder fails', async () => {
    const { db, calls } = fakeDb();
    await expect(
      runSeeders({
        seeders: [FailingSeeder],
        defaultSeeder: FailingSeeder,
        client: db,
        logger: silentLogger,
      }),
    ).rejects.toThrow('seed failed');
    expect(calls.map((call) => call.text)).toEqual(['BEGIN', 'SELECT fail', 'ROLLBACK']);
  });

  it('can run without a transaction', async () => {
    const { db, calls } = fakeDb();
    await runSeeders({ ...base, client: db, transaction: 'none' });
    expect(calls.map((call) => call.text)).not.toContain('BEGIN');
  });

  it('fails fast on bad selection, before touching the database', async () => {
    const { db, calls } = fakeDb();
    await expect(runSeeders({ ...base, client: db, seeder: 'Nope' })).rejects.toThrow(
      'Unknown seeder "Nope"',
    );
    await expect(runSeeders({ seeders: [UserSeeder], client: db })).rejects.toThrow(
      'No default seeder',
    );
    await expect(runSeeders({ seeders: [UserSeeder, UserSeeder], client: db })).rejects.toThrow(
      'Duplicate',
    );
    expect(calls).toHaveLength(0);
  });

  it('detects circular calls', async () => {
    class A extends Seeder {
      async run(): Promise<void> {
        await this.call(B);
      }
    }
    class B extends Seeder {
      async run(): Promise<void> {
        await this.call(A);
      }
    }
    const { db } = fakeDb();
    await expect(
      runSeeders({ seeders: [A, B], defaultSeeder: A, client: db, logger: silentLogger }),
    ).rejects.toThrow('Circular seeder call: A -> B -> A');
  });

  it('exposes deterministic ids and random, and requires a namespace for ids', async () => {
    const seen: string[] = [];
    class IdSeeder extends Seeder {
      async run(): Promise<void> {
        seen.push(this.ids('user', 'a'), String(this.random.int(0, 1_000_000)));
        await Promise.resolve();
      }
    }
    const options = { seeders: [IdSeeder], defaultSeeder: IdSeeder, logger: silentLogger };
    await runSeeders({ ...options, client: fakeDb().db, idNamespace: NAMESPACE });
    await runSeeders({ ...options, client: fakeDb().db, idNamespace: NAMESPACE });
    expect(seen.slice(0, 2)).toEqual(seen.slice(2, 4));

    await expect(runSeeders({ ...options, client: fakeDb().db })).rejects.toThrow('idNamespace');
  });

  it('supports a custom resolver (dependency injection)', async () => {
    const created: string[] = [];
    const { db } = fakeDb();
    await runSeeders({
      ...base,
      client: db,
      resolve: (cls) => {
        created.push(cls.name);
        return new (cls as new () => Seeder)();
      },
    });
    expect(created).toEqual(['DatabaseSeeder', 'UserSeeder', 'PostSeeder']);
  });

  it('refuses an unguarded target before connecting and never echoes the password', async () => {
    const attempt = runSeeders({
      ...base,
      connectionString: 'postgres://user:s3cr3t@prod.example.com/app',
    });
    await expect(attempt).rejects.toThrow('Refusing to seed remote host');
    await attempt.catch((error: unknown) => expect(String(error)).not.toContain('s3cr3t'));
  });

  it('needs a connection', async () => {
    await expect(runSeeders(base)).rejects.toThrow('connectionString');
  });

  it('refuses to run a seeder that was never attached', async () => {
    const lonely = new UserSeeder();
    await expect(lonely.run()).rejects.toThrow('not attached');
  });
});
