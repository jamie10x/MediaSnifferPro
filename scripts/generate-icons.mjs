// Generates simple placeholder PNG icons (rounded teal square) for the extension.
// Replace these with real branded icons before publishing.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const SIZES = [16, 32, 48, 128];
const OUT_DIR = new URL('../public/icons/', import.meta.url);

// Brand color (teal) and a lighter "play triangle" foreground.
const BG = [13, 148, 136]; // #0d9488
const FG = [240, 253, 250]; // #f0fdfa

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makePng(size) {
  const w = size;
  const h = size;
  // Build raw RGBA scanlines with a filter byte (0) per row.
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  const cx = w / 2;
  const cy = h / 2;
  const triLeft = w * 0.36;
  const triRight = w * 0.68;
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter type none
    for (let x = 0; x < w; x++) {
      let r = BG[0], g = BG[1], b = BG[2];
      // Draw a simple play triangle in the center.
      if (x >= triLeft && x <= triRight) {
        const t = (x - triLeft) / (triRight - triLeft);
        const half = (1 - t) * (h * 0.22);
        if (Math.abs(y - cy) <= half) {
          r = FG[0]; g = FG[1]; b = FG[2];
        }
      }
      // Round the corners slightly.
      const corner = w * 0.12;
      const ndx = Math.max(corner - x, x - (w - 1 - corner), 0);
      const ndy = Math.max(corner - y, y - (h - 1 - corner), 0);
      const transparent = Math.hypot(ndx, ndy) > corner;
      const o = y * (stride + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = transparent ? 0 : 255;
      void cx;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const png = makePng(size);
  writeFileSync(new URL(`icon${size}.png`, OUT_DIR), png);
  console.log(`wrote icon${size}.png (${png.length} bytes)`);
}
