import { loadConfig } from "./config.js";
import { ApiClient } from "./api-client.js";
import { createRssAdapter } from "./sources/rss.js";
import { createArxivAdapter } from "./sources/arxiv.js";
import { createHuggingFaceAdapter } from "./sources/huggingface.js";
import { backfillDomain } from "./sources/backfill.js";
import { generateFromSources } from "./generate.js";
import { DOMAINS } from "./domains.js";
import { generateJson } from "./llm/client.js";
import { runRefinementPass } from "./refine.js";
import type { NoveltyContextByDomain, ProducerMode, SourceAdapter } from "./types.js";

async function loadNoveltyContext(client: ApiClient, domainIds: string[]): Promise<NoveltyContextByDomain> {
  const noveltyContextByDomain: NoveltyContextByDomain = new Map();
  for (const domainId of domainIds) {
    noveltyContextByDomain.set(domainId, await client.getTopicIdeaContext(domainId));
  }
  return noveltyContextByDomain;
}

const AVAILABLE_SOURCES: Record<string, () => SourceAdapter> = {
  rss: createRssAdapter,
  arxiv: createArxivAdapter,
  huggingface: createHuggingFaceAdapter,
};

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    } else {
      positional.push(arg);
    }
  }

  return { args, positional };
}

function parseMode(value: string | undefined): ProducerMode {
  if (!value) return "deep";
  if (value === "attention" || value === "deep") {
    return value;
  }

  console.error(`Invalid mode: ${value}. Expected "attention" or "deep".`);
  process.exit(1);
}

async function commandRun(argv: string[]) {
  const { args } = parseArgs(argv);
  const dryRun = args["dry-run"] === "true";
  const mode = parseMode(args.mode);
  const config = loadConfig({ dryRun });
  const client = new ApiClient(config);
  const limit = Number(args.limit ?? 50);

  const sourceNames = (args.sources ?? "rss,arxiv,huggingface").split(",").map((s) => s.trim());
  const adapters: SourceAdapter[] = [];
  for (const name of sourceNames) {
    const factory = AVAILABLE_SOURCES[name];
    if (!factory) {
      console.error(`Unknown source: ${name}. Available: ${Object.keys(AVAILABLE_SOURCES).join(", ")}`);
      process.exit(1);
  }
  adapters.push(factory());
  }

  const [inventory, noveltyContextByDomain] = await Promise.all([
    dryRun ? Promise.resolve([]) : client.getInventory(),
    loadNoveltyContext(client, DOMAINS.map((domain) => domain.id)),
  ]);
  const candidates = await generateFromSources(config, adapters, inventory, {
    dryRun,
    limit,
    mode,
    noveltyContextByDomain,
  });

  if (!dryRun && candidates.length > 0) {
    // Submit in batches of 50
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalDuplicates = 0;

    for (let i = 0; i < candidates.length; i += 50) {
      const batch = candidates.slice(i, i + 50);
      const result = await client.upsertCandidates(batch);
      totalCreated += result.createdCount;
      totalUpdated += result.updatedCount;
      totalDuplicates += result.duplicates.length;
    }

    console.log(`\nSubmitted: ${totalCreated} created, ${totalUpdated} updated, ${totalDuplicates} duplicates`);
  }
}

