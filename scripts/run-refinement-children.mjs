#!/usr/bin/env node
/**
 * Drives the 5 currently-stuck refinement child topics through to closure
 * so we can observe depth-2 refinement chain behavior (grandchildren).
 *
 * Each child is:
 *   - in status='countdown' with join_until in the past (no agents joined)
 *   - already linked to its parent via parent_topic_id
 *   - already has a topic_refinement_context row seeded
 *
 * For each child we:
 *   1. Reset starts_at/join_until to the near future via D1 (simplest path).
 *   2. Invoke run-debate-codex.mjs --existing-topic <id> with a narrow
 *      scenario tailored to the child's specific question.
 *   3. Wait for it to close.
 *
 * Next tick of the producer's refine pass should then pick up each newly-
 * closed child and generate a depth-2 grandchild candidate.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, "..");
const RUNNER = path.join(HERE, "run-debate-codex.mjs");
const TMP_DIR = path.join(os.tmpdir(), `refinement-children-${Date.now()}`);
fs.mkdirSync(TMP_DIR, { recursive: true });

const CHILDREN = [
  {
    topicId: "top_999e0559b5b74ed188c948a7455aba00",
    slug: "child-graduated-extinction-solitary-sleep",
    title: "Does Graduated Extinction Evidence Depend on Solitary-Sleep Assumptions?",
    prompt: "Investigate whether the clinical evidence supporting graduated extinction for infant sleep training can justify recommendations beyond households already committed to solitary infant sleep. Focus narrowly on whether RCTs and follow-up studies compare graduated extinction against a developmentally neutral baseline, or only against an already culturally specific sleep arrangement. Assess what evidence exists, what evidence is missing, and whether clinicians should frame graduated extinction as harm reduction within WEIRD solitary-sleep contexts rather than as a general developmental recommendation.",
    domainId: "dom_psychology",
    agents: [
      { displayName: "The RCT Methodologist", bio: "Biostatistician who reviewed the graduated-extinction RCT literature. Argues the baseline issue is real but smaller than cross-cultural critics claim; the evidence justifies conditional clinical use.", stance: "support" },
      { displayName: "The Cross-Cultural Pediatrician", bio: "Pediatric-sleep specialist who has practiced in Japan, Sweden, and the US. The published RCTs were run on WEIRD families; extrapolating their findings outside that demographic isn't supported by the evidence.", stance: "oppose" },
      { displayName: "The Evidence-Based Clinician", bio: "Family practice MD. Harm reduction framing is correct; the missing evidence is about generalization, not about basic efficacy in the studied population.", stance: "neutral" },
      { displayName: "The Developmental Anthropologist", bio: "Fieldwork in cosleeping communities. The evidence base is invalid for populations that don't practice solitary sleep; using it as a universal recommendation is category error.", stance: "oppose" },
      { displayName: "The Clinical Trials Skeptic", bio: "Epidemiologist. Both sides overstate; the correct framing is 'limited evidence for limited claims,' and neither cohort absolutism nor conditional harm-reduction cleanly survives scrutiny.", stance: "neutral" },
    ],
  },
  {
    topicId: "top_2a62941ed47542f4b8a9e48e026fc6d9",
    slug: "child-victory-rituals-contempt",
    title: "Can Public Victory Rituals Express Relief Without Teaching Contempt?",
    prompt: "Investigate whether public celebrations of an enemy's defeat can separate legitimate relief and vindication from teaching audiences contempt for the defeated. Consider comparative history (Marshall Plan-era US, reunified Germany's occupation-ending rites, South African TRC), psychological research on intergroup contempt, the role of ritual form (civic vs triumphalist), and whether the Karp pause-vs-rejoice distinction survives when victory ritual is itself politically necessary.",
    domainId: "dom_philosophy",
    agents: [
      { displayName: "The Ritual Historian", bio: "Studies civic victory rituals. The form matters enormously; restrained civic ritual can express relief without contempt, triumphalism cannot.", stance: "neutral" },
      { displayName: "The Moral Psychologist", bio: "Researches intergroup moral emotion. The empirical data suggests any public victory ritual has measurable contempt-producing effects regardless of form.", stance: "oppose" },
      { displayName: "The Political Theorist", bio: "Post-conflict political thought. Some victory ritual is democratically necessary; outlawing it empowers grievance politics worse than contempt.", stance: "support" },
      { displayName: "The Peace Scholar", bio: "Transitional justice specialist. TRC-style public rituals prove the synthesis is possible, but it requires very specific institutional conditions.", stance: "neutral" },
      { displayName: "The Cultural Critic", bio: "Contempt is partly what victory means in practice; the 'can it be separated' question is wishful.", stance: "oppose" },
    ],
  },
  {
    topicId: "top_8653c99dd0c647dd8ce015e4a53cdcc1",
    slug: "child-ai-nuclear-early-warning",
    title: "Can AI in Nuclear Early-Warning Systems Be Governed Before It Is Deployed?",
    prompt: "Evaluate whether governance frameworks for AI in nuclear early-warning and decision-support can be established before the capability is operationally deployed by any nuclear state. Consider the track record of pre-deployment arms control (chemical weapons, biological weapons, SALT), current state of proposed AI-nuclear norms, the asymmetric incentive problem, and what counts as 'governance' — treaties vs doctrine vs unilateral restraint.",
    domainId: "dom_nuclear-strategy",
    agents: [
      { displayName: "The Arms Control Historian", bio: "Studies pre-deployment arms control. Chemical and biological weapons conventions are existence proofs; the pattern is repeatable but narrow.", stance: "support" },
      { displayName: "The Nuclear Operations Officer", bio: "Former STRATCOM. The capability is already half-deployed in decision-support tools; 'pre-deployment' governance is already too late.", stance: "oppose" },
      { displayName: "The International Law Scholar", bio: "Treaty law. Meaningful AI-nuclear governance is possible but will require specific capability definitions that no state has agreed to.", stance: "neutral" },
      { displayName: "The Strategic Stability Analyst", bio: "The asymmetric-incentive problem makes pre-deployment agreement nearly impossible unless a shock event forces it — and that shock itself would be catastrophic.", stance: "oppose" },
      { displayName: "The Norm Entrepreneur", bio: "Tracks Track-II arms control dialogue. Current norm-building work is underpowered but real; dismissing it as impossible is premature.", stance: "support" },
    ],
  },
  {
    topicId: "top_22f610a90d4c440985a7359baa7e86e7",
    slug: "child-us-mobility-institutions-or-selection",
    title: "Do US Immigrant Mobility Gains Reflect Institutional Openness or Selection?",
    prompt: "Investigate whether the observed first-generation immigrant mobility premium in the United States is primarily explained by US institutional openness (rule of law, deep labor markets, meritocratic access) or by the selection of who emigrates to the US in the first place (human capital pre-migration, risk tolerance, source-country institutional context). Consider comparative emigration data (Germany, Canada, Australia, UK), natural experiments, and what the distinction implies for 'progressive values' claims.",
    domainId: "dom_history",
    agents: [
      { displayName: "The Mobility Economist", bio: "Runs the comparative immigrant-mobility dataset at Harvard. The US institutional effect is real and measurably larger than selection alone.", stance: "support" },
      { displayName: "The Migration Selection Scholar", bio: "Pre-migration human capital explains most of the observed mobility; 'American institutional magic' is a post-hoc narrative.", stance: "oppose" },
      { displayName: "The Comparative Development Economist", bio: "Institutions and selection are substitutes in explanatory power for some destinations, complements for others. The truth is messier than either camp admits.", stance: "neutral" },
      { displayName: "The Immigration Policy Historian", bio: "US selection policy has changed dramatically over 150 years; 'mobility premium' varies by era and cohort in ways that pure institutional stories can't explain.", stance: "neutral" },
      { displayName: "The Source-Country Economist", bio: "From the sending-country side, the US mobility premium is substantially a function of who self-selects out of dysfunctional institutional contexts.", stance: "oppose" },
    ],
  },
  {
    topicId: "top_e8a74b401dd74d03a9204e7ceb34b58a",
    slug: "child-market-failure-applause-conditions",
    title: "When Does Public-Private Success Merit Applause for a Billionaire-Led Build?",
    prompt: "Identify the specific conditions under which a billionaire-led attempt to build where markets failed (infrastructure, space, EVs, rural broadband) should earn societal applause rather than scrutiny. Consider outcome measurement (did the market actually fail; did the build succeed?), externality accounting (what did the build cost others?), accountability structures (who can say no?), and the distinction between applauding the build and applauding the builder.",
    domainId: "dom_startups",
    agents: [
      { displayName: "The Industrial Organization Economist", bio: "Builds in genuine market-failure areas (launch-to-orbit, nationwide EV networks) deserve applause if outcomes justify externalities; no harder test needed.", stance: "support" },
      { displayName: "The Accountability Journalist", bio: "The 'applaud when successful' rule is survivor-bias circular; we never see the billionaire-led builds that failed and extracted public resources.", stance: "oppose" },
      { displayName: "The Civic Republican Theorist", bio: "Applause for the build is fine; applause for the builder as character-exemplar is the category error Karp makes.", stance: "neutral" },
      { displayName: "The Innovation Policy Scholar", bio: "Conditions: (1) genuine externality-fixing not rent-extraction, (2) transparent accountability, (3) the builder doesn't use applause to evade regulation. Most actual cases fail condition 3.", stance: "neutral" },
      { displayName: "The Tech Historian", bio: "Looking at Ford, Rockefeller, and Carnegie — each earned applause AND scrutiny in their own era; Karp's frame treats scorn as new when it is historically consistent.", stance: "oppose" },
    ],
  },
];

async function resetTiming(topicId) {
  // Use wrangler to update D1 directly. We write SQL to a temp file and use
  // --file instead of --command to avoid Windows shell arg mangling on spaces.
  const startsAt = new Date(Date.now() + 60_000).toISOString();
  const joinUntil = new Date(Date.now() + 45_000).toISOString();
  const sql = `UPDATE topics SET starts_at='${startsAt}', join_until='${joinUntil}', countdown_started_at=datetime('now') WHERE id='${topicId}';`;
  const sqlPath = path.join(TMP_DIR, `${topicId}.sql`);
  fs.writeFileSync(sqlPath, sql);
  return new Promise((resolve, reject) => {
    // Use shell: true for Windows .cmd/.bat compatibility. The sqlPath lives
    // in tmpdir (no spaces), so shell quoting of args is safe here.
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
    console.log(`  Driving child debate: ${slug}`);
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

  for (let i = 0; i < CHILDREN.length; i++) {
    const child = CHILDREN[i];
    const scenarioPath = path.join(TMP_DIR, `${child.slug}.json`);
    fs.writeFileSync(scenarioPath, JSON.stringify({
      title: child.title,
      prompt: child.prompt,
      domainId: child.domainId,
      agents: child.agents,
    }, null, 2));

    console.log(`\n[${i + 1}/${CHILDREN.length}] ${child.title}`);

    try {
      await resetTiming(child.topicId);
      console.log(`[${i + 1}/${CHILDREN.length}] Reset timing`);
      const t0 = Date.now();
      await runDebate(scenarioPath, child.topicId, child.slug);
      const elapsedMin = ((Date.now() - t0) / 60000).toFixed(1);
      console.log(`[${i + 1}/${CHILDREN.length}] Done in ${elapsedMin}min`);
      results.push({ slug: child.slug, status: "ok", elapsedMin });
    } catch (err) {
      console.error(`[${i + 1}/${CHILDREN.length}] Failed: ${err.message}`);
      results.push({ slug: child.slug, status: "error", error: err.message });
    }
  }

  const totalMin = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\n==================================================`);
  console.log(`  Children chain complete in ${totalMin} minutes`);
  console.log(`==================================================`);
  console.log(`OK: ${results.filter((r) => r.status === "ok").length}`);
  console.log(`Errors: ${results.filter((r) => r.status === "error").length}`);
  for (const r of results) {
    console.log(`  ${r.status === "ok" ? "✓" : "✗"} ${r.slug}${r.elapsedMin ? ` (${r.elapsedMin}min)` : ""}${r.error ? ` — ${r.error}` : ""}`);
  }
}

main().catch((err) => { console.error("Chain failed:", err); process.exit(1); });
