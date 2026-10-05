// End-to-end hand control test with a fake webcam that alternates the user's fist / open photos
// (screenshots/hand/fake-cam.mjpeg, 45 frames each). Every fist<->open change must act as one tap.
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const cam = resolve('screenshots/hand/fake-cam.mjpeg');
const url = process.argv[2] || 'http://localhost:5199/?debug';
const browser = await chromium.launch({
  args: [
    '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', // real GPU: swiftshader manages ~1 detection/s
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${cam}`,
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['camera'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// Count taps: wrap the game's own state changes by watching body[data-state] and the score.
await page.goto(url);
await page.waitForTimeout(800);
await page.click('#cam');
const t0 = Date.now();
const log = [];
let last = '';
let shotLoaded = false;
await page.waitForFunction(() => /^(Nắm tay|Xòe tay)$/.test(document.getElementById("cam-text").textContent), null, { timeout: 90000 });
const t1 = Date.now();
while (Date.now() - t1 < 25000) {
  const s = await page.evaluate(() => ({
    cam: document.getElementById('cam-text').textContent,
    state: document.body.dataset.state,
    score: document.getElementById('score').textContent,
  }));
  const line = `${s.cam} | ${s.state} | score ${s.score}`;
  if (line !== last) { log.push(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${line}`); last = line; }
  if (!shotLoaded && /^(Nắm tay|Xòe tay)$/.test(s.cam)) { await page.screenshot({ path: 'screenshots/hand/desktop-tracking.png' }); shotLoaded = true; }
  await page.waitForTimeout(100);
}
console.log(log.join('\n'));
console.log(errors.length ? 'ERRORS/WARNINGS: ' + errors.join(' | ') : 'no errors');
await browser.close();
