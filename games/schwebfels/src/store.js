/* Helden von Schwebfels - Speichern.
   Immer lokal im Browser; in claude.ai zusaetzlich im privaten Bereich des Kontos,
   plus ein oeffentliches Heldenprofil, damit sich Mitspieler in der Arena begegnen. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const D = SB.data;
  const KEY = "schwebfels:save:v1";
  const St = (SB.store = { cloud: false, uid: null });
  let db = null;
  let cloudTimer = 0;
  let heroTimer = 0;
  let lastHeroJson = "";
  let unsub = null;

  St.loadLocal = function () {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  };
  St.saveLocal = function (S) {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
      return true;
    } catch (e) {
      return false;
    }
  };
  St.clearLocal = function () {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* nichts zu tun */
    }
  };

  St.save = function (S) {
    S.savedAt = Date.now();
    St.saveLocal(S);
    if (db && St.uid) {
      clearTimeout(cloudTimer);
      cloudTimer = setTimeout(() => St.saveCloud(S), 6000);
      clearTimeout(heroTimer);
      heroTimer = setTimeout(() => St.publishHero(S), 9000);
    }
  };
  St.flush = function (S) {
    if (db && St.uid) {
      clearTimeout(cloudTimer);
      St.saveCloud(S);
    }
  };

  St.saveCloud = async function (S) {
    if (!db || !St.uid) return;
    try {
      const json = JSON.stringify(S);
      if (json.length > 240000) return;
      await db.doc("data/users/" + St.uid + "/save").set({ v: 1, json, updatedAt: S.savedAt || Date.now() });
    } catch (e) {
      console.warn("Cloud-Speicherung fehlgeschlagen", e && e.code);
    }
  };

  /* Oeffentliches Profil: nur Spielwerte, keine Kontodaten */
  St.publishHero = async function (S, force) {
    if (!db || !St.uid) return;
    const f = SB.engine.heroFighter(S);
    const pub = {
      v: 2,
      name: S.name,
      race: S.race,
      realm: S.realm,
      cls: S.cls,
      guild: S.guild ? { id: S.guild.id, name: S.guild.name, tag: S.guild.tag } : null,
      gender: S.gender,
      look: S.look,
      level: S.level,
      honor: S.honor,
      gear: f.gear,
      attrs: f.attrs,
      wMin: f.wMin,
      wMax: f.wMax,
      armor: f.armor,
      shield: !!(S.equip.nebenhand && S.equip.nebenhand.base === "schild"),
      talents: S.talents || {},
      // Rueckmeldung zur Darstellung: kommen die neuen Figuren (aus der Seite und aus der Zusatzdatei) und die gemalte Insel an?
      diag: {
        fig: SB.ui && SB.ui.genStatus ? Object.assign({}, SB.ui.genStatus) : null,
        insel: SB.ui && SB.ui.hub ? (SB.ui.hub.painted ? "gemalt" : "3d") : "keine",
        d3: !!(SB.ui && SB.ui.use3d),
        mobil: typeof innerWidth === "number" && innerWidth <= 860,
      },
      updatedAt: Date.now(),
    };
    const json = JSON.stringify(Object.assign({}, pub, { updatedAt: 0 }));
    if (json === lastHeroJson && !force) return;
    try {
      await db.doc("heroes/" + St.uid).set(pub);
      lastHeroJson = json;
    } catch (e) {
      console.warn("Heldenprofil nicht veroeffentlicht", e && e.code);
    }
  };

  /* Fremde Daten pruefen, bevor sie ins Spiel gelangen */
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const num = (v, a, b) => (typeof v === "number" && isFinite(v) ? Math.max(a, Math.min(b, v)) : a);
  const OLD_RACE = { wolkling: "albier", steinbart: "kreidezwerg", hornvolk: "trollblut", nebelalb: "sidhe", moosling: "moorling" };
  const OLD_ARCH = { klinge: "krieger", wind: "jaeger", rune: "magier" };
  const cleanText = (v, n) => String(v || "").replace(/[^\p{L}\p{N} '\-]/gu, "").slice(0, n).trim();
  St.sanitizeGuild = function (g) {
    if (!g || typeof g !== "object") return null;
    const id = String(g.id || "");
    if (!/^[pg]-[\w-]{2,80}$/.test(id)) return null;
    const name = cleanText(g.name, 24);
    const tag = cleanText(g.tag, 4).toUpperCase();
    if (name.length < 3 || tag.length < 2) return null;
    return { id, name, tag, realm: D.REALMS[g.realm] ? g.realm : null };
  };
  St.sanitizeHero = function (id, h) {
    if (!h || typeof h !== "object") return null;
    if (!D.RACES[h.race] && OLD_RACE[h.race]) h = Object.assign({}, h, { race: OLD_RACE[h.race] });
    if (!D.RACES[h.race]) return null;
    if (!D.CLASSES[h.cls] && OLD_ARCH[h.cls]) h = Object.assign({}, h, { cls: SB.engine.CLASS_FOR[D.RACES[h.race].realm][OLD_ARCH[h.cls]] });
    if (!D.CLASSES[h.cls]) return null;
    const name = cleanText(h.name, 18);
    if (name.length < 2) return null;
    const look = h.look || {};
    const gear = {};
    for (const s of D.SLOTS) {
      const g = h.gear && h.gear[s];
      if (g && D.BASES[g.base] && D.BASES[g.base].slot === s && (!g.tint || HEX.test(g.tint)) && (!g.rarity || D.RARITIES[g.rarity])) {
        gear[s] = { base: g.base, tint: g.tint || "#9aa4ad", rarity: g.rarity || "gewoehnlich", style: num(g.style, 0, 2) | 0, variant: num(g.variant, 0, 5) | 0, vis: null };
        // Erscheinung nur mit bekannter Grundform und Kultur uebernehmen
        const v = g.vis;
        if (v && typeof v.f === "string" && /^[a-z]+(\.[a-z]+)?\.[0-5]$/.test(v.f) && v.f.split(".")[0] === g.base && D.REALMS[v.c])
          gear[s].vis = { f: v.f, c: v.c, o: num(v.o, 0, 2) | 0, v: num(v.v, 1, 99) | 0 };
      } else gear[s] = null;
    }
    const attrs = {};
    for (const a of D.ATTRS) attrs[a] = Math.round(num(h.attrs && h.attrs[a], 1, 1e6));
    const level = Math.round(num(h.level, 1, 300));
    const wMin = Math.round(num(h.wMin, 1, 1e6));
    const hero = {
      id: "u:" + id,
      kind: "real",
      name,
      race: h.race,
      realm: D.CLASSES[h.cls].realm,
      cls: h.cls,
      gender: h.gender === "w" ? "w" : "m",
      guild: h.guild ? St.sanitizeGuild(Object.assign({ realm: D.CLASSES[h.cls].realm }, h.guild)) : null,
      look: {
        skin: HEX.test(look.skin) ? look.skin : D.RACES[h.race].skins[0],
        hair: HEX.test(look.hair) ? look.hair : D.RACES[h.race].hairs[0],
        eyes: HEX.test(look.eyes) ? look.eyes : "#3a2a1e",
        hairStyle: num(look.hairStyle, 0, D.HAIR_STYLES.length - 1) | 0,
        beard: num(look.beard, 0, D.BEARDS.length - 1) | 0,
        tattoo: D.TATTOOS.find((t) => t.id === look.tattoo) ? look.tattoo : "keine",
        tattooColor: HEX.test(look.tattooColor) ? look.tattooColor : "#2f5fd0",
        scar: D.SCARS.find((t) => t.id === look.scar) ? look.scar : "keine",
        horns: num(look.horns, 0, 2) | 0,
      },
      level,
      honor: Math.round(num(h.honor, 0, 1e7)),
      gear,
      talents: {},
    };
    // Talente nur, wenn sie zum Baum der Klasse passen; die Punktzahl begrenzt die Stufe im Kampf
    const tree = SB.engine.talentTree(h.cls);
    if (h.talents && typeof h.talents === "object")
      for (const k of Object.keys(h.talents).slice(0, 40)) if (tree.byId[k]) hero.talents[k] = num(h.talents[k], 0, tree.byId[k].max) | 0;
    hero.fighter = SB.engine.remoteFighter(hero, { attrs, wMin, wMax: Math.max(wMin + 1, Math.round(num(h.wMax, 2, 1e6))), armor: Math.round(num(h.armor, 0, 1e7)), shield: !!h.shield });
    return hero;
  };

  St.initCloud = async function (onLoaded) {
    const claude = globalThis.claude;
    if (!claude || typeof claude.use !== "function") return;
    try {
      const [dbNs, user] = await Promise.all([claude.use("db"), claude.use("user")]);
      if (!dbNs || !user) return;
      const uid = await user.id();
      if (!uid) return;
      db = dbNs;
      St.uid = uid;
      St.cloud = true;
      const snap = await db.doc("data/users/" + uid + "/save").get();
      let cloudState = null;
      if (snap.exists) {
        try {
          cloudState = JSON.parse(snap.data().json);
        } catch (e) {
          cloudState = null;
        }
      }
      onLoaded(cloudState);
      unsub = db
        .collection("heroes")
        .orderBy("honor", "desc")
        .limit(150)
        .onSnapshot(
          (qs) => {
            const list = [];
            for (const d of qs.docs) {
              if (d.id === uid) continue;
              const h = St.sanitizeHero(d.id, d.data());
              if (h) list.push(h);
            }
            SB.remoteHeroes = list;
            SB.bus.emit("remote", list);
          },
          () => {
            SB.remoteHeroes = null;
          }
        );
      db.collection("guilds")
        .limit(200)
        .onSnapshot(
          (qs) => {
            const list = [];
            for (const d of qs.docs) {
              const g = St.sanitizeGuild(d.data());
              if (g && g.realm && g.id === "p-" + d.id) list.push(Object.assign({ kind: "real" }, g));
            }
            SB.remoteGuilds = list;
            SB.bus.emit("remote", list);
          },
          () => {
            SB.remoteGuilds = null;
          }
        );
    } catch (e) {
      console.warn("Cloud nicht verfuegbar", e && e.code);
    }
  };

  /* Gilden echter Spieler: der Gruender veroeffentlicht sie unter seiner Kennung */
  St.publishGuild = async function (S) {
    if (!db || !St.uid || !S.guild || !S.guild.founder) return;
    try {
      await db.doc("guilds/" + St.uid).set({ id: "p-" + St.uid, name: S.guild.name, tag: S.guild.tag, realm: S.guild.realm, updatedAt: Date.now() });
    } catch (e) {
      console.warn("Gilde nicht veroeffentlicht", e && e.code);
    }
  };
  St.removeGuild = async function () {
    if (!db || !St.uid) return;
    try {
      await db.doc("guilds/" + St.uid).delete();
    } catch (e) {
      console.warn("Gilde nicht entfernt", e && e.code);
    }
  };

  /* Spielstand als Text sichern und laden */
  St.exportCode = function (S) {
    const json = JSON.stringify(S);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return "SBF1:" + b64;
  };
  St.importCode = function (code) {
    code = String(code || "").trim();
    if (!code.startsWith("SBF1:")) throw new Error("Das ist kein Spielstand-Code von Schwebfels.");
    const json = decodeURIComponent(escape(atob(code.slice(5))));
    const S = SB.engine.migrate(JSON.parse(json));
    if (!S) throw new Error("Der Spielstand ist beschädigt.");
    return S;
  };
})();
