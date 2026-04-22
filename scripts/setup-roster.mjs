#!/usr/bin/env node

/**
 * setup-roster.mjs — One-time provisioning of persistent debate beings.
 *
 * Creates 5 beings under the admin agent, each with a fixed handle, display
 * name, bio, and persona. Saves being IDs and admin credentials to
 * scripts/roster.json (gitignored) so the debate scripts can reuse them.
 *
 * Usage:
 *   node scripts/setup-roster.mjs
 *   node scripts/setup-roster.mjs --api-base-url http://localhost:8787
 *   node scripts/setup-roster.mjs --dry-run
 *
 * If roster.json already exists, the script prints the existing roster and exits.
 * To re-provision, delete roster.json first.
 */

import fs from "node:fs";
import path from "node:path";

const ROSTER_PATH = path.resolve("scripts/roster.json");
const PERSONAS_PATH = path.resolve("scripts/roster-personas.json");

const ADMIN_CLIENT_ID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_CLIENT_SECRET = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";

function readFlag(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const API_BASE_URL = readFlag("--api-base-url", "https://api.opndomain.com");
const DRY_RUN = process.argv.includes("--dry-run");

async function api(apiPath, options = {}) {
  const { method = "GET", token, body, expectedStatus = 200 } = options;
  const url = `${API_BASE_URL}${apiPath}`;
  const headers = {
    accept: "application/json",
    ...(body ? { "content-type": "application/json" } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(`${method} ${apiPath} returned non-JSON: ${text.slice(0, 300)}`); }

  const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!expectedStatuses.includes(response.status)) {
    const code = parsed?.code ?? parsed?.error ?? "unknown";
    const message = parsed?.message ?? `HTTP ${response.status}`;
    throw new Error(`${method} ${apiPath} failed (${response.status}) ${code}: ${message}`);
  }
  return parsed.data ?? parsed;
}

async function main() {
  if (fs.existsSync(ROSTER_PATH)) {
    const existing = JSON.parse(fs.readFileSync(ROSTER_PATH, "utf-8"));
    console.log("Roster already exists at", ROSTER_PATH);
    console.log(`${existing.agents.length} beings under admin agent:\n`);
    for (const entry of existing.agents) {
      console.log(`  @${entry.handle} — ${entry.displayName} (being: ${entry.beingId})`);
    }
    console.log(`\nAdmin clientId: ${existing.adminClientId}`);
    console.log("To re-provision, delete roster.json first.");
    return;
  }

  const personas = JSON.parse(fs.readFileSync(PERSONAS_PATH, "utf-8"));
  console.log(`Provisioning ${personas.length} beings against ${API_BASE_URL}...\n`);

  if (DRY_RUN) {
    for (const p of personas) {
      console.log(`  [DRY RUN] Would create being @${p.handle} (${p.displayName})`);
      console.log(`            Bio: ${p.bio.slice(0, 80)}...`);
    }
    return;
  }

  // Step 1: Authenticate as admin
  console.log("Authenticating as admin...");
  const tokenData = await api("/v1/auth/token", {
    method: "POST",
    body: { grantType: "client_credentials", clientId: ADMIN_CLIENT_ID, clientSecret: ADMIN_CLIENT_SECRET },
  });
  const accessToken = tokenData.accessToken;
  const adminAgentId = tokenData.agent.id;
  console.log(`  Admin agent: ${adminAgentId}\n`);

  // Step 2: Check for existing beings under this agent (idempotent)
  const existingBeings = await api("/v1/beings", { token: accessToken });
  const existingByHandle = new Map(
    (Array.isArray(existingBeings) ? existingBeings : []).map((b) => [b.handle, b]),
  );

  // Step 3: Create each being
  const agents = [];

  for (const persona of personas) {
    const existing = existingByHandle.get(persona.handle);
    if (existing) {
      console.log(`  @${persona.handle} already exists (${existing.id}) — reusing`);
      // Update persona fields in case they changed
      await api(`/v1/beings/${existing.id}`, {
        method: "PATCH",
        token: accessToken,
        body: {
          displayName: persona.displayName,
          bio: persona.bio,
          personaText: persona.personaText,
          personaLabel: persona.personaLabel,
        },
      });
      agents.push({
        handle: persona.handle,
        displayName: persona.displayName,
        bio: persona.bio,
        personaText: persona.personaText,
        personaLabel: persona.personaLabel,
        beingId: existing.id,
      });
      continue;
    }

    console.log(`  Creating @${persona.handle}...`);
    const being = await api("/v1/beings", {
      method: "POST",
      token: accessToken,
      body: {
        handle: persona.handle,
        displayName: persona.displayName,
        bio: persona.bio,
        personaText: persona.personaText,
        personaLabel: persona.personaLabel,
      },
      expectedStatus: [200, 201],
    });
    console.log(`    Being: ${being.id} (@${being.handle})`);

    agents.push({
      handle: persona.handle,
      displayName: persona.displayName,
      bio: persona.bio,
      personaText: persona.personaText,
      personaLabel: persona.personaLabel,
      beingId: being.id,
    });
  }

  const roster = {
    adminClientId: ADMIN_CLIENT_ID,
    adminClientSecret: ADMIN_CLIENT_SECRET,
    adminAgentId,
    agents,
  };

  fs.writeFileSync(ROSTER_PATH, JSON.stringify(roster, null, 2));
  console.log(`\nRoster saved to ${ROSTER_PATH}`);
  console.log(`${agents.length} beings ready:`);
  for (const entry of agents) {
    console.log(`  @${entry.handle} — ${entry.displayName} (${entry.beingId})`);
  }
  console.log("\nIMPORTANT: roster.json contains admin secrets. It is gitignored — do not commit it.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});
