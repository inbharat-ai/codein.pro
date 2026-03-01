/**
 * CodeIn Landing Page — Client-side logic
 * OS auto-detection · GitHub Releases integration · Download cards · FAQ
 */

// ─── Configuration ──────────────────────────────────────────
const GITHUB_REPO = "inbharatai/codein";
const MANIFEST_URL = "downloads.json"; // local fallback
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

// ─── OS Detection ───────────────────────────────────────────
function detectOS() {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || "";

  // Use modern API if available
  if (navigator.userAgentData) {
    const p = navigator.userAgentData.platform?.toLowerCase() || "";
    if (p.includes("windows")) return "windows";
    if (p.includes("macos")) return "mac";
    if (p.includes("linux")) return "linux";
  }

  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";

  return "windows"; // sensible default
}

function detectArch() {
  // Apple Silicon detection
  if (detectOS() === "mac") {
    const ua = navigator.userAgent;
    // Canvas-based detection (most reliable)
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl");
      if (gl) {
        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          if (renderer.includes("Apple M") || renderer.includes("Apple GPU")) {
            return "arm64";
          }
        }
      }
    } catch (_) {}
    // Fallback: check userAgent for arm
    if (ua.includes("ARM") || ua.includes("aarch64")) return "arm64";
    return "x64"; // Intel Mac default
  }
  return "x64";
}

const currentOS = detectOS();
const currentArch = detectArch();

// ─── Download Data ──────────────────────────────────────────
const PLATFORM_CONFIG = {
  windows: {
    label: "Windows",
    icon: "windows",
    assets: [
      {
        key: "win_x64",
        label: "Windows Installer (x64)",
        format: "NSIS .exe",
        primary: true,
      },
      {
        key: "win_x64_portable",
        label: "Windows Portable (x64)",
        format: "Portable .exe",
        primary: false,
      },
    ],
  },
  mac: {
    label: "macOS",
    icon: "apple",
    assets: [
      {
        key: "mac_arm64",
        label: "macOS (Apple Silicon)",
        format: "DMG",
        primary: currentArch === "arm64",
      },
      {
        key: "mac_x64",
        label: "macOS (Intel)",
        format: "DMG",
        primary: currentArch === "x64",
      },
    ],
  },
  linux: {
    label: "Linux",
    icon: "linux",
    assets: [
      {
        key: "linux_x64_appimage",
        label: "Linux AppImage (x64)",
        format: "AppImage",
        primary: true,
      },
      {
        key: "linux_x64_deb",
        label: "Linux Debian (x64)",
        format: ".deb",
        primary: false,
      },
    ],
  },
};

let manifest = null; // populated from JSON/API