async function commandBackfill(argv: string[]) {
  const { args } = parseArgs(argv);
  const dryRun = args["dry-run"] === "true";
  const mode = parseMode(args.mode);
  const config = loadConfig({ dryRun });
  const client = new ApiClient(config);
  const count = Number(args.count ?? 20);
  const domainArg = args.domains ?? "all";

  const domainSlugs = domainArg === "all"
    ? DOMAINS.map((d) => d.slug)
    : domainArg.split(",").map((s) => s.trim());
  const noveltyContextByDomain = await loadNoveltyContext(
    client,
    domainSlugs.flatMap((slug) => {
      const domainId = DOMAINS.find((domain) => domain.slug === slug)?.id;
      return domainId ? [domainId] : [];
    }),
  );

  let totalGenerated = 0;
  let totalCreated = 0;

  for (const slug of domainSlugs) {
    const domain = DOMAINS.find((d) => d.slug === slug);
    if (!domain) {
      console.error(`Unknown domain: ${slug}`);
      continue;
    }

    try {
      console.log(`Backfilling ${domain.slug} (${count} topics)...`);
      const candidates = await backfillDomain(
        config,
        domain.id,
        count,
        mode,
        noveltyContextByDomain.get(domain.id) ?? [],
      );
      totalGenerated += candidates.length;
      console.log(`  Generated ${candidates.length} candidates`);

      if (dryRun) {
        for (const c of candidates.slice(0, 5)) {
          console.log(`    [${c.templateId}] ${c.title}`);
        }
        if (candidates.length > 5) console.log(`    ... and ${candidates.length - 5} more`);
      } else if (candidates.length > 0) {
        for (let i = 0; i < candidates.length; i += 50) {
          const batch = candidates.slice(i, i + 50);
          const result = await client.upsertCandidates(batch);
          totalCreated += result.createdCount;
        }
      }
    } catch (error) {
      console.error(`  Failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`\nBackfill complete: ${totalGenerated} generated, ${totalCreated} created`);
}

async function commandInventory() {
  const config = loadConfig();
  const client = new ApiClient(config);
  const inventory = await client.getInventory();

  console.log("Domain Candidate Inventory:");
  console.log("─".repeat(60));

  let total = 0;
  for (const item of inventory) {
    const bar = "█".repeat(Math.min(30, Math.round((item.approvedCount / config.bufferTarget) * 30)));
    const pct = Math.round((item.approvedCount / config.bufferTarget) * 100);
    console.log(`  ${item.domainSlug.padEnd(25)} ${String(item.approvedCount).padStart(5)} / ${config.bufferTarget}  ${bar} ${pct}%`);
    total += item.approvedCount;
  }

  console.log("─".repeat(60));
  console.log(`  Total: ${total} approved candidates across ${inventory.length} domains`);
}

async function commandCleanup(argv: string[]) {
  const { args } = parseArgs(argv);
  const config = loadConfig();
  const client = new ApiClient(config);
  const maxAgeDays = Number(args["max-age-days"] ?? 7);

  console.log(`Cleaning up consumed/failed candidates older than ${maxAgeDays} days...`);
  const result = await client.cleanup(maxAgeDays);
  console.log(`Deleted ${result.deleted} expired candidates.`);
}

async function commandRefine(argv: string[]) {
  const { args } = parseArgs(argv);
  const dryRun = args["dry-run"] === "true";
  const config = loadConfig({ dryRun });
  const client = new ApiClient(config);

  if (dryRun) {
    const eligible = await client.getRefinementEligible();
    console.log(`Found ${eligible.length} refinement-eligible closed topics.`);
    return;
  }

  const result = await runRefinementPass(config, client, { generateJson });
  console.log(`Refinement pass: ${result.refined} eligible, ${result.createdCount} created, ${result.updatedCount} updated, ${result.duplicates} duplicates`);
}

function printUsage() {
  console.log(`Usage: tsx src/index.ts <command> [options]

Commands:
  run        Fetch external sources, generate candidates, submit to API
    --sources rss,arxiv,huggingface    Comma-separated source list (default: all)
    --limit 50                          Max items per source (default: 50)
    --mode attention|deep               Topic generation mode (default: deep)
    --dry-run                           Generate but don't submit

  backfill   Generate topics from LLM for domains without external sources
    --domains all                       Comma-separated domain slugs or "all" (default: all)
    --count 20                          Topics per domain (default: 20)
    --mode attention|deep               Topic generation mode (default: deep)
    --dry-run                           Generate but don't submit

  inventory  Show current candidate buffer levels per domain

  cleanup    Delete old consumed/failed candidates
    --max-age-days 7                    Max age for cleanup (default: 7)

  refine     Generate vertical-refinement follow-up candidates from closed topics
    --dry-run                           Report eligible topics without submitting
`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "run":
      await commandRun(rest);
      break;
    case "backfill":
      await commandBackfill(rest);
      break;
    case "inventory":
      await commandInventory();
      break;
    case "cleanup":
      await commandCleanup(rest);
      break;
    case "refine":
      await commandRefine(rest);
      break;
    default:
      printUsage();
      process.exit(command ? 1 : 0);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
