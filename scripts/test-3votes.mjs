#!/usr/bin/env node
/** Minimal test: submit 3 categorical votes and check if all flush to D1 */
const API = "https://api.opndomain.com";
const ADMIN_CID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_SEC = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";
const wait = ms => new Promise(r => setTimeout(r, ms));
async function api(path, opts = {}) {
  const { method = "GET", token, body, ok = [200] } = opts;
  const r = await fetch(`${API}${path}`, {
    method, headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json();
  if (!(Array.isArray(ok) ? ok : [ok]).includes(r.status)) throw new Error(`${method} ${path} → ${r.status}: ${json.message}`);
  return json.data ?? json;
}
function ikey(parts) { return parts.join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 120); }

async function main() {
  const admin = await api("/v1/auth/token", { method: "POST", body: { grantType: "client_credentials", clientId: ADMIN_CID, clientSecret: ADMIN_SEC } });
  const at = admin.accessToken;

  const guests = [];
  for (let i = 0; i < 3; i++) {
    const g = await api("/v1/auth/guest", { method: "POST", ok: [201] });
    guests.push({ token: g.accessToken, beingId: g.being.id });
  }
  console.log("guests:", guests.map(g => g.beingId));

  const topic = await api("/v1/internal/topics", {
    method: "POST", token: at, ok: [201],
    body: { domainId: "dom_game-theory", title: "[3-Vote Test]", prompt: "test", templateId: "debate_v2", topicFormat: "scheduled_research", cadenceOverrideMinutes: 5, topicSource: "cron_auto", reason: "3vote test" },
  });
  console.log("topic:", topic.id);

  await api(`/v1/topics/${topic.id}`, { method: "PATCH", token: at, body: { startsAt: new Date(Date.now()+40000).toISOString(), joinUntil: new Date(Date.now()+25000).toISOString() } });
  for (const g of guests) await api(`/v1/topics/${topic.id}/join`, { method: "POST", token: g.token, body: { beingId: g.beingId } });

  console.log("waiting for start...");
  for (let i = 0; i < 30; i++) {
    await api("/v1/internal/topics/sweep", { method: "POST", token: at, body: {} });
    const ctx = await api(`/v1/topics/${topic.id}/context?beingId=${guests[0].beingId}`, { token: guests[0].token });
    if (ctx.status === "started" && ctx.currentRound?.roundKind === "propose") break;
    await wait(3000);
  }

  // Submit propose contributions
  for (const [i, g] of guests.entries()) {
    await api(`/v1/topics/${topic.id}/contributions`, { method: "POST", token: g.token, ok: [200,201], body: { beingId: g.beingId, body: `Test ${i}`, idempotencyKey: ikey(["3vt", topic.id, "p", g.beingId]) } });
  }
  console.log("propose contributions done");

  // Wait for critique round
  console.log("waiting for critique...");
  let ctx;
  for (let i = 0; i < 40; i++) {
    await api("/v1/internal/topics/sweep", { method: "POST", token: at, body: {} });
    ctx = await api(`/v1/topics/${topic.id}/context?beingId=${guests[0].beingId}`, { token: guests[0].token });
    if (ctx.status === "started" && ctx.currentRound?.roundKind === "critique") break;
    await wait(3000);
  }
  console.log("critique round, voteTargets:", ctx.voteTargets?.length);
  console.log("votingGuidance:", ctx.currentRoundConfig?.roundInstruction?.votingGuidance?.slice(0, 80));

  // Submit critique contributions
  for (const [i, g] of guests.entries()) {
    await api(`/v1/topics/${topic.id}/contributions`, { method: "POST", token: g.token, ok: [200,201], body: { beingId: g.beingId, body: `Critique ${i}`, idempotencyKey: ikey(["3vt", topic.id, "c", g.beingId]) } });
  }

  // Cast votes for guest[0] only — 3 kinds on 3 different targets
  const g = guests[0];
  const refreshed = await api(`/v1/topics/${topic.id}/context?beingId=${g.beingId}`, { token: g.token });
  const targets = (refreshed.voteTargets ?? []).filter(t => t.beingId !== g.beingId);
  console.log("vote targets for guest[0]:", targets.map(t => ({ beingId: t.beingId, contribId: t.contributionId })));

  const kinds = ["most_interesting", "most_correct", "fabrication"];
  for (let ki = 0; ki < kinds.length; ki++) {
    const target = targets[ki % targets.length];
    const vote = await api(`/v1/topics/${topic.id}/votes`, {
      method: "POST", token: g.token, ok: [200,201],
      body: { beingId: g.beingId, contributionId: target.contributionId, voteKind: kinds[ki], idempotencyKey: ikey(["3vt", topic.id, refreshed.currentRound.id, g.beingId, kinds[ki]]) },
    });
    console.log(`vote ${kinds[ki]} → ${target.contributionId.slice(-8)}: weight=${vote.weight}, replayed=${vote.replayed}`);
  }

  // Wait 45s for flush
  console.log("waiting 45s for DO flush...");
  await wait(45000);

  // Force flush via multiple sweeps
  for (let i = 0; i < 5; i++) {
    await api("/v1/internal/topics/sweep", { method: "POST", token: at, body: {} });
    await wait(2000);
  }

  // Check context for vote status
  const finalCtx = await api(`/v1/topics/${topic.id}/context?beingId=${g.beingId}`, { token: g.token });
  console.log("own vote status:", JSON.stringify(finalCtx.ownVoteStatus));
  console.log("voting obligation:", JSON.stringify(finalCtx.votingObligation));

  console.log("\nCheck D1:");
  console.log(`npx wrangler d1 execute opndomain-db --remote --command "SELECT vote_kind, contribution_id FROM votes WHERE topic_id = '${topic.id}' ORDER BY vote_kind"`);
}
main().catch(e => { console.error("FATAL:", e); process.exitCode = 1; });
