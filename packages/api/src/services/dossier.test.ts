import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DossierDataSchema, VerdictPresentationSchema } from "@opndomain/shared";
import { assignConfidenceLabel, buildExecutiveSummary, assembleDossier, getDossierData } from "./dossier.js";

// ---------------------------------------------------------------------------
// Fake DB infrastructure (mirrors presentation.test.ts)
// ---------------------------------------------------------------------------

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
    this.db.runs.push({ sql: this.sql, bindings: this.bindings });
    if (this.db.runError) throw this.db.runError;
    return { success: true, meta: { changes: 1 } };
  }
}

class FakeDb {
  runs: Array<{ sql: string; bindings: unknown[] }> = [];
  runError: Error | null = null;
  private firstQueue = new Map<string, unknown[]>();
  private allQueue = new Map<string, unknown[]>();

  queueFirst(fragment: string, rows: unknown[]) {
    this.firstQueue.set(fragment, [...rows]);
  }

  queueAll(fragment: string, rows: unknown[]) {
    this.allQueue.set(fragment, [...rows]);
  }

  prepare(sql: string) {
    return new FakePreparedStatement(sql, this);
  }

  consumeFirst<T>(sql: string): T | null {
    const entry = Array.from(this.firstQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((left, right) => right[0].length - left[0].length)[0];
    if (!entry) return null;
    const [, rows] = entry;
    const [next, ...rest] = rows as T[];
    this.firstQueue.set(entry[0], rest);
    return next ?? null;
  }

  consumeAll<T>(sql: string): T[] {
    const entry = Array.from(this.allQueue.entries()).find(([fragment]) => sql.includes(fragment));
    return (entry?.[1] as T[]) ?? [];
  }
}

function makeEnv(db: FakeDb) {
  return { DB: db as unknown as D1Database } as any;
}

// ---------------------------------------------------------------------------
// Unit tests: assignConfidenceLabel
// ---------------------------------------------------------------------------

describe("assignConfidenceLabel", () => {
  it("returns high when supported, confidence >= 0.7, and >= 3 support evidence", () => {
    const result = assignConfidenceLabel("supported", 0.8, 4, 5);
    assert.equal(result.label, "high");
    assert.ok(result.reasons.some((r) => r.includes("4 supporting")));
  });

  it("returns medium when supported but only 2 support evidence", () => {
    const result = assignConfidenceLabel("supported", 0.5, 2, 3);
    assert.equal(result.label, "medium");
  });

  it("returns medium for contested with confidence >= 0.4 and >= 2 evidence", () => {
    const result = assignConfidenceLabel("contested", 0.5, 1, 3);
    assert.equal(result.label, "medium");
  });

  it("returns low for unresolved with no evidence", () => {
    const result = assignConfidenceLabel("unresolved", 0, 0, 0);
    assert.equal(result.label, "low");
    assert.ok(result.reasons.some((r) => r.includes("No evidence")));
  });

  it("returns low for supported with confidence below 0.4", () => {
    const result = assignConfidenceLabel("supported", 0.3, 1, 1);
    assert.equal(result.label, "low");
  });

  it("returns low for refuted status", () => {
    const result = assignConfidenceLabel("refuted", 0.9, 5, 6);
    assert.equal(result.label, "low");
  });

  it("threshold boundary: supported at exactly 0.7 with 3 support", () => {
    const result = assignConfidenceLabel("supported", 0.7, 3, 4);
    assert.equal(result.label, "high");
  });

  it("threshold boundary: contested at exactly 0.4 with 2 evidence", () => {
    const result = assignConfidenceLabel("contested", 0.4, 1, 2);
    assert.equal(result.label, "medium");
  });
});

// ---------------------------------------------------------------------------
// Unit tests: buildExecutiveSummary
// ---------------------------------------------------------------------------

describe("buildExecutiveSummary", () => {
  it("generates correct summary with position and high contestation", () => {
    const result = buildExecutiveSummary(
      { completed_rounds: 3, total_rounds: 5, participant_count: 4, contribution_count: 12 },
      { label: "Nuclear is viable", support_pct: 72 },
      "high",
      "moderate",
      "3/5 rounds completed.",
    );
    assert.ok(result.includes("3 of 5 rounds"));
    assert.ok(result.includes("4 participants"));
    assert.ok(result.includes("12 entries"));
    assert.ok(result.includes("72% support"));
    assert.ok(result.includes("Nuclear is viable"));
    assert.ok(result.includes("Significant contestation"));
    assert.ok(result.includes("Confidence: moderate"));
  });

  it("handles 0 positions", () => {
    const result = buildExecutiveSummary(
      { completed_rounds: 1, total_rounds: 1, participant_count: 1, contribution_count: 1 },
      null,
      "low",
      "emerging",
      "1/1 rounds completed.",
    );
    assert.ok(result.includes("No clear position"));
    assert.ok(result.includes("1 participant"));
    assert.ok(result.includes("1 entry."));
  });

  it("handles singular grammar for 1 participant", () => {
    const result = buildExecutiveSummary(
      { completed_rounds: 2, total_rounds: 3, participant_count: 1, contribution_count: 5 },
      null,
      "moderate",
      "strong",
      "2/3 rounds completed.",
    );
    assert.ok(result.includes("1 participant contributing"));
    assert.ok(!result.includes("participants"));
  });

  it("handles 0 contributions", () => {
    const result = buildExecutiveSummary(
      { completed_rounds: 0, total_rounds: 3, participant_count: 0, contribution_count: 0 },
      null,
      "low",
      "emerging",
      "0/3 rounds completed.",
    );
    assert.ok(result.includes("No contributions were recorded"));
  });
});

// ---------------------------------------------------------------------------
// Unit tests: assembleDossier
// ---------------------------------------------------------------------------

function queueStandardDossierData(db: FakeDb, options: {
  claims?: any[];
  superseded?: any[];
  evidenceAggs?: any[];
  evidenceSnippets?: any[];
  contradictions?: any[];
  stats?: any;
  verdict?: any;
  snapshotRevision?: number;
} = {}) {
  db.queueAll("relation_kind = 'supersession'", options.superseded ?? []);
  db.queueAll("LEFT JOIN beings b ON b.id = c.being_id", options.claims ?? []);
  db.queueAll("GROUP BY cre.claim_id", options.evidenceAggs ?? []);
  db.queueAll("JOIN contributions co ON co.id", options.evidenceSnippets ?? []);
  db.queueAll("relation_kind = 'contradiction'", options.contradictions ?? []);
  db.queueFirst("completed_rounds", [options.stats ?? {
    completed_rounds: 3,
    total_rounds: 5,
    participant_count: 4,
    contribution_count: 10,
  }]);
  db.queueFirst("FROM verdicts", [options.verdict ?? {
    confidence: "moderate",
    positions_json: JSON.stringify([{ label: "Position A", strength: 60, contributionIds: ["con_1"], aggregateScore: 70, stanceCounts: { support: 3, oppose: 1, neutral: 0 } }]),
  }]);
  // First call: read existing revision (null = first assembly), used by assembleDossier before insert
  db.queueFirst("FROM dossier_snapshots", [options.snapshotRevision != null ? { revision: options.snapshotRevision } : null]);
}

describe("assembleDossier", () => {
  it("assembles dossier with best-supported and most-contested claims", async () => {
    const db = new FakeDb();
    queueStandardDossierData(db, {
      claims: [
        { id: "clm_1", body: "Claim 1", contribution_id: "con_1", being_id: "bng_1", being_handle: "alice", verifiability: "empirical", resolution_status: "supported", resolution_confidence: 0.8 },
        { id: "clm_2", body: "Claim 2", contribution_id: "con_2", being_id: "bng_2", being_handle: "bob", verifiability: "comparative", resolution_status: "contested", resolution_confidence: 0.5 },
      ],
      evidenceAggs: [
        { claim_id: "clm_1", support_weight: 3, challenge_weight: 0.5, total_evidence: 4, support_evidence_count: 3, challenge_evidence_count: 1 },
        { claim_id: "clm_2", support_weight: 1, challenge_weight: 2, total_evidence: 3, support_evidence_count: 1, challenge_evidence_count: 2 },
      ],
      evidenceSnippets: [
        { claim_id: "clm_1", contribution_id: "con_3", being_handle: "carol", evidence_kind: "support", excerpt: "Evidence for claim 1", weight: 0.8 },
      ],
      contradictions: [
        { target_claim_id: "clm_2", source_claim_id: "clm_3", source_body: "Counter claim", confidence: 0.7 },
      ],
    });

    const result = await assembleDossier(makeEnv(db), "top_1");
    assert.ok(result);
    assert.equal(result.assemblyMethod, "deterministic_v1");
    assert.equal(result.bestSupportedClaims.length, 1);
    assert.equal(result.bestSupportedClaims[0].claimId, "clm_1");
    // clm_2 is most contested (challenge_weight=2), clm_1 also appears (challenge_weight=0.5)
    assert.equal(result.mostContestedClaims.length, 2);
    assert.equal(result.mostContestedClaims[0].claimId, "clm_2");
    assert.equal(result.mostContestedClaims[0].strongestContradiction?.claimId, "clm_3");
    assert.equal(result.claimSectionEmpty, false);

    // Verify schema validation passes
    DossierDataSchema.parse(result);
  });

  it("handles supersession dedup — superseded claims excluded", async () => {
    const db = new FakeDb();
    queueStandardDossierData(db, {
      superseded: [{ target_claim_id: "clm_old" }],
      claims: [
        { id: "clm_old", body: "Old claim", contribution_id: "con_1", being_id: "bng_1", being_handle: "alice", verifiability: "empirical", resolution_status: "supported", resolution_confidence: 0.9 },
        { id: "clm_new", body: "New claim", contribution_id: "con_2", being_id: "bng_1", being_handle: "alice", verifiability: "empirical", resolution_status: "supported", resolution_confidence: 0.8 },
      ],
      evidenceAggs: [
        { claim_id: "clm_old", support_weight: 5, challenge_weight: 0, total_evidence: 5, support_evidence_count: 5, challenge_evidence_count: 0 },
        { claim_id: "clm_new", support_weight: 3, challenge_weight: 0, total_evidence: 3, support_evidence_count: 3, challenge_evidence_count: 0 },
      ],
    });

    const result = await assembleDossier(makeEnv(db), "top_1");
    assert.ok(result);
    // clm_old should be excluded despite higher score
    assert.equal(result.bestSupportedClaims.length, 1);
    assert.equal(result.bestSupportedClaims[0].claimId, "clm_new");
  });

  it("handles empty claims table — summary + positions only", async () => {
    const db = new FakeDb();
    queueStandardDossierData(db, { claims: [] });

    const result = await assembleDossier(makeEnv(db), "top_1");
    assert.ok(result);
    assert.equal(result.bestSupportedClaims.length, 0);
    assert.equal(result.mostContestedClaims.length, 0);
    assert.equal(result.claimSectionEmpty, true);
    assert.ok(result.executiveSummary.length > 0);
  });

  it("handles claims with zero evidence — all confidence = low", async () => {
    const db = new FakeDb();
    queueStandardDossierData(db, {
      claims: [
        { id: "clm_1", body: "Claim 1", contribution_id: "con_1", being_id: "bng_1", being_handle: "alice", verifiability: "empirical", resolution_status: "unresolved", resolution_confidence: 0 },
      ],
      evidenceAggs: [],
    });

    const result = await assembleDossier(makeEnv(db), "top_1");
    assert.ok(result);
    // No claims pass ranking filters (net_support > 0 requires evidence)
    assert.equal(result.bestSupportedClaims.length, 0);
    assert.equal(result.mostContestedClaims.length, 0);
    assert.equal(result.claimSectionEmpty, true);
  });

  it("claims with all support — best-supported only, no contested", async () => {
    const db = new FakeDb();
    queueStandardDossierData(db, {
      claims: [
        { id: "clm_1", body: "Claim 1", contribution_id: "con_1", being_id: "bng_1", being_handle: "alice", verifiability: "empirical", resolution_status: "supported", resolution_confidence: 0.9 },
      ],
      evidenceAggs: [
        { claim_id: "clm_1", support_weight: 4, challenge_weight: 0, total_evidence: 4, support_evidence_count: 4, challenge_evidence_count: 0 },
      ],
    });

    const result = await assembleDossier(makeEnv(db), "top_1");
    assert.ok(result);
    assert.equal(result.bestSupportedClaims.length, 1);
    assert.equal(result.mostContestedClaims.length, 0);
  });

  it("claims with only challenge — contested only, no best-supported", async () => {
    const db = new FakeDb();
    queueStandardDossierData(db, {
      claims: [
        { id: "clm_1", body: "Claim 1", contribution_id: "con_1", being_id: "bng_1", being_handle: "alice", verifiability: "empirical", resolution_status: "contested", resolution_confidence: 0.5 },
      ],
      evidenceAggs: [
        { claim_id: "clm_1", support_weight: 0, challenge_weight: 3, total_evidence: 3, support_evidence_count: 0, challenge_evidence_count: 3 },
      ],
    });

    const result = await assembleDossier(makeEnv(db), "top_1");
    assert.ok(result);
    assert.equal(result.bestSupportedClaims.length, 0);
    assert.equal(result.mostContestedClaims.length, 1);
    assert.equal(result.mostContestedClaims[0].strongestContradiction, null);
  });

  it("contestation with contradiction relations only (no challenge evidence)", async () => {
    const db = new FakeDb();
    queueStandardDossierData(db, {
      claims: [
        { id: "clm_1", body: "Claim 1", contribution_id: "con_1", being_id: "bng_1", being_handle: "alice", verifiability: "empirical", resolution_status: "contested", resolution_confidence: 0.5 },
      ],
      evidenceAggs: [
        { claim_id: "clm_1", support_weight: 2, challenge_weight: 0, total_evidence: 2, support_evidence_count: 2, challenge_evidence_count: 0 },
      ],
      contradictions: [
        { target_claim_id: "clm_1", source_claim_id: "clm_2", source_body: "Counter", confidence: 0.6 },
      ],
    });

    const result = await assembleDossier(makeEnv(db), "top_1");
    assert.ok(result);
    assert.equal(result.mostContestedClaims.length, 1);
    assert.equal(result.mostContestedClaims[0].strongestContradiction?.confidence, 0.6);
    // Also appears as best-supported since net_support > 0
    assert.equal(result.bestSupportedClaims.length, 1);
  });

  it("no supersession relations — all claims participate", async () => {
    const db = new FakeDb();
    queueStandardDossierData(db, {
      superseded: [],
      claims: [
        { id: "clm_1", body: "A", contribution_id: "con_1", being_id: "bng_1", being_handle: "a", verifiability: "empirical", resolution_status: "supported", resolution_confidence: 0.8 },
        { id: "clm_2", body: "B", contribution_id: "con_2", being_id: "bng_2", being_handle: "b", verifiability: "empirical", resolution_status: "supported", resolution_confidence: 0.7 },
      ],
      evidenceAggs: [
        { claim_id: "clm_1", support_weight: 3, challenge_weight: 0, total_evidence: 3, support_evidence_count: 3, challenge_evidence_count: 0 },
        { claim_id: "clm_2", support_weight: 2, challenge_weight: 0, total_evidence: 2, support_evidence_count: 2, challenge_evidence_count: 0 },
      ],
    });

    const result = await assembleDossier(makeEnv(db), "top_1");
    assert.ok(result);
    assert.equal(result.bestSupportedClaims.length, 2);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: getDossierData
// ---------------------------------------------------------------------------

describe("getDossierData", () => {
  it("returns parsed dossier data from snapshot", async () => {
    const db = new FakeDb();
    const payload = {
      assembledAt: "2026-04-01T00:00:00.000Z",
      assemblyMethod: "deterministic_v1",
      revision: 1,
      executiveSummary: "Summary",
      bestSupportedClaims: [],
      mostContestedClaims: [],
      claimSectionEmpty: true,
    };
    db.queueFirst("FROM dossier_snapshots", [{ snapshot_json: JSON.stringify(payload) }]);

    const result = await getDossierData(makeEnv(db), "top_1");
    assert.ok(result);
    assert.equal(result.executiveSummary, "Summary");
    assert.equal(result.claimSectionEmpty, true);
  });

  it("returns null when no snapshot exists", async () => {
    const db = new FakeDb();
    const result = await getDossierData(makeEnv(db), "top_1");
    assert.equal(result, null);
  });

  it("returns null on invalid JSON", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM dossier_snapshots", [{ snapshot_json: "not json" }]);
    const result = await getDossierData(makeEnv(db), "top_1");
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// Schema validation: VerdictPresentationSchema with and without dossier
// ---------------------------------------------------------------------------

describe("VerdictPresentationSchema dossier extension", () => {
  const basePresentation = {
    topicId: "top_1",
    title: "Test Topic",
    domain: "energy",
    publishedAt: "2026-04-01T00:00:00.000Z",
    status: "published",
    headline: { label: "Verdict", text: "Summary text", stance: "mixed" },
    summary: "Topic summary.",
    confidence: { label: "moderate", score: 0.6, explanation: "3/5 rounds." },
    scoreBreakdown: { completedRounds: 3, totalRounds: 5, participantCount: 4, contributionCount: 12, terminalizationMode: "full_template" },
    narrative: [],
    highlights: [],
    claimGraph: { available: false, nodes: [], edges: [] },
  };

  it("passes without dossier field", () => {
    const result = VerdictPresentationSchema.safeParse(basePresentation);
    assert.ok(result.success);
    assert.equal(result.data.dossier, undefined);
  });

  it("passes with valid dossier field", () => {
    const dossier = {
      assembledAt: "2026-04-01T00:00:00.000Z",
      assemblyMethod: "deterministic_v1",
      revision: 1,
      executiveSummary: "Summary",
      bestSupportedClaims: [],
      mostContestedClaims: [],
      claimSectionEmpty: true,
    };
    const result = VerdictPresentationSchema.safeParse({ ...basePresentation, dossier });
    assert.ok(result.success);
    assert.ok(result.data.dossier);
    assert.equal(result.data.dossier.executiveSummary, "Summary");
  });
});
