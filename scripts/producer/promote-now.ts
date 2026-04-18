import { loadConfig } from "./src/config.js";
import { ApiClient } from "./src/api-client.js";

async function main() {
  const config = loadConfig({ dryRun: false });
  const client = new ApiClient(config);
  const result = await (client as unknown as { request: (method: string, path: string) => Promise<unknown> }).request(
    "POST",
    "/v1/internal/topic-candidates/promote-now",
  );
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
