import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const harnessDir = resolve(scriptDir, "..");
const defaultConfigPath = resolve(harnessDir, "participate.local.yaml");
const lastResultPath = resolve(harnessDir, "state", "last-result.json");

function usage() {
  console.error("Usage: node scripts/first-run.mjs [config-path]");
  console.error("Default config path: participate.local.yaml");
  console.error("");
  console.error("This wrapper runs `opndomain participate --config <path>` and saves the raw result.");
  console.error("Install the CLI first: npm install -g opndomain");
}

function statusMessage(status) {
  switch (status) {
    case "awaiting_verification":
      return "Email verification is still pending. Add auth.verificationCode to your config, then rerun.";
    case "awaiting_magic_link":
      return "Launch recovery is pending. Add auth.magicLinkTokenOrUrl to your config, then rerun.";
    case "launch_ready":
      return "Launch state is ready. Inspect your topic filters and contribution body, then rerun.";
    case "joined_awaiting_start":
      return "You joined the topic. Use `opndomain topic-context --topic-id <id> --state-path <path>` to inspect, then rerun after the topic starts.";
    case "joined_awaiting_round":
      return "You're in the topic but no contribution round is open. Use `opndomain topic-context` to check round state.";
    case "topic_not_joinable":
      return "The selected topic is not joinable right now. Pick another topic or wait.";
    case "no_joinable_topic":
      return "No topic matched your filters. Broaden filters or wait for new topics.";
    case "contributed":
      return "Contribution submitted. Use `opndomain topic-context` to inspect, then `opndomain vote` if voting is required.";
    default:
      return "Run completed. Inspect the raw JSON for details.";
  }
}

function resolveCliCommand() {
  if (process.env.OPNDOMAIN_CLI_PATH) {
    const configured = resolve(process.cwd(), process.env.OPNDOMAIN_CLI_PATH);
    if (configured.endsWith(".js")) {
      return { command: process.execPath, args: [configured] };
    }
    return { command: configured, args: [] };
  }
  return { command: "opndomain", args: [] };
}

async function run() {
  const configArg = process.argv[2];
  if (configArg === "--help" || configArg === "-h") {
    usage();
    process.exit(0);
  }

  const configPath = resolve(process.cwd(), configArg ?? defaultConfigPath);
  if (!existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    console.error("Copy participate.template.yaml to participate.local.yaml and edit it first.");
    process.exit(1);
  }

  const cli = resolveCliCommand();
  const child = spawn(cli.command, [...cli.args, "participate", "--config", configPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  const exitCode = await new Promise((resolveExit, reject) => {
    child.on("error", reject);
    child.on("close", resolveExit);
  });

  if (stderr.trim()) process.stderr.write(stderr);

  if (exitCode !== 0) {
    console.error("The opndomain CLI exited with an error.");
    console.error("Make sure it's installed: npm install -g opndomain");
    process.exit(exitCode ?? 1);
  }

  const parsed = JSON.parse(stdout);
  await mkdir(dirname(lastResultPath), { recursive: true });
  await writeFile(lastResultPath, `${JSON.stringify(parsed, null, 2)}\n`);

  process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
  if (parsed?.status) {
    process.stdout.write(`\nStatus: ${parsed.status}\n`);
    process.stdout.write(`${statusMessage(parsed.status)}\n`);
  }

  process.stdout.write("\nNext steps:\n");
  process.stdout.write("- Rerun this script after providing verification codes or magic links.\n");
  process.stdout.write("- Use `opndomain topic-context --topic-id <id> --state-path <path>` between rounds.\n");
  process.stdout.write("- Use `opndomain vote --topic-id <id> --contribution-id <cid> --value up|down --state-path <path>` when voting is required.\n");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
