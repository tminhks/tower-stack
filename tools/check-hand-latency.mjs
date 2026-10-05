// Hand-control latency: time from the webcam frame where the hand changes (fist <-> open) to the
// moment the game receives the tap. Uses the fake webcam (screenshots/hand/fake-cam.mjpeg, hand
// changes every 1.5 s). Also reports the game frame rate while tracking.
// Usage: node tools/check-hand-latency.mjs "<url with ?debug&...>"   (HEADED=1 for a real window)
// Note: excludes the webcam's own capture delay (~30-60 ms on real cameras), which no code can remove.
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const cam = resolve('screenshots/hand/fake-cam.mjpeg');
const url = process.argv[2] || 'http://localhost:5199/?debug';
const b = await chromium.launch({
  headless: process.env.HEADED !== '1',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam}`],
});
const p = await (await b.newContext({ permissions: ['camera'], viewport: { width: 1280, height: 800 } })).newPage();
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate(() => window.__game.tap()); // game running while we measure
await p.click('#cam');
await p.waitForFunction(() => window.__game.hand?.frames > 3, null, { timeout: 120000 });

const r = await p.evaluate(() => new Promise((done) => {
  const v = document.getElementById('cam-video');
  const c = new OffscreenCanvas(16, 9).getContext('2d', { willReadFrequently: true });
  const switches = [], flips = [], gaps = [];
  let prev = null;
  let lastFlips = window.__game.hand.flips;
  let lastT = performance.now();
  const end = performance.now() + 15000;
  const onFrame = () => {
    c.drawImage(v, 0, 0, 16, 9);
    const d = c.getImageData(0, 0, 16, 9).data;
    if (prev) {
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]);
      if (s / (d.length / 2) > 12) switches.push(performance.now()); // picture changed: fist <-> open
    }
    prev = d;
    if (performance.now() < end) v.requestVideoFrameCallback(onFrame);
  };
  v.requestVideoFrameCallback(onFrame);
  const raf = (t) => {
    gaps.push(t - lastT); lastT = t;
    const f = window.__game.hand.flips;
    if (f !== lastFlips) { flips.push(performance.now()); lastFlips = f; }
    if (performance.now() < end) requestAnimationFrame(raf);
    else done({ switches, flips, gaps, hand: window.__game.hand });
  };
  requestAnimationFrame(raf);
}));
await b.close();

// Pair each switch with the first flip after it (and before the next switch).
const lat = [];
let missed = 0;
r.switches.forEach((s, i) => {
  const next = r.switches[i + 1] ?? Infinity;
  const f = r.flips.find((x) => x >= s && x < next);
  if (f === undefined) missed++; else lat.push(f - s);
});
lat.sort((a, b) => a - b);
const q = (a, k) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * k))].toFixed(0) : '-';
const g = r.gaps.slice(1).sort((a, b) => a - b);
const fps = (1000 * g.length / g.reduce((a, b) => a + b, 0)).toFixed(1);
console.log(`latency median ${q(lat, 0.5)} ms, p90 ${q(lat, 0.9)} ms | caught ${lat.length}/${r.switches.length} hand changes (missed ${missed}) | game ${fps} fps, worst frame ${g.at(-1).toFixed(0)} ms | ${r.hand.delegate}, ${r.hand.detectMs.toFixed(0)} ms/detection`);
