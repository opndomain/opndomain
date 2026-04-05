import type { CandidateOutput, InventoryItem, ProducerConfig, ProducerMode, SourceAdapter, SourceItem } from "./types.js";
import { generateJson } from "./llm/client.js";
import { buildGenerationSystemPrompt, buildGenerationUserPrompt } from "./llm/prompts.js";
import { validateCandidate } from "./llm/parse.js";
import {
  findTopicIdeaDuplicate,
  topicIdeaRecordFromCandidate,
  type TopicIdeaContextRecord,
} from "./topic-idea-duplicates.js";

const ATTENTION_DOMAIN_BONUS = new Set([
  "dom_politics",
  "dom_governance",
  "dom_economics",
  "dom_finance",
  "dom_business-strategy",
  "dom_sports",
  "dom_tech-policy",
]);

const ATTENTION_PUBLIC_ENTITY_PATTERNS = [
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g,
  /\b(?:Florida|Georgia|Texas|California|New York|Congress|Senate|House|Supreme Court|White House|IRS|SEC|NCAA|NFL|NBA|MLB|PGA|NATO|EU|Fed)\b/g,
  /\b\d{4}\b/g,
];

const ATTENTION_VAGUE_PATTERNS = [
  /\bstate of (?:the )?/i,
  /\bfuture of\b/i,
  /\binnovation\b/i,
  /\bresearchers\b/i,
  /\bscientists\b/i,
  /\bindustry\b/i,
  /\bsector\b/i,
  /\becosystem\b/i,
  /\bframework\b/i,
  /\bplatforms\b/i,
];

function computeAttentionSignal(item: SourceItem): number {
  let score = 0;
  const headline = `${item.title} ${item.summary.slice(0, 240)}`;

  for (const domainId of item.suggestedDomains) {
    if (ATTENTION_DOMAIN_BONUS.has(domainId)) {
      score += 8;
    }
  }

  for (const pattern of ATTENTION_PUBLIC_ENTITY_PATTERNS) {
    const matches = headline.match(pattern);
    if (matches) {
      score += Math.min(matches.length * 6, 18);
    }
  }

  if (/\bvs\.?\b/i.test(headline)) score += 6;
  if (/\bban\b|\btax\b|\blaw\b|\bdeal\b|\btrade\b|\binjury\b|\bcontract\b|\belection\b|\blawsuit\b|\bprobe\b/i.test(headline)) score += 8;
  if (/[?:]/.test(item.title)) score += 3;

  for (const pattern of ATTENTION_VAGUE_PATTERNS) {
    if (pattern.test(item.title)) {
      score -= 10;
    }
  }

  return score;
}

function computePriorityScore(
  item: SourceItem,
  inventory: Map<string, InventoryItem>,
  bufferTarget: number,
  mode: ProducerMode,
): number {
  let score = 0;

  // Recency bonus
  const ageMs = Date.now() - new Date(item.publishedAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours < 6) score += 30;
  else if (ageHours < 24) score += 20;
  else if (ageHours < 48) score += 10;

  // Source quality
  if (item.source === "arxiv") score += 15;
  else if (item.source === "huggingface") score += 10;
  else if (item.source === "rss" || item.source === "sports") score += 5;

  // Domain deficit bonus (applied per suggested domain — take max)
  let maxDeficitBonus = 0;
  for (const domainId of item.suggestedDomains) {
    const inv = inventory.get(domainId);
    if (!inv) continue;
    const fillRatio = inv.approvedCount / bufferTarget;
    if (fillRatio < 0.25) maxDeficitBonus = Math.max(maxDeficitBonus, 30);
    else if (fillRatio < 0.5) maxDeficitBonus = Math.max(maxDeficitBonus, 20);
  }
  score += maxDeficitBonus;

  if (mode === "attention") {
    score += computeAttentionSignal(item);
  }

  return Math.min(100, score);
}

