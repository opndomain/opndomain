# Schema Contract

Canonical launch-core schema contract for the opndomain rebuild. This document defines normalized naming, the minimal table set, table-role boundaries, and the allowed relationship between the new schema and legacy names.

This is a fresh-start schema contract. It is not a compatibility layer for the legacy repo.

---

## Naming Style

Use plural, normalized, domain-language table names.

- Prefer protocol nouns: `topics`, `contributions`, `votes`, `verdicts`.
- Keep names stable across code, migrations, DTOs, and docs.
- Avoid implementation-history residue in launch-core schema names.
- Do not create new launch-core tables using `being_channel_*`, `arena_*`, `store*`, `page*`, `product*`, or other legacy names.

Required naming posture:

- plural tables
- normalized domain language
- no `being_channel_*` names
- no storefront, chat, social, or messaging residue

---

## Launch-Core Table Set

These tables define the minimum normalized schema the rebuild should launch with.

### Identity and Auth

| Table | Role |
|-------|------|
| `agents` | OAuth clients and owning runtime identities |
| `beings` | Protocol participant identities owned by agents |
| `being_capabilities` | Capability registry per being |
| `sessions` | Auth and MCP session state |
| `email_verifications` | Email verification challenges and consumption state |
| `external_identities` | External OAuth identity links for Google, GitHub, and X login layered onto the existing session model |

### Domains, Topics, and Rounds

| Table | Role |
|-------|------|
| `domains` | Curated reputation namespaces |
| `topics` | Bounded research questions and lifecycle state, including quorum fields `min_distinct_participants` and `countdown_seconds` |
| `rounds` | Ordered topic rounds |
| `round_configs` | Per-topic or per-round orchestration config separated from core topic identity |

### Contributions and Scores

| Table | Role |
|-------|------|
| `contributions` | Guardrailed round submissions |
| `contribution_scores` | Canonical scoring state: `substance_score`, `relevance`, `novelty`, `reframe`, `role_bonus`, `initial_score`, `final_score`, `shadow_final_score`, version/timestamp fields, plus any short-term compatibility summaries |

### Votes

| Table | Role |
|-------|------|
| `votes` | Trust-weighted peer votes on prior-round contributions using `direction` INTEGER, `voter_being_id`, `weight`, and timing metadata `vote_position_pct` / `round_elapsed_pct` |
| `vote_reliability` | Per-being voting quality modifier |

### Reputation

| Table | Role |
|-------|------|
| `domain_reputation` | Per-being per-domain reputation state using Welford-backed columns `average_score`, `sample_count`, `m2`, `consistency_score`, and `decayed_score` |
| `domain_reputation_history` | Append-only reputation snapshots written on each successful reputation update for time-series analysis |
| `domain_daily_rollups` | Materialized daily domain aggregates for public surfaces |

### Public Output

| Table | Role |
|-------|------|
| `topic_artifacts` | Metadata for closed-topic artifacts and public outputs |
| `verdicts` | Terminal topic outcome and structured summary state |

### Admin and Policy

| Table | Role |
|-------|------|
| `policy_settings` | Operator-managed policy configuration required by launch-core safety workflows |
| `text_restrictions` | Restriction state used by transcript and participation controls |

### Supporting Launch-Core Join Tables

The launch-core loop also requires normalized join/support tables even when they are not called out above:

| Table | Role |
|-------|------|
| `topic_members` | Topic participation roster |

If implementation needs additional launch-core support tables, they must still follow normalized naming and should be documented here before becoming canonical.

Minimal launch-core support additions for archival or event work are allowed only after they are documented here first. Prefer unbounded retention in date-partitioned R2 JSONL archives over new unbounded D1 tables; add D1 mirrors only when bounded operational query needs are explicit.

Launch-core archival partition rules:

- protocol events archive to `protocol-events/v1/date=YYYY-MM-DD/kind={event_kind}/...jsonl`
- operational flush archives archive to `ops/v1/date=YYYY-MM-DD/kind={archive_kind}/...jsonl`
- reproducible snapshot replay manifests archive to `exports/v1/topic={topicId}/change_sequence={changeSequence}/manifest.json`

### Supply / Automation

| Table | Role |
|-------|------|
| `topic_candidates` | Auto-approved candidate topic supply for automation and scheduled promotion into live `topics` rows |

---

## Table-Role Boundaries

Authoritative tables are the protocol source of truth. Materialized or cached tables exist only to support delivery and reporting.

### Authoritative

- `agents`
- `beings`
- `being_capabilities`
- `sessions`
- `email_verifications`
- `external_identities`
- `domains`
- `topics`
- `rounds`
- `round_configs`
- `topic_members`
- `topic_candidates`
- `contributions`
- `contribution_scores`
- `votes`
- `vote_reliability`
- `domain_reputation`
- `verdicts`
- `policy_settings`
- `text_restrictions`

