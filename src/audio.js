// All sounds are synthesised with the Web Audio API — no audio files.
// The context is created lazily on the first user gesture (autoplay policy).

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PERFECT_ROOT = 523.25; // C5

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.muted = false;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.noise = this.#makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
  }

  get ready() {
    return !!this.ctx && !this.muted;
  }

  // Short soft wooden "tock": a falling triangle blip plus a tiny filtered noise click.
  tock(pitch = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f = (190 + Math.random() * 20) * pitch;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f * 2, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.12);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400 * pitch;
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.25, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(bp).connect(ng).connect(this.master);
    src.start(t, Math.random() * 0.5, 0.04);
  }

  // Clean bell-ish tone; each consecutive perfect climbs one step of a major scale.
  perfect(combo) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = Math.min(combo - 1, 14);
    const semis = MAJOR[n % 7] + 12 * Math.floor(n / 7);
    const f = PERFECT_ROOT * Math.pow(2, semis / 12);

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.32, t + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    out.connect(this.master);

    for (const [mult, amp, type] of [[1, 1, 'sine'], [2, 0.28, 'sine'], [3, 0.08, 'triangle']]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.value = amp;
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.72);
    }
  }

  // Bright little sparkle when the slab grows back after a long perfect streak.
  grow() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [1568, 2093].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      const s = t + 0.07 + i * 0.06;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.12, s + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.35);
      o.connect(g).connect(this.master);
      o.start(s);
      o.stop(s + 0.36);
    });
  }

  // Low descending tone.
  gameOver() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    lp.connect(g).connect(this.master);

    for (const [type, mult] of [['triangle', 1], ['sine', 0.5]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(330 * mult, t);
      o.frequency.exponentialRampToValueAtTime(82 * mult, t + 0.9);
      o.connect(lp);
      o.start(t);
      o.stop(t + 1.02);
    }
  }

  #makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
}
