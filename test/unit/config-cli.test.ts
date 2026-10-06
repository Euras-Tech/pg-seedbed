import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

  it('explains what is wrong', async () => {
    await expect(loadConfig(undefined, dir)).rejects.toThrow('No config found');
    await expect(loadConfig('missing.mjs', dir)).rejects.toThrow('not found');
    await writeFile(join(dir, 'seedbed.config.mjs'), 'export default { nope: true };');
    await expect(loadConfig(undefined, dir)).rejects.toThrow('`seeders` array');
  });
});

describe('runCli', () => {
  it('prints help and version', async () => {
    const help = io();
    expect(await runCli(['--help'], help.io)).toBe(0);
    expect(help.out.join('\n')).toContain('Usage: pg-seedbed');
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

  it('fails clearly without a config or connection URL', async () => {
    const noConfig = io();
    expect(await runCli(['run'], noConfig.io)).toBe(1);
    expect(noConfig.err[0]).toContain('No config found');

    await writeFile(
      join(dir, 'seedbed.config.mjs'),
      `${SEEDER}\nexport default { seeders: [DatabaseSeeder] };`,
    );
    const noUrl = io();
    expect(await runCli([], noUrl.io)).toBe(1);
    expect(noUrl.err[0]).toContain('DATABASE_URL is not set');

    const custom = io();
    expect(await runCli(['--url-env', 'MY_DB'], custom.io)).toBe(1);
    expect(custom.err[0]).toContain('MY_DB is not set');
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
