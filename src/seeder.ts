import type { Ids } from './ids';
import type { Random } from './random';
import type { Queryable } from './sql';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const consoleLogger: Logger = {
  info: (message) => console.log(`[pg-seedbed] ${message}`),
  warn: (message) => console.warn(`[pg-seedbed] ${message}`),
  error: (message) => console.error(`[pg-seedbed] ${message}`),
};

export const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export interface SeederContext {
  readonly db: Queryable;
  readonly ids: Ids;
  readonly random: Random;
  readonly log: Logger;
  call(...seeders: SeederClass[]): Promise<void>;
}

export type SeederClass = new (...args: never[]) => Seeder;

/**
 * Base class for seeders, like Laravel's `Seeder`. Write `run()` as idempotent upserts
 * and compose other seeders with `this.call(OtherSeeder)`.
 */
export abstract class Seeder {
  #context: SeederContext | undefined;

  /** @internal Called by the runner before `run()`. */
  attach(context: SeederContext): void {
    this.#context = context;
  }

  protected get context(): SeederContext {
    if (!this.#context) throw new Error('Seeder is not attached: run it through runSeeders().');
    return this.#context;
  }

  protected get db(): Queryable {
    return this.context.db;
  }

  protected get ids(): Ids {
    return this.context.ids;
  }

  protected get random(): Random {
    return this.context.random;
  }

  protected get log(): Logger {
    return this.context.log;
  }

  protected call(...seeders: SeederClass[]): Promise<void> {
    return this.context.call(...seeders);
  }

  abstract run(): Promise<void>;
}
