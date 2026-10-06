import { createRandom, type Random } from './random';
import { upsert, type Queryable, type UpsertOptions } from './sql';

export interface FactoryContext {
  /** 0-based position of this row among the rows made by this factory. */
  seq: number;
  /** Random source reproducible for this `seq`. */
  rand: Random;
}

export type Overrides<T> = Partial<T> | ((context: FactoryContext) => Partial<T>);

export interface RelationOptions<Parent extends object, Child extends object> {
  table: string;
  upsert: UpsertOptions;
  /** Children created per parent. Default 1. */
  count?: number;
  /** Columns that tie the child to the parent, e.g. `(user) => ({ user_id: user.id })`. */
  link: (parent: Parent) => Partial<Child>;
}

export interface Factory<T extends object> {
  make(overrides?: Overrides<T>): T;
  makeMany(count: number, overrides?: Overrides<T>): T[];
  /** A new factory with extra overrides applied to every row (Laravel's `state()`). */
  state(overrides: Overrides<T>): Factory<T>;
  /** Cycles through the given overrides row by row (Laravel's `sequence()`). */
  sequence(...overrides: Overrides<T>[]): Factory<T>;
  /** Runs after a row is made, before it is stored. Mutate the row in place. */
  afterMaking(callback: (row: T) => void): Factory<T>;
  /** Runs after a row is upserted: the place to create related rows. */
  afterCreating(callback: (row: T, db: Queryable) => void | Promise<void>): Factory<T>;
  /** Creates related rows for every created row (Laravel's `has()` / `hasPosts()`). */
  has<Child extends object>(child: Factory<Child>, options: RelationOptions<T, Child>): Factory<T>;
  /** Makes a row and upserts it. Returns the row. */
  create(
    db: Queryable,
    table: string,
    options: UpsertOptions,
    overrides?: Overrides<T>,
  ): Promise<T>;
  createMany(
    db: Queryable,
    table: string,
    options: UpsertOptions,
    count: number,
    overrides?: Overrides<T>,
  ): Promise<T[]>;
}

export interface FactoryOptions {
  /** Seed for `rand`. Row N gets the same random values on every run. */
  seed?: number | string;
}

interface FactoryConfig<T extends object> {
  definition: (context: FactoryContext) => T;
  seed: number | string;
  states: readonly Overrides<T>[];
  afterMaking: readonly ((row: T) => void)[];
  afterCreating: readonly ((row: T, db: Queryable) => void | Promise<void>)[];
}

class DefinedFactory<T extends object> implements Factory<T> {
  #seq = 0;

  constructor(private readonly config: FactoryConfig<T>) {}

  private derive(patch: Partial<FactoryConfig<T>>): Factory<T> {
    return new DefinedFactory({ ...this.config, ...patch });
  }

  make(overrides?: Overrides<T>): T {
    const seq = this.#seq++;
    const context: FactoryContext = { seq, rand: createRandom(`${this.config.seed}:${seq}`) };
    const applied = [...this.config.states, ...(overrides ? [overrides] : [])].map((item) =>
      typeof item === 'function' ? item(context) : item,
    );
    const row = Object.assign({}, this.config.definition(context), ...applied) as T;
    for (const callback of this.config.afterMaking) callback(row);
    return row;
  }

  makeMany(count: number, overrides?: Overrides<T>): T[] {
    return Array.from({ length: count }, () => this.make(overrides));
  }

  state(overrides: Overrides<T>): Factory<T> {
    return this.derive({ states: [...this.config.states, overrides] });
  }

  sequence(...overrides: Overrides<T>[]): Factory<T> {
    if (overrides.length === 0) throw new TypeError('sequence() needs at least one entry');
    return this.state((context) => {
      const entry = overrides[context.seq % overrides.length] as Overrides<T>;
      return typeof entry === 'function' ? entry(context) : entry;
    });
  }

  afterMaking(callback: (row: T) => void): Factory<T> {
    return this.derive({ afterMaking: [...this.config.afterMaking, callback] });
  }

  afterCreating(callback: (row: T, db: Queryable) => void | Promise<void>): Factory<T> {
    return this.derive({ afterCreating: [...this.config.afterCreating, callback] });
  }

  has<Child extends object>(child: Factory<Child>, options: RelationOptions<T, Child>): Factory<T> {
    return this.afterCreating(async (parent, db) => {
      await child.createMany(
        db,
        options.table,
        options.upsert,
        options.count ?? 1,
        options.link(parent),
      );
    });
  }

  async create(
    db: Queryable,
    table: string,
    options: UpsertOptions,
    overrides?: Overrides<T>,
  ): Promise<T> {
    const row = this.make(overrides);
    await upsert(db, table, row as Record<string, unknown>, options);
    for (const callback of this.config.afterCreating) await callback(row, db);
    return row;
  }

  async createMany(
    db: Queryable,
    table: string,
    options: UpsertOptions,
    count: number,
    overrides?: Overrides<T>,
  ): Promise<T[]> {
    const rows: T[] = [];
    for (let index = 0; index < count; index++) {
      rows.push(await this.create(db, table, options, overrides));
    }
    return rows;
  }
}

export function defineFactory<T extends object>(
  definition: (context: FactoryContext) => T,
  options: FactoryOptions = {},
): Factory<T> {
  return new DefinedFactory({
    definition,
    seed: options.seed ?? 'pg-seedbed',
    states: [],
    afterMaking: [],
    afterCreating: [],
  });
}
