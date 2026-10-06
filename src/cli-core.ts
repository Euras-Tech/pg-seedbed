import { access } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_SEEDERS_DIR, loadConfig } from './config';
import { discoverSeeders } from './discover';
import { SeedGuardError } from './guard';
import { makeSeeder } from './make';
import { runSeeders } from './runner';

export interface CliIo {
  cwd: string;
  env: Record<string, string | undefined>;
  out(message: string): void;
  err(message: string): void;
  version: string;
  /** Present on an interactive terminal: asks a yes/no question. */
  confirm?: (question: string) => Promise<boolean>;
}

const HELP = `pg-seedbed {version}

Usage:
  pg-seedbed [run] [options]       Run the seeders (like \`php artisan db:seed\`)
  pg-seedbed make:seeder <Name>    Create database/seeders/<Name>.ts (or .mjs without tsconfig.json)

Options:
  -c, --class <Name>     Run one seeder by class name (default: DatabaseSeeder)
      --force            Seed even when NODE_ENV/APP_ENV is production or staging
                         (host and database checks still apply)
      --config <path>    Config file (default: seedbed.config.{mjs,js,cjs,mts,ts}, optional)
      --url-env <VAR>    Environment variable with the connection URL (default: DATABASE_URL)
  -h, --help             Show this help
  -v, --version          Show the version

Seeders are discovered in database/seeders. TypeScript files need a loader:
  NODE_OPTIONS='--import tsx' pg-seedbed run`;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Returns the process exit code. */
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        class: { type: 'string', short: 'c' },
        config: { type: 'string' },
        'url-env': { type: 'string' },
        force: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const { values, positionals } = parsed;
  if (values.help) {
    io.out(HELP.replace('{version}', io.version));
    return 0;
  }
  if (values.version) {
    io.out(io.version);
    return 0;
  }

  const [command = 'run', ...rest] = positionals;
  const valid =
    (command === 'run' && rest.length === 0) || (command === 'make:seeder' && rest.length === 1);
  if (!valid) {
    io.err(`Unknown command "${positionals.join(' ')}". Try --help.`);
    return 2;
  }

  try {
    const { config } = await loadConfig(values.config, io.cwd);
    const directory = config.seedersDir ?? DEFAULT_SEEDERS_DIR;

    if (command === 'make:seeder') {
      const file = await makeSeeder({
        name: rest[0] as string,
        directory: resolve(io.cwd, directory),
        typescript: await exists(resolve(io.cwd, 'tsconfig.json')),
      });
      io.out(`Seeder created: ${relative(io.cwd, file)}`);
      return 0;
    }

    const variable = values['url-env'] ?? config.connectionEnv ?? 'DATABASE_URL';
    const connectionString = io.env[variable];
    if (!connectionString) throw new Error(`Environment variable ${variable} is not set.`);

    const seeders = config.seeders ?? (await discoverSeeders(resolve(io.cwd, directory)));
    if (seeders.length === 0) {
      throw new Error(
        `No seeders found. Create ${directory}/DatabaseSeeder.ts or set \`seeders\` in seedbed.config.`,
      );
    }

    const run = (force: boolean) =>
      runSeeders({
        ...config,
        seeders,
        connectionString,
        env: io.env,
        guard: { ...config.guard, ...(force ? { force: true } : {}) },
        ...(values.class ? { seeder: values.class } : {}),
        logger: { info: io.out, warn: io.err, error: io.err },
      });

    let result;
    try {
      result = await run(values.force ?? false);
    } catch (error) {
      if (!(error instanceof SeedGuardError) || error.reason !== 'environment') throw error;
      // Like Laravel's production prompt: ask on a terminal, otherwise point at --force.
      if (!io.confirm) throw new Error(`${error.message} Use --force to run anyway.`);
      if (!(await io.confirm(`${error.message} Run the seeders anyway?`))) {
        io.err('Aborted.');
        return 1;
      }
      result = await run(true);
    }
    io.out(`Done: ${result.entry} (${result.ran.length} seeder(s), ${result.durationMs} ms).`);
    return 0;
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
