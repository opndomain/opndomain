import { createHash } from "node:crypto";
import type { ProducerConfig, CandidateOutput, ProducerMode } from "../types.js";
import { DOMAINS } from "../domains.js";
import { generateJson } from "../llm/client.js";
import { buildBackfillSystemPrompt, buildBackfillUserPrompt } from "../llm/prompts.js";
import { validateCandidate } from "../llm/parse.js";
import {
  findTopicIdeaDuplicate,
  topicIdeaRecordFromCandidate,
  type TopicIdeaContextRecord,
} from "../topic-idea-duplicates.js";

export async function backfillDomain(
  config: ProducerConfig,
  domainId: string,
  count: number,
  mode: ProducerMode,
  noveltyContext: TopicIdeaContextRecord[] = [],
): Promise<CandidateOutput[]> {
  const domain = DOMAINS.find((d) => d.id === domainId || d.slug === domainId);
  if (!domain) {
    throw new Error(`Unknown domain: ${domainId}`);
  }

  const systemPrompt = buildBackfillSystemPrompt(mode);
  const candidates: CandidateOutput[] = [];
  const acceptedIdeas: TopicIdeaContextRecord[] = [];

  const processRawCandidates = (rawCandidates: unknown[]) => {
    for (const raw of rawCandidates) {
      const obj = raw as Record<string, unknown>;
      const title = String(obj.title ?? "");
      const hash = createHash("sha256").update(title.toLowerCase().trim()).digest("hex").slice(0, 16);
      const sourceId = `backfill:${domain.slug}:${hash}`;

      const candidate = validateCandidate(
        { ...obj, domainId: domain.id },
        "backfill",
        sourceId,
        null,
        null,
        0,
        mode,
      );

      if (!candidate) {
        console.warn(`Invalid backfill candidate skipped: ${title.slice(0, 80)}`);
        continue;
      }

      const duplicate = findTopicIdeaDuplicate(candidate, [...noveltyContext, ...acceptedIdeas]);
      if (duplicate) {
        continue;
      }

      candidates.push(candidate);
      acceptedIdeas.push(topicIdeaRecordFromCandidate(candidate, candidate.sourceId));
    }
  };

  const rawCandidates = await generateJson(
    config,
    systemPrompt,
    buildBackfillUserPrompt(domain, count, mode, noveltyContext),
  );
  processRawCandidates(rawCandidates);

  const shortfall = count - candidates.length;
  if (shortfall > 0) {
    const refillRawCandidates = await generateJson(
      config,
      systemPrompt,
      buildBackfillUserPrompt(domain, shortfall, mode, [...noveltyContext, ...acceptedIdeas]),
    );
    processRawCandidates(refillRawCandidates);
  }

  if (candidates.length < count) {
    console.warn(`Backfill shortfall for ${domain.slug}: requested ${count}, accepted ${candidates.length}`);
  }

  return candidates;
}

export async function backfillAll(
  config: ProducerConfig,
  countPerDomain: number,
  mode: ProducerMode,
  domainFilter?: string[],
): Promise<{ domainSlug: string; generated: number }[]> {
  const domains = domainFilter
    ? DOMAINS.filter((d) => domainFilter.includes(d.slug) || domainFilter.includes(d.id))
    : [...DOMAINS];

  const results: { domainSlug: string; generated: number }[] = [];

  for (const domain of domains) {
    try {
      console.log(`Backfilling ${domain.slug} (${countPerDomain} topics)...`);
      const candidates = await backfillDomain(config, domain.id, countPerDomain, mode);
      results.push({ domainSlug: domain.slug, generated: candidates.length });
      console.log(`  Generated ${candidates.length} candidates for ${domain.slug}`);
    } catch (error) {
      console.error(`  Failed for ${domain.slug}:`, error instanceof Error ? error.message : error);
      results.push({ domainSlug: domain.slug, generated: 0 });
    }
  }

  return results;
}
