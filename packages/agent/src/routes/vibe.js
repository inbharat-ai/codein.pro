/**
 * Vibe Coding Routes
 *
 * Image → UI Spec → Scaffold → Code pipeline
 * Transforms visual mockups into working applications
 */

"use strict";

const { jsonResponse, handleRoute } = require("../middleware/api-helpers");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

/**
 * Register vibe coding routes
 */
function registerVibeRoutes(router, { externalProviders, logger }) {
  /**
   * POST /vibe/analyze
   * Analyze uploaded image and extract UI specification
   */
  router.post("/vibe/analyze", upload.single("image"), async (req, res) => {
    await handleRoute(
      res,
      async () => {
        if (!req.file) {
          return jsonResponse(res, 400, {
            error: "No image file uploaded",
          });
        }

        const base64Image = req.file.buffer.toString("base64");
        const mimeType = req.file.mimetype;

        // Use Claude 4V or GPT-4V for vision analysis
        const spec = await analyzeImageWithVision(
          base64Image,
          mimeType,
          externalProviders,
          logger,
        );

        jsonResponse(res, 200, {
          success: true,
          spec,
          originalFileName: req.file.originalname,
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
        const { spec, projectName, framework, styling } = req.body;

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
   * Apply generated files to workspace
   */
  router.post("/vibe/apply", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const { files, workspaceRoot } = req.body;

        if (!files || !Array.isArray(files)) {
          return jsonResponse(res, 400, { error: "Files array is required" });
        }

        if (!workspaceRoot) {
          return jsonResponse(res, 400, {
            error: "Workspace root path is required",
          });
        }

        const applied = await applyFilesToWorkspace(
          files,
          workspaceRoot,
          logger,
        );

        jsonResponse(res, 200, {
          success: true,
          filesApplied: applied.length,
          paths: applied,
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

        if (!workspaceRoot) {
          return jsonResponse(res, 400, {
            error: "Workspace path is required",
          });
        }

        const previewInfo = await startDevServer(workspaceRoot, logger);

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

    const content = response.content[0].text;

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

    let code = response.content[0].text;

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

    let code = response.content[0].text;
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

  for (const file of files) {
    try {
      const fullPath = path.join(workspaceRoot, file.path);
      const dir = path.dirname(fullPath);

      // Create directory if it doesn't exist
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(fullPath, file.content, "utf8");

      applied.push(file.path);
      logger?.info(`Applied file: ${file.path}`);
    } catch (error) {
      logger?.error(`Failed to apply ${file.path}:`, error);
    }
  }

  return applied;
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

module.exports = { registerVibeRoutes };
