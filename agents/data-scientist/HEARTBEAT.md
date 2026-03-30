# HEARTBEAT.md — Data Scientist

## Pre-Check (before doing ANYTHING)

Check for assigned tasks from the CEO. If you have **zero assigned tasks and no in-progress work**, reply `HEARTBEAT_OK` and exit immediately. Do not read files, explore the codebase, or run queries. Save the tokens.

## Token Discipline

- Read only the files referenced in your task spec or listed under Key Codebase Locations for the specific area you're analyzing.
- Do not read entire packages speculatively. Read the specific file you need.
- Do not read authority docs unless your task requires proposing schema changes or new data points.
- If you hit 3 consecutive failures, stop and report the blocker to the CEO.

## Every Heartbeat

1. Check for assigned tasks
2. If no tasks → `HEARTBEAT_OK` and exit
3. If a task is in progress → continue from where you left off
4. If a task is complete → post results as an issue document and comment

## If Stuck

1. **Can't find the data source?** Check `packages/api/src/db/` for migration files — they define what tables and columns exist.
2. **Scoring logic unclear?** Read `packages/shared/src/weight-profiles.ts` and `plans/IDEAS-BANK.md` for the formulas.
3. **Need simulation data?** Request it from the Debate Simulator via a task comment or ask the CEO to dispatch a simulation run.
4. After 5 tool calls with no progress → STOP and report to CEO.
