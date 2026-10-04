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
  St.publishHero = async function (S) {
    if (!db || !St.uid) return;
    const f = SB.engine.heroFighter(S);
    const pub = {
      name: S.name,
      race: S.race,
      cls: S.cls,
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
      updatedAt: Date.now(),
    };
    const json = JSON.stringify(Object.assign({}, pub, { updatedAt: 0 }));
    if (json === lastHeroJson) return;
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
  St.sanitizeHero = function (id, h) {
    if (!h || typeof h !== "object") return null;
    if (!D.CLASSES[h.cls] || !D.RACES[h.race]) return null;
    const name = String(h.name || "").replace(/[^\p{L}\p{N} '\-]/gu, "").slice(0, 18).trim();
    if (name.length < 2) return null;
    const look = h.look || {};
    const gear = {};
    for (const s of ["helm", "ruestung", "umhang", "handschuhe", "stiefel", "waffe", "nebenhand"]) {
      const g = h.gear && h.gear[s];
      if (g && D.BASES[g.base] && (!g.tint || HEX.test(g.tint)) && (!g.rarity || D.RARITIES[g.rarity])) gear[s] = { base: g.base, tint: g.tint || "#9aa4ad", rarity: g.rarity || "gewoehnlich", style: num(g.style, 0, 2) | 0 };
      else gear[s] = null;
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
      cls: h.cls,
      gender: h.gender === "w" ? "w" : "m",
      look: {
        skin: HEX.test(look.skin) ? look.skin : "#f2cba8",
        hair: HEX.test(look.hair) ? look.hair : "#3b2a20",
        eyes: HEX.test(look.eyes) ? look.eyes : "#1d1b26",
        hairStyle: num(look.hairStyle, 0, 4) | 0,
        beard: num(look.beard, 0, 3) | 0,
      },
      level,
      honor: Math.round(num(h.honor, 0, 1e7)),
      gear,
    };
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
    } catch (e) {
      console.warn("Cloud nicht verfuegbar", e && e.code);
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
