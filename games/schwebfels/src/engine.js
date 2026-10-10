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
    // freier Wurf am Wunschbrunnen alle 8 Stunden (Wunsch des Kapitaens: ein Grund, wieder vorbeizuschauen)
    WELL_FREE_MS: 8 * 60 * 60 * 1000,
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
  /* Erscheinung eines Gegenstands (Version 5): benannte Grundform, Gestaltungskultur und Ornamentvariante.
     Wird ohne Zufallszug aus der Kennung abgeleitet und gespeichert: Beute, Werte und Zufallsfolge bleiben
     unveraendert, und der Gegenstand sieht in Laden, Rucksack, Vorschau, Kampf und nach dem Laden gleich aus. */
  E.VIS_VERSION = 1;
  E.formKey = function (base, variant, arch) {
    const B = D.BASES[base];
    if (!B) return null;
    return B.byArch ? base + "." + (B.byArch[arch] ? arch : "krieger") + "." + (variant | 0) : base + "." + (variant | 0);
  };
  E.makeVis = (it, culture, arch) => ({ f: E.formKey(it.base, it.variant, arch), c: D.REALMS[culture] ? culture : "albion", o: U.hash("o:" + it.id) % 3, v: E.VIS_VERSION });
  // Gegenstaende ohne Erscheinung (aeltere Spielstaende): Grundart von Handschuhen und Stiefeln steckt im Namen
  E.ensureVis = function (it, realm) {
    if (!it || typeof it !== "object" || !it.base || !D.BASES[it.base]) return it;
    if (it.vis && it.vis.f && it.vis.v === E.VIS_VERSION) return it;
    const B = D.BASES[it.base];
    let arch = it.arch;
    if (it.variant == null) it.variant = it.style || 0;
    if (B.byArch) {
      arch = null;
      for (const a in B.byArch) {
        const i = B.byArch[a].findIndex((n) => it.name && it.name.indexOf(n) >= 0);
        if (i >= 0) {
          arch = a;
          it.variant = i;
          break;
        }
      }
      arch = arch || "krieger";
    }
    it.vis = E.makeVis(it, (it.vis && it.vis.c) || realm, arch);
    return it;
  };
  E.visArch = (vis) => (vis && vis.f && vis.f.split(".").length === 3 ? vis.f.split(".")[1] : null);
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
    // Erscheinung: Kultur aus dem Reich der Klasse (Laden, Auftrag und Beute gehoeren zur Heimatinsel)
    item.vis = E.makeVis(item, opts.realm || (opts.cls && D.CLASSES[opts.cls] ? D.CLASSES[opts.cls].realm : null), arch);
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
      talents: {},
      shops: {},
      buffs: [],
      mounts: { owned: [] },
      bestiary: {},
      ach: {},
      stats: { quests: 0, wins: 0, losses: 0, arenaWins: 0, bosses: 0, goldEarned: 0, items: 0, hordes: 0, hardWins: 0, streak: 0, legendaries: 0 },
      daily: { day: U.dayKey(now), brews: 0, arenaXp: 0, wellPaid: 0, nightHunts: 0 },
      wellNext: 0,
      npcSeed: U.hash("npc:" + opts.name + now),
      npcHonor: {},
      settings: { sound: true, music: true, quality: "hoch", fastFights: false, dayCycle: "zyklus" },
      tut: 0,
      seen: {},
    };
    for (const s of D.SLOTS) S.equip[s] = null;
    S.equip.waffe = E.makeItem(r, { level: 1, slot: "waffe", arch: C.arch, realm: C.realm, rarity: "gewoehnlich", base: C.weapons[0] });
    S.equip.ruestung = E.makeItem(r, { level: 1, slot: "ruestung", arch: C.arch, realm: C.realm, rarity: "gewoehnlich" });
    S.equip.stiefel = E.makeItem(r, { level: 1, slot: "stiefel", arch: C.arch, realm: C.realm, rarity: "gewoehnlich" });
    if (C.arch === "krieger") S.equip.nebenhand = E.makeItem(r, { level: 1, slot: "nebenhand", arch: C.arch, realm: C.realm, rarity: "gewoehnlich" });
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
    S.stats = Object.assign({ quests: 0, wins: 0, losses: 0, arenaWins: 0, bosses: 0, goldEarned: 0, items: 0, hordes: 0, hardWins: 0, streak: 0, legendaries: 0 }, S.stats || {});
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
    S.daily = Object.assign({ nightHunts: 0 }, S.daily || {});
    // Version 0.67: freier Brunnenwurf alle 8 Stunden statt einmal am Tag (wer heute schon geworfen hat, darf gleich)
    if (typeof S.wellNext !== "number") S.wellNext = 0;
    delete S.daily.wellFree;
    S.talents = S.talents && typeof S.talents === "object" ? S.talents : {};
    S.arena = Object.assign({ next: 0, wins: 0, losses: 0 }, S.arena || {});
    S.look = Object.assign(E.defaultLook(S.race), S.look || {});
    S.inv = (S.inv || []).filter(Boolean);
    for (const s of D.SLOTS) if (!(s in S.equip)) S.equip[s] = null;
    // Version 5: jeder Gegenstand bekommt einmalig seine feste Erscheinung
    E.walkItems(S, (it) => E.ensureVis(it, S.realm));
    if (!S.quest.offers || !S.quest.offers.length || !S.quest.offers[0].waves) E.refreshOffers(S);
    if (S.quest.active && !S.quest.active.offer.waves) S.quest.active.offer.waves = [{ monster: S.quest.active.offer.monster, mlevel: S.quest.active.offer.mlevel, power: DIFF[S.quest.active.offer.diff || 2].power }];
    return S;
  };
  // alle Gegenstaende eines Spielstands (Ausruestung, Rucksack, Laeden, Auftragsbelohnungen)
  E.walkItems = function (S, fn) {
    const seen = new Set();
    const visit = (o, depth) => {
      if (!o || typeof o !== "object" || seen.has(o) || depth > 6) return;
      seen.add(o);
      if (o.base && o.slot && o.rarity && o.stats) {
        fn(o);
        return;
      }
      if (Array.isArray(o)) for (const x of o) visit(x, depth + 1);
      else for (const k in o) visit(o[k], depth + 1);
    };
    visit({ equip: S.equip, inv: S.inv, shops: S.shops, quest: S.quest, night: S.night, moon: S.moon }, 0);
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
  // Glueck verbessert die Beute: hoehere Chance auf seltenere Gegenstaende und auf Funde ueberhaupt
  E.lootBoost = function (S) {
    const luck = E.heroAttrs(S).glueck;
    const L = S.level;
    return U.clamp(luck / (luck + 12 * L + 60), 0, 0.5);
  };
  // Was ein Attribut fuer diesen Helden bewirkt und was ein weiterer Punkt bringt
  E.attrEffects = function (S, a, plus) {
    plus = plus || 1;
    const C = E.classOf(S);
    const f = E.heroFighter(S);
    const v = f.attrs[a];
    const L = S.level;
    const out = [];
    const pctS = (x) => (Math.round(x * 1000) / 10).toString().replace(".", ",") + " %";
    if (a === C.main) out.push({ t: "Hauptwert: jeder Punkt erhöht deinen Schaden", now: "Schaden ×" + (1 + v / 10).toFixed(1).replace(".", ","), up: "+" + pctS(plus / (10 + v)) + " Schaden" });
    else if (a !== "konstitution" && a !== "glueck") {
      const who = a === "kraft" ? "Krieger" : a === "geschick" ? "Schurken und Jäger" : "Magier";
      out.push({ t: "Im Ring der Reiche schwächt es " + who + ", die dich angreifen: ihr Vorteil sinkt um die Hälfte deines Werts", now: "", up: "" });
    }
    if (a === "konstitution") {
      const per = Math.round(f.prof.hpMult * (L + 1) * (1 + ((f.tal && f.tal.hp) || 0)));
      out.push({ t: "Bestimmt deine Lebenspunkte", now: U.fmt(f.maxHp) + " LP", up: "+" + U.fmt(per * plus) + " LP" });
    }
    if (a === "glueck") {
      const c0 = E.critChance(v, L, f.prof.critBonus);
      const c1 = E.critChance(v + plus, L, f.prof.critBonus);
      out.push({ t: "Kritische Treffer gegen Gegner deiner Stufe", now: pctS(c0), up: "+" + pctS(c1 - c0) });
      const lb = E.lootBoost(S);
      const lb1 = U.clamp((v + plus) / (v + plus + 12 * L + 60), 0, 0.5);
      out.push({ t: "Bessere Beute: höhere Chance auf seltene Gegenstände und auf Funde in der Taverne", now: "+" + pctS(lb), up: "+" + pctS(lb1 - lb) });
    }
    if (a === "geschick" || a === "glueck") out.push({ t: "Zusammen mit " + (a === "geschick" ? "Glück" : "Geschick") + " entscheidet es, wer zuerst zuschlägt" + (f.prof.firstStrike ? " (du schlägst als Schurke ohnehin zuerst zu)" : ""), now: "", up: "" });
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
  /* ---------------- Talentbaeume ---------------- */
  E.C.TALENT_RESET_PERLEN = 3;
  const TREE_CACHE = {};
  // Baum einer Klasse: drei Zweige mit je fuenf Talenten (Stufe 1 bis 4)
  E.talentTree = function (cls) {
    if (TREE_CACHE[cls]) return TREE_CACHE[cls];
    const C = D.CLASSES[cls];
    const TA = D.TALENT_ARCH[C.arch];
    const TC = D.TALENT_CLASS[cls];
    const mk = (b, [k, name, tier, max, eff, note]) => ({ id: b + "." + k, branch: b, name, tier, max, eff, note: note || "" });
    const classBranch = [
      ["sp", C.special.name + "-Meisterschaft", 1, 3, { spDmg: 0.08 }],
      ["spc", "Präziser " + C.special.name, 2, 3, { spCrit: 0.08 }],
      ["sig", TC.sig[0], 2, 2, TC.sig[1]],
      ["ls", "Kampfrausch", 3, 2, { lifesteal: 0.03 }],
      ["cap", "Großmeister", 4, 1, { spEvery: 3 }, "Aktive Fähigkeit: " + C.special.name + " kommt öfter."],
    ];
    const tree = {
      cls,
      branches: [
        { key: "o", name: TC.names[0], kind: "Angriff", talents: TA.o.map((t) => mk("o", t)) },
        { key: "d", name: TC.names[1], kind: "Verteidigung", talents: TA.d.map((t) => mk("d", t)) },
        { key: "c", name: TC.names[2], kind: "Klassenpfad", talents: classBranch.map((t) => mk("c", t)) },
      ],
    };
    tree.byId = {};
    for (const b of tree.branches) for (const t of b.talents) tree.byId[t.id] = t;
    return (TREE_CACHE[cls] = tree);
  };
  E.talentPointsFor = (L) => Math.max(0, Math.floor(L / 2));
  E.talentPoints = (S) => E.talentPointsFor(S.level);
  const sumRanks = (ranks, pred) => Object.keys(ranks || {}).reduce((a, k) => a + (pred(k) ? ranks[k] || 0 : 0), 0);
  E.talentSpent = (S) => sumRanks(S.talents, () => true);
  E.talentFree = (S) => E.talentPoints(S) - E.talentSpent(S);
  E.branchSpent = (ranks, b) => sumRanks(ranks, (k) => k.indexOf(b + ".") === 0);
  E.talentCheck = function (cls, ranks, id, points) {
    const tree = E.talentTree(cls);
    const t = tree.byId[id];
    if (!t) return { ok: false, msg: "Dieses Talent gibt es nicht." };
    const cur = (ranks && ranks[id]) || 0;
    if (cur >= t.max) return { ok: false, msg: "Schon voll ausgebaut." };
    if (sumRanks(ranks, () => true) >= points) return { ok: false, msg: "Keine Talentpunkte frei. Alle zwei Stufen kommt einer dazu." };
    const need = D.TALENT_TIER_REQ[t.tier];
    if (E.branchSpent(ranks, t.branch) < need) return { ok: false, msg: "Dafür brauchst du " + need + " Punkte in diesem Zweig." };
    return { ok: true, t };
  };
  E.learnTalent = function (S, id) {
    S.talents = S.talents || {};
    const c = E.talentCheck(S.cls, S.talents, id, E.talentPoints(S));
    if (!c.ok) return c;
    S.talents[id] = (S.talents[id] || 0) + 1;
    return { ok: true, talent: c.t, rank: S.talents[id] };
  };
  E.resetTalents = function (S) {
    if (!E.talentSpent(S)) return { ok: false, msg: "Du hast noch keine Talente gelernt." };
    if (S.perlen < E.C.TALENT_RESET_PERLEN) return { ok: false, msg: "Das Zurücksetzen kostet " + E.C.TALENT_RESET_PERLEN + " Wolkenperlen." };
    S.perlen -= E.C.TALENT_RESET_PERLEN;
    S.talents = {};
    return { ok: true };
  };
  // Alle Raenge zusammengefasst zu Wirkungen; ungueltige Eintraege (fremde Klasse, zu viele Punkte) fallen weg
  E.talentEffects = function (cls, ranks, L) {
    const tree = E.talentTree(cls);
    const eff = { _names: {} };
    let budget = L != null ? E.talentPointsFor(L) : Infinity;
    for (const b of tree.branches)
      for (const t of b.talents) {
        let n = Math.min(t.max, Math.max(0, Math.floor((ranks && ranks[t.id]) || 0)));
        n = Math.min(n, budget);
        if (n <= 0) continue;
        budget -= n;
        for (const k in t.eff) {
          eff[k] = (eff[k] || 0) + t.eff[k] * (k === "spEvery" || k === "firstStrike" || k === "assassinate" || k === "vanish" || k === "wild" ? 1 : n);
          eff._names[k] = t.name;
        }
      }
    if (eff.spEvery) eff.spEvery = 3;
    return eff;
  };
  // Feste Werte aus Talenten auf einen Kaempfer anwenden; der Rest wirkt im Kampf
  E.applyTalents = function (f, eff) {
    f.tal = eff;
    if (!eff) return f;
    if (eff.hp) f.maxHp = Math.round(f.maxHp * (1 + eff.hp));
    if (eff.armor) f.armor = Math.round(f.armor * (1 + eff.armor));
    f.prof = Object.assign({}, f.prof);
    if (eff.dmg) f.prof.dmgMult *= 1 + eff.dmg;
    if (eff.crit) f.prof.critBonus = (f.prof.critBonus || 0) + eff.crit;
    if (eff.critMult) f.prof.critMult = (f.prof.critMult || 2) + eff.critMult;
    if (eff.block && f.prof.block > 0) f.prof.block += eff.block;
    if (eff.evade) f.prof.evade = (f.prof.evade || 0) + eff.evade;
    if (eff.firstStrike) f.prof.firstStrike = true;
    return f;
  };
  // Talentverteilung fuer computergesteuerte Helden: ein Hauptzweig bis zur Spitze, dann der zweite
  E.autoTalents = function (cls, L, seed, maxPts) {
    const tree = E.talentTree(cls);
    const r = U.rng("tal" + seed);
    const order = [0, 1, 2].sort(() => r() - 0.5);
    const ranks = {};
    let pts = Math.min(E.talentPointsFor(L), maxPts != null ? maxPts : Infinity);
    for (const bi of order) {
      const b = tree.branches[bi];
      for (const t of b.talents)
        while (pts > 0 && E.talentCheck(cls, ranks, t.id, E.talentPointsFor(L)).ok) {
          ranks[t.id] = (ranks[t.id] || 0) + 1;
          pts--;
        }
    }
    return ranks;
  };

  // Darstellung aller zehn Plaetze (auch Amulett, Ring und Talisman) mit fester Erscheinung
  E.gearVisual = function (equip) {
    const g = {};
    for (const s of D.SLOTS) {
      const it = equip[s];
      g[s] = it ? { base: it.base, tint: it.tint, rarity: it.rarity, style: it.style || 0, variant: it.variant || 0, vis: it.vis ? { f: it.vis.f, c: it.vis.c, o: it.vis.o, v: it.vis.v } : null } : null;
    }
    return g;
  };
  // Darstellung des Helden: wie gearVisual, nur ohne Helm, wenn der Spieler ihn im Charakterfenster ausgeblendet hat
  // (die Werte bleiben, andere Spieler und Kaempfe zeigen ihn ebenfalls nicht)
  E.heroGear = function (S) {
    const g = E.gearVisual(S.equip);
    if (S.look && S.look.hideHelm) g.helm = null;
    return g;
  };
  E.heroFighter = function (S, now) {
    const C = E.classOf(S);
    const attrs = E.heroAttrs(S, now);
    const prof = E.profileFor(S.cls);
    if (C.arch === "krieger" && !(S.equip.nebenhand && S.equip.nebenhand.base === "schild")) prof.block = 0;
    const w = S.equip.waffe;
    const L = S.level;
    const f = {
      kind: "hero", name: S.name, level: L, cls: S.cls, realm: S.realm, race: S.race, gender: S.gender, look: S.look,
      gear: E.heroGear(S), mainKey: C.main, attrs, prof,
      maxHp: Math.round(attrs.konstitution * prof.hpMult * (L + 1)),
      wMin: (w ? w.min : 0) + E.baseDmg(L)[0],
      wMax: (w ? w.max : 1) + E.baseDmg(L)[1],
      armor: E.armorTotal(S),
      ranged: !!(w && D.BASES[w.base] && D.BASES[w.base].ranged),
    };
    return E.applyTalents(f, E.talentEffects(S.cls, S.talents, L));
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
      kind: "monster", id: mon.id, name: mon.name, arch: mon.arch, color: mon.color, accent: mon.accent, realms: mon.realms || null,
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

  // Talentnamen fuer die Anzeige im Kampf
  const talName = (X, key, fallback) => (X.tal && X.tal._names && X.tal._names[key]) || fallback;
  E.simulate = function (A, B, seed, opts) {
    opts = opts || {};
    const r = U.rng(seed);
    const mk = (X, hp) =>
      Object.assign({}, X, {
        hp: hp != null ? Math.min(hp, X.maxHp) : X.maxHp, meter: 0, stun: false, poison: null, dodgeNext: 0,
        T: X.tal || {}, ward: Math.round(X.maxHp * ((X.tal && X.tal.ward) || 0)), purge: (X.tal && X.tal.purge) || 0,
        windUsed: false, vanishUsed: false, opened: false, dazed: false,
      });
    const f = [mk(A, opts.hp && opts.hp[0]), mk(B, opts.hp && opts.hp[1])];
    let turn;
    if (A.prof.firstStrike && !B.prof.firstStrike) turn = 0;
    else if (B.prof.firstStrike && !A.prof.firstStrike) turn = 1;
    else turn = (A.attrs.geschick + A.attrs.glueck) * U.rf(r, 0.8, 1.2) >= (B.attrs.geschick + B.attrs.glueck) * U.rf(r, 0.8, 1.2) ? 0 : 1;
    const pvp = A.kind !== "monster" && B.kind !== "monster";
    const events = [];
    const hpNow = () => [f[0].hp, f[1].hp];
    // Barrieren zu Kampfbeginn
    for (let i = 0; i < 2; i++) if (f[i].ward > 0) events.push({ a: i, kind: "talent", id: "ward", name: talName(f[i], "ward", "Barriere"), ward: f[i].ward, hp: hpNow() });
    // Ein Treffer: Schaden, Krit, Talente des Angreifers und des Verteidigers
    function strike(att, def, h, special, i, bh) {
      const AT = att.T;
      const DT = def.T;
      const roll = U.rf(r, att.wMin, att.wMax) / ((att.wMin + att.wMax) / 2);
      let red = h.pierce ? 0 : E.damageReduction(def.prof, def.armor, att.level);
      red *= 1 - Math.min(0.9, (AT.pierce || 0) + (special ? AT.spPierce || 0 : 0));
      const fury = 1 + Math.max(0, i - 30) * 0.08;
      let mult = h.mult;
      if (special) mult *= 1 + (AT.spDmg || 0);
      if (h.rage && att.hp < att.maxHp * 0.5) mult *= 1.5 + (AT.rageBonus || 0);
      const tags = [];
      if (!att.opened && AT.opener) {
        mult *= 1 + AT.opener;
        tags.push("opener");
      }
      if (AT.execute && def.hp < def.maxHp * 0.35) {
        mult *= 1 + AT.execute;
        tags.push("execute");
      }
      if (AT.afterStun && def.dazed) {
        mult *= 1 + AT.afterStun;
        tags.push("afterStun");
      }
      let dmg = bh * roll * mult * (1 - red) * fury;
      const cBonus = att.prof.critBonus + (h.critBoost || 0) + (special ? AT.spCrit || 0 : 0);
      const crit = (!att.opened && AT.assassinate) || r() < E.critChance(att.attrs.glueck, def.level, cBonus);
      if (crit) dmg *= (att.prof.critMult || 2) + (special ? AT.spCritMult || 0 : 0);
      if (!att.opened && AT.assassinate) tags.push("assassinate");
      // Wilde Macht (Abschluss-Talent der Magier): kritische Zauber zeigt der Kampf als Explosion
      if (crit && AT.wild) tags.push("wild");
      dmg *= 1 - (DT.toughness || 0);
      if (att.mainKey === "verstand") dmg *= 1 - (DT.magicRes || 0);
      dmg = Math.max(1, Math.round(dmg));
      let absorbed = 0;
      if (def.ward > 0) {
        absorbed = Math.min(def.ward, dmg);
        def.ward -= absorbed;
        dmg -= absorbed;
      }
      def.hp = Math.max(0, def.hp - dmg);
      att.opened = true;
      const out = { res: crit ? "crit" : "hit", dmg };
      if (absorbed) out.absorbed = absorbed;
      if (h.tal) tags.push(h.tal);
      if (tags.length) out.tags = tags;
      return out;
    }
    // Reaktionen des Verteidigers nach einem Angriff: Verschwinden, zweiter Atem, Gegenschlag
    function reactions(di, ai, ev, evaded) {
      const def = f[di];
      const att = f[ai];
      const after = [];
      if (def.hp <= 0) return after;
      if (def.T.vanish && !def.vanishUsed && def.hp < def.maxHp * 0.4) {
        def.vanishUsed = true;
        def.dodgeNext = Math.max(def.dodgeNext, 2);
        after.push({ a: di, kind: "talent", id: "vanish", name: talName(def, "vanish", "Verschwinden"), hp: hpNow() });
      }
      if (def.T.secondWind && !def.windUsed && def.hp < def.maxHp * 0.3) {
        def.windUsed = true;
        const heal = Math.round(def.maxHp * def.T.secondWind);
        def.hp = Math.min(def.maxHp, def.hp + heal);
        after.push({ a: di, kind: "talent", id: "secondWind", name: talName(def, "secondWind", "Zweiter Atem"), heal, hp: hpNow() });
      }
      if (evaded && def.T.riposte && att.hp > 0 && r() < def.T.riposte) {
        const hit = strike(def, att, { mult: 0.7, tal: "riposte" }, false, curI, baseHit(def, att, pvp));
        if (def.T.lifesteal) def.hp = Math.min(def.maxHp, def.hp + Math.round(hit.dmg * def.T.lifesteal));
        after.push({ a: di, kind: "counter", name: talName(def, "riposte", "Gegenschlag"), hits: [hit], hp: hpNow() });
      }
      return after;
    }
    let winner = -1;
    let curI = 0;
    for (let i = 0; i < E.C.MAX_ACTIONS && winner < 0; i++) {
      curI = i;
      const att = f[turn];
      const def = f[1 - turn];
      // Gift wirkt zu Beginn des eigenen Zuges
      if (att.poison && att.poison.turns > 0) {
        const pd = Math.max(1, Math.round(att.poison.dmg));
        att.hp = Math.max(0, att.hp - pd);
        att.poison.turns--;
        events.push({ a: turn, kind: "dot", dmg: pd, hp: hpNow() });
        if (att.hp <= 0) {
          winner = 1 - turn;
          break;
        }
      }
      if (att.stun) {
        att.stun = false;
        att.dazed = true;
        events.push({ a: turn, kind: "stun", hits: [], hp: hpNow() });
        turn = 1 - turn;
        continue;
      }
      att.meter++;
      const every = att.T.spEvery || E.C.SPECIAL_EVERY;
      const special = att.meter % every === 0 ? att.prof.special : null;
      const S0 = special ? SPECIALS[special.id] || { hits: [{ mult: 1 }] } : { hits: [{ mult: 1 }] };
      const hits = S0.hits.slice();
      if (special && att.T.spHits) for (let k = 0; k < att.T.spHits; k++) hits.push({ mult: 0.5 });
      if (!special && att.T.double && r() < att.T.double) hits.push({ mult: 0.6, tal: "double" });
      const out = [];
      let landed = false;
      let evaded = false;
      let healed = 0;
      const bh = baseHit(att, def, pvp);
      for (const h0 of hits) {
        if (def.hp <= 0) break;
        const h = Object.assign({}, h0);
        const sure = h.sure || att.prof.unblockable;
        if (def.dodgeNext > 0 && !h.sure) {
          def.dodgeNext--;
          out.push({ res: "evade", dmg: 0 });
          evaded = true;
          continue;
        }
        if (!sure && def.prof.evade && r() < def.prof.evade) {
          out.push({ res: "evade", dmg: 0 });
          evaded = true;
          continue;
        }
        const blockChance = h.sure ? 0 : att.prof.unblockable ? def.prof.block * 0.5 : def.prof.block;
        if (blockChance && r() < blockChance) {
          out.push({ res: "block", dmg: 0 });
          evaded = true;
          continue;
        }
        const hit = strike(att, def, h, !!special, i, bh);
        landed = true;
        if (att.T.lifesteal && hit.dmg > 0) healed += Math.round(hit.dmg * att.T.lifesteal);
        out.push(hit);
      }
      def.dazed = false;
      const ev = { a: turn, kind: special ? "special" : "attack", sp: special ? special.id : null, spName: special ? special.name : null, hits: out };
      // fuer die Darstellung der Abschluss-Talente: Grossmeister (Spezialangriff oefter), Pfeilsalve (zusaetzliche Treffer)
      if (special && att.T.spEvery) ev.master = true;
      if (special && att.T.spHits) ev.volley = att.T.spHits;
      if (healed > 0 && att.hp > 0) {
        att.hp = Math.min(att.maxHp, att.hp + healed);
        ev.lifesteal = healed;
      }
      const stunChance = special && S0.stun ? Math.min(1, S0.stun + (att.T.stunChance || 0)) : 0;
      const after = [];
      if (special && stunChance && landed && def.hp > 0 && (stunChance >= 1 || r() < stunChance)) {
        if (def.purge > 0) {
          def.purge--;
          after.push({ a: 1 - turn, kind: "talent", id: "purge", name: talName(def, "purge", "Reinigung"), hp: null });
        } else {
          def.stun = true;
          ev.stun = true;
        }
      }
      if (special && S0.poison && landed && def.hp > 0) {
        if (def.purge > 0) {
          def.purge--;
          after.push({ a: 1 - turn, kind: "talent", id: "purge", name: talName(def, "purge", "Reinigung"), hp: null });
        } else {
          def.poison = { turns: 3, dmg: bh * 0.28 * (1 + (att.T.poisonPow || 0)) * (1 - E.damageReduction(def.prof, def.armor, att.level) * 0.5) };
          ev.poison = true;
        }
      }
      if (special && S0.heal && att.hp > 0) {
        const heal = Math.round(att.maxHp * S0.heal * (1 + (att.T.healPow || 0)));
        att.hp = Math.min(att.maxHp, att.hp + heal);
        ev.heal = heal;
      }
      if (special && S0.dodge) {
        att.dodgeNext = Math.max(att.dodgeNext, 1);
        ev.dodge = true;
      }
      ev.hp = hpNow();
      events.push(ev);
      for (const x of after.concat(reactions(1 - turn, turn, ev, evaded))) {
        if (!x.hp) x.hp = hpNow();
        events.push(x);
      }
      if (def.hp <= 0) winner = turn;
      else if (att.hp <= 0) winner = 1 - turn;
      turn = 1 - turn;
    }
    if (winner < 0) winner = f[0].hp / f[0].maxHp >= f[1].hp / f[1].maxHp ? 0 : 1;
    return { events, winner, hp: hpNow(), max: [A.maxHp, B.maxHp] };
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
  /* Tageszeit: 0 = Mitternacht, 0.5 = Mittag. Modi: zyklus (20 Minuten), echtzeit, tag, nacht */
  E.C.DAY_CYCLE_MS = 20 * 60 * 1000;
  E.dayTime = function (mode, now) {
    now = now || E.now();
    if (mode === "tag") return 0.5;
    if (mode === "nacht") return 0.02;
    if (mode === "echtzeit") {
      const d = new Date(now);
      return (d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600) / 24;
    }
    return (now / E.C.DAY_CYCLE_MS + 0.3) % 1;
  };
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  E.dayInfo = function (t) {
    const sunH = -Math.cos(t * 2 * Math.PI);
    const day = smooth(-0.12, 0.3, sunH);
    const dusk = Math.max(0, 1 - Math.abs(sunH - 0.02) / 0.28);
    return { t, sunH, day, dusk, night: 1 - day };
  };
  E.isNight = (mode, now) => E.dayInfo(E.dayTime(mode, now)).night >= 0.5;
  // Millisekunden bis zum naechsten Wechsel zwischen Tag und Nacht (Infinity, wenn er nie kommt)
  E.nightChangeIn = function (mode, now) {
    now = now || E.now();
    if (mode === "tag" || mode === "nacht") return Infinity;
    const cur = E.isNight(mode, now);
    const step = mode === "echtzeit" ? 60000 : 5000;
    const span = mode === "echtzeit" ? 86400000 : E.C.DAY_CYCLE_MS;
    for (let dt = step; dt <= span; dt += step) if (E.isNight(mode, now + dt) !== cur) return dt;
    return Infinity;
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
      S.daily = { day, brews: 0, arenaXp: 0, wellPaid: 0, nightHunts: 0 };
      toast("Ein neuer Tag auf Schwebfels.", "info");
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
    if (item.rarity === "legendaer") {
      S.stats.legendaries = (S.stats.legendaries || 0) + 1;
      E.grantAch(S, "legendaer");
    }
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
  // Schwierigkeit 0.72: ordentlich 1.0 (vorher 0.97), halsbrecherisch 1.15 (vorher 1.06); zusammen mit der gemessenen
  // Heldenstaerke (heroStrength) ist halsbrecherisch wieder ein Wagnis (Stufe 31 mit Talenten: Horde etwa 70 bis 85 %)
  const DIFF = [null, { name: "Gemütlich", power: 0.88, reward: 0.85 }, { name: "Ordentlich", power: 1.0, reward: 1.0 }, { name: "Halsbrecherisch", power: 1.15, reward: 1.35 }];
  E.DIFF = DIFF;
  E.TIERS = TIERS;
  // Gegner passend zur Stufe; mit Reich bevorzugt die Geschoepfe der eigenen Heimatinsel
  E.monstersFor = function (L, realm) {
    const fits = (m) => L >= m.lv[0] && L <= m.lv[1];
    let list = D.MONSTERS.filter(fits);
    if (realm) {
      const own = list.filter((m) => !m.realms || m.realms.indexOf(realm) >= 0);
      if (own.length >= 3) return own;
    }
    if (list.length < 3) list = D.MONSTERS.slice().sort((a, b) => Math.abs((a.lv[0] + Math.min(a.lv[1], 60)) / 2 - L) - Math.abs((b.lv[0] + Math.min(b.lv[1], 60)) / 2 - L)).slice(0, 6);
    return list;
  };
  // Verliesbosse in der Taverne (Wunsch des Kapitaens: selten ein Boss aus den Verliesen, damit es nicht eintoenig
  // wird): je Angebot mit dieser Wahrscheinlichkeit, hoechstens einer je Auswahl, nur Bosse aus Verliesen, die die Stufe
  // schon oeffnet, ohne die Endbosse (die bleiben dem Verlies vorbehalten). Er kaempft wie ein Gegner der Stufe mit den
  // Lebenspunkten eines Bosses; Belohnung wie ein seltener Auftrag und mehr, immer mit Gegenstand.
  E.C.BOSS_OFFER = 0.05;
  E.C.BOSS_OFFER_LV = 10;
  E.tavernBosses = (L) => {
    const out = [];
    for (const D0 of D.DUNGEONS) if (L >= D0.unlock) D0.bosses.forEach((b, f) => !b.final && out.push(E.dungeonMon(D0.id + "-" + f)));
    return out;
  };
  function makeBossOffer(S, r, tier, diff, boss) {
    const L = S.level;
    const D0 = D.DUNGEONS.find((d) => d.id === boss.dungeon);
    const tpl = U.pick(r, D.BOSS_QUESTS);
    const place = U.pick(r, D.PLACES);
    const person = U.pick(r, D.PERSONS);
    const fill = (s) => s.replace(/\{m\}/g, boss.name).replace(/\{d\}/g, D0.name).replace(/\{o\}/g, place).replace(/\{p\}/g, person);
    const energy = tier.energy + 4;
    const ef = energy / 10;
    const dm = DIFF[diff].reward * 1.8;
    const bonus = E.bestiaryBonus(S);
    // Stufe des Helden, auch halsbrecherisch (Boss-Lebenspunkte und hoehere Staerke reichen als Wagnis)
    const mlevel = Math.max(1, L);
    const offer = {
      id: U.uid(), tpl: tpl.t, title: fill(tpl.t), text: U.cap(fill(tpl.x)), place, tier: tier.id,
      sec: U.ri(r, tier.sec[0], tier.sec[1]) + 20, energy, diff, rare: false, boss: D0.id, monster: boss.id, mlevel,
      waves: [{ monster: boss.id, mlevel, power: DIFF[diff].power, boss: true }],
      xp: Math.max(5, Math.round(E.xpNeed(L) * E.questXpFrac(L) * ef * dm * U.rf(r, 0.9, 1.1) * bonus * (1 + E.xpBonus(S)))),
      gold: Math.max(3, Math.round(E.goldBase(L) * ef * dm * U.rf(r, 0.85, 1.15) * bonus * (1 + E.goldBonus(S)))),
      item: E.makeItem(r, { level: L + 1, cls: S.cls, slot: U.pick(r, D.SLOTS), boost: 0.25 * diff + 1.2 + E.lootBoost(S), minRarity: "selten" }),
      perle: r() < 0.35 + 0.05 * diff ? 1 : 0,
      seed: Math.floor(r() * 1e9),
    };
    return offer;
  }
  E.makeOffer = function (S, r, idx, used) {
    const L = S.level;
    const tier = TIERS[idx % 3 === 0 ? U.ri(r, 0, 1) : idx % 3 === 1 ? 1 : U.ri(r, 1, 2)];
    const diff = U.wpick(r, [{ d: 1, w: 38 }, { d: 2, w: 42 }, { d: 3, w: 20 }]).d;
    if (L >= E.C.BOSS_OFFER_LV && !used.boss && r() < E.C.BOSS_OFFER) {
      const bosses = E.tavernBosses(L).filter((b) => used.mons.indexOf(b.id) < 0);
      if (bosses.length) {
        const boss = U.pick(r, bosses);
        used.boss = true;
        used.mons.push(boss.id);
        return makeBossOffer(S, r, tier, Math.max(2, diff), boss);
      }
    }
    const rare = L >= 3 && r() < 0.08 + 0.04 * diff;
    const pool = E.monstersFor(L, S.realm);
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
    const lb = E.lootBoost(S);
    if (rare || r() < 0.3 + 0.08 * diff + lb * 0.25) offer.item = E.makeItem(r, { level: L + U.ri(r, 0, 1), cls: S.cls, slot: U.pick(r, D.SLOTS), boost: 0.25 * diff + (rare ? 1 : 0) + lb, minRarity: rare ? "ungewoehnlich" : null });
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
  // Verliesbosse haben die Kennung <verlies>-<stockwerk> (wie in E.bossFor)
  E.dungeonMon = function (id) {
    const m = /^(.+)-(\d+)$/.exec(id || "");
    const D0 = m && D.DUNGEONS.find((d) => d.id === m[1]);
    const b = D0 && D0.bosses[+m[2]];
    return b ? { id, name: b.name, arch: b.arch, color: b.color, accent: b.accent, dungeon: D0.id } : null;
  };
  E.monById = (id) => D.MONSTERS.find((m) => m.id === id) || E.dungeonMon(id);
  E.questMonster = (o) => E.monById(o.monster);
  /* Staerke des Helden als Faktor auf die Gegnerstaerke: gesucht ist die Staerke zweier fester Pruefgegner, bei der
     der Held so abschneidet wie der Modellheld seiner Klasse (gewoehnliche Ausruestung, keine Talente) bei Staerke 1.
     Gemessen statt geschaetzt, damit Talente (Doppelschlag, Lebensraub, zweiter Atem ...), Ruestung und Traenke
     mitzaehlen; vorher zaehlten nur Hauptwert, Lebenspunkte und Waffe, und ab Stufe 30 gewann man selbst
     halsbrecherische Horden immer mit drei Vierteln der Lebenspunkte. Je Kaempferwerten einmal gerechnet. */
  const EDGE = {};
  E.heroStrength = function (hero, L) {
    if (!hero || !hero.cls || !D.CLASSES[hero.cls]) return 1;
    const tal = hero.tal ? Object.keys(hero.tal).filter((k) => k !== "_names").sort().map((k) => k + ":" + hero.tal[k]).join(",") : "";
    const ck = [hero.cls, L, hero.maxHp, hero.wMin, hero.wMax, hero.armor, JSON.stringify(hero.attrs), JSON.stringify(hero.prof), tal].join("|");
    if (EDGE[ck]) return EDGE[ck];
    const mons = E.monstersFor(L).slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    const refs = [mons[0], mons[Math.floor(mons.length / 2)]].filter(Boolean);
    const plain = E.modelHeroFighter(L, hero.cls, 1);
    const N = 16;
    const score = (f, p) => {
      let s = 0;
      for (const mon of refs)
        for (let i = 0; i < N; i++) {
          const r = E.simulate(f, E.monsterFighter(mon, L, p), "edge" + mon.id + i);
          if (r.winner === 0) s += 0.5 + (0.5 * Math.max(0, r.hp[0])) / f.maxHp;
        }
      return s / (refs.length * N);
    };
    const target = score(plain, 1);
    let lo = 1;
    let hi = 1;
    if (score(hero, 1) > target) {
      hi = 1.25;
      while (score(hero, hi) > target && hi < 3) {
        lo = hi;
        hi *= 1.25;
      }
    } else {
      lo = 0.8;
      while (score(hero, lo) < target && lo > 0.4) {
        hi = lo;
        lo *= 0.8;
      }
    }
    for (let it = 0; it < 6; it++) {
      const mid = (lo + hi) / 2;
      if (score(hero, mid) > target) lo = mid;
      else hi = mid;
    }
    return (EDGE[ck] = U.clamp(Math.round(((lo + hi) / 2) * 100) / 100, 0.4, 3));
  };
  /* Gegner in Auftraegen, Chronik und Nachtjagd wachsen mit dem Helden: um drei Viertel seines Vorsprungs vor dem
     Modellhelden (vorher die Haelfte, und Talente zaehlten nicht); bessere Ausruestung und Talente lohnen sich weiter */
  E.ADAPT_FOLLOW = 0.75;
  E.adaptPower = (hero, L, p) => (hero ? p * (1 - E.ADAPT_FOLLOW + E.ADAPT_FOLLOW * E.heroStrength(hero, L)) : p);
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
      if (o.boss) S.stats.tavernBosses = (S.stats.tavernBosses || 0) + 1;
      if (o.diff === 3) S.stats.hardWins++;
      S.stats.streak++;
      if (fight.hero && fight.chain.hpLeft <= fight.hero.maxHp * 0.05) E.grantAch(S, "knapp");
      E.grantAch(S, "ersterSieg");
    } else {
      rew.xp = Math.round(o.xp * 0.25);
      rew.gold = Math.round(o.gold * 0.25);
      E.gainGold(S, rew.gold);
      S.stats.losses++;
      S.stats.streak = 0;
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
      let p = f.final ? (n >= 3 ? 0.86 : 0.96) : f.boss ? (n >= 3 ? 0.82 : n === 2 ? 0.86 : 0.95) : n >= 3 ? 0.55 : n === 2 ? 0.66 : 0.78;
      // zweiter Akt (ab Stufe 40): Endkaempfe mit Gewicht, der Held soll merken, dass es um alles geht
      if (ch.lv >= 40) p *= f.final ? (n >= 2 ? 1.12 : 1.05) : 1.05;
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
    giveItem(S, E.makeItem(r, { level: S.level + 1, cls: S.cls, minRarity: final ? "episch" : "selten", boost: 1 + E.lootBoost(S) }), rew);
    E.gainXp(S, rew.xp);
    for (const f of fight.foes) S.bestiary[f.id] = (S.bestiary[f.id] || 0) + 1;
    S.stats.wins++;
    if (Object.keys(S.story.done).length >= 3) E.grantAch(S, "kapitel3");
    E.checkAch(S, now);
    return rew;
  };

  /* ---------------- Mondtor: nur bei Nacht ---------------- */
  E.C.NIGHT_HUNTS = 3;
  E.NIGHT_POWER = { minion: 0.69, boss: 0.9 };
  E.nightHuntsLeft = (S) => Math.max(0, E.C.NIGHT_HUNTS - ((S.daily && S.daily.nightHunts) || 0));
  // Die Nachtjagd: zwei Nachtwesen der eigenen Heimatinsel nacheinander
  E.nightHuntFoes = function (S, hero, n) {
    const list = D.NIGHT_FOES[S.realm] || D.NIGHT_FOES.albion;
    const r = U.rng(U.hash(S.name + S.daily.day + ":" + n));
    const a = U.pick(r, list);
    let b = U.pick(r, list);
    for (let k = 0; k < 6 && b.id === a.id; k++) b = U.pick(r, list);
    const L = S.level;
    return [
      E.monsterFighter(a, L, E.adaptPower(hero, L, E.NIGHT_POWER.minion), {}),
      E.monsterFighter(b, L + 1, E.adaptPower(hero, L + 1, E.NIGHT_POWER.boss), { boss: true }),
    ];
  };
  E.nightHuntPreview = function (S, now) {
    const hero = E.heroFighter(S, now);
    return E.nightHuntFoes(S, hero, (S.daily.nightHunts || 0) + 1);
  };
  E.nightHunt = function (S, night, now) {
    now = now || E.now();
    if (!night) return { ok: false, msg: "Das Mondtor öffnet sich erst, wenn es Nacht wird." };
    if (E.busy(S)) return { ok: false, msg: "Du bist gerade beschäftigt." };
    if (E.nightHuntsLeft(S) <= 0) return { ok: false, msg: "Für heute Nacht sind die Nachtwesen gebannt. Morgen wieder." };
    const hero = E.heroFighter(S, now);
    const n = (S.daily.nightHunts || 0) + 1;
    const foes = E.nightHuntFoes(S, hero, n);
    const chain = E.simulateChain(hero, foes, U.hash(S.name + "nacht" + S.daily.day + n));
    return { ok: true, fight: { hero, foes, chain, n } };
  };
  E.resolveNightHunt = function (S, fight) {
    const won = fight.chain.winner === 0;
    S.daily.nightHunts = (S.daily.nightHunts || 0) + 1;
    const rew = { won, xp: 0, gold: 0, item: null, itemSold: 0, perle: 0 };
    const L = S.level;
    if (won) {
      rew.xp = Math.round(E.xpNeed(L) * E.questXpFrac(L) * 1.6 * (1 + E.xpBonus(S)));
      rew.gold = Math.round(E.goldBase(L) * 1.8 * (1 + E.goldBonus(S)));
      E.gainGold(S, rew.gold);
      const r = U.rng(U.hash(S.name + "mondbeute" + S.daily.day + fight.n));
      giveItem(S, E.makeItem(r, { level: L + 1, cls: S.cls, minRarity: "selten", boost: 0.8 + E.lootBoost(S) }), rew);
      if (r() < 0.35) {
        S.perlen += 1;
        rew.perle = 1;
      }
      for (const f of fight.foes) S.bestiary[f.id] = (S.bestiary[f.id] || 0) + 1;
      S.stats.wins++;
      S.stats.nightHunts = (S.stats.nightHunts || 0) + 1;
    } else {
      rew.xp = Math.round(E.xpNeed(L) * E.questXpFrac(L) * 0.3);
      S.stats.losses++;
    }
    E.gainXp(S, rew.xp);
    E.checkAch(S);
    return rew;
  };
  // Der Mondhaendler: drei besondere Stuecke je Nacht, mindestens selten, oft episch
  E.moonShop = function (S, now) {
    now = now || E.now();
    const day = U.dayKey(now);
    const cur = S.shops.mond;
    if (!cur || cur.day !== day || cur.level !== S.level) {
      const r = U.rng(U.hash(S.name + "mond" + day + S.level));
      const items = [0, 1, 2].map((i) => {
        const it = E.makeItem(r, { level: S.level + 1, cls: S.cls, slot: U.pick(r, D.SLOTS), minRarity: i === 2 ? "episch" : "selten", boost: 1.2 });
        it.value = Math.round(it.value * 1.6);
        return it;
      });
      // bereits gekaufte Plaetze bleiben am selben Tag leer
      const sold = cur && cur.day === day ? cur.items.map((x) => x === null) : [false, false, false];
      S.shops.mond = { day, level: S.level, ts: now, items: items.map((it, i) => (sold[i] ? null : it)) };
    }
    return S.shops.mond.items;
  };
  E.buyMoonItem = function (S, idx, night, now) {
    if (!night) return { ok: false, msg: "Selene Silberblick verkauft nur bei Nacht." };
    E.moonShop(S, now);
    return E.buyItem(S, "mond", idx);
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
  // Version 5: Grundform und Kultur der Computerhelden ohne zusaetzlichen Zufallszug (aus dem Ausruestungssamen)
  const npcGearRolled = E.npcGear;
  E.npcGear = function (npc) {
    const g = npcGearRolled(npc);
    const C = D.CLASSES[npc.cls];
    const h = (k) => U.hash(npc.gearSeed + ":" + k);
    const culture = npc.realm || C.realm;
    const rar = (g.ruestung && g.ruestung.rarity) || "gewoehnlich";
    if (h("amulett") % 10 < 6) g.amulett = { base: "amulett", tint: "#c9a441", rarity: rar };
    if (h("ring") % 10 < 5) g.ring = { base: "ring", tint: "#c9ccd2", rarity: rar };
    if (h("talisman") % 10 < 4) g.talisman = { base: "talisman", tint: "#8d6b4a", rarity: rar };
    for (const s in g) {
      const it = g[s];
      if (!it) continue;
      const B = D.BASES[it.base];
      const names = B.byArch ? B.byArch[C.arch] : B.names;
      it.variant = h("v" + s) % names.length;
      it.vis = { f: E.formKey(it.base, it.variant, C.arch), c: culture, o: h("o" + s) % 3, v: E.VIS_VERSION };
    }
    return g;
  };
  E.npcFighter = function (npc) {
    const f = E.modelHeroFighter(npc.level, npc.cls, npc.q);
    Object.assign(f, { name: npc.name, race: npc.race, realm: npc.realm, gender: npc.gender, look: npc.look, gear: npc.gear || E.npcGear(npc), kind: "hero" });
    if (D.CLASSES[npc.cls].arch === "krieger" && (!f.gear.nebenhand || f.gear.nebenhand.base !== "schild")) f.prof.block = 0;
    return E.applyTalents(f, E.talentEffects(npc.cls, E.autoTalents(npc.cls, npc.level, npc.gearSeed), npc.level));
  };
  E.remoteFighter = function (h, st) {
    const C = D.CLASSES[h.cls];
    const prof = E.profileFor(h.cls);
    if (C.arch === "krieger" && !st.shield) prof.block = 0;
    const w = h.gear && h.gear.waffe;
    const f = {
      kind: "hero", name: h.name, level: h.level, cls: h.cls, realm: h.realm, race: h.race, gender: h.gender, look: h.look, gear: h.gear,
      mainKey: C.main, attrs: st.attrs, prof, maxHp: Math.round(st.attrs.konstitution * prof.hpMult * (h.level + 1)),
      wMin: st.wMin, wMax: st.wMax, armor: st.armor, ranged: !!(w && D.BASES[w.base] && D.BASES[w.base].ranged),
    };
    return E.applyTalents(f, E.talentEffects(h.cls, h.talents || {}, h.level));
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
  /* Vier Herausforderer aus den anderen Reichen, deren Staerke zum Helden passt:
     einer leicht, zwei ausgeglichen, einer schwer. Echte Mitspieler und Helden der Ranglisten haben Vorrang,
     fehlt ein passender, tritt ein Wanderkaempfer gleicher Stufe an. Die Auswahl bleibt bis zum naechsten Kampf. */
  E.ARENA_TARGETS = [{ c: 0.78, label: "Leicht" }, { c: 0.58, label: "Ausgeglichen" }, { c: 0.46, label: "Ausgeglichen" }, { c: 0.32, label: "Schwer" }];
  E.wanderFighter = function (w) {
    const f = E.modelHeroFighter(w.level, w.cls, w.q);
    Object.assign(f, { name: w.name, race: w.race, realm: w.realm, gender: w.gender, look: w.look, gear: E.npcGear(w), kind: "hero" });
    if (D.CLASSES[w.cls].arch === "krieger" && (!f.gear.nebenhand || f.gear.nebenhand.base !== "schild")) f.prof.block = 0;
    return E.applyTalents(f, E.talentEffects(w.cls, E.autoTalents(w.cls, w.level, w.gearSeed, w.tp), w.level));
  };
  E.rivalFighter = (opp) => opp.fighter || (opp.kind === "wander" ? E.wanderFighter(opp) : E.npcFighter(opp));
  E.arenaRivals = function (S, now, remote) {
    now = now || E.now();
    const stamp = S.arena.wins + ":" + S.arena.losses + ":" + S.level + ":" + S.realm + ":" + JSON.stringify(S.talents || {});
    const all = E.allHeroes(S, now, remote);
    const me = all.find((h) => h.kind === "me");
    const byId = {};
    all.forEach((h) => (byId[h.id] = h));
    const cache = S.arena.rivals;
    if (cache && cache.stamp === stamp && cache.until > now) {
      const list = cache.list.map((e) => (e.kind === "wander" ? e : byId[e.id] ? Object.assign({}, byId[e.id], { tier: e.tier, chance: e.chance }) : null)).filter(Boolean);
      if (list.length === cache.list.length) return list;
    }
    const hero = E.heroFighter(S, now);
    const L = S.level;
    const span = Math.max(3, Math.round(L * 0.12));
    const r = U.rng(S.npcSeed + S.arena.wins * 7 + S.arena.losses * 13 + L * 31);
    const est = (f, salt) => E.estimateWin(hero, [f], 24, "ar" + salt);
    let pool = all.filter((h) => h.kind !== "me" && h.realm !== S.realm && Math.abs(h.level - L) <= span);
    pool.sort((a, b) => (a.kind === "real" ? -1 : 0) - (b.kind === "real" ? -1 : 0) || r() - 0.5);
    pool = pool.slice(0, 24).map((h) => Object.assign({}, h, { chance: est(E.rivalFighter(h), h.id) }));
    const out = [];
    E.ARENA_TARGETS.forEach((tg, ti) => {
      let best = null;
      for (const h of pool) {
        if (out.find((x) => x.id === h.id)) continue;
        const d = Math.abs(h.chance - tg.c) - (h.kind === "real" ? 0.05 : 0);
        if (d <= 0.13 && (!best || d < best.d)) best = { h, d };
      }
      if (best) {
        out.push(Object.assign(best.h, { tier: ti }));
        return;
      }
      // Wanderkaempfer: Staerke so lange anpassen, bis die Siegchance zum Ziel passt
      const realms = Object.keys(D.REALMS).filter((x) => x !== S.realm);
      const realm = realms[(ti + Math.floor(r() * 2)) % realms.length];
      const races = Object.keys(D.RACES).filter((x) => D.RACES[x].realm === realm);
      const race = U.pick(r, races);
      const R0 = D.RACES[race];
      const cls = E.CLASS_FOR[realm][U.pick(r, Object.keys(D.ARCHETYPES))];
      const w = {
        id: "w-" + U.hash(stamp + ti + now), kind: "wander", name: U.pick(r, D.NPC_FIRST) + " " + U.pick(r, D.NPC_LAST), race, realm, cls,
        gender: r() < 0.5 ? "m" : "w", level: Math.max(1, L + (tg.c < 0.4 ? 1 : tg.c > 0.7 ? -1 : 0)), q: 1, gearSeed: Math.floor(r() * 1e9), guild: null, tier: ti,
        look: { skin: U.pick(r, R0.skins), hair: U.pick(r, R0.hairs), hairStyle: U.ri(r, 0, 5), beard: U.ri(r, 0, 4), eyes: U.pick(r, D.EYES).c, tattoo: r() < 0.6 ? U.pick(r, D.TATTOOS).id : "keine", tattooColor: U.pick(r, D.TATTOO_COLORS).c, scar: r() < 0.3 ? U.pick(r, D.SCARS).id : "keine", horns: U.ri(r, 0, 2) },
      };
      // Wanderkaempfer bekommen hoechstens so viele Talentpunkte wie der Held selbst ausgegeben hat
      w.tp = E.talentSpent(S);
      for (let tries = 0; tries < 5; tries++) {
        let lo = 0.15;
        let hi = 1.8;
        for (let k = 0; k < 7; k++) {
          w.q = (lo + hi) / 2;
          const c = est(E.wanderFighter(w), w.id + k);
          if (c > tg.c) lo = w.q;
          else hi = w.q;
        }
        w.q = Math.round(((lo + hi) / 2) * 1000) / 1000;
        w.chance = est(E.wanderFighter(w), w.id);
        // Selbst ganz schwach noch zu stark: eine Stufe tiefer suchen
        if (w.chance >= tg.c - 0.15 || w.level <= 1) break;
        w.level = Math.max(1, w.level - Math.max(1, Math.round(L * 0.15)));
      }
      w.honor = Math.max(0, Math.round(me.honor * (1.3 - tg.c * 0.6)));
      out.push(w);
    });
    out.sort((a, b) => b.chance - a.chance);
    S.arena.rivals = { stamp, until: now + 30 * 60 * 1000, list: out.map((h) => (h.kind === "wander" ? h : { id: h.id, kind: h.kind, tier: h.tier, chance: h.chance })) };
    return out;
  };
  E.arenaFight = function (S, opp, now) {
    now = now || E.now();
    if (E.busy(S)) return { ok: false, msg: "Du bist gerade beschäftigt." };
    if (S.arena.next > now) return { ok: false, msg: "Baronin Krawall lässt dich noch nicht wieder in den Ring." };
    if (opp.realm === S.realm) return { ok: false, msg: "Im Ring kämpfen nur Helden verschiedener Reiche." };
    const hero = E.heroFighter(S, now);
    const foe = E.rivalFighter(opp);
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
    S.arena.rivals = null;
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
    const mon = E.dungeonMon(D0.id + "-" + floor);
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
      giveItem(S, E.makeItem(r, { level: b.L, cls: S.cls, minRarity: b.final ? "episch" : "selten", boost: (b.final ? 2 : 0.6) + E.lootBoost(S) }), rew);
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
  E.wellFree = (S, now) => (now || E.now()) >= (S.wellNext || 0);
  E.tossWell = function (S, now, usePerl) {
    now = now || E.now();
    let paid = false;
    if (!usePerl && E.wellFree(S, now)) S.wellNext = now + E.C.WELL_FREE_MS;
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
  // Fortschritt zaehlbarer Abzeichen: [erreicht, noetig] oder null
  E.achProgress = function (S, id) {
    const st = S.stats || {};
    const done = (n, max) => [Math.min(n || 0, max), max];
    switch (id) {
      case "quest10": return done(st.quests, 10);
      case "quest50": return done(st.quests, 50);
      case "quest150": return done(st.quests, 150);
      case "quest300": return done(st.quests, 300);
      case "stufe10": return done(S.level, 10);
      case "stufe25": return done(S.level, 25);
      case "stufe40": return done(S.level, 40);
      case "stufe50": return done(S.level, 50);
      case "arena10": return done(st.arenaWins, 10);
      case "arena100": return done(st.arenaWins, 100);
      case "mondjaeger": return done(st.nightHunts, 5);
      case "mondjaeger25": return done(st.nightHunts, 25);
      case "bestiarium12": return done(Object.keys(S.bestiary || {}).length, 12);
      case "bestiarium30": return done(Object.keys(S.bestiary || {}).length, 30);
      case "halsbrecher25": return done(st.hardWins, 25);
      case "horde10": return done(st.hordes, 10);
      case "unbesiegt20": return done(st.streak, 20);
      case "legendaer5": return done(st.legendaries, 5);
      case "kapitel3": return done(Object.keys((S.story && S.story.done) || {}).length, 3);
      case "chronik": {
        const ch = E.storyChapters(S);
        return done(ch.filter((c) => c.done).length, ch.length);
      }
      case "dungeonAll": return done(D.DUNGEONS.filter((d) => ((S.dungeons && S.dungeons.progress[d.id]) || 0) >= d.bosses.length).length, D.DUNGEONS.length);
      default: return null;
    }
  };
  E.checkAch = function (S, now) {
    if (S.stats.quests >= 10) E.grantAch(S, "quest10");
    if (S.stats.quests >= 50) E.grantAch(S, "quest50");
    if (S.stats.quests >= 150) E.grantAch(S, "quest150");
    if (S.level >= 10) E.grantAch(S, "stufe10");
    if (S.level >= 25) E.grantAch(S, "stufe25");
    if (S.level >= 40) E.grantAch(S, "stufe40");
    if (S.stats.arenaWins >= 10) E.grantAch(S, "arena10");
    if ((S.stats.nightHunts || 0) >= 5) E.grantAch(S, "mondjaeger");
    if (Object.keys(S.bestiary).length >= 12) E.grantAch(S, "bestiarium12");
    // schwere Abzeichen; ihr Fortschritt steht in E.achProgress
    for (const a of D.ACHIEVEMENTS) {
      if (!a.hard || S.ach[a.id]) continue;
      const pr = E.achProgress(S, a.id);
      if (pr && pr[0] >= pr[1]) E.grantAch(S, a.id);
    }
    if (now !== undefined) {
      const me = E.allHeroes(S, now, SB.remoteHeroes || null).find((h) => h.kind === "me");
      if (me && me.rank <= 10) E.grantAch(S, "arenaTop10");
    }
  };
})();
