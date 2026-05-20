const SFX = {
  _ctx: null,
  muted: false,

  _init() {
    if (this._ctx) return this._ctx;
    try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    return this._ctx;
  },

  _play(fn) {
    if (this.muted) return;
    const ctx = this._init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    try { fn(ctx); } catch(e) {}
  },

  attack() {
    this._play(ctx => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.start(t); osc.stop(t + 0.15);
    });
  },

  ultimateAttack() {
    this._play(ctx => {
      const t = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      osc1.connect(g1); g1.connect(ctx.destination);
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(120, t);
      osc1.frequency.exponentialRampToValueAtTime(35, t + 0.35);
      g1.gain.setValueAtTime(0.5, t);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      osc1.start(t); osc1.stop(t + 0.4);

      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.connect(g2); g2.connect(ctx.destination);
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(550, t);
      osc2.frequency.exponentialRampToValueAtTime(90, t + 0.1);
      g2.gain.setValueAtTime(0.22, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc2.start(t); osc2.stop(t + 0.13);
    });
  },

  block() {
    this._play(ctx => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(900, t);
      osc.frequency.exponentialRampToValueAtTime(380, t + 0.22);
      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      osc.start(t); osc.stop(t + 0.27);
    });
  },

  damage() {
    this._play(ctx => {
      const t = ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * 0.12);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 320;
      filter.Q.value = 0.9;
      const g = ctx.createGain();
      src.buffer = buf;
      src.connect(filter); filter.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.45, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.start(t);
    });
  },

  vanish() {
    this._play(ctx => {
      const t = ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * 0.32);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(150, t);
      filter.frequency.exponentialRampToValueAtTime(5000, t + 0.32);
      const g = ctx.createGain();
      src.buffer = buf;
      src.connect(filter); filter.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      src.start(t);
    });
  },

  combo() {
    this._play(ctx => {
      [523, 659].forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.13;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.28, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.start(t); osc.stop(t + 0.15);
      });
    });
  },

  eliminate() {
    this._play(ctx => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.65);
      g.gain.setValueAtTime(0.42, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.68);
      osc.start(t); osc.stop(t + 0.7);
    });
  },

  victory() {
    this._play(ctx => {
      [523, 659, 784, 1046].forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.16;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.28, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.start(t); osc.stop(t + 0.3);
      });
    });
  },

  yourTurn() {
    this._play(ctx => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.start(t); osc.stop(t + 0.33);
    });
  }
};
