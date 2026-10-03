// Builds tab / home-screen icons from the club logo: the duck mark only (the wordmark is
// unreadable at 16-32px), centred on a rounded club-navy square.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('public/brand/buv-logo-original.png').toString('base64');
// Duck mark bounds in the 2048px original (measured from the artwork).
const CROP = { x: 320, y: 420, w: 640, h: 1070 };
// Small tab sizes: tuft to bill tip, no neck, so the face stays legible at 16-32px.
const HEAD = { x: 330, y: 420, w: 640, h: 910 };
const SMALL = 64;
const SIZES = { 'favicon-32.png': 32, 'favicon-64.png': 64, 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };

const browser = await chromium.launch();
const page = await browser.newPage();
const out = await page.evaluate(async ({ b64, crop: full, head, small, sizes }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const res = {};
  for (const [name, s] of Object.entries(sizes)) {
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    const r = s * 0.22;
    g.beginPath();
    g.roundRect(0, 0, s, s, r);
    g.fillStyle = '#0a0d30';
    g.fill();
    g.save();
    g.clip();
    const crop = s <= small ? head : full;
    // Fit the mark into the square (head fills more, the tall full duck ~86% of the height).
    const scale = Math.min((s * (s <= small ? 0.94 : 0.86)) / crop.h, (s * 0.94) / crop.w);
    const dw = crop.w * scale, dh = crop.h * scale;
    g.drawImage(img, crop.x, crop.y, crop.w, crop.h, (s - dw) / 2, (s - dh) / 2, dw, dh);
    g.restore();
    res[name] = c.toDataURL('image/png');
  }
  return res;
}, { b64: src, crop: CROP, head: HEAD, small: SMALL, sizes: SIZES });
for (const [name, url] of Object.entries(out)) writeFileSync(`public/brand/${name}`, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', Object.keys(out).join(', '));
await browser.close();
