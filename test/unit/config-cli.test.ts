import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../../src/cli-core';
import { defineConfig, loadConfig } from '../../src/config';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pg-seedbed-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const SEEDER = 'export class DatabaseSeeder { attach() {} async run() {} }';

function io(env: Record<string, string | undefined> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const value: CliIo = {
    cwd: dir,
    env,
    out: (message) => out.push(message),
    err: (message) => err.push(message),
    version: '1.2.3',
  };
  return { io: value, out, err };
}

describe('defineConfig / loadConfig', () => {
  it('defineConfig returns its input', () => {
    const config = { seeders: [] };
    expect(defineConfig(config)).toBe(config);
  });

  it('loads the default export of seedbed.config.mjs', async () => {
    await writeFile(
      join(dir, 'seedbed.config.mjs'),
      `${SEEDER}\nexport default { seeders: [DatabaseSeeder] };`,
    );
    const { config, path } = await loadConfig(undefined, dir);
    expect(config.seeders).toHaveLength(1);
    expect(path).toBe(join(dir, 'seedbed.config.mjs'));
  });

  it('accepts a named `config` export and an explicit path', async () => {
    await writeFile(
      join(dir, 'custom.mjs'),
      `${SEEDER}\nexport const config = { seeders: [DatabaseSeeder] };`,
    );
    expect((await loadConfig('custom.mjs', dir)).config.seeders).toHaveLength(1);
  });

  it('unwraps a CommonJS default export', async () => {
    await writeFile(
      join(dir, 'seedbed.config.cjs'),
      `${SEEDER.replace('export ', '')}\nmodule.exports = { seeders: [DatabaseSeeder] };`,
    );
    expect((await loadConfig(undefined, dir)).config.seeders).toHaveLength(1);
  });

  it('is optional: no config file means defaults', async () => {
    expect(await loadConfig(undefined, dir)).toEqual({ config: {}, path: undefined });
  });

  it('accepts a config without a seeders list (discovery applies)', async () => {
    await writeFile(
      join(dir, 'seedbed.config.mjs'),
      "export default { guard: { allowedDatabases: ['app'] } };",
    );
    expect((await loadConfig(undefined, dir)).config.seeders).toBeUndefined();
  });

  it('explains what is wrong', async () => {
    await expect(loadConfig('missing.mjs', dir)).rejects.toThrow('not found');
    // Distinct file names: ESM caches modules by path.
    await writeFile(join(dir, 'not-an-object.mjs'), 'export default 42;');
    await expect(loadConfig('not-an-object.mjs', dir)).rejects.toThrow(
      'must export a config object',
    );
    await writeFile(join(dir, 'bad-seeders.mjs'), "export default { seeders: 'nope' };");
    await expect(loadConfig('bad-seeders.mjs', dir)).rejects.toThrow('must be an array');
  });
});

describe('runCli', () => {
  it('prints help and version', async () => {
    const help = io();
    expect(await runCli(['--help'], help.io)).toBe(0);
    expect(help.out.join('\n')).toContain('pg-seedbed [run] [options]');
    const version = io();
    expect(await runCli(['-v'], version.io)).toBe(0);
    expect(version.out).toEqual(['1.2.3']);
  });

  it('rejects unknown commands and options with exit code 2', async () => {
    const command = io();
    expect(await runCli(['migrate'], command.io)).toBe(2);
    expect(command.err[0]).toContain('Unknown command');
    const option = io();
    expect(await runCli(['--nope'], option.io)).toBe(2);
  });

  it('fails clearly without a connection URL, with or without a config', async () => {
    const noConfig = io();
    expect(await runCli(['run'], noConfig.io)).toBe(1);
    expect(noConfig.err[0]).toContain('DATABASE_URL is not set');

    await writeFile(
      join(dir, 'seedbed.config.mjs'),
      `${SEEDER}\nexport default { seeders: [DatabaseSeeder] };`,
    );
    const custom = io();
    expect(await runCli(['--url-env', 'MY_DB'], custom.io)).toBe(1);
    expect(custom.err[0]).toContain('MY_DB is not set');
  });

  it('explains where to put seeders when none are found', async () => {
    const missing = io({ DATABASE_URL: 'postgres://u:p@localhost/app' });
    expect(await runCli(['run'], missing.io)).toBe(1);
    expect(missing.err[0]).toContain('No seeders found. Create database/seeders/DatabaseSeeder.ts');

    await writeFile(join(dir, 'seedbed.config.mjs'), "export default { seedersDir: 'seeds' };");
    const custom = io({ DATABASE_URL: 'postgres://u:p@localhost/app' });
    expect(await runCli(['run'], custom.io)).toBe(1);
    expect(custom.err[0]).toContain('Create seeds/DatabaseSeeder.ts');
  });

  it('auto-discovers database/seeders without any config file', async () => {
    await mkdir(join(dir, 'database/seeders'), { recursive: true });
    await writeFile(join(dir, 'database/seeders/DatabaseSeeder.mjs'), SEEDER);
    const remote = io({ DATABASE_URL: 'postgres://u:p@prod.example.com/app' });
    expect(await runCli(['run'], remote.io)).toBe(1);
    // Got past discovery and failed at the guard, which proves the seeder was found.
    expect(remote.err[0]).toContain('Refusing to seed remote host');
  });

  it('refuses unsafe targets and unknown seeders without connecting', async () => {
    await writeFile(
      join(dir, 'seedbed.config.mjs'),
      `${SEEDER}\nexport default { seeders: [DatabaseSeeder] };`,
    );
    const remote = io({ DATABASE_URL: 'postgres://u:p@prod.example.com/app' });
    expect(await runCli(['run'], remote.io)).toBe(1);
    expect(remote.err[0]).toContain('Refusing to seed remote host');

    const unknown = io({ DATABASE_URL: 'postgres://u:p@localhost/app' });
    expect(await runCli(['run', '--class', 'Nope'], unknown.io)).toBe(1);
    expect(unknown.err[0]).toContain('Unknown seeder "Nope"');
  });
});
