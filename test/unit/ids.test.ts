import { describe, expect, it } from 'vitest';
import { createIds, uuidV5 } from '../../src/ids';

const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const NAMESPACE = '6f1d2c9a-4b7e-4f3a-9c55-2a8e0d7b1c34';
const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidV5', () => {
  it('matches the RFC 4122 reference vector', () => {
    expect(uuidV5('www.example.com', DNS)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('rejects a namespace that is not a UUID', () => {
    expect(() => uuidV5('x', 'not-a-uuid')).toThrow(TypeError);
  });
});

describe('createIds', () => {
  const ids = createIds(NAMESPACE);

  it('is deterministic and produces v5 UUIDs', () => {
    expect(ids('user', 'a@b.test')).toBe(ids('user', 'a@b.test'));
    expect(ids('user', 'a@b.test')).toMatch(UUID_V5);
  });

  it('differs per key and per namespace', () => {
    expect(ids('user', 'a')).not.toBe(ids('user', 'b'));
    expect(createIds(DNS)('user', 'a')).not.toBe(ids('user', 'a'));
  });

  it('encodes key parts unambiguously', () => {
    expect(ids('a:b', 'c')).not.toBe(ids('a', 'b:c'));
    expect(ids('ab')).not.toBe(ids('a', 'b'));
  });

  it('validates its input', () => {
    expect(() => ids()).toThrow('at least one');
    expect(() => createIds('nope')).toThrow(TypeError);
  });
});
