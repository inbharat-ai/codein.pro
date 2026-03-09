/**
 * Vibe Coding Routes
 *
 * Image → UI Spec → Scaffold → Code pipeline
 * Transforms visual mockups into working applications
 */

"use strict";

const {
  jsonResponse,
  handleRoute,
  readBody,
  parseJsonBody,
} = require("../utils/http-helpers");
const { JsonPatchEngine } = require("../mas/json-patch");
const path = require("path");
const fs = require("fs").promises;

function extractModelText(response) {
  if (!response) return "";
  if (typeof response.content === "string") {
    return response.content;
  }
  if (Array.isArray(response.content) && response.content.length > 0) {
    const first = response.content[0];
    if (typeof first === "string") return first;
    if (first && typeof first.text === "string") return first.text;
  }
  if (typeof response.text === "string") {
    return response.text;
  }
  return "";
}

/**
 * Register vibe coding routes
 */
function registerVibeRoutes(router, { externalProviders, logger }) {
  /**
   * POST /vibe/analyze
   * Analyze image and extract UI specification
   * Body: { imageBase64, mimeType, originalFileName? }
   */
  router.post("/vibe/analyze", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          return jsonResponse(res, 400, { error: parsed.error });
        }

        const { imageBase64, mimeType, originalFileName } = parsed.value || {};
        if (!imageBase64 || typeof imageBase64 !== "string") {
          return jsonResponse(res, 400, {
            error: "Field 'imageBase64' is required",
          });
        }
        if (!mimeType || typeof mimeType !== "string") {
          return jsonResponse(res, 400, {
            error: "Field 'mimeType' is required",
          });
        }

        if (imageBase64.length > 14 * 1024 * 1024) {
          return jsonResponse(res, 400, {
            error: "Image payload too large",
          });
        }

        const allowedMime = /^(image\/(jpeg|jpg|png|gif|svg\+xml|webp))$/i;
        if (!allowedMime.test(mimeType)) {
          return jsonResponse(res, 400, {
            error: "Unsupported mimeType. Use image/jpeg|png|gif|svg+xml|webp",
          });
        }

        // Use Claude 4V or GPT-4V for vision analysis
        const spec = await analyzeImageWithVision(
          imageBase64,
          mimeType,
          externalProviders,
          logger,
        );

        jsonResponse(res, 200, {
          success: true,
          spec,
          originalFileName: originalFileName || null,
          analysisTimestamp: new Date().toISOString(),
        });
      },
      logger,
    );
  });

  /**
   * POST /vibe/generate
   * Generate scaffold and code from UI specification
   */
  router.post("/vibe/generate", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req, 2 * 1024 * 1024);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          return jsonResponse(res, 400, { error: parsed.error });
        }

        const { spec, projectName, framework, styling } = parsed.value || {};

        if (!spec) {
          return jsonResponse(res, 400, { error: "UI spec is required" });
        }

        const config = {
          framework: framework || "nextjs",
          styling: styling || "tailwind",
          projectName: projectName || "vibe-generated-app",
        };

        const files = await generateScaffold(
          spec,
          config,
          externalProviders,
          logger,
        );

        jsonResponse(res, 200, {
          success: true,
          filesGenerated: files.length,
          files: files.map((f) => ({
            path: f.path,
            size: f.content.length,
            language: f.language,
          })),
          projectName: config.projectName,
        });
      },
      logger,
    );
  });

  /**
   * POST /vibe/apply
   * Apply generated files or JSON patches to workspace
   */
  router.post("/vibe/apply", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req, 5 * 1024 * 1024);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          return jsonResponse(res, 400, { error: parsed.error });
        }

        const { files, patches, workspaceRoot } = parsed.value || {};

        if (!workspaceRoot || typeof workspaceRoot !== "string") {
          return jsonResponse(res, 400, {
            error: "Workspace root path is required",
          });
        }

        // Validate workspace root is a real absolute path and not a traversal
        const resolvedRoot = path.resolve(workspaceRoot);
        if (
          workspaceRoot.includes("..") ||
          resolvedRoot.includes("node_modules") ||
          resolvedRoot.includes(".git")
        ) {
          return jsonResponse(res, 400, {
            error: "Invalid workspace root: traversal or protected path",
          });
        }

        if (!Array.isArray(files) && !Array.isArray(patches)) {
          return jsonResponse(res, 400, {
            error: "Either 'files' or 'patches' array is required",
          });
        }

        let applied = [];
        let patchResults = [];
        if (Array.isArray(files)) {
          applied = await applyFilesToWorkspace(files, workspaceRoot, logger);
        }

        if (Array.isArray(patches)) {
          patchResults = await applyPatchesToWorkspace(
            patches,
            workspaceRoot,
            logger,
          );
        }

        jsonResponse(res, 200, {
          success: true,
          filesApplied: applied.length,
          paths: applied,
          patchesApplied: patchResults.length,
          patchResults,
        });
      },
      logger,
    );
  });

  /**
   * GET /vibe/preview
   * Get preview URL for running dev server
   */
  router.get("/vibe/preview", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const workspaceRoot = url.searchParams.get("workspace");

        if (!workspaceRoot || typeof workspaceRoot !== "string") {
          return jsonResponse(res, 400, {
            error: "Workspace path is required",
          });
        }

        // Validate workspace path is not a traversal attack
        const resolvedWs = path.resolve(workspaceRoot);
        if (
          workspaceRoot.includes("..") ||
          resolvedWs.includes("node_modules") ||
          resolvedWs.includes(".git")
        ) {
          return jsonResponse(res, 400, {
            error: "Invalid workspace path",
          });
        }

        const previewInfo = await startDevServer(resolvedWs, logger);

        jsonResponse(res, 200, {
          success: true,
          previewUrl: previewInfo.url,
          pid: previewInfo.pid,
          framework: previewInfo.framework,
        });
      },
      logger,
    );
  });
}

