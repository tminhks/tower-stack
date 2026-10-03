// Tab / home-screen icons from the duck illustration: full square frame (no crop),
// flat teal background keyed out to transparent with soft, de-spilled edges.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('public/brand/duck-original.png').toString('base64');
const SIZES = { 'duck-32.png': 32, 'duck-64.png': 64, 'duck-192.png': 192, 'duck-512.png': 512, 'duck-transparent.png': 2048 };

const browser = await chromium.launch();
const page = await browser.newPage();
const out = await page.evaluate(async ({ b64, sizes }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const W = img.width, H = img.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, W, H);
  const d = id.data;

  // Key colour = median-ish of the four corners.
  const key = [0, 0, 0];
  for (const [x, y] of [[6, 6], [W - 7, 6], [6, H - 7], [W - 7, H - 7]]) for (let k = 0; k < 3; k++) key[k] += d[(y * W + x) * 4 + k] / 4;

  // Distance below LO -> fully background; above HI -> fully kept; ramp between (anti-aliased edges).
  const LO = 28, HI = 90;
  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - key[0], dg = d[i + 1] - key[1], db = d[i + 2] - key[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    let a = (dist - LO) / (HI - LO);
    a = Math.max(0, Math.min(1, a));
    if (a > 0 && a < 1) {
      // Remove the teal that was blended into the edge pixel.
      for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, (d[i + k] - key[k] * (1 - a)) / a));
    }
    d[i + 3] = Math.round(a * 255);
  }
  g.putImageData(id, 0, 0);

  // Downscale in halving steps for clean small icons.
  const res = {};
  for (const [name, s] of Object.entries(sizes)) {
    let cur = c;
    while (cur.width / 2 >= s) {
      const n = document.createElement('canvas');
      n.width = n.height = Math.round(cur.width / 2);
      const ng = n.getContext('2d');
      ng.imageSmoothingQuality = 'high';
      ng.drawImage(cur, 0, 0, n.width, n.height);
      cur = n;
    }
    const f = document.createElement('canvas');
    f.width = f.height = s;
    const fg = f.getContext('2d');
    fg.imageSmoothingQuality = 'high';
    fg.drawImage(cur, 0, 0, s, s);
    res[name] = f.toDataURL('image/png');
  }
  // iOS fills transparency with black, so the apple-touch icon keeps the original teal.
  const a = document.createElement('canvas');
  a.width = a.height = 180;
  const ag = a.getContext('2d');
  ag.imageSmoothingQuality = 'high';
  ag.drawImage(img, 0, 0, 180, 180);
  res['duck-apple-180.png'] = a.toDataURL('image/png');
  return { key: key.map(Math.round), res };
}, { b64: src, sizes: SIZES });
for (const [name, url] of Object.entries(out.res)) writeFileSync(`public/brand/${name}`, Buffer.from(url.split(',')[1], 'base64'));
console.log('key colour', out.key, '| wrote', Object.keys(out.res).join(', '));
await browser.close();
