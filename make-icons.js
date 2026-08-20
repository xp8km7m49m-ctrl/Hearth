// One-off / re-runnable icon generator for Hearth.
// Uses only Node's built-in zlib — no image libraries, no network.
// Run: node scripts/make-icons.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const BRAND = [0x2f, 0x52, 0x33]; // pine green
const ACCENT = [0xd8, 0x9b, 0x3c]; // marigold
const RING = [0x24, 0x40, 0x29]; // darker pine for the ring gap

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makeIcon(size, radiusRatio = 0.34, ringGap = 0.14) {
  const w = size, h = size;
  const raw = Buffer.alloc(h * (1 + w * 3)); // filter byte + RGB per row
  const cx = w / 2, cy = h / 2;
  const r1 = size * radiusRatio; // outer accent circle
  const r2 = size * (radiusRatio - ringGap); // inner cutout back to brand color
  const corner = size * 0.22; // rounded-square mask radius

  for (let y = 0; y < h; y++) {
    let rowStart = y * (1 + w * 3);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      // rounded-square mask (superellipse-ish via corner circles)
      const inCorner =
        (x < corner && y < corner && dist(x, y, corner, corner) > corner) ||
        (x > w - corner && y < corner && dist(x, y, w - corner, corner) > corner) ||
        (x < corner && y > h - corner && dist(x, y, corner, h - corner) > corner) ||
        (x > w - corner && y > h - corner && dist(x, y, w - corner, h - corner) > corner);

      let color;
      if (inCorner) {
        color = [0xee, 0xf0, 0xe6]; // paper, shows through rounded corners
      } else {
        const d = dist(x, y, cx, cy);
        if (d <= r2) color = BRAND;
        else if (d <= r1) color = ACCENT;
        else color = BRAND;
      }
      const off = rowStart + 1 + x * 3;
      raw[off] = color[0];
      raw[off + 1] = color[1];
      raw[off + 2] = color[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

function dist(x, y, cx, cy) {
  return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
}

const outDir = path.join(__dirname, "..", "assets", "icons");
fs.mkdirSync(outDir, { recursive: true });
[192, 512].forEach((size) => {
  const png = makeIcon(size);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`wrote icon-${size}.png (${png.length} bytes)`);
});
