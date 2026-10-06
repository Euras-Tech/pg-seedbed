import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GuardPolicy } from './guard';
import type { SeederClass } from './seeder';

export interface SeedbedConfig {
  seeders: SeederClass[];
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

/** Loads `seedbed.config.{mjs,js,cjs,mts,ts}` (or an explicit path) from `cwd`. */
export async function loadConfig(
  explicitPath: string | undefined,
  cwd: string,
): Promise<{ config: SeedbedConfig; path: string }> {
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
    if (!path) throw new Error(`No config found. Create ${CONFIG_FILES[0]} (see the README).`);
  }

  let loaded: Record<string, unknown>;
  try {
    loaded = (await import(pathToFileURL(path).href)) as Record<string, unknown>;
  } catch (error) {
    if (
      /\.[cm]?ts$/.test(path) &&
      (error as { code?: string }).code === 'ERR_UNKNOWN_FILE_EXTENSION'
    ) {
      throw new Error(
        `Cannot load ${path}: TypeScript configs need a loader, e.g. NODE_OPTIONS='--import tsx' pg-seedbed run`,
        { cause: error },
      );
    }
    throw error;
  }
  const candidate = (loaded.default ?? loaded.config) as unknown;
  const config = (
    candidate && typeof candidate === 'object' && 'default' in candidate
      ? (candidate as { default: unknown }).default
      : candidate
  ) as SeedbedConfig | undefined;
  if (!config || !Array.isArray(config.seeders)) {
    throw new Error(`${path} must export a config with a \`seeders\` array (use defineConfig).`);
  }
  return { config, path };
}
