#!/usr/bin/env node
// One-shot: purge orphan R2 objects + KV keys after the D1 wipe.
// Usage: CF_API_TOKEN=cfat_... node scripts/wipe-r2-kv-orphans.mjs

const TOKEN = process.env.CF_API_TOKEN;
if (!TOKEN) { console.error("CF_API_TOKEN env var required"); process.exit(1); }
const ACCOUNT = "9568667b3fc36faaa99e314652d14ff2";
const KV_NS = "ff5df177a0744154a17312a0fd0da2ca";
const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

async function cf(path, init = {}) {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function listR2(bucket, prefix) {
  const keys = [];
  let cursor;
  do {
    const qs = new URLSearchParams({ prefix, per_page: "1000" });
    if (cursor) qs.set("cursor", cursor);
    const res = await cf(`/r2/buckets/${bucket}/objects?${qs}`);
    for (const o of res.result ?? []) keys.push(o.key);
    cursor = res.result_info?.cursor || res.cursor;
    if (!cursor && res.result_info?.is_truncated) break;
  } while (cursor);
  return keys;
}

async function deleteR2(bucket, key) {
  // CF API uses path with the key URL-encoded after /objects/
  await cf(`/r2/buckets/${bucket}/objects/${encodeURIComponent(key)}`, { method: "DELETE" });
}

async function wipeR2Prefix(bucket, prefix) {
  console.log(`R2 ${bucket}/${prefix} — listing...`);
  const keys = await listR2(bucket, prefix);
  console.log(`R2 ${bucket}/${prefix} — ${keys.length} objects`);
  let i = 0;
  for (const k of keys) {
    await deleteR2(bucket, k);
    i++;
    if (i % 25 === 0) console.log(`  deleted ${i}/${keys.length}`);
  }
  console.log(`R2 ${bucket}/${prefix} — done (${i} deleted)`);
}

async function listKV() {
  const keys = [];
  let cursor;
  do {
    const qs = new URLSearchParams({ limit: "1000" });
    if (cursor) qs.set("cursor", cursor);
    const res = await cf(`/storage/kv/namespaces/${KV_NS}/keys?${qs}`);
    for (const k of res.result ?? []) keys.push(k.name);
    cursor = res.result_info?.cursor;
  } while (cursor);
  return keys;
}

async function bulkDeleteKV(keys) {
  // CF supports up to 10000 per bulk call
  const CHUNK = 1000;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const slice = keys.slice(i, i + CHUNK);
    await cf(`/storage/kv/namespaces/${KV_NS}/bulk`, {
      method: "DELETE",
      body: JSON.stringify(slice),
    });
    console.log(`  KV deleted ${Math.min(i + CHUNK, keys.length)}/${keys.length}`);
  }
}

async function wipeKV() {
  console.log("KV PUBLIC_CACHE — listing...");
  const all = await listKV();
  console.log(`KV PUBLIC_CACHE — ${all.length} keys`);
  // Preserve cron/* keys (they're operational state, not cache).
  const toDelete = all.filter((k) => !k.startsWith("cron/"));
  const preserved = all.length - toDelete.length;
  console.log(`KV — deleting ${toDelete.length}, preserving ${preserved} cron/* keys`);
  if (toDelete.length) await bulkDeleteKV(toDelete);
  console.log("KV — done");
}

(async () => {
  await wipeR2Prefix("opndomain-snapshots", "topics/");
  await wipeR2Prefix("opndomain-public", "artifacts/");
  await wipeKV();
  console.log("\nAll done.");
})().catch((e) => { console.error(e); process.exit(1); });
