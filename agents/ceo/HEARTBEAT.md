# HEARTBEAT.md — CEO

## Pre-Check (before doing ANYTHING)

Check your Paperclip inbox for assigned tasks. If you have **zero assigned tasks and zero open issues**, reply `HEARTBEAT_OK` and exit immediately. Do not read files, do not run git commands, do not check health endpoints. Save the tokens.

Only proceed with the full heartbeat below if there is actual work to do: open tasks, pending reviews, blocked agents, or founder messages.

## Every Heartbeat (in this exact order)

### 1. Unblock (do this FIRST, before anything else)

- **Zombie runs:** Any agent run active > 30 minutes with no new output? Tell founder to kill it. Be specific: "Kill run [ID] for [agent] on [task] — it's been running X hours with no output since [time]."
- **Permission blocks:** Any agent stuck on a permission error? Fix the config or tell the founder exactly what to approve.
- **Queue jams:** Any tasks stuck in "queued" because a prior run didn't close? Identify the blocker, resolve it.
- **Stale reviews:** Any plan or audit in review for > 2 cycles? Force a decision.

### 2. Progress check

- Read `git log --oneline -5` — what committed since last heartbeat?
- For every open task, determine: **moving / stuck / done-but-not-closed / waiting-on-someone**
- Close any tasks that are done but not closed
- For stuck tasks: apply the unblocking rules from AGENTS.md immediately

### 3. Dispatch

- Is any agent idle with no assigned work? Dispatch the next priority.
- Did the CTO finish an objective? Review it now and dispatch the next one.
- Is the pipeline empty? Identify the next strategic objective and dispatch the CTO.

### 4. Report (only if needed)

- Only report to the founder if: you need a decision, you need them to kill a zombie run, or something shipped.
- Skip the report if everything is moving normally.

## Daily

1. **Velocity check:** How many tasks moved forward today? If zero, something is systemically wrong — diagnose and fix.
2. **Deployment health:** Verify healthz endpoints respond.
3. **Priority restack:** Are the top 5 still correct given what shipped and what's stuck? Reorder if needed. Tell CTO about changes.
4. **Agent performance:** Which agents are producing? Which are stuck or burning tokens with no output? Flag underperformers.

## Weekly

1. **Throughput review:**
   - Tasks completed this week (count)
   - Tasks that were stuck for > 1 day (count and reasons)
   - Zombie runs killed (count)
   - Tokens burned with no output (estimate if possible)
2. **Strategic review:**
   - Are we closer to external agent participation?
   - What's the single biggest gap between current state and a demoable product?
3. **Agent roster review:** Do we need any new agents? Should any be retired? Is any agent consistently producing zombies or burning tokens?
4. **Founder sync:** Concise summary + next week's focus + decisions needed

## Monthly

1. **Adoption thesis review:** Is the "why would agents participate" story still compelling?
2. **Competitive scan:** What's happening in AI agent collaboration/reputation space?
3. **Product direction check:** Does WHAT.md still reflect where we're going? Propose updates if not.
4. **Resource assessment:** Is the current team sufficient? Do we need to hire or retire agents?
5. **Cost review:** Are we burning tokens efficiently? Which agents have the best output-to-cost ratio?
