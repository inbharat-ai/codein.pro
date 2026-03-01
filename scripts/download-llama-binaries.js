#!/usr/bin/env node
/**
 * download-llama-binaries.js
 *
 * Downloads pre-built llama-server binaries from the pinned llama.cpp release
 * and places them under electron-app/assets/llama/{platform}/.
 *
 * Usage:
 *   node scripts/download-llama-binaries.js           # current platform only
 *   node scripts/download-llama-binaries.js --all      # all platforms
 *   node scripts/download-llama-binaries.js --platform win32
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { createHash } = require("crypto");

const LLAMA_CPP_VERSION = "b3906";
const RELEASE_BASE = `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_CPP_VERSION}`;

const MANIFESTS = {
  win32: {
    url: `${RELEASE_BASE}/llama-${LLAMA_CPP_VERSION}-bin-win-cuda-cu12.2.0-x64.zip`,
    executable: "llama-server.exe",
    sha256: "(fetch from release notes)", // Set to actual SHA256 from GitHub release
  },
  darwin: {
    url: `${RELEASE_BASE}/llama-${LLAMA_CPP_VERSION}-bin-macos-arm64.zip`,
    executable: "llama-server",
    sha256: "(fetch from release notes)",
  },
  linux: {
    url: `${RELEASE_BASE}/llama-${LLAMA_CPP_VERSION}-bin-ubuntu-x64.zip`,
    executable: "llama-server",
    sha256: "(fetch from release notes)",
  },
};

const ASSET_DIR = path.resolve(
  __dirname,
  "..",
  "electron-app",
  "assets",
  "llama",
);

// ─── helpers ────────────────────────────────────────────────────────────────

function followRedirects(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    proto
      .get(url, { headers: { "User-Agent": "codin-downloader" } }, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          followRedirects(res.headers.location).then(resolve, reject);
          res.resume();
        } else if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        } else {
          resolve(res);
        }
      })
      .on("error", reject);
  });
}

async function download(url, dest) {
  console.log(`  Downloading ${path.basename(dest)} …`);
  const res = await followRedirects(url);
  const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
  let downloaded = 0;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    res.on("data", (chunk) => {
      downloaded += chunk.length;
      if (totalBytes) {
        const pct = ((downloaded / totalBytes) * 100).toFixed(1);
        process.stdout.write(`\r  Progress: ${pct}%`);
      }
    });
    res.pipe(file);
    file.on("finish", () => {
      process.stdout.write("\n");
      file.close(resolve);
    });
    file.on("error", (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

function extractZip(zipPath, targetDir) {
  // Use PowerShell on Windows, unzip on Unix
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${targetDir}'"`,
      { stdio: "inherit" },
    );
  } else {
    execSync(`unzip -o "${zipPath}" -d "${targetDir}"`, { stdio: "inherit" });
  }
}

function verifySha256(filePath, expectedSha256) {
  if (!expectedSha256 || expectedSha256.includes("(fetch")) {
    console.warn(
      `  ⚠ SHA256 not configured for ${path.basename(filePath)} — skipping verification`,
    );
    return true;
  }
  const hash = createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
  if (hash !== expectedSha256) {
    throw new Error(
      `SHA256 mismatch! Expected ${expectedSha256}, got ${hash}. File may be corrupted or compromised.`,
    );
  }
  console.log(`  ✓ SHA256 verified: ${hash.substring(0, 16)}...`);
  return true;
}

function findExecutable(dir, name) {
  // Walk extracted directory to find the executable (may be nested)
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory()) {
      const found = findExecutable(full, name);
      if (found) return found;
    }
  }
  return null;
}

// ─── main ───────────────────────────────────────────────────────────────────

async function downloadForPlatform(platform) {
  const manifest = MANIFESTS[platform];
  if (!manifest) {
    console.error(`Unknown platform: ${platform}`);
    process.exit(1);
  }

  const outDir = path.join(ASSET_DIR, platform);
  const destBinary = path.join(outDir, manifest.executable);

  if (fs.existsSync(destBinary)) {
    console.log(
      `✔ ${platform}/${manifest.executable} already present — skipping`,
    );
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });

  const tmpDir = path.join(ASSET_DIR, `_tmp_${platform}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const zipName = path.basename(new URL(manifest.url).pathname);
  const zipPath = path.join(tmpDir, zipName);

  try {
    console.log(
      `\n▸ Downloading llama-server for ${platform} (release ${LLAMA_CPP_VERSION}) …`,
    );
    await download(manifest.url, zipPath);

    console.log(`  Verifying integrity…`);
    verifySha256(zipPath, manifest.sha256);

    console.log(`  Extracting …`);
    extractZip(zipPath, tmpDir);

    const found = findExecutable(tmpDir, manifest.executable);
    if (!found) {
      throw new Error(
        `Could not find ${manifest.executable} in extracted archive`,
      );
    }

    fs.copyFileSync(found, destBinary);

    // Make executable on Unix
    if (platform !== "win32") {
      fs.chmodSync(destBinary, 0o755);
    }

    console.log(`✔ ${platform}/${manifest.executable} ready`);
  } finally {
    // Cleanup temp
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  let platforms;

  if (args.includes("--all")) {
    platforms = Object.keys(MANIFESTS);
  } else if (args.includes("--platform")) {
    const idx = args.indexOf("--platform");
    platforms = [args[idx + 1]];
  } else {
    // Default: current platform only
    platforms = [process.platform];
  }

  console.log(
    `llama-server binary provisioning (release ${LLAMA_CPP_VERSION})`,
  );
  console.log(`Target platforms: ${platforms.join(", ")}\n`);

  for (const platform of platforms) {
    await downloadForPlatform(platform);
  }

  console.log("\nDone. electron-app/assets/llama/ is ready for packaging.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
