// Game frame rate with the camera off vs on (real GPU), to make sure hand tracking doesn't make the game stutter.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
const cam = resolve('screenshots/hand/fake-cam.mjpeg');
const b = await chromium.launch({ headless: process.env.HEADED !== '1', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam}`] });
const p = await (await b.newContext({ permissions: ['camera'], viewport: { width: 1280, height: 800 } })).newPage();
await p.goto(process.argv[2] || 'http://localhost:5199/?debug');
await p.waitForTimeout(800);
const fps = () => p.evaluate(() => new Promise((res) => {
  const times = []; let n = 0;
  const f = (t) => { times.push(t); if (++n < 180) requestAnimationFrame(f); else {
    const gaps = times.slice(1).map((x, i) => x - times[i]).sort((a, b) => a - b);
    res({ fps: (1000 * (times.length - 1) / (times.at(-1) - times[0])).toFixed(1), worstGap: gaps.at(-1).toFixed(0), p95: gaps[Math.floor(gaps.length * 0.95)].toFixed(0) });
  } };
  requestAnimationFrame(f);
}));
await p.evaluate(() => window.__game.tap());
console.log('camera OFF:', JSON.stringify(await fps()));
await p.click('#cam');
await p.waitForFunction(() => window.__game.hand?.frames > 5, null, { timeout: 120000 });
const a = await p.evaluate(() => window.__game.hand);
const f = await fps();
const z = await p.evaluate(() => window.__game.hand);
console.log('camera ON :', JSON.stringify(f), '| delegate', z.delegate, '|', z.detectMs.toFixed(0), 'ms/detection |', z.frames - a.frames, 'detections during the measurement');
await b.close();
