/* Helden von Schwebfels - Panels der Orte und ihre Aktionen. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const D = SB.data;
  const E = SB.engine;
  const U = SB.util;
  const I = SB.icons;
  const UI = SB.ui;
  const A = UI.ACTIONS;
  const P = UI.PANELS;
  const esc = U.esc;
  const S = () => UI.S;

  const LINES = {
    hulda: ["Setz dich, Held. Die Aufträge hängen am Brett, der Met steht hinter mir.", "In der Krähe ist jedes Reich willkommen. Prügeleien bitte draußen, die Stühle sind neu.", "Manche Aufträge sind selten. Dann kommen die Biester gleich in Horden. Nimm einen zweiten Krug mit."],
    brumm: ["Hrmpf. Fass nichts an, was noch glüht.", "Gute Klinge, guter Preis. Billige Klinge, kurzes Leben.", "Ich schmiede seit dreihundert Jahren. Die ersten zweihundert waren Übung."],
    zinnober: ["Ah, ein Kunde! Oder ein Dieb? Bei dir bin ich mir noch nicht sicher.", "Alles hier ist magisch. Außer dem Staub. Wobei, der vielleicht auch.", "Dieser Ring gehörte einer Feenkönigin. Sagt zumindest der Ring."],
    krawall: ["Willkommen im Ring der Reiche! Hier kämpft Albion gegen Midgard gegen Hibernia, und alle gegen den Sand in den Stiefeln.", "Jeder Sieg bringt Ehre, dir und deinem Reich. Jede Niederlage bringt Geschichten.", "Ich suche dir Gegner, die zu dir passen. Einer leicht, zwei ebenbürtig, einer zum Zähneausbeißen."],
    funzel: ["Das Feuer muss brennen. Immer. Ich mach das seit vierzig Jahren und habe nie geblinzelt.", "Wache halten ist einfach: Du schaust in den Nebel, der Nebel schaut zurück.", "Zahle pro Schicht. Pünktlich. Meistens."],
    hufnagel: ["Pass auf, wo du hintrittst. Der Greif ist sauber, die Hirsche nicht.", "Mit einem Reittier bist du schneller am Auftrag und schneller wieder in der Taverne.", "Der Greif beißt nur Leute, die er nicht mag. Er mag niemanden."],
    mondhaendler: ["Willkommen, Nachtwandler. Was ich verkaufe, glänzt nur im Mondlicht. Am Tag bin ich nie hier gewesen.", "Die Nachtwesen kommen, wenn die anderen schlafen. Wer sie bannt, findet Beute, die kein Schmied kennt.", "Drei Jagden pro Nacht, mehr erlaubt der Mond nicht. Er ist da sehr eigen."],
    seherin: ["Die Steine erinnern sich an alles. Sie warten nur darauf, dass jemand zuhört.", "Jedes Reich hat seine Geschichte. Und jeder Held schreibt ein Stück davon.", "Unter den Splittern regt sich etwas. Die Chronik ist noch nicht zu Ende geschrieben."],
  };
  const line = (npc) => {
    const arr = LINES[npc];
    return arr[Math.floor((Date.now() / 60000) % arr.length)];
  };
  const say = (npc) => '<div class="say">' + esc(line(npc)) + "</div>";
  const chanceCls = (c) => (c >= 0.8 ? "good" : c >= 0.5 ? "ok" : "bad");
  const chanceTxt = (c) => '<span class="chance ' + chanceCls(c) + '">Siegchance ' + Math.round(c * 100) + " %</span>";
  const pips = (n) => '<span class="pips">' + [1, 2, 3].map((i) => '<i class="' + (i <= n ? "on" : "") + '"></i>').join("") + "</span>";
  const busyNote = () => {
    const b = E.busy(S());
    if (!b) return "";
    return '<div class="say">' + (b.what === "quest" ? "Du bist gerade auf einem Auftrag unterwegs." : "Du hältst gerade Wache am Turm.") + "</div>";
  };
  const estCache = new Map();
  function estimate(hero, foes, key, n) {
    const k = key + "|" + (n || 30) + "|" + JSON.stringify(hero.attrs) + hero.wMin + "|" + hero.wMax + "|" + hero.armor + "|" + hero.prof.block + "|" + hero.maxHp + "|" + JSON.stringify(hero.tal || {});
    if (estCache.has(k)) return estCache.get(k);
    const v = E.estimateWin(hero, foes, n || 30, key);
    estCache.set(k, v);
    if (estCache.size > 200) estCache.delete(estCache.keys().next().value);
    return v;
  }
  function done(res) {
    if (res && res.ok === false && res.msg) {
      UI.toast(res.msg, "bad");
      return false;
    }
    return res && res.ok !== false;
  }
  const realmChip = (realm) => '<span class="realmchip r-' + realm + '">' + I.realm(realm) + " " + esc(D.REALMS[realm].name) + "</span>";
  const guildTag = (g) => (g ? ' <span class="gtag">[' + esc(g.tag) + "]</span>" : "");

  /* ================= Taverne ================= */
  P.taverne = {
    render() {
      const s = S();
      // Monsterfiguren der angebotenen Auftraege im Hintergrund laden (Portraits erneuern sich danach)
      UI.loadMonsters(UI.offerArchs());
      const now = E.now();
      const en = E.energy(s, now);
      const max = E.energyMax(s);
      let h = say("hulda");
      h +=
        '<div class="row" style="margin-bottom:12px"><span class="gauge" style="padding-right:12px">' + UI.gauge(en, max) + "<span><small>Tatendrang</small>" + Math.floor(en) + " / " + max + "</span></span>" +
        (en < max ? '<span class="muted">+1 in <b class="num" data-until="' + (now + E.nextEnergyIn(s, now)) + '"></b></span>' : "") +
        '<span class="spacer"></span><button class="btn small" data-act="brew"' + (s.daily.brews >= E.C.BREW_MAX ? " disabled" : "") + ">Nebelmet +" + E.C.BREW_ENERGY + " · 1 " + I.ui("perle") + "</button></div>" +
        '<div class="muted" style="font-size:12.5px;margin:-6px 0 10px">Heute noch ' + (E.C.BREW_MAX - s.daily.brews) + " von " + E.C.BREW_MAX + " Krügen Nebelmet erhältlich." + (s.daily.brews >= E.C.BREW_MAX ? ' Neue Krüge um Mitternacht, in <b class="num" data-until="' + E.nextMidnight(now) + '"></b>.' : "") + "</div>";
      if (s.guard) return h + busyNote();
      const a = s.quest.active;
      if (a) {
        const o = a.offer;
        const mon = E.questMonster(o);
        const fin = a.end <= now;
        h +=
          '<div class="quest' + (o.rare || o.boss ? " rare" : "") + '"><div class="mon">' + UI.portrait(UI.monDesc(mon, o.rare || !!o.boss), 128) + "</div><div><h3>" + esc(o.title) + "</h3><p>" + esc(o.text) + "</p>" +
          '<div class="progress" data-from="' + a.start + '" data-to="' + a.end + '"><i style="width:' + (fin ? 100 : (((now - a.start) / (a.end - a.start)) * 100).toFixed(1)) + '%"></i></div>' +
          '<div class="foot">' +
          (fin
            ? '<button class="btn big done-pulse" data-act="questFight">' + (o.rare ? "Die Horde stellen" : "Kampf gegen " + esc(mon.name)) + "</button>"
            : '<span>Unterwegs nach ' + esc(o.place) + ': <b class="num" data-until="' + a.end + '"></b></span><span class="spacer"></span><button class="btn small" data-act="questSkip">Sofort ankommen · 1 ' + I.ui("perle") + "</button>") +
          "</div></div></div>";
        return h;
      }
      const hero = E.heroFighter(s, now);
      h += '<div class="quests">';
      s.quest.offers.forEach((o, i) => {
        const mon = E.questMonster(o);
        const c = estimate(hero, E.questFoes(o, hero), o.id);
        const dur = E.questDuration(s, o);
        const bossDef = o.boss && D.DUNGEONS.find((d) => d.id === o.boss);
        const waves = o.rare
          ? '<div class="waves"><span class="tag rare">Seltener Auftrag</span> ' + o.waves.length + " Gegner nacheinander, ohne Pause:" + '<div class="wavepics">' + o.waves.map((w, k) => '<span class="wp' + (w.boss ? " boss" : "") + '" title="' + esc(E.monById(w.monster).name) + '">' + UI.portrait(UI.monDesc(E.monById(w.monster), w.boss), 96) + "<i>" + (k + 1) + "</i></span>").join("") + "</div></div>"
          : bossDef
            ? '<div class="waves"><span class="tag rare">Verliesboss</span> ' + esc(bossDef.name) + ": kämpft mit den Kräften eines Bosses</div>"
            : "";
        h +=
          '<div class="quest' + (o.rare || o.boss ? " rare" : "") + '"><div class="mon" title="' + esc(mon.name) + '">' + UI.portrait(UI.monDesc(mon, o.rare || !!o.boss), 128) + "</div><div><h3>" + esc(o.title) + "</h3><p>" + esc(o.text) + "</p>" + waves +
          '<div class="meta">' + pips(o.diff) + "<span>" + E.DIFF[o.diff].name + "</span><span>" + I.ui("uhr") + " " + U.fmtTime(dur) + "</span><span>" + I.ui("tatendrang") + " " + o.energy + "</span>" + chanceTxt(c) + "</div>" +
          '<div class="rewards"><span>' + I.ui("xp") + ' <span class="num">' + U.fmt(o.xp) + " EP</span></span><span>" + UI.gold(o.gold) + "</span>" +
          (o.perle ? "<span>" + UI.perlen(o.perle) + "</span>" : "") +
          (o.item ? '<button type="button" class="mini-item r-' + o.item.rarity + '" data-item="offer:' + i + '" data-act="itemInfo" data-ref="offer:' + i + '" aria-label="' + esc(o.item.name) + '">' + I.item(o.item) + "</button>" : "") +
          '</div><div class="foot"><span class="muted">Ziel: ' + esc(o.place) + " · " + (o.rare ? "Anführer" : o.boss ? "Verliesboss" : "Gegner") + ": " + esc(mon.name) + " (Stufe " + o.mlevel + ')</span><span class="spacer"></span><button class="btn" data-act="questStart" data-i="' + i + '"' + (en < o.energy ? " disabled" : "") + ">Aufbrechen</button></div></div></div>";
      });
      h += "</div>";
      if (en < 6) h += '<div class="say" style="margin-top:12px">Dein Tatendrang ist erschöpft. Ein Krug Nebelmet hilft, oder du hältst so lange Wache am Turm.</div>';
      return h;
    },
  };
  A.brew = () => {
    if (!done(E.buyBrew(S()))) return;
    SB.audio.play("coin");
    UI.toast("Hulda schenkt dir einen Nebelmet ein. Skål!", "good", "taverne");
    UI.refresh();
  };
  A.questStart = (el) => {
    if (!done(E.startQuest(S(), +el.dataset.i))) return;
    SB.audio.play("quest");
    UI.refresh();
  };
  A.questSkip = () => {
    if (!done(E.skipQuest(S()))) return;
    UI.refresh();
  };
  A.questFight = async () => {
    const s = S();
    const fight = E.questFight(s);
    if (!fight) return;
    const offer = fight.offer;
    const rew = E.resolveQuest(s, fight);
    UI.saveNow();
    await UI.runBattle(fight, { setting: "quest", title: offer.title, rewards: rew, rare: offer.rare });
    UI.refresh();
  };

  /* ================= Laeden ================= */
  function shopPanel(shop, npc) {
    return {
      render() {
        const s = S();
        const sh = s.shops[shop];
        const now = E.now();
        let h = say(npc);
        h += '<div class="row"><span class="muted">Neue Ware in <b class="num" data-until="' + (sh.ts + E.C.SHOP_REFRESH) + '"></b></span><span class="spacer"></span><button class="btn small ghost" data-act="reroll" data-shop="' + shop + '">Sofort neue Ware · 1 ' + I.ui("perle") + "</button></div>";
        h += '<div class="section-title">Angebot</div><div class="grid6 shop">';
        sh.items.forEach((it, i) => {
          h += it ? UI.slotHtml(it, "shop:" + shop + ":" + i, { upgrade: true, price: '<span class="num">' + U.fmtShort(it.value) + "</span> " + I.ui("gold") }) : '<div class="slot empty"><span class="slot-name">verkauft</span></div>';
        });
        h += "</div>";
        if (shop === "arkanum") {
          h += '<div class="section-title">Tränke</div><div class="cards">';
          for (const p of D.POTIONS) {
            const c = E.potionCost(s, p);
            const active = s.buffs.find((b) => b.id === p.id && b.until > now);
            h +=
              '<div class="card"><div class="pic">' + I.potion(p.color) + "</div><div><h4>" + esc(p.name) + '</h4><div class="muted" style="font-size:13px">' + esc(p.desc) + "</div>" +
              (active ? '<div style="font-size:12.5px">Wirkt noch <b class="num" data-until="' + active.until + '"></b></div>' : "") +
              '</div><button class="btn small" data-act="potion" data-id="' + p.id + '">' + (c.gold ? UI.gold(c.gold) : UI.perlen(c.perlen)) + "</button></div>";
          }
          h += "</div>";
        }
        h += invSection("Rucksack: zum Verkaufen anklicken");
        return h;
      },
    };
  }
  function invSection(title) {
    const s = S();
    const size = E.invSize(s);
    let h = '<div class="section-title">' + I.ui("rucksack") + " " + (title || "Rucksack") + ' <span class="muted small">' + s.inv.length + " / " + size + "</span></div>";
    h += '<div class="grid6">';
    for (let i = 0; i < size; i++) h += s.inv[i] ? UI.slotHtml(s.inv[i], "inv:" + i, { upgrade: true }) : '<div class="slot empty"></div>';
    return h + "</div>";
  }
  P.schmiede = shopPanel("schmiede", "brumm");
  P.arkanum = shopPanel("arkanum", "zinnober");
  A.reroll = (el) => {
    if (!done(E.rerollShop(S(), el.dataset.shop))) return;
    UI.refresh();
  };
  A.buy = (el) => {
    const res = el.dataset.shop === "mond" ? E.buyMoonItem(S(), +el.dataset.i, UI.isNight()) : E.buyItem(S(), el.dataset.shop, +el.dataset.i);
    if (!done(res)) return;
    SB.audio.play(el.dataset.shop === "schmiede" ? "anvil" : "buy");
    UI.closeDialog();
    UI.toast("Gekauft: " + res.item.name, "good", "rucksack");
    UI.refresh();
  };
  A.sell = (el) => {
    const it = S().inv[+el.dataset.i];
    const res = E.sellItem(S(), +el.dataset.i);
    if (!done(res)) return;
    SB.audio.play("coin");
    UI.closeDialog();
    UI.toast("Verkauft: " + it.name + " für " + U.fmt(res.gold) + " Gold", "", "gold");
    UI.refresh();
  };
  A.equip = (el) => {
    if (!done(E.equip(S(), +el.dataset.i))) return;
    SB.audio.play("buy");
    UI.closeDialog();
    UI.refresh();
  };
  A.unequip = (el) => {
    if (!done(E.unequip(S(), el.dataset.slot))) return;
    UI.closeDialog();
    UI.refresh();
  };
  A.potion = (el) => {
    if (!done(E.buyPotion(S(), el.dataset.id))) return;
    SB.audio.play("buy");
    UI.toast("Gluck, gluck. Du fühlst dich stärker.", "good", "arkanum");
    UI.refresh();
  };

  /* ================= Charakter ================= */
  P.held = {
    head() {
      const s = S();
      return { title: s.name, role: D.REALMS[s.realm].name + " · " + D.RACES[s.race].name + " · " + D.CLASSES[s.cls].name + " · Stufe " + s.level, portrait: UI.heroPortrait(s) };
    },
    render() {
      const tab = UI.tabs.held || "ausruestung";
      const free = E.talentFree(S());
      let h = '<div class="tabs">' + [["ausruestung", "Ausrüstung"], ["talente", "Talente" + (free > 0 ? ' <span class="badge">' + free + "</span>" : "")], ["aussehen", "Aussehen"], ["geschichte", "Geschichte"], ["bestiarium", "Bestiarium"], ["abzeichen", "Abzeichen"]].map(([id, n]) => '<button class="tab' + (tab === id ? " on" : "") + '" data-act="tab" data-panel="held" data-tab="' + id + '">' + n + "</button>").join("") + "</div>";
      if (tab === "talente") return h + talents();
      if (tab === "bestiarium") return h + bestiary();
      if (tab === "abzeichen") return h + achievements();
      if (tab === "aussehen") return h + looks();
      if (tab === "geschichte") return h + history();
      return h + sheet();
    },
    after(el) {
      const slot = el.querySelector("#heroViewSlot");
      const v = slot && UI.attachHeroView(slot, UI.heroDesc(S()), "<b>" + esc(S().name) + "</b>");
      // vor dem Spiegel nah an Kopf und Oberkoerper, im Charakterbogen die ganze Figur
      if (v && v.focus) v.focus(UI.tabs.held === "aussehen" ? "nah" : "ganz");
    },
  };
  A.tab = (el) => {
    UI.tabs[el.dataset.panel] = el.dataset.tab;
    SB.audio.play("page");
    UI.renderPanel(true);
  };
  function sheet() {
    const s = S();
    const sum = E.heroSummary(s);
    const C = D.CLASSES[s.cls];
    const AR = D.ARCHETYPES[C.arch];
    const left = ["helm", "amulett", "ruestung", "umhang", "handschuhe"];
    const right = ["waffe", "nebenhand", "ring", "talisman", "stiefel"];
    const slotIcon = { helm: "held", amulett: "abzeichen", ruestung: "ruestung", umhang: "ruestung", handschuhe: "kraft", waffe: "schaden", nebenhand: "ruestung", ring: "perle", talisman: "glueck", stiefel: "geschick" };
    const col = (arr) => '<div class="col">' + arr.map((sl) => UI.slotHtml(s.equip[sl], "eq:" + sl, { emptyIcon: slotIcon[sl], label: D.SLOT_INFO[sl].name })).join("") + "</div>";
    let h = UI.xpBlock(s);
    h += '<div class="sheet">' + col(left) + '<div class="heroview" id="heroViewSlot"></div>' + col(right) + "</div>";
    h += '<div class="row helm-toggle"><span class="spacer"></span><button class="btn small ghost" data-act="toggleHelm" aria-pressed="' + !!s.look.hideHelm + '">' + (s.look.hideHelm ? "Helm einblenden" : "Helm ausblenden") + '</button><span class="spacer"></span></div>';
    h += '<div class="section-title">Attribute <span class="muted small">Gold: ' + UI.gold(s.gold) + "</span></div>";
    h += '<div class="row" style="margin-bottom:8px"><span class="muted">Kaufmenge</span>' + [1, 5, 10].map((q) => '<button class="tab' + (UI.qty === q ? " on" : "") + '" data-act="qty" data-q="' + q + '">×' + q + "</button>").join("") + "</div>";
    h += '<div class="attrs">';
    for (const a of D.ATTRS) {
      let cost = 0;
      for (let i = 0; i < UI.qty; i++) cost += E.attrCost(s.bought[a] + i);
      const fx = E.attrEffects(s, a, UI.qty);
      const info = fx.map((x) => '<div class="ainfo">' + esc(x.t) + (x.now ? ': <b class="num">' + esc(x.now) + "</b>" : "") + (x.up ? ' <span class="aup">(' + esc(x.up) + " für " + UI.qty + (UI.qty === 1 ? " Punkt" : " Punkte") + ")</span>" : "") + "</div>").join("");
      h +=
        '<div class="attr' + (a === C.main ? " main" : "") + '" title="' + esc(D.ATTR_INFO[a].desc) + '">' + I.ui(a) + "<div><div>" + D.ATTR_INFO[a].name + (a === C.main ? ' <span class="tag">Hauptwert</span>' : "") + ' <span class="cost">' + UI.gold(cost) + "</span></div>" + info + "</div>" +
        '<span class="val num">' + U.fmt(sum.attrs[a]) + '</span><button class="btn plus" data-act="attr" data-a="' + a + '"' + (s.gold < E.attrCost(s.bought[a]) ? " disabled" : "") + ' aria-label="' + D.ATTR_INFO[a].name + ' erhöhen">+</button></div>';
    }
    h += "</div>";
    const mount = D.MOUNTS.filter((m) => s.mounts.owned.indexOf(m.id) >= 0).sort((a, b) => b.cut - a.cut)[0];
    const special = [];
    if (AR.block) special.push(["ruestung", "Block", Math.round(sum.block * 100) + " %"]);
    if (AR.evade) special.push(["geschick", "Ausweichen", Math.round(sum.evade * 100) + " %"]);
    if (AR.unblockable) special.push(["verstand", "Zauber", "nicht auszuweichen"]);
    if (AR.firstStrike) special.push(["tatendrang", "Erstschlag", "immer"]);
    h +=
      '<div class="stats"><div><span>' + I.ui("konstitution") + ' Lebenspunkte</span><b class="num">' + U.fmt(sum.hp) + "</b></div>" +
      "<div><span>" + I.ui("schaden") + ' Schaden</span><b class="num">' + U.fmt(sum.dmgMin) + " bis " + U.fmt(sum.dmgMax) + "</b></div>" +
      "<div><span>" + I.ui("ruestung") + ' Rüstung</span><b class="num">' + U.fmt(sum.armor) + " (" + Math.round(sum.reduction * 100) + " %)</b></div>" +
      "<div><span>" + I.ui("glueck") + ' Kritisch</span><b class="num">' + Math.round(sum.crit * 100) + " % · ×" + String(Math.round((E.heroFighter(s).prof.critMult || 2) * 100) / 100).replace(".", ",") + "</b></div>" +
      special.map(([ic, n, v]) => "<div><span>" + I.ui(ic) + " " + n + '</span><b class="num">' + v + "</b></div>").join("") +
      "<div><span>" + I.ui("ehre") + ' Ehre</span><b class="num">' + U.fmt(s.honor) + "</b></div>" +
      "<div><span>" + I.ui("stall") + " Reittier</span><b>" + (mount ? esc(mount.name) : "keins") + "</b></div>" +
      "<div><span>" + I.ui("gilde") + " Gilde</span><b>" + (s.guild ? esc(s.guild.name) : "keine") + "</b></div></div>";
    const hf = E.heroFighter(s);
    h += '<div class="special"><b>' + esc(C.special.name) + "</b> (jede " + (hf.tal && hf.tal.spEvery ? "dritte" : "vierte") + " Aktion): " + esc(C.special.desc) + "</div>";
    const buffs = E.activeBuffs(s);
    if (buffs.length) h += '<div class="muted" style="font-size:13px;margin-top:6px">Aktive Tränke: ' + buffs.map((b) => esc(D.POTIONS.find((p) => p.id === b.id).name) + ' (<span class="num" data-until="' + b.until + '"></span>)').join(", ") + "</div>";
    h += invSection();
    return h;
  }
  /* Talentbaum: drei Zweige, Stufen werden mit Punkten im Zweig frei */
  function talentText(t, rank) {
    return Object.keys(t.eff)
      .filter((k) => k !== "firstStrike" || !t.eff.opener)
      .map((k) => {
        const per = t.eff[k];
        const val = k === "spEvery" || k === "assassinate" || k === "vanish" || k === "firstStrike" || k === "spHits" ? per : per * rank;
        const fn = D.TALENT_EFFECTS[k];
        return fn ? fn(val) : "";
      })
      .filter(Boolean)
      .join(", ");
  }
  function talents() {
    const s = S();
    const tree = E.talentTree(s.cls);
    const pts = E.talentPoints(s);
    const free = E.talentFree(s);
    const ranks = s.talents || {};
    let h =
      '<div class="row talhead"><span class="chip">' + I.ui("abzeichen") + " <b>" + free + "</b> von " + pts + " Talentpunkten frei</span>" +
      '<span class="muted small">Alle zwei Stufen gibt es einen Punkt. Talente wirken in jedem Kampf: Aufträge, Chronik, Arena, Dungeons und Nachtjagd.</span><span class="spacer"></span>' +
      '<button class="btn small ghost" data-act="resetTalents"' + (!E.talentSpent(s) || s.perlen < E.C.TALENT_RESET_PERLEN ? " disabled" : "") + ">Zurücksetzen · " + E.C.TALENT_RESET_PERLEN + " " + I.ui("perle") + "</button></div>";
    h += '<div class="taltree">';
    for (const b of tree.branches) {
      const spent = E.branchSpent(ranks, b.key);
      h += '<div class="talbranch b-' + b.key + '"><div class="tb-head"><b>' + esc(b.name) + '</b><span class="muted small">' + b.kind + " · " + spent + " Punkte</span></div>";
      for (let tier = 1; tier <= 4; tier++) {
        const need = D.TALENT_TIER_REQ[tier];
        const open = spent >= need;
        h += '<div class="tiers' + (open ? "" : " locked") + '">' + (tier > 1 ? '<div class="tierlabel">' + (open ? "Stufe " + tier : "ab " + need + " Punkten im Zweig") + "</div>" : "");
        for (const t of b.talents.filter((x) => x.tier === tier)) {
          const r = ranks[t.id] || 0;
          const can = E.talentCheck(s.cls, ranks, t.id, pts).ok;
          h +=
            '<button class="talent' + (t.tier === 4 ? " cap" : "") + (r > 0 ? " has" : "") + (r >= t.max ? " full" : "") + '" data-act="learnTalent" data-id="' + t.id + '"' + (can ? "" : " aria-disabled=\"true\"") + ">" +
            '<span class="tn">' + esc(t.name) + '</span><span class="tr">' + r + "/" + t.max + "</span>" +
            '<span class="td">' + esc(talentText(t, Math.max(1, r))) + (r > 0 && r < t.max ? '<br><i>Nächster Rang: ' + esc(talentText(t, r + 1)) + "</i>" : "") + "</span>" +
            (t.note ? '<span class="tnote">' + esc(t.note) + "</span>" : "") +
            "</button>";
        }
        h += "</div>";
      }
      h += "</div>";
    }
    h += "</div>";
    return h;
  }
  A.learnTalent = (el) => {
    const res = E.learnTalent(S(), el.dataset.id);
    if (!done(res)) return;
    SB.audio.play(res.talent.tier === 4 ? "levelup" : "chime");
    UI.saveNow();
    UI.refresh();
  };
  A.resetTalents = () => {
    UI.dialog(
      "<h3>Talente zurücksetzen?</h3><p>Alle Punkte kommen zurück und du kannst sie neu verteilen. Das kostet " + E.C.TALENT_RESET_PERLEN + " Wolkenperlen, du hast " + S().perlen + ".</p>" +
        '<div class="actions"><button class="btn ghost" data-act="closeDialog">Abbrechen</button><button class="btn" data-act="resetTalentsYes">Zurücksetzen</button></div>'
    );
  };
  A.resetTalentsYes = () => {
    if (!done(E.resetTalents(S()))) return;
    UI.closeDialog();
    SB.audio.play("well");
    UI.toast("Deine Talente sind zurückgesetzt. Verteile die Punkte neu.", "good", "abzeichen");
    UI.saveNow();
    UI.refresh();
  };
  A.qty = (el) => {
    UI.qty = +el.dataset.q;
    UI.renderPanel();
  };
  A.attr = (el) => {
    const res = E.buyAttr(S(), el.dataset.a, UI.qty);
    if (!done(res)) return;
    SB.audio.play("coin");
    UI.refresh();
  };
  // Spiegel: Haut, Haare und Gesicht gehoeren zum Meshy-Koerper; gibt es fuer Volk und Geschlecht mehrere Modelle, waehlt
  // man hier jederzeit kostenlos die Gestalt
  function looks() {
    const s = S();
    const L = s.look;
    let h = '<div class="mirror"><div class="heroview small" id="heroViewSlot"></div><div class="mirror-form">';
    const gest = UI.gestalten(s.race, s.gender);
    if (gest.length > 1) {
      h += '<p class="muted small">Vor dem Spiegel im Heim kannst du deine Gestalt jederzeit kostenlos wechseln.</p>';
      h += UI.gestaltHtml(L, gest.length, "data-act", { race: s.race, gender: s.gender, cls: s.cls, realm: s.realm });
    } else h += '<p class="desc">Dein Held ist eine fertig modellierte Figur aus deinen Konzeptbildern: Haut, Haare und Gesicht gehören zu ihr.</p>';
    h += "</div></div>";
    return h;
  }
  // Helm nur optisch aus- oder einblenden; Werte und Ausruestung bleiben
  A.toggleHelm = () => {
    E.setLook(S(), { hideHelm: !S().look.hideHelm });
    SB.audio.play("click");
    UI.save();
    UI.refresh();
  };
  A.lookn = (el) => {
    E.setLook(S(), { [el.dataset.k]: el.dataset.str ? el.dataset.v : +el.dataset.v });
    SB.audio.play("click");
    UI.refresh();
  };
  function history() {
    const s = S();
    const C = D.CLASSES[s.cls];
    const RM = D.REALMS[s.realm];
    let h = '<div class="lore"><h3>Die Welt</h3><p>' + esc(D.LORE) + "</p></div>";
    h += '<div class="lore realm-' + s.realm + '"><h3>' + I.realm(s.realm) + " " + esc(RM.name) + ' <small>„' + esc(RM.motto) + "“</small></h3><p>" + esc(RM.desc) + "</p></div>";
    h += '<div class="lore"><h3>' + esc(C.name) + '</h3><p class="muted">' + esc(C.desc) + "</p><p>" + esc(C.prolog) + '</p><button class="btn small" data-act="open" data-id="steinkreis">Zur Chronik im Steinkreis</button></div>';
    return h;
  }
  function bestiary() {
    const s = S();
    const all = D.MONSTERS.map((m) => ({ id: m.id, name: m.name, desc: UI.monDesc(m) }));
    D.DUNGEONS.forEach((d) => d.bosses.forEach((b, i) => all.push({ id: d.id + "-" + i, name: b.name, desc: UI.monDesc(b, true, b.final) })));
    const found = all.filter((m) => s.bestiary[m.id]).length;
    // Meshy-Figuren der entdeckten Wesen nachladen (die Portraits entstehen danach neu); unentdeckte bleiben Umrisse
    UI.loadMonsters([...new Set(all.filter((m) => s.bestiary[m.id]).map((m) => m.desc.arch))]);
    let h = '<div class="muted" style="margin-bottom:10px">' + found + " von " + all.length + " Wesen entdeckt. Jedes entdeckte Wesen bringt dir dauerhaft +0,5 % Erfahrung und Gold aus Aufträgen (derzeit +" + (found * 0.5).toFixed(1).replace(".", ",") + " %).</div>";
    h += '<div class="bestiary">';
    for (const m of all) {
      const n = s.bestiary[m.id] || 0;
      h += '<div class="beast' + (n ? "" : " unknown") + '"><div class="pic">' + UI.portrait(m.desc, 112) + "</div>" + (n ? esc(m.name) + '<div class="muted">' + n + "× besiegt</div>" : "???") + "</div>";
    }
    return h + "</div>";
  }
  function achievements() {
    const s = S();
    let h = "";
    for (const a of D.ACHIEVEMENTS) {
      const got = s.ach[a.id];
      const pr = got ? null : E.achProgress(s, a.id);
      const bar = pr ? '<div class="ach-prog"><i style="width:' + Math.round((pr[0] / pr[1]) * 100) + '%"></i></div><div class="muted num" style="font-size:12px">' + U.fmt(pr[0]) + " von " + U.fmt(pr[1]) + "</div>" : "";
      h += '<div class="ach' + (got ? "" : " locked") + (a.hard ? " hard" : "") + '">' + I.ui("abzeichen") + "<div><b>" + esc(a.name) + (a.hard ? ' <span class="tag">schwer</span>' : "") + '</b><div class="muted" style="font-size:13px">' + esc(a.desc) + "</div>" + bar + "</div><span>" + (got ? "✓ " : "") + "+" + a.perlen + " " + I.ui("perle") + "</span></div>";
    }
    return h;
  }

  /* ================= Chronik im Steinkreis ================= */
  P.steinkreis = {
    render() {
      const s = S();
      const now = E.now();
      const C = D.CLASSES[s.cls];
      const RM = D.REALMS[s.realm];
      let h = say("seherin");
      h += '<div class="lore realm-' + s.realm + '"><h3>' + I.realm(s.realm) + " Chronik von " + esc(RM.name) + '</h3><p class="muted small">' + esc(C.prolog) + "</p></div>";
      const busy = E.busy(s, now);
      if (busy) h += busyNote();
      else if (s.story.next > now) h += '<div class="say">Du musst dich nach deiner Niederlage erst sammeln: <b class="num" data-until="' + s.story.next + '"></b></div>';
      const hero = E.heroFighter(s, now);
      h += '<div class="chapters">';
      const archs = [];
      for (const ch of E.storyChapters(s)) {
        const foes = ch.foes.map((f) => (f.mon ? Object.assign({}, E.monById(f.mon), { boss: f.boss, final: f.final }) : f));
        if (ch.done || ch.available) for (const f of foes) archs.push(f.arch);
        let status = "";
        if (ch.done) status = '<span class="tag">Abgeschlossen</span>';
        else if (ch.available) {
          const c = estimate(hero, E.storyFoes(s, ch, hero), "story" + ch.key);
          status = chanceTxt(c) + '<span class="spacer"></span><button class="btn" data-act="storyFight" data-k="' + ch.key + '"' + (busy || s.story.next > now ? " disabled" : "") + ">" + (foes.length > 1 ? "Kapitel bestreiten (" + foes.length + " Gegner)" : "Kapitel bestreiten") + "</button>";
        } else status = '<span class="muted">' + (s.level < ch.lv ? "Ab Stufe " + ch.lv : "Erst das vorige Kapitel abschließen") + "</span>";
        h +=
          '<div class="chapter' + (ch.done ? " done" : ch.available ? " open" : " locked") + '"><div class="ch-head"><span class="ch-kind">' + (ch.kind === "realm" ? "Chronik von " + esc(RM.name) : "Pfad: " + esc(C.name)) + " · Stufe " + ch.lv + "</span><h3>" + esc(ch.t) + "</h3></div>" +
          "<p>" + esc(ch.x) + "</p>" +
          '<div class="wavepics">' + foes.map((f, k) => '<span class="wp' + (f.boss ? " boss" : "") + '" title="' + esc(f.name) + '">' + (ch.done || ch.available ? UI.portrait(UI.monDesc(f, f.boss, f.final), 96) : I.ui("schaedel")) + "<i>" + (k + 1) + "</i></span>").join("") + '<span class="foe-names">' + foes.map((f) => esc(f.name)).join(", ") + "</span></div>" +
          '<div class="foot">' + status + "</div></div>";
      }
      h += "</div>";
      // Figuren der sichtbaren Gegner nachladen (die Bilder erneuern sich danach)
      UI.loadMonsters(archs);
      return h;
    },
  };
  A.storyFight = async (el) => {
    const s = S();
    const res = E.storyFight(s, el.dataset.k);
    if (!done(res)) return;
    const rew = E.resolveStory(s, res.fight);
    UI.saveNow();
    await UI.runBattle(res.fight, { setting: "story", title: res.fight.chapter.t, rewards: rew });
    UI.refresh();
  };

  /* ================= Arena: Ring der Reiche ================= */
  P.arena = {
    render() {
      const s = S();
      const now = E.now();
      const remote = SB.remoteHeroes || null;
      const all = E.allHeroes(s, now, remote);
      const me = all.find((h) => h.kind === "me");
      const mine = E.realmRanked(all, s.realm);
      const myR = mine.find((h) => h.kind === "me");
      const standings = E.realmStandings(s, now, remote);
      let h = say("krawall");
      h += '<div class="row" style="margin-bottom:10px"><span class="chip">' + I.ui("ehre") + " " + U.fmt(s.honor) + ' Ehre</span><span class="chip">Global Platz ' + me.rank + "</span>" + '<span class="chip">' + I.realm(s.realm) + " Platz " + myR.realmRank + " in " + esc(D.REALMS[s.realm].name) + '</span><span class="chip">' + s.arena.wins + " Siege</span></div>";
      h += '<div class="realmbar">' + standings.map((r) => '<div class="rb r-' + r.id + '" style="flex:' + Math.max(1, r.honor) + '"><span>' + I.realm(r.id) + " " + esc(D.REALMS[r.id].name) + " · " + U.fmtShort(r.honor) + "</span></div>").join("") + "</div>";
      if (remote && remote.length) h += '<div class="muted small" style="margin-bottom:8px">' + remote.length + " echte Mitspieler sind in den Ranglisten. Du erkennst sie am Zeichen „Spieler“.</div>";
      const busy = E.busy(s, now);
      if (busy) h += busyNote();
      else if (s.arena.next > now) h += '<div class="say">Nächster Kampf in <b class="num" data-until="' + s.arena.next + '"></b>. <button class="btn small" data-act="arenaSkip">Sofort · 1 ' + I.ui("perle") + "</button></div>";
      const rivals = E.arenaRivals(s, now, remote);
      // Heldenkoerper der fremden Reiche nachladen (die Bilder erneuern sich danach einmal)
      for (const rl of new Set(rivals.map((r) => r.realm).filter(Boolean))) UI.loadGenFigures(rl);
      const hero = E.heroFighter(s, now);
      const rc = E.arenaRerollCost(s);
      h += '<div class="section-title">Herausforderer aus den anderen Reichen, passend zu deiner Stärke</div>';
      h += '<div class="row" style="margin:-2px 0 10px"><span class="muted small">Siegchance aus 400 Probekämpfen. Schwere Gegner bringen mehr Ehre.</span><span class="spacer"></span><button class="btn ghost small" data-act="arenaReroll">Andere Gegner · ' + (rc ? U.fmt(rc) + " " + I.ui("gold") : "kostenlos") + "</button></div>";
      h += '<div class="cards">';
      rivals.forEach((r) => {
        const f = E.rivalFighter(r);
        // dieselbe Rechnung wie E.arenaChance (gleiche Probekaempfe), damit Anzeige, Einstufung und Ehre zusammenpassen
        const c = estimate(hero, [f], "arena" + r.id + r.level, E.ARENA_N);
        const t = E.arenaTier(c);
        const tier = [t.key, t.label];
        const hon = E.arenaHonor(c);
        const where = r.kind === "wander" ? "Wanderkämpfer" : "Platz " + r.rank;
        h +=
          '<div class="card"><div class="pic">' + UI.portrait(UI.fighterDesc(f), 128, true) + "</div><div><h4>" + esc(r.name) + guildTag(r.guild) + (r.kind === "real" ? ' <span class="tag">Spieler</span>' : "") + ' <span class="tier t-' + tier[0] + '">' + tier[1] + "</span></h4>" +
          '<div class="muted small">' + realmChip(r.realm) + " " + I.classCrest(r.cls) + " " + D.CLASSES[r.cls].name + " · Stufe " + r.level + " · " + where + " · " + U.fmt(r.honor) + " Ehre</div>" + chanceTxt(c) + ' <span class="muted small">Sieg +' + hon.win + " Ehre, Niederlage kostet " + hon.loss + "</span></div>" +
          '<button class="btn" data-act="arenaFight" data-id="' + esc(r.id) + '"' + (busy || s.arena.next > now ? " disabled" : "") + ">Herausfordern</button></div>";
      });
      h += '</div><div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn ghost small" data-act="open" data-id="ruhmeshalle">Alle Ranglisten</button></div>';
      return h;
    },
  };
  A.arenaReroll = () => {
    if (!done(E.arenaReroll(S()))) return;
    UI.saveNow();
    UI.refresh();
  };
  A.arenaSkip = () => {
    if (!done(E.skipArena(S()))) return;
    UI.refresh();
  };
  A.arenaFight = async (el) => {
    const s = S();
    const now = E.now();
    const opp = E.arenaRivals(s, now, SB.remoteHeroes || null).find((h) => h.id === el.dataset.id);
    if (!opp) {
      UI.toast("Dieser Herausforderer ist weitergezogen.", "", "arena");
      UI.refresh();
      return;
    }
    const res = E.arenaFight(s, opp, now);
    if (!done(res)) return;
    const rew = E.resolveArena(s, res.fight, now);
    UI.saveNow();
    SB.audio.play("horn");
    await UI.runBattle(res.fight, { setting: "arena", title: "Ring der Reiche", rewards: rew });
    UI.refresh();
  };

  /* ================= Mondtor: nur bei Nacht ================= */
  P.mondtor = {
    render() {
      const s = S();
      const now = E.now();
      const mode = s.settings.dayCycle || "zyklus";
      const night = UI.isNight();
      let h = say("mondhaendler");
      if (!night) {
        const wait = E.nightChangeIn(mode, now);
        h += '<div class="wellbox"><div class="wl-title">' + I.ui("mond") + " Das Mondtor ist geschlossen</div>";
        if (wait === Infinity) h += '<div class="muted">In den Einstellungen ist „immer Tag“ gewählt. Stelle den Tag-Nacht-Wechsel auf „Zyklus“ oder „echte Uhrzeit“, damit die Nacht kommen kann.</div><button class="btn small ghost" data-act="open" data-id="einstellungen">Zu den Einstellungen</button>';
        else h += '<div class="muted">Es öffnet sich, sobald es Nacht wird. Noch:</div><div class="wl-big num" data-until="' + (now + wait) + '"></div>';
        h += "</div>";
        h += '<div class="section-title">Was dich nachts erwartet</div><ul class="muted" style="margin:0;padding-left:20px"><li>Nachtjagd: zwei Nachtwesen deiner Heimatinsel nacheinander, ' + E.C.NIGHT_HUNTS + " Jagden pro Tag, kostet keinen Tatendrang.</li><li>Sichere Beute: immer mindestens ein seltener Gegenstand.</li><li>Selene Silberblick verkauft drei besondere Stücke, eines davon episch.</li></ul>";
        return h;
      }
      const tab = UI.tabs.mondtor || "jagd";
      h += '<div class="tabs">' + [["jagd", "Nachtjagd"], ["laden", "Mondhändlerin"]].map(([id, n]) => '<button class="tab' + (tab === id ? " on" : "") + '" data-act="tab" data-panel="mondtor" data-tab="' + id + '">' + n + "</button>").join("") + "</div>";
      const wait = E.nightChangeIn(mode, now);
      if (wait !== Infinity) h += '<div class="muted small" style="margin-bottom:8px">' + I.ui("mond") + ' Das Tor bleibt noch <b class="num" data-until="' + (now + wait) + '"></b> offen.</div>';
      if (tab === "laden") {
        const items = E.moonShop(s, now);
        h += '<div class="section-title">Ware im Mondlicht</div><div class="grid6 shop">';
        items.forEach((it, i) => {
          h += it ? UI.slotHtml(it, "shop:mond:" + i, { upgrade: true, price: '<span class="num">' + U.fmtShort(it.value) + "</span> " + I.ui("gold") }) : '<div class="slot empty"><span class="slot-name">verkauft</span></div>';
        });
        h += '</div><div class="muted small" style="margin-top:8px">Neue Ware gibt es jeden Tag. Selene verkauft nur, solange es Nacht ist.</div>';
        return h;
      }
      const left = E.nightHuntsLeft(s);
      const busy = E.busy(s, now);
      const hero = E.heroFighter(s, now);
      const foes = E.nightHuntPreview(s, now);
      UI.loadMonsters(foes.map((f) => f.arch));
      const c = estimate(hero, foes, "nacht" + s.daily.day + s.daily.nightHunts);
      h +=
        '<div class="quest rare"><div class="mon">' + UI.portrait(UI.monDesc(foes[1], true), 128) + "</div><div><h3>Die Nachtjagd</h3><p>Wenn der Mond über " + esc(D.REALMS[s.realm].isle) + " steht, kriechen Wesen aus dem Nebel, die das Tageslicht meiden. Zuerst " + esc(foes[0].name) + ", danach " + esc(foes[1].name) + ". Du kämpfst gegen beide nacheinander.</p>" +
        '<div class="wavepics">' + foes.map((f, k) => '<span class="wp' + (k ? " boss" : "") + '" title="' + esc(f.name) + '">' + UI.portrait(UI.monDesc(f, !!k), 96) + "<i>" + (k + 1) + "</i></span>").join("") + "</div>" +
        '<div class="foot">' + chanceTxt(c) + '<span class="muted small">Noch ' + left + " von " + E.C.NIGHT_HUNTS + ' Jagden heute</span><span class="spacer"></span>' +
        (busy ? '<span class="muted">Du bist gerade beschäftigt.</span>' : '<button class="btn" data-act="nightHunt"' + (left <= 0 ? " disabled" : "") + ">Zur Jagd</button>") +
        "</div></div></div>";
      h += '<div class="muted small">Belohnung bei Sieg: viel Erfahrung und Gold, ein Gegenstand mindestens „selten“, manchmal eine Wolkenperle.</div>';
      return h;
    },
  };
  A.nightHunt = async () => {
    const s = S();
    const res = E.nightHunt(s, UI.isNight());
    if (!done(res)) return;
    const rew = E.resolveNightHunt(s, res.fight);
    UI.saveNow();
    SB.audio.play("horn");
    await UI.runBattle(res.fight, { setting: "story", dayTime: 0.02, title: "Nachtjagd", rewards: rew });
    UI.refresh();
  };

  /* ================= Wachturm ================= */
  UI.shifts = 4;
  P.leuchtturm = {
    render() {
      const s = S();
      const now = E.now();
      let h = say("funzel");
      if (s.guard) {
        const g = s.guard;
        const fin = g.end <= now;
        h +=
          '<div class="card" style="grid-template-columns:72px 1fr"><div class="pic">' + I.ui("leuchtturm") + "</div><div><h4>" + g.shifts + " Schichten Wache</h4>" +
          '<div class="progress" data-from="' + g.start + '" data-to="' + g.end + '"><i style="width:' + (fin ? 100 : (((now - g.start) / (g.end - g.start)) * 100).toFixed(1)) + '%"></i></div>' +
          '<div class="row" style="margin-top:8px">Lohn: ' + UI.gold(g.pay) + '<span class="spacer"></span>' +
          (fin ? '<button class="btn" data-act="guardCollect">Lohn abholen</button>' : '<span>noch <b class="num" data-until="' + g.end + '"></b></span><button class="btn small ghost" data-act="guardCancel">Abbrechen</button>') +
          "</div></div></div>";
        return h;
      }
      if (s.quest.active) return h + busyNote();
      const pay = E.shiftPay(s);
      h +=
        '<div class="section-title">Wache übernehmen</div><p class="muted">Eine Schicht dauert ' + E.C.SHIFT_MS / 60000 + " Minuten und bringt " + UI.gold(pay) + ". Während der Wache kannst du keine Aufträge annehmen und nicht kämpfen.</p>" +
        '<label for="shiftRange" class="row"><b>' + UI.shifts + ' Schichten</b><span class="muted">(' + (UI.shifts * E.C.SHIFT_MS) / 60000 + ' Minuten)</span><span class="spacer"></span>Lohn: ' + UI.gold(pay * UI.shifts) + "</label>" +
        '<input type="range" id="shiftRange" min="1" max="' + E.C.SHIFT_MAX + '" value="' + UI.shifts + '">' +
        '<div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn big" data-act="guardStart">Wache antreten</button></div>';
      return h;
    },
    after(el) {
      const r = el.querySelector("#shiftRange");
      if (r)
        r.addEventListener("input", () => {
          UI.shifts = +r.value;
          UI.renderPanel();
          const nr = document.querySelector("#shiftRange");
          if (nr) nr.focus();
        });
    },
  };
  A.guardStart = () => {
    if (!done(E.startGuard(S(), UI.shifts))) return;
    UI.toast("Funzel drückt dir eine Fackel in die Hand.", "", "leuchtturm");
    UI.refresh();
  };
  A.guardCancel = (el) => {
    if (!el.dataset.sure) {
      UI.dialog('<h2>Wache abbrechen?</h2><p>Du bekommst für angefangene Schichten keinen Lohn.</p><div class="actions"><button class="btn ghost" data-act="closeDialog">Weiter wachen</button><button class="btn danger" data-act="guardCancel" data-sure="1">Abbrechen</button></div>');
      return;
    }
    E.cancelGuard(S());
    UI.closeDialog();
    UI.refresh();
  };
  A.guardCollect = () => {
    const res = E.collectGuard(S());
    if (!res.ok) return;
    SB.audio.play("coin");
    UI.toast("Funzel zahlt dir " + U.fmt(res.gold) + " Gold aus.", "good", "gold");
    UI.refresh();
  };

  /* ================= Dungeons ================= */
  P.tiefen = {
    title: "Das Tor zur Tiefe",
    role: "Bosse, Beute und schlechte Luft",
    portrait: () => '<span class="iconport">' + I.ui("tiefen") + "</span>",
    render() {
      const s = S();
      const now = E.now();
      let h = '<div class="say">Unter den Splittern liegen Orte, die niemand freiwillig betritt. Jeder Boss lässt beim Sieg garantiert seltene Beute fallen.</div>';
      const busy = E.busy(s, now);
      if (busy) h += busyNote();
      else if (s.dungeons.next > now) h += '<div class="say">Du brauchst noch <b class="num" data-until="' + s.dungeons.next + '"></b> Erholung. <button class="btn small" data-act="dungeonSkip">Sofort · 1 ' + I.ui("perle") + "</button></div>";
      const hero = E.heroFighter(s, now);
      h += '<div class="cards">';
      D.DUNGEONS.forEach((dg, d) => {
        const st = E.dungeonState(s, d);
        let pic;
        let info;
        let btn = "";
        if (!st.unlocked) {
          pic = I.ui("tiefen");
          info = '<div class="muted small">Öffnet sich ab Stufe ' + dg.unlock + (d > 0 ? " und nach dem ersten Boss des vorigen Dungeons" : "") + ".</div>";
        } else if (st.done) {
          UI.loadMonsters([dg.bosses[7].arch]);
          pic = UI.portrait(UI.monDesc(dg.bosses[7], true, true), 128);
          info = '<div class="small delta-up">Gesäubert! Alle acht Bosse besiegt.</div>';
        } else {
          const b = E.bossFor(d, st.cleared);
          const foe = E.monsterFighter(b.mon, b.L, b.power, { boss: true, final: b.final });
          const c = estimate(hero, [foe], b.mon.id);
          UI.loadMonsters([b.mon.arch]);
          pic = UI.portrait(UI.monDesc(b.mon, true, b.final), 128);
          info = '<div class="small">Boss ' + (st.cleared + 1) + "/8: <b>" + esc(b.mon.name) + "</b> · Stufe " + b.L + "</div>" + chanceTxt(c);
          btn = '<button class="btn" data-act="dungeonFight" data-d="' + d + '"' + (busy || s.dungeons.next > now ? " disabled" : "") + ">Angreifen</button>";
        }
        h +=
          '<div class="card' + (st.unlocked ? "" : " locked") + '" style="--theme:' + dg.theme + '"><div class="pic dpic">' + pic + "</div><div><h4>" + esc(dg.name) + '</h4><div class="muted small">' + esc(dg.desc) + "</div>" +
          '<div class="pips" style="margin:5px 0">' + dg.bosses.map((_, i) => '<i class="' + (i < st.cleared ? "on" : "") + '"></i>').join("") + "</div>" + info + "</div>" + btn + "</div>";
      });
      return h + "</div>";
    },
  };
  A.dungeonSkip = () => {
    if (!done(E.skipDungeon(S()))) return;
    UI.refresh();
  };
  A.dungeonFight = async (el) => {
    const s = S();
    const d = +el.dataset.d;
    const res = E.dungeonFight(s, d);
    if (!done(res)) return;
    const rew = E.resolveDungeon(s, res.fight);
    UI.saveNow();
    SB.audio.play("roar");
    await UI.runBattle(res.fight, { setting: "dungeon", dungeon: D.DUNGEONS[d].id, tint: D.DUNGEONS[d].theme, title: D.DUNGEONS[d].name, rewards: rew });
    UI.refresh();
  };

  /* ================= Stall ================= */
  P.stall = {
    render() {
      const s = S();
      let h = say("hufnagel");
      h += '<div class="muted" style="margin-bottom:10px">Reittiere verkürzen die Reisezeit zu jedem Auftrag dauerhaft. Es zählt immer dein schnellstes Tier.</div><div class="cards">';
      for (const m of D.MOUNTS) {
        const owned = s.mounts.owned.indexOf(m.id) >= 0;
        const cost = m.cost.gold ? UI.gold(m.cost.gold) : UI.perlen(m.cost.perlen);
        h +=
          '<div class="card"><div class="pic"><svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="mt' + m.id + '" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".4" stop-color="' + m.color + '"/><stop offset="1" stop-color="#14101a"/></radialGradient></defs><circle cx="32" cy="32" r="27" fill="url(#mt' + m.id + ')" stroke="#c9a441" stroke-width="2.4"/><text x="32" y="40" text-anchor="middle" font-size="20" font-weight="800" fill="#f4ecd8" stroke="#14101a" stroke-width=".8" font-family="sans-serif">-' + Math.round(m.cut * 100) + "%</text></svg></div>" +
          "<div><h4>" + esc(m.name) + '</h4><div class="muted small">' + esc(m.desc) + "</div></div>" +
          (owned ? '<span class="tag">Im Stall</span>' : '<button class="btn small" data-act="mount" data-id="' + m.id + '">' + cost + "</button>") + "</div>";
      }
      return h + "</div>";
    },
  };
  A.mount = (el) => {
    if (!done(E.buyMount(S(), el.dataset.id))) return;
    SB.audio.play("buy");
    UI.toast("Henrietta führt dein neues Reittier aus dem Stall.", "good", "stall");
    UI.refresh();
  };

  /* ================= Halle der Helden: Ranglisten ================= */
  P.ruhmeshalle = {
    role: "Ranglisten der Helden, Gilden und Reiche",
    portrait: () => '<span class="iconport">' + I.ui("ruhm") + "</span>",
    render() {
      const s = S();
      const now = E.now();
      const remote = SB.remoteHeroes || null;
      const tab = UI.tabs.ruhmeshalle || "helden";
      let h = '<div class="tabs">' + [["helden", "Alle Helden"], ["reich", "Mein Reich"], ["gilden", "Gilden"], ["reiche", "Reichskrieg"]].map(([id, n]) => '<button class="tab' + (tab === id ? " on" : "") + '" data-act="tab" data-panel="ruhmeshalle" data-tab="' + id + '">' + n + "</button>").join("") + "</div>";
      if (tab === "reiche") {
        const st = E.realmStandings(s, now, remote);
        h += '<div class="muted" style="margin-bottom:8px">Die Ehre aller Helden eines Reiches zählt im Reichskrieg. Jeder Sieg im Ring stärkt dein Reich.</div>';
        h += st.map((r) => '<div class="realmrow r-' + r.id + (r.id === s.realm ? " mine" : "") + '"><span class="rk">' + r.rank + "</span>" + I.realm(r.id) + '<div><b>' + esc(D.REALMS[r.id].name) + '</b><div class="muted small">' + r.heroes + " Helden · bester Held: " + esc(r.top ? r.top.name : "") + '</div></div><b class="num">' + U.fmt(r.honor) + " Ehre</b></div>").join("");
        return h;
      }
      if (tab === "gilden") {
        const gl = E.guildLadder(s, now, remote, SB.remoteGuilds || null);
        h += '<table class="fame"><thead><tr><th>Platz</th><th>Gilde</th><th>Reich</th><th>Mitglieder</th><th>Ehre</th></tr></thead><tbody>';
        h += gl.map((g) => "<tr" + (s.guild && s.guild.id === g.id ? ' class="me"' : "") + '><td class="num">' + g.rank + "</td><td>" + esc(g.name) + ' <span class="gtag">[' + esc(g.tag) + "]</span>" + (g.kind === "real" ? ' <span class="tag">Spieler</span>' : "") + "</td><td>" + I.realm(g.realm) + '</td><td class="num">' + g.members + '</td><td class="num">' + U.fmt(g.honor) + "</td></tr>").join("");
        return h + "</tbody></table>";
      }
      let all = E.allHeroes(s, now, remote);
      if (tab === "reich") all = E.realmRanked(all, s.realm).map((x) => Object.assign({}, x, { rank: x.realmRank }));
      const me = all.find((x) => x.kind === "me");
      const rows = [];
      const show = new Set();
      for (let i = 0; i < Math.min(10, all.length); i++) show.add(i);
      for (let i = Math.max(0, me.rank - 6); i < Math.min(all.length, me.rank + 5); i++) show.add(i);
      let prev = -1;
      [...show].sort((a, b) => a - b).forEach((i) => {
        if (prev >= 0 && i > prev + 1) rows.push('<tr class="gap"><td colspan="6">⋯</td></tr>');
        prev = i;
        const x = all[i];
        rows.push(
          "<tr" + (x.kind === "me" ? ' class="me"' : ' data-act="heroInfo" data-id="' + esc(x.id) + '"') + '><td class="num">' + x.rank + "</td><td>" + esc(x.name) + guildTag(x.guild) + (x.kind === "real" ? ' <span class="tag">Spieler</span>' : "") + (x.kind === "me" ? ' <span class="tag">Du</span>' : "") + "</td><td>" + I.realm(x.realm) + "</td><td>" + I.classCrest(x.cls) + '</td><td class="num">' + x.level + '</td><td class="num">' + U.fmt(x.honor) + "</td></tr>"
        );
      });
      return h + '<div class="muted small" style="margin-bottom:8px">Ehre gibt es im Ring der Reiche. Klick auf einen Namen für Details.</div><table class="fame"><thead><tr><th>Platz</th><th>Held</th><th>Reich</th><th>Klasse</th><th>Stufe</th><th>Ehre</th></tr></thead><tbody>' + rows.join("") + "</tbody></table>";
    },
  };
  A.heroInfo = (el) => {
    const s = S();
    const x = E.allHeroes(s, E.now(), SB.remoteHeroes || null).find((y) => y.id === el.dataset.id);
    if (!x) return;
    const f = x.fighter || E.npcFighter(x);
    UI.dialog(
      '<div class="row" style="align-items:flex-start"><span class="porthole" style="width:96px;height:96px">' + UI.portrait(UI.fighterDesc(f), 160, true) + '</span><div><h2 style="margin:0">' + esc(x.name) + guildTag(x.guild) + "</h2>" +
        '<div class="muted">' + realmChip(x.realm) + " " + D.RACES[x.race].name + " · " + D.CLASSES[x.cls].name + " · Stufe " + x.level + "</div><div>Platz " + x.rank + " · " + U.fmt(x.honor) + " Ehre" + (x.guild ? " · Gilde " + esc(x.guild.name) : "") + "</div></div></div>" +
        '<div class="stats"><div><span>Lebenspunkte</span><b class="num">' + U.fmt(f.maxHp) + "</b></div>" + D.ATTRS.map((a) => "<div><span>" + I.ui(a) + " " + D.ATTR_INFO[a].name + '</span><b class="num">' + U.fmt(f.attrs[a]) + "</b></div>").join("") + "</div>" +
        '<div class="actions"><button class="btn ghost" data-act="closeDialog">Schließen</button>' + (x.realm !== s.realm ? '<button class="btn" data-act="openArena">Zum Ring</button>' : "") + "</div>"
    );
  };
  A.openArena = () => {
    UI.closeDialog();
    UI.openPanel("arena");
  };

  /* ================= Gildenhalle ================= */
  P.gildenhalle = {
    role: "Gemeinsam für das Reich",
    portrait: () => '<span class="iconport">' + I.ui("gilde") + "</span>",
    render() {
      const s = S();
      const now = E.now();
      const remote = SB.remoteHeroes || null;
      const gl = E.guildLadder(s, now, remote, SB.remoteGuilds || null);
      let h = "";
      if (s.guild) {
        const g = gl.find((x) => x.id === s.guild.id) || Object.assign({ rank: "?", members: 1, honor: s.honor }, s.guild);
        const members = E.allHeroes(s, now, remote).filter((x) => x.guild && x.guild.id === s.guild.id);
        h +=
          '<div class="guildhead r-' + s.realm + '">' + I.ui("gilde") + "<div><h3>" + esc(s.guild.name) + ' <span class="gtag">[' + esc(s.guild.tag) + "]</span></h3>" +
          '<div class="muted">' + realmChip(s.realm) + " · Platz " + g.rank + " der Gilden · " + U.fmt(g.honor) + " Ehre · " + members.length + " Mitglieder</div></div></div>";
        h += '<div class="section-title">Mitglieder</div><table class="fame"><thead><tr><th>Held</th><th>Klasse</th><th>Stufe</th><th>Ehre</th></tr></thead><tbody>';
        h += members.map((x) => "<tr" + (x.kind === "me" ? ' class="me"' : ' data-act="heroInfo" data-id="' + esc(x.id) + '"') + "><td>" + esc(x.name) + (x.kind === "real" ? ' <span class="tag">Spieler</span>' : "") + "</td><td>" + I.classCrest(x.cls) + '</td><td class="num">' + x.level + '</td><td class="num">' + U.fmt(x.honor) + "</td></tr>").join("");
        h += '</tbody></table><div class="row" style="margin-top:14px"><span class="muted small">Die Ehre aller Mitglieder zählt für die Gildenrangliste.</span><span class="spacer"></span><button class="btn ghost small" data-act="leaveGuild">Gilde verlassen</button></div>';
        return h;
      }
      h += '<div class="say">Eine Gilde bündelt die Ehre ihrer Mitglieder. Du kannst nur einer Gilde deines eigenen Reiches beitreten.</div>';
      h += '<div class="section-title">Gilden von ' + esc(D.REALMS[s.realm].name) + '</div><div class="cards">';
      const own = E.allGuilds(s, SB.remoteGuilds || null).filter((g) => g.realm === s.realm);
      for (const g of own) {
        const L = gl.find((x) => x.id === g.id);
        h +=
          '<div class="card"><div class="pic iconport">' + I.realm(g.realm) + "</div><div><h4>" + esc(g.name) + ' <span class="gtag">[' + esc(g.tag) + "]</span>" + (g.kind === "real" ? ' <span class="tag">Spieler</span>' : "") + '</h4><div class="muted small">' + (L ? "Platz " + L.rank + " · " + L.members + " Mitglieder · " + U.fmt(L.honor) + " Ehre" : "Noch ohne Mitglieder") + "</div></div>" +
          '<button class="btn small" data-act="joinGuild" data-id="' + esc(g.id) + '">Beitreten</button></div>';
      }
      h += "</div>";
      h +=
        '<div class="section-title">Eigene Gilde gründen</div><div class="guildform"><label>Name<input id="gName" maxlength="24" placeholder="z. B. Die Nebelwölfe"></label><label>Kürzel<input id="gTag" maxlength="4" placeholder="NW"></label>' +
        '<button class="btn" data-act="createGuild">Gründen für ' + UI.gold(E.C.GUILD_COST) + "</button></div><p class=\"muted small\" id=\"gErr\"></p>";
      return h;
    },
  };
  A.joinGuild = (el) => {
    const s = S();
    const g = E.allGuilds(s, SB.remoteGuilds || null).find((x) => x.id === el.dataset.id);
    if (!done(E.joinGuild(s, g))) return;
    SB.audio.play("horn");
    UI.toast("Willkommen in der Gilde „" + g.name + "“!", "good", "gilde");
    UI.saveNow();
    SB.store.publishHero(s, true);
    UI.refresh();
  };
  A.leaveGuild = (el) => {
    if (!el.dataset.sure) {
      UI.dialog('<h2>Gilde verlassen?</h2><p>Deine Ehre zählt dann nicht mehr für die Gilde.</p><div class="actions"><button class="btn ghost" data-act="closeDialog">Bleiben</button><button class="btn danger" data-act="leaveGuild" data-sure="1">Verlassen</button></div>');
      return;
    }
    const s = S();
    const wasFounder = s.guild && s.guild.founder;
    E.leaveGuild(s);
    UI.closeDialog();
    if (wasFounder) SB.store.removeGuild();
    SB.store.publishHero(s, true);
    UI.refresh();
  };
  A.createGuild = () => {
    const s = S();
    const name = document.getElementById("gName").value;
    const tag = document.getElementById("gTag").value;
    const res = E.createGuild(s, name, tag, SB.store.uid ? "p-" + SB.store.uid : null);
    if (!done(res)) return;
    SB.audio.play("horn");
    UI.toast("Die Gilde „" + res.guild.name + "“ ist gegründet!", "gold", "gilde");
    UI.saveNow();
    SB.store.publishGuild(s);
    SB.store.publishHero(s, true);
    UI.refresh();
  };

  /* ================= Heim ================= */
  let homeView = null;
  let homeEl = null;
  P.heim = {
    title: "Dein Heim",
    role: "Ruhe, Trophäen und dauerhafte Boni",
    portrait: () => '<span class="iconport">' + I.ui("heim") + "</span>",
    render() {
      const s = S();
      const T = D.HOUSE_TIERS[s.house.tier];
      const next = D.HOUSE_TIERS[s.house.tier + 1];
      const painted = UI.use3d && SB.R3D.homePainted && SB.R3D.homePainted(s.realm);
      if (!painted && E.furn(s, "trophaeen")) UI.loadMonsters(["wolf", "drache", "troll"]);
      // gemaltes Heim (Bild aus kulissen.js): laedt es noch, zeichnet sich das Fenster danach neu
      if (UI.use3d && !painted) UI.loadKulissen().then((ok) => ok && UI.panelId === "heim" && SB.R3D.homePainted(S().realm) && UI.renderPanel());
      let h = '<div class="homeview' + (painted ? " painted" : "") + '" id="homeSlot"></div>';
      if (painted) h += '<p class="muted small hp-note">So sieht dein Heim voll ausgebaut aus. Was du noch nicht eingerichtet hast, liegt im Dunkeln; ein Klick auf eine Station zeigt sie in der Liste.</p>';
      h += '<div class="housecard"><div><h3>' + esc(T.name) + '</h3><div class="muted small">' + esc(T.desc) + "</div></div>";
      if (next)
        h += '<div class="next"><div class="small">Ausbau zur <b>' + esc(next.name) + "</b>" + (s.level < next.lv ? ' <span class="delta-down">(ab Stufe ' + next.lv + ")</span>" : "") + "</div>" + '<button class="btn small" data-act="houseUp"' + (s.level < next.lv || s.gold < next.cost || (next.perlen && s.perlen < next.perlen) ? " disabled" : "") + ">" + UI.gold(next.cost) + (next.perlen ? " + " + UI.perlen(next.perlen) : "") + "</button></div>";
      else h += '<span class="tag">Vollständig ausgebaut</span>';
      h += "</div>";
      h += '<div class="section-title">Einrichtung</div><div class="furn">';
      for (const f of D.FURNITURE) {
        const lv = E.furn(s, f.id);
        const c = E.furnCost(s, f.id);
        const bonus = lv * f.per;
        const locked = c && s.house.tier < c.tier;
        h +=
          '<div class="frow' + (UI.homeFocus === f.id ? " focus" : "") + '" id="f-' + f.id + '"><div><b>' + esc(f.name) + "</b> " + (lv ? '<span class="tag">' + esc(f.levels[lv - 1]) + "</span>" : '<span class="muted small">noch nicht vorhanden</span>') +
          '<div class="muted small">' + esc(f.desc) + (lv ? " Jetzt: +" + bonus + f.unit + " " + esc(f.bonus) + "." : "") + "</div></div>" +
          (c
            ? '<button class="btn small" data-act="furnBuy" data-id="' + f.id + '"' + (locked || s.gold < c.gold ? " disabled" : "") + ">" + (lv ? "Verbessern: " : "Kaufen: ") + esc(c.name) + " · " + UI.gold(c.gold) + "</button>" + (locked ? '<div class="muted small">Benötigt ' + esc(D.HOUSE_TIERS[c.tier].name) + "</div>" : "")
            : '<span class="tag">Höchste Stufe</span>') +
          "</div>";
      }
      h += "</div>";
      return h;
    },
    after(el) {
      const slot = el.querySelector("#homeSlot");
      if (!slot) return;
      const s = S();
      if (!UI.use3d) {
        slot.innerHTML = '<div class="hv-fallback">' + I.ui("heim") + "</div>";
        return;
      }
      const painted = SB.R3D.homePainted && SB.R3D.homePainted(s.realm);
      // Wechsel zwischen gebautem und gemaltem Heim (Bild kam nach): Ansicht neu anlegen
      if (homeView && !!homeView.painted !== !!painted) {
        homeView.dispose();
        homeView = null;
        homeEl = null;
      }
      if (!homeEl) {
        homeEl = document.createElement("div");
        homeEl.style.cssText = "position:absolute;inset:0";
      }
      slot.appendChild(homeEl);
      if (!homeView) {
        homeView = (painted ? SB.R3D.createPaintedHome : SB.R3D.createHome)(homeEl, {
          quality: s.settings.quality,
          onPick: (id) => {
            UI.homeFocus = id;
            UI.renderPanel();
            const row = document.getElementById("f-" + id);
            if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
          },
        });
      }
      const furn = {};
      for (const f of D.FURNITURE) {
        const lv = E.furn(s, f.id);
        if (lv) furn[f.id] = lv - 1;
      }
      const key = JSON.stringify([s.house.tier, furn, s.realm, UI.heroDesc(s)]);
      if (key !== homeEl.dataset.key) {
        homeEl.dataset.key = key;
        homeView.update({ tier: s.house.tier, furn, realm: s.realm, hero: UI.heroDesc(s) });
      }
    },
    beforeRender() {
      if (homeEl && homeEl.parentNode) homeEl.parentNode.removeChild(homeEl);
    },
    close() {
      if (homeView) homeView.dispose();
      homeView = null;
      homeEl = null;
    },
  };
  A.houseUp = () => {
    const res = E.buyHouseTier(S());
    if (!done(res)) return;
    SB.audio.play("levelup");
    UI.toast("Dein Heim ist jetzt eine " + res.name + "!", "gold", "heim");
    UI.refresh();
    if (homeView) homeView.cheer();
  };
  A.furnBuy = (el) => {
    const res = E.buyFurniture(S(), el.dataset.id);
    if (!done(res)) return;
    SB.audio.play("anvil");
    UI.homeFocus = el.dataset.id;
    UI.toast("Neu im Heim: " + res.name, "good", "heim");
    UI.refresh();
  };

  /* ================= Wunschbrunnen ================= */
  const COIN_FRONT =
    '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><path d="M32 10 L36 26 L52 26 L39 36 L44 52 L32 42 L20 52 L25 36 L12 26 L28 26 Z" fill="#fff3c4" stroke="#6a4d18" stroke-width="2.6" stroke-linejoin="round"/></svg>';
  UI.lastWell = null;
  P.brunnen = {
    role: "Alle 8 Stunden wirft jeder umsonst",
    portrait: () => '<span class="iconport">' + I.ui("brunnen") + "</span>",
    render() {
      const s = S();
      const now = E.now();
      const free = E.wellFree(s, now);
      const paidLeft = E.C.WELL_PAID_MAX - s.daily.wellPaid;
      let h = '<div class="say">Man sagt, der Brunnen erfüllt Wünsche. Meistens wünscht er sich allerdings Münzen.</div>';
      h += '<div class="well"><div class="coin" id="coin"><div class="face">' + COIN_FRONT + '</div><div class="face back">' + I.ui("perle") + "</div></div></div>";
      h += '<div class="wellbox' + (free ? " ready" : "") + '"><div class="wl-title">' + I.ui("sanduhr") + " Freier Wurf</div>";
      if (free) h += '<div class="wl-big">Bereit!</div><button class="btn big" data-act="well">Kostenlos werfen</button>';
      else h += '<div class="muted">Der Brunnen sammelt neue Kraft. Der nächste freie Wurf kommt in:</div><div class="wl-big num" data-until="' + s.wellNext + '"></div>';
      h += "</div>";
      h +=
        '<div class="wellbox"><div class="wl-title">' + I.ui("perle") + " Zusätzlicher Wurf</div><div class=\"muted small\">Kostet eine Wolkenperle. Nur wenn du willst, deine Perlen bleiben sonst gespart. Heute noch " + paidLeft + " möglich, du hast " + s.perlen + ' Perlen.</div><button class="btn ghost" data-act="wellPerl"' + (paidLeft <= 0 || s.perlen < 1 ? " disabled" : "") + ">Mit 1 Wolkenperle werfen</button></div>";
      if (UI.lastWell) h += '<div class="say" style="text-align:center;font-style:normal" id="wellResult">' + UI.lastWell + "</div>";
      h += '<div class="section-title">Mögliche Gaben</div><ul class="muted" style="margin:0;padding-left:20px">' + D.WELL_PRIZES.map((p) => "<li>" + esc(p.label) + "</li>").join("") + "</ul>";
      return h;
    },
  };
  function toss(usePerl) {
    const s = S();
    const res = E.tossWell(s, E.now(), usePerl);
    if (!done(res)) return;
    const coin = document.getElementById("coin");
    SB.audio.play("well");
    let txt = "<b>" + esc(res.label) + "</b>";
    if (res.gold) txt += "<br>" + UI.gold(res.gold);
    if (res.perlen) txt += "<br>" + UI.perlen(res.perlen);
    if (res.energy) txt += "<br>+" + res.energy + " Tatendrang";
    if (res.xp) txt += "<br>+" + U.fmt(res.xp) + " Erfahrung";
    if (res.item) txt += '<br><span class="t-' + res.item.rarity + '">' + esc(res.item.name) + "</span> liegt in deinem Rucksack.";
    if (res.itemSold) txt += "<br>(Rucksack voll: Gegenstand verkauft)";
    UI.lastWell = txt;
    if (coin) {
      coin.classList.remove("flip");
      void coin.offsetWidth;
      coin.classList.add("flip");
      setTimeout(() => UI.refresh(), 1650);
    } else UI.refresh();
    UI.saveNow();
  }
  A.well = () => toss(false);
  A.wellPerl = () => toss(true);

  /* ================= Einstellungen ================= */
  P.einstellungen = {
    title: "Einstellungen",
    role: "Spielstand, Darstellung und Klang",
    portrait: () => '<span class="iconport">' + I.ui("einstellungen") + "</span>",
    render() {
      const s = S();
      const q = s.settings.quality;
      const dc = s.settings.dayCycle || "zyklus";
      let h = '<div class="section-title">Darstellung</div><div class="row">' + [["hoch", "3D mit Schatten"], ["niedrig", "3D schlicht"], ["aus", "Ohne 3D"]].map(([id, n]) => '<button class="tab' + (q === id ? " on" : "") + '" data-act="quality" data-q="' + id + '">' + n + "</button>").join("") + "</div>";
      h += '<p class="muted small">Die Änderung wird nach dem Neuladen der Seite wirksam.</p>';
      h += '<div class="section-title">Tag und Nacht</div><div class="row">' + [["zyklus", "Automatisch (20 Minuten)"], ["echtzeit", "Echte Uhrzeit"], ["tag", "Immer Tag"], ["nacht", "Immer Nacht"]].map(([id, n]) => '<button class="tab' + (dc === id ? " on" : "") + '" data-act="dayCycle" data-v="' + id + '">' + n + "</button>").join("") + "</div>";
      h += '<div class="muted small" style="margin-top:6px">Das Mondtor öffnet sich nur bei Nacht. Die Nachtjagden sind auf ' + E.C.NIGHT_HUNTS + " pro Tag begrenzt, ganz gleich, welche Einstellung du wählst.</div>";
      h += '<div class="section-title">Kämpfe</div><div class="row"><button class="tab' + (s.settings.fastFights ? " on" : "") + '" data-act="fastFights">Kämpfe standardmäßig doppelt so schnell</button></div>';
      h += '<div class="section-title">Klang</div><div class="row"><button class="tab' + (s.settings.sound ? " on" : "") + '" data-act="toggleSound">Klangeffekte ' + (s.settings.sound ? "an" : "aus") + '</button><button class="tab' + (s.settings.music !== false ? " on" : "") + '" data-act="toggleMusic">Musik ' + (s.settings.music !== false ? "an" : "aus") + "</button></div>";
      h += '<div class="row" style="margin-top:6px"><button class="btn ghost" data-act="open" data-id="klangprobe">Klangprobe öffnen</button><span class="muted small">Kampfgeräusche, Stimmen der Völker und Gegner, Magie und Siegeslieder zum Anhören</span></div>';
      h += '<div class="section-title">Spielstand</div><p class="muted small">' + (SB.store.cloud ? "Dein Spielstand wird in diesem Browser und privat in deinem claude.ai-Konto gespeichert." : "Dein Spielstand wird in diesem Browser gespeichert. Sichere ihn als Code, wenn du das Gerät wechseln willst.") + "</p>";
      h += '<div class="row"><button class="btn ghost" data-act="exportSave">Spielstand als Code</button><button class="btn ghost" data-act="importSave">Code laden</button><span class="spacer"></span><button class="btn danger small" data-act="resetHero">Neuen Helden beginnen</button></div>';
      h += '<div class="section-title">Galerie</div><div class="row"><button class="btn ghost" data-act="open" data-id="figurenprobe">Figurenprobe: alle Figuren, Waffen und Bewegungen</button></div>';
      if (UI.hub && UI.hub.visit && SB.hubPainted) {
        const others = Object.keys(D.REALMS).filter((r) => r !== s.realm && SB.hubPainted.has(r));
        if (others.length) h += '<div class="row">' + others.map((r) => '<button class="btn ghost" data-act="inselBesuch" data-v="' + r + '">' + esc(D.REALMS[r].isle) + " besuchen (" + esc(D.REALMS[r].name) + ")</button>").join("") + "</div>";
      }
      h += '<div class="section-title">Über das Spiel</div><p class="muted small">Helden von Schwebfels ist ein eigenständiges Browser-Rollenspiel. Alle Figuren, Texte, Symbole, Musikstücke und 3D-Modelle sind eigens dafür entstanden. Die Kampfgeräusche und Stimmen stammen aus freien, gemeinfreien Sammlungen (CC0) von Kenney und von OpenGameArt (unter anderem rubberduck, artisticdude, StarNinjas, qubodup, cicifyre). Die 3D-Darstellung nutzt die Bibliothek three.js.</p>';
      return h;
    },
  };
  /* Inseln der anderen Reiche besuchen (aus den Einstellungen) */
  A.inselBesuch = (el) => {
    if (UI.hub && UI.hub.visit) UI.hub.visit(el.dataset.v);
    UI.closePanel();
  };

  /* ================= Figurenprobe: erzeugte Figuren ansehen ================= */
  const FP = { fig: "nordmann-frau", pose: "", weapon: "axt", near: false, state: "", view: null, el: null, timer: 0 };
  const FP_ORDER = ["nordmann", "trollblut", "frostwicht", "glutzwerg", "albier", "kreidezwerg", "sidhe", "moorling"];
  const FP_NAME = { nordmann: "Nordmann", trollblut: "Trollblut", frostwicht: "Frostwicht", glutzwerg: "Glutzwerg", albier: "Albier", kreidezwerg: "Kreidezwerg", sidhe: "Sidhe", moorling: "Moorling" };
  const FP_POSES = [["", "Stand"], ["walk", "Laufen"], ["attack", "Angriff"], ["special", "Spezialangriff"], ["hit", "Treffer"], ["block", "Parade"], ["evade", "Ausweichen"], ["victory", "Jubel"], ["defeat", "Niederlage"]];
  // Waffe und passende Klasse (die Klasse waehlt Angriff und Spezialangriff wie im Kampf)
  const FP_WEAPONS = [["axt", "Axt", "sturmhuene"], ["schwert", "Schwert", "sturmhuene"], ["hammer", "Hammer", "sturmhuene"], ["dolch", "Dolche", "nebelschleicher"], ["speer", "Speer", "wolfsjaeger"], ["bogen", "Bogen", "wolfsjaeger"], ["stab", "Stab", "runenwirker"], ["", "ohne", "sturmhuene"]];
  // Monster mit neuer Figur aus dem Monsterkonzept (Monster-ID); nur waehlbar, wenn die Figur im Paket steckt
  // alle Monster; waehlbar, sobald ihre Familie geladen ist und es eine eigene Figur gibt
  const FP_MON = () => {
    const order = ["ghul", "goblin", "kultist", "golem", "troll", "todesritter", "baum", "pilz", "schemen", "schlund", "wolf", "spinne", "krebs", "fledermaus", "drache"];
    return SB.data.MONSTERS.slice().sort((a, b) => order.indexOf(a.arch) - order.indexOf(b.arch)).map((m) => [m.id, m.name, m.arch]);
  };
  // Endbosse aus Chronik und Verliesen (eigene Figur unter dem Schluessel ihres Namens, UI.monKey)
  let FP_BOSSES = null;
  const FP_BOSS = () => {
    if (FP_BOSSES) return FP_BOSSES;
    const out = [];
    const seen = {};
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o.foes)) for (const f of o.foes) if (f && f.final && f.name && !seen[f.name]) out.push((seen[f.name] = f));
      for (const k in o) if (k !== "foes" && o[k] && typeof o[k] === "object") walk(o[k]);
    };
    walk(D);
    for (const d of D.DUNGEONS) for (const b of d.bosses) if (b.final && !seen[b.name]) out.push((seen[b.name] = b));
    return (FP_BOSSES = out);
  };
  const fpMon = () => (FP.fig.indexOf("mon:") === 0 ? E.monById(FP.fig.slice(4)) : FP.fig.indexOf("boss:") === 0 ? FP_BOSS().find((b) => UI.monKey(b.name) === FP.fig.slice(5)) : null);
  const fpMonReady = (id) => {
    const m = E.monById(id);
    const R = SB.R3D;
    return !!(m && ((R.rigged && R.rigged.is(id)) || (R.beasts && R.beasts.isGen && R.beasts.isGen(m.arch, id))));
  };
  // waehlbar, sobald die eigene oder die geliehene Figur geladen ist
  const fpBossReady = (b) => {
    const R = SB.R3D;
    const own = (k) => !!k && ((R.rigged && R.rigged.is(k)) || (R.beasts && R.beasts.hasOwn && R.beasts.hasOwn(k)));
    return own(UI.monKey(b.name)) || own(UI.monLook(b));
  };
  const fpWeapon = () => FP_WEAPONS.find((w) => w[0] === FP.weapon) || FP_WEAPONS[0];
  const fpDesc = () => {
    const mon = fpMon();
    if (mon) return UI.monDesc(mon, !!mon.final, !!mon.final);
    const [race, sex] = FP.fig.split("-");
    const w = fpWeapon();
    const gear = w[0] ? { waffe: { base: w[0], variant: 0, rarity: "selten", vis: { f: w[0] + ".0", c: "midgard", o: 0, v: 1 } } } : {};
    if (w[0] === "schwert") gear.nebenhand = { base: "schild", variant: 0, rarity: "selten", vis: { f: "schild.0", c: "midgard", o: 0, v: 1 } };
    return { kind: "hero", gen: FP.fig, genGear: [], race, gender: sex === "frau" ? "w" : "m", cls: w[2], realm: "midgard", gear };
  };
  // Angriff mit Bogen ist ein Schuss, mit dem Stab ein Zauber (wie im Kampf)
  const fpAction = (pose) => (fpMon() ? pose : pose === "attack" && FP.weapon === "bogen" ? "shoot" : pose === "attack" && FP.weapon === "stab" ? "cast" : pose);
  function fpCamera() {
    const v = FP.view;
    if (!v || !v.model) return;
    const box = new (SB.R3D.T().Box3)().setFromObject(v.model.obj);
    // Bildausschnitt nach Figurengroesse: ganz (etwa 85 % der Hoehe) oder nah (Kopf und Oberkoerper)
    const top = Math.max(1, box.max.y);
    // lange Tiere (Wolf, Schlund) ganz ins Bild
    const len = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    if (FP.near) {
      v.camera.position.set(0, top * 0.86, top * 0.95 + 0.45);
      v.camera.lookAt(0, top * 0.8, 0);
    } else {
      v.camera.position.set(0, top * 0.58, Math.max(3.4, top * 2.3, len * 1.9));
      v.camera.lookAt(0, top * 0.5, 0);
    }
  }
  function fpShow() {
    if (!FP.view) return;
    FP.view.set(fpDesc());
    fpCamera();
    fpPlay();
  }
  function fpPlay() {
    clearInterval(FP.timer);
    FP.timer = 0;
    if (!FP.view || !FP.pose) return;
    // Dauer wie im Kampf (etwas laenger zum Hinsehen): der Schlag faellt ans Ende, danach klingt die Bewegung aus
    const DUR = { attack: 0.6, special: 0.7, shoot: 0.6, cast: 0.6, hit: 0.45, block: 0.45, evade: 0.45, victory: 1.2, defeat: 1.2 };
    const go = () => FP.view && FP.view.play(fpAction(FP.pose), DUR[fpAction(FP.pose)] || 2.4);
    go();
    FP.timer = setInterval(go, 2600);
  }
  P.figurenprobe = {
    title: "Figurenprobe",
    role: "Alle Figuren, Waffen und Bewegungen",
    portrait: () => '<span class="iconport">' + I.ui("einstellungen") + "</span>",
    render() {
      const gen = (SB.assets.data && SB.assets.data.gen) || {};
      let h = '<p class="muted small">Erzeugt aus deinen Konzeptbildern, mit Meshy-Skelett und echten, aufgenommenen Bewegungen aus der Meshy-Bibliothek (dieselben für alle Figuren). Ziehen dreht die Figur.</p>';
      if (!UI.use3d) return h + '<div class="muted">Die Figurenprobe braucht die 3D-Darstellung. Schalte sie oben in den Einstellungen ein und lade die Seite neu.</div>';
      const stage = '<div class="heroview fp-stage" id="fpStage">' + (FP.state === "ok" ? "" : '<div class="hv-caption"><span class="muted">' + (FP.state === "fehler" ? "Die Figurendaten konnten nicht geladen werden. Bitte die Seite neu laden." : "Figuren werden geladen ...") + "</span></div>") + "</div>";
      h += stage + (FP.partial && FP.state === "ok" ? '<p class="muted small">Die Figurendateien der Reiche konnten nicht nachgeladen werden; Nordmann und Trollblut stecken direkt im Spiel.</p>' : "") + '<div class="section-title">Volk</div><div class="row">';
      for (const r of FP_ORDER) {
        for (const [sx, nm] of [["frau", "Frau"], ["mann", "Mann"]]) {
          const k = r + "-" + sx;
          h += '<button class="tab' + (FP.fig === k ? " on" : "") + '" data-act="fpFig" data-k="' + k + '"' + (FP.state === "ok" && !gen[k] ? " disabled" : "") + ">" + FP_NAME[r] + " " + nm + "</button>";
        }
      }
      h += '</div><div class="section-title">Monster aus deinem Monsterkonzept</div><div class="row">';
      UI.loadMonsters(FP_MON().map((x) => x[2]));
      for (const [id, nm] of FP_MON()) {
        const k = "mon:" + id;
        h += '<button class="tab' + (FP.fig === k ? " on" : "") + '" data-act="fpFig" data-k="' + k + '"' + (FP.state === "ok" && !fpMonReady(id) ? " disabled" : "") + ">" + nm + "</button>";
      }
      // Endbosse wie im Kampf: eigene Figur, sonst die geliehene eines Monsters ihrer Familie
      h += '</div><div class="section-title">Endbosse aus Chronik und Verliesen</div><div class="row">';
      for (const b of FP_BOSS()) {
        const k = "boss:" + UI.monKey(b.name);
        h += '<button class="tab' + (FP.fig === k ? " on" : "") + '" data-act="fpFig" data-k="' + k + '"' + (FP.state === "ok" && !fpBossReady(b) ? " disabled" : "") + ">" + esc(b.name) + "</button>";
      }
      h += '</div><div class="section-title">Bewegung</div><div class="row">' + FP_POSES.map(([id, n]) => '<button class="tab' + (FP.pose === id ? " on" : "") + '" data-act="fpPose" data-p="' + id + '">' + n + "</button>").join("");
      h += '</div><div class="section-title">Waffe</div><div class="row">' + FP_WEAPONS.map(([id, n]) => '<button class="tab' + (FP.weapon === id ? " on" : "") + '" data-act="fpWeapon" data-w="' + id + '"' + (fpMon() ? " disabled" : "") + ">" + n + "</button>").join("");
      h += '<span class="spacer"></span><button class="tab' + (FP.near ? " on" : "") + '" data-act="fpNear">' + (FP.near ? "Nah" : "Ganz") + "</button></div>";
      return h;
    },
    after(root) {
      const slot = root.querySelector("#fpStage");
      if (!slot || !UI.use3d) return;
      if (!FP.el) {
        FP.el = document.createElement("div");
        FP.el.style.cssText = "position:absolute;inset:0";
      }
      slot.appendChild(FP.el);
      if (FP.state === "ok") {
        if (!FP.view) {
          FP.view = SB.R3D.createHeroView(FP.el);
          fpShow();
        }
        return;
      }
      if (FP.state === "laden") return;
      FP.state = "laden";
      const mon = UI.loadMonsters(FP_MON().map((x) => x[2]).concat(FP_BOSS().map((b) => b.arch)));
      // Heldenkoerper aller drei Reiche; fehlt eine Datei, bleiben die uebrigen waehlbar
      const realms = ["midgard", "albion", "hibernia"].map((r) => SB.assets.loadGen(r).then(() => true, () => false));
      Promise.all(realms)
        .then((ok) => {
          if (!ok.some(Boolean)) throw new Error("keine Figurendatei");
          return mon.then(() => SB.R3D.human.preloadGen());
        })
        .then(
          () => {
            FP.state = "ok";
            if (UI.panelId === "figurenprobe") UI.renderPanel();
          },
          () => {
            // ohne Zusatzdatei bleiben die Figuren, die in der Seite stecken (Nordmann und Trollblut)
            FP.state = Object.keys((SB.assets.data && SB.assets.data.gen) || {}).length ? "ok" : "fehler";
            FP.partial = true;
            if (UI.panelId === "figurenprobe") UI.renderPanel();
          }
        );
    },
    close() {
      clearInterval(FP.timer);
      FP.timer = 0;
      if (FP.view) FP.view.dispose();
      FP.view = null;
      FP.el = null;
    },
  };
  A.fpFig = (el) => {
    FP.fig = el.dataset.k;
    UI.renderPanel();
    fpShow();
  };
  A.fpPose = (el) => {
    FP.pose = el.dataset.p;
    UI.renderPanel();
    fpPlay();
  };
  A.fpWeapon = (el) => {
    FP.weapon = el.dataset.w || "";
    UI.renderPanel();
    fpShow();
  };
  A.fpNear = () => {
    FP.near = !FP.near;
    UI.renderPanel();
    fpCamera();
  };

  /* ================= Klangprobe: Geraeusche einzeln und als kleine Kampfszenen anhoeren ================= */
  const KP_W = (base) => ({ base, rarity: "selten" });
  const KP_HERO = {
    nordfrau: { kind: "hero", race: "nordmann", gender: "w", cls: "sturmhuene", realm: "midgard", gear: { waffe: KP_W("axt"), ruestung: KP_W("harnisch") } },
    lichtweber: { kind: "hero", race: "albier", gender: "m", cls: "lichtweber", realm: "albion", gear: { waffe: KP_W("zepter"), ruestung: KP_W("robe") } },
    langbogner: { kind: "hero", race: "kreidezwerg", gender: "w", cls: "langbogner", realm: "albion", gear: { waffe: KP_W("bogen"), ruestung: KP_W("wams") } },
    runenwirker: { kind: "hero", race: "trollblut", gender: "m", cls: "runenwirker", realm: "midgard", gear: { waffe: KP_W("runenstab"), ruestung: KP_W("robe") } },
    schattentaenzer: { kind: "hero", race: "sidhe", gender: "w", cls: "schattentaenzer", realm: "hibernia", gear: { waffe: KP_W("dolch"), ruestung: KP_W("schattenwams") } },
    hainwaechter: { kind: "hero", race: "moorling", gender: "m", cls: "hainwaechter", realm: "hibernia", gear: { waffe: KP_W("hammer"), ruestung: KP_W("harnisch"), nebenhand: KP_W("schild") } },
  };
  const KP_MON = (arch, extra) => Object.assign({ kind: "monster", arch }, extra || {});
  const KP_SZENEN = [
    ["Nordmann-Kriegerin mit Axt gegen Grauwolf", "nordfrau", KP_MON("wolf"), "nah", "nah"],
    ["Runenwirker (Trollblut) gegen Eiswyrm", "runenwirker", KP_MON("drache", { accent: "#9fd8ff", boss: true }), "magie", "magie"],
    ["Lichtweber gegen Blutkultist", "lichtweber", KP_MON("kultist"), "magie", "magie"],
    ["Langbognerin (Kreidezwerg) gegen Netzlauerer", "langbogner", KP_MON("spinne"), "pfeil", "nah"],
    ["Hainwächter mit Schild gegen Felsgolem", "hainwaechter", KP_MON("golem", { boss: true }), "nah", "nah"],
    ["Schattentänzerin (Sidhe) gegen Fahlen Schemen", "schattentaenzer", KP_MON("schemen"), "nah", "magie"],
    ["Nordmann-Kriegerin gegen Schwelwurm (Drache)", "nordfrau", KP_MON("drache", { accent: "#ff7a2a", boss: true }), "nah", "magie"],
    ["Nordmann-Kriegerin gegen Todesritter", "nordfrau", KP_MON("todesritter"), "nah", "nah"],
  ];
  const KP_ARCHS = [["wolf", "Wolf"], ["drache", "Drache"], ["troll", "Troll"], ["golem", "Golem"], ["schemen", "Schemen"], ["ghul", "Ghul"], ["spinne", "Spinne"], ["pilz", "Pilz"], ["baum", "Baumhirte"], ["krebs", "Krebs"], ["fledermaus", "Flatterer"], ["goblin", "Kobold"], ["kultist", "Kultist"], ["todesritter", "Todesritter"], ["schlund", "Schlund"]];
  const KP_RACES = [["albier", "Albier"], ["kreidezwerg", "Kreidezwerg"], ["nordmann", "Nordmann"], ["trollblut", "Trollblut"], ["sidhe", "Sidhe"], ["moorling", "Moorling"]];
  const KP_WAFFEN = [["dolch", "Dolch"], ["schwert", "Schwert"], ["axt", "Axt"], ["hammer", "Hammer"], ["speer", "Speer"], ["bogen", "Bogen"], ["armbrust", "Armbrust"]];
  const KP_ZIELE = [["krieger", "Plattenrüstung"], ["schurke", "Leder"], ["wolf", "Fell"], ["golem", "Stein"], ["baum", "Holz"], ["ghul", "Knochen"], ["spinne", "Panzer"], ["schlund", "Schleim"], ["schemen", "Geist"], ["drache", "Schuppen"], ["kultist", "Stoff"]];
  const KP_MAGIE = [["licht", "Licht (Albion)"], ["frost", "Frost und Runen (Midgard)"], ["dorn", "Dornen (Hibernia)"], ["dunkel", "Dunkel"], ["feuer", "Feuer"], ["blitz", "Blitz"], ["gift", "Gift"]];
  const KP = { waffe: "schwert" };
  P.klangprobe = {
    title: "Klangprobe",
    role: "Kampfgeräusche, Stimmen, Magie und Siegeslieder zum Anhören",
    portrait: () => '<span class="iconport">' + I.ui("ton") + "</span>",
    render() {
      const row = (items, act, extra) => '<div class="row" style="gap:6px">' + items.map(([v, n]) => '<button class="tab" data-act="' + act + '" data-v="' + v + '"' + (extra || "") + ">" + esc(n) + "</button>").join("") + "</div>";
      let h = '<p class="muted small">Freie Aufnahmen (gemeinfrei) statt der bisherigen erzeugten Töne. Jeder Klang hat mehrere Varianten und klingt bei jedem Antippen etwas anders. Sag mir, was dir gefällt und was nicht.</p>';
      if (!SB.audio.enabled) h += '<p class="muted small">Die Klangeffekte sind ausgeschaltet. Schalte sie oben rechts ein, um etwas zu hören.</p>';
      h += '<div class="section-title">Kleine Kampfszenen</div><div style="display:grid;gap:6px">' + KP_SZENEN.map((sz, i) => '<button class="btn ghost small" style="justify-content:flex-start" data-act="kpSzene" data-i="' + i + '">' + esc(sz[0]) + "</button>").join("") + "</div>";
      // Lieder nach dem Kampf: anhoeren und waehlen, welches das Spiel spielt (S.settings.liedSieg, liedNiederlage)
      const st = S().settings;
      const wahl = (kind, items, cur) => '<div class="row" style="gap:6px">' + items.map(([v, n]) => '<button class="tab' + (cur === v ? " on" : "") + '" data-act="kpLiedWahl" data-k="' + kind + '" data-v="' + v + '">' + esc(n) + "</button>").join("") + "</div>";
      h += '<div class="section-title">Sieg und Niederlage</div><div class="muted small">Kurze Lieder am Ende des Kampfes, die Musik tritt so lange zurück.</div>';
      h += '<div class="row" style="gap:6px">' + [["sieg", "fest", "Sieg: mittelalterlich"], ["sieg", "fanfare", "Sieg: Fanfare"], ["niederlage", "fest", "Niederlage: mittelalterlich"], ["niederlage", "tragisch", "Niederlage: tragisch"]].map(([k, v, n]) => '<button class="tab" data-act="kpLied" data-k="' + k + '" data-v="' + v + '">▶ ' + esc(n) + "</button>").join("") + "</div>";
      h += '<div class="muted small" style="margin-top:8px">Im Spiel nach einem Sieg:</div>' + wahl("sieg", [["auto", "Abwechselnd (Fanfare bei Bossen, Chronik, Verlies, Arena)"], ["fest", "Immer mittelalterlich"], ["fanfare", "Immer Fanfare"]], st.liedSieg || "auto");
      h += '<div class="muted small" style="margin-top:8px">Im Spiel nach einer Niederlage:</div>' + wahl("niederlage", [["fest", "Mittelalterlich"], ["tragisch", "Tragisch"]], st.liedNiederlage || "fest");
      h += '<div class="section-title">Gegner</div><div class="muted small">Tippe auf einen Gegner: Auftritt, Angriff, Schmerz und Niederlage nacheinander.</div>' + row(KP_ARCHS, "kpGegner");
      h += '<div class="section-title">Völker</div><div class="muted small">Kampfruf und Schmerzlaut, jeweils Frau und Mann.</div>' + row(KP_RACES, "kpVolk");
      h += '<div class="section-title">Waffe trifft Material</div>' + row(KP_WAFFEN.map(([v, n]) => [v, (KP.waffe === v ? "● " : "") + n]), "kpWaffe") + '<div style="height:6px"></div>' + row(KP_ZIELE, "kpZiel");
      h += '<div class="section-title">Magie</div>' + row(KP_MAGIE, "kpMagie") + '<div style="height:6px"></div>' + row([["magie.heilung", "Heilung"], ["magie.barriere", "Barriere"], ["magie.teleport", "Verschwinden"], ["magie.reinigung", "Reinigung"]], "kpBank");
      h += '<div class="section-title">Vorher und nachher</div><div class="muted small">Links der bisherige erzeugte Ton, rechts die neue Aufnahme.</div>';
      h += [["hit", "Treffer", "mat.fleisch"], ["crit", "Kritisch", "krit"], ["swing", "Schwung", "schwung.klinge"], ["bow", "Bogen", "bogen.schuss"], ["spell", "Zauber", "magie.licht.wirken"], ["block", "Block", "block.schild"], ["victory", "Sieg", "lied.sieg.fest"], ["defeat", "Niederlage", "lied.niederlage.fest"]]
        .map(([o, n, k]) => '<div class="row" style="gap:6px"><span style="min-width:90px">' + n + '</span><button class="tab" data-act="kpAlt" data-v="' + o + '">vorher</button><button class="tab" data-act="kpBank" data-v="' + k + '">nachher</button></div>')
        .join("");
      return h;
    },
  };
  const kpSay = (d, kind, ms) => setTimeout(() => SB.audio.voiceProbe(d, kind), ms || 0);
  const kpEv = (name, c, ms) => setTimeout(() => SB.audio.event(name, c), ms || 0);
  A.kpSzene = (el) => {
    const [, hk, foe, howH, howF] = KP_SZENEN[+el.dataset.i];
    const hero = KP_HERO[hk];
    const att = (a, d, how, side, t, crit) => {
      if (how === "nah") kpEv("swing", { a, side: -side }, t);
      else if (how === "pfeil") kpEv("bow", { a, side: -side }, t);
      else kpEv("spell", { a, side: -side }, t);
      kpEv(crit ? "crit" : "hit", { a, d, side, how }, t + (how === "nah" ? 220 : 520));
    };
    kpEv("auftritt", { a: foe, side: 1 }, 0);
    att(hero, foe, howH, 1, 1500, false);
    att(foe, hero, howF, -1, 2700, false);
    att(hero, foe, howH, 1, 3900, true);
    att(foe, hero, howF, -1, 5100, true);
    att(hero, foe, howH, 1, 6300, false);
    kpEv("ko", { d: foe, side: 1 }, 7100);
  };
  A.kpGegner = (el) => {
    const d = { kind: "monster", arch: el.dataset.v, accent: el.dataset.v === "drache" ? "#ff7a2a" : null };
    kpSay(d, "auftritt", 0);
    kpSay(d, "angriff", 1700);
    kpSay(d, "schmerz", 2700);
    kpSay(d, "tod", 3600);
  };
  A.kpVolk = (el) => {
    const r = el.dataset.v;
    const w = { kind: "hero", race: r, gender: "w" };
    const m = { kind: "hero", race: r, gender: "m" };
    kpSay(w, "angriff", 0);
    kpSay(w, "schmerz", 700);
    kpSay(m, "angriff", 1500);
    kpSay(m, "schmerz", 2200);
  };
  A.kpWaffe = (el) => {
    KP.waffe = el.dataset.v;
    UI.renderPanel();
  };
  A.kpZiel = (el) => {
    const a = { kind: "hero", race: "nordmann", gender: "w", gear: { waffe: KP_W(KP.waffe) } };
    const d = { kind: "monster", arch: el.dataset.v };
    const ranged = KP.waffe === "bogen" || KP.waffe === "armbrust";
    if (ranged) kpEv("bow", { a, side: -1, quiet: true }, 0);
    else kpEv("swing", { a, side: -1, quiet: true }, 0);
    kpEv("hit", { a, d, side: 1, how: ranged ? "pfeil" : "nah", quiet: true }, ranged ? 450 : 220);
  };
  A.kpMagie = (el) => {
    const sc = el.dataset.v;
    const cls = { licht: "lichtweber", frost: "runenwirker", dorn: "dornenrufer" }[sc];
    const a = cls ? { kind: "hero", cls, race: "albier", gender: "w" } : { kind: "monster", arch: sc === "gift" ? "pilz" : sc === "dunkel" ? "kultist" : "drache", accent: sc === "feuer" ? "#ff7a2a" : sc === "blitz" ? "#ffe45a" : null };
    kpEv("spell", { a, side: -1, quiet: true }, 0);
    kpEv("hit", { a, d: { kind: "monster", arch: "krieger" }, side: 1, how: "magie", quiet: true }, 600);
  };
  A.kpBank = (el) => SB.audio.probe(el.dataset.v);
  A.kpLied = (el) => SB.audio.lied(el.dataset.k, { wahl: el.dataset.v });
  A.kpLiedWahl = (el) => {
    S().settings[el.dataset.k === "sieg" ? "liedSieg" : "liedNiederlage"] = el.dataset.v;
    UI.save();
    UI.renderPanel();
    SB.audio.lied(el.dataset.k, { wahl: el.dataset.v === "auto" ? "fest" : el.dataset.v });
  };
  A.kpAlt = (el) => SB.audio.probeOld(el.dataset.v);

  A.quality = (el) => {
    S().settings.quality = el.dataset.q;
    UI.saveNow();
    UI.renderPanel();
    UI.toast("Gespeichert. Lade die Seite neu, um die Darstellung zu wechseln.", "", "einstellungen");
  };
  A.dayCycle = (el) => {
    S().settings.dayCycle = el.dataset.v;
    if (UI.hub) UI.hub.setDayCycle(el.dataset.v);
    UI.save();
    UI.renderPanel();
    UI.renderTop();
    UI.updateMusic();
  };
  A.fastFights = () => {
    S().settings.fastFights = !S().settings.fastFights;
    UI.save();
    UI.renderPanel();
  };
  A.exportSave = () => {
    UI.saveNow();
    const code = SB.store.exportCode(S());
    const d = UI.dialog('<h2>Spielstand-Code</h2><p class="muted">Kopiere diesen Code und bewahre ihn gut auf. Mit „Code laden“ holst du deinen Helden zurück.</p><textarea id="saveCode" rows="6" readonly></textarea><div class="actions"><button class="btn ghost" data-act="closeDialog">Schließen</button><button class="btn" data-act="copyCode">Kopieren</button></div>');
    d.querySelector("#saveCode").value = code;
  };
  A.copyCode = () => {
    const ta = document.getElementById("saveCode");
    const fallback = () => {
      ta.focus();
      ta.select();
      UI.toast("Markiert. Jetzt mit Strg+C oder lange tippen kopieren.", "");
    };
    try {
      navigator.clipboard.writeText(ta.value).then(() => UI.toast("Code kopiert.", "good"), fallback);
    } catch (e) {
      fallback();
    }
  };
  A.importSave = () => {
    UI.dialog('<h2>Code laden</h2><p class="muted">Füge deinen Spielstand-Code ein. Dein jetziger Held wird dabei ersetzt.</p><textarea id="loadCode" rows="6" data-autofocus></textarea><p class="delta-down" id="loadErr" hidden></p><div class="actions"><button class="btn ghost" data-act="closeDialog">Abbrechen</button><button class="btn" data-act="doImport">Laden</button></div>');
  };
  A.doImport = () => {
    const err = document.getElementById("loadErr");
    try {
      const st = SB.store.importCode(document.getElementById("loadCode").value);
      UI.closeDialog();
      SB.main.replaceState(st);
    } catch (e) {
      err.hidden = false;
      err.textContent = e.message || "Das hat nicht geklappt.";
    }
  };
  A.resetHero = (el) => {
    if (!el.dataset.sure) {
      UI.dialog("<h2>Wirklich neu beginnen?</h2><p>Dein Held <b>" + esc(S().name) + '</b> geht dabei verloren, außer du sicherst vorher den Spielstand als Code.</p><div class="actions"><button class="btn ghost" data-act="closeDialog">Behalten</button><button class="btn danger" data-act="resetHero" data-sure="1">Neu beginnen</button></div>');
      return;
    }
    UI.closeDialog();
    SB.main.newHero();
  };

  /* ================= Reichswahl fuer Helden aus Version 1 ================= */
  UI.showRealmChoice = function () {
    const s = S();
    const arch = E.archOf(s);
    const cards = Object.keys(D.REALMS)
      .map((r) => {
        const RM = D.REALMS[r];
        const C = D.CLASSES[E.CLASS_FOR[r][arch]];
        return '<button class="realmcard r-' + r + '" data-act="chooseRealm" data-r="' + r + '">' + I.realm(r) + "<h3>" + esc(RM.name) + '</h3><i>„' + esc(RM.motto) + "“</i><p>" + esc(RM.desc) + '</p><div class="muted small">Deine Klasse dort: <b>' + esc(C.name) + "</b>. " + esc(C.special.name) + ": " + esc(C.special.desc) + "</div></button>";
      })
      .join("");
    const d = UI.dialog('<h2>Die Welt hat sich verändert</h2><p>' + esc(D.LORE) + '</p><p><b>Wähle das Reich, für das ' + esc(s.name) + " kämpft.</b> Stufe, Gold, Ausrüstung und Erfolge bleiben erhalten.</p><div class=\"realmcards\">" + cards + "</div>", { cls: "wide" });
    d.parentNode.dataset.locked = "1";
  };
  A.chooseRealm = (el) => {
    const s = S();
    E.chooseRealm(s, el.dataset.r);
    UI.closeDialog();
    SB.audio.play("horn");
    UI.toast("Für " + D.REALMS[s.realm].name + "! Du bist jetzt " + D.CLASSES[s.cls].name + ".", "gold", "held");
    UI.saveNow();
    UI.refresh();
    UI.dialog('<h2>' + esc(D.CLASSES[s.cls].name) + "</h2><p>" + esc(D.CLASSES[s.cls].prolog) + '</p><div class="actions"><button class="btn" data-act="closeDialog">Auf geht es</button></div>');
  };
})();
