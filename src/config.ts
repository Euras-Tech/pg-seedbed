import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { importModule } from './discover';
import type { GuardPolicy } from './guard';
import type { SeederClass } from './seeder';

export interface SeedbedConfig {
  /** Explicit seeder list. Omit it to auto-discover everything in `seedersDir`. */
  seeders?: SeederClass[];
  /** Where seeders are discovered, relative to the project. Default: `database/seeders`. */
  seedersDir?: string;
  defaultSeeder?: SeederClass;
  /** Environment variable holding the connection URL. Default: `DATABASE_URL`. */
  connectionEnv?: string;
  guard?: GuardPolicy;
  idNamespace?: string;
  randomSeed?: number | string;
  transaction?: 'single' | 'none';
}

/** Identity helper that gives `seedbed.config.*` files type checking and autocompletion. */
export function defineConfig(config: SeedbedConfig): SeedbedConfig {
  return config;
}

export const DEFAULT_SEEDERS_DIR = 'database/seeders';

const CONFIG_FILES = [
  'seedbed.config.mjs',
  'seedbed.config.js',
  'seedbed.config.cjs',
  'seedbed.config.mts',
  'seedbed.config.ts',
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads `seedbed.config.{mjs,js,cjs,mts,ts}` (or an explicit path) from `cwd`.
 * Like Laravel, a config is optional: without one the defaults apply.
 */
export async function loadConfig(
  explicitPath: string | undefined,
  cwd: string,
): Promise<{ config: SeedbedConfig; path: string | undefined }> {
  let path: string | undefined;
  if (explicitPath) {
    path = resolve(cwd, explicitPath);
    if (!(await exists(path))) throw new Error(`Config file not found: ${explicitPath}`);
  } else {
    for (const name of CONFIG_FILES) {
      const candidate = resolve(cwd, name);
      if (await exists(candidate)) {
        path = candidate;
        break;
      }
    }
    if (!path) return { config: {}, path: undefined };
  }

  const loaded = await importModule(path);
  const candidate = (loaded.default ?? loaded.config) as unknown;
  const config = (
    candidate && typeof candidate === 'object' && 'default' in candidate
      ? (candidate as { default: unknown }).default
      : candidate
  ) as SeedbedConfig | undefined;
  if (!config || typeof config !== 'object') {
    throw new Error(`${path} must export a config object (use defineConfig).`);
  }
  if (config.seeders !== undefined && !Array.isArray(config.seeders)) {
    throw new Error(`${path}: \`seeders\` must be an array of seeder classes.`);
  }
  return { config, path };
}
