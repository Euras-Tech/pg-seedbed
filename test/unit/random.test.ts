import { describe, expect, it } from 'vitest';
import { createRandom } from '../../src/random';

describe('createRandom', () => {
  it('is reproducible per seed', () => {
    const a = createRandom('seed');
    const b = createRandom('seed');
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('differs between seeds', () => {
    expect(createRandom(1).next()).not.toBe(createRandom(2).next());
  });

  it('keeps next() in [0, 1) and int() inside its inclusive bounds', () => {
    const random = createRandom(42);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      seen.add(random.int(3, 5));
    }
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it('picks from the list and rejects an empty one', () => {
    const random = createRandom(7);
    expect(['a', 'b']).toContain(random.pick(['a', 'b']));
    expect(() => random.pick([])).toThrow(RangeError);
  });

  it('bool() honours the probability extremes', () => {
    const random = createRandom(9);
    expect(random.bool(1)).toBe(true);
    expect(random.bool(0)).toBe(false);
  });

  it('int() validates its range', () => {
    const random = createRandom(1);
    expect(() => random.int(5, 3)).toThrow(RangeError);
    expect(() => random.int(1.5, 3)).toThrow(RangeError);
  });
});
