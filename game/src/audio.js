// Lanternkeep — every sound is synthesized with WebAudio oscillators.
// No audio files, no network: a blip is a short oscillator with an
// envelope, a thud is a falling sine, a coin is two bright pings.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._lastShoot = 0;
    this._lastCoin = 0;
  }

  // Browsers only let audio start after a user gesture; call this from the
  // first click or keypress. Safe to call any time.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
  }

  // One oscillator note: frequency slides from f0 to f1 over `dur` seconds.
  _tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.12, vol = 0.15, when = 0 }) {
    if (!this.ctx || this.muted) return;
    try {
      const t0 = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t0);
      if (f1 !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // Audio is decoration; never let it break the game.
    }
  }

  // Tower shots, one blip per kind. Rate-limited so a volley stays musical.
  shoot(kind) {
    const now = performance.now();
    if (now - this._lastShoot < 70) return;
    this._lastShoot = now;
    if (kind === 'ember') this._tone({ type: 'square', f0: 880, f1: 620, dur: 0.06, vol: 0.05 });
    else if (kind === 'frost') this._tone({ type: 'sine', f0: 1240, f1: 980, dur: 0.09, vol: 0.06 });
    else if (kind === 'storm') this._tone({ type: 'sawtooth', f0: 220, f1: 90, dur: 0.16, vol: 0.07 });
    else if (kind === 'prism') this._tone({ type: 'triangle', f0: 1560, f1: 2090, dur: 0.08, vol: 0.06 });
  }

  hit() {
    this._tone({ type: 'sine', f0: 180, f1: 70, dur: 0.09, vol: 0.08 });
  }

  coin() {
    const now = performance.now();
    if (now - this._lastCoin < 90) return;
    this._lastCoin = now;
    this._tone({ type: 'sine', f0: 1320, dur: 0.07, vol: 0.07 });
    this._tone({ type: 'sine', f0: 1760, dur: 0.1, vol: 0.07, when: 0.06 });
  }

  build() {
    this._tone({ type: 'triangle', f0: 520, f1: 780, dur: 0.12, vol: 0.09 });
  }

  deny() {
    this._tone({ type: 'square', f0: 160, f1: 120, dur: 0.12, vol: 0.06 });
  }

  alarm() {
    this._tone({ type: 'sawtooth', f0: 320, f1: 140, dur: 0.35, vol: 0.12 });
    this._tone({ type: 'sawtooth', f0: 320, f1: 140, dur: 0.35, vol: 0.1, when: 0.18 });
  }

  waveHorn() {
    this._tone({ type: 'triangle', f0: 392, dur: 0.18, vol: 0.09 });
    this._tone({ type: 'triangle', f0: 523, dur: 0.22, vol: 0.09, when: 0.14 });
  }

  win() {
    // A small rising arpeggio.
    [523, 659, 784, 1047].forEach((f, i) => {
      this._tone({ type: 'triangle', f0: f, dur: 0.28, vol: 0.1, when: i * 0.13 });
    });
  }

  lose() {
    [392, 330, 262, 196].forEach((f, i) => {
      this._tone({ type: 'sine', f0: f, dur: 0.3, vol: 0.1, when: i * 0.16 });
    });
  }
}
