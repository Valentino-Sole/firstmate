/* Helden von Schwebfels - Kampfdarstellung und Charaktererstellung. */
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
  UI.runBattle = function (fight, opts) {
    return new Promise((resolve) => {
      const S = UI.S;
      const root = $("#battle");
      UI.hideTip();
      if (UI.hub) UI.hub.pause();
      const hero = fight.hero;
      const foe = fight.foe;
      const res = fight.result;
      const plate = (f, side) =>
        '<div class="plate ' + side + '"><span class="porthole">' + UI.portrait(UI.fighterDesc(f), 128, f.kind !== "monster") + '</span><div class="pmeta"><div class="pname">' + esc(f.name) + '</div><div class="plv">Stufe ' + f.level + (f.kind === "monster" ? " · " + D.MONSTER_TYPES[f.mainKey].profile : " · " + D.CLASSES[f.cls].name) + '</div><div class="hp"><i style="width:100%"></i><span class="num">' + U.fmt(f.maxHp) + "</span></div></div></div>";
      root.innerHTML =
        '<div class="bstage"></div><div class="plates">' + plate(hero, "left") + plate(foe, "right") + "</div>" +
        '<div class="bcontrols"><button class="btn ghost small" data-speed="1">1×</button><button class="btn ghost small" data-speed="2">2×</button><button class="btn ghost small" data-speed="4">4×</button><button class="btn small" data-skip="1">Überspringen</button></div>';
      root.hidden = false;
      document.body.classList.add("in-battle");
      $("#hint").hidden = true;
      const stage = root.querySelector(".bstage");
      const bars = root.querySelectorAll(".hp");
      const max = [hero.maxHp, foe.maxHp];
      const setHp = (side, hp) => {
        const bar = bars[side];
        const pct = Math.max(0, hp / max[side]) * 100;
        const i = bar.querySelector("i");
        i.style.width = pct.toFixed(1) + "%";
        i.classList.toggle("low", pct < 30);
        bar.querySelector("span").textContent = U.fmt(Math.max(0, hp));
      };
      let speed = S.settings.fastFights ? 2 : 1;
      let skip = false;
      const markSpeed = () => root.querySelectorAll("[data-speed]").forEach((b) => b.classList.toggle("on", +b.dataset.speed === speed));
      markSpeed();
      let battle = null;
      let log = null;
      if (UI.use3d) {
        try {
          battle = SB.R3D.createBattle(stage, {
            setting: opts.setting,
            tint: opts.tint,
            left: UI.fighterDesc(hero),
            right: UI.fighterDesc(foe),
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
      let figs = null;
      if (!battle) {
        stage.innerHTML = '<div class="fb2d"><div class="fig">' + UI.portrait(UI.fighterDesc(hero), 200) + '</div><div class="fig">' + UI.portrait(UI.fighterDesc(foe), 200) + '</div></div><div class="blog" style="top:auto;height:120px"></div>';
        log = stage.querySelector(".blog");
        figs = stage.querySelectorAll(".fig");
      }
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
      const names = [hero.name, foe.name];
      const hpNow = [hero.maxHp, foe.maxHp];
      const wait = (ms) => new Promise((r) => setTimeout(r, ms / speed));
      async function play2d(ev) {
        const a = ev.a;
        const d = 1 - a;
        if (ev.kind === "stun") {
          log.insertAdjacentHTML("beforeend", "<p>" + esc(names[a]) + " ist betäubt und setzt aus.</p>");
          await wait(500);
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
            txt = esc(names[a]) + (ev.spName ? " (" + esc(ev.spName) + ")" : "") + " trifft für <b>" + U.fmt(h.dmg) + "</b>" + (h.res === "crit" ? ", kritisch!" : "");
          }
          log.insertAdjacentHTML("beforeend", "<p>" + txt + "</p>");
          log.scrollTop = log.scrollHeight;
          await wait(420);
        }
      }
      (async () => {
        for (const ev of res.events) {
          if (skip) break;
          if (battle) await battle.play(ev);
          else await play2d(ev);
        }
        setHp(0, res.hp[0]);
        setHp(1, res.hp[1]);
        if (battle) await battle.finish(res.winner);
        else await wait(400);
        SB.audio.play(res.winner === 0 ? "victory" : "defeat");
        showResult();
      })();
      function showResult() {
        const r = opts.rewards || {};
        const win = res.winner === 0;
        const chips = [];
        if (r.xp) chips.push('<span class="chip">' + I.ui("xp") + " +" + U.fmt(r.xp) + " Erfahrung</span>");
        if (r.gold) chips.push('<span class="chip">' + UI.gold(r.gold) + "</span>");
        if (r.honor) chips.push('<span class="chip">' + I.ui("ehre") + " " + (r.honor > 0 ? "+" : "") + U.fmt(r.honor) + " Ehre</span>");
        if (r.perle) chips.push('<span class="chip">' + UI.perlen(r.perle) + "</span>");
        if (r.perlen) chips.push('<span class="chip">' + UI.perlen(r.perlen) + "</span>");
        if (r.itemSold) chips.push('<span class="chip">Rucksack voll: Fund für ' + UI.gold(r.itemSold) + " verkauft</span>");
        let itemHtml = "";
        if (r.item) itemHtml = '<div style="display:flex;justify-content:center"><div style="width:240px;text-align:left;padding:10px 12px;border-radius:14px;background:#0a141b;border:2px solid ' + D.RARITIES[r.item.rarity].color + '">' + UI.itemCard(r.item) + "</div></div>";
        const sub = win ? (opts.setting === "arena" ? "Das Publikum tobt!" : opts.setting === "dungeon" ? esc(opts.foeName) + " ist gefallen." : esc(opts.foeName) + " gibt sich geschlagen.") : opts.setting === "arena" ? "Das Publikum buht. Morgen ist ein neuer Tag." : "Diesmal war " + esc(opts.foeName) + " stärker. Bessere Ausrüstung und Attribute helfen.";
        const d = UI.dialog(
          '<div class="result ' + (win ? "win" : "lose") + '"><h2>' + (win ? "Sieg!" : "Niederlage") + '</h2><p class="muted">' + sub + '</p><div class="rewardlist">' + chips.join("") + "</div>" + itemHtml +
            '<div class="actions" style="justify-content:center"><button class="btn big" id="battleDone" data-autofocus>Weiter</button></div></div>'
        );
        d.parentNode.dataset.locked = "1";
        d.querySelector("#battleDone").onclick = () => {
          delete d.parentNode.dataset.locked;
          UI.closeDialog();
          if (battle) battle.dispose();
          root.hidden = true;
          document.body.classList.remove("in-battle");
          root.innerHTML = "";
          root.onclick = null;
          if (UI.hub) UI.hub.resume();
          resolve();
        };
      }
    });
  };

  /* ================= Charaktererstellung ================= */
  let view = null;
  let draft = null;
  function randomDraft(keepName) {
    const r = Math.random;
    const races = Object.keys(D.RACES);
    const race = races[Math.floor(r() * races.length)];
    const R = D.RACES[race];
    const cls = Object.keys(D.CLASSES)[Math.floor(r() * 3)];
    return {
      name: keepName || "",
      race,
      gender: r() < 0.5 ? "m" : "w",
      cls,
      look: { skin: R.skins[Math.floor(r() * R.skins.length)], hair: R.hairs[Math.floor(r() * R.hairs.length)], hairStyle: Math.floor(r() * 5), beard: r() < 0.5 ? 0 : Math.floor(r() * 4), eyes: "#1d1b26" },
    };
  }
  function previewDesc() {
    const C = D.CLASSES[draft.cls];
    return {
      kind: "hero",
      race: draft.race,
      cls: draft.cls,
      gender: draft.gender,
      look: draft.look,
      gear: {
        waffe: { base: C.weapons[0], tint: "#8a5a35", rarity: "gewoehnlich", style: 0 },
        ruestung: { base: C.chest, tint: C.material === "platte" ? "#9aa4ad" : C.material === "leder" ? "#8a5a35" : "#5b4fbf", rarity: "gewoehnlich", style: 0 },
        stiefel: { base: "stiefel", tint: "#5a4a3a", rarity: "gewoehnlich", style: 0 },
      },
    };
  }
  function renderForm() {
    const f = $("#create .cform");
    const R = D.RACES[draft.race];
    const C = D.CLASSES[draft.cls];
    const sw = (arr, key) => '<div class="swatches">' + arr.map((c) => '<button type="button" class="sw' + (draft.look[key] === c ? " on" : "") + '" style="background:' + c + '" data-cact="look" data-k="' + key + '" data-v="' + c + '" aria-label="Farbe ' + c + '"></button>').join("") + "</div>";
    const opt = (key, n, labels) => '<div class="choices">' + labels.map((l, i) => '<button type="button" class="choice' + (draft.look[key] === i ? " on" : "") + '" data-cact="lookn" data-k="' + key + '" data-v="' + i + '">' + l + "</button>").join("") + "</div>";
    f.innerHTML =
      '<label for="heroName"><h3 style="margin-top:0">Name deines Helden</h3></label><input id="heroName" maxlength="16" autocomplete="off" placeholder="z. B. Tilda Sturmfang" value="' + esc(draft.name) + '">' +
      '<p class="delta-down" id="nameErr" hidden></p>' +
      "<h3>Volk</h3><div class=\"choices\">" + Object.keys(D.RACES).map((id) => '<button type="button" class="choice' + (draft.race === id ? " on" : "") + '" data-cact="race" data-v="' + id + '">' + D.RACES[id].name + "</button>").join("") + "</div>" +
      '<p class="desc">' + esc(R.desc) + " " + modsText(R.mods) + "</p>" +
      "<h3>Klasse</h3><div class=\"choices cls-choices\">" + Object.keys(D.CLASSES).map((id) => '<button type="button" class="choice' + (draft.cls === id ? " on" : "") + '" data-cact="cls" data-v="' + id + '">' + I.classCrest(id) + "<br>" + D.CLASSES[id].name + "<small>" + D.ATTR_INFO[D.CLASSES[id].main].name + "</small></button>").join("") + "</div>" +
      '<p class="desc">' + esc(C.desc) + " Spezialangriff: " + esc(C.special.name) + ".</p>" +
      '<h3>Erscheinung</h3><div class="choices" style="grid-template-columns:repeat(2,1fr)"><button type="button" class="choice' + (draft.gender === "m" ? " on" : "") + '" data-cact="gender" data-v="m">Breitschultrig</button><button type="button" class="choice' + (draft.gender === "w" ? " on" : "") + '" data-cact="gender" data-v="w">Schmal</button></div>' +
      '<h3 style="font-size:16px">Haut</h3>' + sw(R.skins, "skin") +
      '<h3 style="font-size:16px">Haare</h3>' + sw(R.hairs, "hair") +
      opt("hairStyle", 5, ["Kurz", "Strubbelig", "Lang", "Zopf", "Glatze"]) +
      '<h3 style="font-size:16px">Bart</h3>' + opt("beard", 4, ["Keiner", "Kinnbart", "Vollbart", "Schnauzer"]) +
      '<div class="row" style="margin-top:18px"><button type="button" class="btn ghost" data-cact="random">Zufällig</button><button type="button" class="btn ghost" data-cact="import">Spielstand laden</button><span class="spacer"></span><button type="button" class="btn big" data-cact="start">In See stechen</button></div>';
    const inp = f.querySelector("#heroName");
    inp.addEventListener("input", () => (draft.name = inp.value));
  }
  function modsText(mods) {
    const parts = [];
    for (const a of D.ATTRS) if (mods[a]) parts.push((mods[a] > 0 ? "+" : "") + mods[a] + " " + D.ATTR_INFO[a].name);
    return parts.length ? "(" + parts.join(", ") + ")" : "";
  }
  function updateView() {
    if (view) view.set(previewDesc());
    else {
      const fb = $("#create .cview .hv-fallback");
      if (fb) fb.innerHTML = I.silhouette(previewDesc().gear.ruestung.tint, "hero");
    }
  }
  UI.showCreate = function (onDone) {
    const box = $("#create");
    draft = randomDraft("");
    box.innerHTML =
      '<div class="cview"><div class="ctitle"><h1>Helden von<br>Schwebfels</h1><p>Eine Stadt auf einer Wolkeninsel, drei Aufträge an der Wand und jede Menge Ärger darunter. Erschaffe deinen Helden.</p></div></div><div class="cform"></div>';
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
    renderForm();
    updateView();
    box.onclick = (ev) => {
      const b = ev.target.closest("[data-cact]");
      if (!b) return;
      SB.audio.unlock();
      const act = b.dataset.cact;
      const v = b.dataset.v;
      if (act === "race") {
        draft.race = v;
        const R = D.RACES[v];
        draft.look.skin = R.skins[0];
        draft.look.hair = R.hairs[0];
      } else if (act === "cls") draft.cls = v;
      else if (act === "gender") draft.gender = v;
      else if (act === "look") draft.look[b.dataset.k] = v;
      else if (act === "lookn") draft.look[b.dataset.k] = +v;
      else if (act === "random") draft = randomDraft(draft.name);
      else if (act === "import") {
        UI.ACTIONS.importSave();
        return;
      } else if (act === "start") {
        const name = draft.name.trim().replace(/\s+/g, " ");
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
        return;
      }
      SB.audio.play("click");
      const keep = $("#heroName") ? $("#heroName").value : draft.name;
      if (act !== "random") draft.name = keep;
      renderForm();
      updateView();
    };
  };
  UI.closeCreate = function () {
    const box = $("#create");
    if (view) view.dispose();
    view = null;
    box.hidden = true;
    box.innerHTML = "";
    box.onclick = null;
  };
})();
