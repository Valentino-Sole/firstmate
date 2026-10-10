/* Helden von Schwebfels - Klangeffekte und Musik per WebAudio: Musik live erzeugt, Kampfklaenge, Stimmen und die Lieder
   nach dem Kampf aus freien Aufnahmen (CC0, Klangbank unten), ohne Klangbank erzeugte Ersatzklaenge.
   Musik je Ort: Insel bei Tag und bei Nacht, Taverne, Kampf, Tiefe (Dungeon), Heim, Chronik.
   Jedes Reich klingt anders: Albion hoefisch (Laute, Schalmei, Trommel im Dreiertakt),
   Midgard duester nordisch (Bordun, Fidel, Kriegstrommeln, Horn, tiefer Chor),
   Hibernia keltisch (Harfe, Flöte mit Verzierungen, Rahmentrommel im Jig). */
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
      setTimeout(loadBank, 50);
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

  /* ---------- Klangbank: freie Aufnahmen (CC0, assets-src/klang/QUELLEN.md) ---------- */
  // Das Paket (globalThis.SB_KLANG, Base64, aus klang.js) wird nach dem ersten Antippen im Hintergrund geladen und dekodiert. Bis dahin und
  // ohne Paket klingen die erzeugten Effekte oben.
  const BANK = {};
  let bankState = "aus";
  function unpack(s) {
    const bin = atob(s);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const dv = new DataView(u8.buffer);
    const hl = dv.getUint32(4, true);
    const head = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + hl)));
    let base = 8 + hl;
    base += (4 - (base % 4)) % 4;
    const out = {};
    for (const k in head.klang) out[k] = head.klang[k].map((r) => u8.slice(base + r.$[1], base + r.$[1] + r.$[2]).buffer);
    return out;
  }
  // Die Klangbank liegt als klang.js neben der Seite (build.mjs); fehlt sie, bleibt es bei den erzeugten Effekten
  // und nach einer Minute wird es erneut versucht
  function fetchBank() {
    bankState = "laden";
    const el = document.createElement("script");
    el.src = "klang.js";
    el.onload = () => {
      bankState = "aus";
      if (globalThis.SB_KLANG) loadBank();
      else bankState = "fehler";
    };
    el.onerror = () => {
      el.remove();
      bankState = "fehler";
      setTimeout(() => bankState === "fehler" && (bankState = "aus"), 60000);
    };
    document.head.appendChild(el);
  }
  function loadBank() {
    if (bankState !== "aus" || !A.ctx) return;
    if (!globalThis.SB_KLANG) return fetchBank();
    bankState = "laden";
    let raw;
    try {
      raw = unpack(globalThis.SB_KLANG);
    } catch (e) {
      bankState = "fehler";
      return;
    }
    globalThis.SB_KLANG = null;
    const jobs = [];
    for (const k in raw) {
      BANK[k] = [];
      raw[k].forEach((buf, i) =>
        jobs.push(
          new Promise((ok) => A.ctx.decodeAudioData(buf, (b) => ok((BANK[k][i] = b)), () => ok(null)))
        )
      );
    }
    Promise.all(jobs).then(() => (bankState = "bereit"));
  }
  A.bankReady = () => bankState === "bereit";
  A.bankStats = () => Object.fromEntries(Object.entries(BANK).map(([k, v]) => [k, v.filter(Boolean).length + "/" + v.length]));
  A.bankNames = () => Object.keys(BANK);

  // Eine Variante abspielen: nie zweimal hintereinander dieselbe, Tonhoehe und Lautstaerke leicht gestreut,
  // links oder rechts je nach Seite im Kampf
  const LAST = {};
  let voices = 0;
  function sample(name, o) {
    const arr = BANK[name];
    if (!arr || !A.ctx) return false;
    const ok = arr.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
    if (!ok.length) return false;
    o = o || {};
    let i = ok[Math.floor(Math.random() * ok.length)];
    if (ok.length > 1 && i === LAST[name]) i = ok[(ok.indexOf(i) + 1) % ok.length];
    LAST[name] = i;
    if (A.onSample) A.onSample(name, i);
    const c = A.ctx;
    const t = c.currentTime + (o.delay || 0);
    const s = c.createBufferSource();
    s.buffer = arr[i];
    const vary = o.vary != null ? o.vary : 0.05;
    s.playbackRate.value = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * vary);
    const g = c.createGain();
    g.gain.value = (o.gain != null ? o.gain : 0.7) * (1 + (Math.random() * 2 - 1) * 0.12);
    s.connect(g);
    let end = g;
    if (o.pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = o.pan;
      g.connect(p);
      end = p;
    }
    end.connect(sfxBus);
    s.start(t);
    if (o.voice) {
      voices++;
      s.onended = () => voices--;
    }
    return true;
  }

  /* ---------- Lieder nach dem Kampf ---------- */
  // Sieg und Niederlage: kurzes Lied aus der Klangbank (lied.sieg.*, lied.niederlage.*), die Musik tritt so lange
  // zurueck. Wahl (Klangprobe, S.settings.liedSieg/liedNiederlage): "auto" spielt bei grossen Siegen (Chronik,
  // Verlies, Arena, seltene Auftraege, Bosse) die Fanfare, sonst das mittelalterliche Lied; sonst fest "fest",
  // "fanfare" oder "tragisch"
  let liedSrc = null;
  let duckUntil = 0;
  const musicLevel = () => (cur ? (cur.indexOf("kampf") === 0 ? 0.75 : 0.85) : 0.0001);
  A.liedName = function (kind, o) {
    o = o || {};
    let w = o.wahl || (kind === "sieg" ? "auto" : "fest");
    if (w === "auto") w = kind === "sieg" && o.big ? "fanfare" : "fest";
    return BANK["lied." + kind + "." + w] ? "lied." + kind + "." + w : "lied." + kind + ".fest";
  };
  function lied(kind, o) {
    o = o || {};
    const name = A.liedName(kind, o);
    const buf = BANK[name] && BANK[name][0];
    if (!buf) return false;
    const c = A.ctx;
    if (liedSrc) {
      try {
        liedSrc.stop();
      } catch (e) {
        /* schon zu Ende */
      }
    }
    if (A.onSample) A.onSample(name, 0);
    const s = c.createBufferSource();
    s.buffer = buf;
    const g = c.createGain();
    g.gain.value = o.gain != null ? o.gain : 0.8;
    s.connect(g);
    g.connect(sfxBus);
    const t = c.currentTime + 0.05;
    s.start(t);
    liedSrc = s;
    s.onended = () => {
      if (liedSrc === s) liedSrc = null;
    };
    // Musik ausblenden und nach dem Lied wieder einblenden (A.music wartet beim Ortswechsel ebenfalls bis dahin)
    duckUntil = t + buf.duration;
    const mg = musicBus.gain;
    mg.cancelScheduledValues(c.currentTime);
    mg.setValueAtTime(mg.value, c.currentTime);
    mg.linearRampToValueAtTime(0.0001, c.currentTime + 0.25);
    mg.setValueAtTime(0.0001, duckUntil);
    mg.linearRampToValueAtTime(musicLevel(), duckUntil + 1.5);
    return true;
  }
  A.lied = function (kind, o) {
    if (!A.ctx) A.unlock();
    if (!A.ctx) return false;
    if (bankState === "aus") loadBank();
    return bankState === "bereit" && lied(kind, o);
  };

  /* ---------- Was im Kampf wie klingt ---------- */
  // Waffe des Helden: Schwungart und Trefferart
  const WAFFE = { dolch: "leicht", kurzschwert: "leicht", sichel: "leicht", wurfmesser: "leicht", schwert: "klinge", axt: "axt", hammer: "wucht", speer: "stoss", stab: "wucht", zepter: "wucht", runenstab: "wucht" };
  const SCHWUNG = { leicht: "leicht", klinge: "klinge", axt: "schwer", wucht: "schwer", stoss: "stoss", faust: "leicht", biss: "klaue", klaue: "klaue", zange: "klaue", geist: "schwer" };
  const SCHLAG = { leicht: "klinge", klinge: "klinge", axt: "axt", wucht: "wucht", stoss: "spitze", faust: "faust", biss: "biss", klaue: "klinge", zange: "zange", geist: "geist" };
  // Gegnertypen: Angriffsart und Material, aus dem sie sind
  const GEGNER = {
    wolf: ["biss", "fell"], drache: ["klaue", "schuppen"], troll: ["wucht", "fleisch"], golem: ["wucht", "stein"], schemen: ["geist", "geist"],
    ghul: ["klaue", "knochen"], spinne: ["biss", "panzer"], pilz: ["wucht", "schleim"], baum: ["wucht", "holz"], krebs: ["zange", "panzer"],
    fledermaus: ["biss", "fell"], goblin: ["klinge", "leder"], kultist: ["klinge", "stoff"], todesritter: ["klinge", "metall"], schlund: ["biss", "schleim"],
    krieger: ["klinge", "metall"], schurke: ["leicht", "leder"], magier: ["wucht", "stoff"], jaeger: ["klinge", "leder"],
  };
  const RUESTUNG = { harnisch: "metall", schattenwams: "leder", wams: "leder", robe: "stoff" };
  const SCHULE = { lichtweber: "licht", runenwirker: "frost", dornenrufer: "dorn" };
  // Stimmlage je Volk: Satz der Frauenstimme und Tonhoehe (Trollblut tiefer, Sidhe und Moorling heller)
  const VOLK = {
    albier: ["w2", 1.0], kreidezwerg: ["w3", 0.9], nordmann: ["w2", 0.96], trollblut: ["w3", 0.88],
    sidhe: ["w1", 1.07], moorling: ["w1", 1.15], frostwicht: ["w1", 1.1], glutzwerg: ["w3", 0.88],
  };
  const isMon = (d) => d && d.kind === "monster";
  function attackOf(d) {
    if (!d) return "faust";
    if (isMon(d)) return (GEGNER[d.arch] || GEGNER.ghul)[0];
    const w = d.gear && d.gear.waffe;
    return (w && WAFFE[w.base]) || "faust";
  }
  function materialOf(d) {
    if (!d) return "fleisch";
    if (isMon(d)) return (GEGNER[d.arch] || GEGNER.ghul)[1];
    const r = d.gear && d.gear.ruestung;
    return (r && RUESTUNG[r.base]) || "fleisch";
  }
  function hueOf(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return -1;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const mx = Math.max(r, g, b);
    const d = mx - Math.min(r, g, b);
    if (d < 0.08) return -1;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }
  // Zauberarten der Kampfbuehne (SPELL_FX in r3d-scenes.js) und Drachenatem je Element
  const ZAUBER = {
    arcane: "licht", lights: "licht", rune: "frost", thorns: "dorn", mist: "dorn",
    spores: "gift", sporerain: "gift", glob: "gift",
    void: "dunkel", blood: "dunkel", hex: "dunkel", wisp: "dunkel", tendril: "dunkel",
  };
  const ATEM = { fire: "feuer", storm: "blitz", ice: "frost", acid: "gift", shadow: "dunkel" };
  function schoolOf(d, sp) {
    if (sp && sp.kind === "breath" && ATEM[sp.el]) return ATEM[sp.el];
    if (sp && ZAUBER[sp.kind]) return ZAUBER[sp.kind];
    if (!d) return "licht";
    if (!isMon(d)) return SCHULE[d.cls] || "licht";
    if (d.arch === "pilz") return "gift";
    if (d.arch === "drache") {
      const h = hueOf(d.accent || d.color);
      return h < 0 ? "feuer" : h < 45 || h >= 330 ? "feuer" : h < 75 ? "blitz" : h < 165 ? "gift" : h < 265 ? "frost" : "dunkel";
    }
    return "dunkel";
  }
  function voiceOf(d) {
    // [Klangsatz, Tonhoehe, Lautstaerke]
    if (!d) return null;
    const boss = d.final ? 0.8 : d.boss ? 0.88 : 1;
    if (isMon(d)) {
      if (BANK["stimme." + d.arch + ".angriff"]) return ["stimme." + d.arch, boss, d.boss ? 0.95 : 0.8];
      return ["held.m", boss, 0.7];
    }
    const v = VOLK[d.race] || VOLK.albier;
    if (d.gender === "w") return ["held." + v[0], v[1], 0.6];
    return [d.race === "trollblut" ? "held.gross" : "held.m", d.race === "trollblut" ? 1.0 : v[1], 0.6];
  }
  const pan = (side) => (side ? Math.max(-0.5, Math.min(0.5, side * 0.35)) : 0);
  const lastVoice = {};
  let quiet = false;
  function sayVoice(d, kind, side, chance, force) {
    if (quiet) return false;
    const v = voiceOf(d);
    if (!v || (!force && chance != null && Math.random() > chance)) return false;
    const key = String(side || 0);
    const now = A.ctx.currentTime;
    if (!force && kind !== "tod" && kind !== "auftritt" && (lastVoice[key] > now - 0.7 || voices > 2)) return false;
    let name = v[0] + "." + kind;
    if (!BANK[name]) name = kind === "tod" || kind === "auftritt" ? v[0] + (kind === "tod" ? ".schmerz" : ".angriff") : null;
    if (!name || !BANK[name]) return false;
    lastVoice[key] = now;
    const slow = kind === "tod" && !isMon(d) ? 0.9 : 1;
    return sample(name, { rate: v[1] * slow, gain: v[2] * (kind === "auftritt" ? 1.15 : 1), pan: pan(side), voice: true, vary: 0.04 });
  }

  // Kampfereignis mit Zusammenhang: a = Angreifer, d = Getroffener (Beschreibungen wie in R.buildFighter), side -1/1
  const KAMPF = {
    swing(c) {
      const at = attackOf(c.a);
      sample("schwung." + (SCHWUNG[at] || "klinge"), { gain: 0.5, pan: pan(c.side) });
      sayVoice(c.a, "angriff", c.side, isMon(c.a) ? (c.a.arch === "drache" ? 0.85 : 0.55) : 0.35);
    },
    hit(c, crit) {
      const how = c.how || "nah";
      const mat = materialOf(c.d);
      const p = pan(c.side);
      if (how === "magie") sample("magie." + schoolOf(c.a, c.spell) + ".treffer", { gain: 0.65, pan: p }) || sample("magie.licht.treffer", { gain: 0.6, pan: p });
      else sample("schlag." + (how === "pfeil" || how === "speer" ? "spitze" : SCHLAG[attackOf(c.a)] || "faust"), { gain: 0.7, pan: p });
      sample("mat." + mat, { gain: how === "magie" ? 0.35 : 0.6, pan: p });
      if (crit) sample("krit", { gain: 0.75, pan: p });
      sayVoice(c.d, "schmerz", c.side, crit ? 1 : 0.3);
    },
    block(c) {
      const sh = c.d && !isMon(c.d) && c.d.gear && c.d.gear.nebenhand && c.d.gear.nebenhand.base === "schild";
      const m = materialOf(c.d);
      sample(sh ? "block.schild" : m === "metall" || m === "stein" ? "block.metall" : attackOf(c.d) === "klinge" || attackOf(c.d) === "leicht" ? "block.waffe" : "block.schild", { gain: 0.75, pan: pan(c.side) });
    },
    evade(c) {
      sample("ausweichen", { gain: 0.5, pan: pan(c.side) });
    },
    shoot(c) {
      const wb = c.a && c.a.gear && c.a.gear.waffe && c.a.gear.waffe.base;
      if (wb === "armbrust") sample("armbrust.schuss", { gain: 0.7, pan: pan(c.side) });
      else if (wb === "speer") sample("schwung.stoss", { gain: 0.6, pan: pan(c.side), rate: 0.85 });
      else sample("bogen.schuss", { gain: 0.7, pan: pan(c.side) });
      sample("pfeil.flug", { gain: 0.35, pan: 0, delay: 0.08 });
    },
    cast(c) {
      const sc = schoolOf(c.a, c.spell);
      if ((c.spell && c.spell.kind === "rune") || (!isMon(c.a) && c.a && c.a.cls === "runenwirker")) sample("magie.runen.wirken", { gain: 0.4, pan: pan(c.side) });
      sample("magie." + sc + ".wirken", { gain: 0.6, pan: pan(c.side) }) || sample("magie.licht.wirken", { gain: 0.55, pan: pan(c.side) });
      sayVoice(c.a, "angriff", c.side, isMon(c.a) ? (c.a.arch === "drache" ? 0.9 : 0.6) : 0.25);
    },
    special(c) {
      const p = pan(c.side);
      const k = c.kind;
      if (k === "shock") {
        sample("mat.stein", { gain: 0.8, pan: p, rate: 0.8 });
        sample("krit", { gain: 0.7, pan: p, delay: 0.05 });
      } else if (k === "slash") {
        sample("schwung.leicht", { gain: 0.55, pan: p });
        sample("schwung.klinge", { gain: 0.5, pan: p, delay: 0.12 });
      } else if (k === "arrows") {
        for (let i = 0; i < 4; i++) sample("bogen.schuss", { gain: 0.45, pan: p, delay: i * 0.11 });
      } else if (k === "beam") sample("magie.licht.wirken", { gain: 0.7, pan: p, rate: 0.8 });
      else if (k === "roots") sample("magie.dorn.wirken", { gain: 0.7, pan: p, rate: 0.85 });
      else if (k === "smoke") sample("magie.teleport", { gain: 0.6, pan: p });
      else if (k === "orbs") sample("magie." + (c.sp === "fluch" ? "dunkel" : "frost") + ".wirken", { gain: 0.65, pan: p });
      else if (k === "arrow") sample(c.sp === "frostpfeil" ? "magie.frost.wirken" : "magie.licht.wirken", { gain: 0.5, pan: p });
      else if (k === "aura") sample("magie.dunkel.wirken", { gain: 0.55, pan: p, rate: 0.9 });
      sayVoice(c.a, "angriff", c.side, 1);
    },
    talent(c) {
      const id = c.id;
      const p = pan(c.side);
      if (id === "secondWind") sample("magie.heilung", { gain: 0.6, pan: p });
      else if (id === "ward") sample("magie.barriere", { gain: 0.6, pan: p });
      else if (id === "vanish") sample("magie.teleport", { gain: 0.6, pan: p });
      else if (id === "purge") sample("magie.reinigung", { gain: 0.6, pan: p });
      else return false;
      return true;
    },
    heal(c) {
      sample("magie.heilung", { gain: 0.55, pan: pan(c.side) });
      if (c.a && !isMon(c.a) && c.a.gender === "w") sayVoice(c.a, "heilung", c.side, 0.5);
    },
    poison(c) {
      sample("magie.gift.treffer", { gain: 0.45, pan: pan(c.side) });
    },
    ko(c) {
      sayVoice(c.d, "tod", c.side);
    },
    auftritt(c) {
      sayVoice(c.a, "auftritt", c.side);
    },
    schritt(c) {
      sample("schritt." + (c.surface || "gras"), { gain: 0.35, pan: pan(c.side), vary: 0.08 });
    },
  };
  // alte Effektnamen ohne Zusammenhang (Bedienung, Insel) auf passende Aufnahmen legen
  const PLAIN = { click: "ui.klick", page: "ui.seite", coin: "ui.muenzen", buy: "ui.kaufen", door: "ui.tuer", anvil: "ui.amboss", well: "ui.brunnen", heal: "magie.heilung", poison: "magie.gift.treffer", evade: "ausweichen", block: "block.schild", swing: "schwung.klinge", bow: "bogen.schuss", spell: "magie.licht.wirken", crit: "krit", hit: "mat.fleisch" };
  const PLAIN_GAIN = { click: 0.45, page: 0.5, coin: 0.55, buy: 0.6, door: 0.55, anvil: 0.6, well: 0.6 };

  A.play = function (name, c) {
    if (!A.enabled || !A.ctx) return;
    try {
      if (bankState === "bereit") {
        if ((name === "victory" || name === "defeat") && lied(name === "victory" ? "sieg" : "niederlage", c)) return;
        if (c) {
          const k = { hit: "hit", crit: "hit", block: "block", evade: "evade", swing: "swing", bow: "shoot", spell: "cast", special: "special", talent: "talent", chime: "talent", heal: "heal", poison: "poison", ko: "ko", auftritt: "auftritt", schritt: "schritt" }[name];
          if (k && KAMPF[k]) {
            quiet = !!c.quiet;
            const r = KAMPF[k](c, name === "crit");
            quiet = false;
            if (r !== false) return;
          }
        }
        if (PLAIN[name] && sample(PLAIN[name], { gain: PLAIN_GAIN[name] || 0.6 })) {
          if (name === "anvil" || name === "well") FX[name]();
          return;
        }
      }
      if (FX[name]) FX[name]();
    } catch (e) {
      /* Ton ist optional */
      if (A.debug) console.warn("Klang", name, e);
    }
  };
  // Klangprobe: einen Eintrag der Bank direkt oder ein Kampfereignis mit Beispielbeschreibung abspielen
  A.probe = function (name, opts) {
    if (!A.ctx) A.unlock();
    if (!A.ctx) return false;
    if (bankState === "aus") loadBank();
    return sample(name, Object.assign({ gain: 0.7 }, opts || {}));
  };
  // Stimme eines Volkes oder Gegners ohne Zufall und Pause (fuer die Klangprobe)
  A.voiceProbe = function (d, kind) {
    if (!A.ctx) A.unlock();
    if (bankState === "aus") loadBank();
    return bankState === "bereit" && sayVoice(d, kind, 0, 1, true);
  };
  A.probeOld = function (name) {
    if (!A.ctx) A.unlock();
    if (A.ctx && FX[name]) FX[name]();
  };
  A.event = function (name, c) {
    if (!A.ctx) A.unlock();
    if (bankState === "aus") loadBank();
    A.play(name, c);
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

  // Weitere Instrumente fuer die Reichsmusik
  function vib(o, t, dur, rate, depth) {
    const c = A.ctx;
    const lfo = c.createOscillator();
    lfo.frequency.value = rate;
    const lg = c.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(depth, t + Math.min(0.3, dur * 0.5));
    lfo.connect(lg);
    lg.connect(o.detune);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  function voice(n, t, dur, vol, o) {
    // gemeinsamer Baustein: Oszillator, Filter, Huellkurve
    const c = A.ctx;
    const osc = c.createOscillator();
    osc.type = o.type || "sawtooth";
    osc.frequency.value = hz(n);
    if (o.vib) vib(osc, t, dur, o.vib[0], o.vib[1]);
    const f = c.createBiquadFilter();
    f.type = o.filter || "lowpass";
    f.frequency.value = o.freq || 1500;
    if (o.q) f.Q.value = o.q;
    const g = c.createGain();
    const at = o.attack || 0.02;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + at);
    g.gain.setValueAtTime(vol, t + Math.max(at, dur * (o.hold || 0.7)));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(f);
    f.connect(g);
    g.connect(musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  const shawm = (n, t, dur, vol) => voice(n, t, dur, vol, { type: "sawtooth", filter: "bandpass", freq: hz(n) * 2.2, q: 1.4, attack: 0.04, vib: [5.5, 8] });
  const fiddle = (n, t, dur, vol) => {
    voice(n, t, dur, vol, { type: "sawtooth", freq: 1900, attack: 0.14, hold: 0.6, vib: [5, 14] });
    voice(n, t, dur, vol * 0.4, { type: "sawtooth", freq: 900, attack: 0.2, hold: 0.6 });
  };
  const horn = (n, t, dur, vol) => voice(n, t, dur, vol, { type: "sawtooth", freq: 650, attack: 0.25, hold: 0.75, vib: [4, 5] });
  const choir = (n, t, dur, vol) => {
    voice(n, t, dur, vol, { type: "sawtooth", filter: "bandpass", freq: 520, q: 5, attack: 0.5, hold: 0.6 });
    voice(n, t, dur, vol * 0.7, { type: "sawtooth", filter: "bandpass", freq: 880, q: 5, attack: 0.6, hold: 0.6 });
  };
  function harp(n, t, dur, vol) {
    const c = A.ctx;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [type, mul, v] of [["triangle", 1, 1], ["sine", 2, 0.35]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = hz(n) * mul;
      const og = c.createGain();
      og.gain.value = v;
      o.connect(og);
      og.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    f.connect(g);
    g.connect(musicBus);
  }
  function whistle(n, t, dur, vol, orn) {
    // Blechfloete: Verzierung (kurzer Vorschlag) und etwas Atem
    if (orn) {
      voice(n + 2, t, 0.07, vol * 0.8, { type: "sine", freq: 6000, attack: 0.01, hold: 0.5 });
      t += 0.06;
      dur -= 0.06;
    }
    voice(n, t, dur, vol, { type: "sine", freq: 6000, attack: 0.03, hold: 0.75, vib: [6, 10] });
    noise(Math.min(0.3, dur), vol * 0.25, "bandpass", hz(n), 0, null, musicBus, t, 8);
  }
  function clap(t, vol) {
    noise(0.07, vol, "bandpass", 1600, 0, null, musicBus, t, 1.2);
    noise(0.05, vol * 0.6, "bandpass", 1300, 0, null, musicBus, t + 0.012, 1.2);
  }
  function snare(t, vol) {
    noise(0.12, vol, "highpass", 1800, 0, null, musicBus, t);
    tone(220, 0.08, "triangle", vol * 0.5, 0, 160, musicBus, t);
  }
  // Melodie schrittweise durch eine Tonleiter fuehren
  function walk(song, r, span) {
    song.pos = Math.max(0, Math.min(song.scale.length - 1, (song.pos == null ? 3 : song.pos) + Math.floor(r() * (span || 3)) - Math.floor((span || 3) / 2)));
    return song.scale[song.pos];
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

  /* ---------- Albion: hoefisch, Dur und Mixolydisch, Dreiertakt ---------- */
  SONGS["tag:albion"] = {
    bpm: 96, beats: 3,
    chords: [[50, 54, 57], [48, 52, 55], [43, 47, 50], [45, 49, 52], [50, 54, 57], [48, 52, 55], [43, 47, 50], [50, 54, 57]],
    scale: [62, 64, 66, 67, 69, 71, 72, 74, 76],
    bar(b, t, sp, r) {
      const ch = this.chords[b % 8];
      bass(ch[0] - 12, t, sp * 2.6, 0.11);
      [0, 2, 1].forEach((k, i) => pluck(ch[k] + 12, t + i * sp, sp * 1.1, 0.055));
      pluck(ch[2] + 24, t + sp * 1.5, sp * 0.8, 0.035);
      drum("frame", t, 0.28);
      drum("hat", t + sp * 2, 0.04);
      if (b % 8 < 6) {
        shawm(walk(this, r) + 12, t, sp * 1.4, 0.035);
        shawm(walk(this, r) + 12, t + sp * 1.5, sp * 1.4, 0.035);
      } else shawm(ch[0] + 24, t, sp * 2.8, 0.035);
    },
  };
  SONGS["nacht:albion"] = {
    bpm: 58, beats: 4,
    chords: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 48, 52]],
    scale: [62, 64, 65, 67, 69, 70, 72, 74],
    bar(b, t, sp, r) {
      const ch = this.chords[b % 4];
      pad(ch.map((n) => n + 12), t, sp * 4.2, 0.03, 650);
      bass(ch[0] - 12, t, sp * 4, 0.07);
      [0, 1, 2, 1].forEach((k, i) => pluck(ch[k] + 12, t + i * sp, sp * 2, 0.045));
      if (r() < 0.7) flute(walk(this, r) + 12, t + sp, sp * 2.4, 0.035);
      if (b % 4 === 3) bell(ch[2] + 24, t + sp * 3, 0.03);
    },
  };
  SONGS["kampf:albion"] = {
    bpm: 132, beats: 4,
    chords: [[38, 45, 50], [34, 41, 46], [36, 43, 48], [33, 40, 45]],
    bar(b, t, sp, r) {
      const ch = this.chords[b % 4];
      for (let i = 0; i < 4; i++) bass(ch[0] + (i === 2 ? 7 : 0), t + i * sp, sp * 0.8, 0.13);
      drum("kick", t, 0.45);
      drum("tom", t + sp * 2, 0.35);
      snare(t + sp, 0.18);
      snare(t + sp * 3, 0.18);
      snare(t + sp * 3.5, 0.1);
      // Fanfare der Ritter
      if (b % 2 === 0) [0, 1, 2].forEach((k, i) => shawm(ch[k] + 24, t + i * sp * 0.5, sp * 0.5, 0.05));
      else shawm(ch[2] + 24, t, sp * 2, 0.05);
      pad(ch.map((n) => n + 24), t, sp * 3.9, 0.025, 1400);
    },
  };

  /* ---------- Midgard: duester, Bordun, Aeolisch, schwere Trommeln ---------- */
  SONGS["tag:midgard"] = {
    bpm: 66, beats: 4,
    chords: [[38, 45], [38, 45], [36, 43], [41, 48]],
    scale: [62, 64, 65, 67, 69, 70, 72, 74],
    bar(b, t, sp, r) {
      const ch = this.chords[b % 4];
      pad(ch, t, sp * 4.2, 0.05, 420);
      drum("boom", t, 0.22);
      drum("tom", t + sp * 2, 0.22);
      if (b % 2 === 1) drum("tom", t + sp * 3.5, 0.15);
      fiddle(walk(this, r) , t, sp * 1.9, 0.04);
      fiddle(walk(this, r), t + sp * 2, sp * 1.9, 0.04);
      if (b % 8 === 7) {
        horn(45, t, sp * 1.5, 0.06);
        horn(50, t + sp * 1.5, sp * 2.5, 0.06);
      }
    },
  };
  SONGS["nacht:midgard"] = {
    bpm: 48, beats: 4,
    chords: [[38, 45], [36, 43], [34, 41], [33, 40]],
    scale: [57, 60, 62, 64, 65, 67, 69],
    bar(b, t, sp, r) {
      const ch = this.chords[b % 4];
      pad(ch, t, sp * 4.3, 0.045, 300);
      choir(ch[1] + 12, t, sp * 4, 0.035);
      noise(sp * 4, 0.03, "bandpass", 500, 0, 1600, musicBus, t, 2);
      if (r() < 0.6) fiddle(this.scale[Math.floor(r() * this.scale.length)] + 12, t + sp, sp * 2.6, 0.03);
      if (b % 4 === 0) drum("boom", t, 0.2);
    },
  };
  SONGS["taverne:midgard"] = {
    bpm: 112, beats: 4,
    chords: [[50, 57], [48, 55], [46, 53], [45, 52]],
    scale: [62, 64, 65, 67, 69, 71, 72, 74],
    bar(b, t, sp, r) {
      const ch = this.chords[b % 4];
      pad(ch, t, sp * 4.1, 0.035, 600);
      for (let i = 0; i < 4; i++) drum("kick", t + i * sp, 0.4);
      clap(t + sp, 0.22);
      clap(t + sp * 3, 0.22);
      for (let i = 0; i < 4; i++) fiddle(walk(this, r) + 12, t + i * sp, sp * 0.95, 0.035);
      if (b % 4 === 3) horn(ch[0], t + sp * 2, sp * 2, 0.05);
    },
  };
  SONGS["kampf:midgard"] = {
    bpm: 120, beats: 4,
    chords: [[38, 45, 50], [36, 43, 48], [34, 41, 46], [33, 40, 45]],
    bar(b, t, sp, r) {
      const ch = this.chords[b % 4];
      drum("boom", t, 0.3);
      for (let i = 0; i < 8; i++) drum(i % 2 ? "tom" : "kick", t + i * sp * 0.5, i % 4 === 0 ? 0.45 : 0.25);
      for (let i = 0; i < 4; i++) bass(ch[0], t + i * sp, sp * 0.9, 0.12);
      horn(ch[1], t, sp * 3.8, 0.05);
      horn(ch[2], t, sp * 3.8, 0.04);
      if (b % 2 === 1) {
        clap(t + sp * 3, 0.3);
        noise(0.18, 0.12, "bandpass", 700, 0, 400, musicBus, t + sp * 3, 3);
      }
      if (b % 4 === 3) choir(ch[2] + 12, t, sp * 4, 0.04);
    },
  };

  /* ---------- Hibernia: keltisch, Dorisch, Jig im Sechsachteltakt ---------- */
  SONGS["tag:hibernia"] = {
    bpm: 120, beats: 6,
    chords: [[50, 54, 57], [48, 52, 55], [50, 54, 57], [45, 49, 52]],
    scale: [62, 64, 66, 67, 69, 71, 72, 74, 76],
    bar(b, t, sp, r) {
      const ch = this.chords[b % 4];
      bass(ch[0] - 12, t, sp * 2.8, 0.09);
      bass(ch[0] - 12, t + sp * 3, sp * 2.8, 0.08);
      [0, 1, 2, 2, 1, 0].forEach((k, i) => harp(ch[k] + 12 + (i > 2 ? 12 : 0), t + i * sp, sp * 2.2, 0.05));
      drum("frame", t, 0.32);
      drum("frame", t + sp * 3, 0.26);
      drum("hat", t + sp * 2, 0.03);
      drum("hat", t + sp * 5, 0.03);
      for (let i = 0; i < 6; i += r() < 0.3 ? 2 : 1) whistle(walk(this, r) + 12, t + i * sp, sp * 0.95, 0.03, r() < 0.2);
    },
  };
  SONGS["nacht:hibernia"] = {
    bpm: 54, beats: 4,
    chords: [[52, 55, 59], [50, 54, 57], [48, 52, 55], [50, 54, 57]],
    scale: [64, 66, 67, 69, 71, 73, 74, 76],
    bar(b, t, sp, r) {
      const ch = this.chords[b % 4];
      pad(ch.map((n) => n + 12), t, sp * 4.2, 0.025, 700);
      [0, 1, 2, 1, 2, 0, 1, 2].forEach((k, i) => harp(ch[k] + 12 + (i > 3 ? 12 : 0), t + i * sp * 0.5, sp * 2.5, 0.04));
      if (r() < 0.6) whistle(walk(this, r) + 12, t + sp * 2, sp * 1.8, 0.025, r() < 0.4);
      for (let i = 0; i < 3; i++) if (r() < 0.4) bell(this.scale[Math.floor(r() * this.scale.length)] + 12, t + r() * sp * 4, 0.025);
    },
  };
  SONGS["taverne:hibernia"] = {
    bpm: 140, beats: 4,
    chords: [[50, 54, 57], [48, 52, 55], [47, 50, 54], [45, 49, 52]],
    scale: [62, 64, 66, 67, 69, 71, 72, 74, 76],
    bar(b, t, sp, r) {
      const ch = this.chords[b % 4];
      bass(ch[0] - 12, t, sp * 1.8, 0.1);
      bass(ch[2] - 12, t + sp * 2, sp * 1.8, 0.09);
      for (let i = 0; i < 4; i++) pluck(ch[i % 3] + 12, t + i * sp + sp * 0.5, sp * 0.5, 0.035);
      for (let i = 0; i < 8; i++) drum(i % 4 === 0 ? "frame" : "hat", t + i * sp * 0.5, i % 4 === 0 ? 0.3 : 0.035);
      for (let i = 0; i < 8; i++) whistle(walk(this, r) + 12, t + i * sp * 0.5, sp * 0.48, 0.028, i === 0 && r() < 0.5);
    },
  };
  SONGS["kampf:hibernia"] = {
    bpm: 150, beats: 6,
    chords: [[40, 47, 52], [38, 45, 50], [36, 43, 48], [38, 45, 50]],
    scale: [64, 66, 67, 69, 71, 72, 74, 76],
    bar(b, t, sp, r) {
      const ch = this.chords[b % 4];
      for (let i = 0; i < 6; i++) drum(i === 0 || i === 3 ? "frame" : "hat", t + i * sp, i === 0 || i === 3 ? 0.42 : 0.06);
      drum("kick", t, 0.4);
      bass(ch[0], t, sp * 2.8, 0.13);
      bass(ch[0], t + sp * 3, sp * 2.8, 0.12);
      [0, 1, 2, 0, 1, 2].forEach((k, i) => harp(ch[k] + 24, t + i * sp, sp, 0.04));
      if (b % 2 === 0) for (let i = 0; i < 6; i++) whistle(walk(this, r) + 12, t + i * sp, sp * 0.9, 0.03, false);
      else fiddle(ch[2] + 24, t, sp * 5.5, 0.035);
    },
  };
  A.SONGS = Object.keys(SONGS);
  A._songDefs = SONGS;

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
      const key = SONGS[context] ? context : String(context).split(":")[0];
      cur = A.musicOn && SONGS[key] ? key : null;
      barNo = 0;
      nextBar = c.currentTime + 0.1;
      if (cur) {
        // laeuft noch ein Lied nach dem Kampf, kommt die Musik erst danach
        const t0 = Math.max(c.currentTime, duckUntil);
        g.cancelScheduledValues(c.currentTime);
        g.setValueAtTime(0.0001, c.currentTime);
        g.setValueAtTime(0.0001, t0);
        g.linearRampToValueAtTime(musicLevel(), t0 + 1.5);
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
