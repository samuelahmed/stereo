const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const resourcesDir = path.resolve(__dirname, "../resources");
const CREAM = [255, 250, 241];
const BLUE = [59, 120, 216];
const INK = [36, 33, 42];
const SAMPLE_GRID = 4;

function roundedRectDistance(x, y, centerX, centerY, halfWidth, halfHeight, radius) {
  const qx = Math.abs(x - centerX) - (halfWidth - radius);
  const qy = Math.abs(y - centerY) - (halfHeight - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function inRect(x, y, left, top, right, bottom) {
  return x >= left && x < right && y >= top && y < bottom;
}

// Same stepped geometry as StereoBrandCharacter, with an icon-scale smile
// and more breathing room around the character.
function characterColor(x, y) {
  const u = (x - 92) / 10.5;
  const v = (y - 110) / 10.5;
  const handle =
    inRect(u, v, 28, 16, 52, 20) ||
    inRect(u, v, 24, 18, 28, 28) ||
    inRect(u, v, 52, 18, 56, 28);
  const body = inRect(u, v, 10, 26, 70, 52);
  const legs = inRect(u, v, 22, 52, 30, 64) || inRect(u, v, 50, 52, 58, 64);
  if (!handle && !body && !legs) return null;

  const leftEye = inRect(u, v, 18, 32, 30, 46) || inRect(u, v, 16, 34, 32, 44);
  const rightEye = inRect(u, v, 50, 32, 62, 46) || inRect(u, v, 48, 34, 64, 44);
  const leftPupil = inRect(u, v, 22, 37, 28, 43);
  const rightPupil = inRect(u, v, 54, 37, 60, 43);
  const smile =
    inRect(u, v, 32, 46.5, 36, 48.5) ||
    inRect(u, v, 36, 48.5, 44, 50) ||
    inRect(u, v, 44, 46.5, 48, 48.5);

  if (((leftEye || rightEye) && !leftPupil && !rightPupil) || smile) return CREAM;
  return BLUE;
}

function sample(x, y) {
  const shadowDistance = roundedRectDistance(x, y, 512, 524, 432, 432, 210);
  const shadowAlpha = Math.max(0, Math.min(0.16, 0.16 * Math.exp(-(Math.max(shadowDistance, 0) ** 2) / (2 * 25 ** 2))));
  let color = [9, 9, 11];
  let alpha = shadowAlpha;

  const tileDistance = roundedRectDistance(x, y, 512, 502, 432, 432, 210);
  if (tileDistance <= 0) {
    color = CREAM;
    alpha = 1;
    if (tileDistance > -2) {
      const borderMix = 0.1 * (1 + tileDistance / 2);
      color = CREAM.map((channel, index) => Math.round(channel * (1 - borderMix) + INK[index] * borderMix));
    }
    const character = characterColor(x, y);
    if (character) color = character;
  }
  return [color[0], color[1], color[2], alpha];
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const sourcePerPixel = 1024 / size;
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sy = 0; sy < SAMPLE_GRID; sy += 1) {
        for (let sx = 0; sx < SAMPLE_GRID; sx += 1) {
          const sourceX = (x + (sx + 0.5) / SAMPLE_GRID) * sourcePerPixel;
          const sourceY = (y + (sy + 0.5) / SAMPLE_GRID) * sourcePerPixel;
          const [sampleRed, sampleGreen, sampleBlue, sampleAlpha] = sample(sourceX, sourceY);
          alpha += sampleAlpha;
          red += sampleRed * sampleAlpha;
          green += sampleGreen * sampleAlpha;
          blue += sampleBlue * sampleAlpha;
        }
      }
      const averagedAlpha = alpha / SAMPLE_GRID ** 2;
      pixels[offset] = alpha ? Math.round(red / alpha) : 0;
      pixels[offset + 1] = alpha ? Math.round(green / alpha) : 0;
      pixels[offset + 2] = alpha ? Math.round(blue / alpha) : 0;
      pixels[offset + 3] = Math.round(averagedAlpha * 255);
      offset += 4;
    }
  }
  return encodePng(size, size, pixels);
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    rows[rowStart] = 0;
    pixels.copy(rows, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function encodeIcns(entries) {
  const chunks = entries.map(([type, data]) => {
    const result = Buffer.alloc(data.length + 8);
    result.write(type, 0, 4, "ascii");
    result.writeUInt32BE(result.length, 4);
    data.copy(result, 8);
    return result;
  });
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

fs.mkdirSync(resourcesDir, { recursive: true });
const images = new Map([16, 32, 64, 128, 256, 512, 1024].map((size) => [size, render(size)]));
fs.writeFileSync(path.join(resourcesDir, "icon.png"), images.get(1024));
fs.writeFileSync(path.join(resourcesDir, "icon.icns"), encodeIcns([
  ["icp4", images.get(16)],
  ["ic11", images.get(32)],
  ["icp5", images.get(32)],
  ["ic12", images.get(64)],
  ["ic07", images.get(128)],
  ["ic13", images.get(256)],
  ["ic08", images.get(256)],
  ["ic14", images.get(512)],
  ["ic09", images.get(512)],
  ["ic10", images.get(1024)],
]));
console.log("Generated Stereo app icons.");
