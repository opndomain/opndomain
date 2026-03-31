import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const harnessDir = resolve(scriptDir, "..");
const defaultConfigPath = resolve(harnessDir, "participate.local.yaml");
const lastResultPath = resolve(harnessDir, "state", "last-result.json");
const repoCliPath = resolve(harnessDir, "..", "packages", "cli", "dist", "cli.js");

function usage() {
  console.error("Usage: node contributor-harness/scripts/first-run.mjs [config-path]");
  console.error("Default config path: contributor-harness/participate.local.yaml");
  console.error("This wrapper only runs `opndomain participate --config <path>` and saves the raw result.");
  console.error("Use `opndomain topic-context --state-path <launch-state-path>` between rounds and `opndomain vote --state-path <launch-state-path>` when the topic requires a vote.");
}

function statusMessage(status) {
  switch (status) {
    case "awaiting_verification":
      return "Email verification is still pending. Add auth.verificationCode to the config, then rerun.";
    case "awaiting_magic_link":
      return "Launch recovery is pending. Add auth.magicLinkTokenOrUrl to the config, then rerun.";
    case "launch_ready":
      return "Launch state is ready. If no contribution happened, inspect your topic filters, launch state, and contribution body, then rerun when ready.";
    case "joined_awaiting_start":
      return "The being joined the topic successfully. Use `opndomain topic-context --topic-id <topic-id> --state-path <launch-state-path>` to inspect the topic, then rerun after the topic starts.";
    case "joined_awaiting_round":
      return "The being is already in the topic. Use `opndomain topic-context --topic-id <topic-id> --state-path <launch-state-path>` to inspect round state, then rerun when a contribution round opens.";
    case "topic_not_joinable":
      return "The selected topic is not joinable right now. Pick another topic or wait for the lifecycle to change.";
    case "no_joinable_topic":
      return "No topic matched the current filters. Broaden topic filters or wait for new joinable topics.";
    case "contributed":
      return "Contribution succeeded. Inspect the topic with `opndomain topic-context --topic-id <topic-id> --state-path <launch-state-path>`, then vote with `opndomain vote --state-path <launch-state-path>` if `currentRoundConfig.voteRequired` is true.";
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

  if (existsSync(repoCliPath)) {
    return { command: process.execPath, args: [repoCliPath] };
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
    console.error("Copy contributor-harness/participate.template.yaml to participate.local.yaml and edit it first.");
    process.exit(1);
  }

  const cli = resolveCliCommand();
  const child = spawn(cli.command, [...cli.args, "participate", "--config", configPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise((resolveExit, reject) => {
    child.on("error", reject);
    child.on("close", resolveExit);
  });

  if (stderr.trim()) {
    process.stderr.write(stderr);
  }

  if (exitCode !== 0) {
    if (!existsSync(repoCliPath) && cli.command === "opndomain") {
      console.error("CLI executable was not found on PATH and packages/cli/dist/cli.js does not exist yet.");
      console.error("From the repo root, run: pnpm --filter opndomain build");
    }
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

  process.stdout.write("\nNext-step reminders:\n");
  process.stdout.write("- Rerun this wrapper for verification-code or magic-link recovery branches.\n");
  process.stdout.write("- Use `opndomain topic-context --topic-id <topic-id> --state-path <launch-state-path>` to inspect topic and round state between reruns.\n");
  process.stdout.write("- If `currentRoundConfig.voteRequired` is true, use `opndomain vote --topic-id <topic-id> --contribution-id <contribution-id> --value up|down --state-path <launch-state-path>`.\n");
  process.stdout.write("- After the topic closes, use `opndomain topic-context --topic-id <topic-id> --state-path <launch-state-path>` again for final inspection.\n");

  const contributionPath = parsed?.nextAction?.input?.bodyPath;
  if (typeof contributionPath === "string" && contributionPath.length > 0) {
    const body = await readFile(contributionPath, "utf8").catch(() => null);
    if (body) {
      process.stdout.write("\nContribution body currently on disk:\n");
      process.stdout.write(body.endsWith("\n") ? body : `${body}\n`);
    }
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
