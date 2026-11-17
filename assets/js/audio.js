// ─────────────────────────────────────────────────────────────
//  Audio: background music + analyser + synthesized ambience
//  (rain patter, snowy wind, distant thunder — no extra files)
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
  constructor(playlist, { volume = 0.45, ambience = true, ambienceVolume = 0.25 } = {}) {
    this.playlist = playlist;
    this.index = 0;
    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.crossOrigin = 'anonymous';
    this.el.loop = playlist.length === 1;
    this.el.src = playlist[0].src;
    this.volume = store.get('volume', volume);
    this.muted = store.get('muted', false);
    this.ambienceOn = store.get('ambience', ambience);
    this.ambienceLevel = ambienceVolume; // how loud the weather sits under the music
    this.weather = 'snow';
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
      this.#buildAmbience();
    }
    if (this.ctx?.state === 'suspended') await this.ctx.resume();

    if (!this.useGraph) this.el.volume = 0;
    try {
      await this.el.play();
    } catch {
      /* autoplay refused: the play button still works */
    }
    this.#fadeMusic(1, 2.5);
    this.setWeather(this.weather);
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

  // ── ambience ──
  #noiseBuffer(seconds, kind) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      if (kind === 'white') {
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } else if (kind === 'brown') {
        let last = 0;
        for (let i = 0; i < len; i++) {
          last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
          d[i] = last * 3.5;
        }
      } else if (kind === 'patter') {
        // sparse droplets: tiny decaying noise bursts
        const rate = 420; // drops per second
        const drops = Math.floor(rate * seconds);
        for (let k = 0; k < drops; k++) {
          const at = Math.floor(Math.random() * len);
          const amp = Math.pow(Math.random(), 2.2) * 0.9;
          const dur = Math.floor(ctx.sampleRate * (0.002 + Math.random() * 0.006));
          for (let j = 0; j < dur && at + j < len; j++) {
            d[at + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (dur * 0.25));
          }
        }
      }
    }
    return buf;
  }

  #loop(buffer) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.start(0, Math.random() * buffer.duration);
    return s;
  }

  #buildAmbience() {
    const ctx = this.ctx;
    this.ambience = ctx.createGain();
    this.ambience.gain.value = this.ambienceOn ? this.ambienceLevel : 0;
    this.ambience.connect(this.master);

    // rain: soft wash + patter
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.rainGain.connect(this.ambience);

    const wash = this.#loop(this.#noiseBuffer(5, 'white'));
    const washHP = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 500 });
    const washLP = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 5200, Q: 0.3 });
    const washG = new GainNode(ctx, { gain: 0.055 });
    wash.connect(washHP).connect(washLP).connect(washG).connect(this.rainGain);

    const patter = this.#loop(this.#noiseBuffer(6, 'patter'));
    const patBP = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 3200, Q: 0.6 });
    const patG = new GainNode(ctx, { gain: 0.3 });
    patter.connect(patBP).connect(patG).connect(this.rainGain);

    const body = this.#loop(this.#noiseBuffer(7, 'brown'));
    const bodyLP = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 700 });
    const bodyG = new GainNode(ctx, { gain: 0.11 });
    body.connect(bodyLP).connect(bodyG).connect(this.rainGain);

    // snow: hushed wind with a slow swell
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windGain.connect(this.ambience);
    const wind = this.#loop(this.#noiseBuffer(8, 'brown'));
    const windBP = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 420, Q: 0.8 });
    const windG = new GainNode(ctx, { gain: 0.25 });
    const lfo = new OscillatorNode(ctx, { frequency: 0.07 });
    const lfoAmt = new GainNode(ctx, { gain: 180 });
    lfo.connect(lfoAmt).connect(windBP.frequency);
    lfo.start();
    wind.connect(windBP).connect(windG).connect(this.windGain);

    this.brown = this.#noiseBuffer(4, 'brown');
  }

  setWeather(kind) {
    this.weather = kind;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const ramp = (param, v) => {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(v, now + 2.2);
    };
    ramp(this.rainGain.gain, kind === 'rain' ? 1 : 0);
    ramp(this.windGain.gain, kind === 'snow' ? 1 : 0);
  }

  setAmbience(on) {
    this.ambienceOn = on;
    store.set('ambience', on);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const g = this.ambience.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(on ? this.ambienceLevel : 0, now + 0.8);
  }

  thunder() {
    if (!this.ctx || !this.ambienceOn || this.weather !== 'rain') return;
    const ctx = this.ctx;
    const delay = 0.8 + Math.random() * 2.2; // sound arrives after the flash
    const at = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 160 + Math.random() * 120 });
    const g = new GainNode(ctx, { gain: 0 });
    const peak = 0.35 + Math.random() * 0.25;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.18);
    g.gain.linearRampToValueAtTime(peak * 0.55, at + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 3.8);
    src.connect(lp).connect(g).connect(this.ambience);
    src.start(at);
    src.stop(at + 4);
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
