import pg from 'pg';
import { assertSafeTarget, type GuardPolicy } from './guard';
import { createIds } from './ids';
import { createRandom } from './random';
import {
  consoleLogger,
  type Logger,
  type Seeder,
  type SeederClass,
  type SeederContext,
} from './seeder';
import type { Queryable } from './sql';

export interface RunOptions {
  /** Every seeder that can be selected by name. */
  seeders: readonly SeederClass[];
  /** Entry point when no `seeder` name is given. Default: the seeder named `DatabaseSeeder`. */
  defaultSeeder?: SeederClass;
  /** Class name of the seeder to run (like Laravel's `--class`). */
  seeder?: string;
  /** Guarded connection. Use this for anything that is not a throwaway test client. */
  connectionString?: string;
  /** An already connected client. The guard is skipped: you are responsible for the target. */
  client?: Queryable;
  guard?: GuardPolicy;
  /** UUID namespace for `ids()`. Required to use `ids()`. */
  idNamespace?: string;
  /** Seed for `random`. Default: `pg-seedbed`. */
  randomSeed?: number | string;
  /** `single` (default) wraps the whole run in one transaction. */
  transaction?: 'single' | 'none';
  logger?: Logger;
  /** Custom instantiation, e.g. a dependency-injection container. */
  resolve?: (seeder: SeederClass) => Seeder;
}

export interface RunResult {
  entry: string;
  /** Seeders in the order they started, nested calls included. */
  ran: string[];
  durationMs: number;
}

function pickEntry(options: RunOptions): SeederClass {
  const byName = new Map<string, SeederClass>();
  for (const seeder of options.seeders) {
    if (byName.has(seeder.name)) throw new Error(`Duplicate seeder name "${seeder.name}".`);
    byName.set(seeder.name, seeder);
  }
  if (options.seeder) {
    const found = byName.get(options.seeder);
    if (!found) {
      throw new Error(
        `Unknown seeder "${options.seeder}". Available: ${[...byName.keys()].join(', ') || 'none'}.`,
      );
    }
    return found;
  }
  const fallback = options.defaultSeeder ?? byName.get('DatabaseSeeder');
  if (!fallback)
    throw new Error(
      'No default seeder: pass `seeder`, `defaultSeeder` or name one DatabaseSeeder.',
    );
  return fallback;
}

export async function runSeeders(options: RunOptions): Promise<RunResult> {
  const entry = pickEntry(options);
  const log = options.logger ?? consoleLogger;
  const resolve = options.resolve ?? ((cls: SeederClass) => new (cls as new () => Seeder)());

  let owned: pg.Client | undefined;
  let db: Queryable;
  if (options.client) {
    db = options.client;
  } else {
    if (!options.connectionString) throw new Error('Provide `connectionString` or `client`.');
    assertSafeTarget(options.connectionString, options.guard);
    owned = new pg.Client({ connectionString: options.connectionString });
    await owned.connect();
    db = owned;
  }

  const startedAt = Date.now();
  const ran: string[] = [];
  const stack: SeederClass[] = [];
  const ids = options.idNamespace
    ? createIds(options.idNamespace)
    : () => {
        throw new Error('Set `idNamespace` to use ids().');
      };

  const context: SeederContext = {
    db,
    ids,
    random: createRandom(options.randomSeed ?? 'pg-seedbed'),
    log,
    async call(...seeders) {
      for (const seeder of seeders) {
        if (stack.includes(seeder)) {
          throw new Error(
            `Circular seeder call: ${[...stack, seeder].map((s) => s.name).join(' -> ')}`,
          );
        }
        const instance = resolve(seeder);
        instance.attach(context);
        ran.push(seeder.name);
        log.info(`Seeding ${seeder.name}`);
        stack.push(seeder);
        try {
          await instance.run();
        } finally {
          stack.pop();
        }
      }
    },
  };

  const useTransaction = (options.transaction ?? 'single') === 'single';
  try {
    if (useTransaction) await db.query('BEGIN');
    await context.call(entry);
    if (useTransaction) await db.query('COMMIT');
  } catch (error) {
    if (useTransaction) await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await owned?.end();
  }

  return { entry: entry.name, ran, durationMs: Date.now() - startedAt };
}
