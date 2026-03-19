/**
 * Generate placeholder app icons for CodIn Electron build.
 * Creates a minimal 256x256 PNG (manually crafted) since we cannot
 * depend on canvas/sharp in the dev environment.
 *
 * Run: node generate-icons.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- 512×512 PNG icon ---
// Creates a 512x512 PNG (required by electron-builder for AppImage/macOS).
// Design: dark background (#1A1A2E), saffron border (#FF9933), white center.

function createMinimalPNG() {
  // Helper: simple CRC32 for PNG chunks
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
  function crc32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  const W = 512, H = 512;

  // Build raw image data (RGBA per pixel, plus filter byte per row)
  const rawRows = [];
  for (let y = 0; y < H; y++) {
    const row = [0]; // filter: None
    for (let x = 0; x < W; x++) {
      const border = 40;
      const cx = W / 2, cy = H / 2, r = W / 2 - border;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const inRing = dist >= r && dist <= r + border;
      const inCenter = dist < r * 0.55;

      if (inRing) {
        // Saffron ring #FF9933
        row.push(0xFF, 0x99, 0x33, 0xFF);
      } else if (inCenter) {
        // White core
        row.push(0xFF, 0xFF, 0xFF, 0xFF);
      } else if (dist < r) {
        // Dark background fill #1A1A2E
        row.push(0x1A, 0x1A, 0x2E, 0xFF);
      } else {
        // Transparent outside circle
        row.push(0x00, 0x00, 0x00, 0x00);
      }
    }
    rawRows.push(Buffer.from(row));
  }
  const rawData = Buffer.concat(rawRows);

  // Deflate the raw data using zlib
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData);

  // Build PNG
  function pngChunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const combined = Buffer.concat([typeBytes, data]);
    const crcVal = crc32(combined);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal);
    return Buffer.concat([length, combined, crcBuf]);
  }

  // Signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT
  const idat = compressed;

  // IEND
  const iend = Buffer.alloc(0);

  const png = Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', iend),
  ]);

  return png;
}

const pngData = createMinimalPNG();

// Write icon.png
const buildDir = __dirname;
fs.writeFileSync(path.join(buildDir, 'icon.png'), pngData);
console.log('Created icon.png (512x512)');

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

fs.writeFileSync(path.join(buildDir, 'icon.ico'), createICO(pngData));
console.log('Created icon.ico');

// ICNS is complex — just copy the PNG for now (macOS can fall back)
fs.writeFileSync(path.join(buildDir, 'icon.icns'), pngData);
console.log('Created icon.icns (PNG fallback)');

console.log('All icons generated in', buildDir);
