import { conflict, notFound } from "./errors.js";

export type Row = Record<string, unknown>;

export async function runStatement(statement: D1PreparedStatement): Promise<D1Result<Record<string, unknown>>> {
  try {
    return await statement.run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE constraint failed")) {
      conflict("A unique constraint rejected the write.", { message });
    }

    throw error;
  }
}

export async function firstRow<T extends Row>(
  db: D1Database,
  sql: string,
  ...bindings: unknown[]
): Promise<T | null> {
  const statement = db.prepare(sql).bind(...bindings);
  try {
    const result = await statement.first<T>();
    return result ?? null;
  } catch (error) {
    const fallback = await statement.all<T>();
    if (fallback.results) {
      return fallback.results[0] ?? null;
    }
    throw error;
  }
}

export async function allRows<T extends Row>(
  db: D1Database,
  sql: string,
  ...bindings: unknown[]
): Promise<T[]> {
  const result = await db.prepare(sql).bind(...bindings).all<T>();
  return result.results ?? [];
}

export async function requireRow<T extends Row>(
  db: D1Database,
  sql: string,
  ...bindings: unknown[]
): Promise<T> {
  const row = await firstRow<T>(db, sql, ...bindings);
  if (!row) {
    notFound();
  }

  return row;
}

export async function batchRun(db: D1Database, statements: D1PreparedStatement[]): Promise<unknown> {
  return db.batch(statements);
}

export async function runCas(statement: D1PreparedStatement): Promise<boolean> {
  const runnable = statement as D1PreparedStatement & {
    db?: { batch?: (statements: D1PreparedStatement[]) => Promise<Array<{ error?: string }>> };
  };
  if (typeof runnable.run === "function") {
    const result = await runnable.run();
    return Number((result.meta as { changes?: number } | undefined)?.changes ?? 0) > 0;
  }
  if (runnable.db?.batch) {
    const results = await runnable.db.batch([statement]);
    const first = results?.[0];
    return !first?.error;
  }
  return false;
}
