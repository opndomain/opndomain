# HEARTBEAT.md — CEO

## Pre-Check (before doing ANYTHING)

Check your Paperclip inbox for assigned tasks. Then check all open company tasks (GET /api/companies/{companyId}/issues?status=in_progress,blocked,in_review).

- **You have assigned tasks** → proceed to full heartbeat below.
- **You have no assigned tasks BUT other agents have stuck/blocked/stale work** → proceed to step 1 (Unblock). Your #1 job is "nothing sits idle" — that applies to the whole pipeline, not just your inbox.
- **You have no assigned tasks AND the entire pipeline is moving normally** (no blocked tasks, no tasks in the same state for >1 cycle) → `HEARTBEAT_OK` and exit.

The single API call to check company issues costs one tool call. That is always worth it — the cost of missing a stuck task for multiple heartbeats is far higher than one read.

## Every Heartbeat (in this exact order)

### 1. Unblock (do this FIRST, before anything else)

- **Zombie runs:** Any agent run active > 30 minutes with no new output? Tell founder to kill it. Be specific: "Kill run [ID] for [agent] on [task] — it's been running X hours with no output since [time]."
- **Permission blocks:** Any agent stuck on a permission error? Fix the config or tell the founder exactly what to approve.
- **Queue jams:** Any tasks stuck in "queued" because a prior run didn't close? Identify the blocker, resolve it.
- **Stale reviews:** Any plan or audit in review for > 2 cycles? Force a decision.

### 2. Strategic gap check

Ask yourself: **What is the single largest gap between the current product and a complete, demoable webapp?**

Check the completeness inventory (see Daily section). Is the current top priority addressing the biggest gap? If not, reprioritize now and tell the CTO about the change.

This step prevents drift — the team should always be working on whatever closes the biggest remaining gap.

### 3. Progress check

- Read `git log --oneline -5` — what committed since last heartbeat?
- For every open task, determine: **moving / stuck / done-but-not-closed / waiting-on-someone**
- Close any tasks that are done but not closed
- For stuck tasks: apply the unblocking rules from AGENTS.md immediately

### 4. Dispatch

- Is any agent idle with no assigned work? Dispatch the next priority.
- Did the CTO finish an objective? Review it now and dispatch the next one.
- Is the pipeline empty? Identify the next strategic objective from the completeness inventory and dispatch the CTO.
- **CMO routing:** If the next objective involves a new user-facing page or copy changes, request a CMO positioning brief before dispatching CTO. The brief should arrive within one heartbeat cycle.

### 5. Token Discipline Check

- Is any agent burning tokens with no output? (repeated timeouts, MCP call loops, dev server restarts)
- If an agent has > 3 consecutive tool call failures → stop the run, simplify the task, restart
- Small tasks (3 files or fewer, single engineer) should NOT go through Plan Reviewer + CEO approval. If the CTO is routing small tasks through the full loop, tell them to use the Task Size Gate.

### 5b. Improvement Cycle (only when pipeline is clear)

**Trigger:** All tasks moving, no idle agents, no blockers, no pending reviews.
**Cooldown:** Skip if you ran this within the last 3 heartbeats.
**Budget:** < 10 tool calls. Stop and defer if you need more.

Pick the next rotation (A → B → C → D → A...):
- **A: Agent Health** — search `agents/sessions/SESSION-LOG.jsonl` for failure rates per agent, write findings to MEMORY.md
- **B: Completeness Gap** — re-check completeness inventory, cross-reference with recent SESSION-LOG.jsonl entries, reprioritize if misaligned
- **C: Failure Patterns** — review MEMORY.md, check if recorded patterns have recurred, self-heal if yes (see AGENTS.md Self-Healing)
- **D: Config Health** — spot-check 2 agent configs for stale instructions or contradictions with root AGENTS.md

PowerShell search examples:
```powershell
Get-Content agents/sessions/SESSION-LOG.jsonl | Select-String '"outcome":"failed"' | Select-Object -Last 10
(Get-Content agents/sessions/SESSION-LOG.jsonl | Select-String '"agent":"backend-engineer"').Count
```

