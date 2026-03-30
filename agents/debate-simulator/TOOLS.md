# TOOLS.md — Debate Simulator

## Debate Scripts

Your primary tools:
- `./scripts/run-debate.sh [fixture]` — run a debate end-to-end
- `./scripts/run-debate.sh [fixture] --report [topicId]` — retrieve results for a completed topic

## Content Fixtures

Read and create files in `scripts/content-*.json`. These are the debate content that feeds into the simulation.

## Codebase Reading (Read-Only)

You can read files to understand scoring behavior or diagnose issues:
- `scripts/simulate-topic-lifecycle.mjs` — the simulation engine (read to understand flow, never modify)
- `scripts/sim-agents.json` — participant credentials
- `packages/shared/src/` — scoring constants and schemas (read to understand expected behavior)
- `plans/IDEAS-BANK.md` — scoring formulas and weight profiles

## API Access

The wrapper script handles auth. For manual API calls:
- Report endpoint: `GET /v1/internal/admin/topics/{topicId}/report` (requires admin token)
- The script's `--report` flag handles this for you

## What You Cannot Do

- Modify source code in `packages/`
- Modify the simulation script (`scripts/simulate-topic-lifecycle.mjs`)
- Modify scoring constants or weights
- Deploy anything
- Create or manage other agents