/**
 * Analyze image with vision model
 * @param {string} base64Image - Base64 encoded image
 * @param {string} mimeType - Image MIME type
 * @param {object} externalProviders - External provider instance
 * @param {object} logger - Logger
 * @returns {Promise<object>} UI specification
 */
async function analyzeImageWithVision(
  base64Image,
  mimeType,
  externalProviders,
  logger,
) {
  const visionPrompt = `Analyze this UI mockup/wireframe/screenshot and extract a detailed specification:

1. **Layout**: Overall structure (header, sidebar, main content, footer)
2. **Components**: List all UI components (buttons, forms, cards, lists, modals, etc.)
3. **Typography**: Font families, sizes, weights for headings and body text
4. **Colors**: Color palette (primary, secondary, background, text, accent colors)
5. **Spacing**: Padding and margin patterns
6. **Interactions**: Buttons, links, form inputs, hover states
7. **Responsive**: Mobile/tablet/desktop breakpoints if visible
8. **Content**: All visible text content (for i18n extraction)

Return a JSON object with this structure:
{
  "layout": { "type": "string", "sections": ["array"] },
  "components": [{ "type": "string", "name": "string", "props": {} }],
  "typography": { "heading": {}, "body": {} },
  "colors": { "primary": "", "secondary": "", ... },
  "spacing": { "unit": "number", "scale": [] },
  "interactions": [{ "element": "", "action": "", "target": "" }],
  "responsive": { "breakpoints": {} },
  "content": [{ "key": "string", "text": "string", "context": "string" }]
}`;

  try {
    // Try Claude 4V first (best for UI analysis)
    const response = await externalProviders.completeWithFallback({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: base64Image,
              },
            },
            {
              type: "text",
              text: visionPrompt,
            },
          ],
        },
      ],
      model: "claude-4-vision",
      temperature: 0.3,
      max_tokens: 4000,
    });

    const content = extractModelText(response);
    if (!content) {
      throw new Error("Vision provider returned empty content");
    }

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch =
      content.match(/```json\n([\s\S]*?)\n```/) ||
      content.match(/```\n([\s\S]*?)\n```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    return JSON.parse(jsonStr);
  } catch (error) {
    logger?.error("Vision analysis failed:", error);
    throw new Error(`Failed to analyze image: ${error.message}`);
  }
}

/**
 * Generate scaffold and component code from spec
 * @param {object} spec - UI specification
 * @param {object} config - Generation config
 * @param {object} externalProviders - External provider instance
 * @param {object} logger - Logger
 * @returns {Promise<Array>} Array of generated files
 */
