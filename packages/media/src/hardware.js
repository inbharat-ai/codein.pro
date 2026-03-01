/**
 * CodeIn Media Toolkit — Hardware Detection
 *
 * Detects CPU / GPU / VRAM on Windows, macOS, Linux.
 * Returns a deterministic HardwareProfile object.
 */

"use strict";

const { execSync } = require("child_process");
const os = require("os");

/** @enum {string} */
const GpuVendor = {
  NVIDIA: "nvidia",
  APPLE_SILICON: "apple_silicon",
  AMD: "amd",
  INTEL: "intel",
  NONE: "none",
};

/** @enum {string} */
const VramTier = {
  NONE: "none", // no GPU or not detected
  LOW: "low", // < 4 GB
  MEDIUM: "medium", // 4–8 GB
  HIGH: "high", // 8–16 GB
  ULTRA: "ultra", // > 16 GB
  UNKNOWN: "unknown", // GPU present but VRAM unknown (treat as LOW)
};

/**
 * @typedef {Object} HardwareProfile
 * @property {boolean}  gpuAvailable
 * @property {string}   gpuVendor        - one of GpuVendor
 * @property {string}   gpuName          - human-readable GPU name
 * @property {number}   vramMB           - detected VRAM in MB (0 if unknown)
 * @property {string}   vramTier         - one of VramTier
 * @property {boolean}  cudaAvailable    - NVIDIA CUDA toolkit found
 * @property {boolean}  mpsAvailable     - Apple Metal Performance Shaders
 * @property {number}   cpuCores         - logical CPU cores
 * @property {number}   ramMB            - total system RAM in MB
 * @property {string}   platform         - 'win32' | 'darwin' | 'linux'
 * @property {string}   arch             - 'x64' | 'arm64' etc
 * @property {string[]} warnings         - any detection caveats
 */

