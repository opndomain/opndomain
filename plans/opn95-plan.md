# Plan

## Objective

Redesign the closed-topic verdict experience so `/topics/:topicId` reads like a shareable editorial artifact with a clear verdict headline, visual confidence signal, narrative round summary, strongest quotes, and a per-topic claim graph when epistemic data exists.

## Scope Boundary

In scope:
- Closed-topic verdict presentation on the existing topic route
- Shared verdict-page DTOs and API read contract between `packages/api` and `packages/router`
- Terminalization/presentation changes needed to generate richer verdict payloads
- HTML artifact and OG image redesign driven from the same backend payload
- Per-topic claim-graph visualization using already-generated topic claims/relations when available
- Graceful fallback when claim data is absent or epistemic scoring is disabled

Explicitly out of scope:
- New scoring formulas, round rules, or domain-reputation logic
- New claim extraction / claim-resolution engines
- Cross-topic epistemic exploration or new epistemic reputation features
- Router-side D1 writes or a new package
- A client-side SPA rewrite or heavy visualization dependency

## Current State Assessment

- `packages/api/src/services/terminalization.ts` writes a minimal verdict: `summary`, `confidence`, `terminalization_mode`, and `reasoning_json.topContributionsPerRound` plus optional `epistemic` metadata.
- `packages/api/src/services/presentation.ts` republishes that verdict into `topic_artifacts`, but the artifact source shape is implicit JSON inside `reasoning_json`, not a typed cross-package contract.
- `packages/api/src/services/artifacts.ts` renders a bare HTML page and a custom pixel-font PNG card. Neither matches the editorial/shareable quality requested in [OPN-94](/OPN/issues/OPN-94).
- `packages/api/src/lib/snapshot-sync.ts` mirrors verdict summary and opaque reasoning into `state.json`, but not a dedicated verdict-page payload.
- `packages/router/src/index.ts` shows a small summary block, a generic share panel, and an embedded published HTML artifact. There is no narrative section, confidence visualization, highlight rail, or interactive graph.
- Authority docs say verdict/share surfaces are launch-core, but `WHAT.md`, `LAUNCH-CORE.md`, and `PORTING-GUIDE.md` still classify claims/epistemics as later-layer work. Because the founder explicitly requested a claim graph and the codebase already contains the topic-level claim engine, this plan treats claim visualization as presentation-only enhancement, feature-flagged, and non-blocking for closed-topic publication.

## Task Breakdown

### Task 1 - Back End Engineer

Objective: define the verdict-page contract and make API-generated presentation data the single source of truth for the redesigned page and artifacts.

Modify:
- `packages/shared/src/schemas.ts`
- `packages/shared/src/index.ts` and related exports/constants as needed
- `packages/api/src/routes/topics.ts`
- `packages/api/src/services/terminalization.ts`
- `packages/api/src/services/presentation.ts`
- `packages/api/src/services/artifacts.ts`
- `packages/api/src/lib/snapshot-sync.ts`
- API tests covering route, terminalization, presentation, and artifact generation

API contract:
- `GET /v1/topics/:topicId/verdict-page`
- Request: no body
- Response shape (shared Zod schema):
  - `topic`: `id`, `title`, `prompt`, `domainName`, `templateId`, `status`
  - `verdict`: `headline`, `summary`, `confidence`, `terminalizationMode`
  - `score`: `label`, `value`, `completedRounds`, `totalRounds`
  - `narrative`: ordered items per completed round with `roundKind`, `title`, `summary`, optional `turningPointContributionId`
  - `highlights`: 2-3 strongest excerpts with `contributionId`, `beingId`, `beingHandle`, `roundKind`, `excerpt`, `finalScore`, `kind`
  - `claimGraph`: `available`, `nodes`, `edges`, `focusClaimIds`, `unresolvedCount`
  - `share`: `title`, `description`, `ctaLabel`, `ctaHref`
  - `artifacts`: published asset keys/urls needed by router metadata

Data model approach:
- No new table.
- Keep `verdicts.summary` as the short canonical summary.
- Extend the structured payload stored in `verdicts.reasoning_json` with a typed `presentation` subtree that matches the shared DTO/factory shape.
- Database migration: none for this slice unless implementation proves a queryable column is required for landing-page reuse.

Artifact generation:
- `presentation.ts` must build one typed verdict-page payload and feed both the API route and `artifacts.ts`.
- Replace the current pixel-font card composition with a redesigned zero-dependency renderer that still outputs PNG, so social previews remain compatible without adding a heavy rendering stack.
- The published HTML artifact should become a share rendition of the same payload, not an unrelated second format.

Claim graph boundary:
- Read existing `claims`, `claim_relations`, and `claim_resolutions` only.
- No new claim extraction work.
- If claims are unavailable, return `claimGraph.available = false` and keep the verdict page fully functional.

What the frontend will consume:
- The router will consume only `GET /v1/topics/:topicId/verdict-page` for the redesigned verdict sections and will stop treating the R2 HTML artifact as the primary page-data source.

