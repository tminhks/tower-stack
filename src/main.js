import * as THREE from 'three';
import { Sfx } from './audio.js';
import { mountBackground } from './background.js';

// ---------- tuning ----------
const SIZE = 3;            // starting slab footprint (world units, square)
const H = 0.5;             // slab thickness
const BASE_H = 40;       // height of the pillar under the first slab
const RANGE = SIZE * 1.6;  // how far the moving slab travels either side of the tower
const SPEED_BASE = 5.8;    // units / second at score 0
const SPEED_GAIN = 0.075;  // added per point
const SPEED_MAX = 11;
const TOLERANCE = 0.12;    // |offset| below this snaps as a perfect placement
const GROW_AFTER = 5;      // perfects in a row before the slab starts growing back
const GROW_STEP = 0.18;    // units regained per perfect once growing
// Slab hue swings between club cyan and club purple instead of the full wheel.
const HUE_MID = 225;       // centre hue (club blue)
const HUE_SWING = 31;      // ± degrees -> 194 (cyan) .. 256 (purple)
const HUE_RATE = 0.13;     // radians of the swing per layer
const GRAVITY = 28;
const CAM_ABOVE = 1.6;     // camera target sits this far above the top slab
const RESTART_DELAY = 650; // ms before a tap on the game-over screen restarts

const BEST_KEY = 'tower-stack:best';
const MUTE_KEY = 'tower-stack:muted';

// ---------- dom ----------
const canvas = document.getElementById('scene');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const startEl = document.getElementById('start');
const overEl = document.getElementById('over');
const overBestEl = document.getElementById('over-best');
const newBestEl = document.getElementById('new-best');
const muteBtn = document.getElementById('mute');

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// ---------- three ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3a8a, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.position.set(3, 10, 5.5);
scene.add(sun);
scene.add(sun.target);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
const CAM_DIR = new THREE.Vector3(1, 0.82, 1).normalize().multiplyScalar(60);
let viewH = 14;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;
  // Keep at least ~10.5 units of width visible so the slide path fits on phones.
  viewH = Math.max(14, 10.5 / aspect);
  camera.left = (-viewH * aspect) / 2;
  camera.right = (viewH * aspect) / 2;
  camera.top = viewH / 2;
  camera.bottom = -viewH / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize);
resize();

const unitBox = new THREE.BoxGeometry(1, 1, 1);

// ---------- helpers ----------
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

function hueFor(layer) {
  return HUE_MID + HUE_SWING * Math.sin(hue0 + layer * HUE_RATE);
}

function colorFor(layer) {
  return new THREE.Color().setHSL(hueFor(layer) / 360, 0.9, 0.6);
}

function setBackground(layer) {
  document.documentElement.style.setProperty('--h', hueFor(layer).toFixed(1));
}

function setState(s) {
  state = s;
  document.body.dataset.state = s;
}

function makeSlab(layer, x, z, w, d, height = H) {
  const mat = new THREE.MeshLambertMaterial({ color: colorFor(layer), emissive: 0xffffff, emissiveIntensity: 0 });
  const mesh = new THREE.Mesh(unitBox, mat);
  mesh.scale.set(w, height, d);
  const bottom = layer === 0 ? H - height : layer * H;
  mesh.position.set(x, bottom + height / 2, z);
  scene.add(mesh);
  // dw/dd = displayed size, eased toward w/d (used when the slab grows back).
  return { mesh, layer, x, z, w, d, dw: w, dd: d, height, bottom, squashT: -1, flashT: -1 };
}

function disposeMesh(mesh) {
  scene.remove(mesh);
  mesh.material.dispose();
  if (mesh.geometry !== unitBox) mesh.geometry.dispose();
}

// ---------- state ----------
const sfx = new Sfx();
let state = 'ready'; // ready | playing | over
let stack = [];
let moving = null;
let effects = [];
let score = 0;
let combo = 0;
let best = Number(store.get(BEST_KEY)) || 0;
let hue0 = Math.random() * Math.PI * 2; // phase of the hue swing
let overAt = 0;
let camY = 0;
let camZoom = 1;

