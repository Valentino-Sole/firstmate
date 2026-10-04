/* Helden von Schwebfels - Spiellogik ohne DOM.
   Laeuft im Browser und in Node (fuer Tests und Balance-Simulationen). */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const D = SB.data;

  /* ---------------- Hilfsfunktionen ---------------- */
  const U = (SB.util = {});
  U.hash = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };
  U.rng = function (seed) {
    let a = (typeof seed === "string" ? U.hash(seed) : seed >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  U.rf = (r, a, b) => a + r() * (b - a);
  U.pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  U.wpick = function (r, list, key) {
    key = key || "w";
    let total = 0;
    for (const it of list) total += it[key];
    let x = r() * total;
    for (const it of list) {
      x -= it[key];
      if (x <= 0) return it;
    }
    return list[list.length - 1];
  };
  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.fmt = function (n) {
    n = Math.round(n);
    const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (n < 0 ? "-" : "") + s;
  };
  U.fmtShort = function (n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",") + " Mio.";
    if (n >= 1e4) return Math.round(n / 1000) + " Tsd.";
    return U.fmt(n);
  };
  U.fmtTime = function (ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
    return m + ":" + String(sec).padStart(2, "0");
  };
  U.esc = (str) =>
    String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  U.dayKey = function (ts) {
    const d = new Date(ts);
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  };
  U.cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  let uidCounter = 0;
  U.uid = () => Date.now().toString(36) + "-" + (uidCounter++).toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);

  /* ---------------- Ereignisbus ---------------- */
  const listeners = {};
  SB.bus = {
    on(ev, fn) {
      (listeners[ev] = listeners[ev] || []).push(fn);
    },
    emit(ev, payload) {
      (listeners[ev] || []).forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          console.error(e);
        }
      });
    },
  };
  const toast = (text, kind, extra) => SB.bus.emit("toast", Object.assign({ text, kind: kind || "info" }, extra || {}));

  /* ---------------- Kurven und Konstanten ---------------- */
  const E = (SB.engine = {});
  E.now = () => Date.now();
  E.C = {
    ENERGY_MAX: 100,
    ENERGY_REGEN_MS: 36 * 1000, // 1 Punkt pro 36 s, voll in einer Stunde
    BREW_ENERGY: 30,
    MONSTER_Q: 1.1,
    BREW_MAX: 5,
    SHIFT_MS: 5 * 60 * 1000,
    SHIFT_MAX: 8,
    ARENA_CD: 5 * 60 * 1000,
    DUNGEON_CD: 10 * 60 * 1000,
    SHOP_REFRESH: 15 * 60 * 1000,
    INV_SIZE: 12,
    WELL_PAID_MAX: 10,
    SPECIAL_EVERY: 4,
    MAX_ACTIONS: 90,
    NPC_COUNT: 140,
  };
  E.xpNeed = (L) => Math.round(80 * Math.pow(L, 1.75) + 40);
  E.goldBase = (L) => Math.round(6 + 3.2 * Math.pow(L, 1.42));
  E.questXpFrac = (L) => Math.max(0.07, 0.3 - 0.0075 * (L - 1));
  E.attrCost = (b) => Math.round(3 + 0.45 * Math.pow(b, 1.62) + b * 1.5);
  E.itemStat = (L) => 1.5 + 0.9 * L;
  E.weaponAvg = (L) => 2 + 1.5 * L;
  // Grundschaden, der unabhaengig von der Waffe mit der Stufe waechst
  E.baseDmg = (L) => [Math.round(1 + 0.6 * L), Math.round(2 + 0.9 * L)];
  E.armorBase = (L) => 6 + 4.5 * L;
  E.itemValue = (L) => 10 + 6 * Math.pow(L, 1.3);

  /* ---------------- Gegenstaende ---------------- */
  const ADJ_END = { m: "er", f: "e", n: "es", pl: "e" };
  const TINTS = {
    platte: ["#9aa4ad", "#b8bec4", "#7f8a96", "#c9a441", "#8d6b4a"],
    leder: ["#8a5a35", "#6b4a2f", "#a8743f", "#4f6b3a", "#5a4a3a"],
    stoff: ["#5b4fbf", "#3f6fbf", "#8f3f8f", "#2f7a6b", "#b04a4a"],
    schmuck: ["#e0b04a", "#c9d2d8", "#d98a4a", "#5fd0d6", "#c47bff"],
    holz: ["#8a5a35", "#6b4a2f", "#a8743f"],
  };

  E.baseFor = function (slot, cls, r) {
    const C = D.CLASSES[cls];
    if (slot === "waffe") return U.pick(r, C.weapons);
    if (slot === "nebenhand") return C.offhand;
    if (slot === "helm") return C.helm;
    if (slot === "ruestung") return C.chest;
    return slot; // handschuhe, stiefel, umhang, amulett, ring, talisman
  };

  E.rollRarity = function (r, opts) {
    opts = opts || {};
    const min = opts.minRarity ? D.RARITY_ORDER.indexOf(opts.minRarity) : 0;
    const boost = opts.boost || 0; // verschiebt Gewicht zu besseren Stufen
    const list = D.RARITY_ORDER.map((id, i) => ({ id, w: i < min ? 0 : D.RARITIES[id].weight * Math.pow(1 + boost, i) }));
    return U.wpick(r, list).id;
  };

  E.makeItem = function (r, opts) {
    const L = Math.max(1, Math.round(opts.level || 1));
    const cls = opts.cls;
    const slot = opts.slot || U.pick(r, D.SLOTS.filter((s) => s !== "nebenhand" || cls));
    const base = opts.base || E.baseFor(slot, cls, r);
    const B = D.BASES[base];
    const rarity = opts.rarity || E.rollRarity(r, opts);
    const R = D.RARITIES[rarity];
    const SI = D.SLOT_INFO[slot];
    const C = D.CLASSES[cls];
    const stats = {};
    const used = [];
    const statBase = E.itemStat(L) * R.mult * SI.stat;
    const lineMult = [1, 0.7, 0.55, 0.45];
    for (let i = 0; i < R.lines; i++) {
      let attr;
      if (i === 0) attr = r() < 0.68 ? C.main : "konstitution";
      else {
        const pool = D.ATTRS.filter((a) => used.indexOf(a) < 0).map((a) => ({
          a,
          w: a === C.main ? 3 : a === "konstitution" ? 3 : a === "glueck" ? 2 : 1,
        }));
        attr = U.wpick(r, pool).a;
      }
      used.push(attr);
      stats[attr] = Math.max(1, Math.round(statBase * lineMult[i] * U.rf(r, 0.88, 1.12)));
    }
    const item = { id: U.uid(), base, slot, cls: B.cls || null, level: L, rarity, stats, style: U.ri(r, 0, 2) };
    if (SI.armor > 0) item.armor = Math.max(1, Math.round(E.armorBase(L) * SI.armor * Math.pow(R.mult, 0.8) * U.rf(r, 0.9, 1.1)));
    if (slot === "waffe") {
      const avg = E.weaponAvg(L) * Math.pow(R.mult, 0.85) * U.rf(r, 0.94, 1.06);
      item.min = Math.max(1, Math.round(avg * 0.78));
      item.max = Math.max(item.min + 1, Math.round(avg * 1.22));
    }
    // Name
    const nounName = B.names ? B.names[cls] || B.names.klinge : B.name;
    const adj = U.pick(r, D.ADJ[rarity]);
    const adjWords = adj.split(" ");
    adjWords[adjWords.length - 1] += ADJ_END[B.g];
    let name = U.cap(adjWords.join(" ")) + " " + nounName;
    if (D.RARITY_ORDER.indexOf(rarity) >= 2) name += " " + U.pick(r, D.SUFFIX[used[0]]);
    item.name = name;
    // Farbe
    let palette;
    if (["amulett", "ring", "talisman"].indexOf(slot) >= 0) palette = TINTS.schmuck;
    else if (slot === "waffe" && (base === "bogen" || base === "stab")) palette = TINTS.holz;
    else palette = TINTS[C.material];
    item.tint = U.pick(r, palette);
    item.value = Math.max(5, Math.round(E.itemValue(L) * SI.price * R.price * U.rf(r, 0.9, 1.1)));
    return item;
  };

  E.itemScore = function (item, cls) {
    if (!item) return 0;
    const C = D.CLASSES[cls];
    let s = 0;
    for (const a in item.stats) s += item.stats[a] * (a === C.main ? 2 : a === "konstitution" ? 1.2 : a === "glueck" ? 0.6 : 0.2);
    if (item.armor) s += item.armor * 0.35;
    if (item.min) s += (item.min + item.max) * 1.6;
    if (item.base === "schild" && cls === "klinge") s += 25 + item.level * 4;
    return s;
  };

  /* ---------------- Held erstellen ---------------- */
  E.newHero = function (opts) {
    const now = E.now();
    const C = D.CLASSES[opts.cls];
    const race = D.RACES[opts.race];
    const base = {};
    for (const a of D.ATTRS) base[a] = 8 + (race.mods[a] || 0);
    base[C.main] += 4;
    base.konstitution += 2;
    const r = U.rng("start:" + opts.name + now);
    const S = {
      v: 1,
      created: now,
      name: opts.name,
      race: opts.race,
      gender: opts.gender,
      cls: opts.cls,
      look: opts.look,
      level: 1,
      xp: 0,
      gold: 120,
      perlen: 6,
      honor: 100,
      energy: { val: E.C.ENERGY_MAX, ts: now },
      base,
      bought: { kraft: 0, geschick: 0, verstand: 0, konstitution: 0, glueck: 0 },
      equip: {},
      inv: [],
      quest: { seed: U.hash(opts.name + now), offers: [], active: null },
      guard: null,
      arena: { next: 0, wins: 0, losses: 0, rivals: [] },
      dungeons: { progress: {}, next: 0 },
      shops: {},
      buffs: [],
      mounts: { owned: [] },
      bestiary: {},
      ach: {},
      stats: { quests: 0, wins: 0, losses: 0, arenaWins: 0, bosses: 0, goldEarned: 0, items: 0 },
      daily: { day: U.dayKey(now), wellFree: 1, brews: 0, arenaXp: 0, wellPaid: 0 },
      npcSeed: U.hash("npc:" + opts.name + now),
      npcHonor: {},
      settings: { sound: true, quality: "hoch", fastFights: false },
      tut: 0,
    };
    for (const s of D.SLOTS) S.equip[s] = null;
    S.equip.waffe = E.makeItem(r, { level: 1, slot: "waffe", cls: opts.cls, rarity: "gewoehnlich", base: C.weapons[0] });
    S.equip.ruestung = E.makeItem(r, { level: 1, slot: "ruestung", cls: opts.cls, rarity: "gewoehnlich" });
    S.equip.stiefel = E.makeItem(r, { level: 1, slot: "stiefel", cls: opts.cls, rarity: "gewoehnlich" });
    if (opts.cls === "klinge") S.equip.nebenhand = E.makeItem(r, { level: 1, slot: "nebenhand", cls: opts.cls, rarity: "gewoehnlich" });
    E.refreshOffers(S);
    E.refreshShop(S, "schmiede", true);
    E.refreshShop(S, "arkanum", true);
    return S;
  };

  E.migrate = function (S) {
    if (!S || typeof S !== "object" || !S.cls || !D.CLASSES[S.cls]) return null;
    S.settings = Object.assign({ sound: true, quality: "hoch", fastFights: false }, S.settings || {});
    S.stats = Object.assign({ quests: 0, wins: 0, losses: 0, arenaWins: 0, bosses: 0, goldEarned: 0, items: 0 }, S.stats || {});
    S.bestiary = S.bestiary || {};
    S.ach = S.ach || {};
    S.buffs = S.buffs || [];
    S.mounts = S.mounts || { owned: [] };
    S.npcHonor = S.npcHonor || {};
    S.inv = (S.inv || []).filter(Boolean);
    for (const s of D.SLOTS) if (!(s in S.equip)) S.equip[s] = null;
    return S;
  };

  /* ---------------- Werte des Helden ---------------- */
  E.activeBuffs = function (S, now) {
    now = now || E.now();
    S.buffs = (S.buffs || []).filter((b) => b.until > now);
    return S.buffs;
  };

  E.heroAttrs = function (S, now) {
    const C = D.CLASSES[S.cls];
    const out = {};
    for (const a of D.ATTRS) {
      const auto = a === C.main || a === "konstitution" ? S.level - 1 : Math.floor((S.level - 1) / 2);
      out[a] = S.base[a] + S.bought[a] + auto;
    }
    for (const s of D.SLOTS) {
      const it = S.equip[s];
      if (it) for (const a in it.stats) out[a] += it.stats[a];
    }
    const buffs = E.activeBuffs(S, now);
    const mult = { kraft: 1, geschick: 1, verstand: 1, konstitution: 1, glueck: 1 };
    for (const b of buffs) {
      const P = D.POTIONS.find((p) => p.id === b.id);
      if (!P) continue;
      for (const k in P.eff) {
        if (k === "main") mult[C.main] += P.eff[k];
        else if (k === "all") D.ATTRS.forEach((a) => (mult[a] += P.eff[k]));
        else mult[k] += P.eff[k];
      }
    }
    for (const a of D.ATTRS) out[a] = Math.round(out[a] * mult[a]);
    return out;
  };

  E.armorTotal = function (S) {
    let a = 0;
    for (const s of D.SLOTS) if (S.equip[s] && S.equip[s].armor) a += S.equip[s].armor;
    return a;
  };

  E.damageReduction = (prof, armor, attLevel) => (prof.armorCap / 100) * (armor / (armor + 2.8 * attLevel + 30));
  E.critChance = (luck, defLevel) => U.clamp(0.03 + (0.5 * luck) / (luck + 8 * defLevel + 20), 0.03, 0.45);

  E.profileFor = function (cls) {
    const C = D.CLASSES[cls];
    return { hpMult: C.hpMult, armorCap: C.armorCap, block: C.block, evade: C.evade, unblockable: C.unblockable, dmgMult: C.dmgMult, special: C.special };
  };

  E.heroFighter = function (S, now) {
    const C = D.CLASSES[S.cls];
    const attrs = E.heroAttrs(S, now);
    const prof = E.profileFor(S.cls);
    if (!(S.equip.nebenhand && S.equip.nebenhand.base === "schild")) prof.block = 0;
    const w = S.equip.waffe;
    const L = S.level;
    return {
      kind: "hero",
      name: S.name,
      level: L,
      cls: S.cls,
      race: S.race,
      gender: S.gender,
      look: S.look,
      gear: E.gearVisual(S.equip),
      mainKey: C.main,
      attrs,
      prof,
      maxHp: Math.round(attrs.konstitution * prof.hpMult * (L + 1)),
      wMin: (w ? w.min : 0) + E.baseDmg(L)[0],
      wMax: (w ? w.max : 1) + E.baseDmg(L)[1],
      armor: E.armorTotal(S),
      ranged: !!(w && D.BASES[w.base].ranged),
    };
  };

  E.gearVisual = function (equip) {
    const g = {};
    for (const s of ["helm", "ruestung", "umhang", "handschuhe", "stiefel", "waffe", "nebenhand"]) {
      const it = equip[s];
      g[s] = it ? { base: it.base, tint: it.tint, rarity: it.rarity, style: it.style || 0 } : null;
    }
    return g;
  };

  E.heroSummary = function (S, now) {
    const f = E.heroFighter(S, now);
    const red = E.damageReduction(f.prof, f.armor, S.level);
    const eff = 1 + f.attrs[f.mainKey] / 10;
    return {
      fighter: f,
      attrs: f.attrs,
      hp: f.maxHp,
      dmgMin: Math.round(f.wMin * eff * f.prof.dmgMult),
      dmgMax: Math.round(f.wMax * eff * f.prof.dmgMult),
      armor: f.armor,
      reduction: red,
      crit: E.critChance(f.attrs.glueck, S.level),
      block: f.prof.block,
      evade: f.prof.evade,
    };
  };

  /* Modell-Held einer Stufe: Basis fuer Monster, NPC-Helden und Balance. q = Ausruestungsqualitaet */
  E.modelAttrs = function (L, q) {
    q = q == null ? 1 : q;
    // An einen simulierten, sparsam spielenden Helden angepasst (tests/progression.mjs)
    return {
      main: Math.round(12 + (9 * L + 0.24 * L * L) * q),
      con: Math.round(10 + (4 * L + 0.25 * L * L) * q),
      luck: Math.round(8 + 2.5 * L * q),
      other: Math.round(8 + 0.5 * (L - 1) + 0.6 * E.itemStat(L) * q),
      weapon: E.weaponAvg(L) * 1.1 * q,
      armor: E.armorBase(L) * 1.05 * q,
    };
  };

  E.modelHeroFighter = function (L, cls, q, extra) {
    const C = D.CLASSES[cls];
    const m = E.modelAttrs(L, q);
    const attrs = { kraft: m.other, geschick: m.other, verstand: m.other, konstitution: m.con, glueck: m.luck };
    attrs[C.main] = m.main;
    const prof = E.profileFor(cls);
    return Object.assign(
      {
        kind: "hero",
        name: "Modell",
        level: L,
        cls,
        mainKey: C.main,
        attrs,
        prof,
        maxHp: Math.round(attrs.konstitution * prof.hpMult * (L + 1)),
        wMin: Math.round(m.weapon * 0.78) + E.baseDmg(L)[0],
        wMax: Math.round(m.weapon * 1.22) + E.baseDmg(L)[1],
        armor: Math.round(m.armor),
        ranged: cls !== "klinge",
      },
      extra || {}
    );
  };

  E.monsterFighter = function (mon, L, power, opts) {
    opts = opts || {};
    const type = D.ARCH_TYPE[mon.arch];
    const T = D.MONSTER_TYPES[type];
    // Fruehe Stufen etwas sanfter, da Neulinge noch kaum Ausruestung haben
    const ramp = Math.min(1, 0.62 + 0.042 * L);
    const p = power * ramp;
    const m = E.modelAttrs(L, E.C.MONSTER_Q);
    const attrs = { kraft: 0, geschick: 0, verstand: 0, konstitution: 0, glueck: 0 };
    attrs.kraft = attrs.geschick = attrs.verstand = Math.round(m.other * p);
    attrs[type] = Math.round(m.main * 0.86 * p);
    attrs.konstitution = Math.round(m.con * 0.95 * p);
    attrs.glueck = Math.round(m.luck * 0.8 * p);
    const hpBoost = opts.boss ? 1.25 : 1;
    const prof = { hpMult: T.hpMult, armorCap: T.armorCap, block: T.block, evade: T.evade, unblockable: T.unblockable, dmgMult: T.dmgMult, special: T.special };
    const wAvg = m.weapon * (0.85 + 0.15 * p) + (E.baseDmg(L)[0] + E.baseDmg(L)[1]) / 2;
    return {
      kind: "monster",
      id: mon.id,
      name: mon.name,
      arch: mon.arch,
      color: mon.color,
      accent: mon.accent,
      boss: !!opts.boss,
      final: !!opts.final,
      level: L,
      mainKey: type,
      attrs,
      prof,
      maxHp: Math.round(attrs.konstitution * prof.hpMult * (L + 1) * hpBoost),
      wMin: Math.max(1, Math.round(wAvg * 0.8)),
      wMax: Math.max(2, Math.round(wAvg * 1.2)),
      armor: Math.round(m.armor * 0.9 * p),
      ranged: type === "verstand",
    };
  };

  /* ---------------- Kampf ---------------- */
  E.simulate = function (A, B, seed) {
    const r = U.rng(seed);
    const f = [Object.assign({}, A, { hp: A.maxHp, meter: 0, stun: false }), Object.assign({}, B, { hp: B.maxHp, meter: 0, stun: false })];
    const sA = (A.attrs.geschick + A.attrs.glueck) * U.rf(r, 0.8, 1.2);
    const sB = (B.attrs.geschick + B.attrs.glueck) * U.rf(r, 0.8, 1.2);
    let turn = sA >= sB ? 0 : 1;
    const events = [];
    let winner = -1;
    for (let i = 0; i < E.C.MAX_ACTIONS && winner < 0; i++) {
      const att = f[turn];
      const def = f[1 - turn];
      if (att.stun) {
        att.stun = false;
        events.push({ a: turn, kind: "stun", hits: [], hp: [f[0].hp, f[1].hp] });
        turn = 1 - turn;
        continue;
      }
      att.meter++;
      const special = att.meter % E.C.SPECIAL_EVERY === 0 ? att.prof.special : null;
      let hits = [{ mult: 1 }];
      let stunTarget = false;
      if (special) {
        switch (special.id) {
          case "schildbrecher":
            hits = [{ mult: 1.5, sure: true }];
            stunTarget = true;
            break;
          case "pfeilhagel":
            hits = [{ mult: 0.6 }, { mult: 0.6 }, { mult: 0.6 }];
            break;
          case "sternenbruch":
            hits = [{ mult: 2.2, sure: true, pierce: true }];
            break;
          case "zermalmen":
            hits = [{ mult: 1.8 }];
            break;
          case "raserei":
            hits = [{ mult: 0.85 }, { mult: 0.85 }];
            break;
          case "fluch":
            hits = [{ mult: 1.5, sure: true, pierce: true }];
            break;
        }
      }
      const out = [];
      let landed = false;
      for (const h of hits) {
        if (def.hp <= 0) break;
        const sure = h.sure || att.prof.unblockable;
        if (!sure && def.prof.evade && r() < def.prof.evade) {
          out.push({ res: "evade", dmg: 0 });
          continue;
        }
        // Schilde fangen auch Zauber ab, aber nur halb so oft
        const blockChance = h.sure ? 0 : att.prof.unblockable ? def.prof.block * 0.5 : def.prof.block;
        if (blockChance && r() < blockChance) {
          out.push({ res: "block", dmg: 0 });
          continue;
        }
        // Gleiches Attribut schwaecht Angriffe nur im Duell zwischen Helden
        const main = att.attrs[att.mainKey];
        const pvp = att.kind !== "monster" && def.kind !== "monster";
        const eff = pvp ? Math.max(main * 0.5, main - def.attrs[att.mainKey] * 0.5) : main;
        const roll = U.rf(r, att.wMin, att.wMax);
        const red = h.pierce ? 0 : E.damageReduction(def.prof, def.armor, att.level);
        let dmg = roll * (1 + eff / 10) * att.prof.dmgMult * h.mult * (1 - red);
        const crit = r() < E.critChance(att.attrs.glueck, def.level);
        if (crit) dmg *= 2;
        dmg = Math.max(1, Math.round(dmg));
        def.hp = Math.max(0, def.hp - dmg);
        landed = true;
        out.push({ res: crit ? "crit" : "hit", dmg });
      }
      if (stunTarget && landed && def.hp > 0) def.stun = true;
      events.push({ a: turn, kind: special ? "special" : "attack", sp: special ? special.id : null, spName: special ? special.name : null, hits: out, stun: stunTarget && landed, hp: [f[0].hp, f[1].hp] });
      if (def.hp <= 0) winner = turn;
      turn = 1 - turn;
    }
    if (winner < 0) winner = f[0].hp / f[0].maxHp >= f[1].hp / f[1].maxHp ? 0 : 1;
    return { events, winner, hp: [f[0].hp, f[1].hp], max: [A.maxHp, B.maxHp] };
  };

  E.estimateWin = function (A, B, n, salt) {
    n = n || 40;
    let w = 0;
    for (let i = 0; i < n; i++) if (E.simulate(A, B, "est" + (salt || "") + i).winner === 0) w++;
    return w / n;
  };

  /* ---------------- Zeit, Energie, Tageswechsel ---------------- */
  E.energy = function (S, now) {
    now = now || E.now();
    const e = S.energy;
    if (e.val >= E.C.ENERGY_MAX) return e.val;
    return Math.min(E.C.ENERGY_MAX, e.val + (now - e.ts) / E.C.ENERGY_REGEN_MS);
  };
  E.setEnergy = function (S, val, now) {
    S.energy = { val, ts: now || E.now() };
  };
  E.nextEnergyIn = function (S, now) {
    now = now || E.now();
    const cur = E.energy(S, now);
    if (cur >= E.C.ENERGY_MAX) return 0;
    const frac = cur - Math.floor(cur);
    return (1 - frac) * E.C.ENERGY_REGEN_MS;
  };

  E.tick = function (S, now) {
    now = now || E.now();
    const day = U.dayKey(now);
    if (S.daily.day !== day) {
      S.daily = { day, wellFree: 1, brews: 0, arenaXp: 0, wellPaid: 0 };
      toast("Ein neuer Tag auf Schwebfels. Der Wunschbrunnen glitzert wieder.", "info");
    }
    for (const k of ["schmiede", "arkanum"]) if (!S.shops[k] || now - S.shops[k].ts > E.C.SHOP_REFRESH) E.refreshShop(S, k, true);
    E.activeBuffs(S, now);
  };

  E.busy = function (S, now) {
    now = now || E.now();
    if (S.quest.active) return { what: "quest", until: S.quest.active.end };
    if (S.guard) return { what: "guard", until: S.guard.end };
    return null;
  };

  E.bestiaryBonus = (S) => 1 + Object.keys(S.bestiary).length * 0.005;
  E.mountCut = function (S) {
    let cut = 0;
    for (const id of S.mounts.owned) {
      const M = D.MOUNTS.find((m) => m.id === id);
      if (M && M.cut > cut) cut = M.cut;
    }
    return cut;
  };

  E.gainXp = function (S, xp) {
    S.xp += xp;
    let ups = 0;
    while (S.xp >= E.xpNeed(S.level)) {
      S.xp -= E.xpNeed(S.level);
      S.level++;
      S.perlen += 1;
      ups++;
    }
    if (ups) {
      SB.bus.emit("levelup", { level: S.level });
      E.checkAch(S);
    }
    return ups;
  };
  E.gainGold = function (S, g) {
    S.gold += g;
    if (g > 0) S.stats.goldEarned += g;
  };

  E.addItem = function (S, item) {
    if (S.inv.length >= E.C.INV_SIZE) return false;
    S.inv.push(item);
    S.stats.items++;
    if (item.rarity === "episch") E.grantAch(S, "episch");
    if (item.rarity === "legendaer") E.grantAch(S, "legendaer");
    return true;
  };

  /* ---------------- Taverne / Auftraege ---------------- */
  const TIERS = [
    { id: "kurz", name: "Kurz", sec: [20, 35], energy: 6 },
    { id: "mittel", name: "Mittel", sec: [40, 70], energy: 10 },
    { id: "lang", name: "Lang", sec: [80, 120], energy: 14 },
  ];
  const DIFF = [
    null,
    { name: "Gemütlich", power: 0.88, reward: 0.85 },
    { name: "Ordentlich", power: 0.97, reward: 1.0 },
    { name: "Halsbrecherisch", power: 1.06, reward: 1.35 },
  ];
  E.DIFF = DIFF;

  E.monstersFor = function (L) {
    let list = D.MONSTERS.filter((m) => L >= m.lv[0] && L <= m.lv[1]);
    if (list.length < 3) {
      list = D.MONSTERS.slice().sort((a, b) => Math.abs((a.lv[0] + Math.min(a.lv[1], 60)) / 2 - L) - Math.abs((b.lv[0] + Math.min(b.lv[1], 60)) / 2 - L)).slice(0, 6);
    }
    return list;
  };

  E.makeOffer = function (S, r, idx) {
    const L = S.level;
    const tier = TIERS[idx % 3 === 0 ? U.ri(r, 0, 1) : idx % 3 === 1 ? 1 : U.ri(r, 1, 2)];
    const diff = U.wpick(r, [{ d: 1, w: 38 }, { d: 2, w: 42 }, { d: 3, w: 20 }]).d;
    const mon = U.pick(r, E.monstersFor(L));
    // Verschiedene Vorlagen und Gegner innerhalb eines Angebots
    let tpl = U.pick(r, D.QUESTS);
    for (let k = 0; k < 8 && S._tplUsed && S._tplUsed.indexOf(tpl.t) >= 0; k++) tpl = U.pick(r, D.QUESTS);
    const place = U.pick(r, D.PLACES);
    const person = U.pick(r, D.PERSONS);
    const fill = (s) => s.replace(/\{m\}/g, mon.name).replace(/\{o\}/g, place).replace(/\{p\}/g, person);
    const ef = tier.energy / 10;
    const dm = DIFF[diff].reward;
    const bonus = E.bestiaryBonus(S);
    const offer = {
      id: U.uid(),
      tpl: tpl.t,
      title: fill(tpl.t),
      text: U.cap(fill(tpl.x)),
      place,
      tier: tier.id,
      sec: U.ri(r, tier.sec[0], tier.sec[1]),
      energy: tier.energy,
      diff,
      monster: mon.id,
      mlevel: Math.max(1, L + (diff === 3 ? U.ri(r, 0, 1) : diff === 1 ? -U.ri(r, 0, 1) : 0)),
      xp: Math.max(5, Math.round(E.xpNeed(L) * E.questXpFrac(L) * ef * dm * U.rf(r, 0.9, 1.1) * bonus)),
      gold: Math.max(3, Math.round(E.goldBase(L) * ef * dm * U.rf(r, 0.85, 1.15) * bonus)),
      item: null,
      perle: r() < 0.05 + 0.02 * diff ? 1 : 0,
      seed: Math.floor(r() * 1e9),
    };
    if (r() < 0.3 + 0.08 * diff) {
      offer.item = E.makeItem(r, { level: L + U.ri(r, 0, 1), cls: S.cls, slot: U.pick(r, D.SLOTS), boost: 0.25 * diff });
    }
    return offer;
  };

  E.refreshOffers = function (S) {
    const r = U.rng(S.quest.seed++);
    S._tplUsed = [];
    S.quest.offers = [0, 1, 2].map((i) => {
      const o = E.makeOffer(S, r, i);
      S._tplUsed.push(o.tpl);
      return o;
    });
    delete S._tplUsed;
  };

  E.questDuration = (S, offer) => Math.round(offer.sec * (1 - E.mountCut(S)) * 1000);

  E.startQuest = function (S, idx, now) {
    now = now || E.now();
    const o = S.quest.offers[idx];
    if (!o) return { ok: false, msg: "Dieser Auftrag existiert nicht mehr." };
    if (E.busy(S, now)) return { ok: false, msg: "Du bist gerade beschäftigt." };
    const en = E.energy(S, now);
    if (en < o.energy) return { ok: false, msg: "Dir fehlt der Tatendrang. Ein Wolkenbräu hilft." };
    E.setEnergy(S, en - o.energy, now);
    S.quest.active = { offer: o, start: now, end: now + E.questDuration(S, o) };
    return { ok: true };
  };

  E.skipQuest = function (S, now) {
    now = now || E.now();
    const a = S.quest.active;
    if (!a || a.end <= now) return { ok: false };
    if (S.perlen < 1) return { ok: false, msg: "Dafür brauchst du eine Wolkenperle." };
    S.perlen -= 1;
    a.end = now;
    return { ok: true };
  };

  E.questMonster = (o) => D.MONSTERS.find((m) => m.id === o.monster);

  // Auftragsgegner wachsen mit dem Helden, aber nur halb so schnell wie seine tatsaechliche Staerke
  E.heroStrength = function (hero, L) {
    const m = E.modelHeroFighter(L, hero.cls, 1);
    const main = hero.attrs[hero.mainKey] / m.attrs[m.mainKey];
    const hp = hero.maxHp / m.maxHp;
    const wpn = (hero.wMin + hero.wMax) / (m.wMin + m.wMax);
    return U.clamp(Math.cbrt(main * hp * wpn), 0.4, 2.0);
  };
  E.questFoe = function (o, hero) {
    let p = DIFF[o.diff].power;
    if (hero) p *= 0.5 + 0.5 * E.heroStrength(hero, o.mlevel);
    return E.monsterFighter(E.questMonster(o), o.mlevel, p);
  };

  E.questFight = function (S, now) {
    now = now || E.now();
    const a = S.quest.active;
    if (!a || a.end > now) return null;
    const o = a.offer;
    const hero = E.heroFighter(S, now);
    const foe = E.questFoe(o, hero);
    const result = E.simulate(hero, foe, o.seed);
    return { hero, foe, result, offer: o };
  };

  E.resolveQuest = function (S, fight) {
    const o = fight.offer;
    const won = fight.result.winner === 0;
    const rew = { won, xp: 0, gold: 0, item: null, itemSold: 0, perle: 0 };
    S.quest.active = null;
    if (won) {
      rew.xp = o.xp;
      rew.gold = o.gold;
      E.gainGold(S, o.gold);
      if (o.item) {
        if (E.addItem(S, o.item)) rew.item = o.item;
        else {
          rew.itemSold = Math.round(o.item.value * 0.25);
          E.gainGold(S, rew.itemSold);
        }
      }
      if (o.perle) {
        S.perlen += o.perle;
        rew.perle = o.perle;
      }
      S.stats.wins++;
      S.bestiary[o.monster] = (S.bestiary[o.monster] || 0) + 1;
      E.grantAch(S, "ersterSieg");
    } else {
      // Trostpflaster, damit eine Pechstraehne nicht zur Abwaertsspirale wird
      rew.xp = Math.round(o.xp * 0.25);
      rew.gold = Math.round(o.gold * 0.25);
      E.gainGold(S, rew.gold);
      S.stats.losses++;
    }
    S.stats.quests++;
    E.gainXp(S, rew.xp);
    E.refreshOffers(S);
    E.checkAch(S);
    return rew;
  };

  E.buyBrew = function (S, now) {
    now = now || E.now();
    if (S.daily.brews >= E.C.BREW_MAX) return { ok: false, msg: "Hulda schenkt heute nichts mehr aus. Morgen wieder." };
    if (S.perlen < 1) return { ok: false, msg: "Ein Wolkenbräu kostet eine Wolkenperle." };
    S.perlen -= 1;
    S.daily.brews++;
    E.setEnergy(S, E.energy(S, now) + E.C.BREW_ENERGY, now);
    return { ok: true };
  };

  /* ---------------- Leuchtturmwache ---------------- */
  E.shiftPay = (S) => Math.round(E.goldBase(S.level) * 0.8);
  E.startGuard = function (S, shifts, now) {
    now = now || E.now();
    if (E.busy(S, now)) return { ok: false, msg: "Du bist gerade beschäftigt." };
    shifts = U.clamp(Math.round(shifts), 1, E.C.SHIFT_MAX);
    S.guard = { start: now, end: now + shifts * E.C.SHIFT_MS, shifts, pay: shifts * E.shiftPay(S) };
    return { ok: true };
  };
  E.cancelGuard = function (S) {
    S.guard = null;
  };
  E.collectGuard = function (S, now) {
    now = now || E.now();
    const g = S.guard;
    if (!g || g.end > now) return { ok: false };
    E.gainGold(S, g.pay);
    if (g.shifts >= 8) E.grantAch(S, "wache8");
    S.guard = null;
    return { ok: true, gold: g.pay };
  };

  /* ---------------- NPC-Helden, Ruhmeshalle, Arena ---------------- */
  E.npcList = function (S, now) {
    now = now || E.now();
    const out = [];
    const days = Math.max(0, (now - S.created) / 86400000);
    const r = U.rng(S.npcSeed);
    const races = Object.keys(D.RACES);
    const classes = Object.keys(D.CLASSES);
    const usedNames = {};
    for (let i = 0; i < E.C.NPC_COUNT; i++) {
      const t = i / (E.C.NPC_COUNT - 1);
      const baseL = 1 + Math.floor(64 * Math.pow(t, 1.7) + r() * 3);
      const growth = U.rf(r, 0.2, 1.4);
      const L = Math.min(90, baseL + Math.floor(days * growth));
      let name;
      do name = U.pick(r, D.NPC_FIRST) + " " + U.pick(r, D.NPC_LAST);
      while (usedNames[name]);
      usedNames[name] = 1;
      const race = U.pick(r, races);
      const cls = U.pick(r, classes);
      const R = D.RACES[race];
      const look = { skin: U.pick(r, R.skins), hair: U.pick(r, R.hairs), hairStyle: U.ri(r, 0, 4), beard: U.ri(r, 0, 3), eyes: "#1d1b26" };
      const gender = r() < 0.5 ? "m" : "w";
      const q = U.rf(r, 0.82, 1.12);
      const honorBase = Math.round(60 + L * 32 + r() * 260);
      const id = "npc" + i;
      const gearSeed = Math.floor(r() * 1e9);
      out.push({
        id, kind: "npc", name, race, cls, gender, look, level: L, q,
        honor: Math.max(0, honorBase + (S.npcHonor[id] || 0)),
        gearSeed,
      });
    }
    return out;
  };

  E.npcGear = function (npc) {
    const r = U.rng(npc.gearSeed);
    const C = D.CLASSES[npc.cls];
    const g = {};
    const rar = () => E.rollRarity(r, { boost: 0.4 });
    g.waffe = { base: U.pick(r, C.weapons), tint: "#9aa4ad", rarity: rar(), style: U.ri(r, 0, 2) };
    g.ruestung = { base: C.chest, tint: U.pick(r, ["#9aa4ad", "#8a5a35", "#5b4fbf", "#b04a4a", "#2f7a6b", "#c9a441"]), rarity: rar(), style: U.ri(r, 0, 2) };
    g.helm = r() < 0.75 ? { base: C.helm, tint: U.pick(r, ["#7f8a96", "#6b4a2f", "#3f6fbf", "#8f3f8f"]), rarity: rar(), style: U.ri(r, 0, 2) } : null;
    g.umhang = r() < 0.6 ? { base: "umhang", tint: U.pick(r, ["#b04a4a", "#2f4f8f", "#2f7a6b", "#6b3f8f", "#c9a441"]), rarity: rar(), style: 0 } : null;
    g.handschuhe = r() < 0.7 ? { base: "handschuhe", tint: "#6b4a2f", rarity: rar(), style: 0 } : null;
    g.stiefel = { base: "stiefel", tint: "#5a4a3a", rarity: rar(), style: 0 };
    g.nebenhand = r() < 0.85 ? { base: C.offhand, tint: U.pick(r, ["#8d6b4a", "#7f8a96", "#5fd0d6"]), rarity: rar(), style: U.ri(r, 0, 2) } : null;
    return g;
  };

  E.npcFighter = function (npc) {
    const f = E.modelHeroFighter(npc.level, npc.cls, npc.q);
    f.name = npc.name;
    f.race = npc.race;
    f.gender = npc.gender;
    f.look = npc.look;
    f.gear = npc.gear || E.npcGear(npc);
    f.kind = "hero";
    if (!f.gear.nebenhand || f.gear.nebenhand.base !== "schild") f.prof.block = 0;
    return f;
  };

  E.remoteFighter = function (h, st) {
    const C = D.CLASSES[h.cls];
    const prof = E.profileFor(h.cls);
    if (!st.shield) prof.block = 0;
    const w = h.gear && h.gear.waffe;
    return {
      kind: "hero", name: h.name, level: h.level, cls: h.cls, race: h.race, gender: h.gender, look: h.look, gear: h.gear,
      mainKey: C.main, attrs: st.attrs, prof,
      maxHp: Math.round(st.attrs.konstitution * prof.hpMult * (h.level + 1)),
      wMin: st.wMin, wMax: st.wMax, armor: st.armor,
      ranged: !!(w && D.BASES[w.base] && D.BASES[w.base].ranged),
    };
  };

  E.allHeroes = function (S, now, remote) {
    const list = E.npcList(S, now);
    if (remote) for (const h of remote) list.push(h);
    list.push({ id: "me", kind: "me", name: S.name, race: S.race, cls: S.cls, gender: S.gender, look: S.look, level: S.level, honor: S.honor });
    list.sort((a, b) => b.honor - a.honor || b.level - a.level);
    list.forEach((h, i) => (h.rank = i + 1));
    return list;
  };

  E.arenaRivals = function (S, now, remote) {
    const all = E.allHeroes(S, now, remote);
    const me = all.find((h) => h.kind === "me");
    const idx = me.rank - 1;
    const r = U.rng(S.npcSeed + S.arena.wins * 7 + S.arena.losses * 13 + Math.floor((now || E.now()) / E.C.ARENA_CD));
    const pickFrom = (a, b) => {
      const pool = all.slice(Math.max(0, a), Math.max(0, b)).filter((h) => h.kind !== "me");
      return pool.length ? U.pick(r, pool) : null;
    };
    const picks = [pickFrom(idx - 12, idx - 3), pickFrom(idx - 3, idx + 4), pickFrom(idx + 2, idx + 14)].filter(Boolean);
    const seen = {};
    return picks.filter((h) => (seen[h.id] ? false : (seen[h.id] = true)));
  };

  E.arenaFight = function (S, opp, now) {
    now = now || E.now();
    if (E.busy(S, now)) return { ok: false, msg: "Du bist gerade beschäftigt." };
    if (S.arena.next > now) return { ok: false, msg: "Baronin Krawall lässt dich noch nicht wieder in den Ring." };
    const hero = E.heroFighter(S, now);
    const foe = opp.fighter || E.npcFighter(opp);
    const seed = U.hash(S.name + opp.id + now);
    const result = E.simulate(hero, foe, seed);
    return { ok: true, fight: { hero, foe, result, opp } };
  };

  E.resolveArena = function (S, fight, now) {
    now = now || E.now();
    const opp = fight.opp;
    const won = fight.result.winner === 0;
    const gain = U.clamp(Math.round(22 + (opp.honor - S.honor) / 15), 6, 60);
    const rew = { won, honor: 0, gold: 0, xp: 0 };
    S.arena.next = now + E.C.ARENA_CD;
    if (won) {
      S.honor += gain;
      rew.honor = gain;
      rew.gold = Math.round(E.goldBase(S.level) * 0.5);
      E.gainGold(S, rew.gold);
      if (S.daily.arenaXp < 10) {
        S.daily.arenaXp++;
        rew.xp = Math.round(E.xpNeed(S.level) * 0.035);
        E.gainXp(S, rew.xp);
      }
      S.arena.wins++;
      S.stats.arenaWins++;
      if (opp.kind === "npc") S.npcHonor[opp.id] = (S.npcHonor[opp.id] || 0) - Math.round(gain * 0.6);
      E.grantAch(S, "ersterSieg");
    } else {
      const loss = Math.round(gain * 0.5);
      S.honor = Math.max(0, S.honor - loss);
      rew.honor = -loss;
      S.arena.losses++;
      if (opp.kind === "npc") S.npcHonor[opp.id] = (S.npcHonor[opp.id] || 0) + Math.round(gain * 0.4);
    }
    E.checkAch(S, now);
    return rew;
  };

  E.skipArena = function (S, now) {
    now = now || E.now();
    if (S.arena.next <= now) return { ok: false };
    if (S.perlen < 1) return { ok: false, msg: "Dafür brauchst du eine Wolkenperle." };
    S.perlen -= 1;
    S.arena.next = now;
    return { ok: true };
  };

  /* ---------------- Dungeons ---------------- */
  E.dungeonState = function (S, d) {
    const D0 = D.DUNGEONS[d];
    const cleared = S.dungeons.progress[D0.id] || 0;
    return { def: D0, cleared, done: cleared >= D0.bosses.length, unlocked: S.level >= D0.unlock && (d === 0 || (S.dungeons.progress[D.DUNGEONS[d - 1].id] || 0) >= 1) };
  };
  E.bossFor = function (d, floor) {
    const D0 = D.DUNGEONS[d];
    const b = D0.bosses[floor];
    const mon = { id: D0.id + "-" + floor, name: b.name, arch: b.arch, color: b.color, accent: b.accent };
    const L = D0.base + floor;
    const power = 0.95 + 0.02 * floor + (b.final ? 0.05 : 0);
    return { mon, L, power, final: !!b.final };
  };
  E.dungeonFight = function (S, d, now) {
    now = now || E.now();
    const st = E.dungeonState(S, d);
    if (!st.unlocked) return { ok: false, msg: "Dieser Dungeon ist noch versiegelt." };
    if (st.done) return { ok: false, msg: "Diesen Dungeon hast du bereits gesäubert." };
    if (E.busy(S, now)) return { ok: false, msg: "Du bist gerade beschäftigt." };
    if (S.dungeons.next > now) return { ok: false, msg: "Du musst erst wieder zu Kräften kommen." };
    const b = E.bossFor(d, st.cleared);
    const hero = E.heroFighter(S, now);
    const foe = E.monsterFighter(b.mon, b.L, b.power, { boss: true, final: b.final });
    const result = E.simulate(hero, foe, U.hash(S.name + b.mon.id + now));
    return { ok: true, fight: { hero, foe, result, dungeon: d, floor: st.cleared, boss: b } };
  };
  E.resolveDungeon = function (S, fight, now) {
    now = now || E.now();
    const won = fight.result.winner === 0;
    const b = fight.boss;
    const rew = { won, xp: 0, gold: 0, item: null, perlen: 0, itemSold: 0 };
    S.dungeons.next = now + E.C.DUNGEON_CD;
    if (won) {
      const D0 = D.DUNGEONS[fight.dungeon];
      S.dungeons.progress[D0.id] = (S.dungeons.progress[D0.id] || 0) + 1;
      rew.xp = Math.round(E.xpNeed(Math.min(S.level, b.L)) * (b.final ? 0.6 : 0.32) * E.bestiaryBonus(S));
      rew.gold = Math.round(E.goldBase(b.L) * (b.final ? 8 : 3));
      const r = U.rng(U.hash(b.mon.id + now));
      const item = E.makeItem(r, { level: b.L, cls: S.cls, minRarity: b.final ? "episch" : "selten", boost: b.final ? 2 : 0.6 });
      if (E.addItem(S, item)) rew.item = item;
      else {
        rew.itemSold = Math.round(item.value * 0.25);
        E.gainGold(S, rew.itemSold);
      }
      if (b.final) {
        rew.perlen = 3;
        S.perlen += 3;
        E.grantAch(S, "dungeon1");
      }
      E.gainGold(S, rew.gold);
      E.gainXp(S, rew.xp);
      S.stats.bosses++;
      S.stats.wins++;
      S.bestiary[b.mon.id] = (S.bestiary[b.mon.id] || 0) + 1;
      E.grantAch(S, "boss1");
    } else S.stats.losses++;
    E.checkAch(S, now);
    return rew;
  };
  E.skipDungeon = function (S, now) {
    now = now || E.now();
    if (S.dungeons.next <= now) return { ok: false };
    if (S.perlen < 1) return { ok: false, msg: "Dafür brauchst du eine Wolkenperle." };
    S.perlen -= 1;
    S.dungeons.next = now;
    return { ok: true };
  };

  /* ---------------- Laeden ---------------- */
  const SHOP_SLOTS = {
    schmiede: ["waffe", "helm", "ruestung", "handschuhe", "stiefel", "nebenhand"],
    arkanum: ["umhang", "amulett", "ring", "talisman", null, null],
  };
  E.refreshShop = function (S, shop, auto) {
    const r = U.rng(U.hash(S.name + shop + E.now() + Math.random()));
    const items = SHOP_SLOTS[shop].map((slot) => {
      const sl = slot || U.pick(r, ["umhang", "amulett", "ring", "talisman", "handschuhe", "stiefel", "helm"]);
      return E.makeItem(r, { level: S.level + U.ri(r, 0, 1), cls: S.cls, slot: sl, boost: 0.15 });
    });
    S.shops[shop] = { items, ts: E.now() };
    if (!auto) SB.bus.emit("shop", { shop });
  };
  E.rerollShop = function (S, shop) {
    if (S.perlen < 1) return { ok: false, msg: "Neue Ware kostet eine Wolkenperle." };
    S.perlen -= 1;
    E.refreshShop(S, shop);
    return { ok: true };
  };
  E.buyItem = function (S, shop, idx) {
    const sh = S.shops[shop];
    const it = sh && sh.items[idx];
    if (!it) return { ok: false, msg: "Schon verkauft." };
    if (S.gold < it.value) return { ok: false, msg: "Dafür reicht dein Gold nicht." };
    if (S.inv.length >= E.C.INV_SIZE) return { ok: false, msg: "Dein Rucksack ist voll." };
    S.gold -= it.value;
    E.addItem(S, it);
    sh.items[idx] = null;
    return { ok: true, item: it };
  };
  E.sellPrice = (it) => Math.max(1, Math.round(it.value * 0.25));
  E.sellItem = function (S, invIdx) {
    const it = S.inv[invIdx];
    if (!it) return { ok: false };
    S.inv.splice(invIdx, 1);
    const p = E.sellPrice(it);
    E.gainGold(S, p);
    return { ok: true, gold: p };
  };
  E.canEquip = function (S, it) {
    if (!it) return false;
    if (it.cls && it.cls !== S.cls) return false;
    return true;
  };
  E.equip = function (S, invIdx) {
    const it = S.inv[invIdx];
    if (!E.canEquip(S, it)) return { ok: false, msg: "Das kann deine Klasse nicht benutzen." };
    const old = S.equip[it.slot];
    S.equip[it.slot] = it;
    S.inv.splice(invIdx, 1);
    if (old) S.inv.splice(invIdx, 0, old);
    return { ok: true };
  };
  E.unequip = function (S, slot) {
    const it = S.equip[slot];
    if (!it) return { ok: false };
    if (S.inv.length >= E.C.INV_SIZE) return { ok: false, msg: "Dein Rucksack ist voll." };
    S.equip[slot] = null;
    S.inv.push(it);
    return { ok: true };
  };

  E.buyAttr = function (S, attr, times) {
    times = times || 1;
    let n = 0;
    while (n < times) {
      const c = E.attrCost(S.bought[attr]);
      if (S.gold < c) break;
      S.gold -= c;
      S.bought[attr]++;
      n++;
    }
    return { ok: n > 0, n, msg: n ? null : "Nicht genug Gold." };
  };

  E.potionCost = function (S, P) {
    if (P.cost.perlen) return { perlen: P.cost.perlen };
    return { gold: Math.round(E.goldBase(S.level) * P.cost.goldMult) };
  };
  E.buyPotion = function (S, id, now) {
    now = now || E.now();
    const P = D.POTIONS.find((p) => p.id === id);
    const c = E.potionCost(S, P);
    if (c.gold && S.gold < c.gold) return { ok: false, msg: "Dafür reicht dein Gold nicht." };
    if (c.perlen && S.perlen < c.perlen) return { ok: false, msg: "Dafür fehlen dir Wolkenperlen." };
    if (c.gold) S.gold -= c.gold;
    if (c.perlen) S.perlen -= c.perlen;
    E.applyPotion(S, id, now);
    return { ok: true };
  };
  E.applyPotion = function (S, id, now) {
    const P = D.POTIONS.find((p) => p.id === id);
    const ex = S.buffs.find((b) => b.id === id && b.until > now);
    if (ex) ex.until += P.mins * 60000;
    else S.buffs.push({ id, until: now + P.mins * 60000 });
  };

  E.buyMount = function (S, id) {
    const M = D.MOUNTS.find((m) => m.id === id);
    if (!M || S.mounts.owned.indexOf(id) >= 0) return { ok: false };
    if (M.cost.gold && S.gold < M.cost.gold) return { ok: false, msg: "Dafür reicht dein Gold nicht." };
    if (M.cost.perlen && S.perlen < M.cost.perlen) return { ok: false, msg: "Dafür fehlen dir Wolkenperlen." };
    if (M.cost.gold) S.gold -= M.cost.gold;
    if (M.cost.perlen) S.perlen -= M.cost.perlen;
    S.mounts.owned.push(id);
    E.grantAch(S, "reittier");
    return { ok: true };
  };

  /* ---------------- Wunschbrunnen ---------------- */
  E.tossWell = function (S, now) {
    now = now || E.now();
    let paid = false;
    if (S.daily.wellFree > 0) S.daily.wellFree--;
    else {
      if (S.daily.wellPaid >= E.C.WELL_PAID_MAX) return { ok: false, msg: "Der Brunnen ist für heute erschöpft." };
      if (S.perlen < 1) return { ok: false, msg: "Ein weiterer Wurf kostet eine Wolkenperle." };
      S.perlen -= 1;
      S.daily.wellPaid++;
      paid = true;
    }
    const r = U.rng(U.hash(S.name + "well" + now));
    const prize = U.wpick(r, D.WELL_PRIZES);
    const out = { ok: true, prize: prize.id, label: prize.label, paid };
    switch (prize.id) {
      case "gold":
        out.gold = Math.round(E.goldBase(S.level) * U.rf(r, 2, 4));
        E.gainGold(S, out.gold);
        break;
      case "goldGross":
        out.gold = Math.round(E.goldBase(S.level) * U.rf(r, 8, 12));
        E.gainGold(S, out.gold);
        break;
      case "perle":
        out.perlen = 1;
        S.perlen += 1;
        break;
      case "perlen3":
        out.perlen = 3;
        S.perlen += 3;
        break;
      case "tatendrang":
        out.energy = 30;
        E.setEnergy(S, E.energy(S, now) + 30, now);
        break;
      case "xp":
        out.xp = Math.round(E.xpNeed(S.level) * 0.1);
        E.gainXp(S, out.xp);
        break;
      case "item": {
        const it = E.makeItem(r, { level: S.level + 1, cls: S.cls, minRarity: "ungewoehnlich", boost: 0.8 });
        if (E.addItem(S, it)) out.item = it;
        else {
          out.gold = Math.round(it.value * 0.25);
          E.gainGold(S, out.gold);
          out.itemSold = true;
        }
        break;
      }
      case "trank":
        E.applyPotion(S, "sternenstaub", now);
        break;
    }
    return out;
  };

  /* ---------------- Ehrenabzeichen ---------------- */
  E.grantAch = function (S, id) {
    if (S.ach[id]) return false;
    const A = D.ACHIEVEMENTS.find((a) => a.id === id);
    if (!A) return false;
    S.ach[id] = E.now();
    S.perlen += A.perlen;
    SB.bus.emit("achievement", A);
    return true;
  };
  E.checkAch = function (S, now) {
    if (S.stats.quests >= 10) E.grantAch(S, "quest10");
    if (S.stats.quests >= 50) E.grantAch(S, "quest50");
    if (S.stats.quests >= 150) E.grantAch(S, "quest150");
    if (S.level >= 10) E.grantAch(S, "stufe10");
    if (S.level >= 25) E.grantAch(S, "stufe25");
    if (S.level >= 40) E.grantAch(S, "stufe40");
    if (S.stats.arenaWins >= 10) E.grantAch(S, "arena10");
    if (Object.keys(S.bestiary).length >= 12) E.grantAch(S, "bestiarium12");
    if (now !== undefined) {
      const all = E.allHeroes(S, now, SB.remoteHeroes || null);
      const me = all.find((h) => h.kind === "me");
      if (me && me.rank <= 10) E.grantAch(S, "arenaTop10");
    }
  };

  E.TIERS = TIERS;
})();
