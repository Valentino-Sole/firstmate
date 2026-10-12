// Klang-Zwischenlösung: Das Designpaket liefert eine Klangregie
// (asset-vertrag.json "audio_brief"), aber keine Audiodateien.
// Diese kleinen WebAudio-Synthesen setzen die beschriebenen Hinweise um,
// bis echte Produktions-Audiodateien nachgereicht sind
// (docs/fehlende-produktionsmedien.md). Warnklänge sind nie der einzige
// Gefahrenhinweis; alles bleibt über die Lautstärke abschaltbar.

let ctx = null;
let volume = 0.6;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
}

function tone({ freq = 440, dur = 0.1, type = 'sine', gain = 0.2, delay = 0, slide = 0 }) {
  if (volume <= 0) return;
  try {
    const a = ac();
    const t0 = a.currentTime + delay;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * volume, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    // Audio ist optional; Fehler hier dürfen das Spiel nie stören.
  }
}

export const sfx = {
  // "Leises trockenes Messing-Tick"
  uiFocus() { tone({ freq: 2200, dur: 0.03, type: 'square', gain: 0.05 }); },
  // "Kurzer warmer Siegel-Plopp"
  uiConfirm() { tone({ freq: 320, dur: 0.09, type: 'sine', gain: 0.18, slide: -140 }); },
  // "Drei aufsteigende weiche Glockentöne, unter 1 s"
  levelUp() {
    tone({ freq: 523, dur: 0.18, type: 'sine', gain: 0.16 });
    tone({ freq: 659, dur: 0.18, type: 'sine', gain: 0.16, delay: 0.16 });
    tone({ freq: 784, dur: 0.24, type: 'sine', gain: 0.16, delay: 0.32 });
  },
  // "Pro Angriffsgrundform kurzer unterschiedlicher Anlaut"
  warning(archetype) {
    const base = 180 + (hashCode(archetype) % 7) * 40;
    tone({ freq: base, dur: 0.07, type: 'triangle', gain: 0.07 });
  },
  // "Gedämpfter Keramikklack und Wachsstoß"
  heroHit() { tone({ freq: 140, dur: 0.1, type: 'square', gain: 0.2, slide: -60 }); },
  enemyHit() { tone({ freq: 500, dur: 0.035, type: 'triangle', gain: 0.06 }); },
  enemyDeath() { tone({ freq: 260, dur: 0.1, type: 'triangle', gain: 0.1, slide: -120 }); },
  pickup() { tone({ freq: 1300, dur: 0.04, type: 'sine', gain: 0.05 }); },
  buy() { tone({ freq: 420, dur: 0.1, type: 'sine', gain: 0.16, slide: 80 }); },
  // "Tiefer Materialbruch plus kurze Ruhe"
  bossTransition() { tone({ freq: 80, dur: 0.5, type: 'sawtooth', gain: 0.2, slide: -30 }); },
  dodge() { tone({ freq: 900, dur: 0.05, type: 'sine', gain: 0.07, slide: 300 }); },
  waveClear() {
    tone({ freq: 440, dur: 0.12, type: 'sine', gain: 0.12 });
    tone({ freq: 587, dur: 0.16, type: 'sine', gain: 0.12, delay: 0.1 });
  },
};

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
