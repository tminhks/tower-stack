// Isolates what makes the game stutter with the camera on: camera alone, + createImageBitmap
// each frame, + full tracking. Real window (headed), fake webcam.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
const cam = resolve('screenshots/hand/fake-cam.mjpeg');
const b = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam}`] });
const p = await (await b.newContext({ permissions: ['camera'], viewport: { width: 1280, height: 800 } })).newPage();
await p.goto(process.argv[2] || 'http://localhost:5199/?debug');
await p.waitForTimeout(1000);
await p.evaluate(() => window.__game.tap());
const fps = () => p.evaluate(() => new Promise((res) => {
  const t = []; let n = 0;
  const f = (x) => { t.push(x); if (++n < 240) requestAnimationFrame(f); else {
    const g = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b);
    res(`${(1000 * g.length / (t.at(-1) - t[0])).toFixed(1)} fps, p95 ${g[Math.floor(g.length * 0.95)].toFixed(0)} ms, worst ${g.at(-1).toFixed(0)} ms, frames >100ms: ${g.filter((x) => x > 100).length}`);
  } };
  requestAnimationFrame(f);
}));
console.log('1. no camera            :', await fps());
await p.evaluate(async () => {
  const v = document.getElementById('cam-video');
  v.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
  await v.play();
});
await p.waitForTimeout(1500);
console.log('2. camera playing       :', await fps());
await p.evaluate(() => document.getElementById('cam-panel').classList.add('is-on'));
await p.waitForTimeout(800);
console.log('2b. + preview visible   :', await fps());
await p.evaluate(() => { const c = document.getElementById('cam-overlay').getContext('2d'); window.__drawOn = true; const d = () => { if (!window.__drawOn) return; c.clearRect(0, 0, 320, 240); c.fillRect(Math.random() * 300, 100, 10, 10); setTimeout(d, 70); }; d(); });
await p.waitForTimeout(800);
console.log('2c. + overlay redraws   :', await fps());
await p.evaluate(() => { window.__drawOn = false; document.getElementById('cam-panel').classList.remove('is-on'); });
await p.evaluate(() => {
  const v = document.getElementById('cam-video');
  window.__bmpOn = true;
  const loop = async () => { if (!window.__bmpOn) return; const bm = await createImageBitmap(v, { resizeWidth: 320, resizeHeight: 240, resizeQuality: 'low' }); bm.close(); v.requestVideoFrameCallback(loop); };
  v.requestVideoFrameCallback(loop);
});
await p.waitForTimeout(1000);
console.log('3. + createImageBitmap  :', await fps());
await p.evaluate(() => { window.__bmpOn = false; const v = document.getElementById('cam-video'); v.srcObject.getTracks().forEach((t) => t.stop()); v.srcObject = null; });
await p.click('#cam');
await p.waitForFunction(() => window.__game.hand?.frames > 10, null, { timeout: 120000 });
console.log('4. full hand tracking   :', await fps(), '(first seconds)');
await p.waitForTimeout(6000);
console.log('5. tracking, warmed up  :', await fps());
console.log('6. tracking, again      :', await fps());
await b.close();
