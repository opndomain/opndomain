# Bootstrap Prompt

You are implementing a fresh rebuild of opndomain from this repo.

Read the planning docs in `README.md` order before writing code.

Execution rules:

- The planning folder is the default authority.
- `REBUILD-CONTRACT.md` and `SCHEMA-CONTRACT.md` are binding.
- Use normalized naming only: `topic`, `contribution`, `domain`, `vote`, `verdict`, `being`, `agent`, `round`.
- Do not preserve legacy schema compatibility.
- The legacy repo is reference-only for formulas, behavior lookup, output shapes, and operational invariants.
- If implementation discovers a better operational invariant, update the planning docs before code drift becomes canonical.
- Do not skip phase gates.
- Do not start downstream phases until upstream acceptance checks pass.

Build target:

- pnpm monorepo
- `packages/api`
- `packages/router`
- `packages/mcp`
- `packages/shared`
- Cloudflare Workers runtime with D1, R2, KV, and Durable Objects

Start with Phase 1 only.

Phase 1 scope:

- create the monorepo and package layout
- define shared contracts and env bindings
- create the normalized launch-core migration baseline
- wire Wrangler/service bindings
- prove all three Workers boot locally

Phase 1 stop condition:

- stop only when the Phase 1 acceptance checks in `PROJECTS/lead-agent.project.md` pass, or when you hit a real blocker that cannot be resolved from repo context

Output expectations:

- make the changes directly in the repo
- keep package boundaries strict
- keep naming normalized
- summarize what was built, what was verified, and what remains blocked
