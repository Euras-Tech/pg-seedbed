import { describe, expect, it } from 'vitest';
import { quoteColumn, quoteTable, upsert } from '../../src/sql';
import { fakeDb } from './helpers';

describe('identifier quoting', () => {
  it('quotes plain and schema-qualified tables', () => {
    expect(quoteTable('users')).toBe('"users"');
    expect(quoteTable('app.users')).toBe('"app"."users"');
    expect(quoteColumn('full_name')).toBe('"full_name"');
  });

  it.each([
    'users; DROP TABLE users',
    'a.b.c',
    '"users"',
    "users'--",
    '',
    '1users',
    'user s',
    'a'.repeat(64),
  ])('rejects %j', (name) => {
    expect(() => quoteTable(name)).toThrow(TypeError);
  });

  it('does not accept a dot inside a column', () => {
    expect(() => quoteColumn('a.b')).toThrow(TypeError);
  });
});

describe('upsert', () => {
  it('refreshes every non-conflict column by default', async () => {
    const { db, calls } = fakeDb();
    await upsert(db, 'app.users', { id: 'u1', email: 'a@b.test', name: 'A' }, { conflict: ['id'] });
    expect(calls).toEqual([
      {
        text:
          'INSERT INTO "app"."users" ("id", "email", "name") VALUES ($1, $2, $3) ' +
          'ON CONFLICT ("id") DO UPDATE SET "email" = EXCLUDED."email", "name" = EXCLUDED."name"',
        values: ['u1', 'a@b.test', 'A'],
      },
    ]);
  });

  it('keeps existing rows with update: none, and when nothing is left to update', async () => {
    const { db, calls } = fakeDb();
    await upsert(db, 'users', { id: 'u1', name: 'A' }, { conflict: ['id'], update: 'none' });
    await upsert(db, 'users', { id: 'u1' }, { conflict: ['id'] });
    expect(calls[0]?.text).toMatch(/DO NOTHING$/);
    expect(calls[1]?.text).toMatch(/DO NOTHING$/);
  });

  it('limits the refreshed columns when asked', async () => {
    const { db, calls } = fakeDb();
    await upsert(db, 'users', { id: 'u1', a: 1, b: 2 }, { conflict: ['id'], update: ['b'] });
    expect(calls[0]?.text).toMatch(/DO UPDATE SET "b" = EXCLUDED\."b"$/);
  });

  it('binds values as parameters, never into the SQL text', async () => {
    const { db, calls } = fakeDb();
    const hostile = "x'); DROP TABLE users; --";
    await upsert(db, 'users', { id: 'u1', name: hostile }, { conflict: ['id'] });
    expect(calls[0]?.text).not.toContain('DROP');
    expect(calls[0]?.values).toContain(hostile);
  });

  it('rejects malformed input before touching the database', async () => {
    const { db, calls } = fakeDb();
    await expect(upsert(db, 'users', {}, { conflict: ['id'] })).rejects.toThrow(
      'at least one column',
    );
    await expect(upsert(db, 'users', { id: 1 }, { conflict: [] })).rejects.toThrow(
      'conflict columns',
    );
    await expect(upsert(db, 'users', { id: undefined }, { conflict: ['id'] })).rejects.toThrow(
      'undefined',
    );
    await expect(upsert(db, 'users', { id: 1 }, { conflict: ['email'] })).rejects.toThrow(
      'Conflict column',
    );
    await expect(
      upsert(db, 'users', { id: 1 }, { conflict: ['id'], update: ['nope'] }),
    ).rejects.toThrow('Update column');
    await expect(upsert(db, 'bad table', { id: 1 }, { conflict: ['id'] })).rejects.toThrow(
      'identifier',
    );
    expect(calls).toHaveLength(0);
  });
});
