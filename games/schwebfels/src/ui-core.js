/* Helden von Schwebfels - Oberflaechen-Kern: Menueleiste, Kopfleiste, Panels, Vergleich, Tooltips, Hinweise, Zeitgeber, Musik. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const D = SB.data;
  const E = SB.engine;
  const U = SB.util;
  const I = SB.icons;
  const UI = (SB.ui = SB.ui || {});

  UI.S = null;
  UI.hub = null;
  UI.use3d = false;
  UI.panelId = null;
  UI.inBattle = false;
  UI.tabs = {};
  UI.qty = 1;
  UI.ACTIONS = {};
  UI.PANELS = {};
  const $ = (sel, root) => (root || document).querySelector(sel);
  UI.$ = $;
  const esc = U.esc;

  /* ---------- Portraits ---------- */
  UI.NPC_LOOK = {
    hulda: { race: "albier", realm: "albion", gender: "w", cls: "lichtweber", look: { skin: "#e8b896", hair: "#a8432a", hairStyle: 1, eyes: "#4f7a3a", tattoo: "keine" }, gear: { ruestung: { base: "robe", tint: "#6a4a3a", style: 0 } } },
    brumm: { race: "kreidezwerg", realm: "albion", gender: "m", cls: "schildritter", look: { skin: "#b98b6c", hair: "#9b3d24", hairStyle: 4, beard: 3, eyes: "#3a2a1e", scar: "auge" }, gear: { ruestung: { base: "harnisch", tint: "#5a4a3a", style: 0 }, handschuhe: { base: "handschuhe", tint: "#4a3a30" } } },
    zinnober: { race: "sidhe", realm: "hibernia", gender: "w", cls: "dornenrufer", look: { skin: "#d6cfe6", hair: "#c7a6e0", hairStyle: 2, eyes: "#7fffb0", tattoo: "mond", tattooColor: "#b48cff" }, gear: { helm: { base: "hut", tint: "#5a2f6f", rarity: "episch", style: 1 }, ruestung: { base: "robe", tint: "#3a2f5a", style: 1 } } },
    funzel: { race: "nordmann", realm: "midgard", gender: "m", cls: "wolfsjaeger", look: { skin: "#dcae8c", hair: "#efe6d2", hairStyle: 4, beard: 2, eyes: "#3f6fa8" }, gear: { helm: { base: "kappe", tint: "#7a7470", style: 2 }, ruestung: { base: "wams", tint: "#4a3424" } } },
    krawall: { race: "trollblut", realm: "midgard", gender: "w", cls: "sturmhuene", look: { skin: "#8a6a8a", hair: "#1f1f24", hairStyle: 3, eyes: "#ffb13b", tattoo: "kriegsbemalung", tattooColor: "#a82424", horns: 0 }, gear: { ruestung: { base: "harnisch", tint: "#5a5f6a", style: 2 }, umhang: { base: "umhang", tint: "#8a2a2a", style: 1 } } },
    hufnagel: { race: "moorling", realm: "hibernia", gender: "w", cls: "mondschuetze", look: { skin: "#a9b98f", hair: "#4f6a3c", hairStyle: 1, eyes: "#4f7a3a", tattoo: "dornen", tattooColor: "#2f5fd0" }, gear: { ruestung: { base: "wams", tint: "#5a3d2a" } } },
    ottilie: { race: "albier", realm: "albion", gender: "w", cls: "schildritter", look: { skin: "#c99470", hair: "#2b1d16", hairStyle: 5, eyes: "#3f6fa8", tattoo: "runen", tattooColor: "#e8e2d6", scar: "wange" }, gear: { ruestung: { base: "harnisch", tint: "#9aa4ad", style: 1 }, umhang: { base: "umhang", tint: "#b8322e" } } },
    seherin: { race: "sidhe", realm: "hibernia", gender: "w", cls: "dornenrufer", look: { skin: "#e6dccc", hair: "#f2f2f2", hairStyle: 2, eyes: "#7fffb0", tattoo: "linien", tattooColor: "#4fffb0" }, gear: { helm: { base: "hut", tint: "#2a2a44", style: 0 }, ruestung: { base: "robe", tint: "#3a3a5a", style: 1 } } },
    mondhaendler: { race: "sidhe", realm: "hibernia", gender: "w", cls: "lichtweber", look: { skin: "#dfe6f2", hair: "#e8eef8", hairStyle: 2, eyes: "#cfe0ff", tattoo: "mond", tattooColor: "#ffcf5a" }, gear: { helm: { base: "kappe", tint: "#1e2448", style: 0 }, ruestung: { base: "robe", tint: "#2a3260", style: 1 } } },
  };
  UI.isNight = () => !!UI.S && E.isNight(UI.S.settings.dayCycle || "zyklus");
  // Neue Figuren gelten immer (der Vergleich mit den alten ist seit Version 5.6 abgeschafft)
  const genOn = () => true;
  // Volk und Geschlecht mit fertig modellierter Figur (Meshy): Haut, Haare und Gesicht gehoeren zum Modell, die alte
  // Wahl entfaellt. Massgeblich sind die geladenen Figurendaten.
  UI.meshyLook = (race, gender) => {
    const G = (UI.use3d && SB.assets.data && SB.assets.data.gen) || {};
    return !!G[race + "-" + (gender === "w" ? "frau" : "mann")];
  };
  // Reiche mit Figurendatei (gen-<reich>.js neben der Seite): Midgard (Frostwicht, Glutzwerg), Albion (Albier,
  // Kreidezwerg) und Hibernia (Sidhe, Moorling); Nordmann und Trollblut stecken in der Seite
  UI.GEN_REALMS = ["midgard", "albion", "hibernia"];
  // Jedes Volk hat einen Meshy-Koerper. Solange er noch laedt, steht ein Platzhalter da (pending), nie die alte Figur;
  // das Laden der Datei seines Reiches wird dabei angestossen.
  const withGen = (d) => {
    if (!genOn() || !SB.R3D.human || !SB.R3D.human.genReady) return d;
    const k = d.race + "-" + (d.gender === "w" ? "frau" : "mann");
    if (SB.R3D.human.genReady(k)) return Object.assign(d, { gen: k, genGear: [] }, GEAR_V ? { gv: GEAR_V } : {});
    const realm = D.RACES[d.race] && D.RACES[d.race].realm;
    if (realm && UI.use3d && !GEN_FIG[realm]) UI.loadGenFigures(realm);
    return Object.assign(d, { pending: k });
  };
  UI.withGen = withGen;
  UI.heroDesc = (S) => withGen({ kind: "hero", race: S.race, cls: S.cls, realm: S.realm, gender: S.gender, look: S.look, gear: E.heroGear(S) });
  // Figurendatei des Reiches im Hintergrund laden; danach zeigen alle Ansichten die neuen Koerper.
  // Liefert "bereit", "aus" (abgeschaltet, ohne 3D oder Reich ohne Figuren), "fehlt" (keine Datei neben der Seite) oder "fehler".
  // Die Koerper der waehlbaren Voelker stecken in der Seite (build.mjs, GEN_KERN) und sind sofort bereit, sobald ihre
  // Hautbilder dekodiert sind; die Datei gen-<reich>.js bringt die uebrigen (Figurenprobe). UI.genStatus fuer die Anzeige.
  UI.genStatus = { kern: "", datei: "" };
  const genChanged = () => {
    if (UI.onGen) UI.onGen();
    if (UI.S) UI.refresh();
    // offenes Fenster neu zeichnen: Portraits und Figuren, die bis eben Platzhalter waren
    if (UI.panelId) UI.renderPanel();
  };
  // Monster mit eigener Figur aus dem Monsterkonzept: je Familie eine Zusatzdatei gen-mon<familie>.js neben der Seite,
  // erst bei Bedarf geladen (Auftragsbrett, vor dem Kampf, Figurenprobe); bis dahin steht ein Platzhalter da.
  // Ein gescheitertes Laden wird nach einer Pause erneut versucht (schwaches Netz am Handy).
  // UI.monReady[familie] fliesst als mv in die Beschreibung, damit Portraits nach dem Laden neu entstehen.
  const MON_LOAD = {};
  // Familien, deren Figuren nicht in eine Datei passen (Grenze 16 MB): weitere Dateien gen-mon<familie>2.js
  const MON_MORE = { drache: ["drache2"] };
  UI.monReady = {};
  const RETRY_MS = 15000;
  const MON_PANELS = { taverne: 1, figurenprobe: 1, steinkreis: 1, mondtor: 1, tiefen: 1, heim: 1, held: 1 };
  UI.loadMonsterArch = function (arch) {
    if (!UI.use3d || !arch) return Promise.resolve(false);
    if (MON_LOAD[arch]) return MON_LOAD[arch];
    MON_LOAD[arch] = SB.assets.ready
      .then(() => Promise.all([SB.assets.loadGen("mon" + arch)].concat((MON_MORE[arch] || []).map((x) => SB.assets.loadGen("mon" + x).catch(() => null)))))
      .then(() => SB.R3D.human.preloadGen())
      .then(() => {
        // Farb- und Reliefbilder der Bestien dieser Familie abwarten (sonst stuende sie im ersten Bild schwarz da)
        const B = (SB.assets.data && SB.assets.data.beasts) || {};
        const waits = [];
        for (const k in B) {
          const t = B[k].tex && SB.assets.texture("beast." + k, B[k].tex, { srgb: true });
          const n = B[k].ntex && SB.assets.texture("beast." + k + ".n", B[k].ntex, { srgb: false });
          for (const x of [t, n]) if (x && x.userData.ready) waits.push(x.userData.ready);
        }
        return Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, 3000))]);
      })
      .then(
        () => {
          UI.monReady[arch] = true;
          if (MON_PANELS[UI.panelId]) UI.renderPanel();
          return true;
        },
        (e) => {
          if (!(e && e.missing)) console.warn("Monsterfiguren " + arch + " nicht geladen", e);
          setTimeout(() => delete MON_LOAD[arch], RETRY_MS);
          return false;
        }
      );
    return MON_LOAD[arch];
  };
  // mehrere Familien; mit ms hoechstens so lange warten (danach kaempft notfalls ein Platzhalter)
  UI.loadMonsters = function (archs, ms) {
    const all = Promise.all([...new Set((archs || []).filter(Boolean))].map(UI.loadMonsterArch));
    return ms ? Promise.race([all, new Promise((r) => setTimeout(r, ms))]) : all;
  };
  // Gemalte Kampfkulissen der Reiche, der Arena und der Verliese (kulissen.js neben der Seite, gut 3 MB): einmal im
  // Hintergrund laden, nach einem Fehlschlag spaeter erneut
  let KUL_LOAD = null;
  UI.loadKulissen = function () {
    if (!UI.use3d) return Promise.resolve(false);
    if (globalThis.SB_KULISSEN) return Promise.resolve(true);
    if (!KUL_LOAD)
      KUL_LOAD = new Promise((ok) => {
        const el = document.createElement("script");
        el.src = "kulissen.js";
        el.onload = () => ok(!!globalThis.SB_KULISSEN);
        el.onerror = () => {
          el.remove();
          setTimeout(() => (KUL_LOAD = null), RETRY_MS);
          ok(false);
        };
        document.head.appendChild(el);
      });
    return KUL_LOAD;
  };
  // Familien der Gegner in den aktuellen Auftraegen der Taverne
  UI.offerArchs = function () {
    const S = UI.S;
    const out = [];
    for (const o of (S && S.quest && S.quest.offers) || []) for (const w of o.waves || [{ monster: o.monster }]) {
      const m = SB.engine.monById(w.monster);
      if (m) out.push(m.arch);
    }
    return out;
  };
  // Ausruestung aus Meshy-Modellen je Reich und Heldenart (gen-ausr<reich><art>.js neben der Seite): Ruestungsteile und
  // Waffen fuer Gegenstaende dieser Gestaltungskultur. Erst die Art des eigenen Helden, dann die uebrigen im Hintergrund.
  // GEAR_V zaehlt die geladenen Dateien; es steht in der Beschreibung der Figur, damit Portraits und Ansichten neu entstehen.
  const GEAR_ARCHS = ["krieger", "schurke", "jaeger", "magier", "umhang"];
  UI.GEAR_FILES = { albion: GEAR_ARCHS, midgard: GEAR_ARCHS, hibernia: GEAR_ARCHS };
  let GEAR_V = 0;
  const GEAR_LOAD = {};
  UI.loadGear = function (realm) {
    const own = UI.S && D.CLASSES[UI.S.cls] ? D.CLASSES[UI.S.cls].arch : null;
    const rank = (x) => (x === own ? 2 : x === "umhang" ? 1 : 0);
    const list = (UI.GEAR_FILES[realm] || []).slice().sort((a, b) => rank(b) - rank(a));
    return list.reduce(
      (prev, arch) =>
        prev.then(() => {
          const id = "ausr" + realm + arch;
          if (GEAR_LOAD[id]) return GEAR_LOAD[id];
          return (GEAR_LOAD[id] = SB.assets.loadGen(id).then(
            () => {
              GEAR_V++;
              genChanged();
            },
            (e) => {
              if (!(e && e.missing)) console.warn("Ausruestung nicht geladen", id, e);
              setTimeout(() => delete GEAR_LOAD[id], RETRY_MS);
            }
          ));
        }),
      Promise.resolve()
    );
  };
  // je Reich nur einmal (Arena und Kampf fragen fremde Reiche an, ohne dass die Anzeige sich im Kreis neu zeichnet);
  // nach einem Fehlschlag erst nach einer Pause erneut
  const GEN_FIG = {};
  UI.loadGenFigures = function (realm) {
    UI.loadMonsters(UI.offerArchs());
    UI.loadKulissen();
    if (!UI.use3d || !genOn() || UI.GEN_REALMS.indexOf(realm) < 0) return Promise.resolve("aus");
    if (GEN_FIG[realm]) return GEN_FIG[realm];
    const HU = SB.R3D.human;
    const kern = SB.assets.ready.then(() => {
      if (!Object.keys((SB.assets.data && SB.assets.data.gen) || {}).length) return false;
      UI.genStatus.kern = UI.genStatus.kern || "laedt";
      return HU.preloadGen().then(() => {
        UI.genStatus.kern = "bereit";
        genChanged();
        return true;
      });
    });
    UI.genStatus.datei = UI.genStatus.datei === "bereit" ? "bereit" : "laedt";
    return (GEN_FIG[realm] = kern
      .then(() => SB.assets.loadGen(realm))
      .then(() => HU.preloadGen())
      .then(
        () => {
          UI.genStatus.datei = "bereit";
          if (!UI.genStatus.kern) UI.genStatus.kern = "bereit";
          genChanged();
          return UI.loadGear(realm).then(() => "bereit");
        },
        (e) => {
          UI.genStatus.datei = e && e.missing ? "fehlt" : "fehler";
          if (e && e.missing) console.info("Keine Figurendatei fuer " + realm + ", spaeter neuer Versuch");
          else console.warn("Neue Figuren nicht geladen", e);
          setTimeout(() => delete GEN_FIG[realm], RETRY_MS);
          genChanged();
          return UI.genStatus.kern === "bereit" ? "bereit" : UI.genStatus.datei;
        }
      ));
  };
  // Monster tragen die Spuren ihrer Heimat: Frost in Midgard, Moos in Hibernia
  UI.foeRealm = function (m) {
    const S = UI.S;
    const rs = m && m.realms;
    if (rs && rs.length) return S && rs.indexOf(S.realm) >= 0 ? S.realm : rs[0];
    if (m && m.id && /^(nacht-|story-)/.test(m.id)) return S ? S.realm : null;
    return null;
  };
  // Gegner ohne Eintrag in D.MONSTERS (Chronik, Verliese, Nachtjagd) tragen ebenfalls eine Meshy-Figur: eine eigene
  // unter dem Schluessel ihres Namens (Endbosse, etwa "derwurmimeis"), sonst die naechstliegende Figur ihrer Familie,
  // zuerst nach dem Namen ("Der Dornenhirte" -> dornenhirte), dann nach Farbe und Akzent
  const slug = (s) => String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z]/g, "");
  const rgb = (c) => {
    const n = parseInt(String(c || "#808080").slice(1, 7), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const LOOK = {};
  UI.monKey = slug;
  // nur Monster aus D.MONSTERS haben eine eigene Figur unter ihrer ID (Verliesbosse loest E.monById zwar auch auf,
  // sie leihen sich aber eine Figur ihrer Familie)
  const ownFigure = (id) => !!id && SB.data.MONSTERS.some((m) => m.id === id);
  UI.monLook = function (f) {
    if (!f || ownFigure(f.id)) return null;
    const key = f.arch + "|" + f.name + "|" + f.color + "|" + f.accent;
    if (key in LOOK) return LOOK[key];
    const fam = SB.data.MONSTERS.filter((m) => m.arch === f.arch);
    const nm = slug(f.name);
    let best = fam.filter((m) => nm.indexOf(slug(m.name)) >= 0).sort((a, b) => slug(b.name).length - slug(a.name).length)[0];
    if (!best) {
      const c = rgb(f.color);
      const a = rgb(f.accent);
      const d = (m) => {
        const x = rgb(m.color);
        const y = rgb(m.accent);
        let s = 0;
        for (let i = 0; i < 3; i++) s += (c[i] - x[i]) ** 2 + 0.35 * (a[i] - y[i]) ** 2;
        return s;
      };
      best = fam.slice().sort((p, q) => d(p) - d(q))[0];
    }
    return (LOOK[key] = best ? best.id : null);
  };
  // visual: eigene Figur (Monster-ID oder Name), look: geliehene Figur, falls es keine eigene gibt
  const monVisual = (f) => (ownFigure(f.id) ? f.id : slug(f.name) || f.id);
  UI.fighterDesc = function (f) {
    if (f.kind === "monster") return { kind: "monster", arch: f.arch, visual: monVisual(f), look: UI.monLook(f), mv: UI.monReady[f.arch] ? 1 : 0, color: f.color, accent: f.accent, boss: !!f.boss, final: !!f.final, realm: UI.foeRealm(f) };
    return withGen({ kind: "hero", race: f.race, cls: f.cls, realm: f.realm, gender: f.gender, look: f.look, gear: f.gear });
  };
  UI.monDesc = (m, boss, final) => ({ kind: "monster", arch: m.arch, visual: monVisual(m), look: UI.monLook(m), mv: UI.monReady[m.arch] ? 1 : 0, color: m.color, accent: m.accent, boss: !!boss, final: !!final, realm: UI.foeRealm(m) });
  UI.portrait = function (desc, size, bust) {
    // noch ladende Meshy-Figur (Held oder Monster): Umriss statt Bild, das Portrait entsteht nach dem Laden neu
    const waiting = desc.pending || (desc.kind === "monster" && (desc.visual || desc.look) && !desc.mv && !(SB.R3D.beasts && SB.R3D.beasts.hasOwn && SB.R3D.beasts.hasOwn(desc.look)));
    const url = UI.use3d && !waiting ? SB.R3D.snapshot(desc, size || 128, bust) : null;
    if (url) return '<img alt="" src="' + url + '">';
    return I.silhouette(desc.kind === "monster" ? desc.color : desc.gear && desc.gear.ruestung ? desc.gear.ruestung.tint : "#7f8a96", desc.kind);
  };
  UI.npcPortrait = (id) => (UI.NPC_LOOK[id] ? UI.portrait(withGen(Object.assign({ kind: "hero" }, UI.NPC_LOOK[id])), 128, true) : "");
  UI.heroPortrait = (S) => UI.portrait(UI.heroDesc(S), 128, true);
  // Fertig modellierte Figuren (Meshy) fuer Volk und Geschlecht: dann waehlt das Aussehen nur die Gestalt, denn Haut,
  // Haare und Gesicht gehoeren zum Modell. Die Wahl steckt in look.hairStyle (wie bei den Inselbewohnern).
  UI.gestalten = function (race, gender) {
    const RG = SB.R3D && SB.R3D.rigged;
    return RG && RG.variants ? RG.variants(race, gender).slice(0, D.HAIR_STYLES.length) : [];
  };
  // desc (Volk, Geschlecht, Klasse): mit 3D zeigt jede Wahl ein kleines Portrait der Figur
  UI.gestaltHtml = function (L, n, act, desc) {
    const cur = Math.abs(L.hairStyle | 0) % n;
    let h = "<h4>Gestalt</h4>";
    if (n > 1) {
      h += '<div class="choices">';
      for (let i = 0; i < n; i++) {
        const pic = desc && UI.use3d ? UI.portrait(Object.assign({ kind: "hero" }, desc, { look: { hairStyle: i } }), 96, true).replace("<img ", '<img style="display:block;width:64px;height:64px;margin:0 auto 4px" ') : "";
        h += '<button type="button" class="choice' + (cur === i ? " on" : "") + '" ' + act + '="lookn" data-k="hairStyle" data-v="' + i + '">' + (pic.indexOf("<img") === 0 ? pic : "") + "Gestalt " + (i + 1) + "</button>";
      }
      h += "</div>";
    }
    return h + '<p class="muted small">Diese Figur ist fertig modelliert: Haut, Haare und Gesicht gehören zu ihrer Gestalt.</p>';
  };

  /* ---------- Speichern ---------- */
  let saveTimer = 0;
  // ohne Helden nichts speichern (etwa „Neuer Held“, solange ein verzoegertes Speichern noch aussteht)
  UI.save = function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => UI.S && SB.store.save(UI.S), 300);
  };
  UI.saveNow = function () {
    clearTimeout(saveTimer);
    if (UI.S) SB.store.save(UI.S);
  };

  /* ---------- Formatierung ---------- */
  UI.gold = (n) => '<span class="num">' + U.fmt(n) + "</span> " + I.ui("gold");
  UI.perlen = (n) => '<span class="num">' + U.fmt(n) + "</span> " + I.ui("perle");
  UI.gauge = function (val, max) {
    const pct = Math.max(0, Math.min(1, val / max));
    const a = Math.PI * (1 - pct);
    const cx = 20;
    const cy = 23;
    const ex = (cx + Math.cos(a) * 13).toFixed(2);
    const ey = (cy - Math.sin(a) * 13).toFixed(2);
    const nx = (cx + Math.cos(a) * 11).toFixed(2);
    const ny = (cy - Math.sin(a) * 11).toFixed(2);
    const col = pct < 0.15 ? "#e0644f" : pct < 0.4 ? "#e8c35a" : "#6fd0a8";
    return (
      '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18.5" fill="#0c0a10" stroke="#a8823a" stroke-width="2"/>' +
      '<path d="M7 23 A13 13 0 0 1 33 23" fill="none" stroke="#2a2633" stroke-width="4" stroke-linecap="round"/>' +
      (pct > 0.005 ? '<path d="M7 23 A13 13 0 0 1 ' + ex + " " + ey + '" fill="none" stroke="' + col + '" stroke-width="4" stroke-linecap="round"/>' : "") +
      '<path d="M20 23 L' + nx + " " + ny + '" stroke="#efe6d2" stroke-width="2" stroke-linecap="round"/><circle cx="20" cy="23" r="2.6" fill="#c9a441" stroke="#14101a" stroke-width="1"/>' +
      '<text x="20" y="35.5" text-anchor="middle" font-size="7" font-weight="800" fill="#efe6d2" font-family="sans-serif">' + Math.floor(val) + "</text></svg>"
    );
  };
  // Erfahrung klar darstellen
  UI.xpInfo = function (S) {
    const need = E.xpNeed(S.level);
    return { need, have: S.xp, rest: Math.max(0, need - S.xp), pct: Math.min(100, (S.xp / need) * 100) };
  };
  UI.xpBlock = function (S) {
    const x = UI.xpInfo(S);
    return (
      '<div class="xpblock"><div class="xprow"><span class="lv">Stufe ' + S.level + '</span><span class="muted">Erfahrung</span><span class="spacer"></span><span class="lv next">Stufe ' + (S.level + 1) + "</span></div>" +
      '<div class="xpbig"><i style="width:' + x.pct.toFixed(1) + '%"></i><span class="num">' + U.fmt(x.have) + " / " + U.fmt(x.need) + " EP (" + Math.floor(x.pct) + " %)</span></div>" +
      '<div class="xprest">Noch <b class="num">' + U.fmt(x.rest) + " EP</b> bis Stufe " + (S.level + 1) + "</div></div>"
    );
  };

  /* ---------- Toasts ---------- */
  // Meldungen waehrend eines Kampfes warten bis zum Ergebnis, damit nichts den Ausgang verraet
  const heldNotices = [];
  UI.notice = (fn) =>
    queueMicrotask(() => {
      if (UI.inBattle) heldNotices.push(fn);
      else fn();
    });
  UI.flushNotices = function () {
    const list = heldNotices.splice(0);
    list.forEach((fn, i) => setTimeout(fn, 250 + i * 450));
  };
  UI.toast = function (text, kind, icon) {
    if (UI.inBattle) {
      heldNotices.push(() => UI.toast(text, kind, icon));
      return;
    }
    const box = $("#toasts");
    if (!box) return;
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.innerHTML = (icon ? I.ui(icon) : "") + "<span></span>";
    t.querySelector("span").textContent = text;
    box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => {
      t.classList.add("out");
      setTimeout(() => t.remove(), 400);
    }, 3800);
  };
  SB.bus.on("toast", (p) => UI.toast(p.text, p.kind === "info" ? "" : p.kind));
  SB.bus.on("levelup", (p) =>
    UI.notice(() => {
      const tp = E.talentPointsFor(p.level) > E.talentPointsFor(p.level - 1);
      UI.toast("Stufe " + p.level + " erreicht! Eine Wolkenperle als Belohnung." + (tp ? " Dazu ein neuer Talentpunkt." : ""), "gold", "xp");
      SB.audio.play("levelup");
      if (UI.hub) UI.hub.cheer();
    })
  );
  SB.bus.on("achievement", (a) =>
    UI.notice(() => {
      UI.toast("Abzeichen „" + a.name + "“: +" + a.perlen + (a.perlen === 1 ? " Wolkenperle" : " Wolkenperlen"), "gold", "abzeichen");
      SB.audio.play("chime");
    })
  );
  SB.bus.on("remote", () => {
    if (UI.panelId === "arena" || UI.panelId === "ruhmeshalle" || UI.panelId === "gildenhalle") UI.renderPanel();
  });

  /* ---------- Gegenstaende und Vergleich ---------- */
  UI.itemRef = function (ref) {
    const S = UI.S;
    const p = String(ref).split(":");
    if (p[0] === "inv") return S.inv[+p[1]];
    if (p[0] === "eq") return S.equip[p[1]];
    if (p[0] === "shop") return S.shops[p[1]] && S.shops[p[1]].items[+p[2]];
    if (p[0] === "offer") return S.quest.offers[+p[1]] && S.quest.offers[+p[1]].item;
    if (p[0] === "tmp") return UI.tmpItems[+p[1]];
    return null;
  };
  UI.tmpItems = [];
  UI.tmpRef = function (item) {
    UI.tmpItems.push(item);
    if (UI.tmpItems.length > 40) UI.tmpItems.shift();
    return "tmp:" + (UI.tmpItems.length - 1);
  };
  UI.slotName = (it) => D.SLOT_INFO[it.slot].name;
  UI.isUpgrade = function (it) {
    const S = UI.S;
    if (!it || !E.canEquip(S, it)) return false;
    return E.itemScore(it, S.cls) > E.itemScore(S.equip[it.slot], S.cls) * 1.001;
  };
  const archName = (a) => (a && D.ARCHETYPES[a] ? D.ARCHETYPES[a].name : "");
  const itemLines = (it) => {
    const lines = [];
    if (it.min) lines.push(["schaden", "Schaden", U.fmt(it.min) + " bis " + U.fmt(it.max)]);
    if (it.armor) lines.push(["ruestung", "Rüstung", U.fmt(it.armor)]);
    for (const a of D.ATTRS) if (it.stats[a]) lines.push([a, D.ATTR_INFO[a].name, "+" + U.fmt(it.stats[a])]);
    return lines;
  };
  // Auswirkung auf die Heldenwerte, wenn der Gegenstand angelegt wuerde
  function heroDeltas(it) {
    const S = UI.S;
    const pv = E.previewEquip(S, it);
    const b = pv.before;
    const a = pv.after;
    return [
      ["konstitution", "Lebenspunkte", b.hp, a.hp, U.fmt],
      ["schaden", "Ø Schaden", (b.dmgMin + b.dmgMax) / 2, (a.dmgMin + a.dmgMax) / 2, (v) => U.fmt(Math.round(v))],
      ["ruestung", "Schadensminderung", b.reduction * 100, a.reduction * 100, (v) => Math.round(v) + " %"],
      ["glueck", "Kritisch", b.crit * 100, a.crit * 100, (v) => Math.round(v) + " %"],
    ];
  }
  const sign = (d, fmt) => (d > 0 ? "+" : d < 0 ? "−" : "±") + fmt(Math.abs(d));
  UI.itemCard = function (it, opts) {
    opts = opts || {};
    const S = UI.S;
    const R = D.RARITIES[it.rarity];
    let cmp = "";
    const can = S && E.canEquip(S, it);
    const cur = S && S.equip[it.slot];
    if (opts.compare !== false && S && can && cur !== it) {
      const rows = heroDeltas(it)
        .map(([ic, n, b, a, fmt]) => {
          const d = a - b;
          if (Math.abs(d) < 0.5) return "";
          return "<li><span>" + I.ui(ic) + " " + n + '</span><b class="' + (d > 0 ? "delta-up" : "delta-down") + '">' + sign(d, fmt) + "</b></li>";
        })
        .join("");
      cmp = '<div class="cmp"><div class="muted">' + (cur ? "Statt „" + esc(cur.name) + "“ angelegt:" : "Freier Platz, angelegt:") + "</div><ul>" + (rows || "<li><span>gleichwertig</span></li>") + "</ul></div>";
    } else if (opts.compare !== false && S && !can) {
      cmp = '<div class="cmp delta-down">Nur für ' + esc(archName(it.arch)) + "-Klassen</div>";
    }
    return (
      '<div class="itemcard"><h4 class="t-' + it.rarity + '">' + esc(it.name) + '</h4><div class="kind">' + R.name + " · " + UI.slotName(it) + " · Stufe " + it.level + (it.arch ? " · " + archName(it.arch) : "") + "</div><ul>" +
      itemLines(it).map((l) => "<li><span>" + I.ui(l[0]) + " " + l[1] + '</span><b class="num">' + l[2] + "</b></li>").join("") +
      "</ul>" + cmp + (opts.price ? '<div class="cmp">' + opts.price + "</div>" : "") + "</div>"
    );
  };
  // Ausfuehrlicher Vergleich fuer den Dialog: angelegt gegen neu, Wert fuer Wert
  UI.compareTable = function (it) {
    const S = UI.S;
    if (!E.canEquip(S, it)) return "";
    const cur = S.equip[it.slot];
    if (cur === it) return "";
    const rowsItem = [];
    const val = (x, k) => (k === "dmg" ? (x && x.min ? (x.min + x.max) / 2 : 0) : k === "armor" ? (x && x.armor) || 0 : (x && x.stats[k]) || 0);
    const keys = [];
    if (it.min || (cur && cur.min)) keys.push(["dmg", "schaden", "Ø Waffenschaden"]);
    if (it.armor || (cur && cur.armor)) keys.push(["armor", "ruestung", "Rüstung"]);
    for (const a of D.ATTRS) if ((it.stats[a] || 0) + ((cur && cur.stats[a]) || 0) > 0) keys.push([a, a, D.ATTR_INFO[a].name]);
    for (const [k, ic, n] of keys) {
      const a = val(cur, k);
      const b = val(it, k);
      const d = Math.round(b - a);
      rowsItem.push("<tr><td>" + I.ui(ic) + " " + n + '</td><td class="num">' + U.fmt(Math.round(a)) + '</td><td class="num">' + U.fmt(Math.round(b)) + '</td><td class="num ' + (d > 0 ? "delta-up" : d < 0 ? "delta-down" : "") + '">' + (d ? sign(d, U.fmt) : "±0") + "</td></tr>");
    }
    const rowsHero = heroDeltas(it).map(([ic, n, a, b, fmt]) => {
      const d = b - a;
      return "<tr><td>" + I.ui(ic) + " " + n + '</td><td class="num">' + fmt(a) + '</td><td class="num">' + fmt(b) + '</td><td class="num ' + (d > 0.5 ? "delta-up" : d < -0.5 ? "delta-down" : "") + '">' + (Math.abs(d) >= 0.5 ? sign(d, fmt) : "±0") + "</td></tr>";
    });
    return (
      '<table class="cmptable"><thead><tr><th>Gegenstand</th><th>' + (cur ? "Angelegt" : "Leer") + "</th><th>Neu</th><th>Unterschied</th></tr></thead><tbody>" + rowsItem.join("") +
      '<tr class="sep"><th colspan="4">Deine Werte danach</th></tr>' + rowsHero.join("") + "</tbody></table>"
    );
  };
  UI.slotHtml = function (it, ref, extra) {
    extra = extra || {};
    if (!it) return '<div class="slot empty">' + (extra.emptyIcon ? I.ui(extra.emptyIcon) : "") + (extra.label ? '<span class="slot-name">' + extra.label + "</span>" : "") + "</div>";
    const blocked = UI.S && !E.canEquip(UI.S, it);
    return (
      '<button type="button" class="slot r-' + it.rarity + (blocked ? " blocked" : "") + '" data-item="' + ref + '" data-act="' + (extra.act || "itemInfo") + '" data-ref="' + ref + '" aria-label="' + esc(it.name) + '">' +
      I.item(it) + (extra.upgrade && UI.isUpgrade(it) ? '<span class="up">' + I.ui("pfeil") + "</span>" : "") + (extra.price ? '<span class="price">' + extra.price + "</span>" : "") + "</button>"
    );
  };

  /* Tooltip fuer Maus-Bedienung */
  let tip = null;
  function placeTip(ev) {
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = ev.clientX + 16;
    let y = ev.clientY + 16;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 16;
    if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top = y + "px";
  }
  document.addEventListener("pointerover", (ev) => {
    if (ev.pointerType !== "mouse") return;
    const el = ev.target.closest && ev.target.closest("[data-item]");
    if (!el || !UI.S) return;
    const it = UI.itemRef(el.dataset.item);
    if (!it) return;
    tip = tip || $("#tip");
    if (!tip) return;
    tip.innerHTML = UI.itemCard(it);
    tip.style.borderColor = D.RARITIES[it.rarity].color;
    tip.hidden = false;
    placeTip(ev);
  });
  document.addEventListener("pointermove", (ev) => {
    if (tip && !tip.hidden) placeTip(ev);
  });
  document.addEventListener("pointerout", (ev) => {
    const el = ev.target.closest && ev.target.closest("[data-item]");
    if (el && tip) tip.hidden = true;
  });
  UI.hideTip = () => tip && (tip.hidden = true);

  /* ---------- Dialoge ---------- */
  UI.dialog = function (html, opts) {
    opts = opts || {};
    const m = $("#modal");
    m.innerHTML = '<div class="dialog ' + (opts.cls || "") + '" role="dialog" aria-modal="true">' + html + "</div>";
    m.hidden = false;
    UI.hideTip();
    const first = m.querySelector("[data-autofocus]") || m.querySelector("button");
    if (first) setTimeout(() => first.focus(), 30);
    return m.firstChild;
  };
  UI.closeDialog = function () {
    const m = $("#modal");
    m.hidden = true;
    m.innerHTML = "";
    delete m.dataset.locked;
  };
  UI.ACTIONS.closeDialog = () => UI.closeDialog();

  UI.ACTIONS.itemInfo = function (el) {
    const S = UI.S;
    const ref = el.dataset.ref;
    const it = UI.itemRef(ref);
    if (!it) return;
    const [kind, a, b] = ref.split(":");
    let actions = "";
    let price = "";
    if (kind === "inv") {
      if (E.canEquip(S, it)) actions += '<button class="btn" data-act="equip" data-i="' + a + '">Anlegen</button>';
      actions += '<button class="btn ghost" data-act="sell" data-i="' + a + '">Verkaufen für ' + UI.gold(E.sellPrice(it)) + "</button>";
    } else if (kind === "eq") {
      actions += '<button class="btn ghost" data-act="unequip" data-slot="' + a + '">Ablegen</button>';
    } else if (kind === "shop") {
      price = "Preis: " + UI.gold(it.value);
      actions += '<button class="btn" data-act="buy" data-shop="' + a + '" data-i="' + b + '"' + (S.gold < it.value ? " disabled" : "") + ">Kaufen</button>";
    }
    UI.dialog(UI.itemCard(it, { price, compare: false }) + UI.compareTable(it) + (E.canEquip(S, it) ? "" : '<p class="delta-down">Nur für ' + esc(archName(it.arch)) + "-Klassen.</p>") + '<div class="actions"><button class="btn ghost" data-act="closeDialog">Schließen</button>' + actions + "</div>", { cls: "wide" });
  };

  /* ---------- Menueleiste (links am Desktop, unten am Handy) ---------- */
  const MENU = [
    ["held", "held", "Charakter"],
    ["heim", "heim", "Heim"],
    ["taverne", "taverne", "Taverne"],
    ["steinkreis", "steinkreis", "Chronik"],
    ["arena", "arena", "Arena"],
    ["leuchtturm", "leuchtturm", "Wache"],
    ["tiefen", "tiefen", "Dungeons"],
    ["schmiede", "schmiede", "Schmiede"],
    ["arkanum", "arkanum", "Kuriositäten"],
    ["stall", "stall", "Stall"],
    ["ruhmeshalle", "ruhm", "Rangliste"],
    ["gildenhalle", "gilde", "Gilde"],
    ["brunnen", "brunnen", "Brunnen"],
    ["mondtor", "mond", "Mondtor"],
  ];
  UI.MENU = MENU;
  let lastPortraitKey = "";
  UI.renderTop = function () {
    const S = UI.S;
    const top = $("#topbar");
    if (!top) return;
    const x = UI.xpInfo(S);
    const en = E.energy(S);
    const key = JSON.stringify(UI.heroDesc(S));
    if (!top.dataset.built) {
      top.innerHTML =
        '<button class="me-chip" data-act="open" data-id="held" aria-label="Dein Charakter"><span class="porthole" id="mePortrait"></span><span class="me-meta"><span class="me-name"></span><span class="me-sub"></span></span></button>' +
        '<button class="xpwrap" data-act="open" data-id="held" aria-label="Erfahrung"><span class="xpbar"><i></i><span class="xptext num"></span></span></button>' +
        '<div class="res"><span class="chip" title="Gold" id="resGold"></span><span class="chip" title="Wolkenperlen" id="resPerl"></span><span class="gauge" title="Tatendrang" id="resEnergy"></span><span class="chip hon" title="Ehre" id="resHonor"></span>' +
        '<span class="chip daychip" id="resDay" title="Tageszeit"></span>' +
        '<button class="iconbtn" data-act="toggleMusic" id="musicBtn" aria-label="Musik an oder aus"></button><button class="iconbtn" data-act="toggleSound" id="soundBtn" aria-label="Klangeffekte an oder aus"></button><button class="iconbtn" data-act="open" data-id="einstellungen" aria-label="Einstellungen">' + I.ui("einstellungen") + "</button></div>";
      top.dataset.built = "1";
    }
    if (key !== lastPortraitKey) {
      lastPortraitKey = key;
      $("#mePortrait").innerHTML = UI.heroPortrait(S);
      if (UI.hub) UI.hub.setHero(UI.heroDesc(S));
    }
    top.querySelector(".me-name").innerHTML = I.realm(S.realm) + " " + esc(S.name) + (S.guild ? ' <span class="gtag">[' + esc(S.guild.tag) + "]</span>" : "");
    top.querySelector(".me-sub").textContent = "Stufe " + S.level + " · " + D.CLASSES[S.cls].name;
    top.querySelector(".xpbar i").style.width = x.pct.toFixed(1) + "%";
    top.querySelector(".xptext").textContent = innerWidth <= 520 ? U.fmtShort(x.rest) + " EP bis " + (S.level + 1) : "Stufe " + S.level + " · " + U.fmt(x.have) + " / " + U.fmt(x.need) + " EP · noch " + U.fmt(x.rest) + " bis Stufe " + (S.level + 1);
    $("#resGold").innerHTML = I.ui("gold") + '<span class="num">' + U.fmtShort(S.gold) + "</span>";
    $("#resPerl").innerHTML = I.ui("perle") + '<span class="num">' + U.fmt(S.perlen) + "</span>";
    $("#resEnergy").innerHTML = UI.gauge(en, E.energyMax(S)) + "<span><small>Tatendrang</small>" + Math.floor(en) + "</span>";
    $("#resHonor").innerHTML = I.ui("ehre") + '<span class="num">' + U.fmt(S.honor) + "</span>";
    const t = SB.R3D.dayTime(S.settings.dayCycle || "zyklus");
    const lbl = SB.R3D.dayLabel(t);
    $("#resDay").innerHTML = I.ui(lbl === "Nacht" || lbl === "Abenddämmerung" ? "mond" : "sonne") + "<span>" + lbl + "</span>";
    $("#soundBtn").innerHTML = I.ui(S.settings.sound ? "ton" : "stumm");
    $("#musicBtn").innerHTML = I.ui("musik");
    $("#musicBtn").classList.toggle("off", S.settings.music === false);
  };

  UI.badges = function () {
    const S = UI.S;
    const now = E.now();
    const b = {};
    const a = S.quest.active;
    if (a && a.end <= now) b.taverne = "!";
    else if (!E.busy(S, now) && S.quest.offers.some((o) => E.energy(S, now) >= o.energy)) b.taverne = S.quest.offers.some((o) => o.rare || o.boss) ? "★" : "3";
    if (S.guard && S.guard.end <= now) b.leuchtturm = "✓";
    if (!E.busy(S, now) && S.arena.next <= now) b.arena = "!";
    if (E.wellFree(S)) b.brunnen = "1";
    if (!E.busy(S, now) && S.story.next <= now && E.storyChapters(S).some((c) => c.available)) b.steinkreis = "!";
    if (!E.busy(S, now) && S.dungeons.next <= now) {
      for (let d = 0; d < D.DUNGEONS.length; d++) {
        const st = E.dungeonState(S, d);
        if (st.unlocked && !st.done) {
          b.tiefen = "!";
          break;
        }
      }
    }
    const C = D.CLASSES[S.cls];
    if (S.gold >= E.attrCost(S.bought[C.main]) || S.inv.some((it) => UI.isUpgrade(it)) || E.talentFree(S) > 0) b.held = "+";
    if (!S.guild) b.gildenhalle = "?";
    if (UI.isNight() && E.nightHuntsLeft(S) > 0 && !E.busy(S, now)) b.mondtor = "☾";
    return b;
  };
  UI.renderDock = function () {
    const dock = $("#dock");
    if (!dock) return;
    const b = UI.badges();
    // Laeuft ein Auftrag oder eine Wache, zaehlt die Restzeit neben dem Menuepunkt herunter (UI.updateTimers)
    const S = UI.S;
    const now = E.now();
    const left = {};
    if (S.quest.active && S.quest.active.end > now) left.taverne = S.quest.active.end;
    if (S.guard && S.guard.end > now) left.leuchtturm = S.guard.end;
    dock.innerHTML =
      '<div class="side-logo">' + esc(D.REALMS[S.realm].isle) + "<small>Heimatinsel von " + esc(D.REALMS[S.realm].name) + "</small></div>" +
      MENU.map(([id, ic, label]) => '<button class="dock-btn' + (UI.panelId === id ? " active" : "") + '" data-act="open" data-id="' + id + '">' + I.ui(ic) + "<span>" + label + "</span>" + (left[id] ? '<b class="dock-zeit num" data-until="' + left[id] + '"></b>' : b[id] ? '<span class="badge">' + b[id] + "</span>" : "") + "</button>").join("");
    UI.updateTimers();
    if (UI.hub) UI.hub.setBadges(b);
    UI.renderFallbackStage(b);
  };
  UI.renderFallbackStage = function (b) {
    const fb = $(".stage-fallback .fb-grid");
    if (!fb) return;
    fb.innerHTML = D.BUILDINGS.map((bd) => {
      const ic = (MENU.find((d) => d[0] === bd.id) || [0, "held"])[1];
      return '<button data-act="open" data-id="' + bd.id + '">' + I.ui(ic) + "<b>" + esc(bd.name) + "</b>" + (b[bd.id] ? '<span class="tag">' + b[bd.id] + "</span>" : "") + "</button>";
    }).join("");
  };

  /* Aktivitaetsanzeige */
  UI.renderActivity = function () {
    const S = UI.S;
    const box = $("#activity");
    if (!box) return;
    const now = E.now();
    let html = "";
    let target = null;
    let done = false;
    if (S.quest.active) {
      const a = S.quest.active;
      done = a.end <= now;
      const pct = done ? 100 : ((now - a.start) / (a.end - a.start)) * 100;
      target = "taverne";
      html = I.ui(done ? "arena" : "uhr") + '<div class="act-text"><div class="act-title">' + (done ? "Auftrag erledigt: Der Kampf wartet!" : esc(a.offer.title)) + '</div><div class="progress" data-from="' + a.start + '" data-to="' + a.end + '"><i style="width:' + pct.toFixed(1) + '%"></i></div></div>' + (done ? '<span class="btn small">Kämpfen</span>' : '<b class="num" data-until="' + a.end + '"></b>');
    } else if (S.guard) {
      const g = S.guard;
      done = g.end <= now;
      const pct = done ? 100 : ((now - g.start) / (g.end - g.start)) * 100;
      target = "leuchtturm";
      html = I.ui("leuchtturm") + '<div class="act-text"><div class="act-title">' + (done ? "Wache beendet: Lohn abholen" : "Wache am Turm") + '</div><div class="progress" data-from="' + g.start + '" data-to="' + g.end + '"><i style="width:' + pct.toFixed(1) + '%"></i></div></div>' + (done ? '<span class="btn small">Abholen</span>' : '<b class="num" data-until="' + g.end + '"></b>');
    }
    box.hidden = !html || (UI.panelId && UI.panelId === target);
    box.innerHTML = html;
    box.dataset.act = "open";
    box.dataset.id = target || "";
    box.classList.toggle("done-pulse", done);
    UI.updateTimers();
  };

  UI.updateTimers = function () {
    const now = E.now();
    document.querySelectorAll("[data-until]").forEach((el) => {
      const ms = +el.dataset.until - now;
      el.textContent = ms > 0 ? U.fmtTime(ms) : el.dataset.doneText || "fertig";
    });
    // Reise- und Wachebalken laufen sekundengenau mit der Uhr
    document.querySelectorAll(".progress[data-from] > i").forEach((el) => {
      const a = +el.parentNode.dataset.from, b = +el.parentNode.dataset.to;
      el.style.width = (b > a ? Math.max(0, Math.min(100, ((now - a) / (b - a)) * 100)) : 100).toFixed(1) + "%";
    });
  };

  /* ---------- Musik je Ort ---------- */
  const PANEL_MUSIC = { taverne: "taverne", heim: "heim", steinkreis: "chronik", tiefen: "tiefe", gildenhalle: "taverne", mondtor: "nacht" };
  UI.updateMusic = function () {
    const S = UI.S;
    if (!S) return;
    let ctx;
    if (UI.inBattle) ctx = "kampf";
    else if (UI.panelId && PANEL_MUSIC[UI.panelId]) ctx = PANEL_MUSIC[UI.panelId];
    else ctx = UI.isNight() ? "nacht" : "tag";
    // Tag, Nacht, Taverne und Kampf klingen in jedem Reich anders
    if (ctx === "tag" || ctx === "nacht" || ctx === "taverne" || ctx === "kampf") ctx += ":" + S.realm;
    SB.audio.music(ctx);
  };

  /* ---------- Panels ---------- */
  UI.openPanel = function (id) {
    if (!UI.PANELS[id]) return;
    SB.audio.unlock();
    SB.audio.play("page");
    UI.panelId = id;
    document.body.classList.add("panel-open");
    const P = $("#panel");
    P.hidden = false;
    P.dataset.id = id;
    UI.renderPanel(true);
    if (UI.hub) {
      UI.hub.focus(id === "einstellungen" || id === "held" || id === "figurenprobe" ? null : id);
      const wide = innerWidth > 860;
      UI.hub.setInset(wide ? P.offsetWidth + 24 : 0);
      if (!wide) UI.hub.pause();
    }
    UI.renderDock();
    UI.renderActivity();
    UI.checkHint();
    UI.updateMusic();
  };
  UI.closePanel = function () {
    const def = UI.PANELS[UI.panelId];
    if (def && def.close) def.close();
    UI.panelId = null;
    document.body.classList.remove("panel-open");
    const P = $("#panel");
    P.hidden = true;
    P.innerHTML = "";
    UI.detachHeroView();
    if (UI.hub) {
      UI.hub.focus(null);
      UI.hub.setInset(0);
      UI.hub.resume();
    }
    UI.renderDock();
    UI.renderActivity();
    UI.checkHint();
    UI.updateMusic();
  };
  UI.ACTIONS.open = (el) => {
    const id = el.dataset.id;
    if (!id) return;
    if (UI.panelId === id && !el.closest("#activity")) UI.closePanel();
    else {
      if (UI.panelId && UI.PANELS[UI.panelId].close) UI.PANELS[UI.panelId].close();
      UI.openPanel(id);
    }
  };
  UI.ACTIONS.closePanel = () => UI.closePanel();

  UI.renderPanel = function (fresh) {
    const id = UI.panelId;
    if (!id) return;
    const P = $("#panel");
    const def = UI.PANELS[id];
    const body = P.querySelector(".panel-body");
    const scroll = body && !fresh ? body.scrollTop : 0;
    let head = def.head ? def.head() : null;
    if (!head) {
      const bd = D.BUILDINGS.find((b) => b.id === id);
      const npc = bd && bd.npc ? D.NPCS[bd.npc] : null;
      head = { title: def.title || (bd ? bd.name : ""), role: npc ? npc.name + ", " + npc.role : def.role || "", portrait: bd && bd.npc ? UI.npcPortrait(bd.npc) : def.portrait ? def.portrait() : "" };
    }
    UI.detachHeroView();
    if (def.beforeRender) def.beforeRender(P);
    P.innerHTML =
      '<div class="panel-head">' + (head.portrait ? '<span class="porthole">' + head.portrait + "</span>" : "") + '<div><h2>' + esc(head.title) + '</h2><div class="role">' + esc(head.role) + '</div></div><button class="iconbtn close" data-act="closePanel" aria-label="Schließen">' + I.ui("schliessen") + '</button></div><div class="panel-body">' + def.render() + "</div>";
    if (def.after) def.after(P);
    const nb = P.querySelector(".panel-body");
    if (nb) nb.scrollTop = scroll;
    UI.updateTimers();
  };

  /* Persistente 3D-Heldenansicht, die Neuzeichnungen ueberlebt */
  let heroView = null;
  let heroViewEl = null;
  let heroViewKey = "";
  let heroViewStill = "";
  UI.attachHeroView = function (slot, desc, caption) {
    if (!slot) return;
    if (!UI.use3d) {
      slot.innerHTML = '<div class="hv-fallback">' + I.silhouette(desc.gear && desc.gear.ruestung ? desc.gear.ruestung.tint : "#7f8a96", desc.kind) + "</div>";
      return;
    }
    if (!heroViewEl) {
      heroViewEl = document.createElement("div");
      heroViewEl.style.cssText = "position:absolute;inset:0";
    }
    slot.appendChild(heroViewEl);
    if (caption) {
      const c = document.createElement("div");
      c.className = "hv-caption";
      c.innerHTML = caption;
      slot.appendChild(c);
    }
    if (!heroView) {
      heroView = SB.R3D.createHeroView(heroViewEl);
      heroViewKey = "";
    }
    const k = JSON.stringify(desc);
    if (k !== heroViewKey) {
      // Jubel nur bei neuer Ausruestung oder neuem Helden, nicht wenn Figur oder Ausruestungsmodelle fertig geladen sind
      const still = JSON.stringify(Object.assign({}, desc, { gen: 0, genGear: 0, gv: 0, pending: 0 }));
      const celebrate = !!heroViewKey && still !== heroViewStill;
      heroViewKey = k;
      heroViewStill = still;
      heroView.set(desc, celebrate);
    }
    return heroView;
  };
  UI.detachHeroView = function () {
    if (heroViewEl && heroViewEl.parentNode) heroViewEl.parentNode.removeChild(heroViewEl);
  };
  UI.disposeHeroView = function () {
    if (heroView) heroView.dispose();
    heroView = null;
    heroViewEl = null;
    heroViewKey = "";
  };

  /* ---------- Hinweise von Hueterin Ottilie ---------- */
  const TUT = [
    { when: () => true, text: (S) => "Willkommen auf " + D.REALMS[S.realm].isle + ", " + S.name + ". Ich bin Ottilie und hüte deine Heimatinsel. In der Taverne „Zur Schiefen Krähe“ warten deine ersten Aufträge.", btn: "Zur Taverne", act: () => UI.openPanel("taverne"), panel: "taverne" },
    { when: () => UI.panelId === "taverne" && !UI.S.quest.active, text: () => "Jeder Auftrag kostet Tatendrang, der sich mit der Zeit auffüllt. Achte auf die Siegchance. Seltene Hordenaufträge schicken dir mehrere Gegner nacheinander.", btn: "Verstanden" },
    { when: () => UI.S.stats.quests >= 1 && !UI.S.quest.active, text: () => "Gut gemacht! Gold steckst du am besten in deine Attribute. Im Charakterbogen siehst du auch genau, wie viel Erfahrung dir bis zur nächsten Stufe fehlt.", btn: "Zum Charakter", act: () => UI.openPanel("held"), panel: "held" },
    { when: () => UI.S.stats.quests >= 3, text: () => "In der Schmiede und bei Madame Zinnober gibt es bessere Ausrüstung. Fährst du mit der Maus über einen Gegenstand, siehst du sofort, wie sich deine Werte verändern würden.", btn: "Verstanden" },
    { when: () => UI.S.level >= 3, text: () => "Im Steinkreis erzählt die Seherin die Chronik deines Reiches und deiner Klasse. Jedes Kapitel bringt seltene Beute.", btn: "Zum Steinkreis", act: () => UI.openPanel("steinkreis"), panel: "steinkreis" },
    { when: () => UI.S.level >= 5, text: () => "Im Ring der Reiche kämpfst du gegen Helden aus den anderen Reichen. Ehre bringt dich in der Rangliste nach oben, für dich und für dein Reich.", btn: "Leinen los" },
    { when: () => UI.S.level >= 10, text: () => "Stufe 10! Das Tor zur Tiefe hat sich geöffnet. Dort warten Bosse mit seltener und epischer Beute.", btn: "Ab in die Tiefe", act: () => UI.openPanel("tiefen"), panel: "tiefen" },
    { when: () => UI.S.level >= 2 && E.talentFree(UI.S) > 0, text: () => "Du hast einen Talentpunkt! Im Charakterbogen unter „Talente“ wählst du besondere Fähigkeiten deiner Klasse. Sie wirken in jedem Kampf.", btn: "Zu den Talenten", act: () => {
      UI.tabs.held = "talente";
      UI.openPanel("held");
    }, panel: "held" },
    { when: () => UI.S.level >= 2 && UI.isNight(), text: () => "Es ist Nacht. Hinter dem Steinkreis leuchtet jetzt das Mondtor: Dort warten Nachtjagden und die Händlerin Selene, aber nur bis zum Morgengrauen.", btn: "Zum Mondtor", act: () => UI.openPanel("mondtor"), panel: "mondtor" },
  ];
  UI.checkHint = function () {
    const S = UI.S;
    const box = $("#hint");
    if (!box || !S) return;
    let step = TUT[S.tut];
    while (step && step.panel && step.panel === UI.panelId && step.when()) {
      S.tut++;
      step = TUT[S.tut];
    }
    if (!step || !step.when() || UI.inBattle) {
      box.hidden = true;
      return;
    }
    // gleicher Schritt: nur neu zeichnen, solange Ottilies Figur noch laedt (dann steht dort ihr Umriss)
    if (box.dataset.step === String(S.tut) && !box.hidden && box.dataset.wait !== "1") return;
    box.dataset.step = String(S.tut);
    const ott = withGen(Object.assign({ kind: "hero" }, UI.NPC_LOOK.ottilie));
    box.dataset.wait = ott.pending ? "1" : "";
    box.innerHTML = '<span class="porthole">' + UI.portrait(ott, 128, true) + '</span><div><p></p><button class="btn small" data-act="hintNext">' + step.btn + '</button> <button class="btn small ghost" data-act="hintSkip">Keine Tipps mehr</button></div>';
    box.querySelector("p").textContent = step.text(S);
    box.hidden = false;
  };
  UI.ACTIONS.hintNext = function () {
    const step = TUT[UI.S.tut];
    UI.S.tut++;
    $("#hint").hidden = true;
    UI.save();
    if (step && step.act) step.act();
    UI.checkHint();
  };
  UI.ACTIONS.hintSkip = function () {
    UI.S.tut = TUT.length;
    $("#hint").hidden = true;
    UI.save();
  };

  /* ---------- Gesamtaktualisierung ---------- */
  UI.refresh = function (opts) {
    opts = opts || {};
    UI.renderTop();
    UI.renderDock();
    UI.renderActivity();
    if (UI.panelId && opts.panel !== false) UI.renderPanel();
    if (UI.hub) UI.hub.setHome(UI.S.house.tier, UI.S.realm);
    UI.checkHint();
    UI.save();
  };

  /* Sekundentakt: Zeitgeber, Zustandswechsel */
  let lastState = "";
  let musicTimer = 0;
  UI.tick = function () {
    const S = UI.S;
    if (!S) return;
    const now = E.now();
    E.tick(S, now);
    const qDone = !!(S.quest.active && S.quest.active.end <= now);
    const gDone = !!(S.guard && S.guard.end <= now);
    const aReady = S.arena.next <= now;
    const dReady = S.dungeons.next <= now;
    const sReady = S.story.next <= now;
    const night = UI.isNight();
    const st = [qDone, gDone, aReady, dReady, sReady, Math.floor(E.energy(S, now)), S.daily.day, night].join("|");
    if (st !== lastState) {
      const prev = lastState.split("|");
      if (lastState) {
        if (qDone && prev[0] === "false") {
          UI.toast("Auftrag erledigt! Der Kampf wartet in der Taverne.", "good", "arena");
          SB.audio.play("quest");
        }
        if (gDone && prev[1] === "false") UI.toast("Deine Wache ist vorbei. Funzel hat deinen Lohn bereit.", "good", "leuchtturm");
        if (String(night) !== prev[7]) {
          if (night) UI.toast("Die Nacht bricht herein. Das Mondtor hat sich geöffnet.", "good", "mond");
          else UI.toast("Der Morgen graut. Das Mondtor schließt sich bis zur nächsten Nacht.", "", "sonne");
          UI.updateMusic();
          UI.checkHint();
        }
      }
      lastState = st;
      UI.renderTop();
      UI.renderDock();
      UI.renderActivity();
      if (UI.panelId && (prev[0] !== String(qDone) || prev[1] !== String(gDone) || prev[2] !== String(aReady) || prev[3] !== String(dReady) || prev[4] !== String(sReady) || prev[6] !== S.daily.day || prev[7] !== String(night))) UI.renderPanel();
    } else {
      UI.renderTop();
    }
    UI.updateTimers();
    if (++musicTimer >= 5) {
      musicTimer = 0;
      UI.updateMusic();
    }
  };

  /* Klick-Verteilung ueber data-act */
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest && ev.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const fn = UI.ACTIONS[el.dataset.act];
    if (!fn) return;
    ev.preventDefault();
    SB.audio.unlock();
    try {
      fn(el, ev);
    } catch (e) {
      console.error(e);
      UI.toast("Da ist etwas schiefgelaufen: " + e.message, "bad");
    }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (UI.inBattle) return;
    if (!$("#modal").hidden && !$("#modal").dataset.locked) UI.closeDialog();
    else if (UI.panelId) UI.closePanel();
  });
  document.addEventListener("click", (ev) => {
    if (ev.target && ev.target.id === "modal" && !ev.target.dataset.locked) UI.closeDialog();
  });

  UI.ACTIONS.toggleSound = function () {
    UI.S.settings.sound = !UI.S.settings.sound;
    SB.audio.setSfx(UI.S.settings.sound);
    UI.renderTop();
    if (UI.panelId === "einstellungen") UI.renderPanel();
    UI.save();
  };
  UI.ACTIONS.toggleMusic = function () {
    UI.S.settings.music = UI.S.settings.music === false;
    SB.audio.setMusic(UI.S.settings.music);
    UI.updateMusic();
    UI.renderTop();
    if (UI.panelId === "einstellungen") UI.renderPanel();
    UI.save();
  };
})();
