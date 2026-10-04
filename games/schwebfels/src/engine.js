/* Helden von Schwebfels - Spiellogik ohne DOM (Version 2).
   Laeuft im Browser und in Node (fuer Tests und Balance-Simulationen). */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const D = SB.data;

  /* ---------------- Hilfsfunktionen ---------------- */
  const U = (SB.util = {});
  U.hash = function (str) {
    let h = 2166136261 >>> 0;
    str = String(str);
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
    ENERGY_REGEN_MS: 36 * 1000,
    BREW_ENERGY: 30,
    BREW_MAX: 5,
    MONSTER_Q: 1.1,
    SHIFT_MS: 5 * 60 * 1000,
    SHIFT_MAX: 8,
    ARENA_CD: 5 * 60 * 1000,
    DUNGEON_CD: 10 * 60 * 1000,
    STORY_CD: 5 * 60 * 1000,
    SHOP_REFRESH: 15 * 60 * 1000,
    INV_SIZE: 12,
    WELL_PAID_MAX: 10,
    SPECIAL_EVERY: 4,
    MAX_ACTIONS: 90,
    NPC_COUNT: 150,
    GUILD_COST: 500,
    CHAIN_BREATHER: 0.12,
  };
  E.xpNeed = (L) => Math.round(80 * Math.pow(L, 1.75) + 40);
  E.goldBase = (L) => Math.round(6 + 3.2 * Math.pow(L, 1.42));
  E.questXpFrac = (L) => Math.max(0.07, 0.3 - 0.0075 * (L - 1));
  E.attrCost = (b) => Math.round(3 + 0.45 * Math.pow(b, 1.62) + b * 1.5);
  E.itemStat = (L) => 1.5 + 0.9 * L;
  E.weaponAvg = (L) => 2 + 1.5 * L;
  E.baseDmg = (L) => [Math.round(1 + 0.6 * L), Math.round(2 + 0.9 * L)];
  E.armorBase = (L) => 6 + 4.5 * L;
  E.itemValue = (L) => 10 + 6 * Math.pow(L, 1.3);

  E.classOf = (S) => D.CLASSES[S.cls];
  E.archOf = (S) => D.CLASSES[S.cls].arch;
  const CLASS_FOR = {};
  for (const id in D.CLASSES) {
    const c = D.CLASSES[id];
    (CLASS_FOR[c.realm] = CLASS_FOR[c.realm] || {})[c.arch] = id;
  }
  E.CLASS_FOR = CLASS_FOR;

  /* ---------------- Heim (Housing) ---------------- */
  E.furn = (S, id) => (S.house && S.house.furn[id]) || 0;
  E.furnDef = (id) => D.FURNITURE.find((f) => f.id === id);
  E.energyMax = (S) => E.C.ENERGY_MAX + E.furn(S, "lager") * 10;
  E.invSize = (S) => E.C.INV_SIZE + E.furn(S, "truhe") * 2;
  E.bossesDefeated = (S) => Object.values(S.dungeons.progress).reduce((a, b) => a + b, 0);
  E.goldBonus = (S) => (E.furn(S, "trophaeen") ? E.bossesDefeated(S) * 0.01 : 0);
  E.xpBonus = (S) => E.furn(S, "herd") * 0.03;
  E.buyHouseTier = function (S) {
    const next = D.HOUSE_TIERS[S.house.tier + 1];
    if (!next) return { ok: false, msg: "Dein Heim ist bereits vollständig ausgebaut." };
    if (S.level < next.lv) return { ok: false, msg: "Dafür brauchst du Stufe " + next.lv + "." };
    if (S.gold < next.cost) return { ok: false, msg: "Dafür reicht dein Gold nicht." };
    if (next.perlen && S.perlen < next.perlen) return { ok: false, msg: "Dafür fehlen dir Wolkenperlen." };
    S.gold -= next.cost;
    if (next.perlen) S.perlen -= next.perlen;
    S.house.tier++;
    if (S.house.tier >= 1) E.grantAch(S, "heim");
    return { ok: true, name: next.name };
  };
  E.furnCost = function (S, id) {
    const f = E.furnDef(id);
    const lv = E.furn(S, id);
    if (lv >= f.levels.length) return null;
    return { gold: f.cost[lv], tier: f.tier[lv], name: f.levels[lv] };
  };
  E.buyFurniture = function (S, id) {
    const c = E.furnCost(S, id);
    if (!c) return { ok: false, msg: "Das ist bereits auf höchster Stufe." };
    if (S.house.tier < c.tier) return { ok: false, msg: "Dafür muss dein Heim zur " + D.HOUSE_TIERS[c.tier].name + " ausgebaut sein." };
    if (S.gold < c.gold) return { ok: false, msg: "Dafür reicht dein Gold nicht." };
    S.gold -= c.gold;
    S.house.furn[id] = E.furn(S, id) + 1;
    return { ok: true, name: c.name };
  };

  /* ---------------- Gegenstaende ---------------- */
  const ADJ_END = { m: "er", f: "e", n: "es", pl: "e" };
  const TINTS = {
    platte: ["#9aa4ad", "#b8bec4", "#7f8a96", "#c9a441", "#8d6b4a", "#5a6270"],
    leder: ["#6b4a2f", "#4a3424", "#8a5a35", "#3f4a2a", "#2f2a2a", "#5a3a2a"],
    stoff: ["#4b3f9f", "#2f4f8f", "#7a2f6f", "#2f6a5b", "#8a2a2a", "#3a3346"],
    schmuck: ["#e0b04a", "#c9d2d8", "#d98a4a", "#5fd0d6", "#c47bff", "#ff5a7a"],
    holz: ["#6b4a2f", "#4a3424", "#8a5a35"],
  };
  E.baseFor = function (slot, arch, r) {
    const A = D.ARCHETYPES[arch];
    if (slot === "waffe") return U.pick(r, A.weapons);
    if (slot === "nebenhand") return A.offhand;
    if (slot === "helm") return A.helm;
    if (slot === "ruestung") return A.chest;
    return slot;
  };
  E.rollRarity = function (r, opts) {
    opts = opts || {};
    const min = opts.minRarity ? D.RARITY_ORDER.indexOf(opts.minRarity) : 0;
    const boost = opts.boost || 0;
    const list = D.RARITY_ORDER.map((id, i) => ({ id, w: i < min ? 0 : D.RARITIES[id].weight * Math.pow(1 + boost, i) }));
    return U.wpick(r, list).id;
  };
  E.makeItem = function (r, opts) {
    const L = Math.max(1, Math.round(opts.level || 1));
    const arch = opts.arch || (opts.cls && D.CLASSES[opts.cls] ? D.CLASSES[opts.cls].arch : "krieger");
    const A = D.ARCHETYPES[arch];
    const slot = opts.slot || U.pick(r, D.SLOTS);
    const base = opts.base || E.baseFor(slot, arch, r);
    const B = D.BASES[base];
    const rarity = opts.rarity || E.rollRarity(r, opts);
    const R = D.RARITIES[rarity];
    const SI = D.SLOT_INFO[slot];
    const stats = {};
    const used = [];
    const statBase = E.itemStat(L) * R.mult * SI.stat;
    const lineMult = [1, 0.7, 0.55, 0.45];
    for (let i = 0; i < R.lines; i++) {
      let attr;
      if (i === 0) attr = r() < 0.68 ? A.main : "konstitution";
      else {
        const pool = D.ATTRS.filter((a) => used.indexOf(a) < 0).map((a) => ({ a, w: a === A.main ? 3 : a === "konstitution" ? 3 : a === "glueck" ? 2 : 1 }));
        attr = U.wpick(r, pool).a;
      }
      used.push(attr);
      stats[attr] = Math.max(1, Math.round(statBase * lineMult[i] * U.rf(r, 0.88, 1.12)));
    }
    const names = B.byArch ? B.byArch[arch] : B.names;
    const variant = Math.floor(r() * names.length);
    const item = { id: U.uid(), base, slot, arch: B.arch || null, level: L, rarity, stats, variant, style: variant % 3 };
    if (SI.armor > 0) item.armor = Math.max(1, Math.round(E.armorBase(L) * SI.armor * Math.pow(R.mult, 0.8) * U.rf(r, 0.9, 1.1)));
    if (slot === "waffe") {
      const avg = E.weaponAvg(L) * Math.pow(R.mult, 0.85) * U.rf(r, 0.94, 1.06);
      item.min = Math.max(1, Math.round(avg * 0.78));
      item.max = Math.max(item.min + 1, Math.round(avg * 1.22));
    }
    const noun = names[variant];
    const adj = U.pick(r, D.ADJ[rarity]);
    const adjWords = adj.split(" ");
    adjWords[adjWords.length - 1] += ADJ_END[B.g];
    let name = U.cap(adjWords.join(" ")) + " " + noun;
    if (D.RARITY_ORDER.indexOf(rarity) >= 2) name += " " + U.pick(r, D.SUFFIX[used[0]]);
    if (rarity === "legendaer") name = U.pick(r, D.LEGEND_NAMES) + ", " + adjWords.join(" ") + " " + noun;
    item.name = name;
    let palette;
    if (["amulett", "ring", "talisman"].indexOf(slot) >= 0) palette = TINTS.schmuck;
    else if (slot === "waffe" && ["bogen", "stab", "speer", "runenstab"].indexOf(base) >= 0) palette = TINTS.holz;
    else if (slot === "umhang") palette = TINTS.stoff.concat(TINTS.leder.slice(0, 2));
    else palette = TINTS[A.material];
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
    if (item.base === "schild" && C.arch === "krieger") s += 25 + item.level * 4;
    return s;
  };

  /* ---------------- Held erstellen ---------------- */
  E.defaultLook = (race) => {
    const R = D.RACES[race];
    return { skin: R.skins[0], hair: R.hairs[0], hairStyle: 0, beard: 0, eyes: D.EYES[0].c, tattoo: "keine", tattooColor: D.TATTOO_COLORS[0].c, scar: "keine", horns: 0 };
  };
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
      v: 2,
      created: now,
      name: opts.name,
      race: opts.race,
      realm: C.realm,
      gender: opts.gender,
      cls: opts.cls,
      look: Object.assign(E.defaultLook(opts.race), opts.look || {}),
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
      arena: { next: 0, wins: 0, losses: 0 },
      dungeons: { progress: {}, next: 0 },
      story: { done: {}, next: 0 },
      house: { tier: 0, furn: {} },
      guild: null,
      shops: {},
      buffs: [],
      mounts: { owned: [] },
      bestiary: {},
      ach: {},
      stats: { quests: 0, wins: 0, losses: 0, arenaWins: 0, bosses: 0, goldEarned: 0, items: 0, hordes: 0 },
      daily: { day: U.dayKey(now), wellFree: 1, brews: 0, arenaXp: 0, wellPaid: 0 },
      npcSeed: U.hash("npc:" + opts.name + now),
      npcHonor: {},
      settings: { sound: true, music: true, quality: "hoch", fastFights: false, dayCycle: "zyklus" },
      tut: 0,
      seen: {},
    };
    for (const s of D.SLOTS) S.equip[s] = null;
    S.equip.waffe = E.makeItem(r, { level: 1, slot: "waffe", arch: C.arch, rarity: "gewoehnlich", base: C.weapons[0] });
    S.equip.ruestung = E.makeItem(r, { level: 1, slot: "ruestung", arch: C.arch, rarity: "gewoehnlich" });
    S.equip.stiefel = E.makeItem(r, { level: 1, slot: "stiefel", arch: C.arch, rarity: "gewoehnlich" });
    if (C.arch === "krieger") S.equip.nebenhand = E.makeItem(r, { level: 1, slot: "nebenhand", arch: C.arch, rarity: "gewoehnlich" });
    E.refreshOffers(S);
    E.refreshShop(S, "schmiede", true);
    E.refreshShop(S, "arkanum", true);
    return S;
  };

  /* Alte Spielstaende (Version 1) uebernehmen */
  const RACE_MAP = { wolkling: "albier", steinbart: "kreidezwerg", hornvolk: "trollblut", nebelalb: "sidhe", moosling: "moorling" };
  const ARCH_MAP = { klinge: "krieger", wind: "jaeger", rune: "magier" };
  E.migrate = function (S) {
    if (!S || typeof S !== "object") return null;
    if (!S.v || S.v < 2) {
      if (!ARCH_MAP[S.cls]) return null;
      const race = RACE_MAP[S.race] || "albier";
      const realm = D.RACES[race].realm;
      const arch = ARCH_MAP[S.cls];
      S.race = race;
      S.realm = realm;
      S.cls = CLASS_FOR[realm][arch];
      const fixItem = (it) => {
        if (!it) return it;
        if (it.cls) it.arch = ARCH_MAP[it.cls] || null;
        else if (it.arch === undefined) it.arch = null;
        delete it.cls;
        if (it.variant === undefined) it.variant = it.style || 0;
        return it;
      };
      for (const s of D.SLOTS) S.equip[s] = fixItem(S.equip[s] || null);
      S.inv = (S.inv || []).map(fixItem);
      for (const k in S.shops || {}) S.shops[k].ts = 0;
      S.look = Object.assign(E.defaultLook(race), S.look || {});
      if (S.look.eyes === "#1d1b26") S.look.eyes = D.EYES[0].c;
      S.migratedFrom = 1;
      S.v = 2;
    }
    if (!D.CLASSES[S.cls] || !D.RACES[S.race]) return null;
    S.realm = D.CLASSES[S.cls].realm;
    S.settings = Object.assign({ sound: true, music: true, quality: "hoch", fastFights: false, dayCycle: "zyklus" }, S.settings || {});
    S.stats = Object.assign({ quests: 0, wins: 0, losses: 0, arenaWins: 0, bosses: 0, goldEarned: 0, items: 0, hordes: 0 }, S.stats || {});
    S.bestiary = S.bestiary || {};
    S.ach = S.ach || {};
    S.buffs = S.buffs || [];
    S.mounts = S.mounts || { owned: [] };
    S.npcHonor = S.npcHonor || {};
    S.story = S.story || { done: {}, next: 0 };
    S.house = S.house || { tier: 0, furn: {} };
    S.house.furn = S.house.furn || {};
    S.guild = S.guild || null;
    S.seen = S.seen || {};
    S.look = Object.assign(E.defaultLook(S.race), S.look || {});
    S.inv = (S.inv || []).filter(Boolean);
    for (const s of D.SLOTS) if (!(s in S.equip)) S.equip[s] = null;
    if (!S.quest.offers || !S.quest.offers.length || !S.quest.offers[0].waves) E.refreshOffers(S);
    if (S.quest.active && !S.quest.active.offer.waves) S.quest.active.offer.waves = [{ monster: S.quest.active.offer.monster, mlevel: S.quest.active.offer.mlevel, power: DIFF[S.quest.active.offer.diff || 2].power }];
    return S;
  };
  /* Nach der Uebernahme darf das Reich einmal gewechselt werden; die Grundart bleibt. */
  E.chooseRealm = function (S, realm) {
    if (!D.REALMS[realm]) return { ok: false };
    const arch = E.archOf(S);
    const raceIdx = Object.keys(D.RACES).filter((r) => D.RACES[r].realm === S.realm).indexOf(S.race);
    const newRaces = Object.keys(D.RACES).filter((r) => D.RACES[r].realm === realm);
    S.realm = realm;
    S.cls = CLASS_FOR[realm][arch];
    if (D.RACES[S.race].realm !== realm) {
      const old = S.race;
      S.race = newRaces[Math.max(0, raceIdx)] || newRaces[0];
      const R = D.RACES[S.race];
      if (R.skins.indexOf(S.look.skin) < 0) S.look.skin = R.skins[0];
      if (R.hairs.indexOf(S.look.hair) < 0) S.look.hair = R.hairs[0];
      for (const a of D.ATTRS) S.base[a] += (R.mods[a] || 0) - (D.RACES[old].mods[a] || 0);
    }
    delete S.migratedFrom;
    return { ok: true };
  };
  E.setLook = function (S, look) {
    S.look = Object.assign({}, S.look, look);
    return { ok: true };
  };

  /* ---------------- Werte des Helden ---------------- */
  E.activeBuffs = function (S, now) {
    now = now || E.now();
    S.buffs = (S.buffs || []).filter((b) => b.until > now);
    return S.buffs;
  };
  E.heroAttrs = function (S, now) {
    const C = E.classOf(S);
    const out = {};
    for (const a of D.ATTRS) {
      const auto = a === C.main || a === "konstitution" ? S.level - 1 : Math.floor((S.level - 1) / 2);
      out[a] = S.base[a] + S.bought[a] + auto;
    }
    for (const s of D.SLOTS) {
      const it = S.equip[s];
      if (it) for (const a in it.stats) out[a] += it.stats[a];
    }
    const mult = { kraft: 1, geschick: 1, verstand: 1, konstitution: 1, glueck: 1 };
    mult[C.main] += E.furn(S, "altar") * 0.02;
    for (const b of E.activeBuffs(S, now)) {
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
    return Math.round(a * (1 + E.furn(S, "staender") * 0.04));
  };
  E.damageReduction = (prof, armor, attLevel) => (prof.armorCap / 100) * (armor / (armor + 2.8 * attLevel + 30));
  E.critChance = (luck, defLevel, bonus) => U.clamp(0.03 + (0.5 * luck) / (luck + 8 * defLevel + 20) + (bonus || 0), 0.03, 0.6);
  E.profileFor = function (cls) {
    const C = D.CLASSES[cls];
    return {
      hpMult: C.hpMult, armorCap: C.armorCap, block: C.block, evade: C.evade, unblockable: C.unblockable, dmgMult: C.dmgMult, special: C.special,
      firstStrike: !!C.firstStrike, critBonus: C.critBonus || 0, critMult: C.critMult || 2,
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
  E.heroFighter = function (S, now) {
    const C = E.classOf(S);
    const attrs = E.heroAttrs(S, now);
    const prof = E.profileFor(S.cls);
    if (C.arch === "krieger" && !(S.equip.nebenhand && S.equip.nebenhand.base === "schild")) prof.block = 0;
    const w = S.equip.waffe;
    const L = S.level;
    return {
      kind: "hero", name: S.name, level: L, cls: S.cls, realm: S.realm, race: S.race, gender: S.gender, look: S.look,
      gear: E.gearVisual(S.equip), mainKey: C.main, attrs, prof,
      maxHp: Math.round(attrs.konstitution * prof.hpMult * (L + 1)),
      wMin: (w ? w.min : 0) + E.baseDmg(L)[0],
      wMax: (w ? w.max : 1) + E.baseDmg(L)[1],
      armor: E.armorTotal(S),
      ranged: !!(w && D.BASES[w.base] && D.BASES[w.base].ranged),
    };
  };
  E.summaryOf = function (f) {
    const red = E.damageReduction(f.prof, f.armor, f.level);
    const eff = 1 + f.attrs[f.mainKey] / 10;
    return {
      fighter: f, attrs: f.attrs, hp: f.maxHp,
      dmgMin: Math.round(f.wMin * eff * f.prof.dmgMult), dmgMax: Math.round(f.wMax * eff * f.prof.dmgMult),
      armor: f.armor, reduction: red, crit: E.critChance(f.attrs.glueck, f.level, f.prof.critBonus), block: f.prof.block, evade: f.prof.evade,
    };
  };
  E.heroSummary = (S, now) => E.summaryOf(E.heroFighter(S, now));
  /* Vergleich: Werte des Helden, wenn er einen Gegenstand anlegen wuerde */
  E.previewEquip = function (S, item) {
    const clone = JSON.parse(JSON.stringify({ equip: S.equip }));
    const tmp = Object.assign({}, S, { equip: clone.equip });
    tmp.equip[item.slot] = item;
    return { before: E.heroSummary(S), after: E.heroSummary(tmp) };
  };

  /* Modell-Held einer Stufe: Basis fuer Monster, NPC-Helden und Balance */
  E.modelAttrs = function (L, q) {
    q = q == null ? 1 : q;
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
        kind: "hero", name: "Modell", level: L, cls, realm: C.realm, mainKey: C.main, attrs, prof,
        maxHp: Math.round(attrs.konstitution * prof.hpMult * (L + 1)),
        wMin: Math.round(m.weapon * 0.78) + E.baseDmg(L)[0],
        wMax: Math.round(m.weapon * 1.22) + E.baseDmg(L)[1],
        armor: Math.round(m.armor),
        ranged: C.arch === "jaeger" || C.arch === "magier",
      },
      extra || {}
    );
  };
  E.monsterFighter = function (mon, L, power, opts) {
    opts = opts || {};
    const type = D.ARCH_TYPE[mon.arch];
    const T = D.MONSTER_TYPES[type];
    const ramp = Math.min(1, 0.62 + 0.042 * L);
    const p = power * ramp;
    const m = E.modelAttrs(L, E.C.MONSTER_Q);
    const attrs = { kraft: 0, geschick: 0, verstand: 0, konstitution: 0, glueck: 0 };
    attrs.kraft = attrs.geschick = attrs.verstand = Math.round(m.other * p);
    attrs[type] = Math.round(m.main * 0.86 * p);
    attrs.konstitution = Math.round(m.con * 0.95 * p);
    attrs.glueck = Math.round(m.luck * 0.8 * p);
    const hpBoost = opts.boss ? 1.25 : 1;
    const prof = { hpMult: T.hpMult, armorCap: T.armorCap, block: T.block, evade: T.evade, unblockable: T.unblockable, dmgMult: T.dmgMult, special: T.special, critMult: 2, critBonus: 0 };
    const wAvg = m.weapon * (0.85 + 0.15 * p) + (E.baseDmg(L)[0] + E.baseDmg(L)[1]) / 2;
    return {
      kind: "monster", id: mon.id, name: mon.name, arch: mon.arch, color: mon.color, accent: mon.accent,
      boss: !!opts.boss, final: !!opts.final, level: L, mainKey: type, attrs, prof,
      maxHp: Math.round(attrs.konstitution * prof.hpMult * (L + 1) * hpBoost),
      wMin: Math.max(1, Math.round(wAvg * 0.8)), wMax: Math.max(2, Math.round(wAvg * 1.2)),
      armor: Math.round(m.armor * 0.9 * p),
      ranged: type === "verstand",
    };
  };

  /* ---------------- Kampf ---------------- */
  const SPECIALS = {
    schildbrecher: { hits: [{ mult: 1.5, sure: true }], stun: 1 },
    kehlschnitt: { hits: [{ mult: 1.6, sure: true, critBoost: 0.25 }] },
    pfeilhagel: { hits: [{ mult: 0.7 }, { mult: 0.7 }, { mult: 0.7 }] },
    sonnenlanze: { hits: [{ mult: 1.8, sure: true, pierce: true }], heal: 0.08 },
    blutrausch: { hits: [{ mult: 2.4, sure: true, rage: true }] },
    giftklinge: { hits: [{ mult: 0.85 }, { mult: 0.85 }], poison: true },
    frostpfeil: { hits: [{ mult: 1.7 }], stun: 0.5 },
    runensturm: { hits: [{ mult: 0.9, sure: true }, { mult: 0.9, sure: true }, { mult: 0.9, sure: true }] },
    lebenssaft: { hits: [{ mult: 1.7, sure: true }], heal: 0.1 },
    schattentanz: { hits: [{ mult: 1.6 }], dodge: true },
    mondpfeil: { hits: [{ mult: 2.0, pierce: true }] },
    wurzelgriff: { hits: [{ mult: 1.5, sure: true }], stun: 1 },
    zermalmen: { hits: [{ mult: 1.8 }] },
    raserei: { hits: [{ mult: 0.85 }, { mult: 0.85 }] },
    fluch: { hits: [{ mult: 1.5, sure: true, pierce: true }] },
  };
  E.SPECIALS = SPECIALS;

  function baseHit(att, def, pvp) {
    const main = att.attrs[att.mainKey];
    const eff = pvp ? Math.max(main * 0.5, main - def.attrs[att.mainKey] * 0.5) : main;
    return ((att.wMin + att.wMax) / 2) * (1 + eff / 10) * att.prof.dmgMult;
  }

  E.simulate = function (A, B, seed, opts) {
    opts = opts || {};
    const r = U.rng(seed);
    const mk = (X, hp) => Object.assign({}, X, { hp: hp != null ? Math.min(hp, X.maxHp) : X.maxHp, meter: 0, stun: false, poison: null, dodgeNext: false });
    const f = [mk(A, opts.hp && opts.hp[0]), mk(B, opts.hp && opts.hp[1])];
    let turn;
    if (A.prof.firstStrike && !B.prof.firstStrike) turn = 0;
    else if (B.prof.firstStrike && !A.prof.firstStrike) turn = 1;
    else turn = (A.attrs.geschick + A.attrs.glueck) * U.rf(r, 0.8, 1.2) >= (B.attrs.geschick + B.attrs.glueck) * U.rf(r, 0.8, 1.2) ? 0 : 1;
    const pvp = A.kind !== "monster" && B.kind !== "monster";
    const events = [];
    let winner = -1;
    for (let i = 0; i < E.C.MAX_ACTIONS && winner < 0; i++) {
      const att = f[turn];
      const def = f[1 - turn];
      // Gift wirkt zu Beginn des eigenen Zuges
      if (att.poison && att.poison.turns > 0) {
        const pd = Math.max(1, Math.round(att.poison.dmg));
        att.hp = Math.max(0, att.hp - pd);
        att.poison.turns--;
        events.push({ a: turn, kind: "dot", dmg: pd, hp: [f[0].hp, f[1].hp] });
        if (att.hp <= 0) {
          winner = 1 - turn;
          break;
        }
      }
      if (att.stun) {
        att.stun = false;
        events.push({ a: turn, kind: "stun", hits: [], hp: [f[0].hp, f[1].hp] });
        turn = 1 - turn;
        continue;
      }
      att.meter++;
      const special = att.meter % E.C.SPECIAL_EVERY === 0 ? att.prof.special : null;
      const S0 = special ? SPECIALS[special.id] || { hits: [{ mult: 1 }] } : { hits: [{ mult: 1 }] };
      const out = [];
      let landed = false;
      const bh = baseHit(att, def, pvp);
      for (const h0 of S0.hits) {
        if (def.hp <= 0) break;
        const h = Object.assign({}, h0);
        if (h.rage && att.hp < att.maxHp * 0.5) h.mult *= 1.5;
        const sure = h.sure || att.prof.unblockable;
        if (def.dodgeNext && !h.sure) {
          def.dodgeNext = false;
          out.push({ res: "evade", dmg: 0 });
          continue;
        }
        if (!sure && def.prof.evade && r() < def.prof.evade) {
          out.push({ res: "evade", dmg: 0 });
          continue;
        }
        const blockChance = h.sure ? 0 : att.prof.unblockable ? def.prof.block * 0.5 : def.prof.block;
        if (blockChance && r() < blockChance) {
          out.push({ res: "block", dmg: 0 });
          continue;
        }
        const roll = U.rf(r, att.wMin, att.wMax) / ((att.wMin + att.wMax) / 2);
        const red = h.pierce ? 0 : E.damageReduction(def.prof, def.armor, att.level);
        // Lange Kaempfe werden hitziger: ab der 30. Aktion steigt der Schaden stetig
        const fury = 1 + Math.max(0, i - 30) * 0.08;
        let dmg = bh * roll * h.mult * (1 - red) * fury;
        const crit = r() < E.critChance(att.attrs.glueck, def.level, att.prof.critBonus + (h.critBoost || 0));
        if (crit) dmg *= att.prof.critMult || 2;
        dmg = Math.max(1, Math.round(dmg));
        def.hp = Math.max(0, def.hp - dmg);
        landed = true;
        out.push({ res: crit ? "crit" : "hit", dmg });
      }
      const ev = { a: turn, kind: special ? "special" : "attack", sp: special ? special.id : null, spName: special ? special.name : null, hits: out };
      if (special && S0.stun && landed && def.hp > 0 && (S0.stun >= 1 || r() < S0.stun)) {
        def.stun = true;
        ev.stun = true;
      }
      if (special && S0.poison && landed && def.hp > 0) {
        def.poison = { turns: 3, dmg: bh * 0.28 * (1 - E.damageReduction(def.prof, def.armor, att.level) * 0.5) };
        ev.poison = true;
      }
      if (special && S0.heal && att.hp > 0) {
        const heal = Math.round(att.maxHp * S0.heal);
        att.hp = Math.min(att.maxHp, att.hp + heal);
        ev.heal = heal;
      }
      if (special && S0.dodge) {
        att.dodgeNext = true;
        ev.dodge = true;
      }
      ev.hp = [f[0].hp, f[1].hp];
      events.push(ev);
      if (def.hp <= 0) winner = turn;
      turn = 1 - turn;
    }
    if (winner < 0) winner = f[0].hp / f[0].maxHp >= f[1].hp / f[1].maxHp ? 0 : 1;
    return { events, winner, hp: [f[0].hp, f[1].hp], max: [A.maxHp, B.maxHp] };
  };
  /* Mehrere Gegner nacheinander, Lebenspunkte des Helden werden mitgenommen */
  E.simulateChain = function (hero, foes, seed) {
    const waves = [];
    let hp = hero.maxHp;
    let winner = 0;
    for (let i = 0; i < foes.length; i++) {
      // Zwischen zwei Gegnern kurz Atem holen: ein kleiner Teil der Lebenspunkte kehrt zurueck
      if (i > 0) hp = Math.min(hero.maxHp, hp + Math.round(hero.maxHp * E.C.CHAIN_BREATHER));
      const res = E.simulate(hero, foes[i], seed + ":" + i, { hp: [hp, null] });
      res.startHp = hp;
      waves.push(res);
      hp = res.hp[0];
      if (res.winner !== 0) {
        winner = 1;
        break;
      }
    }
    return { waves, winner, hpLeft: hp };
  };
  E.estimateWin = function (A, B, n, salt) {
    n = n || 40;
    const foes = Array.isArray(B) ? B : [B];
    let w = 0;
    for (let i = 0; i < n; i++) if (E.simulateChain(A, foes, "est" + (salt || "") + i).winner === 0) w++;
    return w / n;
  };

  /* ---------------- Zeit, Energie, Tageswechsel ---------------- */
  E.energy = function (S, now) {
    now = now || E.now();
    const e = S.energy;
    const max = E.energyMax(S);
    if (e.val >= max) return e.val;
    return Math.min(max, e.val + (now - e.ts) / E.C.ENERGY_REGEN_MS);
  };
  E.setEnergy = function (S, val, now) {
    S.energy = { val, ts: now || E.now() };
  };
  E.nextEnergyIn = function (S, now) {
    now = now || E.now();
    const cur = E.energy(S, now);
    if (cur >= E.energyMax(S)) return 0;
    return (1 - (cur - Math.floor(cur))) * E.C.ENERGY_REGEN_MS;
  };
  E.nextMidnight = function (now) {
    const d = new Date(now || E.now());
    d.setHours(24, 0, 0, 0);
    return d.getTime();
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
  E.busy = function (S) {
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
    if (S.inv.length >= E.invSize(S)) return false;
    S.inv.push(item);
    S.stats.items++;
    if (item.rarity === "episch") E.grantAch(S, "episch");
    if (item.rarity === "legendaer") E.grantAch(S, "legendaer");
    return true;
  };
  function giveItem(S, item, rew) {
    if (E.addItem(S, item)) rew.item = item;
    else {
      rew.itemSold = Math.round(item.value * 0.25);
      E.gainGold(S, rew.itemSold);
    }
  }

  /* ---------------- Taverne / Auftraege ---------------- */
  const TIERS = [
    { id: "kurz", name: "Kurz", sec: [20, 35], energy: 6 },
    { id: "mittel", name: "Mittel", sec: [40, 70], energy: 10 },
    { id: "lang", name: "Lang", sec: [80, 120], energy: 14 },
  ];
  const DIFF = [null, { name: "Gemütlich", power: 0.88, reward: 0.85 }, { name: "Ordentlich", power: 0.97, reward: 1.0 }, { name: "Halsbrecherisch", power: 1.06, reward: 1.35 }];
  E.DIFF = DIFF;
  E.TIERS = TIERS;
  E.monstersFor = function (L) {
    let list = D.MONSTERS.filter((m) => L >= m.lv[0] && L <= m.lv[1]);
    if (list.length < 3) list = D.MONSTERS.slice().sort((a, b) => Math.abs((a.lv[0] + Math.min(a.lv[1], 60)) / 2 - L) - Math.abs((b.lv[0] + Math.min(b.lv[1], 60)) / 2 - L)).slice(0, 6);
    return list;
  };
  E.makeOffer = function (S, r, idx, used) {
    const L = S.level;
    const tier = TIERS[idx % 3 === 0 ? U.ri(r, 0, 1) : idx % 3 === 1 ? 1 : U.ri(r, 1, 2)];
    const diff = U.wpick(r, [{ d: 1, w: 38 }, { d: 2, w: 42 }, { d: 3, w: 20 }]).d;
    const rare = L >= 3 && r() < 0.08 + 0.04 * diff;
    const pool = E.monstersFor(L);
    let mon = U.pick(r, pool);
    for (let k = 0; k < 6 && used.mons.indexOf(mon.id) >= 0; k++) mon = U.pick(r, pool);
    used.mons.push(mon.id);
    const tplList = rare ? D.RARE_QUESTS : D.QUESTS;
    let tpl = U.pick(r, tplList);
    for (let k = 0; k < 8 && used.tpl.indexOf(tpl.t) >= 0; k++) tpl = U.pick(r, tplList);
    used.tpl.push(tpl.t);
    const place = U.pick(r, D.PLACES);
    const person = U.pick(r, D.PERSONS);
    const fill = (s) => s.replace(/\{m\}/g, mon.name).replace(/\{o\}/g, place).replace(/\{p\}/g, person);
    const energy = tier.energy + (rare ? 4 : 0);
    const ef = energy / 10;
    const dm = DIFF[diff].reward * (rare ? 1.5 : 1);
    const bonus = E.bestiaryBonus(S);
    const mlevel = Math.max(1, L + (diff === 3 ? U.ri(r, 0, 1) : diff === 1 ? -U.ri(r, 0, 1) : 0));
    let waves;
    if (rare) {
      const minions = pool.filter((m) => m.id !== mon.id);
      waves = [
        { monster: U.pick(r, minions.length ? minions : pool).id, mlevel: Math.max(1, mlevel - 1), power: DIFF[diff].power * E.HORDE.minion },
        { monster: U.pick(r, minions.length ? minions : pool).id, mlevel: Math.max(1, mlevel - 1), power: DIFF[diff].power * E.HORDE.minion },
        { monster: mon.id, mlevel, power: DIFF[diff].power * E.HORDE.boss, boss: true },
      ];
    } else waves = [{ monster: mon.id, mlevel, power: DIFF[diff].power }];
    const offer = {
      id: U.uid(), tpl: tpl.t, title: fill(tpl.t), text: U.cap(fill(tpl.x)), place, tier: tier.id,
      sec: U.ri(r, tier.sec[0], tier.sec[1]) + (rare ? 20 : 0), energy, diff, rare, monster: mon.id, mlevel, waves,
      xp: Math.max(5, Math.round(E.xpNeed(L) * E.questXpFrac(L) * ef * dm * U.rf(r, 0.9, 1.1) * bonus * (1 + E.xpBonus(S)))),
      gold: Math.max(3, Math.round(E.goldBase(L) * ef * dm * U.rf(r, 0.85, 1.15) * bonus * (1 + E.goldBonus(S)))),
      item: null,
      perle: r() < 0.05 + 0.02 * diff + (rare ? 0.2 : 0) ? 1 : 0,
      seed: Math.floor(r() * 1e9),
    };
    if (rare || r() < 0.3 + 0.08 * diff) offer.item = E.makeItem(r, { level: L + U.ri(r, 0, 1), cls: S.cls, slot: U.pick(r, D.SLOTS), boost: 0.25 * diff + (rare ? 1 : 0), minRarity: rare ? "ungewoehnlich" : null });
    return offer;
  };
  // Staerke der Gegner in Hordenauftraegen: der Held kaempft ohne Pause gegen alle nacheinander
  E.HORDE = { minion: 0.6, boss: 0.9 };
  E.refreshOffers = function (S) {
    const r = U.rng(S.quest.seed++);
    const used = { tpl: [], mons: [] };
    S.quest.offers = [0, 1, 2].map((i) => E.makeOffer(S, r, i, used));
  };
  E.questDuration = (S, offer) => Math.round(offer.sec * (1 - E.mountCut(S)) * 1000);
  E.startQuest = function (S, idx, now) {
    now = now || E.now();
    const o = S.quest.offers[idx];
    if (!o) return { ok: false, msg: "Dieser Auftrag existiert nicht mehr." };
    if (E.busy(S)) return { ok: false, msg: "Du bist gerade beschäftigt." };
    const en = E.energy(S, now);
    if (en < o.energy) return { ok: false, msg: "Dir fehlt der Tatendrang. Ein Krug Nebelmet hilft." };
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
  E.monById = (id) => D.MONSTERS.find((m) => m.id === id);
  E.questMonster = (o) => E.monById(o.monster);
  E.heroStrength = function (hero, L) {
    const m = E.modelHeroFighter(L, hero.cls, 1);
    const main = hero.attrs[hero.mainKey] / m.attrs[m.mainKey];
    const hp = hero.maxHp / m.maxHp;
    const wpn = (hero.wMin + hero.wMax) / (m.wMin + m.wMax);
    return U.clamp(Math.cbrt(main * hp * wpn), 0.4, 2.0);
  };
  /* Auftragsgegner wachsen mit dem Helden, aber nur halb so schnell wie seine tatsaechliche Staerke */
  E.adaptPower = (hero, L, p) => (hero ? p * (0.5 + 0.5 * E.heroStrength(hero, L)) : p);
  E.questFoes = function (o, hero) {
    return o.waves.map((w) => E.monsterFighter(E.monById(w.monster), w.mlevel, E.adaptPower(hero, w.mlevel, w.power), { boss: !!w.boss }));
  };
  E.questFight = function (S, now) {
    now = now || E.now();
    const a = S.quest.active;
    if (!a || a.end > now) return null;
    const o = a.offer;
    const hero = E.heroFighter(S, now);
    const foes = E.questFoes(o, hero);
    const chain = E.simulateChain(hero, foes, o.seed);
    return { hero, foes, chain, offer: o };
  };
  E.resolveQuest = function (S, fight) {
    const o = fight.offer;
    const won = fight.chain.winner === 0;
    const rew = { won, xp: 0, gold: 0, item: null, itemSold: 0, perle: 0 };
    S.quest.active = null;
    if (won) {
      rew.xp = o.xp;
      rew.gold = o.gold;
      E.gainGold(S, o.gold);
      if (o.item) giveItem(S, o.item, rew);
      if (o.perle) {
        S.perlen += o.perle;
        rew.perle = o.perle;
      }
      S.stats.wins++;
      for (const w of o.waves) S.bestiary[w.monster] = (S.bestiary[w.monster] || 0) + 1;
      if (o.rare) {
        S.stats.hordes++;
        E.grantAch(S, "horde");
      }
      E.grantAch(S, "ersterSieg");
    } else {
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
    if (S.perlen < 1) return { ok: false, msg: "Ein Krug Nebelmet kostet eine Wolkenperle." };
    S.perlen -= 1;
    S.daily.brews++;
    E.setEnergy(S, E.energy(S, now) + E.C.BREW_ENERGY, now);
    return { ok: true };
  };

  /* ---------------- Chronik (Geschichte) ---------------- */
  E.storyChapters = function (S) {
    const out = [];
    const realm = D.REALM_STORY[S.realm] || [];
    realm.forEach((c, i) => out.push(Object.assign({ key: "r" + i, kind: "realm", idx: i }, c)));
    (E.classOf(S).story || []).forEach((c, i) => out.push(Object.assign({ key: "c" + i, kind: "class", idx: i }, c)));
    out.sort((a, b) => a.lv - b.lv || (a.kind === "realm" ? -1 : 1));
    for (const c of out) {
      c.done = !!S.story.done[c.key];
      const prevKey = (c.kind === "realm" ? "r" : "c") + (c.idx - 1);
      c.available = !c.done && S.level >= c.lv && (c.idx === 0 || !!S.story.done[prevKey]);
    }
    return out;
  };
  E.storyFoes = function (S, ch, hero) {
    return ch.foes.map((f, i) => {
      let mon;
      if (f.mon) mon = E.monById(f.mon);
      else mon = { id: "story-" + S.realm + "-" + ch.key + "-" + i, name: f.name, arch: f.arch, color: f.color, accent: f.accent };
      const L = ch.lv + (f.boss ? 1 : 0);
      // Mehrere Gegner nacheinander: jeder einzelne ist schwaecher, die Kette bleibt eine Herausforderung
      const n = ch.foes.length;
      const p = f.final ? (n >= 3 ? 0.86 : 0.96) : f.boss ? (n >= 3 ? 0.82 : n === 2 ? 0.86 : 0.95) : n >= 3 ? 0.55 : n === 2 ? 0.66 : 0.78;
      return E.monsterFighter(mon, L, E.adaptPower(hero, L, p), { boss: !!f.boss, final: !!f.final });
    });
  };
  E.storyFight = function (S, key, now) {
    now = now || E.now();
    const ch = E.storyChapters(S).find((c) => c.key === key);
    if (!ch || !ch.available) return { ok: false, msg: "Dieses Kapitel ist noch nicht erreichbar." };
    if (E.busy(S)) return { ok: false, msg: "Du bist gerade beschäftigt." };
    if (S.story.next > now) return { ok: false, msg: "Du musst dich erst sammeln." };
    const hero = E.heroFighter(S, now);
    const foes = E.storyFoes(S, ch, hero);
    const chain = E.simulateChain(hero, foes, U.hash(S.name + key + now));
    return { ok: true, fight: { hero, foes, chain, chapter: ch } };
  };
  E.resolveStory = function (S, fight, now) {
    now = now || E.now();
    const ch = fight.chapter;
    const won = fight.chain.winner === 0;
    const rew = { won, xp: 0, gold: 0, item: null, perlen: 0, itemSold: 0 };
    if (!won) {
      S.story.next = now + E.C.STORY_CD;
      S.stats.losses++;
      return rew;
    }
    S.story.done[ch.key] = now;
    const final = ch.foes.some((f) => f.final);
    rew.xp = Math.round(E.xpNeed(S.level) * (ch.kind === "realm" ? 0.45 : 0.35));
    rew.gold = Math.round(E.goldBase(S.level) * (final ? 10 : 5));
    rew.perlen = final ? 4 : 2;
    S.perlen += rew.perlen;
    E.gainGold(S, rew.gold);
    const r = U.rng(U.hash(S.name + ch.key));
    giveItem(S, E.makeItem(r, { level: S.level + 1, cls: S.cls, minRarity: final ? "episch" : "selten", boost: 1 }), rew);
    E.gainXp(S, rew.xp);
    for (const f of fight.foes) S.bestiary[f.id] = (S.bestiary[f.id] || 0) + 1;
    S.stats.wins++;
    if (Object.keys(S.story.done).length >= 3) E.grantAch(S, "kapitel3");
    E.checkAch(S, now);
    return rew;
  };

  /* ---------------- Wachturm ---------------- */
  E.shiftPay = (S) => Math.round(E.goldBase(S.level) * 0.8);
  E.startGuard = function (S, shifts, now) {
    now = now || E.now();
    if (E.busy(S)) return { ok: false, msg: "Du bist gerade beschäftigt." };
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

  /* ---------------- NPC-Helden, Gilden, Ranglisten ---------------- */
  E.npcGuilds = function () {
    const out = [];
    for (const realm in D.GUILD_NAMES) D.GUILD_NAMES[realm].forEach(([name, tag], i) => out.push({ id: "g-" + realm + "-" + i, name, tag, realm, kind: "npc" }));
    return out;
  };
  E.npcList = function (S, now) {
    now = now || E.now();
    const out = [];
    const days = Math.max(0, (now - S.created) / 86400000);
    const r = U.rng(S.npcSeed);
    const realms = Object.keys(D.REALMS);
    const guilds = E.npcGuilds();
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
      const realm = realms[i % 3];
      const races = Object.keys(D.RACES).filter((x) => D.RACES[x].realm === realm);
      const race = U.pick(r, races);
      const archs = Object.keys(D.ARCHETYPES);
      const cls = E.CLASS_FOR[realm][U.pick(r, archs)];
      const R = D.RACES[race];
      const look = {
        skin: U.pick(r, R.skins), hair: U.pick(r, R.hairs), hairStyle: U.ri(r, 0, 5), beard: U.ri(r, 0, 4), eyes: U.pick(r, D.EYES).c,
        tattoo: r() < 0.5 ? U.pick(r, D.TATTOOS).id : "keine", tattooColor: U.pick(r, D.TATTOO_COLORS).c, scar: r() < 0.25 ? U.pick(r, D.SCARS).id : "keine", horns: U.ri(r, 0, 2),
      };
      const gender = r() < 0.5 ? "m" : "w";
      const q = U.rf(r, 0.82, 1.12);
      const honorBase = Math.round(60 + L * 32 + r() * 260);
      const id = "npc" + i;
      const gearSeed = Math.floor(r() * 1e9);
      const realmGuilds = guilds.filter((g) => g.realm === realm);
      const guild = r() < 0.7 ? realmGuilds[Math.floor(r() * realmGuilds.length)] : null;
      out.push({ id, kind: "npc", name, race, realm, cls, gender, look, level: L, q, honor: Math.max(0, honorBase + (S.npcHonor[id] || 0)), gearSeed, guild: guild ? { id: guild.id, name: guild.name, tag: guild.tag } : null });
    }
    return out;
  };
  E.npcGear = function (npc) {
    const r = U.rng(npc.gearSeed);
    const C = D.CLASSES[npc.cls];
    const A = D.ARCHETYPES[C.arch];
    const tintsFor = { platte: ["#9aa4ad", "#7f8a96", "#c9a441", "#5a6270"], leder: ["#6b4a2f", "#4a3424", "#3f4a2a", "#2f2a2a"], stoff: ["#4b3f9f", "#2f4f8f", "#7a2f6f", "#2f6a5b"] }[A.material];
    const rar = () => E.rollRarity(r, { boost: 0.4 });
    return {
      waffe: { base: U.pick(r, A.weapons), tint: U.pick(r, ["#6b4a2f", "#4a3424", "#9aa4ad"]), rarity: rar(), style: U.ri(r, 0, 2) },
      ruestung: { base: A.chest, tint: U.pick(r, tintsFor), rarity: rar(), style: U.ri(r, 0, 2) },
      helm: r() < 0.7 ? { base: A.helm, tint: U.pick(r, tintsFor), rarity: rar(), style: U.ri(r, 0, 2) } : null,
      umhang: r() < 0.65 ? { base: "umhang", tint: U.pick(r, ["#8a2a2a", "#2f4f8f", "#2f6a5b", "#3a3346", "#6b4a2f"]), rarity: rar(), style: U.ri(r, 0, 2) } : null,
      handschuhe: r() < 0.75 ? { base: "handschuhe", tint: U.pick(r, tintsFor), rarity: rar(), style: 0 } : null,
      stiefel: { base: "stiefel", tint: U.pick(r, tintsFor), rarity: rar(), style: 0 },
      nebenhand: r() < 0.85 ? { base: A.offhand, tint: U.pick(r, ["#8d6b4a", "#7f8a96", "#5fd0d6", "#6b4a2f"]), rarity: rar(), style: U.ri(r, 0, 2) } : null,
    };
  };
  E.npcFighter = function (npc) {
    const f = E.modelHeroFighter(npc.level, npc.cls, npc.q);
    Object.assign(f, { name: npc.name, race: npc.race, realm: npc.realm, gender: npc.gender, look: npc.look, gear: npc.gear || E.npcGear(npc), kind: "hero" });
    if (D.CLASSES[npc.cls].arch === "krieger" && (!f.gear.nebenhand || f.gear.nebenhand.base !== "schild")) f.prof.block = 0;
    return f;
  };
  E.remoteFighter = function (h, st) {
    const C = D.CLASSES[h.cls];
    const prof = E.profileFor(h.cls);
    if (C.arch === "krieger" && !st.shield) prof.block = 0;
    const w = h.gear && h.gear.waffe;
    return {
      kind: "hero", name: h.name, level: h.level, cls: h.cls, realm: h.realm, race: h.race, gender: h.gender, look: h.look, gear: h.gear,
      mainKey: C.main, attrs: st.attrs, prof, maxHp: Math.round(st.attrs.konstitution * prof.hpMult * (h.level + 1)),
      wMin: st.wMin, wMax: st.wMax, armor: st.armor, ranged: !!(w && D.BASES[w.base] && D.BASES[w.base].ranged),
    };
  };
  E.meEntry = (S) => ({ id: "me", kind: "me", name: S.name, race: S.race, realm: S.realm, cls: S.cls, gender: S.gender, look: S.look, level: S.level, honor: S.honor, guild: S.guild ? { id: S.guild.id, name: S.guild.name, tag: S.guild.tag } : null });
  E.allHeroes = function (S, now, remote) {
    const list = E.npcList(S, now);
    if (remote) for (const h of remote) list.push(h);
    list.push(E.meEntry(S));
    list.sort((a, b) => b.honor - a.honor || b.level - a.level);
    list.forEach((h, i) => (h.rank = i + 1));
    return list;
  };
  E.realmRanked = function (all, realm) {
    const l = all.filter((h) => h.realm === realm);
    l.forEach((h, i) => (h.realmRank = i + 1));
    return l;
  };
  E.allGuilds = function (S, remoteGuilds) {
    const out = E.npcGuilds();
    if (remoteGuilds) for (const g of remoteGuilds) if (!out.find((x) => x.id === g.id)) out.push(g);
    if (S.guild && !out.find((x) => x.id === S.guild.id)) out.push(Object.assign({ kind: "own" }, S.guild));
    return out;
  };
  E.guildLadder = function (S, now, remote, remoteGuilds) {
    const heroes = E.allHeroes(S, now, remote);
    const guilds = E.allGuilds(S, remoteGuilds).map((g) => Object.assign({ honor: 0, members: 0, top: null }, g));
    const byId = {};
    guilds.forEach((g) => (byId[g.id] = g));
    for (const h of heroes) {
      if (!h.guild || !byId[h.guild.id]) continue;
      const g = byId[h.guild.id];
      g.honor += h.honor;
      g.members++;
      if (!g.top || h.honor > g.top.honor) g.top = h;
    }
    const list = guilds.filter((g) => g.members > 0);
    list.sort((a, b) => b.honor - a.honor);
    list.forEach((g, i) => (g.rank = i + 1));
    return list;
  };
  E.realmStandings = function (S, now, remote) {
    const heroes = E.allHeroes(S, now, remote);
    const out = Object.keys(D.REALMS).map((id) => ({ id, honor: 0, heroes: 0, top: null }));
    for (const h of heroes) {
      const r = out.find((x) => x.id === h.realm);
      if (!r) continue;
      r.honor += h.honor;
      r.heroes++;
      if (!r.top || h.honor > r.top.honor) r.top = h;
    }
    out.sort((a, b) => b.honor - a.honor);
    out.forEach((r, i) => (r.rank = i + 1));
    return out;
  };
  E.createGuild = function (S, name, tag, id) {
    name = String(name || "").trim().replace(/\s+/g, " ");
    tag = String(tag || "").trim().toUpperCase();
    if (!/^[\p{L}\p{N} '\-]{3,24}$/u.test(name)) return { ok: false, msg: "Der Gildenname braucht 3 bis 24 Zeichen." };
    if (!/^[\p{L}\p{N}]{2,4}$/u.test(tag)) return { ok: false, msg: "Das Kürzel braucht 2 bis 4 Buchstaben oder Ziffern." };
    if (S.gold < E.C.GUILD_COST) return { ok: false, msg: "Eine Gilde zu gründen kostet " + E.C.GUILD_COST + " Gold." };
    S.gold -= E.C.GUILD_COST;
    S.guild = { id: id || "p-" + U.uid(), name, tag, realm: S.realm, founder: true };
    E.grantAch(S, "gilde");
    return { ok: true, guild: S.guild };
  };
  E.joinGuild = function (S, g) {
    if (!g || g.realm !== S.realm) return { ok: false, msg: "Du kannst nur einer Gilde deines Reiches beitreten." };
    S.guild = { id: g.id, name: g.name, tag: g.tag, realm: g.realm };
    E.grantAch(S, "gilde");
    return { ok: true };
  };
  E.leaveGuild = function (S) {
    S.guild = null;
    return { ok: true };
  };

  /* ---------------- Arena: Ring der Reiche ---------------- */
  E.arenaRivals = function (S, now, remote) {
    now = now || E.now();
    const all = E.allHeroes(S, now, remote);
    const me = all.find((h) => h.kind === "me");
    const foes = all.filter((h) => h.kind !== "me" && h.realm !== S.realm);
    const r = U.rng(S.npcSeed + S.arena.wins * 7 + S.arena.losses * 13 + Math.floor(now / E.C.ARENA_CD));
    const near = (lo, hi) => {
      const pool = foes.filter((h) => h.honor >= me.honor * lo && h.honor <= me.honor * hi);
      return pool.length ? U.pick(r, pool) : null;
    };
    const picks = [near(1.1, 2.0), near(0.85, 1.15), near(0.4, 0.9)];
    const fallback = foes.slice().sort((a, b) => Math.abs(a.honor - me.honor) - Math.abs(b.honor - me.honor));
    const out = [];
    for (const p of picks.concat(fallback)) {
      if (p && !out.find((x) => x.id === p.id)) out.push(p);
      if (out.length >= 3) break;
    }
    return out;
  };
  E.arenaFight = function (S, opp, now) {
    now = now || E.now();
    if (E.busy(S)) return { ok: false, msg: "Du bist gerade beschäftigt." };
    if (S.arena.next > now) return { ok: false, msg: "Baronin Krawall lässt dich noch nicht wieder in den Ring." };
    if (opp.realm === S.realm) return { ok: false, msg: "Im Ring kämpfen nur Helden verschiedener Reiche." };
    const hero = E.heroFighter(S, now);
    const foe = opp.fighter || E.npcFighter(opp);
    const chain = E.simulateChain(hero, [foe], U.hash(S.name + opp.id + now));
    return { ok: true, fight: { hero, foes: [foe], chain, opp } };
  };
  E.resolveArena = function (S, fight, now) {
    now = now || E.now();
    const opp = fight.opp;
    const won = fight.chain.winner === 0;
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
    return { mon, L: D0.base + floor, power: 0.95 + 0.02 * floor + (b.final ? 0.05 : 0), final: !!b.final };
  };
  E.dungeonFight = function (S, d, now) {
    now = now || E.now();
    const st = E.dungeonState(S, d);
    if (!st.unlocked) return { ok: false, msg: "Dieser Dungeon ist noch versiegelt." };
    if (st.done) return { ok: false, msg: "Diesen Dungeon hast du bereits gesäubert." };
    if (E.busy(S)) return { ok: false, msg: "Du bist gerade beschäftigt." };
    if (S.dungeons.next > now) return { ok: false, msg: "Du musst erst wieder zu Kräften kommen." };
    const b = E.bossFor(d, st.cleared);
    const hero = E.heroFighter(S, now);
    const foe = E.monsterFighter(b.mon, b.L, b.power, { boss: true, final: b.final });
    const chain = E.simulateChain(hero, [foe], U.hash(S.name + b.mon.id + now));
    return { ok: true, fight: { hero, foes: [foe], chain, dungeon: d, floor: st.cleared, boss: b } };
  };
  E.resolveDungeon = function (S, fight, now) {
    now = now || E.now();
    const won = fight.chain.winner === 0;
    const b = fight.boss;
    const rew = { won, xp: 0, gold: 0, item: null, perlen: 0, itemSold: 0 };
    S.dungeons.next = now + E.C.DUNGEON_CD;
    if (won) {
      const D0 = D.DUNGEONS[fight.dungeon];
      S.dungeons.progress[D0.id] = (S.dungeons.progress[D0.id] || 0) + 1;
      rew.xp = Math.round(E.xpNeed(Math.min(S.level, b.L)) * (b.final ? 0.6 : 0.32) * E.bestiaryBonus(S));
      rew.gold = Math.round(E.goldBase(b.L) * (b.final ? 8 : 3));
      const r = U.rng(U.hash(b.mon.id + now));
      giveItem(S, E.makeItem(r, { level: b.L, cls: S.cls, minRarity: b.final ? "episch" : "selten", boost: b.final ? 2 : 0.6 }), rew);
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
  const SHOP_SLOTS = { schmiede: ["waffe", "helm", "ruestung", "handschuhe", "stiefel", "nebenhand"], arkanum: ["umhang", "amulett", "ring", "talisman", null, null] };
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
    if (S.inv.length >= E.invSize(S)) return { ok: false, msg: "Dein Rucksack ist voll." };
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
  E.canEquip = (S, it) => !!it && (!it.arch || it.arch === E.archOf(S));
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
    if (S.inv.length >= E.invSize(S)) return { ok: false, msg: "Dein Rucksack ist voll." };
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
  E.potionCost = (S, P) => (P.cost.perlen ? { perlen: P.cost.perlen } : { gold: Math.round(E.goldBase(S.level) * P.cost.goldMult) });
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
    const ms = P.mins * 60000 * (1 + E.furn(S, "kessel") * 0.25);
    const ex = S.buffs.find((b) => b.id === id && b.until > now);
    if (ex) ex.until += ms;
    else S.buffs.push({ id, until: now + ms });
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
  E.tossWell = function (S, now, usePerl) {
    now = now || E.now();
    let paid = false;
    if (S.daily.wellFree > 0 && !usePerl) S.daily.wellFree--;
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
      const me = E.allHeroes(S, now, SB.remoteHeroes || null).find((h) => h.kind === "me");
      if (me && me.rank <= 10) E.grantAch(S, "arenaTop10");
    }
  };
})();