function reset() {
  for (const s of stack) disposeMesh(s.mesh);
  if (moving) disposeMesh(moving.mesh);
  stack = [];
  moving = null;
  score = 0;
  combo = 0;
  hue0 = Math.random() * Math.PI * 2;
  stack.push(makeSlab(0, 0, 0, SIZE, SIZE, BASE_H));
  setBackground(0);
  updateScore(false);
}

function topY() {
  return stack.length * H;
}

function spawn() {
  const top = stack[stack.length - 1];
  const layer = stack.length;
  const axis = layer % 2 === 1 ? 'x' : 'z';
  const s = makeSlab(layer, top.x, top.z, top.w, top.d);
  s.axis = axis;
  s.origin = top[axis];
  s.offset = -RANGE;
  s.dir = 1;
  s[axis] = s.origin + s.offset;
  s.mesh.position[axis] = s[axis];
  moving = s;
}

function speed() {
  return Math.min(SPEED_BASE + score * SPEED_GAIN, SPEED_MAX);
}

// ---------- placing ----------
function place() {
  const top = stack[stack.length - 1];
  const s = moving;
  const a = s.axis;
  const sz = a === 'x' ? 'w' : 'd';
  const delta = s[a] - top[a];
  const ad = Math.abs(delta);

  if (ad <= TOLERANCE) {
    // Perfect: snap onto the slab below.
    s[a] = top[a];
    combo += 1;
    if (combo >= GROW_AFTER) grow(s);
    s.mesh.position[a] = s[a];
    s.flashT = 0;
    spawnRipples(s, combo);
    sfx.perfect(combo);
    if (combo >= GROW_AFTER) sfx.grow();
    commit(s);
    return;
  }

  const overlap = s[sz] - ad;
  if (overlap <= 0) {
    miss(s, Math.sign(delta));
    return;
  }

  combo = 0;
  const sign = Math.sign(delta);
  const keptCenter = top[a] + delta / 2;
  const chopCenter = keptCenter + (sign * (overlap + ad)) / 2;

  // Chopped piece becomes its own falling block.
  const chop = { x: s.x, z: s.z, w: s.w, d: s.d };
  chop[a] = chopCenter;
  chop[sz] = ad;
  spawnFalling(s.layer, chop, a, sign);

  s[a] = keptCenter;
  s[sz] = overlap;
  s.dw = s.w;
  s.dd = s.d;
  s.mesh.scale.set(s.w, H, s.d);
  s.mesh.position[a] = s[a];
  sfx.tock();
  commit(s);
}

function grow(s) {
  // Grow on the axis that has lost the most, never past the starting size.
  const key = s.w < s.d ? 'w' : 'd';
  s[key] = Math.min(SIZE, s[key] + GROW_STEP);
}

function commit(s) {
  s.squashT = 0;
  stack.push(s);
  moving = null;
  score += 1;
  updateScore(true);
  setBackground(s.layer);
  spawn();
}

function miss(s, sign) {
  moving = null;
  spawnFalling(s.layer, s, s.axis, sign || 1, s.mesh);
  gameOver();
}

// ---------- effects ----------
function spawnFalling(layer, box, axis, sign, existingMesh) {
  let mesh = existingMesh;
  if (!mesh) {
    mesh = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: colorFor(layer) }));
    mesh.scale.set(box.w, H, box.d);
    mesh.position.set(box.x, layer * H + H / 2, box.z);
    scene.add(mesh);
  }
  const v = new THREE.Vector3();
  v[axis] = sign * (1.2 + Math.random() * 0.6);
  v.y = 1.2;
  // Tumble away from the tower: rotate around the horizontal axis perpendicular to the cut.
  const spin = new THREE.Vector3();
  if (axis === 'x') spin.z = -sign * (2.4 + Math.random() * 1.6);
  else spin.x = sign * (2.4 + Math.random() * 1.6);
  effects.push({
    kind: 'fall',
    mesh,
    v,
    spin,
    update(dt) {
      this.v.y -= GRAVITY * dt;
      this.mesh.position.addScaledVector(this.v, dt);
      this.mesh.rotation.x += this.spin.x * dt;
      this.mesh.rotation.z += this.spin.z * dt;
      // Gone once well below the visible area.
      return this.mesh.position.y > camY - (viewH / camZoom) * 1.2 - 6;
    },
    dispose() { disposeMesh(this.mesh); },
  });
}

