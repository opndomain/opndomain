import { DOMAIN_SEEDS } from "../data/domain-seeds.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { badRequest } from "../lib/errors.js";
import { createId } from "../lib/ids.js";
import type { ApiEnv } from "../lib/env.js";

export type DomainRecord = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  parent_domain_id: string | null;
  created_at: string;
  updated_at: string;
};

let seededDomainsPromise: Promise<void> | null = null;

export async function ensureSeedDomains(env: ApiEnv): Promise<void> {
  if (!seededDomainsPromise) {
    seededDomainsPromise = (async () => {
      // Phase 1: Insert parent domains (no parent_domain_id)
      const parents = DOMAIN_SEEDS.filter((s) => !s.parentId);
      await env.DB.batch(
        parents.map((seed) =>
          env.DB.prepare(
            `INSERT OR IGNORE INTO domains (id, slug, name, description, status)
             VALUES (?, ?, ?, ?, 'active')`,
          ).bind(seed.id, seed.slug, seed.name, seed.description),
        ),
      );

      // Phase 2: Insert children with parent_domain_id
      const children = DOMAIN_SEEDS.filter((s) => !!s.parentId);
      await env.DB.batch(
        children.map((seed) =>
          env.DB.prepare(
            `INSERT OR IGNORE INTO domains (id, slug, name, description, status, parent_domain_id)
             VALUES (?, ?, ?, ?, 'active', ?)`,
          ).bind(seed.id, seed.slug, seed.name, seed.description, seed.parentId!),
        ),
      );

      // Phase 3: Backfill parent_domain_id on existing rows that are missing it
      await env.DB.batch(
        children.map((seed) =>
          env.DB.prepare(
            `UPDATE domains SET parent_domain_id = ? WHERE id = ? AND parent_domain_id IS NULL`,
          ).bind(seed.parentId!, seed.id),
        ),
      );
    })();
  }

  await seededDomainsPromise;
}

export async function listDomains(env: ApiEnv): Promise<DomainRecord[]> {
  await ensureSeedDomains(env);
  return allRows<DomainRecord>(
    env.DB,
    `SELECT id, slug, name, description, status, parent_domain_id, created_at, updated_at
     FROM domains
     ORDER BY slug ASC`,
  );
}

export async function getDomain(env: ApiEnv, domainId: string): Promise<DomainRecord | null> {
  await ensureSeedDomains(env);
  return firstRow<DomainRecord>(
    env.DB,
    `SELECT id, slug, name, description, status, parent_domain_id, created_at, updated_at
     FROM domains
     WHERE id = ?`,
    domainId,
  );
}

export async function createDomain(
  env: ApiEnv,
  input: { slug: string; name: string; description?: string; parentDomainId?: string },
): Promise<DomainRecord> {
  if (input.parentDomainId) {
    const parent = await firstRow<{ id: string; parent_domain_id: string | null }>(
      env.DB,
      `SELECT id, parent_domain_id FROM domains WHERE id = ? AND status = 'active'`,
      input.parentDomainId,
    );
    if (!parent) {
      badRequest("invalid_parent_domain", "The specified parent domain does not exist or is inactive.");
    }
    if (parent.parent_domain_id !== null) {
      badRequest("invalid_parent_domain", "A subdomain cannot be nested under another subdomain. Parent must be a root domain.");
    }
  }

  const id = createId("dom");
  await runStatement(
    env.DB.prepare(
      `INSERT INTO domains (id, slug, name, description, status, parent_domain_id)
       VALUES (?, ?, ?, ?, 'active', ?)`,
    ).bind(id, input.slug, input.name, input.description ?? null, input.parentDomainId ?? null),
  );

  return (await getDomain(env, id)) as DomainRecord;
}
