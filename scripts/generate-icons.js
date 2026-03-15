#!/usr/bin/env node
/**
 * Pure Node.js icon generator — zero external dependencies.
 * Outputs: build/icon.png (Linux), build/icon.ico (Windows), build/icon.icns (macOS)
 */
'use strict';
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── CRC32 ─────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── PNG encoder (RGBA) ────────────────────────────────────────────────────────
function makePNG(size, getPixel) {
  function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const l = Buffer.allocUnsafe(4); l.writeUInt32BE(data.length);
    const c = Buffer.allocUnsafe(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([l, t, data, c]);
  }

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0; // 8-bit RGBA

  const raw = Buffer.allocUnsafe(size * (1 + size * 4));
  let off = 0;
  for (let y = 0; y < size; y++) {
    raw[off++] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const [r,g,b,a] = getPixel(x, y, size);
      raw[off++]=r; raw[off++]=g; raw[off++]=b; raw[off++]=a;
    }
  }

  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── DBZ Scouter pixel renderer ────────────────────────────────────────────────
function scouterPixel(px, py, size) {
  const cx = size / 2, cy = size / 2;
  const dx = px - cx + 0.5, dy = py - cy + 0.5;
  const r  = Math.sqrt(dx*dx + dy*dy);
  const maxR = size / 2;

  // Outside circle → transparent
  if (r >= maxR) return [0,0,0,0];

  // Anti-alias at edge
  const alpha = r > maxR - 1.5 ? Math.round(255 * (maxR - r) / 1.5) : 255;

  // Background dark navy → slight radial gradient
  const t = 1 - r / maxR;
  let R = Math.round(10 + t * 25);
  let G = Math.round(10 + t * 18);
  let B = Math.round(25 + t * 30);

  // Outer orange border ring
  if (r > maxR * 0.88) {
    const b = (r - maxR * 0.88) / (maxR * 0.12);
    R = lerp(R, 255, b); G = lerp(G, 102, b); B = lerp(B, 0, b);
  }

  // Lens ring 1 (72%)
  const d72 = Math.abs(r - maxR * 0.72);
  if (d72 < 1.8) {
    const b = (1 - d72 / 1.8) * 0.75;
    R = lerp(R, 255, b); G = lerp(G, 136, b); B = lerp(B, 0, b);
  }

  // Lens ring 2 (47%)
  const d47 = Math.abs(r - maxR * 0.47);
  if (d47 < 1.2) {
    const b = (1 - d47 / 1.2) * 0.5;
    R = lerp(R, 255, b); G = lerp(G, 200, b); B = lerp(B, 0, b);
  }

  // Cross-hairs
  const lw = Math.max(1, size * 0.01);
  if ((Math.abs(dx) < lw || Math.abs(dy) < lw) && r < maxR * 0.85) {
    const b = 0.35;
    R = lerp(R, 255, b); G = lerp(G, 136, b); B = lerp(B, 0, b);
  }

  // Center golden glow
  if (r < maxR * 0.15) {
    const b = 1 - r / (maxR * 0.15);
    R = lerp(R, 255, b); G = lerp(G, 215, b); B = lerp(B, 0, b);
  }

  // White specular highlight
  if (r < maxR * 0.07) {
    const b = (1 - r / (maxR * 0.07)) * 0.9;
    R = lerp(R, 255, b); G = lerp(G, 255, b); B = lerp(B, 255, b);
  }

  return [clamp(R), clamp(G), clamp(B), clamp(alpha)];
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

// ── ICO encoder ───────────────────────────────────────────────────────────────
function makeICO(entries) {
  // entries: [{ size, png: Buffer }]
  const count = entries.length;
  let offset = 6 + count * 16;

  const header = Buffer.allocUnsafe(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);      // type: 1 = ICO
  header.writeUInt16LE(count, 4);

  const dir = Buffer.concat(entries.map(({ size, png }) => {
    const e = Buffer.allocUnsafe(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1,  4);  // color planes
    e.writeUInt16LE(32, 6);  // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  }));

  return Buffer.concat([header, dir, ...entries.map(e => e.png)]);
}

// ── ICNS encoder ──────────────────────────────────────────────────────────────
function makeICNS(entries) {
  // entries: [{ ostype, png: Buffer }]
  const chunks = entries.map(({ ostype, png }) => {
    const h = Buffer.allocUnsafe(8);
    Buffer.from(ostype, 'ascii').copy(h, 0);
    h.writeUInt32BE(8 + png.length, 4);
    return Buffer.concat([h, png]);
  });
  const body = Buffer.concat(chunks);
  const fileHdr = Buffer.allocUnsafe(8);
  Buffer.from('icns', 'ascii').copy(fileHdr, 0);
  fileHdr.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([fileHdr, body]);
}

// ── Generate ──────────────────────────────────────────────────────────────────
const OUT = path.join(__dirname, '..', 'build');
fs.mkdirSync(OUT, { recursive: true });

const SIZES = [16, 32, 48, 64, 128, 256];
const pngMap = {};
for (const size of SIZES) {
  pngMap[size] = makePNG(size, scouterPixel);
}

// icon.png  (Linux + macOS fallback)
fs.writeFileSync(path.join(OUT, 'icon.png'), pngMap[256]);
console.log('✓ icon.png (256×256)');

// icon.ico  (Windows — multi-resolution)
const ico = makeICO(SIZES.map(size => ({ size, png: pngMap[size] })));
fs.writeFileSync(path.join(OUT, 'icon.ico'), ico);
console.log('✓ icon.ico (16/32/48/64/128/256)');

// icon.icns (macOS)
const icns = makeICNS([
  { ostype: 'icp4', png: pngMap[16]  },
  { ostype: 'icp5', png: pngMap[32]  },
  { ostype: 'icp6', png: pngMap[64]  },
  { ostype: 'ic07', png: pngMap[128] },
  { ostype: 'ic08', png: pngMap[256] },
]);
fs.writeFileSync(path.join(OUT, 'icon.icns'), icns);
console.log('✓ icon.icns (16/32/64/128/256)');

console.log('\nIcon generation complete.');
