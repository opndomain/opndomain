# D1 Environments

This repo uses three D1 contexts:

- Local: Wrangler local development database
- Preview: Cloudflare D1 `opndomain-db-preview`
- Production: Cloudflare D1 `opndomain-db`

## Current Cloudflare Resources

- Production D1 `opndomain-db`: `0b856e56-7996-471f-bb40-cc8c41897cde`
- Preview D1 `opndomain-db-preview`: `467ed2b1-d4fb-4a44-9f0d-072225ee285d`

All three workers bind the same `DB` name:

- [packages/api/wrangler.toml](/D:/opndomain/packages/api/wrangler.toml)
- [packages/router/wrangler.toml](/D:/opndomain/packages/router/wrangler.toml)
- [packages/mcp/wrangler.toml](/D:/opndomain/packages/mcp/wrangler.toml)

The binding name stays constant. Environment separation is done by the underlying D1 IDs.

## What Changed

Previously, `preview_database_id` matched `database_id` in every worker, so preview deployments and remote preview-oriented D1 work hit production data.

That is now split:

- `database_id` -> production `opndomain-db`
- `preview_database_id` -> preview `opndomain-db-preview`

KV already had separate preview namespaces. D1 was the only shared binding.

## Operator Rules

- Never assume `--remote` is safe by itself.
- For one-off setup, migration, or inspection work, prefer targeting the database by explicit name.
- Treat any remote `INSERT`, `UPDATE`, `DELETE`, `ALTER TABLE`, or `--file` execution as production-impacting unless you have explicitly pointed it at `opndomain-db-preview`.
- Preview D1 is isolated. R2 is not. Preview workers still share `opndomain-public` and `opndomain-snapshots`.

## Safe and Risky Commands

Usually safe:

- `pnpm.cmd exec wrangler d1 execute opndomain-db-preview --remote --command "SELECT COUNT(*) AS count FROM topics;"`
- `pnpm.cmd exec wrangler d1 execute opndomain-db --remote --command "SELECT COUNT(*) AS count FROM topics;"`
- `pnpm db:migrate:local`

Mutation-capable and must be targeted deliberately:

- `pnpm db:migrate:remote`
- `pnpm db:migrate:remote:preview`
- `pnpm.cmd exec wrangler d1 execute <db-name> --remote --file <sql-file>`
- `pnpm.cmd exec wrangler d1 execute <db-name> --remote --command "INSERT ..."`
- `pnpm.cmd exec wrangler d1 execute <db-name> --remote --command "UPDATE ..."`
- `pnpm.cmd exec wrangler d1 execute <db-name> --remote --command "DELETE ..."`

## Migration Workflow

Use preview first, then production.

Preview:

```bash
pnpm db:migrate:remote:preview
```

Production:

```bash
pnpm db:migrate:remote
```

The migration script now covers `001` through `013` and supports explicit database targeting via `--database`.

Direct package-level equivalents:

```bash
pnpm --filter @opndomain/api db:migrate:remote:preview
pnpm --filter @opndomain/api db:migrate:remote
```

## Verification

List D1 databases:

```bash
pnpm.cmd exec wrangler d1 list
```

Verify production row counts:

```bash
pnpm.cmd exec wrangler d1 execute opndomain-db --remote --command "SELECT COUNT(*) AS count FROM topic_candidates;"
```

Verify preview row counts:

```bash
pnpm.cmd exec wrangler d1 execute opndomain-db-preview --remote --command "SELECT COUNT(*) AS count FROM topic_candidates;"
```

Verify schema journal on preview:

```bash
pnpm.cmd exec wrangler d1 execute opndomain-db-preview --remote --command "SELECT tag FROM schema_migrations ORDER BY tag;"
```

Acceptance checks:

- Production and preview resolve to different D1 resources
- Preview schema includes migrations `001` through `013`
- Preview-only writes do not affect production row counts

## Wrangler Output Quirk

Wrangler's output labels are not fully reliable here.

- `wrangler deploy` may print the preview D1 ID in the binding summary even when the live public worker continues serving production-backed data
- `wrangler d1 execute opndomain-db --remote` may label the production database as a "preview database" in its output

For this repo, the safer verification method is:

- query the named database directly, for example `opndomain-db` vs `opndomain-db-preview`
- compare those counts with the live API surface
- treat live data behavior plus explicit DB-name queries as the source of truth, not Wrangler's "preview database" wording

## Runtime Behavior Note

`OPNDOMAIN_ENV` remains `development` in the worker configs. This D1 split does not change runtime behavior flags, email behavior, or rate limits. Treat that as a separate environment-hardening task.
