// ─────────────────────────────────────────────────────────────
//  Audio: background music + analyser (for the visualizer and
//  the music-reactive city lights)
// ─────────────────────────────────────────────────────────────

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('spec:' + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('spec:' + k, JSON.stringify(v));
    } catch {}
  },
};
export { store };

export class AudioEngine {
  constructor(playlist, { volume = 0.45 } = {}) {
    this.playlist = playlist;
    this.index = 0;
    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.crossOrigin = 'anonymous';
    this.el.loop = playlist.length === 1;
    this.el.src = playlist[0].src;
    this.volume = store.get('volume', volume);
    this.muted = store.get('muted', false);
    this.ctx = null;
    this.level = 0;
    this.bins = null;
    this.useGraph = location.protocol !== 'file:'; // file:// would taint the graph → silence
    this.el.addEventListener('ended', () => {
      if (this.playlist.length > 1) this.next();
    });
  }

  get track() {
    return this.playlist[this.index];
  }

  // must run inside a user gesture (the "click to enter")
  async enter() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !this.ctx) {
      this.ctx = new AC();
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(ctx.destination);

      if (this.useGraph) {
        try {
          const src = ctx.createMediaElementSource(this.el);
          this.musicGain = ctx.createGain();
          this.musicGain.gain.value = 0;
          this.analyser = ctx.createAnalyser();
          this.analyser.fftSize = 512;
          this.analyser.smoothingTimeConstant = 0.82;
          this.bins = new Uint8Array(this.analyser.frequencyBinCount);
          src.connect(this.musicGain).connect(this.analyser).connect(this.master);
        } catch {
          this.useGraph = false;
        }
      }
    }
    if (this.ctx?.state === 'suspended') await this.ctx.resume();

    if (!this.useGraph) this.el.volume = 0;
    try {
      await this.el.play();
    } catch {
      /* autoplay refused: the play button still works */
    }
    this.#fadeMusic(1, 2.5);
  }

  #fadeMusic(to, secs) {
    if (this.useGraph && this.musicGain) {
      const g = this.musicGain.gain;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(to, now + secs);
    } else {
      const target = (this.muted ? 0 : this.volume) * to;
      const start = this.el.volume;
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
        this.el.volume = start + (target - start) * k;
        if (k < 1) requestAnimationFrame(step);
      };
      step();
    }
  }

  // ── transport ──
  get playing() {
    return !this.el.paused;
  }

  async toggle() {
    if (this.el.paused) {
      if (this.ctx?.state === 'suspended') await this.ctx.resume();
      try {
        await this.el.play();
      } catch {}
    } else this.el.pause();
  }

  load(i, autoplay = true) {
    this.index = (i + this.playlist.length) % this.playlist.length;
    this.el.src = this.track.src;
    this.el.loop = this.playlist.length === 1;
    if (autoplay) this.el.play().catch(() => {});
  }

  next() {
    if (this.playlist.length === 1) {
      this.el.currentTime = 0;
      return;
    }
    this.load(this.index + 1);
  }

  prev() {
    if (this.el.currentTime > 3 || this.playlist.length === 1) {
      this.el.currentTime = 0;
      return;
    }
    this.load(this.index - 1);
  }

  seek(frac) {
    if (isFinite(this.el.duration)) this.el.currentTime = frac * this.el.duration;
  }

  setVolume(v) {
    this.volume = v;
    store.set('volume', v);
    if (v > 0 && this.muted) this.setMuted(false);
    this.#applyVolume();
  }

  setMuted(m) {
    this.muted = m;
    store.set('muted', m);
    this.#applyVolume();
  }

  #applyVolume() {
    const v = this.muted ? 0 : this.volume;
    if (this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(v, now, 0.05);
    }
    if (!this.useGraph) this.el.volume = v;
  }

  // ── analysis ──
  update() {
    if (!this.analyser || this.el.paused) {
      this.level *= 0.92;
      return;
    }
    this.analyser.getByteFrequencyData(this.bins);
    let bass = 0;
    for (let i = 1; i < 10; i++) bass += this.bins[i];
    bass /= 9 * 255;
    // emphasise the kicks: subtract a slow-moving baseline
    this.baseline = (this.baseline ?? bass) * 0.97 + bass * 0.03;
    const hit = Math.max(0, bass - this.baseline * 0.85) * 3.2;
    this.level = Math.min(1, this.level * 0.82 + hit * 0.5 + bass * 0.12);
  }

  // n log-spaced bars in 0..1 (falls back to a gentle idle wave)
  bars(n, t) {
    const out = new Array(n);
    if (this.analyser && !this.el.paused && this.bins) {
      const len = this.bins.length * 0.7;
      for (let i = 0; i < n; i++) {
        const a = Math.floor(Math.pow(i / n, 1.7) * len) + 1;
        const b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / n, 1.7) * len) + 1);
        let s = 0;
        for (let j = a; j < b; j++) s += this.bins[j];
        out[i] = s / ((b - a) * 255);
      }
    } else {
      const amp = this.el.paused ? 0.06 : 0.35;
      for (let i = 0; i < n; i++) out[i] = amp * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 0.6)) * (0.6 + 0.4 * Math.sin(t * 1.3 + i));
    }
    return out;
  }
}
