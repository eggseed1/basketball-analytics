export const SQL_ROW_LIMIT = 200;
const MAX_SQL_LENGTH = 4000;

const WRITE_OR_ADMIN =
  /\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|reindex|analyze|begin|commit|rollback|savepoint|release|trigger|upsert)\b/i;

export type GuardedSql = { ok: true; sql: string } | { ok: false; error: string };

/**
 * Accepts one read-only SELECT (or WITH ... SELECT) and wraps it so the row
 * count is capped. Anything else is refused with a reason the model can act on.
 * The database binding is read-only in spirit only, so this check is the guard.
 */
export function guardSql(input: string): GuardedSql {
  const sql = input.trim().replace(/;\s*$/, "").trim();
  if (!sql) return { ok: false, error: "Empty query." };
  if (sql.length > MAX_SQL_LENGTH) return { ok: false, error: `Query is longer than ${MAX_SQL_LENGTH} characters.` };
  if (/--|\/\*/.test(sql)) return { ok: false, error: "Remove SQL comments." };
  const bare = sql.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
  if (bare.includes(";")) return { ok: false, error: "Send one statement at a time." };
  if (!/^(select|with)\b/i.test(bare)) return { ok: false, error: "Only SELECT queries are allowed." };
  if (WRITE_OR_ADMIN.test(bare)) return { ok: false, error: "Only read-only SELECT queries are allowed." };
  if (/\bsqlite_|\b_cf_|\bd1_/i.test(bare)) return { ok: false, error: "System tables are off limits." };
  return { ok: true, sql: `SELECT * FROM (${sql}) LIMIT ${SQL_ROW_LIMIT + 1}` };
}
