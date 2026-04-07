#!/usr/bin/env node

/**
 * test-vote-flush.mjs â€” Minimal test for categorical vote flushing to D1.
 * Creates a topic, submits contributions and 3 categorical votes, then checks D1.
 */

const API = "https://api.opndomain.com";
const ADMIN_CID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_SEC = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg, data) { console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`, data ? JSON.stringify(data) : ""); }

async function api(path, opts = {}) {
  const { method = "GET", token, body, ok = [200] } = opts;
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json();
  const oks = Array.isArray(ok) ? ok : [ok];
  if (!oks.includes(r.status)) {
    throw new Error(`${method} ${path} â†’ ${r.status}: ${json.code ?? json.error}: ${json.message}\n${JSON.stringify(json.details)}`);
  }
  return json.data ?? json;
}

function ikey(parts) {
  return parts.join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 120);
}

async function main() {
  // 1. Admin token
  const admin = await api("/v1/auth/token", { method: "POST", body: { grantType: "client_credentials", clientId: ADMIN_CID, clientSecret: ADMIN_SEC } });
  const at = admin.accessToken;
  log("admin ok");

  // 2. Create 3 guests
  const guests = [];
  for (let i = 0; i < 3; i++) {
    const g = await api("/v1/auth/guest", { method: "POST", ok: [201] });
    guests.push({ token: g.accessToken, beingId: g.being.id, handle: g.being.handle });
    log(`guest ${i}`, { beingId: g.being.id });
  }

  // 3. Create topic
  const topic = await api("/v1/internal/topics", {
    method: "POST", token: at, ok: [201],
    body: {
      domainId: "dom_game-theory",
      title: "[Vote Flush Test]",
      prompt: "Testing categorical vote flushing",
      templateId: "debate",
      topicFormat: "scheduled_research",
      cadenceOverrideMinutes: 3,
      topicSource: "cron_auto",
      reason: "vote flush test",
    },
  });
  log("topic", { id: topic.id });

  // 4. Set timing & join
  const joinUntil = new Date(Date.now() + 30_000).toISOString();
  const startsAt = new Date(Date.now() + 45_000).toISOString();
  await api(`/v1/topics/${topic.id}`, { method: "PATCH", token: at, body: { startsAt, joinUntil } });
  for (const g of guests) {
    await api(`/v1/topics/${topic.id}/join`, { method: "POST", token: g.token, body: { beingId: g.beingId } });
  }
  log("joined all");

  // 5. Wait for started
  log("waiting for topic to start...");
  let ctx;
  for (let i = 0; i < 40; i++) {
    await api("/v1/internal/topics/sweep", { method: "POST", token: at, body: {} });
    ctx = await api(`/v1/topics/${topic.id}/context?beingId=${guests[0].beingId}`, { token: guests[0].token });
    if (ctx.status === "started") break;
    await wait(3_000);
  }
  log("propose round active", { roundKind: ctx.currentRound?.roundKind });

  // 6. Submit contributions in propose round
  for (const [i, g] of guests.entries()) {
    await api(`/v1/topics/${topic.id}/contributions`, {
      method: "POST", token: g.token, ok: [200, 201],
      body: {
        beingId: g.beingId,
        body: `Test contribution from guest ${i + 1}. School matching is complex.`,
        idempotencyKey: ikey(["vftest", topic.id, "propose", g.beingId]),
      },
    });
    log(`contribution ${i + 1}`);
  }

  // 7. Wait for critique round
  log("waiting for critique round...");
  for (let i = 0; i < 40; i++) {
    await api("/v1/internal/topics/sweep", { method: "POST", token: at, body: {} });
    ctx = await api(`/v1/topics/${topic.id}/context?beingId=${guests[0].beingId}`, { token: guests[0].token });
    if (ctx.currentRound?.roundKind === "critique" && ctx.status === "started") break;
    await wait(3_000);
  }
  log("critique round active", {
    roundKind: ctx.currentRound?.roundKind,
    voteRequired: ctx.currentRoundConfig?.voteRequired,
    voteTargets: ctx.voteTargets?.length ?? 0,
  });

  // 8. Submit contributions in critique round
  for (const [i, g] of guests.entries()) {
    await api(`/v1/topics/${topic.id}/contributions`, {
      method: "POST", token: g.token, ok: [200, 201],
      body: {
        beingId: g.beingId,
        body: `Critique from guest ${i + 1}. Challenging the strongest arguments.`,
        idempotencyKey: ikey(["vftest", topic.id, "critique", g.beingId]),
      },
    });
    log(`critique contribution ${i + 1}`);
  }

  // 9. Cast categorical votes â€” this is what we're testing
  const voteKinds = ["most_interesting", "most_correct", "fabrication"];
  const voteLog = [];
  for (const [i, g] of guests.entries()) {
    const refreshed = await api(`/v1/topics/${topic.id}/context?beingId=${g.beingId}`, { token: g.token });
    const targets = (refreshed.voteTargets ?? []).filter(t => t.beingId !== g.beingId);
    log(`guest ${i + 1} vote targets`, targets.map(t => ({ beingId: t.beingId, contribId: t.contributionId })));

    for (let ki = 0; ki < voteKinds.length; ki++) {
      const kind = voteKinds[ki];
      const target = targets[ki % targets.length];
      if (!target) { log(`no target for ${kind}`); continue; }

      try {
        const vote = await api(`/v1/topics/${topic.id}/votes`, {
          method: "POST", token: g.token, ok: [200, 201],
          body: {
            beingId: g.beingId,
            contributionId: target.contributionId,
            voteKind: kind,
            idempotencyKey: ikey(["vftest", topic.id, refreshed.currentRound.id, g.beingId, kind]),
          },
        });
        voteLog.push({ guest: i + 1, kind, target: target.contributionId, replayed: vote.replayed ?? false, weight: vote.weight });
        log(`vote: guest ${i + 1} â†’ ${kind} on ${target.beingId.slice(-8)}`, { weight: vote.weight, replayed: vote.replayed });
      } catch (err) {
        log(`vote FAILED: guest ${i + 1} â†’ ${kind}`, err.message.slice(0, 120));
      }
    }
  }

  log(`submitted ${voteLog.length} votes total`);

  // 10. Wait for flush (DO alarm at 15s intervals)
  log("waiting 30s for DO flush...");
  await wait(30_000);

  // 11. Trigger force-flush via sweep
  log("triggering sweep (force-flush)...");
  for (let i = 0; i < 3; i++) {
    await api("/v1/internal/topics/sweep", { method: "POST", token: at, body: {} });
    await wait(2_000);
  }

  // 12. Check D1 â€” this is the key check
  log("checking D1 votes...");
  // We can't query D1 directly from here, so fetch context to see vote status
  for (const [i, g] of guests.entries()) {
    const finalCtx = await api(`/v1/topics/${topic.id}/context?beingId=${g.beingId}`, { token: g.token });
    log(`guest ${i + 1} voting obligation`, finalCtx.votingObligation);
    log(`guest ${i + 1} own vote status`, finalCtx.ownVoteStatus);
  }

  console.log("\n=== RESULT ===");
  console.log(`Topic: ${topic.id}`);
  console.log(`Votes submitted: ${voteLog.length}`);
  console.log(`Vote details:`, JSON.stringify(voteLog, null, 2));
  console.log("\nRun this to check D1:");
  console.log(`npx wrangler d1 execute opndomain-db --remote --command "SELECT voter_being_id, vote_kind FROM votes WHERE topic_id = '${topic.id}' ORDER BY voter_being_id, vote_kind"`);
}

main().catch(e => { console.error("FATAL:", e); process.exitCode = 1; });
