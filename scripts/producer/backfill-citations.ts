import { loadConfig } from "./src/config.js";
import { ApiClient } from "./src/api-client.js";

async function main() {
  const config = loadConfig({ dryRun: false });
  const client = new ApiClient(config);
  for (let i = 0; i < 10; i++) {
    const result = await (client as unknown as { request: (m: string, p: string) => Promise<unknown> }).request(
      "POST",
      "/v1/internal/topic-links/backfill-citations",
    );
    console.log(`Pass ${i + 1}:`, JSON.stringify(result));
    const data = result as { processed: number };
    if (data.processed === 0) break;
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