// ─── Fetching ───────────────────────────────────────────────
async function loadManifest() {
  // Try GitHub Releases API first
  try {
    const res = await fetch(GITHUB_API, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (res.ok) {
      const data = await res.json();
      manifest = parseGitHubRelease(data);
      updateReleaseMeta(data);
      return;
    }
  } catch (_) {}

  // Fallback to static manifest
  try {
    const res = await fetch(MANIFEST_URL);
    if (res.ok) {
      manifest = await res.json();
      return;
    }
  } catch (_) {}

  // Ultimate fallback — use baked-in data
  manifest = generateFallbackManifest();
}

function parseGitHubRelease(release) {
  const assets = {};
  for (const a of release.assets || []) {
    const name = a.name.toLowerCase();
    let key = null;

    if (name.includes("portable") && name.endsWith(".exe"))
      key = "win_x64_portable";
    else if (name.endsWith(".exe") && !name.includes("blockmap"))
      key = "win_x64";
    else if (name.includes("arm64") && name.endsWith(".dmg")) key = "mac_arm64";
    else if (name.endsWith(".dmg")) key = "mac_x64";
    else if (name.endsWith(".appimage")) key = "linux_x64_appimage";
    else if (name.endsWith(".deb")) key = "linux_x64_deb";

    if (key) {
      assets[key] = {
        name: a.name,
        label: key,
        url: a.browser_download_url,
        sha256: "See release notes",
        size: formatBytes(a.size),
        format: a.content_type,
      };
    }
  }

  return {
    version: release.tag_name,
    releaseDate: new Date(release.published_at).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    assets,
  };
}

function updateReleaseMeta(release) {
  const ver = document.getElementById("release-version");
  const date = document.getElementById("release-date");
  const link = document.getElementById("release-notes-link");
  if (ver) ver.textContent = release.tag_name;
  if (date)
    date.textContent = new Date(release.published_at).toLocaleDateString(
      "en-IN",
      { year: "numeric", month: "long" },
    );
  if (link) link.href = release.html_url;
}

function generateFallbackManifest() {
  return {
    version: "v1.0.0",
    releaseDate: "July 2025",
    assets: {
      win_x64: {
        name: "CodeIn-1.0.0-x64.exe",
        url: `https://github.com/${GITHUB_REPO}/releases/latest`,
        sha256: "PENDING",
        size: "~120 MB",
      },
      win_x64_portable: {
        name: "CodeIn-1.0.0-x64-portable.exe",
        url: `https://github.com/${GITHUB_REPO}/releases/latest`,
        sha256: "PENDING",
        size: "~115 MB",
      },
      mac_arm64: {
        name: "CodeIn-1.0.0-arm64.dmg",
        url: `https://github.com/${GITHUB_REPO}/releases/latest`,
        sha256: "PENDING",
        size: "~125 MB",
      },
      mac_x64: {
        name: "CodeIn-1.0.0-x64.dmg",
        url: `https://github.com/${GITHUB_REPO}/releases/latest`,
        sha256: "PENDING",
        size: "~130 MB",
      },
      linux_x64_appimage: {
        name: "CodeIn-1.0.0-x64.AppImage",
        url: `https://github.com/${GITHUB_REPO}/releases/latest`,
        sha256: "PENDING",
        size: "~140 MB",
      },
      linux_x64_deb: {
        name: "CodeIn-1.0.0-x64.deb",
        url: `https://github.com/${GITHUB_REPO}/releases/latest`,
        sha256: "PENDING",
        size: "~135 MB",
      },
    },
  };
}

// ─── Rendering ──────────────────────────────────────────────
let activePlatform = currentOS;

function showPlatform(platform) {
  activePlatform = platform;
  // Update tabs
  document.querySelectorAll(".os-tab").forEach((t) => {
    t.classList.remove("bg-white/10", "text-white");
    t.classList.add("text-gray-400");
  });
  const activeTab = document.getElementById(`tab-${platform}`);
  if (activeTab) {
    activeTab.classList.add("bg-white/10", "text-white");
    activeTab.classList.remove("text-gray-400");
  }
  renderDownloadCards(platform);
}

function renderDownloadCards(platform) {
  const container = document.getElementById("download-cards");
  if (!container || !manifest) return;

  const config = PLATFORM_CONFIG[platform];
  if (!config) return;

  container.innerHTML = config.assets
    .map((asset) => {
      const data = manifest.assets?.[asset.key];
      if (!data) return "";

      const isPrimary = asset.primary;
      const borderColor = isPrimary ? "border-brand-500/30" : "border-white/5";
      const bgColor = isPrimary ? "bg-brand-500/5" : "bg-surface-900/50";
      const badgeBg = isPrimary
        ? "bg-brand-500/20 text-brand-300"
        : "bg-surface-700 text-gray-400";

      return `
      <div class="download-card relative p-6 rounded-2xl border ${borderColor} ${bgColor} hover:border-brand-500/40 transition-all duration-300 group">
        ${isPrimary ? '<div class="absolute -top-3 left-6"><span class="px-3 py-1 rounded-full bg-brand-500 text-white text-xs font-semibold shadow-lg shadow-brand-500/25">Recommended</span></div>' : ""}

        <div class="flex items-start justify-between mb-4 ${isPrimary ? "mt-2" : ""}">
          <div>
            <h3 class="text-lg font-semibold text-white mb-1">${asset.label}</h3>
            <p class="text-sm text-gray-500">${data.name} · ${data.size}</p>
          </div>
          <span class="px-2.5 py-1 rounded-lg ${badgeBg} text-xs font-mono">${asset.format}</span>
        </div>

        <!-- SHA-256 -->
        <div class="mb-5">
          <div class="flex items-center gap-2 mb-1.5">
            <svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            <span class="text-xs text-gray-500">SHA-256</span>
          </div>
          <div class="flex items-center gap-2">
            <code class="sha-display flex-1 text-xs font-mono text-gray-500 bg-surface-800/80 px-3 py-1.5 rounded-lg truncate">${data.sha256}</code>
            <button onclick="copySha('${data.sha256}')" class="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors" title="Copy checksum">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
          </div>
        </div>

        <!-- Download button -->
        <a href="${data.url}" class="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl ${isPrimary ? "bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-600/20" : "bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10"} font-medium text-sm transition-all duration-200">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          Download ${isPrimary ? "" : "(alternate)"}
        </a>
      </div>
    `;
    })
    .join("");
}

// ─── Hero Button Logic ──────────────────────────────────────
function updateHeroForOS() {
  const config = PLATFORM_CONFIG[currentOS];
  const btnText = document.getElementById("hero-btn-text");
  const osLabel = document.getElementById("hero-os-label");
  const ctaText = document.getElementById("cta-btn-text");

  if (btnText)
    btnText.textContent = `Download for ${config?.label || "your OS"}`;
  if (osLabel)
    osLabel.textContent = `Detected: ${config?.label || "Unknown OS"}`;
  if (ctaText)
    ctaText.textContent = `Download for ${config?.label || "your OS"}`;
}

function downloadForCurrentOS() {
  if (!manifest) {
    window.location.href = `https://github.com/${GITHUB_REPO}/releases/latest`;
    return;
  }

  const config = PLATFORM_CONFIG[currentOS];
  const primaryAsset = config?.assets.find((a) => a.primary);
  const data = manifest.assets?.[primaryAsset?.key];

  if (data?.url) {
    window.location.href = data.url;
  } else {
    window.location.href = `https://github.com/${GITHUB_REPO}/releases/latest`;
  }
}

// ─── Clipboard ──────────────────────────────────────────────
async function copySha(hash) {
  try {
    await navigator.clipboard.writeText(hash);
    showToast("SHA-256 copied to clipboard");
  } catch (_) {
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = hash;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("SHA-256 copied to clipboard");
  }
}

function showToast(msg) {
  const existing = document.getElementById("toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "toast";
  toast.className =
    "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-surface-800 border border-brand-500/30 text-sm text-white shadow-2xl shadow-black/40 flex items-center gap-2 animate-slide-up";
  toast.innerHTML = `
    <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
    ${msg}
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ─── FAQ Toggle ─────────────────────────────────────────────
function toggleFaq(btn) {
  const item = btn.closest(".faq-item");
  const answer = item.querySelector(".faq-answer");
  const chevron = item.querySelector(".faq-chevron");
  const isOpen = !answer.classList.contains("hidden");

  // Close all
  document
    .querySelectorAll(".faq-answer")
    .forEach((a) => a.classList.add("hidden"));
  document
    .querySelectorAll(".faq-chevron")
    .forEach((c) => c.classList.remove("rotate-180"));

  if (!isOpen) {
    answer.classList.remove("hidden");
    chevron.classList.add("rotate-180");
  }
}

// ─── Navbar Scroll Effect ───────────────────────────────────
function handleNavbarScroll() {
  const navbar = document.getElementById("navbar");
  if (!navbar) return;
  if (window.scrollY > 50) {
    navbar.classList.add(
      "bg-surface-950/80",
      "backdrop-blur-xl",
      "border-b",
      "border-white/5",
    );
  } else {
    navbar.classList.remove(
      "bg-surface-950/80",
      "backdrop-blur-xl",
      "border-b",
      "border-white/5",
    );
  }
}

// ─── Mobile Menu ────────────────────────────────────────────
function setupMobileMenu() {
  const btn = document.getElementById("mobile-menu-btn");
  const menu = document.getElementById("mobile-menu");
  if (!btn || !menu) return;

  btn.addEventListener("click", () => {
    menu.classList.toggle("hidden");
  });

  // Close on link click
  menu.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => menu.classList.add("hidden"));
  });
}

// ─── Intersection Observer for Animations ───────────────────
function setupScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("animate-slide-up");
          entry.target.style.opacity = "1";
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
  );

  document
    .querySelectorAll(".feature-card, .skill-card, .download-card")
    .forEach((el) => {
      el.style.opacity = "0";
      observer.observe(el);
    });
}

// ─── Language Switcher ──────────────────────────────────────
function toggleLangMenu() {
  const menu = document.getElementById("lang-menu");
  if (menu) menu.classList.toggle("hidden");
}

function buildLangMenus() {
  if (typeof LANG_META === "undefined") return;

  const menu = document.getElementById("lang-menu");
  const mobileList = document.getElementById("mobile-lang-list");

  const langs = Object.keys(LANG_META);

  if (menu) {
    menu.innerHTML = langs
      .map((code) => {
        const m = LANG_META[code];
        return `<button onclick="switchLang('${code}')" data-lang="${code}" class="lang-btn w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors flex items-center gap-2">
        <span>${m.flag}</span>
        <span class="text-gray-300">${m.native}</span>
        <span class="text-gray-600 text-xs ml-auto">${m.label}</span>
      </button>`;
      })
      .join("");
  }

  if (mobileList) {
    mobileList.innerHTML = langs
      .map((code) => {
        const m = LANG_META[code];
        return `<button onclick="switchLang('${code}')" data-lang="${code}" class="lang-btn-mobile px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-gray-300 hover:bg-white/10 transition-all">
        ${m.flag} ${m.native}
      </button>`;
      })
      .join("");
  }
}

function switchLang(code) {
  if (typeof setLanguage === "function") {
    setLanguage(code);
  }
  // Update label
  const label = document.getElementById("current-lang-label");
  if (label && typeof LANG_META !== "undefined" && LANG_META[code]) {
    label.textContent = LANG_META[code].native;
  }
  // Close menu
  const menu = document.getElementById("lang-menu");
  if (menu) menu.classList.add("hidden");
  // Highlight active button
  highlightActiveLang(code);
}

function highlightActiveLang(code) {
  document.querySelectorAll(".lang-btn, .lang-btn-mobile").forEach((btn) => {
    const isActive = btn.dataset.lang === code;
    btn.classList.toggle("bg-brand-500/10", isActive);
    btn.classList.toggle("text-brand-300", isActive);
  });
}

// Close lang menu on outside click
document.addEventListener("click", (e) => {
  const switcher = document.getElementById("lang-switcher");
  const menu = document.getElementById("lang-menu");
  if (switcher && menu && !switcher.contains(e.target)) {
    menu.classList.add("hidden");
  }
});

// ─── Utilities ──────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

// ─── Init ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize i18n
  buildLangMenus();
  if (
    typeof detectLanguage === "function" &&
    typeof setLanguage === "function"
  ) {
    const lang = detectLanguage();
    setLanguage(lang);
    const label = document.getElementById("current-lang-label");
    if (label && typeof LANG_META !== "undefined" && LANG_META[lang]) {
      label.textContent = LANG_META[lang].native;
    }
    highlightActiveLang(lang);
  }

  // Load data
  await loadManifest();

  // Update hero
  updateHeroForOS();

  // Show detected platform tab
  showPlatform(currentOS);

  // Setup
  handleNavbarScroll();
  window.addEventListener("scroll", handleNavbarScroll, { passive: true });
  setupMobileMenu();

  // Slight delay for scroll animations so initial paint settles
  requestAnimationFrame(() => {
    setupScrollAnimations();
  });
});
