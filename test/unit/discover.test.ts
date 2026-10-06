import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverSeeders, importModule, isSeederClass } from '../../src/discover';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pg-seedbed-discover-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const seeder = (name: string) => `export class ${name} { attach() {} async run() {} }\n`;

describe('isSeederClass', () => {
  it('recognises seeder-shaped classes only', () => {
    class Yes {
      attach(): void {}
      async run(): Promise<void> {}
    }
    class NoAttach {
      async run(): Promise<void> {}
    }
    expect(isSeederClass(Yes)).toBe(true);
    expect(isSeederClass(NoAttach)).toBe(false);
    expect(isSeederClass({ run() {}, attach() {} })).toBe(false);
    expect(isSeederClass(undefined)).toBe(false);
    expect(isSeederClass(() => undefined)).toBe(false);
  });
});

describe('discoverSeeders', () => {
  it('returns nothing when the directory does not exist', async () => {
    expect(await discoverSeeders(join(dir, 'database/seeders'))).toEqual([]);
  });

  it('finds seeder classes in every supported file, sorted by file name', async () => {
    await writeFile(join(dir, 'UserSeeder.mjs'), seeder('UserSeeder'));
    await writeFile(join(dir, 'DatabaseSeeder.mjs'), seeder('DatabaseSeeder'));
    await writeFile(
      join(dir, 'PostSeeder.cjs'),
      'class PostSeeder { attach() {} async run() {} }\nmodule.exports = { PostSeeder };',
    );
    await writeFile(join(dir, 'TagSeeder.ts'), seeder('TagSeeder'));

    const names = (await discoverSeeders(dir)).map((found) => found.name);
    expect(names).toEqual(['DatabaseSeeder', 'PostSeeder', 'TagSeeder', 'UserSeeder']);
  });

  it('ignores helpers, tests, declarations, subfolders and non-seeder exports', async () => {
    await writeFile(join(dir, 'DatabaseSeeder.mjs'), seeder('DatabaseSeeder'));
    await writeFile(join(dir, 'helper.mjs'), 'export const x = 1; export class Util { run() {} }');
    await writeFile(join(dir, 'Other.test.mjs'), seeder('FromTest'));
    await writeFile(join(dir, 'Other.spec.mjs'), seeder('FromSpec'));
    await writeFile(join(dir, 'types.d.ts'), 'export {}');
    await writeFile(join(dir, 'notes.txt'), 'not code');
    await mkdir(join(dir, 'nested'));
    await writeFile(join(dir, 'nested/Deep.mjs'), seeder('Deep'));

    expect((await discoverSeeders(dir)).map((found) => found.name)).toEqual(['DatabaseSeeder']);
  });

  it('lists a class once even when it is exported under several names', async () => {
    await writeFile(join(dir, 'Shared.mjs'), `${seeder('Shared')}export { Shared as Alias };\n`);
    expect(await discoverSeeders(dir)).toHaveLength(1);
  });

  it('surfaces real errors instead of swallowing them', async () => {
    await writeFile(join(dir, 'Broken.mjs'), 'throw new Error("syntax of doom");');
    await expect(discoverSeeders(dir)).rejects.toThrow('syntax of doom');
    await expect(discoverSeeders(join(dir, 'Broken.mjs'))).rejects.toThrow();
  });
});

describe('importModule', () => {
  it('imports a module by path', async () => {
    await writeFile(join(dir, 'm.mjs'), 'export const value = 7;');
    expect((await importModule(join(dir, 'm.mjs'))).value).toBe(7);
  });
});
