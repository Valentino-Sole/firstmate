/* Helden von Schwebfels - kleine Klangeffekte, live mit WebAudio erzeugt. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const A = (SB.audio = { enabled: true, ctx: null });
  let master = null;
  let noiseBuf = null;

  A.unlock = function () {
    if (A.ctx) {
      if (A.ctx.state === "suspended") A.ctx.resume().catch(() => {});
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      A.ctx = new Ctx();
      master = A.ctx.createGain();
      master.gain.value = 0.32;
      master.connect(A.ctx.destination);
      const len = A.ctx.sampleRate * 0.6;
      noiseBuf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      A.ctx = null;
    }
  };

  function tone(freq, dur, type, vol, delay, glideTo) {
    const c = A.ctx;
    const t = c.currentTime + (delay || 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.5, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, filterType, freq, delay, freqTo) {
    const c = A.ctx;
    const t = c.currentTime + (delay || 0);
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = filterType || "lowpass";
    f.frequency.setValueAtTime(freq || 1200, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol || 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(master);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  const FX = {
    click: () => tone(880, 0.05, "triangle", 0.25),
    coin: () => {
      tone(1320, 0.08, "triangle", 0.35);
      tone(1760, 0.18, "triangle", 0.35, 0.07);
    },
    hit: () => {
      noise(0.14, 0.6, "lowpass", 1400);
      tone(140, 0.12, "sine", 0.6, 0, 70);
    },
    crit: () => {
      noise(0.2, 0.8, "lowpass", 2200);
      tone(110, 0.2, "square", 0.35, 0, 55);
      tone(1500, 0.18, "triangle", 0.3, 0.03);
    },
    block: () => {
      tone(620, 0.12, "square", 0.25);
      tone(930, 0.16, "square", 0.18, 0.01);
      noise(0.08, 0.3, "highpass", 3000);
    },
    evade: () => noise(0.22, 0.35, "bandpass", 600, 0, 2400),
    swing: () => noise(0.16, 0.3, "bandpass", 900, 0, 300),
    bow: () => tone(320, 0.18, "triangle", 0.4, 0, 140),
    spell: () => {
      tone(420, 0.35, "sine", 0.35, 0, 1300);
      tone(630, 0.35, "sine", 0.2, 0.05, 1700);
    },
    special: () => [523, 659, 784].forEach((f, i) => tone(f, 0.22, "sawtooth", 0.18, i * 0.06)),
    ko: () => tone(200, 0.5, "sine", 0.5, 0, 50),
    levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, "triangle", 0.35, i * 0.1)),
    victory: () => {
      [392, 523, 659].forEach((f, i) => tone(f, 0.18, "square", 0.16, i * 0.12));
      tone(784, 0.5, "square", 0.18, 0.36);
    },
    defeat: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, "triangle", 0.3, i * 0.16)),
    well: () => {
      tone(1568, 0.3, "sine", 0.25);
      tone(2093, 0.5, "sine", 0.2, 0.12);
      noise(0.3, 0.2, "bandpass", 1800, 0.35);
    },
    buy: () => {
      tone(988, 0.07, "triangle", 0.3);
      tone(1319, 0.14, "triangle", 0.3, 0.06);
    },
  };

  A.play = function (name) {
    if (!A.enabled || !A.ctx || !FX[name]) return;
    try {
      FX[name]();
    } catch (e) {
      /* Ton ist optional */
    }
  };
})();
