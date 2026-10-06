import { describe, expect, it } from 'vitest';
import { defineFactory } from '../../src/factory';
import { fakeDb } from './helpers';

interface User {
  email: string;
  age: number;
  role: string;
}

const userFactory = () =>
  defineFactory<User>(({ seq, rand }) => ({
    email: `user${seq}@example.test`,
    age: rand.int(18, 60),
    role: 'member',
  }));

describe('defineFactory', () => {
  it('increments seq and is reproducible across instances', () => {
    const a = userFactory().makeMany(3);
    const b = userFactory().makeMany(3);
    expect(a).toEqual(b);
    expect(a.map((user) => user.email)).toEqual([
      'user0@example.test',
      'user1@example.test',
      'user2@example.test',
    ]);
  });

  it('gives each row its own random values, independent of how many others were made', () => {
    const many = userFactory().makeMany(5);
    const lone = userFactory();
    for (let i = 0; i < 4; i++) lone.make();
    expect(lone.make()).toEqual(many[4]);
  });

  it('applies object and function overrides', () => {
    const factory = userFactory();
    expect(factory.make({ role: 'admin' }).role).toBe('admin');
    expect(factory.make(({ seq }) => ({ email: `custom${seq}@example.test` })).email).toBe(
      'custom1@example.test',
    );
  });

  it('state() layers overrides without touching the original', () => {
    const base = userFactory();
    const admins = base.state({ role: 'admin' });
    expect(admins.make().role).toBe('admin');
    expect(base.make().role).toBe('member');
    expect(admins.state({ age: 99 }).make()).toMatchObject({ role: 'admin', age: 99 });
  });

  it('create() upserts the made row and returns it', async () => {
    const { db, calls } = fakeDb();
    const row = await userFactory().create(db, 'users', { conflict: ['email'] }, { role: 'admin' });
    expect(row.role).toBe('admin');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('INSERT INTO "users"');
    expect(calls[0]?.values).toEqual([row.email, row.age, 'admin']);
  });

  it('createMany() upserts each row in order', async () => {
    const { db, calls } = fakeDb();
    const rows = await userFactory().createMany(db, 'users', { conflict: ['email'] }, 3);
    expect(rows).toHaveLength(3);
    expect(calls.map((call) => call.values?.[0])).toEqual(rows.map((row) => row.email));
  });
});
