import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../../src/cli-core';
import { defineFactory } from '../../src/factory';
import { assertSafeTarget, type SeedGuardError } from '../../src/guard';
import { makeSeeder } from '../../src/make';
import { runSeeders } from '../../src/runner';
import { Seeder, type Logger } from '../../src/seeder';
import { fakeDb } from './helpers';

function recordingLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  const push = (message: string) => lines.push(message);
  return { logger: { info: push, warn: push, error: push }, lines };
}

class UserSeeder extends Seeder {
  async run(): Promise<void> {
    await Promise.resolve();
  }
}
class PostSeeder extends Seeder {
  async run(): Promise<void> {
    await Promise.resolve();
  }
}

describe('call, callOnce, callSilent', () => {
  it('call() accepts arrays and varargs, in order', async () => {
    class DatabaseSeeder extends Seeder {
      async run(): Promise<void> {
        await this.call([UserSeeder, PostSeeder]);
        await this.call(UserSeeder);
      }
    }
    const { logger } = recordingLogger();
    const result = await runSeeders({
      seeders: [DatabaseSeeder, UserSeeder, PostSeeder],
      client: fakeDb().db,
      logger,
    });
    expect(result.ran).toEqual(['DatabaseSeeder', 'UserSeeder', 'PostSeeder', 'UserSeeder']);
  });

  it('callOnce() skips seeders it already ran in this run', async () => {
    class DatabaseSeeder extends Seeder {
      async run(): Promise<void> {
        await this.callOnce(UserSeeder);
        await this.callOnce([UserSeeder, PostSeeder]);
        await this.callOnce(UserSeeder);
      }
    }
    const result = await runSeeders({
      seeders: [DatabaseSeeder, UserSeeder, PostSeeder],
      client: fakeDb().db,
      logger: recordingLogger().logger,
    });
    expect(result.ran).toEqual(['DatabaseSeeder', 'UserSeeder', 'PostSeeder']);
  });

  it('callSilent() runs the seeder without its own output', async () => {
    class DatabaseSeeder extends Seeder {
      async run(): Promise<void> {
        await this.callSilent(UserSeeder);
        await this.call(PostSeeder);
      }
    }
    const { logger, lines } = recordingLogger();
    const result = await runSeeders({
      seeders: [DatabaseSeeder, UserSeeder, PostSeeder],
      client: fakeDb().db,
      logger,
    });
    expect(result.ran).toContain('UserSeeder');
    expect(lines.some((line) => line.includes('UserSeeder'))).toBe(false);
    expect(lines.some((line) => line.includes('PostSeeder'))).toBe(true);
  });

  it('reports each seeder with its duration, Laravel-style', async () => {
    const { logger, lines } = recordingLogger();
    await runSeeders({
      seeders: [UserSeeder],
      defaultSeeder: UserSeeder,
      client: fakeDb().db,
      logger,
    });
    expect(lines).toEqual([
      'Seeding UserSeeder',
      expect.stringMatching(/^Seeded UserSeeder \(\d+ ms\)$/),
    ]);
  });
});

