// make-icon.mjs — the Studio's icon, drawn from the in-app logo (App.tsx: a rounded square in
// the primary colour holding lucide's LayoutTemplate glyph), with no image tooling: the shapes
// are rasterized here (signed distances, 4× supersampled) and written as PNGs and a multi-size
// .ico whose entries are PNG-compressed (Vista+). Re-run after changing the colour or glyph:
//
//   node apps/desktop/scripts/make-icon.mjs
//
// Writes build/icon.ico + build/icon.png (desktop: window, taskbar, installer, Explorer) and
// apps/vscode/icon.png (the extension's Marketplace icon, 128px).
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, "..");
const vscode = join(desktop, "..", "vscode");

/* ── colour: crosscut's --primary, oklch(0.52 0.16 255), to sRGB ── */
function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  return lin.map((c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  });
}
const PRIMARY = oklchToRgb(0.52, 0.16, 255);
const WHITE = [255, 255, 255];

/* ── geometry, in a 24-unit glyph space like lucide's ── */
// lucide LayoutTemplate: three rounded rects, stroke 2, on a 24×24 grid.
const GLYPH = [
  { x: 3, y: 3, w: 18, h: 7, r: 1 },
  { x: 3, y: 14, w: 9, h: 7, r: 1 },
  { x: 16, y: 14, w: 5, h: 7, r: 1 },
];
const STROKE = 2;

/** Signed distance from (px,py) to a rounded rect's edge (negative inside). */
function sdRoundRect(px, py, x, y, w, h, r) {
  const cx = x + w / 2, cy = y + h / 2;
  const qx = Math.abs(px - cx) - (w / 2 - r), qy = Math.abs(py - cy) - (h / 2 - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Coverage of the icon at (u,v) in [0,1]²: background square, then the glyph's strokes. Returns [r,g,b,a]. */
function shade(u, v) {
  // The rounded square fills the canvas edge to edge with a 22% corner radius (the app's rounded-lg feel at icon scale).
  const bg = sdRoundRect(u, v, 0.04, 0.04, 0.92, 0.92, 0.2);
  if (bg > 0) return [0, 0, 0, 0];
  // The glyph sits centred, 58% of the canvas wide (24 units → 0.58).
  const scale = 0.58 / 24, ox = (1 - 0.58) / 2, oy = (1 - 0.58) / 2;
  const gx = (u - ox) / scale, gy = (v - oy) / scale;
  let d = Infinity;
  for (const s of GLYPH) d = Math.min(d, Math.abs(sdRoundRect(gx, gy, s.x, s.y, s.w, s.h, s.r)));
  return d <= STROKE / 2 ? [...WHITE, 255] : [...PRIMARY, 255];
}

/** An RGBA raster of `size` px, 4× supersampled. */
function raster(size) {
  const SS = 4, px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const c = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
      // Premultiplied accumulation, so an edge's colour is not dragged toward black.
      r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
    }
    const i = (y * size + x) * 4;
    if (a > 0) { px[i] = Math.round(r / a); px[i + 1] = Math.round(g / a); px[i + 2] = Math.round(b / a); }
    px[i + 3] = Math.round(a / (SS * SS));
  }
  return px;
}

/* ── PNG ── */
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { rows[y * (size * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(rows, y * (size * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/* ── ICO: a directory of PNG-compressed entries ── */
function ico(entries) {
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
  const dir = [], blobs = [];
  let offset = 6 + entries.length * 16;
  for (const { size, data } of entries) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; e[1] = size >= 256 ? 0 : size; e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    dir.push(e); blobs.push(data); offset += data.length;
  }
  return Buffer.concat([header, ...dir, ...blobs]);
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = new Map(sizes.map((s) => [s, png(s, raster(s))]));
mkdirSync(join(desktop, "build"), { recursive: true });
writeFileSync(join(desktop, "build", "icon.ico"), ico(sizes.map((size) => ({ size, data: pngs.get(size) }))));
writeFileSync(join(desktop, "build", "icon.png"), png(512, raster(512)));
writeFileSync(join(vscode, "icon.png"), pngs.get(128));
console.log(`primary rgb(${PRIMARY.join(", ")}) → build/icon.ico (${sizes.join("/")}), build/icon.png (512), ../vscode/icon.png (128)`);
