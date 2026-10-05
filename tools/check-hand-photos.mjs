// Runs the hand classifier on the user's two reference photos (fist / open palm).
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5199/');
const res = await page.evaluate(async () => {
  const { classifyHand } = await import('/src/hand.js');
  const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
  const vision = await import(base + '/vision_bundle.mjs');
  const lmk = await vision.HandLandmarker.createFromOptions(await vision.FilesetResolver.forVisionTasks(base + '/wasm'), {
    baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'CPU' },
    runningMode: 'IMAGE', numHands: 1,
  });
  const out = {};
  for (const name of ['fist', 'open']) {
    const img = new Image();
    img.src = `/assets-src/gestures/${name}.jpg`;
    await img.decode();
    const r = lmk.detect(img);
    const lm = r.landmarks?.[0];
    out[name] = lm ? classifyHand(lm) : { state: 'NO HAND' };
    out[name].ratios = out[name].ratios?.map((x) => x.toFixed(2));
  }
  return out;
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
