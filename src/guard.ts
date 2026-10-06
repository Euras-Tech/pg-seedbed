export interface GuardPolicy {
  /** Extra hosts treated as safe (for example a Docker Compose service name such as `db`). */
  allowedHosts?: readonly string[];
  /** When set, the database name must be one of these. Strongly recommended. */
  allowedDatabases?: readonly string[];
  /** Environment values that block seeding. Default: `production`, `staging`. */
  refuseEnvironments?: readonly string[];
  /** Variables inspected for those values. Default: `NODE_ENV`, `APP_ENV`. */
  environmentVariables?: readonly string[];
  /**
   * Skips the environment check only, like Laravel's `--force`. The host and database
   * checks still apply, so a remote host must still be listed in `allowedHosts`.
   */
  force?: boolean;
}

export type SeedGuardReason = 'environment' | 'url' | 'host' | 'database';

export class SeedGuardError extends Error {
  override readonly name = 'SeedGuardError';

  constructor(
    message: string,
    readonly reason: SeedGuardReason,
  ) {
    super(message);
  }
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
  if (!policy.force) {
    const refused = (policy.refuseEnvironments ?? ['production', 'staging']).map((v) =>
      v.toLowerCase(),
    );
    for (const variable of policy.environmentVariables ?? ['NODE_ENV', 'APP_ENV']) {
      const value = env[variable]?.toLowerCase();
      if (value && refused.includes(value)) {
        throw new SeedGuardError(`Refusing to seed: ${variable}=${value}.`, 'environment');
      }
    }
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new SeedGuardError('The connection string must be a postgres:// URL.', 'url');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new SeedGuardError('The connection string must be a postgres:// URL.', 'url');
  }

  const host = safeDecode(url.hostname || url.searchParams.get('host') || '').toLowerCase();
  const isSocket = host === '' || host.startsWith('/');
  const allowed = [...LOCAL_HOSTS, ...(policy.allowedHosts ?? []).map((h) => h.toLowerCase())];
  if (!isSocket && !allowed.includes(host)) {
    throw new SeedGuardError(
      `Refusing to seed remote host "${host}". Add it to allowedHosts if intended.`,
      'host',
    );
  }

  if (policy.allowedDatabases) {
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!policy.allowedDatabases.includes(database)) {
      throw new SeedGuardError(
        `Refusing to seed database "${database}": not in allowedDatabases.`,
        'database',
      );
    }
  }
}
