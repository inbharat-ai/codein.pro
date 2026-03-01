#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

const TARGETS = [
  "dist",
  "release",
  "node_modules/.cache",
  "node_modules",
  "package-lock.json",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeWithRetries(targetPath, attempts = 6) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (!fs.existsSync(targetPath)) {
        return;
      }

      const stats = fs.lstatSync(targetPath);
      if (stats.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      } else {
        fs.rmSync(targetPath, { force: true, maxRetries: 10, retryDelay: 100 });
      }

      return;
    } catch (error) {
      lastError = error;
      await sleep(200 * attempt);
    }
  }

  throw lastError;
}

async function main() {
  console.log("[clean-build-paths] Starting cleanup...");

  for (const relativePath of TARGETS) {
    const absolutePath = path.join(root, relativePath);
    try {
      await removeWithRetries(absolutePath);
      console.log(`[clean-build-paths] Removed: ${relativePath}`);
    } catch (error) {
      console.error(`[clean-build-paths] Failed to remove ${relativePath}: ${error.message}`);
      process.exitCode = 1;
    }
  }

  if (process.exitCode && process.exitCode !== 0) {
    console.error("[clean-build-paths] Cleanup completed with errors");
    process.exit(process.exitCode);
  }

  console.log("[clean-build-paths] Cleanup completed successfully");
}

main().catch((error) => {
  console.error(`[clean-build-paths] Unexpected failure: ${error.message}`);
  process.exit(1);
});
