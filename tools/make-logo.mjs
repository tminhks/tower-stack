// Turns the club logo (art on a flat navy square) into a cropped transparent PNG.
// Alpha is recovered by "un-screening" against the sampled background colour.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('public/brand/buv-logo-original.png').toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
const result = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  // Background = average of the four corners.
  const corners = [[4, 4], [c.width - 5, 4], [4, c.height - 5], [c.width - 5, c.height - 5]];
  const bg = [0, 0, 0];
  for (const [x, y] of corners) for (let k = 0; k < 3; k++) bg[k] += d[(y * c.width + x) * 4 + k] / 4;
  let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
  for (let i = 0; i < d.length; i += 4) {
    let a = 0;
    for (let k = 0; k < 3; k++) a = Math.max(a, (d[i + k] - bg[k]) / (255 - bg[k]));
    a = Math.max(0, Math.min(1, a));
    if (a < 0.04) a = 0; // kill JPEG noise in the flat background
    for (let k = 0; k < 3; k++) d[i + k] = a > 0 ? Math.min(255, (d[i + k] - bg[k] * (1 - a)) / a) : 0;
    d[i + 3] = Math.round(a * 255);
    if (a > 0.1) {
      const p = i / 4, x = p % c.width, y = (p / c.width) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  g.putImageData(id, 0, 0);
  const pad = 24;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(c.width - 1, maxX + pad); maxY = Math.min(c.height - 1, maxY + pad);
  const out = document.createElement('canvas');
  // Export at 1/2 scale: plenty for a UI logo, a fraction of the bytes.
  out.width = Math.round((maxX - minX + 1) / 2); out.height = Math.round((maxY - minY + 1) / 2);
  const og = out.getContext('2d');
  og.imageSmoothingQuality = 'high';
  og.drawImage(c, minX, minY, maxX - minX + 1, maxY - minY + 1, 0, 0, out.width, out.height);
  return { bg: bg.map(Math.round), w: out.width, h: out.height, url: out.toDataURL('image/png') };
}, src);
writeFileSync('public/brand/buv-logo.png', Buffer.from(result.url.split(',')[1], 'base64'));
console.log('bg', result.bg, 'size', result.w, 'x', result.h);
await browser.close();
