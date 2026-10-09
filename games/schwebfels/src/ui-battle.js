/* Helden von Schwebfels - Kampfdarstellung (auch mehrere Gegner nacheinander) und Heldenerschaffung. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const D = SB.data;
  const E = SB.engine;
  const U = SB.util;
  const I = SB.icons;
  const UI = SB.ui;
  const esc = U.esc;
  const $ = UI.$;

  /* ================= Kampf ================= */
  // Monsterfiguren der Gegner, Heldenkoerper und die gemalte Kulisse vorher nachladen (hoechstens 15 Sekunden, mit
  // Hinweis, sonst stehen Platzhalter da); auf langsamen Handys dauert das beim ersten Kampf einen Moment
  const BATTLE_WAIT = 15000;
  UI.runBattle = function (fight, opts) {
    const archs = (fight.foes || []).filter((f) => f.kind === "monster" && f.id).map((f) => f.arch);
    const cap = (p) => Promise.race([p, new Promise((r) => setTimeout(r, BATTLE_WAIT))]);
    // Heldenkoerper aller beteiligten Reiche (Arena, Rangliste): deren Figurendatei ebenfalls vorher laden
    const realms = [...new Set([fight.hero].concat(fight.foes || []).filter((f) => f && f.kind !== "monster" && f.realm).map((f) => f.realm))];
    let done = false;
    const note = setTimeout(() => !done && UI.toast("Figuren und Kulisse werden geladen …"), 900);
    return Promise.all([UI.loadMonsters(archs, BATTLE_WAIT), cap(UI.loadKulissen()), cap(Promise.all(realms.map(UI.loadGenFigures)))]).then(() => {
      done = true;
      clearTimeout(note);
      return runBattle(fight, opts);
    });
  };
  function runBattle(fight, opts) {
    return new Promise((resolve) => {
      const S = UI.S;
      const root = $("#battle");
      UI.hideTip();
      UI.inBattle = true;
      UI.updateMusic();
      if (UI.hub) UI.hub.pause();
      const hero = fight.hero;
      const foes = fight.foes;
      const chain = fight.chain;
      const multi = foes.length > 1;
      const sub = (f) => "Stufe " + f.level + (f.kind === "monster" ? " · " + (D.ARCH_NAMES[f.arch] || D.MONSTER_TYPES[f.mainKey].profile) : " · " + D.CLASSES[f.cls].name);
      const plate = (f, side) =>
        '<div class="plate ' + side + '"><span class="porthole">' + UI.portrait(UI.fighterDesc(f), 128, f.kind !== "monster") + '</span><div class="pmeta"><div class="pname">' + (f.realm && f.kind !== "monster" ? I.realm(f.realm) + " " : "") + esc(f.name) + '</div><div class="plv">' + sub(f) + '</div><div class="hp"><i style="width:100%"></i><span class="num">' + U.fmt(f.maxHp) + "</span></div></div></div>";
      root.innerHTML =
        '<div class="bstage"></div><div class="plates">' + plate(hero, "left") + '<div class="btitle">' + esc(opts.title || "") + (multi ? '<div class="wave">Gegner <b id="waveNo">1</b> von ' + foes.length + "</div>" : "") + "</div>" + plate(foes[0], "right") + "</div>" +
        '<div class="bcontrols"><button class="btn ghost small" data-speed="1">1×</button><button class="btn ghost small" data-speed="2">2×</button><button class="btn ghost small" data-speed="4">4×</button><button class="btn small" data-skip="1">Überspringen</button></div>';
      root.hidden = false;
      document.body.classList.add("in-battle");
      $("#hint").hidden = true;
      const stage = root.querySelector(".bstage");
      const max = [hero.maxHp, foes[0].maxHp];
      const setHp = (side, hp) => {
        const bar = root.querySelectorAll(".hp")[side];
        if (!bar) return;
        const pct = Math.max(0, Math.min(1, hp / max[side])) * 100;
        const i = bar.querySelector("i");
        i.style.width = pct.toFixed(1) + "%";
        i.classList.toggle("low", pct < 30);
        bar.querySelector("span").textContent = U.fmt(Math.max(0, Math.round(hp)));
      };
      let speed = S.settings.fastFights ? 2 : 1;
      let skip = false;
      const markSpeed = () => root.querySelectorAll("[data-speed]").forEach((b) => b.classList.toggle("on", +b.dataset.speed === speed));
      markSpeed();
      let battle = null;
      let log = null;
      let figs = null;
      if (UI.use3d) {
        try {
          battle = SB.R3D.createBattle(stage, {
            setting: opts.setting,
            tint: opts.tint,
            dungeon: opts.dungeon,
            dayTime: opts.dayTime != null ? opts.dayTime : SB.R3D.dayTime(S.settings.dayCycle || "zyklus"),
            realm: S.realm,
            left: UI.fighterDesc(hero),
            right: UI.fighterDesc(foes[0]),
            hp: max.slice(),
            onImpact: (side, hp) => setHp(side, hp),
            sfx: (n) => SB.audio.play(n),
          });
          battle.setSpeed(speed);
        } catch (e) {
          console.warn("3D-Kampf nicht verfuegbar", e);
          battle = null;
        }
      }
      function fallbackStage(foe) {
        stage.innerHTML = '<div class="fb2d"><div class="fig">' + UI.portrait(UI.fighterDesc(hero), 200) + '</div><div class="fig">' + UI.portrait(UI.fighterDesc(foe), 200) + '</div></div><div class="blog"></div>';
        log = stage.querySelector(".blog");
        figs = stage.querySelectorAll(".fig");
      }
      if (!battle) fallbackStage(foes[0]);
      root.onclick = (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        if (b.dataset.speed) {
          speed = +b.dataset.speed;
          if (battle) battle.setSpeed(speed);
          markSpeed();
        }
        if (b.dataset.skip) skip = true;
      };
      let names = [hero.name, foes[0].name];
      const hpNow = [hero.maxHp, foes[0].maxHp];
      const wait = (ms) => new Promise((r) => setTimeout(r, ms / speed));
      const say2d = (t) => {
        log.insertAdjacentHTML("beforeend", "<p>" + t + "</p>");
        log.scrollTop = log.scrollHeight;
      };
      async function play2d(ev) {
        const a = ev.a;
        const d = 1 - a;
        if (ev.kind === "talent") {
          if (ev.hp) {
            hpNow[0] = ev.hp[0];
            hpNow[1] = ev.hp[1];
            setHp(0, hpNow[0]);
            setHp(1, hpNow[1]);
          }
          say2d("<b>" + esc(names[a]) + ": " + esc(ev.name) + "</b>" + (ev.heal ? ", heilt " + U.fmt(ev.heal) : "") + (ev.ward ? ", Barriere " + U.fmt(ev.ward) : ""));
          await wait(500);
          return;
        }
        if (ev.kind === "counter") say2d("<b>" + esc(names[a]) + ": " + esc(ev.name) + "!</b>");
        if (ev.kind === "stun") {
          say2d(esc(names[a]) + " ist betäubt und setzt aus.");
          await wait(500);
          return;
        }
        if (ev.kind === "dot") {
          hpNow[a] = ev.hp[a];
          setHp(a, hpNow[a]);
          say2d(esc(names[a]) + " leidet unter Gift: " + U.fmt(ev.dmg) + " Schaden.");
          await wait(420);
          return;
        }
        for (const h of ev.hits) {
          let txt;
          if (h.res === "evade") txt = esc(names[d]) + " weicht aus!";
          else if (h.res === "block") txt = esc(names[d]) + " blockt!";
          else {
            hpNow[d] = Math.max(0, hpNow[d] - h.dmg);
            setHp(d, hpNow[d]);
            figs[d].classList.add("hit");
            setTimeout(() => figs[d].classList.remove("hit"), 150);
            SB.audio.play(h.res === "crit" ? "crit" : "hit");
            const TAGS = { double: "Doppelschlag", opener: "Sturmangriff", assassinate: "Meucheln", execute: "Gnadenstoß", afterStun: "Nachsetzen" };
            const tags = (h.tags || []).filter((t) => TAGS[t]).map((t) => TAGS[t]);
            txt = esc(names[a]) + (ev.spName ? " (" + esc(ev.spName) + ")" : "") + (tags.length ? " [" + tags.join(", ") + "]" : "") + " trifft für <b>" + U.fmt(h.dmg) + "</b>" + (h.res === "crit" ? ", kritisch!" : "") + (h.absorbed ? " (" + U.fmt(h.absorbed) + " von der Barriere abgefangen)" : "");
          }
          say2d(txt);
          await wait(420);
        }
        if (ev.heal) {
          hpNow[a] = ev.hp[a];
          setHp(a, hpNow[a]);
          say2d(esc(names[a]) + " heilt sich um " + U.fmt(ev.heal) + ".");
        }
        if (ev.lifesteal) {
          hpNow[a] = ev.hp[a];
          setHp(a, hpNow[a]);
          say2d(esc(names[a]) + " zieht " + U.fmt(ev.lifesteal) + " Lebenspunkte ab.");
        }
        if (ev.poison) say2d(esc(names[d]) + " ist vergiftet.");
        if (ev.stun) say2d(esc(names[d]) + " ist betäubt.");
      }
      function swapFoePlate(i) {
        const f = foes[i];
        max[1] = f.maxHp;
        hpNow[1] = f.maxHp;
        names = [hero.name, f.name];
        const old = root.querySelector(".plate.right");
        old.outerHTML = plate(f, "right");
        const no = root.querySelector("#waveNo");
        if (no) no.textContent = i + 1;
      }
      (async () => {
        let lastWave = 0;
        for (let w = 0; w < chain.waves.length; w++) {
          lastWave = w;
          const res = chain.waves[w];
          if (w > 0) {
            swapFoePlate(w);
            if (!skip) {
              const banner = document.createElement("div");
              banner.className = "wavebanner";
              banner.textContent = "Gegner " + (w + 1) + " von " + foes.length + ": " + foes[w].name;
              root.appendChild(banner);
              setTimeout(() => banner.remove(), 1800);
            }
            const startHp = res.startHp != null ? res.startHp : hpNow[0];
            if (battle) await battle.nextFoe(UI.fighterDesc(foes[w]), foes[w].maxHp, startHp);
            else fallbackStage(foes[w]);
            hpNow[0] = startHp;
            setHp(0, startHp);
          }
          for (const ev of res.events) {
            if (skip) break;
            if (battle) await battle.play(ev);
            else await play2d(ev);
          }
          hpNow[0] = res.hp[0];
          setHp(0, res.hp[0]);
          setHp(1, res.hp[1]);
          if (res.winner !== 0) break;
          if (skip) continue;
          if (w < chain.waves.length - 1) await wait(500);
        }
        if (skip && lastWave < chain.waves.length - 1) {
          const lw = chain.waves.length - 1;
          swapFoePlate(lw);
          setHp(0, chain.waves[lw].hp[0]);
          setHp(1, chain.waves[lw].hp[1]);
        }
        const won = chain.winner === 0;
        if (battle) await battle.finish(won ? 0 : 1);
        else await wait(400);
        SB.audio.play(won ? "victory" : "defeat");
        showResult(won);
      })();
      function showResult(win) {
        const r = opts.rewards || {};
        const chips = [];
        if (r.xp) chips.push('<span class="chip">' + I.ui("xp") + " +" + U.fmt(r.xp) + " EP</span>");
        if (r.gold) chips.push('<span class="chip">' + UI.gold(r.gold) + "</span>");
        if (r.honor) chips.push('<span class="chip">' + I.ui("ehre") + " " + (r.honor > 0 ? "+" : "") + U.fmt(r.honor) + " Ehre</span>");
        if (r.perle) chips.push('<span class="chip">' + UI.perlen(r.perle) + "</span>");
        if (r.perlen) chips.push('<span class="chip">' + UI.perlen(r.perlen) + "</span>");
        if (r.itemSold) chips.push('<span class="chip">Rucksack voll: Fund für ' + UI.gold(r.itemSold) + " verkauft</span>");
        let itemHtml = "";
        if (r.item) itemHtml = '<div class="lootcard" style="border-color:' + D.RARITIES[r.item.rarity].color + '"><div class="lootpic r-' + r.item.rarity + '">' + I.item(r.item) + "</div>" + UI.itemCard(r.item) + "</div>";
        const lastFoe = foes[Math.min(foes.length - 1, chain.waves.length - 1)];
        let sub;
        if (win) sub = opts.setting === "arena" ? "Das Publikum tobt! Ehre für " + esc(D.REALMS[S.realm].name) + "." : multi ? "Alle " + foes.length + " Gegner sind besiegt!" : esc(lastFoe.name) + (opts.setting === "dungeon" ? " ist gefallen." : " gibt sich geschlagen.");
        else sub = opts.setting === "arena" ? "Das Publikum buht. Morgen ist ein neuer Tag." : (multi ? "Gegner " + chain.waves.length + " von " + foes.length + " war zu stark: " : "Diesmal war ") + esc(lastFoe.name) + (multi ? "." : " stärker.") + " Bessere Ausrüstung und Attribute helfen." + (r.xp ? " Ein Trostpreis bleibt dir trotzdem." : "");
        const x = UI.xpInfo(S);
        const d = UI.dialog(
          '<div class="result ' + (win ? "win" : "lose") + '"><h2>' + (win ? (multi ? "Horde besiegt!" : "Sieg!") : "Niederlage") + '</h2><p class="muted">' + sub + '</p><div class="rewardlist">' + chips.join("") + "</div>" + itemHtml +
            '<div class="xpmini">Stufe ' + S.level + ': <span class="xpbar"><i style="width:' + x.pct.toFixed(1) + '%"></i></span> noch <b class="num">' + U.fmt(x.rest) + "</b> EP bis Stufe " + (S.level + 1) + "</div>" +
            '<div class="actions" style="justify-content:center"><button class="btn big" id="battleDone" data-autofocus>Weiter</button></div></div>'
        );
        d.parentNode.dataset.locked = "1";
        d.querySelector("#battleDone").onclick = () => {
          UI.closeDialog();
          if (battle) battle.dispose();
          root.hidden = true;
          document.body.classList.remove("in-battle");
          root.innerHTML = "";
          root.onclick = null;
          UI.inBattle = false;
          UI.flushNotices();
          UI.updateMusic();
          if (UI.hub) UI.hub.resume();
          resolve();
        };
      }
    });
  }

  /* ================= Heldenerschaffung ================= */
  let view = null;
  let draft = null;
  const realmKeys = () => Object.keys(D.REALMS);
  const racesOf = (realm) => Object.keys(D.RACES).filter((r) => D.RACES[r].realm === realm);
  const classesOf = (realm) => Object.keys(D.CLASSES).filter((c) => D.CLASSES[c].realm === realm);
  function randomLook(race) {
    const r = Math.random;
    const R = D.RACES[race];
    const pick = (a) => a[Math.floor(r() * a.length)];
    return {
      skin: pick(R.skins), hair: pick(R.hairs), hairStyle: Math.floor(r() * D.HAIR_STYLES.length), beard: r() < 0.5 ? 0 : Math.floor(r() * D.BEARDS.length),
      eyes: pick(D.EYES).c, tattoo: r() < 0.55 ? pick(D.TATTOOS).id : "keine", tattooColor: pick(D.TATTOO_COLORS).c, scar: r() < 0.25 ? pick(D.SCARS).id : "keine", horns: Math.floor(r() * 3),
    };
  }
  function randomDraft(keepName, realm) {
    const r = Math.random;
    realm = realm || realmKeys()[Math.floor(r() * 3)];
    const races = racesOf(realm);
    const race = races[Math.floor(r() * races.length)];
    const cls = classesOf(realm)[Math.floor(r() * 4)];
    return { name: keepName || "", realm, race, gender: r() < 0.5 ? "m" : "w", cls, look: randomLook(race) };
  }
  function previewDesc() {
    const C = D.CLASSES[draft.cls];
    const tint = C.material === "platte" ? "#9aa4ad" : C.material === "leder" ? "#5a3d2a" : D.REALMS[draft.realm].color;
    // neue Figur (Bild zu 3D), sobald die Figurendatei des Reiches geladen ist
    return UI.withGen({
      kind: "hero",
      race: draft.race,
      cls: draft.cls,
      realm: draft.realm,
      gender: draft.gender,
      look: draft.look,
      gear: {
        waffe: { base: C.weapons[0], tint: "#6b4a2f", rarity: "selten", style: 0 },
        ruestung: { base: C.chest, tint, rarity: "gewoehnlich", style: 1 },
        stiefel: { base: "stiefel", tint: "#4a3a2a", rarity: "gewoehnlich", style: 0 },
        nebenhand: { base: C.offhand, rarity: "gewoehnlich", style: 0 },
        umhang: { base: "umhang", tint: D.REALMS[draft.realm].color, style: 0 },
      },
    });
  }
  // Hinweis, solange die Figur des gewaehlten Volkes noch laedt (bis dahin steht ein Platzhalter auf dem Sockel)
  const genLoad = {};
  function genHints() {
    const note = $("#create .gen-note");
    if (!note) return;
    const waiting = !!(view && previewDesc().pending);
    const st = genLoad[draft.realm];
    note.hidden = !waiting;
    note.textContent = st === "fehler" || st === "fehlt" ? "Die Figur konnte noch nicht geladen werden, gleich ein neuer Versuch …" : "Figur wird geladen …";
  }
  function loadGen() {
    const realm = draft.realm;
    if (!view || genLoad[realm] === "laedt" || genLoad[realm] === "bereit" || UI.GEN_REALMS.indexOf(realm) < 0) return;
    genLoad[realm] = "laedt";
    UI.loadGenFigures(realm).then((st) => {
      genLoad[realm] = st;
      if (view && !$("#create").hidden) updateView();
    });
  }
  function modsText(mods) {
    const parts = [];
    for (const a of D.ATTRS) if (mods[a]) parts.push((mods[a] > 0 ? "+" : "") + mods[a] + " " + D.ATTR_INFO[a].name);
    return parts.length ? "(" + parts.join(", ") + ")" : "";
  }
  // Aussehen: Haut, Haare und Gesicht gehoeren zum Meshy-Koerper; zu waehlen gibt es nur eine Gestalt, falls es fuer
  // Volk und Geschlecht mehrere Modelle gibt
  function renderForm() {
    const f = $("#create .cform");
    const R = D.RACES[draft.race];
    const C = D.CLASSES[draft.cls];
    const L = draft.look;
    const gest = UI.gestalten(draft.race, draft.gender);
    const nameNo = gest.length > 1 ? 5 : 4;
    f.innerHTML =
      '<div class="step"><span class="stepno">1</span><h3>Wähle dein Reich</h3></div><div class="realmcards small">' +
      realmKeys().map((r) => '<button type="button" class="realmcard r-' + r + (draft.realm === r ? " on" : "") + '" data-cact="realm" data-v="' + r + '">' + I.realm(r) + "<h3>" + esc(D.REALMS[r].name) + "</h3><i>„" + esc(D.REALMS[r].motto) + "“</i></button>").join("") + "</div>" +
      '<p class="desc">' + esc(D.REALMS[draft.realm].desc) + "</p>" +
      '<div class="step"><span class="stepno">2</span><h3>Klasse</h3></div><div class="choices cls-choices">' +
      classesOf(draft.realm).map((id) => '<button type="button" class="choice' + (draft.cls === id ? " on" : "") + '" data-cact="cls" data-v="' + id + '">' + I.classCrest(id) + "<br>" + D.CLASSES[id].name + "<small>" + D.CLASSES[id].archName + "</small></button>").join("") + "</div>" +
      '<p class="desc"><b>' + esc(C.archName) + ":</b> " + esc(C.desc) + "<br><b>" + esc(C.special.name) + ":</b> " + esc(C.special.desc) + "</p>" +
      '<div class="step"><span class="stepno">3</span><h3>Volk</h3></div><div class="choices" style="grid-template-columns:repeat(2,1fr)">' +
      racesOf(draft.realm).map((id) => '<button type="button" class="choice' + (draft.race === id ? " on" : "") + '" data-cact="race" data-v="' + id + '">' + D.RACES[id].name + "</button>").join("") + "</div>" +
      '<p class="desc">' + esc(R.desc) + " " + modsText(R.mods) + "</p>" +
      '<div class="choices" style="grid-template-columns:repeat(2,1fr);margin-top:8px"><button type="button" class="choice' + (draft.gender === "m" ? " on" : "") + '" data-cact="gender" data-v="m">Männlich</button><button type="button" class="choice' + (draft.gender === "w" ? " on" : "") + '" data-cact="gender" data-v="w">Weiblich</button></div>' +
      (gest.length > 1 ? '<div class="step"><span class="stepno">4</span><h3>Gestalt</h3></div>' + UI.gestaltHtml(L, gest.length, "data-cact", { race: draft.race, gender: draft.gender, cls: draft.cls, realm: draft.realm }) : "") +
      '<div class="step"><span class="stepno">' + nameNo + '</span><h3>Name</h3></div><input id="heroName" maxlength="16" autocomplete="off" placeholder="z. B. Tilda Sturmfang" value="' + esc(draft.name) + '">' +
      '<p class="delta-down" id="nameErr" hidden></p>' +
      '<div class="row" style="margin-top:18px"><button type="button" class="btn ghost" data-cact="random">Alles zufällig</button><button type="button" class="btn ghost" data-cact="import">Spielstand laden</button><span class="spacer"></span><button type="button" class="btn big" data-cact="start">Für ' + esc(D.REALMS[draft.realm].name) + "!</button></div>";
    const inp = f.querySelector("#heroName");
    inp.addEventListener("input", () => (draft.name = inp.value));
    $("#create").dataset.realm = draft.realm;
  }
  function updateView() {
    if (view) {
      view.set(previewDesc());
      loadGen();
    } else {
      const fb = $("#create .cview .hv-fallback");
      if (fb) fb.innerHTML = I.silhouette(previewDesc().gear.ruestung.tint, "hero");
    }
    genHints();
  }
  UI.showCreate = function (onDone) {
    const box = $("#create");
    draft = randomDraft("");
    box.innerHTML =
      '<div class="cview"><div class="ctitle"><h1>Helden von<br>Schwebfels</h1><p>' + esc(D.LORE) + '</p></div><p class="gen-note" hidden></p></div><div class="cform"></div>';
    box.hidden = false;
    const cv = box.querySelector(".cview");
    if (UI.use3d) {
      try {
        view = SB.R3D.createHeroView(cv, { distance: innerWidth <= 860 ? 8.6 : 10.5, lookY: innerWidth <= 860 ? 1.0 : 1.35 });
      } catch (e) {
        view = null;
      }
    }
    if (!view) cv.insertAdjacentHTML("beforeend", '<div class="hv-fallback" style="position:absolute;inset:120px 20% 20px"></div>');
    // Figuren zeigen, sobald sie bereit sind (die aus der Seite kommen vor der Zusatzdatei)
    UI.onGen = () => {
      if ($("#create").hidden) return;
      if (view) updateView();
    };
    renderForm();
    updateView();
    box.onclick = (ev) => {
      const b = ev.target.closest("[data-cact]");
      if (!b) return;
      SB.audio.unlock();
      const act = b.dataset.cact;
      const v = b.dataset.v;
      const keep = $("#heroName") ? $("#heroName").value : draft.name;
      if (act === "realm") {
        if (draft.realm !== v) {
          const archIdx = classesOf(draft.realm).indexOf(draft.cls);
          const raceIdx = racesOf(draft.realm).indexOf(draft.race);
          draft.realm = v;
          draft.cls = classesOf(v)[Math.max(0, archIdx)];
          draft.race = racesOf(v)[Math.max(0, raceIdx)];
          const R = D.RACES[draft.race];
          draft.look.skin = R.skins[0];
          draft.look.hair = R.hairs[0];
          SB.audio.play("horn");
        }
      } else if (act === "race") {
        draft.race = v;
        const R = D.RACES[v];
        draft.look.skin = R.skins[0];
        draft.look.hair = R.hairs[0];
      } else if (act === "cls") draft.cls = v;
      else if (act === "gender") draft.gender = v;
      else if (act === "lookn") draft.look[b.dataset.k] = +v;
      else if (act === "random") draft = randomDraft(keep);
      else if (act === "import") {
        UI.ACTIONS.importSave();
        return;
      } else if (act === "start") {
        const name = keep.trim().replace(/\s+/g, " ");
        const err = $("#nameErr");
        if (!/^[\p{L}\p{N}][\p{L}\p{N} '\-]{1,15}$/u.test(name)) {
          err.hidden = false;
          err.textContent = "Der Name braucht 2 bis 16 Zeichen: Buchstaben, Ziffern, Leerzeichen, Bindestrich oder Apostroph.";
          $("#heroName").focus();
          return;
        }
        SB.audio.play("levelup");
        const st = E.newHero({ name, race: draft.race, gender: draft.gender, cls: draft.cls, look: draft.look });
        UI.closeCreate();
        onDone(st);
        const C = D.CLASSES[st.cls];
        UI.dialog('<h2>' + esc(C.name) + " aus " + esc(D.REALMS[st.realm].name) + "</h2><p>" + esc(C.prolog) + '</p><p class="muted">' + esc(D.LORE) + '</p><div class="actions"><button class="btn" data-act="closeDialog">Auf nach Schwebfels</button></div>');
        return;
      }
      if (act !== "random") draft.name = keep;
      SB.audio.play("click");
      renderForm();
      updateView();
    };
  };
  UI.closeCreate = function () {
    const box = $("#create");
    UI.onGen = null;
    if (view) view.dispose();
    view = null;
    box.hidden = true;
    box.innerHTML = "";
    box.onclick = null;
  };
})();
