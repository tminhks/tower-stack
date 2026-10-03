// Workshop poster for the game-over popup: 1920x1080 PNG (2.4 MB) -> 1280px WebP,
// small enough to inline into the single-file build.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync('assets-src/hacking-humans-original.png').toString('base64');
const b = await chromium.launch();
const p = await b.newPage();
const url = await p.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 1280; c.height = Math.round(1280 * img.height / img.width);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/webp', 0.84);
}, src);
writeFileSync('public/brand/hacking-humans.webp', Buffer.from(url.split(',')[1], 'base64'));
await b.close();
