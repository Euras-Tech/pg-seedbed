/** The minimal surface of a `pg` Client/PoolClient that seeders need. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rowCount: number | null; rows: unknown[] }>;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

function quotePart(part: string): string {
  if (!IDENTIFIER.test(part))
    throw new TypeError(`Invalid SQL identifier: ${JSON.stringify(part)}`);
  return `"${part}"`;
}

/** Validates and quotes a table (`users` or `schema.users`). Anything else is rejected, never escaped. */
export function quoteTable(name: string): string {
  const parts = name.split('.');
  if (parts.length > 2) throw new TypeError(`Invalid table name: ${JSON.stringify(name)}`);
  return parts.map(quotePart).join('.');
}

export function quoteColumn(name: string): string {
  return quotePart(name);
}

export interface UpsertOptions {
  /** Columns of the unique index or constraint that identifies the row. */
  conflict: readonly string[];
  /** Columns refreshed on conflict. Default: every non-conflict column. `'none'` keeps existing rows. */
  update?: readonly string[] | 'none';
}

/**
 * Idempotent INSERT ... ON CONFLICT. Values are always bound parameters; table and
 * column names are validated against a strict identifier pattern.
 */
export async function upsert(
  db: Queryable,
  table: string,
  row: Record<string, unknown>,
  options: UpsertOptions,
): Promise<void> {
  const columns = Object.keys(row);
  if (columns.length === 0) throw new TypeError('upsert() needs at least one column');
  if (options.conflict.length === 0) throw new TypeError('upsert() needs conflict columns');
  for (const column of columns) {
    if (row[column] === undefined) throw new TypeError(`Column "${column}" is undefined`);
  }
  for (const column of options.conflict) {
    if (!columns.includes(column))
      throw new TypeError(`Conflict column "${column}" is not in the row`);
  }

  const update =
    options.update === 'none'
      ? []
      : (options.update ?? columns.filter((column) => !options.conflict.includes(column)));
  for (const column of update) {
    if (!columns.includes(column))
      throw new TypeError(`Update column "${column}" is not in the row`);
  }

  const action =
    update.length === 0
      ? 'DO NOTHING'
      : `DO UPDATE SET ${update.map((c) => `${quoteColumn(c)} = EXCLUDED.${quoteColumn(c)}`).join(', ')}`;
  const text =
    `INSERT INTO ${quoteTable(table)} (${columns.map(quoteColumn).join(', ')}) ` +
    `VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')}) ` +
    `ON CONFLICT (${options.conflict.map(quoteColumn).join(', ')}) ${action}`;

  await db.query(
    text,
    columns.map((column) => row[column]),
  );
}