describe('factory relations, callbacks and sequences', () => {
  interface User {
    id: number;
    role: string;
  }
  interface Post {
    id: number;
    user_id: number;
  }
  const users = () => defineFactory<User>(({ seq }) => ({ id: seq + 1, role: 'member' }));
  const posts = () => defineFactory<Post>(({ seq }) => ({ id: seq + 1, user_id: 0 }));

  it('sequence() cycles through the entries, objects and functions alike', () => {
    const roles = users().sequence({ role: 'admin' }, ({ seq }) => ({ role: `editor${seq}` }), {
      role: 'guest',
    });
    expect(roles.makeMany(5).map((user) => user.role)).toEqual([
      'admin',
      'editor1',
      'guest',
      'admin',
      'editor4',
    ]);
    expect(() => users().sequence()).toThrow('at least one');
  });

  it('afterMaking() mutates every made row, also through make()', () => {
    const factory = users().afterMaking((row) => {
      row.role = row.role.toUpperCase();
    });
    expect(factory.make().role).toBe('MEMBER');
    expect(users().make().role).toBe('member');
  });

  it('afterCreating() runs after the upsert, in registration order', async () => {
    const { db, calls } = fakeDb();
    const order: string[] = [];
    const factory = users()
      .afterCreating(() => {
        order.push('first');
      })
      .afterCreating(async (row, client) => {
        order.push('second');
        await client.query('SELECT after', [row.id]);
      });
    await factory.create(db, 'users', { conflict: ['id'] });
    expect(order).toEqual(['first', 'second']);
    expect(calls.map((call) => call.text.slice(0, 11))).toEqual(['INSERT INTO', 'SELECT afte']);
  });

  it('has() creates related rows for every created parent', async () => {
    const { db, calls } = fakeDb();
    const parents = users().has(posts(), {
      table: 'posts',
      upsert: { conflict: ['id'] },
      count: 2,
      link: (user) => ({ user_id: user.id }),
    });
    await parents.createMany(db, 'users', { conflict: ['id'] }, 2);

    const inserted = calls.map(
      (call) => `${call.text.match(/INTO "(\w+)"/)?.[1]}:${String(call.values)}`,
    );
    expect(inserted).toEqual([
      'users:1,member',
      'posts:1,1',
      'posts:2,1',
      'users:2,member',
      'posts:3,2',
      'posts:4,2',
    ]);
  });

  it('has() defaults to one child per parent', async () => {
    const { db, calls } = fakeDb();
    await users()
      .has(posts(), {
        table: 'posts',
        upsert: { conflict: ['id'] },
        link: (user) => ({ user_id: user.id }),
      })
      .create(db, 'users', { conflict: ['id'] });
    expect(calls).toHaveLength(2);
  });
});

describe('guard --force', () => {
  const local = 'postgres://u:p@localhost/app';

  it('skips only the environment check', () => {
    expect(() =>
      assertSafeTarget(local, { force: true }, { NODE_ENV: 'production' }),
    ).not.toThrow();
    expect(() =>
      assertSafeTarget(
        'postgres://u:p@prod.example.com/app',
        { force: true },
        { NODE_ENV: 'production' },
      ),
    ).toThrow('remote host');
    expect(() =>
      assertSafeTarget(
        local,
        { force: true, allowedDatabases: ['other'] },
        { NODE_ENV: 'production' },
      ),
    ).toThrow('allowedDatabases');
  });

  it('tags each refusal with a reason', () => {
    const reason = (url: string, env: Record<string, string> = {}, policy = {}) => {
      try {
        assertSafeTarget(url, policy, env);
      } catch (error) {
        return (error as SeedGuardError).reason;
      }
    };
    expect(reason(local, { NODE_ENV: 'production' })).toBe('environment');
    expect(reason('mysql://x/y')).toBe('url');
    expect(reason('postgres://u:p@prod.example.com/app')).toBe('host');
    expect(reason(local, {}, { allowedDatabases: ['nope'] })).toBe('database');
  });
});

describe('makeSeeder', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pg-seedbed-make-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes a TypeScript or JavaScript stub, creating the directory', async () => {
    const ts = await makeSeeder({
      name: 'UserSeeder',
      directory: join(dir, 'a/b'),
      typescript: true,
    });
    expect(ts).toBe(join(dir, 'a/b/UserSeeder.ts'));
    expect(await readFile(ts, 'utf8')).toContain('export class UserSeeder extends Seeder');
    const js = await makeSeeder({ name: 'PostSeeder', directory: dir, typescript: false });
    expect(js).toBe(join(dir, 'PostSeeder.mjs'));
    expect(await readFile(js, 'utf8')).not.toContain('Promise<void>');
  });

  it('never overwrites an existing file', async () => {
    await writeFile(join(dir, 'UserSeeder.ts'), 'mine');
    await expect(
      makeSeeder({ name: 'UserSeeder', directory: dir, typescript: true }),
    ).rejects.toThrow('already exists');
    expect(await readFile(join(dir, 'UserSeeder.ts'), 'utf8')).toBe('mine');
  });

  it.each(['../Evil', 'a/b', 'User Seeder', '1Seeder', ''])('rejects the name %j', async (name) => {
    await expect(makeSeeder({ name, directory: dir, typescript: true })).rejects.toThrow(
      'Invalid seeder name',
    );
  });
});