async function generateScaffold(spec, config, externalProviders, logger) {
  const files = [];

  // Generate package.json
  files.push({
    path: "package.json",
    language: "json",
    content: JSON.stringify(
      {
        name: config.projectName,
        version: "0.1.0",
        private: true,
        scripts: {
          dev: "next dev",
          build: "next build",
          start: "next start",
          lint: "next lint",
        },
        dependencies: {
          next: "14.0.0",
          react: "^18",
          "react-dom": "^18",
          "react-i18next": "^13.0.0",
          i18next: "^23.0.0",
          ...(config.styling === "tailwind" && {
            tailwindcss: "^3.4.0",
            autoprefixer: "^10.4.0",
            postcss: "^8.4.0",
          }),
        },
        devDependencies: {
          "@types/node": "^20",
          "@types/react": "^18",
          "@types/react-dom": "^18",
          typescript: "^5",
          ...(config.styling === "tailwind" && {
            "@types/tailwindcss": "^3",
          }),
        },
      },
      null,
      2,
    ),
  });

  // Generate Tailwind config (if needed)
  if (config.styling === "tailwind") {
    files.push({
      path: "tailwind.config.js",
      language: "javascript",
      content: `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: ${JSON.stringify(spec.colors || {}, null, 8)},
    },
  },
  plugins: [],
}`,
    });

    files.push({
      path: "styles/globals.css",
      language: "css",
      content: `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  ${Object.entries(spec.colors || {})
    .map(([key, value]) => `  --color-${key}: ${value};`)
    .join("\n")}
}`,
    });
  }

  // Generate i18n config
  files.push({
    path: "i18n/config.ts",
    language: "typescript",
    content: `import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;`,
  });

  // Generate locale file (extract from spec.content)
  const localeData = {};
  if (spec.content && Array.isArray(spec.content)) {
    spec.content.forEach((item) => {
      localeData[item.key] = item.text;
    });
  }

  files.push({
    path: "i18n/locales/en.json",
    language: "json",
    content: JSON.stringify(localeData, null, 2),
  });

  // Generate main page
  files.push({
    path: "app/page.tsx",
    language: "typescript",
    content: await generateMainPage(spec, config, externalProviders, logger),
  });

  // Generate components
  if (spec.components && Array.isArray(spec.components)) {
    for (const comp of spec.components) {
      const componentFile = await generateComponent(
        comp,
        spec,
        config,
        externalProviders,
        logger,
      );
      files.push(componentFile);
    }
  }

  // Generate layout
  files.push({
    path: "app/layout.tsx",
    language: "typescript",
    content: `import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import '../i18n/config'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '${config.projectName}',
  description: 'Generated by CodIn Vibe Coding',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}`,
  });

  return files;
}

/**
 * Generate main page component
 */
async function generateMainPage(spec, config, externalProviders, logger) {
  const prompt = `Generate a Next.js 14 App Router page component based on this specification:

Layout: ${JSON.stringify(spec.layout)}
Components: ${JSON.stringify(spec.components?.map((c) => c.name) || [])}
Styling: ${config.styling}

Requirements:
- Use TypeScript
- Use 'use client' directive
- Import components from '../components/'
- Use react-i18next for all text (useTranslation hook)
- Use Tailwind classes if styling is 'tailwind'
- Follow Next.js 14 best practices
- No hardcoded text - use t('key') for all strings

Return only the TSX code, no explanations.`;

  try {
    const response = await externalProviders.completeWithFallback({
      messages: [{ role: "user", content: prompt }],
      model: "claude-3.5-sonnet",
      temperature: 0.3,
      max_tokens: 2000,
    });

    let code = extractModelText(response);

    // Clean up code blocks
    code = code
      .replace(/```typescript\n|```tsx\n|```\n/g, "")
      .replace(/```$/g, "");

    return code.trim();
  } catch (error) {
    logger?.error("Main page generation failed:", error);
    // Return fallback basic page
    return `'use client'

import { useTranslation } from 'react-i18next'

export default function Home() {
  const { t } = useTranslation()

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-4xl font-bold">{t('welcome')}</h1>
    </main>
  )
}`;
  }
}

/**
 * Generate individual component
 */
