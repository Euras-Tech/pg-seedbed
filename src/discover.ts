import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SeederClass } from './seeder';

const EXTENSIONS = ['.ts', '.mts', '.js', '.mjs', '.cjs'];
const IGNORED = /\.d\.[cm]?ts$|\.(test|spec)\.[cm]?[jt]s$/;

/** Imports a module by path. TypeScript files need a loader (tsx, or Node 22.18+ natively). */
export async function importModule(path: string): Promise<Record<string, unknown>> {
  try {
    return (await import(pathToFileURL(path).href)) as Record<string, unknown>;
  } catch (error) {
    if (
      /\.[cm]?ts$/.test(path) &&
      (error as { code?: string }).code === 'ERR_UNKNOWN_FILE_EXTENSION'
    ) {
      throw new Error(
        `Cannot load ${path}: TypeScript files need a loader, e.g. NODE_OPTIONS='--import tsx' pg-seedbed run`,
        { cause: error },
      );
    }
    throw error;
  }
}

/** Duck-typed so seeders still match when they come from another copy of the package. */
export function isSeederClass(value: unknown): value is SeederClass {
  if (typeof value !== 'function') return false;
  const prototype = (value as { prototype?: Record<string, unknown> }).prototype;
  return typeof prototype?.run === 'function' && typeof prototype.attach === 'function';
}

/**
 * Laravel-style discovery: every seeder class exported from a file in `directory`
 * (default layout `database/seeders/`). Missing directory means no seeders.
 */
export async function discoverSeeders(directory: string): Promise<SeederClass[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return [];
    throw error;
  }

  const files = entries
    .filter((entry) => entry.isFile() && EXTENSIONS.includes(extname(entry.name)))
    .map((entry) => entry.name)
    .filter((name) => !IGNORED.test(name))
    .sort();

  const found = new Set<SeederClass>();
  for (const file of files) {
    const module = await importModule(join(directory, file));
    const commonJs = module.default;
    const exported = [
      ...Object.values(module),
      ...(commonJs && typeof commonJs === 'object' ? Object.values(commonJs) : []),
    ];
    for (const value of exported) if (isSeederClass(value)) found.add(value);
  }
  return [...found];
}