describe('CLI: make:seeder, --force and the production prompt', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pg-seedbed-cli-parity-'));
    await mkdir(join(dir, 'database/seeders'), { recursive: true });
    await writeFile(
      join(dir, 'database/seeders/DatabaseSeeder.mjs'),
      'export class DatabaseSeeder { attach() {} async run() {} }',
    );
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function io(env: Record<string, string>, confirm?: CliIo['confirm']) {
    const out: string[] = [];
    const err: string[] = [];
    const value: CliIo = {
      cwd: dir,
      env,
      out: (m) => out.push(m),
      err: (m) => err.push(m),
      version: 't',
      ...(confirm ? { confirm } : {}),
    };
    return { io: value, out, err };
  }

  it('make:seeder creates a .mjs stub, or .ts when a tsconfig.json exists', async () => {
    const first = io({});
    expect(await runCli(['make:seeder', 'UserSeeder'], first.io)).toBe(0);
    expect(first.out[0]).toBe('Seeder created: database/seeders/UserSeeder.mjs');

    await writeFile(join(dir, 'tsconfig.json'), '{}');
    const second = io({});
    expect(await runCli(['make:seeder', 'PostSeeder'], second.io)).toBe(0);
    expect(second.out[0]).toBe('Seeder created: database/seeders/PostSeeder.ts');

    const again = io({});
    expect(await runCli(['make:seeder', 'PostSeeder'], again.io)).toBe(1);
    expect(again.err[0]).toContain('already exists');
    expect(await runCli(['make:seeder'], io({}).io)).toBe(2);
    expect(await runCli(['make:seeder', 'A', 'B'], io({}).io)).toBe(2);
  });

  const production = { DATABASE_URL: 'postgres://u:p@localhost/app', NODE_ENV: 'production' };

  it('points at --force when production seeding is refused without a terminal', async () => {
    const run = io(production);
    expect(await runCli(['run'], run.io)).toBe(1);
    expect(run.err[0]).toContain(
      'Refusing to seed: NODE_ENV=production. Use --force to run anyway.',
    );
  });

  it('asks for confirmation on a terminal, and aborts on no', async () => {
    const questions: string[] = [];
    const run = io(production, (question) => {
      questions.push(question);
      return Promise.resolve(false);
    });
    expect(await runCli(['run'], run.io)).toBe(1);
    expect(questions[0]).toContain('Run the seeders anyway?');
    expect(run.err).toContain('Aborted.');
  });

  it('--force skips the environment check but still enforces the host check', async () => {
    const remote = io({ ...production, DATABASE_URL: 'postgres://u:p@prod.example.com/app' });
    expect(await runCli(['run', '--force'], remote.io)).toBe(1);
    expect(remote.err[0]).toContain('Refusing to seed remote host');
  });

  it('a confirmed prompt retries with force, and other guard failures are not prompted', async () => {
    let asked = 0;
    const confirm = () => {
      asked++;
      return Promise.resolve(true);
    };
    const remote = io(
      { ...production, DATABASE_URL: 'postgres://u:p@prod.example.com/app' },
      confirm,
    );
    expect(await runCli(['run'], remote.io)).toBe(1);
    expect(asked).toBe(1);
    expect(remote.err[0]).toContain('Refusing to seed remote host');

    asked = 0;
    const hostOnly = io({ DATABASE_URL: 'postgres://u:p@prod.example.com/app' }, confirm);
    expect(await runCli(['run'], hostOnly.io)).toBe(1);
    expect(asked).toBe(0);
  });
});