function ringGeometry(w, d, t) {
  const shape = new THREE.Shape();
  const ow = w / 2 + t;
  const od = d / 2 + t;
  shape.moveTo(-ow, -od); shape.lineTo(ow, -od); shape.lineTo(ow, od); shape.lineTo(-ow, od); shape.lineTo(-ow, -od);
  const hole = new THREE.Path();
  hole.moveTo(-w / 2, -d / 2); hole.lineTo(-w / 2, d / 2); hole.lineTo(w / 2, d / 2); hole.lineTo(w / 2, -d / 2); hole.lineTo(-w / 2, -d / 2);
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape);
}

function spawnRipples(s, count) {
  const n = Math.min(count, 4);
  for (let i = 0; i < n; i++) {
    const geo = ringGeometry(s.w + 0.06, s.d + 0.06, 0.07);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(s.x, s.layer * H + H + 0.002, s.z);
    mesh.renderOrder = 2;
    scene.add(mesh);
    effects.push({
      kind: 'ripple',
      mesh,
      t: -i * 0.09,
      dur: 0.6,
      update(dt) {
        this.t += dt;
        if (this.t < 0) return true;
        const p = Math.min(this.t / this.dur, 1);
        const e = easeOutCubic(p);
        const k = 1 + e * (0.55 + 0.1 * i);
        this.mesh.scale.set(k, k, 1);
        this.mesh.material.opacity = (1 - p) * 0.95;
        return p < 1;
      },
      dispose() { disposeMesh(this.mesh); },
    });
  }
}

// ---------- ui ----------
function updateScore(bump) {
  scoreEl.textContent = String(score);
  if (bump) {
    scoreEl.classList.remove('bump');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('bump');
    setTimeout(() => scoreEl.classList.remove('bump'), 120);
  }
  bestEl.textContent = best > 0 ? `Best ${best}` : '';
}

function showPanel(el) {
  for (const p of [startEl, overEl]) p.classList.toggle('is-visible', p === el);
}

function setMuted(m) {
  sfx.setMuted(m);
  muteBtn.setAttribute('aria-pressed', String(m));
  muteBtn.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
  store.set(MUTE_KEY, m ? '1' : '0');
}

// ---------- flow ----------
function start() {
  if (stack.length > 1 || effects.length) reset();
  setState('playing');
  showPanel(null);
  scoreEl.classList.remove('is-hidden');
  spawn();
}

function gameOver() {
  setState('over');
  overAt = performance.now();
  sfx.gameOver();
  const isNew = score > best;
  if (isNew) {
    best = score;
    store.set(BEST_KEY, String(best));
  }
  overBestEl.textContent = String(best);
  newBestEl.classList.toggle('is-visible', isNew && score > 0);
  bestEl.textContent = '';
  showPanel(overEl);
}

function onTap() {
  sfx.unlock();
  if (state === 'ready') start();
  else if (state === 'playing') { if (moving) place(); }
  else if (state === 'over' && performance.now() - overAt > RESTART_DELAY) start();
}

