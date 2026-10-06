import { createHash } from 'node:crypto';

export interface Random {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  bool(probability?: number): boolean;
}

function toSeed(seed: number | string): number {
  return createHash('sha1').update(String(seed)).digest().readUInt32BE(0);
}

/** Small seeded PRNG (mulberry32): reproducible test data without a faker dependency. */
export function createRandom(seed: number | string): Random {
  let state = toSeed(seed);
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
        throw new RangeError('int() needs integers with min <= max');
      }
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      const item = items[Math.floor(next() * items.length)];
      if (items.length === 0 || item === undefined) throw new RangeError('pick() needs items');
      return item;
    },
    bool(probability = 0.5) {
      return next() < probability;
    },
  };
}
