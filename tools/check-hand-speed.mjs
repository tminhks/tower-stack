// Measures detection speed with the fake webcam under different GPU setups.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
const cam = resolve('screenshots/hand/fake-cam.mjpeg');
for (const [label, gpuArgs] of [['swiftshader (no GPU)', ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']], ['real GPU (d3d11)', ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']]]) {
  const b = await chromium.launch({ args: [...gpuArgs, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam}`] });
  const p = await (await b.newContext({ permissions: ['camera'] })).newPage();
  await p.goto('http://localhost:5199/?debug');
  await p.waitForTimeout(500);
  await p.click('#cam');
  await p.waitForFunction(() => window.__game.hand?.frames > 0, null, { timeout: 120000 });
  const a = await p.evaluate(() => window.__game.hand);
  const t = Date.now();
  await p.waitForTimeout(10000);
  const z = await p.evaluate(() => window.__game.hand);
  const secs = (Date.now() - t) / 1000;
  console.log(`${label}: ${((z.frames - a.frames) / secs).toFixed(1)} detections/s, ${z.detectMs.toFixed(0)} ms each, flips in 10s: ${z.flips - a.flips} (video changes hand every 1.5s -> ~6-7 expected)`);
  await b.close();
}
