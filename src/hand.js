// Webcam hand control: MediaPipe Hand Landmarker (in a worker, see hand-worker.js) finds 21 hand
// joints, we classify the hand as "fist" or "open" from those joints, and every confirmed change
// of state counts as one tap. MediaPipe is loaded from CDNs only when the player turns the camera
// on, so the game itself stays small and works offline without it.
import workerSource from './hand-worker.js?raw';

// Finger = [mcp, pip, tip] landmark indices (thumb left out: it is unreliable for fist vs open).
const FINGERS = [[5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]];
const OPEN_RATIO = 1.5;   // tip-to-wrist / mcp-to-wrist above this = finger stretched out
const CURL_RATIO = 1.25;  // below this = finger curled into the palm
// No extra confirmation delay: fist and open are far apart (ratios ~0.8 vs ~1.9) and anything in
// between is ignored, so one detection is enough. A 70 ms hold here measured 397 -> 251 ms latency.
const STABLE_MS = 0;
const LOST_MS = 600;      // hand gone this long -> forget the last state (re-entering is not a tap)
const FRAME_W = 320;      // frames are downscaled before going to the worker
const FRAME_H = 240;
const INIT_TIMEOUT = 60000;
// Inference backend order. CPU first: in the worker the GPU delegate fights the game's WebGL for
// the GPU and measured 150 ms/detection vs 70 ms on CPU (tools/check-hand-latency.mjs).
// ?hand=gpu forces GPU first, for measuring.
const DELEGATES = new URLSearchParams(location.search).get('hand') === 'gpu' ? ['GPU', 'CPU'] : ['CPU', 'GPU'];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.6);

// Returns { state: 'open' | 'fist' | null, ratios } for one hand's 21 landmarks.
export function classifyHand(lm) {
  const wrist = lm[0];
  const ratios = FINGERS.map(([mcp, , tip]) => dist(lm[tip], wrist) / Math.max(dist(lm[mcp], wrist), 1e-6));
  const open = ratios.filter((r) => r > OPEN_RATIO).length;
  const curled = ratios.filter((r) => r < CURL_RATIO).length;
  const state = open >= 3 ? 'open' : curled >= 3 ? 'fist' : null;
  return { state, ratios };
}

const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

// Draws the hand skeleton onto the (mirrored) preview canvas.
export function drawHand(ctx, lm, color) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  if (!lm) return;
  ctx.lineWidth = Math.max(1.5, w / 110);
  ctx.strokeStyle = color;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (const [a, b] of BONES) {
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
  }
  ctx.stroke();
  const r = Math.max(1.5, w / 120);
  for (const p of lm) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function startWorker(delegates) {
  const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  const worker = new Worker(url); // classic worker on purpose (see hand-worker.js)
  URL.revokeObjectURL(url);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('model load timeout')), INIT_TIMEOUT);
    worker.onmessage = (e) => {
      if (e.data.type === 'ready') { clearTimeout(timer); worker.delegate = e.data.delegate; resolve(worker); }
      else if (e.data.type === 'error') { clearTimeout(timer); worker.terminate(); reject(new Error(e.data.message)); }
    };
    worker.onerror = (e) => { clearTimeout(timer); worker.terminate(); reject(new Error(e.message || 'worker error')); };
    worker.postMessage({ type: 'init', delegates });
  });
}

export class HandControl {
  // onFlip(state): called once per confirmed fist<->open change. onState(state, info): UI updates.
  constructor({ video, onFlip, onState }) {
    this.video = video;
    this.onFlip = onFlip;
    this.onState = onState;
    this.worker = null;     // kept across camera off/on so the model loads once
    this.stream = null;
    this.running = false;
    this.busy = false;      // a frame is being processed; never queue more than one
    this.pending = false;   // a newer camera frame arrived while busy
    this.confirmed = null;  // last accepted state
    this.candidate = null;  // state currently being observed
    this.candidateSince = 0;
    this.lastSeen = 0;
    this.lastT = 0;
    this.frames = 0;        // detections done (debug)
    this.flips = 0;
    this.detectMs = 0;      // smoothed time per detection
  }

  get delegate() { return this.worker?.delegate; }

  async start() {
    this.onState('loading');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-camera-api');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    if (!this.worker) {
      this.worker = await startWorker(DELEGATES);
      this.worker.onmessage = (e) => { if (e.data.type === 'result') this.#onResult(e.data.lm, e.data.ms); };
    }
    this.running = true;
    this.busy = this.pending = false;
    this.onState('nohand');
    this.#waitFrame();
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.confirmed = this.candidate = null;
  }

  // Process each camera frame as soon as it arrives (not on the game's render tick).
  #waitFrame() {
    if (!this.running) return;
    const v = this.video;
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(this.#onVideoFrame);
    else requestAnimationFrame(this.#onVideoFrame);
  }

  #onVideoFrame = () => {
    if (!this.running) return;
    if (this.busy) this.pending = true;
    else this.#send();
    this.#waitFrame();
  };

  #nextT() {
    const t = Math.max(performance.now(), this.lastT + 1); // VIDEO mode needs increasing timestamps
    this.lastT = t;
    return t;
  }

  async #send() {
    const v = this.video;
    if (v.readyState < 2) return;
    this.busy = true;
    this.pending = false;
    try {
      const bitmap = await createImageBitmap(v, { resizeWidth: FRAME_W, resizeHeight: FRAME_H, resizeQuality: 'low' });
      this.worker.postMessage({ type: 'frame', bitmap, t: this.#nextT() }, [bitmap]);
    } catch {
      this.busy = false;
    }
  }

  #onResult(lm, ms) {
    this.busy = false;
    if (!this.running) return;
    this.frames += 1;
    this.detectMs = this.detectMs * 0.9 + ms * 0.1;
    const now = performance.now();
    if (lm) {
      this.lastSeen = now;
      this.#observe(classifyHand(lm).state, now, lm);
    } else if (now - this.lastSeen > LOST_MS) {
      this.confirmed = this.candidate = null;
      this.onState('nohand');
    }
    if (this.pending) this.#send(); // a newer frame is waiting: go now instead of next callback
  }

  #observe(state, now, lm) {
    if (state === null) { this.onState(this.confirmed ?? 'unsure', { lm }); return; }
    if (state !== this.candidate) {
      this.candidate = state;
      this.candidateSince = now;
    }
    if (state !== this.confirmed && now - this.candidateSince >= STABLE_MS) {
      const had = this.confirmed;
      this.confirmed = state;
      if (had !== null) { this.flips += 1; this.onFlip(state); }
    }
    // Show what the camera sees right now; only the confirmed change above counts as a tap.
    this.onState(state, { lm });
  }
}
