import { describe, expect, it } from 'vitest';
import { SeedGuardError, assertSafeTarget } from '../../src/guard';

const local = 'postgres://postgres:secret@localhost:5432/app_test';

describe('assertSafeTarget', () => {
  it.each([
    local,
    'postgresql://u:p@127.0.0.1/app',
    'postgres://u:p@[::1]:5432/app',
    'postgres:///app',
    'postgres://%2Fvar%2Frun%2Fpostgresql/app',
    'postgres://u:p@localhost/app?host=/var/run/postgresql',
  ])('accepts %s', (url) => {
    expect(() => assertSafeTarget(url, {}, {})).not.toThrow();
  });

  it('refuses remote hosts unless allowed', () => {
    const remote = 'postgres://u:p@db.example.com/app';
    expect(() => assertSafeTarget(remote, {}, {})).toThrow(SeedGuardError);
    expect(() => assertSafeTarget(remote, { allowedHosts: ['DB.example.com'] }, {})).not.toThrow();
  });

  it('allows a docker-compose style host only when listed', () => {
    expect(() => assertSafeTarget('postgres://u:p@db/app', {}, {})).toThrow(SeedGuardError);
    expect(() =>
      assertSafeTarget('postgres://u:p@db/app', { allowedHosts: ['db'] }, {}),
    ).not.toThrow();
  });

  it.each([{ NODE_ENV: 'production' }, { NODE_ENV: 'Production' }, { APP_ENV: 'staging' }])(
    'refuses environment %o',
    (env) => {
      expect(() => assertSafeTarget(local, {}, env)).toThrow('Refusing to seed');
    },
  );

  it('honours custom environment rules', () => {
    expect(() =>
      assertSafeTarget(
        local,
        { refuseEnvironments: ['qa'], environmentVariables: ['STAGE'] },
        { STAGE: 'qa' },
      ),
    ).toThrow(SeedGuardError);
    expect(() => assertSafeTarget(local, {}, { NODE_ENV: 'test' })).not.toThrow();
  });

  it('enforces the database allow-list', () => {
    const policy = { allowedDatabases: ['app_test'] };
    expect(() => assertSafeTarget(local, policy, {})).not.toThrow();
    expect(() => assertSafeTarget('postgres://u:p@localhost/other', policy, {})).toThrow(
      'not in allowedDatabases',
    );
    expect(() => assertSafeTarget('postgres://u:p@localhost', policy, {})).toThrow(SeedGuardError);
  });

  it('rejects anything that is not a postgres URL', () => {
    expect(() => assertSafeTarget('host=localhost dbname=app', {}, {})).toThrow('postgres:// URL');
    expect(() => assertSafeTarget('mysql://localhost/app', {}, {})).toThrow('postgres:// URL');
  });

  it('never leaks the password in an error', () => {
    try {
      assertSafeTarget('postgres://user:s3cr3t@db.example.com/app', {}, {});
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('s3cr3t');
    }
  });
});
