import { copyFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

function collectTestFiles(rootDir) {
  const paths = [];
  for (const entry of readdirSync(rootDir)) {
    const fullPath = join(rootDir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      paths.push(...collectTestFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith(".test.js")) {
      paths.push(fullPath);
    }
  }
  return paths;
}

function copyCompiledSharedRuntimeFiles() {
  const compiledSharedDir = fileURLToPath(new URL("../test-dist/shared/src", import.meta.url));
  const sharedSourceDir = fileURLToPath(new URL("../../shared/src", import.meta.url));
  const copiedFiles = [];
  for (const entry of readdirSync(compiledSharedDir)) {
    if (!entry.endsWith(".js")) {
      continue;
    }
    const targetPath = join(sharedSourceDir, entry);
    copyFileSync(join(compiledSharedDir, entry), targetPath);
    copiedFiles.push(targetPath);
  }
  return copiedFiles;
}

async function run() {
  const copiedFiles = copyCompiledSharedRuntimeFiles();
  try {
    const testFiles = collectTestFiles(fileURLToPath(new URL("../test-dist/mcp/src", import.meta.url)));
    for (const testFile of testFiles) {
      const module = await import(pathToFileURL(testFile).href);
      if (typeof module.runAllTests === "function") {
        await module.runAllTests();
      }
    }
  } finally {
    for (const copiedFile of copiedFiles) {
      unlinkSync(copiedFile);
    }
  }
  console.log("MCP self-tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