window.addEventListener('pointerdown', (e) => {
  if (e.button !== undefined && e.button !== 0) return;
  if (e.target.closest && e.target.closest('#mute')) return;
  onTap();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    if (e.target === muteBtn) return;
    e.preventDefault();
    if (!e.repeat) onTap();
  } else if (e.code === 'KeyM') {
    setMuted(!sfx.muted);
  }
});
muteBtn.addEventListener('click', () => { sfx.unlock(); setMuted(!sfx.muted); });

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;

  if (moving) {
    const s = moving;
    s.offset += s.dir * speed() * dt;
    if (s.offset > RANGE) { s.offset = RANGE - (s.offset - RANGE); s.dir = -1; }
    else if (s.offset < -RANGE) { s.offset = -RANGE + (-RANGE - s.offset); s.dir = 1; }
    s[s.axis] = s.origin + s.offset;
    s.mesh.position[s.axis] = s[s.axis];
  }

  // Per-slab animation: squash + flash on landing, ease toward grown size.
  for (let i = Math.max(1, stack.length - 4); i < stack.length; i++) {
    const s = stack[i];
    if (s.squashT >= 0) {
      s.squashT += dt;
      const t = s.squashT;
      const k = 1 - 0.28 * Math.exp(-t * 14) * Math.cos(t * 34);
      s.mesh.scale.y = H * k;
      s.mesh.position.y = s.bottom + (H * k) / 2;
      if (t > 0.6) { s.squashT = -1; s.mesh.scale.y = H; s.mesh.position.y = s.bottom + H / 2; }
    }
    if (s.flashT >= 0) {
      s.flashT += dt;
      s.mesh.material.emissiveIntensity = Math.max(0, 0.55 * (1 - s.flashT / 0.3));
      if (s.flashT > 0.3) s.flashT = -1;
    }
    if (Math.abs(s.dw - s.w) > 0.001 || Math.abs(s.dd - s.d) > 0.001) {
      s.dw = damp(s.dw, s.w, 12, dt);
      s.dd = damp(s.dd, s.d, 12, dt);
      s.mesh.scale.x = s.dw;
      s.mesh.scale.z = s.dd;
    }
  }

  effects = effects.filter((fx) => {
    const alive = fx.update(dt);
    if (!alive) fx.dispose();
    return alive;
  });

  // Camera: follow the top while playing; pull back to frame the whole tower on game over.
  let targetY = topY() + CAM_ABOVE;
  let targetZoom = 1;
  if (state === 'over') {
    const towerH = topY() + 4;
    targetZoom = Math.min(0.8, viewH / (towerH * 1.5));
    targetY = topY() * 0.55 - 1;
  } else if (state === 'ready') {
    targetY = topY() + CAM_ABOVE + 1.6; // tower sits lower so the logo + title fit above it
  }
  camY = damp(camY, targetY, state === 'over' ? 2.2 : 4.5, dt);
  camZoom = damp(camZoom, targetZoom, 2.2, dt);
  if (Math.abs(camera.zoom - camZoom) > 1e-4) {
    camera.zoom = camZoom;
    camera.updateProjectionMatrix();
  }
  camera.position.set(CAM_DIR.x, camY + CAM_DIR.y, CAM_DIR.z);
  camera.lookAt(0, camY, 0);
  sun.position.set(3, camY + 10, 5.5);
  sun.target.position.set(0, camY, 0);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- boot ----------
mountBackground(document.getElementById('bg'));
setState('ready');
setMuted(store.get(MUTE_KEY) === '1');
reset();
camY = topY() + CAM_ABOVE + 1.6;
requestAnimationFrame(frame);

// Test hooks for automated screenshots: ?debug
if (new URLSearchParams(location.search).has('debug')) {
  window.__game = {
    get state() { return state; },
    get score() { return score; },
    get combo() { return combo; },
    tap: onTap,
    sfx,
    // Drop the moving slab at an exact offset from the slab below.
    dropAt(off) {
      if (state !== 'playing' || !moving) return;
      moving.offset = off;
      moving[moving.axis] = moving.origin + off;
      moving.mesh.position[moving.axis] = moving[moving.axis];
      place();
    },
  };
}
