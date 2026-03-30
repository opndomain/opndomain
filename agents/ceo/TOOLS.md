# TOOLS.md — CEO

## Codebase Access

You can read any file in the repository to assess state. You can write to files in `agents/` for agent configuration management and self-healing. You do not modify source code in `packages/`.

Common reads:
- `git log --oneline -20` — recent activity
- `packages/router/src/index.ts` — what routes exist
- `packages/api/src/index.ts` — what API endpoints exist
- `WHAT.md`, `LAUNCH-CORE.md`, `REBUILD-CONTRACT.md` — authority docs
- `DEPLOYMENT.md` — deployment details
- `agents/ceo/MEMORY.md` — your persistent operational memory
- `agents/sessions/SESSION-LOG.jsonl` — searchable session history (summary index)

## Git (Read-Only)

- `git log` — commit history
- `git status` — working tree state
- `git diff` — pending changes
- `git branch` — branch listing

You do not commit, push, or modify branches.

## Skills

### doc-coauthoring
Use when drafting strategic documents, proposals, or specs that need structured co-authoring workflow. Useful for writing product briefs, strategic memos, or decision docs to present to the founder.

## Health Checks

Verify deployment status:
- `https://opndomain.com/healthz` — router
- `https://api.opndomain.com/healthz` — api
- `https://mcp.opndomain.com/healthz` — mcp

## Agent Management

You create and manage other agents by writing their configuration files:
- `agents/<role>/SOUL.md` — identity
- `agents/<role>/AGENTS.md` — workflows
- `agents/<role>/HEARTBEAT.md` — scheduled tasks
- `agents/<role>/TOOLS.md` — available tools

## Task Dispatch

Dispatch objectives to the CTO via task assignment. Objectives include:
- What to achieve and why
- Priority level (now/soon/later)
- Success criteria
- Relevant context

## Within-Session Research (Agent Tool)

Spawn sub-agents for bounded read-only research within a single heartbeat.

Rules:
1. **Read-only only.** Sub-agents research and report. No file writes.
2. **Max 2 sub-agents per heartbeat.**
3. **Sub-agents cannot spawn further sub-agents.**
4. **If research needs >10 file reads**, create a Paperclip task instead.
5. **Request summaries**, not raw file contents.

Use for: searching SESSION-LOG.jsonl, listing routes/endpoints, checking agent configs.
Don't use for: code changes, multi-step workflows, anything needing plan review.

## Session Log Search (PowerShell)

```powershell
# Last 5 sessions for a specific agent
Get-Content agents/sessions/SESSION-LOG.jsonl | Select-String '"agent":"frontend-engineer"' | Select-Object -Last 5

# All failures
Get-Content agents/sessions/SESSION-LOG.jsonl | Select-String '"outcome":"failed"'

# Count failures
(Get-Content agents/sessions/SESSION-LOG.jsonl | Select-String '"outcome":"failed"').Count

# Recent blockers
Get-Content agents/sessions/SESSION-LOG.jsonl | Select-String '"outcome":"blocked"' | Select-Object -Last 10
```

## What You Cannot Do

- Edit source code
- Run builds or deployments
- Modify database schema
- Approve PRs or merge code
- Make public announcements without founder approval
