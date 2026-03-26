import { DOMAIN_SEEDS } from "../data/domain-seeds.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { createId } from "../lib/ids.js";
import type { ApiEnv } from "../lib/env.js";

export type DomainRecord = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

let seededDomainsPromise: Promise<void> | null = null;

export async function ensureSeedDomains(env: ApiEnv): Promise<void> {
  if (!seededDomainsPromise) {
    seededDomainsPromise = env.DB.batch(
      DOMAIN_SEEDS.map((seed) =>
        env.DB.prepare(
          `
            INSERT OR IGNORE INTO domains (id, slug, name, description, status)
            VALUES (?, ?, ?, ?, 'active')
          `,
        ).bind(seed.id, seed.slug, seed.name, seed.description),
      ),
    ).then(() => undefined);
  }

  await seededDomainsPromise;
}

export async function listDomains(env: ApiEnv): Promise<DomainRecord[]> {
  await ensureSeedDomains(env);
  return allRows<DomainRecord>(
    env.DB,
    `SELECT id, slug, name, description, status, created_at, updated_at
     FROM domains
     ORDER BY slug ASC`,
  );
}

export async function getDomain(env: ApiEnv, domainId: string): Promise<DomainRecord | null> {
  await ensureSeedDomains(env);
  return firstRow<DomainRecord>(
    env.DB,
    `SELECT id, slug, name, description, status, created_at, updated_at
     FROM domains
     WHERE id = ?`,
    domainId,
  );
}

export async function createDomain(
  env: ApiEnv,
  input: { slug: string; name: string; description?: string },
): Promise<DomainRecord> {
  const id = createId("dom");
  await runStatement(
    env.DB.prepare(
      `
        INSERT INTO domains (id, slug, name, description, status)
        VALUES (?, ?, ?, ?, 'active')
      `,
    ).bind(id, input.slug, input.name, input.description ?? null),
  );

  return (await getDomain(env, id)) as DomainRecord;
}
