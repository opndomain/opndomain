import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDomain } from "./domains.js";

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

  queueFirst(sqlFragment: string, rows: unknown[]) {
    this.firstQueue.set(sqlFragment, rows);
  }

  prepare(sql: string) {
    return new FakePreparedStatement(sql, this);
  }

  async batch(stmts: unknown[]) {
    return (stmts as unknown[]).map(() => ({ success: true }));
  }

  consumeFirst<T>(sql: string): T | null {
    const entry = Array.from(this.firstQueue.entries()).find(([fragment]) => sql.includes(fragment));
    if (!entry) {
      return null;
    }
    const [, rows] = entry;
    const [next, ...rest] = rows as T[];
    this.firstQueue.set(entry[0], rest);
    return next ?? null;
  }

  consumeAll<T>(_sql: string): T[] {
    return [];
  }
}

function buildEnv(db: FakeDb) {
  return { DB: db as never } as never;
}

describe("createDomain parent validation", () => {
  it("rejects an inactive parent domain", async () => {
    const db = new FakeDb();
    // Parent lookup returns null (not found / inactive)
    // No rows queued for SELECT ... FROM domains WHERE id = ? — returns null

    await assert.rejects(
      () => createDomain(buildEnv(db), {
        slug: "new-child",
        name: "New Child",
        parentDomainId: "dom_nonexistent",
      }),
      (err: Error & { status?: number; code?: string }) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "invalid_parent_domain");
        return true;
      },
    );
  });

  it("rejects a child-of-child parent domain", async () => {
    const db = new FakeDb();
    // Parent lookup returns a domain that is itself a child (has parent_domain_id)
    db.queueFirst("SELECT id, parent_domain_id FROM domains", [
      { id: "dom_ai-safety", parent_domain_id: "dom_ai-machine-intelligence" },
    ]);

    await assert.rejects(
      () => createDomain(buildEnv(db), {
        slug: "nested-child",
        name: "Nested Child",
        parentDomainId: "dom_ai-safety",
      }),
      (err: Error & { status?: number; code?: string }) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "invalid_parent_domain");
        assert.ok(err.message.includes("root domain"));
        return true;
      },
    );
  });

  it("accepts a valid root parent domain", async () => {
    const db = new FakeDb();
    // Parent lookup returns a root domain (parent_domain_id is null)
    db.queueFirst("SELECT id, parent_domain_id FROM domains", [
      { id: "dom_ai-machine-intelligence", parent_domain_id: null },
    ]);
    // After INSERT, getDomain is called — queue the result
    db.queueFirst("SELECT id, slug, name", [
      {
        id: "dom_new-child",
        slug: "new-child",
        name: "New Child",
        description: null,
        status: "active",
        parent_domain_id: "dom_ai-machine-intelligence",
        created_at: "2026-04-06T00:00:00.000Z",
        updated_at: "2026-04-06T00:00:00.000Z",
      },
    ]);

    const result = await createDomain(buildEnv(db), {
      slug: "new-child",
      name: "New Child",
      parentDomainId: "dom_ai-machine-intelligence",
    });

    assert.equal(result.slug, "new-child");
    assert.equal(result.parent_domain_id, "dom_ai-machine-intelligence");
  });
});
