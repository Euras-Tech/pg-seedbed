import { createHash } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertNamespace(namespace: string): void {
  if (!UUID.test(namespace)) throw new TypeError('namespace must be a UUID');
}

/** RFC 4122 UUID v5 (SHA-1, name-based): the same name and namespace always give the same id. */
export function uuidV5(name: string, namespace: string): string {
  assertNamespace(namespace);
  const hash = createHash('sha1')
    .update(Buffer.from(namespace.replaceAll('-', ''), 'hex'))
    .update(name, 'utf8')
    .digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export type Ids = (...naturalKey: string[]) => string;

/**
 * Builds a deterministic id function for one project namespace:
 * `ids('user', 'a@b.test')` is stable across machines, runs and databases.
 * The key parts are encoded unambiguously, so ('a:b', 'c') never equals ('a', 'b:c').
 */
export function createIds(namespace: string): Ids {
  assertNamespace(namespace);
  return (...naturalKey) => {
    if (naturalKey.length === 0) throw new TypeError('ids() needs at least one key part');
    return uuidV5(JSON.stringify(naturalKey), namespace);
  };
}
