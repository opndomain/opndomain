#!/usr/bin/env node
/**
 * Drives:
 *   - The stuck child topic (AI nuclear early-warning, previously failed on
 *     timing reset) so we get a 5th closed child + spawn its grandchild.
 *   - All four depth=2 grandchildren spawned by the already-closed children.
 *     Closing these will auto-generate depth=3 great-grandchild candidates
 *     from any that are eligible, exercising the MAX_REFINEMENT_DEPTH=3 cap.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, "..");
const RUNNER = path.join(HERE, "run-debate-codex.mjs");
const TMP_DIR = path.join(os.tmpdir(), `grandchildren-${Date.now()}`);
fs.mkdirSync(TMP_DIR, { recursive: true });

const TARGETS = [
  // Retry of child #3 — the stuck AI nuclear early-warning topic.
  {
    topicId: "top_8653c99dd0c647dd8ce015e4a53cdcc1",
    slug: "retry-child-ai-nuclear-early-warning",
    title: "Can AI in Nuclear Early-Warning Systems Be Governed Before It Is Deployed?",
    prompt: "Evaluate whether governance frameworks for AI in nuclear early-warning and decision-support can be established before the capability is operationally deployed by any nuclear state. Consider the track record of pre-deployment arms control, current state of proposed AI-nuclear norms, the asymmetric incentive problem, and what counts as 'governance' — treaties vs doctrine vs unilateral restraint.",
    domainId: "dom_nuclear-strategy",
    agents: [
      { displayName: "The Arms Control Historian", bio: "Studies pre-deployment arms control. Chemical and biological weapons conventions are existence proofs; the pattern is repeatable but narrow.", stance: "support" },
      { displayName: "The Nuclear Operations Officer", bio: "Former STRATCOM. The capability is already half-deployed in decision-support tools; 'pre-deployment' governance is already too late.", stance: "oppose" },
      { displayName: "The International Law Scholar", bio: "Treaty law. Meaningful AI-nuclear governance is possible but will require specific capability definitions that no state has agreed to.", stance: "neutral" },
      { displayName: "The Strategic Stability Analyst", bio: "The asymmetric-incentive problem makes pre-deployment agreement nearly impossible unless a shock event forces it — and that shock itself would be catastrophic.", stance: "oppose" },
      { displayName: "The Norm Entrepreneur", bio: "Tracks Track-II arms control dialogue. Current norm-building work is underpowered but real; dismissing it as impossible is premature.", stance: "support" },
    ],
  },
  // Grandchild 1 — from the cry-it-out/solitary-sleep chain.
  {
    topicId: "top_0c80d531340b4723a79be92b134abb46",
    slug: "gc-null-harm-treatment-congruent",
    title: "Do Null-Harm Follow-Ups for Graduated Extinction Depend on Treatment-Congruent Samples?",
    prompt: "Fetched from D1 — runner uses existing-topic prompt.",
    domainId: "dom_psychology",
    agents: [
      { displayName: "The Biostatistician", bio: "Re-analyzed the long-term follow-up studies. Treatment-congruent sampling is a real concern but not fatal; effect-size differences across sample strata are small.", stance: "support" },
      { displayName: "The Selection-Bias Epidemiologist", bio: "The follow-ups recruited from the same compliant WEIRD cohorts that took the training; null findings there say nothing about populations that would have refused the protocol.", stance: "oppose" },
      { displayName: "The Developmental Attrition Expert", bio: "The attrition patterns in the 12- and 36-month follow-ups are asymmetric; the families who left the study were not random, and that alone limits generalization.", stance: "oppose" },
      { displayName: "The Clinical Trial Methodologist", bio: "Per-protocol vs intention-to-treat analyses tell different stories; the concern is valid but resolvable with existing data if re-analyzed properly.", stance: "neutral" },
      { displayName: "The Pediatric Practitioner", bio: "Clinicians care less about methodological purity than about whether the evidence applies to the families in front of them; sample-congruence concerns are overdone.", stance: "support" },
    ],
  },
  // Grandchild 2 — from the victory-rituals/contempt chain.
  {
    topicId: "top_b510281b23404b98960fe922ca896245",
    slug: "gc-harm-centered-ceremonies",
    title: "Do Harm-Centered Victory Ceremonies Reduce Contempt in the Crowd?",
    prompt: "Fetched from D1 — runner uses existing-topic prompt.",
    domainId: "dom_philosophy",
    agents: [
      { displayName: "The Ritual Design Scholar", bio: "Ceremonies that foreground the defeated's losses — TRC, Yad Vashem, Hiroshima memorial — empirically reduce crowd contempt in longitudinal studies.", stance: "support" },
      { displayName: "The Moral Psychologist", bio: "Even harm-centered ceremonies activate in-group moral elevation; the 'we were right to win' frame survives the form changes.", stance: "oppose" },
      { displayName: "The Post-Conflict Historian", bio: "The Marshall Plan and German reunification memorials are the closest test cases; results are mixed, with institutional accompaniment mattering more than ceremony form.", stance: "neutral" },
      { displayName: "The Public-Affect Sociologist", bio: "The crowd psychology literature is clear — contempt reduction from ritual form alone is small; what reduces it is sustained economic/political integration of the defeated.", stance: "oppose" },
      { displayName: "The Civic Ceremonialist", bio: "Small but real. Design matters; the 1945 US home-front celebrations produced measurably different civic attitudes than V-E Day triumphalism.", stance: "support" },
    ],
  },
  // Grandchild 3 — from the immigrant-mobility/institutions-or-selection chain.
  {
    topicId: "top_8b6170e47d08434bae5b38e0a463be3d",
    slug: "gc-second-generation-schooling",
    title: "Did Second-Generation Immigrant Schooling Gains Exceed What Family Selection Predicts?",
    prompt: "Fetched from D1 — runner uses existing-topic prompt.",
    domainId: "dom_history",
    agents: [
      { displayName: "The Intergenerational Mobility Economist", bio: "Chetty-style data on second-generation US immigrants shows schooling gains above the predicted selection baseline; the institutional hypothesis survives.", stance: "support" },
      { displayName: "The Behavioral Geneticist", bio: "Parental cognitive and motivational traits predict ~50% of schooling outcomes; unadjusted intergenerational 'gains' mostly trace to inherited variance, not institutional uplift.", stance: "oppose" },
      { displayName: "The Comparative Migration Historian", bio: "The 2nd-generation premium varies dramatically by source country and era; there's no single 'US institutional effect' — it's context-dependent.", stance: "neutral" },
      { displayName: "The Quasi-Experimental Labor Economist", bio: "Natural experiments (lottery-based visas, refugee flows) approximate selection controls and still show residual institutional effects, though smaller than naive estimates.", stance: "support" },
      { displayName: "The Critical Sociologist", bio: "Both frames underweight the selection that happens to families once in the US — neighborhood assignment, school segregation — which is neither pure selection nor pure institutional openness.", stance: "neutral" },
    ],
  },
  // Grandchild 4 — from the billionaire-applause/market-failure chain.
  {
    topicId: "top_01bea4317a504259af242800982717a0",
    slug: "gc-spacex-musk-mythology",
    title: "Can SpaceX Applause Avoid Becoming Musk Mythology?",
    prompt: "Fetched from D1 — runner uses existing-topic prompt.",
    domainId: "dom_startups",
    agents: [
      { displayName: "The Aerospace Industry Analyst", bio: "Applause for the engineering achievement is separable from applause for the founder; the Falcon 9 reuse program stands on its own merits.", stance: "support" },
      { displayName: "The Cultural Critic", bio: "In practice, Musk's personal brand absorbs every achievement SpaceX posts; 'separable' is what institutionalists wish were true, not what happens.", stance: "oppose" },
      { displayName: "The Innovation Policy Scholar", bio: "The right test is whether scrutiny of Musk personally has grown alongside applause for SpaceX — and it has. The separation is imperfect but working.", stance: "neutral" },
      { displayName: "The Technology Historian", bio: "Historically, founder-hero narratives (Ford, Jobs, Edison) always collapse achievement and person; SpaceX is not avoiding this, just deferring.", stance: "oppose" },
      { displayName: "The Labor Journalist", bio: "Even if the engineering deserves applause, the working conditions that produced it don't; the applause/mythology distinction sidesteps what workers at SpaceX actually experience.", stance: "oppose" },
    ],
  },
];

async function resetTiming(topicId) {
  const startsAt = new Date(Date.now() + 60_000).toISOString();
  const joinUntil = new Date(Date.now() + 45_000).toISOString();
  const sql = `UPDATE topics SET starts_at='${startsAt}', join_until='${joinUntil}', countdown_started_at=datetime('now') WHERE id='${topicId}';`;
  const sqlPath = path.join(TMP_DIR, `${topicId}.sql`);
  fs.writeFileSync(sqlPath, sql);
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "pnpm exec wrangler d1 execute opndomain-db --remote --json --file " + sqlPath,
      [],
      { stdio: ["inherit", "pipe", "pipe"], cwd: path.join(REPO_ROOT, "packages", "api"), shell: true },
    );
    let stderr = "";
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`timing reset failed (${code}): ${stderr}`)));
    proc.on("error", reject);
  });
}

function runDebate(scenarioPath, topicId, slug) {
  return new Promise((resolve, reject) => {
    console.log(`\n==================================================`);
    console.log(`  Driving: ${slug}`);
    console.log(`  Topic: ${topicId}`);
    console.log(`==================================================`);
    const proc = spawn(
      "node",
      [RUNNER, scenarioPath, "--cadence", "2", "--existing-topic", topicId],
      { stdio: "inherit", cwd: REPO_ROOT },
    );
    proc.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Debate ${slug} exited with code ${code}`)));
    proc.on("error", reject);
  });
}

async function main() {
  const started = Date.now();
  const results = [];

  for (let i = 0; i < TARGETS.length; i++) {
    const target = TARGETS[i];
    const scenarioPath = path.join(TMP_DIR, `${target.slug}.json`);
    fs.writeFileSync(scenarioPath, JSON.stringify({
      title: target.title,
      prompt: target.prompt,
      domainId: target.domainId,
      agents: target.agents,
    }, null, 2));

    console.log(`\n[${i + 1}/${TARGETS.length}] ${target.title}`);
    try {
      await resetTiming(target.topicId);
      console.log(`[${i + 1}/${TARGETS.length}] Reset timing`);
      const t0 = Date.now();
      await runDebate(scenarioPath, target.topicId, target.slug);
      const elapsedMin = ((Date.now() - t0) / 60000).toFixed(1);
      console.log(`[${i + 1}/${TARGETS.length}] Done in ${elapsedMin}min`);
      results.push({ slug: target.slug, status: "ok", elapsedMin });
    } catch (err) {
      console.error(`[${i + 1}/${TARGETS.length}] Failed: ${err.message}`);
      results.push({ slug: target.slug, status: "error", error: err.message });
    }
  }

  const totalMin = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\n==================================================`);
  console.log(`  Grandchildren chain complete in ${totalMin} minutes`);
  console.log(`==================================================`);
  console.log(`OK: ${results.filter((r) => r.status === "ok").length}`);
  console.log(`Errors: ${results.filter((r) => r.status === "error").length}`);
  for (const r of results) {
    console.log(`  ${r.status === "ok" ? "✓" : "✗"} ${r.slug}${r.elapsedMin ? ` (${r.elapsedMin}min)` : ""}${r.error ? ` — ${r.error}` : ""}`);
  }
}

main().catch((err) => { console.error("Chain failed:", err); process.exit(1); });
