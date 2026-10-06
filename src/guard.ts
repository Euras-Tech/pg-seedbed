export interface GuardPolicy {
  /** Extra hosts treated as safe (for example a Docker Compose service name such as `db`). */
  allowedHosts?: readonly string[];
  /** When set, the database name must be one of these. Strongly recommended. */
  allowedDatabases?: readonly string[];
  /** Environment values that block seeding. Default: `production`, `staging`. */
  refuseEnvironments?: readonly string[];
  /** Variables inspected for those values. Default: `NODE_ENV`, `APP_ENV`. */
  environmentVariables?: readonly string[];
}

export class SeedGuardError extends Error {
  override readonly name = 'SeedGuardError';
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Refuses to seed anything that is not clearly a local or explicitly allowed database.
 * Messages never include credentials.
 */
export function assertSafeTarget(
  connectionString: string,
  policy: GuardPolicy = {},
  env: Record<string, string | undefined> = process.env,
): void {
  const refused = (policy.refuseEnvironments ?? ['production', 'staging']).map((v) =>
    v.toLowerCase(),
  );
  for (const variable of policy.environmentVariables ?? ['NODE_ENV', 'APP_ENV']) {
    const value = env[variable]?.toLowerCase();
    if (value && refused.includes(value)) {
      throw new SeedGuardError(`Refusing to seed: ${variable}=${value}.`);
    }
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new SeedGuardError('The connection string must be a postgres:// URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new SeedGuardError('The connection string must be a postgres:// URL.');
  }

  const host = safeDecode(url.hostname || url.searchParams.get('host') || '').toLowerCase();
  const isSocket = host === '' || host.startsWith('/');
  const allowed = [...LOCAL_HOSTS, ...(policy.allowedHosts ?? []).map((h) => h.toLowerCase())];
  if (!isSocket && !allowed.includes(host)) {
    throw new SeedGuardError(
      `Refusing to seed remote host "${host}". Add it to allowedHosts if intended.`,
    );
  }

  if (policy.allowedDatabases) {
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!policy.allowedDatabases.includes(database)) {
      throw new SeedGuardError(`Refusing to seed database "${database}": not in allowedDatabases.`);
    }
  }
}
