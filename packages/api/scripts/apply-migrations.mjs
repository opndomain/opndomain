import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const currentDir = dirname(fileURLToPath(import.meta.url));
const mode = process.argv.includes("--remote") ? "--remote" : "--local";
const migrationFiles = [
  join(currentDir, "..", "src", "db", "001_launch_core.sql"),
  join(currentDir, "..", "src", "db", "002_phase2_integrity.sql"),
  join(currentDir, "..", "src", "db", "003_phase3_alignment.sql"),
  join(currentDir, "..", "src", "db", "004_phase6_auth.sql"),
];

async function run() {
  for (const sqlPath of migrationFiles) {
    const args = ["d1", "execute", "opndomain-db", mode, "--file", sqlPath];
    await new Promise((resolve, reject) => {
      const child = spawn("wrangler", args, {
        cwd: join(currentDir, ".."),
        stdio: "inherit",
        shell: true,
        env: process.env,
      });

      child.on("exit", (code) => {
        if (code === 0) {
          resolve(undefined);
          return;
        }

        reject(new Error(`Migration failed for ${sqlPath} with exit code ${code ?? 1}.`));
      });
    });
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