async function generateComponent(
  comp,
  spec,
  config,
  externalProviders,
  logger,
) {
  const prompt = `Generate a React component:

Component: ${comp.name}
Type: ${comp.type}
Props: ${JSON.stringify(comp.props || {})}
Colors: ${JSON.stringify(spec.colors)}
Styling: ${config.styling}

Requirements:
- TypeScript with proper types
- Use 'use client' if stateful
- Use react-i18next for text
- ${config.styling === "tailwind" ? "Use Tailwind utility classes" : "Use CSS modules"}
- Accessible (ARIA labels)
- No hardcoded strings

Return only the TSX code.`;

  try {
    const response = await externalProviders.completeWithFallback({
      messages: [{ role: "user", content: prompt }],
      model: "claude-3.5-sonnet",
      temperature: 0.3,
      max_tokens: 1500,
    });

    let code = extractModelText(response);
    code = code
      .replace(/```typescript\n|```tsx\n|```\n/g, "")
      .replace(/```$/g, "");

    return {
      path: `components/${comp.name}.tsx`,
      language: "typescript",
      content: code.trim(),
    };
  } catch (error) {
    logger?.error(`Component ${comp.name} generation failed:`, error);
    // Return minimal fallback
    return {
      path: `components/${comp.name}.tsx`,
      language: "typescript",
      content: `'use client'

export default function ${comp.name}() {
  return <div>${comp.name}</div>
}`,
    };
  }
}

/**
 * Apply generated files to workspace
 */
async function applyFilesToWorkspace(files, workspaceRoot, logger) {
  const applied = [];
  const backups = [];

  const normalizeTarget = (relativePath) => {
    if (!relativePath || typeof relativePath !== "string") {
      throw new Error("Each file must include a valid relative path");
    }
    if (path.isAbsolute(relativePath)) {
      throw new Error(`Absolute paths are not allowed: ${relativePath}`);
    }
    if (relativePath.includes("..") || relativePath.includes("\\..")) {
      throw new Error(`Path traversal is not allowed: ${relativePath}`);
    }

    const resolved = path.resolve(workspaceRoot, relativePath);
    const rootResolved = path.resolve(workspaceRoot);
    if (!resolved.startsWith(rootResolved)) {
      throw new Error(`Path escapes workspace root: ${relativePath}`);
    }

    return resolved;
  };

  try {
    for (const file of files) {
      const fullPath = normalizeTarget(file.path);
      const dir = path.dirname(fullPath);

      let previousContent = null;
      let existed = false;
      try {
        previousContent = await fs.readFile(fullPath, "utf8");
        existed = true;
      } catch {
        existed = false;
      }

      backups.push({ path: fullPath, existed, previousContent });

      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, file.content, "utf8");

      applied.push(file.path);
      logger?.info(`Applied file: ${file.path}`);
    }

    return applied;
  } catch (error) {
    // Roll back writes in reverse order
    for (let i = backups.length - 1; i >= 0; i--) {
      const backup = backups[i];
      try {
        if (backup.existed) {
          await fs.writeFile(backup.path, backup.previousContent, "utf8");
        } else {
          await fs.unlink(backup.path).catch(() => {});
        }
      } catch {
        // Keep rolling back best-effort
      }
    }

    logger?.error("Failed to apply vibe files transactionally:", error);
    throw new Error(`Vibe apply failed and was rolled back: ${error.message}`);
  }
}

/**
 * Apply strict JSON patches to workspace files with rollback-on-failure.
 */
