import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pg-seedbed-ts-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadConfig with TypeScript files', () => {
  it('discovers seedbed.config.ts when no JavaScript config exists', async () => {
    await writeFile(
      join(dir, 'seedbed.config.ts'),
      'class DatabaseSeeder { attach(): void {} async run(): Promise<void> {} }\nexport default { seeders: [DatabaseSeeder] };',
    );
    const { config, path } = await loadConfig(undefined, dir);
    expect(path).toBe(join(dir, 'seedbed.config.ts'));
    expect(config.seeders).toHaveLength(1);
  });

  it('prefers a JavaScript config over a TypeScript one', async () => {
    await writeFile(join(dir, 'seedbed.config.ts'), 'export default { seeders: [] };');
    await writeFile(join(dir, 'seedbed.config.mjs'), 'export default { seeders: [class A {}] };');
    expect((await loadConfig(undefined, dir)).path).toBe(join(dir, 'seedbed.config.mjs'));
  });
});
