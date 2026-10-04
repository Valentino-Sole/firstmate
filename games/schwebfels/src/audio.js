/* Helden von Schwebfels - Klangeffekte und Musik, live mit WebAudio erzeugt (keine fremden Aufnahmen).
   Musik je Ort: Insel bei Tag und bei Nacht, Taverne, Kampf, Tiefe (Dungeon), Heim, Chronik. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const A = (SB.audio = { enabled: true, musicOn: true, ctx: null, context: null });
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let reverb = null;
  let noiseBuf = null;

  function impulse(c, seconds, decay) {
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  A.unlock = function () {
    if (A.ctx) {
      if (A.ctx.state === "suspended") A.ctx.resume().catch(() => {});
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const c = (A.ctx = new Ctx());
      master = c.createGain();
      master.gain.value = 0.36;
      master.connect(c.destination);
      sfxBus = c.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(master);
      musicBus = c.createGain();
      musicBus.gain.value = 0;
      reverb = c.createConvolver();
      reverb.buffer = impulse(c, 3.2, 2.6);
      const wet = c.createGain();
      wet.gain.value = 0.45;
      musicBus.connect(master);
      musicBus.connect(reverb);
      reverb.connect(wet);
      wet.connect(master);
      const len = c.sampleRate * 1.0;
      noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      startScheduler();
      if (A.context) A.music(A.context, true);
    } catch (e) {
      A.ctx = null;
    }
  };

  /* ---------- Bausteine ---------- */
  const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function tone(freq, dur, type, vol, delay, glideTo, out, at) {
    const c = A.ctx;
    const t = at != null ? at : c.currentTime + (delay || 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.5, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out || sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, filterType, freq, delay, freqTo, out, at, q) {
    const c = A.ctx;
    const t = at != null ? at : c.currentTime + (delay || 0);
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = dur > 0.9;
    const f = c.createBiquadFilter();
    f.type = filterType || "lowpass";
    f.frequency.setValueAtTime(freq || 1200, t);
    if (q) f.Q.value = q;
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol || 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(out || sfxBus);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  /* ---------- Klangeffekte ---------- */
  const FX = {
    click: () => tone(880, 0.05, "triangle", 0.2),
    page: () => noise(0.18, 0.25, "bandpass", 2400, 0, 900),
    door: () => {
      tone(110, 0.3, "triangle", 0.35, 0, 80);
      noise(0.25, 0.25, "lowpass", 600);
    },
    coin: () => {
      tone(1320, 0.08, "triangle", 0.3);
      tone(1760, 0.2, "triangle", 0.3, 0.07);
    },
    hit: () => {
      noise(0.14, 0.6, "lowpass", 1400);
      tone(140, 0.12, "sine", 0.6, 0, 70);
    },
    crit: () => {
      noise(0.25, 0.8, "lowpass", 2400);
      tone(110, 0.25, "square", 0.3, 0, 50);
      tone(1500, 0.2, "triangle", 0.25, 0.03);
    },
    block: () => {
      tone(620, 0.14, "square", 0.2);
      tone(930, 0.2, "square", 0.15, 0.01);
      noise(0.08, 0.3, "highpass", 3000);
    },
    evade: () => noise(0.25, 0.35, "bandpass", 500, 0, 2600),
    swing: () => noise(0.18, 0.35, "bandpass", 1100, 0, 280),
    bow: () => {
      tone(320, 0.16, "triangle", 0.35, 0, 140);
      noise(0.2, 0.2, "bandpass", 3000, 0.05, 900);
    },
    spell: () => {
      tone(420, 0.4, "sine", 0.3, 0, 1300);
      tone(630, 0.4, "sine", 0.18, 0.05, 1700);
      noise(0.4, 0.15, "bandpass", 3000, 0, 6000);
    },
    special: () => {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, "sawtooth", 0.12, i * 0.06));
      noise(0.5, 0.2, "bandpass", 800, 0, 3000);
    },
    heal: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.5, "sine", 0.2, i * 0.07)),
    poison: () => {
      noise(0.3, 0.25, "bandpass", 400, 0, 1200, null, null, 6);
      tone(220, 0.3, "triangle", 0.15, 0.05, 160);
    },
    roar: () => {
      noise(0.7, 0.5, "lowpass", 500, 0, 150);
      tone(90, 0.7, "sawtooth", 0.25, 0, 55);
    },
    ko: () => {
      tone(200, 0.6, "sine", 0.5, 0, 45);
      noise(0.4, 0.3, "lowpass", 400);
    },
    levelup: () => {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.4, "triangle", 0.3, i * 0.09));
      noise(0.6, 0.1, "highpass", 6000, 0.3);
    },
    victory: () => {
      [392, 523, 659].forEach((f, i) => tone(f, 0.2, "square", 0.13, i * 0.12));
      tone(784, 0.7, "square", 0.15, 0.36);
      tone(392, 0.7, "triangle", 0.2, 0.36);
    },
    defeat: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, "triangle", 0.28, i * 0.18)),
    well: () => {
      tone(1568, 0.4, "sine", 0.22);
      tone(2093, 0.6, "sine", 0.18, 0.12);
      noise(0.35, 0.2, "bandpass", 1800, 0.35);
      tone(523, 0.9, "sine", 0.12, 0.4, 1046);
    },
    buy: () => {
      tone(988, 0.07, "triangle", 0.28);
      tone(1319, 0.16, "triangle", 0.28, 0.06);
    },
    anvil: () => {
      tone(1800, 0.5, "square", 0.08);
      tone(2700, 0.4, "sine", 0.12);
      noise(0.1, 0.4, "highpass", 2000);
    },
    horn: () => {
      tone(147, 1.2, "sawtooth", 0.18, 0, 150);
      tone(220, 1.0, "sawtooth", 0.12, 0.25);
    },
    chime: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.8, "sine", 0.14, i * 0.11)),
    quest: () => {
      tone(392, 0.25, "triangle", 0.25);
      tone(587, 0.4, "triangle", 0.25, 0.15);
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

  /* ---------- Musik ---------- */
  function pluck(n, t, dur, vol) {
    const c = A.ctx;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(700, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [type, det] of [["triangle", 0], ["sawtooth", 4]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = hz(n);
      o.detune.value = det;
      const og = c.createGain();
      og.gain.value = type === "sawtooth" ? 0.25 : 1;
      o.connect(og);
      og.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    f.connect(g);
    g.connect(musicBus);
  }
  function pad(notes, t, dur, vol, bright) {
    const c = A.ctx;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = bright || 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(vol * 0.8, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const n of notes)
      for (const det of [-7, 7]) {
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = hz(n);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
    f.connect(g);
    g.connect(musicBus);
  }
  function bell(n, t, vol) {
    for (const [m, v, d] of [[1, 1, 2.2], [2.76, 0.4, 1.2], [5.4, 0.15, 0.6]]) tone(hz(n) * m, d, "sine", vol * v, 0, null, musicBus, t);
  }
  function flute(n, t, dur, vol) {
    const c = A.ctx;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = hz(n);
    const lfo = c.createOscillator();
    lfo.frequency.value = 5;
    const lg = c.createGain();
    lg.gain.value = 4;
    lfo.connect(lg);
    lg.connect(o.detune);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.08);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(musicBus);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }
  function bass(n, t, dur, vol) {
    const c = A.ctx;
    const o = c.createOscillator();
    o.type = "square";
    o.frequency.value = hz(n);
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 380;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function drum(kind, t, vol) {
    if (kind === "kick") tone(130, 0.25, "sine", vol, 0, 42, musicBus, t);
    else if (kind === "tom") tone(190, 0.3, "sine", vol, 0, 90, musicBus, t);
    else if (kind === "frame") noise(0.18, vol, "bandpass", 220, 0, 120, musicBus, t, 2);
    else if (kind === "hat") noise(0.05, vol, "highpass", 7000, 0, null, musicBus, t);
    else if (kind === "boom") {
      tone(60, 2.2, "sine", vol, 0, 30, musicBus, t);
      noise(1.5, vol * 0.4, "lowpass", 200, 0, 60, musicBus, t);
    }
  }

  // Tonleitern und Akkorde als MIDI-Noten
  const SONGS = {
    tag: {
      bpm: 80, beats: 4,
      chords: [[50, 53, 57], [48, 52, 55], [46, 50, 53], [48, 52, 55]],
      scale: [62, 64, 65, 67, 69, 71, 72, 74, 76],
      bar(b, t, sp, r) {
        const ch = this.chords[b % 4];
        pad(ch.map((n) => n + 12), t, sp * 4.1, 0.035, 1100);
        bass(ch[0] - 12, t, sp * 3.5, 0.12);
        const arp = [0, 1, 2, 1, 0, 2, 1, 2];
        arp.forEach((k, i) => pluck(ch[k] + (i > 3 ? 24 : 12), t + i * sp * 0.5, sp * 1.2, 0.06));
        if (b % 2 === 1 || r() < 0.4) {
          let idx = Math.floor(r() * 5) + 2;
          for (let i = 0; i < 3; i++) {
            if (r() < 0.25) continue;
            idx = Math.max(0, Math.min(this.scale.length - 1, idx + Math.floor(r() * 3) - 1));
            flute(this.scale[idx] + 12, t + i * sp * 1.25, sp * 1.2, 0.045);
          }
        }
      },
    },
    nacht: {
      bpm: 56, beats: 4,
      chords: [[45, 52, 57], [41, 48, 53], [43, 50, 55], [40, 47, 52]],
      scale: [69, 72, 74, 76, 79, 81, 84],
      bar(b, t, sp, r) {
        const ch = this.chords[b % 4];
        pad(ch.map((n) => n + 12), t, sp * 4.2, 0.04, 700);
        bass(ch[0] - 12, t, sp * 4, 0.08);
        for (let i = 0; i < 4; i++) if (r() < 0.45) bell(this.scale[Math.floor(r() * this.scale.length)], t + i * sp + (r() < 0.5 ? sp * 0.5 : 0), 0.05);
      },
    },
    taverne: {
      bpm: 128, beats: 6,
      chords: [[55, 59, 62], [48, 52, 55], [50, 54, 57], [55, 59, 62]],
      scale: [67, 69, 71, 72, 74, 76, 78, 79],
      pos: 3,
      bar(b, t, sp, r) {
        const ch = this.chords[b % 4];
        bass(ch[0] - 12, t, sp * 1.5, 0.14);
        bass(ch[2] - 12, t + sp * 3, sp * 1.5, 0.12);
        for (const k of [1, 2, 4, 5]) pluck(ch[k % 3] + 12, t + k * sp, sp * 0.8, 0.045);
        drum("frame", t, 0.35);
        drum("frame", t + sp * 3, 0.28);
        drum("hat", t + sp * 2, 0.05);
        drum("hat", t + sp * 5, 0.05);
        for (let i = 0; i < 6; i++) {
          if (r() < 0.15) continue;
          this.pos = Math.max(0, Math.min(this.scale.length - 1, this.pos + Math.floor(r() * 3) - 1));
          pluck(this.scale[this.pos] + 12, t + i * sp, sp * 0.9, 0.05);
        }
      },
    },
    kampf: {
      bpm: 138, beats: 4,
      chords: [[40, 47, 52], [36, 43, 48], [38, 45, 50], [35, 42, 47]],
      riff: [0, 0, 3, 0, 5, 3, 2, 0],
      bar(b, t, sp, r) {
        const ch = this.chords[b % 4];
        this.riff.forEach((k, i) => bass(ch[0] + k, t + i * sp * 0.5, sp * 0.45, 0.13));
        drum("kick", t, 0.5);
        drum("kick", t + sp * 2, 0.5);
        drum("frame", t + sp, 0.3);
        drum("frame", t + sp * 3, 0.3);
        for (let i = 0; i < 8; i++) drum("hat", t + i * sp * 0.5, 0.04);
        if (b % 4 === 3) for (let i = 0; i < 4; i++) drum("tom", t + sp * 2 + i * sp * 0.5, 0.3);
        pad(ch.map((n) => n + 24), t, sp * 0.9, 0.05, 1600);
        if (b % 2 === 0) pad(ch.map((n) => n + 24), t + sp * 2.5, sp * 0.6, 0.04, 1600);
      },
    },
    tiefe: {
      bpm: 48, beats: 4,
      bar(b, t, sp, r) {
        pad([38, 45], t, sp * 4.2, 0.05, 260);
        if (b % 4 === 0) drum("boom", t, 0.35);
        if (r() < 0.6) {
          const n = [62, 63, 65, 68, 70][Math.floor(r() * 5)];
          bell(n, t + sp * (1 + Math.floor(r() * 3)), 0.035);
          if (r() < 0.4) bell(n + 1, t + sp * 3.2, 0.025);
        }
        noise(sp * 3, 0.02, "bandpass", 300, 0, 900, musicBus, t + sp, 3);
      },
    },
    heim: {
      bpm: 70, beats: 4,
      chords: [[53, 57, 60], [50, 53, 57], [46, 50, 53], [48, 52, 55]],
      bar(b, t, sp, r) {
        const ch = this.chords[b % 4];
        pad(ch.map((n) => n + 12), t, sp * 4.1, 0.03, 900);
        [0, 1, 2, 1].forEach((k, i) => pluck(ch[k] + 12, t + i * sp, sp * 1.6, 0.055));
        if (r() < 0.6) pluck(ch[Math.floor(r() * 3)] + 24, t + sp * 2.5, sp * 1.5, 0.04);
        for (let i = 0; i < 6; i++) if (r() < 0.5) noise(0.02, 0.03, "highpass", 3000, 0, null, musicBus, t + r() * sp * 4);
      },
    },
    chronik: {
      bpm: 60, beats: 4,
      chords: [[50, 57, 62], [46, 53, 58], [43, 50, 55], [45, 52, 57]],
      scale: [62, 65, 67, 69, 72, 74],
      bar(b, t, sp, r) {
        const ch = this.chords[b % 4];
        pad(ch, t, sp * 4.2, 0.045, 800);
        flute(this.scale[Math.floor(r() * this.scale.length)] + 12, t + sp, sp * 2.5, 0.04);
        if (r() < 0.5) bell(ch[2] + 12, t + sp * 3, 0.04);
      },
    },
  };
  A.SONGS = Object.keys(SONGS);

  let sched = null;
  let cur = null;
  let nextBar = 0;
  let barNo = 0;
  let rnd = Math.random;
  function startScheduler() {
    if (sched) return;
    sched = setInterval(() => {
      if (!A.ctx || !cur || !A.musicOn) return;
      const c = A.ctx;
      const song = SONGS[cur];
      const sp = 60 / song.bpm;
      while (nextBar < c.currentTime + 0.4) {
        if (nextBar < c.currentTime) nextBar = c.currentTime + 0.05;
        try {
          song.bar(barNo, nextBar, sp, rnd);
        } catch (e) {
          /* Musik ist optional */
        }
        barNo++;
        nextBar += sp * song.beats;
      }
    }, 120);
  }
  // Ort wechseln: blendet sanft ueber
  A.music = function (context, force) {
    if (context === A.context && !force && cur) return;
    A.context = context;
    if (!A.ctx || !musicBus) return;
    const c = A.ctx;
    const g = musicBus.gain;
    g.cancelScheduledValues(c.currentTime);
    g.setValueAtTime(g.value, c.currentTime);
    g.linearRampToValueAtTime(0.0001, c.currentTime + 0.6);
    setTimeout(() => {
      cur = A.musicOn && SONGS[context] ? context : null;
      barNo = 0;
      nextBar = c.currentTime + 0.1;
      if (cur) {
        g.cancelScheduledValues(c.currentTime);
        g.setValueAtTime(0.0001, c.currentTime);
        g.linearRampToValueAtTime(cur === "kampf" ? 0.75 : 0.85, c.currentTime + 1.5);
      }
    }, 650);
  };
  A.setMusic = function (on) {
    A.musicOn = !!on;
    if (!on) {
      cur = null;
      if (musicBus && A.ctx) musicBus.gain.setTargetAtTime(0.0001, A.ctx.currentTime, 0.2);
    } else if (A.context) A.music(A.context, true);
  };
  A.setSfx = function (on) {
    A.enabled = !!on;
  };
})();