async function applyPatchesToWorkspace(patches, workspaceRoot, logger) {
  const rootResolved = path.resolve(workspaceRoot);
  const engine = new JsonPatchEngine({
    workspaceHash: rootResolved.replace(/[^a-zA-Z0-9]/g, "_").slice(-40),
  });

  const applied = [];
  const appliedBackups = [];

  const allowedExt = new Set([
    ".json",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".css",
    ".md",
  ]);

  const blockedPathParts = new Set([
    "node_modules",
    ".git",
    ".codin",
    "dist",
    "build",
  ]);

  const allowedOps = new Set(["add", "remove", "replace", "test"]);
  const maxOpsPerFile = 200;

  const validatePatchPolicy = (patchEntry) => {
    if (!Array.isArray(patchEntry.ops)) {
      throw new Error(
        `Patch entry '${patchEntry.filePath}' requires 'ops' array`,
      );
    }
    if (patchEntry.ops.length === 0) {
      throw new Error(
        `Patch entry '${patchEntry.filePath}' has empty ops array`,
      );
    }
    if (patchEntry.ops.length > maxOpsPerFile) {
      throw new Error(
        `Patch entry '${patchEntry.filePath}' exceeds max ops (${maxOpsPerFile})`,
      );
    }

    const ext = path.extname(patchEntry.filePath || "").toLowerCase();
    if (!allowedExt.has(ext)) {
      throw new Error(
        `Patch entry '${patchEntry.filePath}' extension '${ext}' is not allowed`,
      );
    }

    const segments = String(patchEntry.filePath || "")
      .split(/[\\/]+/)
      .filter(Boolean);
    for (const segment of segments) {
      if (blockedPathParts.has(segment)) {
        throw new Error(
          `Patch entry '${patchEntry.filePath}' targets blocked path segment '${segment}'`,
        );
      }
    }

    for (const [idx, op] of patchEntry.ops.entries()) {
      if (!op || typeof op !== "object") {
        throw new Error(
          `Patch op at index ${idx} for '${patchEntry.filePath}' must be an object`,
        );
      }
      if (!allowedOps.has(op.op)) {
        throw new Error(
          `Patch op '${op.op}' at index ${idx} for '${patchEntry.filePath}' is not allowed`,
        );
      }
      if (typeof op.path !== "string" || !op.path.startsWith("/")) {
        throw new Error(
          `Patch op at index ${idx} for '${patchEntry.filePath}' has invalid JSON pointer path`,
        );
      }
    }
  };

  const normalizeTarget = (relativePath) => {
    if (!relativePath || typeof relativePath !== "string") {
      throw new Error("Each patch entry requires 'filePath'");
    }
    if (path.isAbsolute(relativePath)) {
      throw new Error(`Absolute paths are not allowed: ${relativePath}`);
    }
    if (relativePath.includes("..") || relativePath.includes("\\..")) {
      throw new Error(`Path traversal is not allowed: ${relativePath}`);
    }
    const resolved = path.resolve(workspaceRoot, relativePath);
    if (!resolved.startsWith(rootResolved)) {
      throw new Error(`Patch path escapes workspace root: ${relativePath}`);
    }
    return resolved;
  };

  try {
    for (const patchEntry of patches) {
      validatePatchPolicy(patchEntry);
      const filePath = normalizeTarget(patchEntry.filePath);
      const ops = patchEntry.ops;

      const result = await engine.applyToFile(filePath, ops, {
        autoRepair: true,
      });

      if (!result.success) {
        throw new Error(
          `Patch apply failed for '${patchEntry.filePath}': ${result.error}`,
        );
      }

      applied.push({
        filePath: patchEntry.filePath,
        appliedOps: result.appliedOps,
        fixes: result.fixes || [],
      });

      appliedBackups.push({
        filePath,
        backupPath: result.backupPath,
      });
    }

    return applied;
  } catch (error) {
    // Roll back previously applied patches in reverse order
    for (let i = appliedBackups.length - 1; i >= 0; i--) {
      const b = appliedBackups[i];
      try {
        engine.rollback(b.filePath, b.backupPath);
      } catch {
        // best effort rollback
      }
    }

    logger?.error("Failed to apply vibe JSON patches transactionally:", error);
    throw new Error(
      `Vibe patch apply failed and was rolled back: ${error.message}`,
    );
  }
}

/**
 * Start development server for preview
 */
async function startDevServer(workspaceRoot, _logger) {
  const { spawn } = require("child_process");

  // Detect framework
  const framework = "nextjs"; // Could auto-detect from package.json

  // Start dev server
  const devProcess = spawn("npm", ["run", "dev"], {
    cwd: workspaceRoot,
    detached: true,
    stdio: "ignore",
  });

  devProcess.unref();

  // Wait for server to be ready (basic delay)
  await new Promise((resolve) => setTimeout(resolve, 5000));

  return {
    url: "http://localhost:3000",
    pid: devProcess.pid,
    framework,
  };
}

module.exports = {
  registerVibeRoutes,
  __test: {
    applyFilesToWorkspace,
    applyPatchesToWorkspace,
  },
};
