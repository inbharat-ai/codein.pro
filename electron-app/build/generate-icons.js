/**
 * Generate Electron app icons for CodeIn from the canonical landing logo.
 * Run: node generate-icons.js
 */
const fs = require("fs");
const path = require("path");

const buildDir = __dirname;
const sourcePng = path.resolve(buildDir, "..", "..", "landing", "assets", "codein-logo.png");

if (!fs.existsSync(sourcePng)) {
  throw new Error(`Source logo not found: ${sourcePng}`);
}

const pngData = fs.readFileSync(sourcePng);
fs.writeFileSync(path.join(buildDir, "icon.png"), pngData);
console.log("Created icon.png from landing/assets/codein-logo.png");

// For ICO format — create a minimal .ico wrapping the same PNG
// ICO header: 6 bytes, 1 entry (16 bytes), then PNG data
function createICO(pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(1, 4); // 1 image

  const entry = Buffer.alloc(16);
  entry[0] = 0;   // width  (0 = 256)
  entry[1] = 0;   // height (0 = 256)
  entry[2] = 0;   // palette
  entry[3] = 0;   // reserved
  entry.writeUInt16LE(1, 4);  // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuf.length, 8);  // size
  entry.writeUInt32LE(22, 12); // offset (6 + 16)

  return Buffer.concat([header, entry, pngBuf]);
}

fs.writeFileSync(path.join(buildDir, "icon.ico"), createICO(pngData));
console.log("Created icon.ico");

// ICNS is complex — just copy the PNG for now (macOS can fall back)
fs.writeFileSync(path.join(buildDir, "icon.icns"), pngData);
console.log("Created icon.icns (PNG fallback)");

console.log("All icons generated in", buildDir);
