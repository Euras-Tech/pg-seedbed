import { createRandom, type Random } from './random';
import { upsert, type Queryable, type UpsertOptions } from './sql';

export interface FactoryContext {
  /** 0-based position of this row among the rows made by this factory. */
  seq: number;
  /** Random source reproducible for this `seq`. */
  rand: Random;
}

export type Overrides<T> = Partial<T> | ((context: FactoryContext) => Partial<T>);

export interface Factory<T extends object> {
  make(overrides?: Overrides<T>): T;
  makeMany(count: number, overrides?: Overrides<T>): T[];
  /** A new factory with extra overrides applied to every row (Laravel's `state()`). */
  state(overrides: Overrides<T>): Factory<T>;
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

class DefinedFactory<T extends object> implements Factory<T> {
  #seq = 0;

  constructor(
    private readonly definition: (context: FactoryContext) => T,
    private readonly seed: number | string,
    private readonly states: readonly Overrides<T>[],
  ) {}

  make(overrides?: Overrides<T>): T {
    const seq = this.#seq++;
    const context: FactoryContext = { seq, rand: createRandom(`${this.seed}:${seq}`) };
    const applied = [...this.states, ...(overrides ? [overrides] : [])].map((item) =>
      typeof item === 'function' ? item(context) : item,
    );
    return Object.assign({}, this.definition(context), ...applied) as T;
  }

  makeMany(count: number, overrides?: Overrides<T>): T[] {
    return Array.from({ length: count }, () => this.make(overrides));
  }

  state(overrides: Overrides<T>): Factory<T> {
    return new DefinedFactory(this.definition, this.seed, [...this.states, overrides]);
  }

  async create(
    db: Queryable,
    table: string,
    options: UpsertOptions,
    overrides?: Overrides<T>,
  ): Promise<T> {
    const row = this.make(overrides);
    await upsert(db, table, row as Record<string, unknown>, options);
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
  return new DefinedFactory(definition, options.seed ?? 'pg-seedbed', []);
}
