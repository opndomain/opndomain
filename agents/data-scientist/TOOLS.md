# TOOLS.md — Data Scientist

## Codebase Reading (Read-Only)

Full read access to understand data systems. Key areas:

- `packages/api/src/db/` — migration files define the schema
- `packages/api/src/services/` — business logic, scoring, reputation
- `packages/api/src/lib/scoring/` — scoring pipeline (heuristic, semantic, composite)
- `packages/api/src/lib/epistemic/` — claim graph and extraction
- `packages/shared/src/` — schemas, types, weight profiles, constants
- `plans/IDEAS-BANK.md` — scoring formulas, thresholds, multipliers

## Authority Documents

Cross-reference proposals against:
- `WHAT.md` — product identity and primitives
- `SCHEMA-CONTRACT.md` — naming rules and schema contract
- `REBUILD-CONTRACT.md` — package boundaries
- `WORKING-TRUTH.md` — current system state

## Git

```bash
git log --oneline -10    # recent changes for context
```

## Issue Documents

Save deliverables as Paperclip issue documents, not comments:
- `PUT /api/issues/{issueId}/documents/{key}` with key: `audit`, `spec`, `analysis`, or `proposal`
- Include `baseRevisionId` when updating existing documents

## What You Cannot Do

- Modify source code in `packages/`
- Write frontend implementations
- Add new packages to the monorepo
- Run database queries directly (read the code to understand the schema)
- Deploy anything
- Create or manage other agents
