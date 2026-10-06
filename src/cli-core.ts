import { parseArgs } from 'node:util';
import { loadConfig } from './config';
import { runSeeders } from './runner';

export interface CliIo {
  cwd: string;
  env: Record<string, string | undefined>;
  out(message: string): void;
  err(message: string): void;
  version: string;
}

const HELP = `pg-seedbed ${'{version}'}

Usage: pg-seedbed [run] [options]

Options:
  -c, --class <Name>     Run one seeder by class name (default: DatabaseSeeder)
      --config <path>    Config file (default: seedbed.config.{mjs,js,cjs,mts,ts})
      --url-env <VAR>    Environment variable with the connection URL (default: DATABASE_URL)
  -h, --help             Show this help
  -v, --version          Show the version

TypeScript configs: NODE_OPTIONS='--import tsx' pg-seedbed run`;

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
  const command = positionals[0] ?? 'run';
  if (command !== 'run' || positionals.length > 1) {
    io.err(`Unknown command "${positionals.join(' ')}". Try --help.`);
    return 2;
  }

  try {
    const { config } = await loadConfig(values.config, io.cwd);
    const variable = values['url-env'] ?? config.connectionEnv ?? 'DATABASE_URL';
    const connectionString = io.env[variable];
    if (!connectionString) throw new Error(`Environment variable ${variable} is not set.`);

    const result = await runSeeders({
      ...config,
      connectionString,
      ...(values.class ? { seeder: values.class } : {}),
      logger: {
        info: io.out,
        warn: io.err,
        error: io.err,
      },
    });
    io.out(`Done: ${result.entry} (${result.ran.length} seeder(s), ${result.durationMs} ms).`);
    return 0;
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
