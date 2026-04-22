import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractCitationLinks, insertLink } from "./topic-links.js";

class FakePreparedStatement {
  constructor(readonly sql: string, private readonly db: FakeDb, readonly bindings: unknown[] = []) {}
  bind(...bindings: unknown[]) { return new FakePreparedStatement(this.sql, this.db, bindings); }
  async first<T>() { return this.db.consumeFirst<T>(this.sql); }
  async all<T>() { return { results: this.db.consumeAll<T>(this.sql) }; }
  async run() {
    this.db.runs.push({ sql: this.sql, bindings: this.bindings });
    const changes = this.db.zeroChangesOnMatch?.test(this.sql) ? 0 : 1;
    return { success: true, meta: { changes } };
  }
}

class FakeDb {
  runs: Array<{ sql: string; bindings: unknown[] }> = [];
  zeroChangesOnMatch: RegExp | null = null;
  private firstQueue = new Map<string, unknown[]>();
  private allQueue = new Map<string, unknown[]>();
  queueFirst(fragment: string, rows: unknown[]) { this.firstQueue.set(fragment, [...rows]); }
  queueAll(fragment: string, rows: unknown[]) { this.allQueue.set(fragment, [...rows]); }
  prepare(sql: string) { return new FakePreparedStatement(sql, this); }
  consumeFirst<T>(sql: string): T | null {
    const entry = Array.from(this.firstQueue.entries()).find(([fragment]) => sql.includes(fragment));
    if (!entry) return null;
    const [fragment, rows] = entry;
    const [next, ...rest] = rows as T[];
    this.firstQueue.set(fragment, rest);
    return next ?? null;
  }
  consumeAll<T>(sql: string): T[] {
    const entry = Array.from(this.allQueue.entries()).find(([fragment]) => sql.includes(fragment));
    return (entry?.[1] as T[]) ?? [];
  }
}

describe("topic-links insertLink", () => {
  it("inserts a link with JSON-serialized evidence", async () => {
    const db = new FakeDb();
    const env = { DB: db as never } as never;
    const ok = await insertLink(env, {
      fromTopicId: "top_a",
      toTopicId: "top_b",
      linkType: "cites",
      evidence: { source: "citation_parser", quote: "see top_b" },
    });
    assert.equal(ok, true);
    const insert = db.runs.find((run) => run.sql.includes("INSERT OR IGNORE INTO topic_links"));
    assert.ok(insert);
    assert.equal(insert!.bindings[1], "top_a");
    assert.equal(insert!.bindings[2], "top_b");
    assert.equal(insert!.bindings[3], "cites");
    assert.equal(typeof insert!.bindings[5], "string");
    const parsed = JSON.parse(String(insert!.bindings[5]));
    assert.equal(parsed.source, "citation_parser");
    assert.equal(parsed.quote, "see top_b");
  });

  it("rejects self-links before touching the database", async () => {
    const db = new FakeDb();
    const env = { DB: db as never } as never;
    const ok = await insertLink(env, {
      fromTopicId: "top_a",
      toTopicId: "top_a",
      linkType: "cites",
      evidence: { source: "citation_parser" },
    });
    assert.equal(ok, false);
    assert.equal(db.runs.length, 0, "must not issue INSERT for self-links");
  });

  it("returns false when UNIQUE constraint yields zero changes", async () => {
    const db = new FakeDb();
    db.zeroChangesOnMatch = /INSERT OR IGNORE INTO topic_links/;
    const env = { DB: db as never } as never;
    const ok = await insertLink(env, {
      fromTopicId: "top_a",
      toTopicId: "top_b",
      linkType: "cites",
      evidence: { source: "citation_parser" },
    });
    assert.equal(ok, false, "duplicate insert must report false");
  });
});

describe("extractCitationLinks", () => {
  it("extracts unique topic ids with evidence windows", () => {
    const body = "Consider the earlier investigation at /topics/top_00112233445566778899aabbccddeeff — it reached a different verdict.";
    const edges = extractCitationLinks("top_self", body);
    assert.equal(edges.length, 1);
    assert.equal(edges[0].toTopicId, "top_00112233445566778899aabbccddeeff");
    assert.equal(edges[0].evidence.source, "citation_parser");
    assert.ok(edges[0].evidence.quote?.includes("earlier investigation"));
  });

  it("dedups repeat mentions of the same topic id", () => {
    const topicId = "top_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const body = `First ref /topics/${topicId}. Second ref /topics/${topicId}.`;
    const edges = extractCitationLinks("top_self", body);
    assert.equal(edges.length, 1);
  });

  it("ignores self-references", () => {
    const self = "top_11112222333344445555666677778888";
    const body = `This is my own topic: /topics/${self} — and nothing else.`;
    const edges = extractCitationLinks(self, body);
    assert.deepEqual(edges, []);
  });

  it("rejects malformed topic ids (wrong length / non-hex)", () => {
    const body = "See /topics/top_short and /topics/top_NOTHEXNOTHEXNOTHEXNOTHEXNOTHEX12345 and valid /topics/top_abcdef0123456789abcdef0123456789.";
    const edges = extractCitationLinks("top_self", body);
    assert.equal(edges.length, 1);
    assert.equal(edges[0].toTopicId, "top_abcdef0123456789abcdef0123456789");
  });

  it("returns [] for bodies without any topic references", () => {
    const edges = extractCitationLinks("top_self", "Plain prose with no links at all.");
    assert.deepEqual(edges, []);
  });
});
