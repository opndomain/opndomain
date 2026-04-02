import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBeing } from "./beings.js";

class FakePreparedStatement {
  constructor(
    readonly sql: string,
    private readonly db: FakeDb,
    readonly bindings: unknown[] = [],
  ) {}

  bind(...bindings: unknown[]) {
    return new FakePreparedStatement(this.sql, this.db, bindings);
  }

  async first<T>() {
    return this.db.consumeFirst<T>(this.sql);
  }

  async all<T>() {
    return { results: this.db.consumeAll<T>(this.sql) };
  }

  async run() {
    return { success: true, meta: { changes: 1 } };
  }
}

class FakeDb {
  private firstQueue = new Map<string, unknown[]>();
  private allQueue = new Map<string, unknown[]>();

  batchError: Error | null = null;

  queueFirst(sqlFragment: string, rows: unknown[]) {
    this.firstQueue.set(sqlFragment, [...rows]);
  }

  queueAll(sqlFragment: string, rows: unknown[]) {
    this.allQueue.set(sqlFragment, [...rows]);
  }

  prepare(sql: string) {
    return new FakePreparedStatement(sql, this);
  }

  async batch(_statements: FakePreparedStatement[]) {
    if (this.batchError) {
      throw this.batchError;
    }
    return [];
  }

  consumeFirst<T>(sql: string): T | null {
    const entry = Array.from(this.firstQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((a, b) => b[0].length - a[0].length)[0];
    if (!entry) {
      return null;
    }
    const [fragment, rows] = entry;
    const [next, ...rest] = rows as T[];
    this.firstQueue.set(fragment, rest);
    return next ?? null;
  }

  consumeAll<T>(sql: string): T[] {
    const entry = Array.from(this.allQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((a, b) => b[0].length - a[0].length)[0];
    return (entry?.[1] as T[]) ?? [];
  }
}

function buildEnv(db: FakeDb) {
  return {
    DB: db as never,
  } as never;
}

const agent = {
  id: "agt_1",
  clientId: "cli_1",
  name: "Agent",
  email: "agent@example.com",
  emailVerifiedAt: "2026-03-25T00:00:00.000Z",
  accountClass: "verified_participant",
  trustTier: "verified",
  status: "active",
  createdAt: "2026-03-25T00:00:00.000Z",
  updatedAt: "2026-03-25T00:00:00.000Z",
} as const;

describe("createBeing", () => {
  it("maps duplicate handles to a canonical conflict", async () => {
    const db = new FakeDb();
    db.batchError = new Error("D1_ERROR: UNIQUE constraint failed: beings.handle");

    await assert.rejects(
      () => createBeing(buildEnv(db), agent, { handle: "testhandle", displayName: "Test Handle" }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        "code" in error &&
        "message" in error &&
        (error as { status: number }).status === 409 &&
        (error as { code: string }).code === "conflict" &&
        (error as { message: string }).message === "That handle is already taken.",
    );
  });

  it("rejects blocked handles before writing", async () => {
    const db = new FakeDb();

    await assert.rejects(
      () => createBeing(buildEnv(db), agent, { handle: "testfaggot", displayName: "Blocked Handle" }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        "code" in error &&
        "message" in error &&
        (error as { status: number }).status === 400 &&
        (error as { code: string }).code === "handle_blocked" &&
        (error as { message: string }).message === "That handle is not allowed.",
    );
  });
});
