// Classic worker (bundled as a string and started from a blob URL, so the single-file build keeps
// working). Runs MediaPipe Hand Landmarker off the main thread so tracking never stalls the game.
// A classic worker is required: MediaPipe loads its WASM glue with importScripts(), which module
// workers do not allow. The ESM bundle itself is pulled in with dynamic import().

const MP_VERSION = '1.0.1';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URLS = [
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  'https://tminhks.github.io/tower-stack/models/hand_landmarker.task', // mirror, in case Google storage is blocked
];

let landmarker = null;

async function init(delegates) {
  const vision = await import(`${MP_BASE}/vision_bundle.mjs`);
  const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
  let lastErr;
  for (const modelAssetPath of MODEL_URLS) {
    for (const delegate of delegates) {
      try {
        landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        return delegate;
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr;
}

let lastT = 0;

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    try {
      const delegate = await init(msg.delegates);
      self.postMessage({ type: 'ready', delegate });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err?.message || err) });
    }
  } else if (msg.type === 'frame') {
    const t0 = performance.now();
    let lm = null;
    try {
      lastT = Math.max(msg.t, lastT + 1); // VIDEO mode needs strictly increasing timestamps
      const res = landmarker.detectForVideo(msg.bitmap, lastT);
      const hand = res.landmarks?.[0];
      if (hand) lm = hand.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    } catch (err) {
      // a bad frame is skipped, tracking carries on
    } finally {
      msg.bitmap.close();
    }
    self.postMessage({ type: 'result', lm, ms: performance.now() - t0 });
  }
};