/** Run a shell command, return trimmed stdout or empty string on failure */
function exec(cmd) {
  try {
    return execSync(cmd, {
      timeout: 10_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function classifyVram(mb) {
  if (mb <= 0) return VramTier.UNKNOWN;
  if (mb < 4096) return VramTier.LOW;
  if (mb < 8192) return VramTier.MEDIUM;
  if (mb < 16384) return VramTier.HIGH;
  return VramTier.ULTRA;
}

// ── NVIDIA detection ────────────────────────────────────────

function detectNvidia() {
  const smi = exec(
    "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits",
  );
  if (!smi) return null;
  // e.g. "NVIDIA GeForce RTX 3060, 12288"
  const parts = smi.split(",").map((s) => s.trim());
  const name = parts[0] || "NVIDIA GPU";
  const vram = parseInt(parts[1], 10) || 0;
  return { name, vramMB: vram };
}

function detectCuda() {
  // Check for nvcc or torch CUDA
  const nvcc = exec("nvcc --version");
  if (nvcc.includes("release")) return true;
  // Check if nvidia-smi responds (driver present → CUDA runtime likely works)
  const smi = exec("nvidia-smi");
  return smi.includes("NVIDIA");
}

// ── Apple Silicon detection ─────────────────────────────────

function detectAppleSilicon() {
  if (os.platform() !== "darwin") return null;
  const chip = exec("sysctl -n machdep.cpu.brand_string");
  if (!chip.toLowerCase().includes("apple")) return null;
  // Unified memory — total RAM serves as "VRAM" for MPS
  const totalMem = Math.round(os.totalmem() / (1024 * 1024));
  return { name: chip, vramMB: totalMem };
}

// ── Linux / AMD detection ───────────────────────────────────

function detectAmdLinux() {
  // ROCm
  const rocm = exec("rocm-smi --showmeminfo vram --csv");
  if (rocm) {
    const m = rocm.match(/(\d+)\s*$/m);
    const vram = m ? Math.round(parseInt(m[1], 10) / (1024 * 1024)) : 0;
    return { name: "AMD GPU (ROCm)", vramMB: vram };
  }
  return null;
}

// ── Windows WMI fallback ────────────────────────────────────

function detectWindowsGpu() {
  if (os.platform() !== "win32") return null;
  const wmi = exec(
    'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | Format-List"',
  );
  if (!wmi) return null;
  const nameMatch = wmi.match(/Name\s*:\s*(.+)/i);
  const ramMatch = wmi.match(/AdapterRAM\s*:\s*(\d+)/i);
  if (!nameMatch) return null;
  const name = nameMatch[1].trim();
  const vram = ramMatch
    ? Math.round(parseInt(ramMatch[1], 10) / (1024 * 1024))
    : 0;
  const vendor = name.toLowerCase().includes("nvidia")
    ? GpuVendor.NVIDIA
    : name.toLowerCase().includes("amd") ||
        name.toLowerCase().includes("radeon")
      ? GpuVendor.AMD
      : name.toLowerCase().includes("intel")
        ? GpuVendor.INTEL
        : GpuVendor.NONE;
  return { name, vramMB: vram, vendor };
}

// ── Main detection ──────────────────────────────────────────

/**
 * Detect hardware capabilities. Safe to call on any OS — never throws.
 * @returns {HardwareProfile}
 */
function detectHardware() {
  const warnings = [];
  const platform = os.platform();
  const arch = os.arch();
  const cpuCores = os.cpus().length;
  const ramMB = Math.round(os.totalmem() / (1024 * 1024));

  let gpuAvailable = false;
  let gpuVendor = GpuVendor.NONE;
  let gpuName = "";
  let vramMB = 0;
  let cudaAvailable = false;
  let mpsAvailable = false;

  // 1. Try NVIDIA first (cross-platform)
  const nv = detectNvidia();
  if (nv) {
    gpuAvailable = true;
    gpuVendor = GpuVendor.NVIDIA;
    gpuName = nv.name;
    vramMB = nv.vramMB;
    cudaAvailable = detectCuda();
    if (!cudaAvailable) {
      warnings.push(
        "NVIDIA GPU detected but CUDA toolkit not found. Install CUDA for best performance.",
      );
    }
  }

  // 2. Apple Silicon
  if (!gpuAvailable) {
    const apple = detectAppleSilicon();
    if (apple) {
      gpuAvailable = true;
      gpuVendor = GpuVendor.APPLE_SILICON;
      gpuName = apple.name;
      vramMB = apple.vramMB; // unified memory
      mpsAvailable = true;
    }
  }

  // 3. AMD on Linux
  if (!gpuAvailable && platform === "linux") {
    const amd = detectAmdLinux();
    if (amd) {
      gpuAvailable = true;
      gpuVendor = GpuVendor.AMD;
      gpuName = amd.name;
      vramMB = amd.vramMB;
      warnings.push("AMD GPU detected via ROCm. Support is experimental.");
    }
  }

  // 4. Windows WMI fallback
  if (!gpuAvailable && platform === "win32") {
    const win = detectWindowsGpu();
    if (
      win &&
      win.vendor !== GpuVendor.INTEL &&
      win.vendor !== GpuVendor.NONE
    ) {
      gpuAvailable = true;
      gpuVendor = win.vendor;
      gpuName = win.name;
      vramMB = win.vramMB;
      if (win.vendor === GpuVendor.NVIDIA) cudaAvailable = detectCuda();
    }
  }

  const vramTier = gpuAvailable ? classifyVram(vramMB) : VramTier.NONE;
  if (vramTier === VramTier.UNKNOWN && gpuAvailable) {
    warnings.push(
      "GPU detected but VRAM size unknown; treating as low-VRAM device.",
    );
  }

  return {
    gpuAvailable,
    gpuVendor,
    gpuName,
    vramMB,
    vramTier,
    cudaAvailable,
    mpsAvailable,
    cpuCores,
    ramMB,
    platform,
    arch,
    warnings,
  };
}

/**
 * Human-readable hardware summary for the UI
 * @param {HardwareProfile} hw
 * @returns {string}
 */
function summarizeHardware(hw) {
  if (!hw.gpuAvailable) {
    return `CPU-only — ${hw.cpuCores} cores, ${Math.round(hw.ramMB / 1024)} GB RAM`;
  }
  const vram =
    hw.vramMB > 0 ? `${Math.round(hw.vramMB / 1024)} GB VRAM` : "VRAM unknown";
  const accel = hw.cudaAvailable ? "CUDA" : hw.mpsAvailable ? "MPS/Metal" : "";
  return `GPU: ${hw.gpuName} (${vram}${accel ? ", " + accel : ""}) + ${hw.cpuCores}-core CPU, ${Math.round(hw.ramMB / 1024)} GB RAM`;
}

module.exports = {
  GpuVendor,
  VramTier,
  detectHardware,
  summarizeHardware,
  classifyVram,
};