Acceptance criteria:
- Closed topics return a typed verdict-page payload rich enough for headline, score, narrative, highlights, and optional claim graph rendering.
- Artifact HTML and OG image are generated from the same typed payload.
- Insufficient-signal topics still suppress artifacts cleanly and expose a fallback-safe payload.
- Tests cover route shape, terminalization payload generation, claim-graph fallback behavior, and redesigned artifact publication.

Files that must not be modified:
- Authority docs in repo root
- `packages/router/**`
- `packages/mcp/**`

### Task 2 - Front End Engineer

Objective: rebuild the closed-topic topic page so the verdict reads as an editorial artifact inside the existing router shell.

Start condition:
- Begin only after Task 1 lands and the verdict-page API contract is stable.

Modify:
- `packages/router/src/index.ts`
- `packages/router/src/lib/render.ts`
- `packages/router/src/lib/tokens.ts`
- `packages/router/src/index.test.ts`
- Router files directly related to topic-page rendering only

Route/page:
- Modify `/topics/:topicId`

Data source:
- Read verdict page data from `GET /v1/topics/:topicId/verdict-page` through the existing API service fetch path
- Continue using snapshots/R2 only for transcript body and OG asset serving; do not add router-side D1 queries for verdict structures the API now owns

HTML structure approach:
- Keep `renderPage()` as the outer shell
- Add verdict-specific sections using existing `hero`, `card`, `grid`, `dataBadge`, and `transcriptBlock` patterns plus new render helpers where needed
- Proposed section order:
  1. Verdict masthead: headline, confidence gauge, metadata badges, primary share CTA
  2. Proof strip: strongest highlights / quotes with attribution and score
  3. Round narrative: ordered story arc of what changed across rounds
  4. Claim graph: inline SVG with lightweight progressive enhancement for hover/focus details
  5. Transcript and existing protocol state below the verdict layer

Responsive behavior:
- Mobile: single-column flow, compact score visualization, highlights stacked, claim graph collapses to a horizontally scrollable or simplified SVG with a text fallback summary
- Desktop: two-column upper fold with score/metadata opposite headline and highlights, narrative and graph sections full-width below
- No horizontal overflow in the page shell except the explicitly scrollable graph container on small screens

Visual identity requirements from `WHAT.md`:
- Warm editorial base
- Cyan/rust protocol accents
- Newsreader display, Inter body, IBM Plex Mono metadata
- Document-like layout with visible protocol structure rather than consumer-app chrome

Acceptance criteria:
- Closed topics surface a strong verdict-first layout before transcript details
- Confidence is visual, not just textual
- Highlights and narrative are readable without opening the raw artifact
- Claim graph is interactive when data exists and gracefully absent when it does not
- OG/Twitter metadata and share panel still reflect the published asset state
- Router tests cover the new sections and fallback states

Files that must not be modified:
- `packages/api/**`
- `packages/shared/**`
- Authority docs in repo root

## Cross-Package Contracts

- `packages/shared` defines all new verdict presentation schemas, enums, and DTOs.
- `packages/api` owns verdict payload generation, claim-graph reads, artifact generation, and cache invalidation.
- `packages/router` owns presentation only. It may transform API data for layout, but it must not invent its own verdict/claim query path.
- Router never writes D1.
- Artifact invalidation remains API-driven through the existing presentation reconcile path and topic/domain/landing cache purge hooks.

## Dependency Order

1. Back End Engineer ships the shared verdict-page contract and endpoint first.
2. Front End Engineer starts after the contract is stable.
3. CMO output from [OPN-96](/OPN/issues/OPN-96) informs headline/share copy polish but does not block the backend contract.
4. Debate-simulator findings from [OPN-97](/OPN/issues/OPN-97) inform which highlights and score dynamics deserve emphasis, but do not block the initial DTO.

## Risk Flags

- Authority-doc mismatch: claim graph / epistemic presentation is still documented as later-layer. This plan is acceptable only if we keep it as optional presentation over already-generated per-topic data rather than expanding launch-core protocol dependencies.
- Dirty worktree: router verdict/share files already have uncommitted changes. Engineers must work with those changes, not overwrite them.
- Zero-dependency constraint: no existing rendering/graph libraries are installed in `packages/api` or `packages/router`, so the graph and OG work should use inline SVG / lightweight DOM behavior instead of introducing a large stack mid-sprint.
- Data quality: some closed topics may have sparse or noisy claims/highlights. The API contract must degrade gracefully to headline + summary + narrative without broken layout.
- Contract drift risk: if router keeps using D1/R2 as primary verdict state after the new endpoint exists, the page and artifact can diverge. The implementation should remove that split-brain path.

## CEO Decision Needed

Because the authority docs still describe claims/epistemics as deferred, CEO approval should explicitly confirm this narrower position: per-topic claim graph visualization is approved as a presentation enhancement over existing data, but it does not authorize new cross-topic epistemic product scope.
