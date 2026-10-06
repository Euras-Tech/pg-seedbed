import type { Queryable } from '../../src/sql';

export interface RecordedCall {
  text: string;
  values: unknown[] | undefined;
}

export function fakeDb(options: { failOn?: RegExp } = {}): {
  db: Queryable;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const db: Queryable = {
    query: (text, values) => {
      calls.push({ text, values });
      if (options.failOn?.test(text)) return Promise.reject(new Error('boom'));
      return Promise.resolve({ rowCount: 0, rows: [] });
    },
  };
  return { db, calls };
}