export async function generateFromSources(
  config: ProducerConfig,
  adapters: SourceAdapter[],
  inventory: InventoryItem[],
  options: {
    dryRun?: boolean;
    limit?: number;
    mode: ProducerMode;
    noveltyContextByDomain?: Map<string, TopicIdeaContextRecord[]>;
  },
): Promise<CandidateOutput[]> {
  const inventoryMap = new Map(inventory.map((i) => [i.domainId, i]));
  const existingIdeasByDomain = options.noveltyContextByDomain ?? new Map<string, TopicIdeaContextRecord[]>();
  const acceptedIdeasByDomain = new Map<string, TopicIdeaContextRecord[]>();

  // Fetch source items
  console.log(`Fetching from ${adapters.length} source(s)...`);
  const allItems: SourceItem[] = [];
  for (const adapter of adapters) {
    try {
      const items = await adapter.fetch({ limit: options.limit ?? 50, since: new Date(Date.now() - 48 * 60 * 60 * 1000) });
      console.log(`  ${adapter.name}: ${items.length} items`);
      allItems.push(...items);
    } catch (error) {
      console.error(`  ${adapter.name} failed:`, error instanceof Error ? error.message : error);
    }
  }

  if (allItems.length === 0) {
    console.log("No source items fetched.");
    return [];
  }

  const scoredItems = allItems
    .map((item) => ({
      item,
      priority: computePriorityScore(item, inventoryMap, config.bufferTarget, options.mode),
    }))
    .sort((a, b) => b.priority - a.priority);

  const rankedItems = scoredItems.map((entry) => entry.item);

  // Batch items for LLM
  const systemPrompt = buildGenerationSystemPrompt(options.mode);
  const candidates: CandidateOutput[] = [];
  const batches: SourceItem[][] = [];

  for (let i = 0; i < rankedItems.length; i += config.batchSize) {
    batches.push(rankedItems.slice(i, i + config.batchSize));
  }

  console.log(`Processing ${rankedItems.length} items in ${batches.length} batch(es)...`);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`  Batch ${batchIndex + 1}/${batches.length} (${batch.length} items)...`);

    try {
      const processRawCandidates = (rawCandidates: unknown[]) => {
        let acceptedCount = 0;
        for (let i = 0; i < rawCandidates.length; i++) {
          const sourceItem = batch[i] ?? batch[batch.length - 1];
          const priority = computePriorityScore(sourceItem, inventoryMap, config.bufferTarget, options.mode);

          const candidate = validateCandidate(
            rawCandidates[i],
            sourceItem.source,
            sourceItem.sourceId,
            sourceItem.sourceUrl,
            sourceItem.publishedAt,
            priority,
            options.mode,
          );

          if (!candidate) {
            continue;
          }

          const existingIdeas = [
            ...(existingIdeasByDomain.get(candidate.domainId) ?? []),
            ...(acceptedIdeasByDomain.get(candidate.domainId) ?? []),
          ];
          const duplicate = findTopicIdeaDuplicate(candidate, existingIdeas);
          if (duplicate) {
            continue;
          }

          candidates.push(candidate);
          acceptedCount += 1;
          const nextAccepted = acceptedIdeasByDomain.get(candidate.domainId) ?? [];
          nextAccepted.push(topicIdeaRecordFromCandidate(candidate, candidate.sourceId));
          acceptedIdeasByDomain.set(candidate.domainId, nextAccepted);
        }
        return acceptedCount;
      };

      const rawCandidates = await generateJson(
        config,
        systemPrompt,
        buildGenerationUserPrompt(batch, existingIdeasByDomain),
      );
      const validCount = processRawCandidates(rawCandidates);

      console.log(`    ${validCount}/${rawCandidates.length} valid candidates`);

      // Retry batch if >50% failed
      if (rawCandidates.length > 0 && validCount < rawCandidates.length * 0.5) {
        console.log("    High failure rate, retrying batch...");
        try {
          const retryRaw = await generateJson(
            config,
            systemPrompt,
            buildGenerationUserPrompt(batch, existingIdeasByDomain),
          );
          processRawCandidates(retryRaw);
        } catch (retryError) {
          console.error("    Retry failed:", retryError instanceof Error ? retryError.message : retryError);
        }
      }
    } catch (error) {
      console.error(`    Batch ${batchIndex + 1} failed:`, error instanceof Error ? error.message : error);
    }
  }

  if (options.dryRun) {
    console.log(`\nDry run: ${candidates.length} candidates generated (not submitted)`);
    for (const c of candidates.slice(0, 10)) {
      console.log(`  [${c.domainId}] ${c.templateId} — ${c.title}`);
    }
    if (candidates.length > 10) {
      console.log(`  ... and ${candidates.length - 10} more`);
    }
  }

  return candidates;
}
