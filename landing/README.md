# CodeIn Landing Page

A standalone, Cursor-style landing page for the CodeIn AI code editor.  
Designed for direct deployment to any static hosting (GitHub Pages, Vercel, Netlify, Cloudflare Pages).

## Quick Start

```bash
cd landing
npx serve . -l 3333
```

Then open **http://localhost:3333** in your browser.

## Architecture

```
landing/
├── index.html        # Full page — Tailwind CDN, responsive, dark theme
├── script.js         # OS auto-detection, GitHub Releases API, download cards
├── style.css         # Custom animations, grid pattern, hover glows
├── downloads.json    # Static download manifest (fallback if GitHub API fails)
├── package.json      # Convenience scripts
└── README.md         # This file
```

### Key Features

| Feature                 | Implementation                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| **OS auto-detection**   | `navigator.userAgentData` + `navigator.platform` + WebGL renderer check for Apple Silicon |
| **GitHub Releases API** | Fetches `https://api.github.com/repos/…/releases/latest`, falls back to `downloads.json`  |
| **SHA-256 checksums**   | Displayed per-asset with one-click copy to clipboard                                      |
| **Responsive**          | Mobile-first with Tailwind breakpoints (sm, md, lg)                                       |
| **Dark theme**          | Default dark, Cursor-style design with brand indigo + saffron accents                     |
| **India-tech vibe**     | Tricolor accents, Hindi code sample, multilingual messaging                               |
| **Zero dependencies**   | Pure HTML + CSS + vanilla JS + Tailwind CDN — no build step required                      |

## Deployment

### GitHub Pages

```bash
# From repo root
git subtree push --prefix landing origin gh-pages
```

### Vercel / Netlify

Point the root directory to `landing/` in your deployment settings.

### Cloudflare Pages

Set build output directory to `landing/`.

## Updating Download Links

### Option A: GitHub Releases (automatic)

When you publish a new GitHub Release with assets named like:

- `CodeIn-*-x64.exe` → Windows installer
- `CodeIn-*-portable.exe` → Windows portable
- `CodeIn-*-arm64.dmg` → macOS Apple Silicon
- `CodeIn-*-x64.dmg` → macOS Intel
- `CodeIn-*-x64.AppImage` → Linux AppImage
- `CodeIn-*-x64.deb` → Linux Debian

The landing page automatically picks them up via the GitHub API.

### Option B: Static manifest

Edit `downloads.json` with new URLs, SHA-256 hashes, and sizes.

## Customization

- **Colors**: Edit the Tailwind config in `<script>` tag inside `index.html`
- **Repo**: Change `GITHUB_REPO` in `script.js`
- **Assets**: Modify `PLATFORM_CONFIG` in `script.js` to add/remove download variants