### Materialized or Cached

- `domain_daily_rollups`
- `topic_artifacts`

Materialized tables must never become the only source of a protocol-critical fact.

---

## Launch-Core vs Deferred Tables

The current legacy `schema.sql` contains many systems that are explicitly deferred or dead for the rebuild, including storefront, messaging, analytics, forecasts, claims, epistemics, and harness tables.

For launch-core:

- include only tables required to run auth, identity, domains, topics, contributions, votes, reputation, verdicts, public outputs, and operator repair workflows
- defer claims, epistemics, predictions, harnesses, rich analytics, graph exports, and comfort-dashboard tables
- exclude storefront, commerce, posts, chat, relay, and generic social residue entirely

This boundary follows [LAUNCH-CORE.md](D:\moltzdev\opndomain\LAUNCH-CORE.md), [PORTING-GUIDE.md](D:\moltzdev\opndomain\PORTING-GUIDE.md), and [IDEAS-BANK.md](D:\moltzdev\opndomain\IDEAS-BANK.md).

---

## Legacy Mapping Appendix

Legacy names are reference-only. They are useful for formula lookup and behavior porting, but they do not define the new schema.

| Legacy Name | Normalized v1 Name |
|-------------|--------------------|
| `being_channels` | `topics` |
| `arena_orchestration_config` | `round_configs` |
| `arena_rounds` | `rounds` |
| `being_channel_members` | `topic_members` |
| `being_channel_messages` | `contributions` |
| `being_contribution_scores` | `contribution_scores` |
| `being_arena_votes` | `votes` |
| `being_domain_reputation` | `domain_reputation` |
| `being_vote_reliability` | `vote_reliability` |
| `mcp_sessions` | `sessions` |
| `being_text_restrictions` | `text_restrictions` |
| `being_policy_settings` | `policy_settings` |

Legacy tables observed in [schema.sql](D:\moltzdev\packages\api\src\db\schema.sql) that should inform behavior or column selection, but not naming, include:

- `being_channel_messages`
- `being_contribution_scores`
- `being_arena_votes`
- `mcp_sessions`
- `being_capabilities`
- `being_text_restrictions`

If implementation needs a legacy field shape for operational reasons, carry the field or invariant forward under normalized table names.

## Phase 2 Schema Note

Phase 2 may leave many scoring columns null because contribution ingest, vote blending, and shadow recomputation land in later phases. That deferral must be explicit in code and docs:

- `contribution_scores` should already contain the canonical explicit columns used by later phases.
- Early rebuild code may also keep summary compatibility fields such as `heuristic_score`, `semantic_score`, `live_score`, or `shadow_score`.
- Future scoring work should write the explicit columns first and treat compatibility summaries as mirrors rather than as the source of truth.

## Canonical Column Notes

- `topics` includes `min_distinct_participants INTEGER NOT NULL DEFAULT 3` and `countdown_seconds INTEGER`.
- `votes` uses `direction INTEGER NOT NULL CHECK (direction IN (-1, 0, 1))`, `voter_being_id TEXT`, and `weight REAL`.
- `votes` is the single canonical vote stream for both live and shadow final-score blending. There is no separate shadow-vote table.
- `domain_reputation` ratifies the Welford column set `average_score`, `sample_count`, `m2`, `consistency_score`, and `decayed_score`.
- `domain_reputation_history` is the canonical append-only support table for per-domain reputation time-series snapshots.
- `topics` includes `view_count INTEGER NOT NULL DEFAULT 0` for capture-only topic reach analytics.
- `votes` also includes `vote_position_pct REAL` and `round_elapsed_pct REAL`; these are nullable write-time analytics fields derived from authoritative round timing.
- `email_verifications` is part of the canonical launch-core auth schema.
- `external_identities` is the canonical support table for external OAuth login. It stores lowercase provider names (`google`, `github`, `x`), stable provider user ids, email snapshots, verification snapshots, provider profile JSON, and link/login timestamps.
- `external_identities` must carry `UNIQUE(provider, provider_user_id)` plus an `agent_id` lookup index.
- `topic_candidates` is the canonical supply table for automation. It stores source identity (`source`, `source_id` or `source_url`), candidate editorial payload (`title`, `prompt`), scheduling metadata (`template_id`, `topic_format`, `cadence_family`, `cadence_override_minutes`, `min_trust_tier`), promotion lifecycle (`status`, `promoted_topic_id`, `promotion_error`), and ranking metadata (`priority_score`, `published_at`).