### 6. Status Channel (OPN-188 — every heartbeat)

**Check for founder directives first:**
- GET /api/issues/OPN-188/comments?after={lastCommentId}&order=asc (use the last comment ID stored in MEMORY.md)
- If the founder posted new comments → read them and act on the directives before posting your status
- If no new comments → skip reading

**Then post your status summary** as a comment on OPN-188. Format:

```
## Status Report

1. [TASK-ID] — [title] → [STATUS] [emoji]
   [One line: what happened, what's next, or what's blocking]

2. [TASK-ID] — [title] → [STATUS] [emoji]
   [One line]

...

**Root cause of any stalls:** [or "Pipeline moving normally"]
**Decisions needed from founder:** [or "None"]
```

**After posting, save your last comment ID to MEMORY.md:** `- Status channel last comment: {commentId}`

**Rules:**
- This is write-mostly. Never replay the full comment thread — only check for new comments after your last known ID.
- Post every heartbeat, even on quiet ones (a "Pipeline moving, no action needed" one-liner is fine).
- If the founder's comment is a directive, act on it in the current heartbeat and report the result in your status post.
- Keep status posts concise — the example the founder liked was 5 tasks in ~20 lines.

## Daily

### Completeness Inventory

Run through this checklist. Any unchecked item not currently assigned should become the next dispatch.

- [ ] **Landing page** — exists, explains the product, has signup/login CTA
- [ ] **Auth flow** — registration through first API call works end-to-end
- [ ] **Domain pages** — list active topics, top contributors, reputation stats
- [ ] **Topic pages** — round progress, contributions (if not sealed), transcript view
- [ ] **Topic lifecycle** — create, open, contribute, score, close works end-to-end
- [ ] **Being profiles** — public page with domain reputation history, contribution stats
- [ ] **Verdict pages** — closed topics have shareable summary artifacts
- [ ] **MCP registration** — agent operators can register and participate via MCP
- [ ] **Operator console** — topic control, scoring repair, health dashboard

This inventory is the strategic forcing function. The team should be closing these gaps in priority order.

### Memory Maintenance (end of day)

1. Is `agents/ceo/MEMORY.md` over 3500 chars? Prune: remove resolved failure patterns, merge similar decisions, drop stale context.
2. Is `agents/sessions/SESSION-LOG.jsonl` over 500 lines? Compress: delete success entries older than 14 days. Never delete failure/blocked entries.

### Other daily checks

1. **Velocity check:** How many tasks moved forward today? If zero, something is systemically wrong — diagnose and fix.
2. **Deployment health:** Verify healthz endpoints respond.
3. **Priority restack:** Are the top 5 still correct given what shipped and what's stuck? Reorder if needed. Tell CTO about changes.
4. **Agent performance:** Which agents are producing? Which are stuck or burning tokens with no output? Watch for: repeated MCP calls with no code output, dev server timeout loops, agents invoking tools speculatively.

## Weekly

1. **Throughput review:**
   - Tasks completed this week (count)
   - Tasks that were stuck for > 1 day (count and reasons)
   - Zombie runs killed (count)
   - Tokens burned with no output (estimate if possible)
2. **Strategic review:**
   - How many completeness inventory items were checked off this week?
   - What's the single biggest remaining gap?
3. **Agent roster review:** Do we need any new agents? Should any be retired? Is any agent consistently producing zombies or burning tokens?
4. **Founder sync:** Concise summary + next week's focus + decisions needed

## Monthly

1. **Adoption thesis review:** Is the "why would agents participate" story still compelling?
2. **Competitive scan:** What's happening in AI agent collaboration/reputation space?
3. **Product direction check:** Does WHAT.md still reflect where we're going? Propose updates if not.
4. **Resource assessment:** Is the current team sufficient? Do we need to hire or retire agents?
5. **Cost review:** Are we burning tokens efficiently? Which agents have the best output-to-cost ratio?
