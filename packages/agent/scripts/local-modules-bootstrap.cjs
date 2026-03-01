#!/usr/bin/env node
/*
 * Local modules bootstrapper
 * Best-effort installer-time setup for STT/TTS and AI4Bharat server.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
const statusPathIndex = args.indexOf("--statusPath");
const statusPath = statusPathIndex >= 0 ? args[statusPathIndex + 1] : null;

function writeStatus(stage, message, details = {}) {
  if (!statusPath) return;
  const payload = {
    stage,
    message,
    updatedAt: new Date().toISOString(),
    details,
  };
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  fs.writeFileSync(statusPath, JSON.stringify(payload, null, 2), "utf8");
}

function findPython() {
  const candidates = ["python", "python3"];
  for (const bin of candidates) {
    const result = spawnSync(bin, ["--version"], { stdio: "ignore" });
    if (result.status === 0) return bin;
  }
  return null;
}

function run(pythonBin, args, cwd) {
  return spawnSync(pythonBin, args, { cwd, stdio: "inherit" });
}

function pipInstall(pythonBin, packages, cwd) {
  return run(pythonBin, ["-m", "pip", "install", "--upgrade", ...packages], cwd);
}

function hasModule(pythonBin, moduleName) {
  const res = spawnSync(pythonBin, ["-c", `import ${moduleName}`], { stdio: "ignore" });
  return res.status === 0;
}

function hasBinary(binName) {
  const res = spawnSync(binName, ["--version"], { stdio: "ignore" });
  return res.status === 0;
}

function ensureAI4Bharat(pythonBin, details) {
  const serverDir = path.join(__dirname, "..", "src", "i18n", "indic_server");
  const setupScript = path.join(serverDir, "setup.py");
  const venvDir = path.join(serverDir, "venv");

  if (!fs.existsSync(setupScript)) {
    details.ai4bharat = "skipped (server files missing)";
    return;
  }

  if (fs.existsSync(venvDir)) {
    details.ai4bharat = "already configured";
    return;
  }

  const result = run(pythonBin, [setupScript], serverDir);
  details.ai4bharat = result.status === 0 ? "configured" : "failed";
}

function ensureSTT(pythonBin, details) {
  if (!hasModule(pythonBin, "whisper")) {
    const res = pipInstall(pythonBin, ["openai-whisper"], process.cwd());
    details.stt = res.status === 0 ? "whisper installed" : "whisper install failed";
  } else {
    details.stt = "whisper present";
  }

  if (!hasBinary("ffmpeg")) {
    details.stt_note = "ffmpeg not found; Whisper may not work until ffmpeg is installed";
  }
}

function ensureTTS(pythonBin, details) {
  if (!hasModule(pythonBin, "gtts")) {
    const res = pipInstall(pythonBin, ["gTTS"], process.cwd());
    details.tts = res.status === 0 ? "gTTS installed" : "gTTS install failed";
  } else {
    details.tts = "gTTS present";
  }

  if (!hasBinary("piper")) {
    details.tts_note = "piper not found; optional neural TTS not installed";
  }
  if (!hasBinary("espeak") && !hasBinary("espeak-ng")) {
    details.tts_fallback = "espeak not found; fallback TTS may be unavailable";
  }
}

function main() {
  const details = {};
  const pythonBin = findPython();
  if (!pythonBin) {
    writeStatus("error", "Python not found; unable to bootstrap STT/TTS or AI4Bharat", details);
    process.exit(1);
  }

  ensureAI4Bharat(pythonBin, details);
  ensureSTT(pythonBin, details);
  ensureTTS(pythonBin, details);

  writeStatus("ready", "Local modules bootstrap complete", details);
  process.exit(0);
}

main();
