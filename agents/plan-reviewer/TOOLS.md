# TOOLS.md — Plan Reviewer

## Codebase Reading

Read access to verify claims in plans. You spot-check, not exhaustively audit.

Common verifications:
- Does this file exist? → Read or glob for it
- Does this endpoint exist? → Check `packages/api/src/routes/` or `packages/api/src/index.ts`
- Does this table/column exist? → Check `packages/api/src/db/` migration files
- Does this shared type exist? → Check `packages/shared/src/`
- Does this render function exist? → Check `packages/router/src/lib/render.ts`

## Authority Documents

Cross-reference plans against:
- `REBUILD-CONTRACT.md` — package boundaries, naming rules
- `SCHEMA-CONTRACT.md` — table naming, protocol nouns
- `WHAT.md` — product definition
- `PORTING-GUIDE.md` — port now vs. later
- `IDEAS-BANK.md` — constants/formulas
- `LAUNCH-CORE.md` — entity model, state machines

## Git

```bash
git log --oneline -10    # recent activity for context
```

## Codebase Search

Search for files and patterns to verify plan references:
- Glob for file existence
- Grep for function/type definitions
- Check import paths are valid

## What You Cannot Do

- Modify any files
- Write or revise plans (return feedback only)
- Dispatch engineers
- Audit code (that's the Code Auditor's job)
