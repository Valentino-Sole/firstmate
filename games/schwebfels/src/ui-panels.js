/* Helden von Schwebfels - Panels der Gebaeude und ihre Aktionen. */
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
    hulda: ["Setz dich, Held. Die Aufträge hängen am Brett, das Bier steht hinter mir.", "Wer mit leerem Magen kämpft, kämpft halb so gut. Sagt meine Oma. Die hat nie gekämpft.", "Drei Aufträge, drei Abenteuer. Und alle drei schlecht bezahlt, aber ehrlich."],
    brumm: ["Hrmpf. Fass nichts an, was noch glüht.", "Gute Klinge, guter Preis. Billige Klinge, kurzes Leben.", "Ich schmiede seit dreihundert Jahren. Die ersten zweihundert waren Übung."],
    zinnober: ["Ah, ein Kunde! Oder ein Dieb? Bei dir bin ich mir noch nicht sicher.", "Alles hier ist magisch. Außer dem Staub. Wobei, der vielleicht auch.", "Dieser Ring hat einem König gehört. Oder einem Koch. Die Handschrift war schlecht."],
    krawall: ["WILLKOMMEN IN DER WOLKENARENA! Ich rufe immer so. Ich kann nicht anders.", "Das Publikum will Blut sehen. Oder wenigstens blaue Flecken.", "Ehre gewinnt man hier im Dutzend. Verlieren geht schneller."],
    funzel: ["Das Licht muss brennen. Immer. Ich mach das seit vierzig Jahren und habe nie geblinzelt.", "Wache halten ist einfach: Du schaust raus, die Wolken schauen rein.", "Zahle pro Schicht. Pünktlich. Meistens."],
    hufnagel: ["Pass auf, wo du hintrittst. Wolkenesel sind sauber, die Ziegen nicht.", "Mit einem Reittier bist du schneller am Auftrag und schneller wieder in der Taverne.", "Der Greif beißt nur Leute, die er nicht mag. Er mag niemanden."],
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
    return '<div class="say">' + (b.what === "quest" ? "Du bist gerade auf einem Auftrag unterwegs." : "Du schiebst gerade Wache am Leuchtturm.") + "</div>";
  };
  const estCache = new Map();
  function estimate(hero, foe, key) {
    const k = key + "|" + JSON.stringify(hero.attrs) + hero.wMin + "|" + hero.wMax + "|" + hero.armor + "|" + hero.prof.block;
    if (estCache.has(k)) return estCache.get(k);
    const v = E.estimateWin(hero, foe, 40, key);
    estCache.set(k, v);
    if (estCache.size > 200) estCache.delete(estCache.keys().next().value);
    return v;
  }
  function done(res) {
    if (res && res.ok === false && res.msg) {
      UI.toast(res.msg, "bad");
      return false;
    }
    return true;
  }

  /* ================= Taverne ================= */
  P.taverne = {
    render() {
      const s = S();
      const now = E.now();
      const en = E.energy(s, now);
      let h = say("hulda");
      h +=
        '<div class="row" style="margin-bottom:12px"><span class="gauge" style="padding-right:12px">' + UI.gauge(en, E.C.ENERGY_MAX) + "<span><small>Tatendrang</small>" + Math.floor(en) + " / " + E.C.ENERGY_MAX + "</span></span>" +
        (en < E.C.ENERGY_MAX ? '<span class="muted">+1 in <b class="num" data-until="' + (now + E.nextEnergyIn(s, now)) + '"></b></span>' : "") +
        '<span class="spacer"></span><button class="btn small" data-act="brew"' + (s.daily.brews >= E.C.BREW_MAX ? " disabled" : "") + ">Wolkenbräu +" + E.C.BREW_ENERGY + " · 1 " + I.ui("perle") + "</button></div>" +
        '<div class="muted" style="font-size:12.5px;margin:-6px 0 10px">Heute noch ' + (E.C.BREW_MAX - s.daily.brews) + " Krüge Wolkenbräu erhältlich.</div>";
      if (s.guard) return h + busyNote();
      const a = s.quest.active;
      if (a) {
        const o = a.offer;
        const mon = E.questMonster(o);
        const fin = a.end <= now;
        h +=
          '<div class="quest"><div class="mon">' + UI.portrait(UI.monDesc(mon), 128) + "</div><div><h3>" + esc(o.title) + "</h3><p>" + esc(o.text) + "</p>" +
          '<div class="progress"><i style="width:' + (fin ? 100 : (((now - a.start) / (a.end - a.start)) * 100).toFixed(1)) + '%"></i></div>' +
          '<div class="foot">' +
          (fin
            ? '<button class="btn big done-pulse" data-act="questFight">Kampf gegen ' + esc(mon.name) + "</button>"
            : '<span>Unterwegs nach ' + esc(o.place) + ': <b class="num" data-until="' + a.end + '"></b></span><span class="spacer"></span><button class="btn small" data-act="questSkip">Sofort ankommen · 1 ' + I.ui("perle") + "</button>") +
          "</div></div></div>";
        return h;
      }
      const hero = E.heroFighter(s, now);
      h += '<div class="quests">';
      s.quest.offers.forEach((o, i) => {
        const mon = E.questMonster(o);
        const c = estimate(hero, E.questFoe(o, hero), o.id);
        const dur = E.questDuration(s, o);
        h +=
          '<div class="quest"><div class="mon" title="' + esc(mon.name) + '">' + UI.portrait(UI.monDesc(mon), 128) + "</div><div><h3>" + esc(o.title) + "</h3><p>" + esc(o.text) + "</p>" +
          '<div class="meta">' + pips(o.diff) + "<span>" + E.DIFF[o.diff].name + "</span><span>" + I.ui("uhr") + " " + U.fmtTime(dur) + "</span><span>" + I.ui("tatendrang") + " " + o.energy + "</span>" + chanceTxt(c) + "</div>" +
          '<div class="rewards"><span>' + I.ui("xp") + ' <span class="num">' + U.fmt(o.xp) + "</span></span><span>" + UI.gold(o.gold) + "</span>" +
          (o.perle ? "<span>" + UI.perlen(o.perle) + "</span>" : "") +
          (o.item ? '<button type="button" class="mini-item r-' + o.item.rarity + '" data-item="offer:' + i + '" data-act="itemInfo" data-ref="offer:' + i + '" aria-label="' + esc(o.item.name) + '">' + I.item(o.item) + "</button>" : "") +
          '</div><div class="foot"><span class="muted">Ziel: ' + esc(o.place) + ' · Gegner: ' + esc(mon.name) + ' (Stufe ' + o.mlevel + ')</span><span class="spacer"></span><button class="btn" data-act="questStart" data-i="' + i + '"' + (en < o.energy ? " disabled" : "") + ">Aufbrechen</button></div></div></div>";
      });
      h += "</div>";
      if (en < 6) h += '<div class="say" style="margin-top:12px">Dein Tatendrang ist erschöpft. Ein Wolkenbräu hilft, oder du schiebst so lange Wache am Leuchtturm.</div>';
      return h;
    },
  };
  A.brew = () => {
    if (!done(E.buyBrew(S()))) return;
    SB.audio.play("coin");
    UI.toast("Hulda schenkt dir ein Wolkenbräu ein. Prost!", "good", "taverne");
    UI.refresh();
  };
  A.questStart = (el) => {
    if (!done(E.startQuest(S(), +el.dataset.i))) return;
    SB.audio.play("click");
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
    const mon = E.questMonster(offer);
    await UI.runBattle(fight, { setting: "quest", title: offer.title, rewards: rew, foeName: mon.name });
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
            const color = p.id === "baerenkraft" ? "#e0644f" : p.id === "eisenhaut" ? "#9aa4ad" : p.id === "glueckspilztee" ? "#74d86f" : "#c47bff";
            h +=
              '<div class="card"><div class="pic">' + I.potion(color) + "</div><div><h4>" + esc(p.name) + '</h4><div class="muted" style="font-size:13px">' + esc(p.desc) + "</div>" +
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
    let h = '<div class="section-title">' + I.ui("rucksack") + " " + (title || "Rucksack") + ' <span class="muted" style="font-family:var(--font-body);font-size:14px">' + s.inv.length + " / " + E.C.INV_SIZE + "</span></div>";
    h += '<div class="grid6">';
    for (let i = 0; i < E.C.INV_SIZE; i++) h += s.inv[i] ? UI.slotHtml(s.inv[i], "inv:" + i, { upgrade: true }) : '<div class="slot empty"></div>';
    return h + "</div>";
  }
  P.schmiede = shopPanel("schmiede", "brumm");
  P.arkanum = shopPanel("arkanum", "zinnober");
  A.reroll = (el) => {
    if (!done(E.rerollShop(S(), el.dataset.shop))) return;
    UI.refresh();
  };
  A.buy = (el) => {
    const res = E.buyItem(S(), el.dataset.shop, +el.dataset.i);
    if (!done(res)) return;
    SB.audio.play("buy");
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

  /* ================= Held ================= */
  P.heim = {
    head() {
      const s = S();
      return { title: s.name, role: D.RACES[s.race].name + " · " + D.CLASSES[s.cls].name + " · Stufe " + s.level, portrait: UI.heroPortrait(s) };
    },
    render() {
      const tab = UI.tabs.heim || "ausruestung";
      let h = '<div class="tabs">' + [["ausruestung", "Ausrüstung"], ["bestiarium", "Bestiarium"], ["abzeichen", "Abzeichen"]].map(([id, n]) => '<button class="tab' + (tab === id ? " on" : "") + '" data-act="tab" data-panel="heim" data-tab="' + id + '">' + n + "</button>").join("") + "</div>";
      if (tab === "bestiarium") return h + bestiary();
      if (tab === "abzeichen") return h + achievements();
      return h + sheet();
    },
    after(el) {
      const slot = el.querySelector("#heroViewSlot");
      if (slot) UI.attachHeroView(slot, UI.heroDesc(S()), "<b>" + esc(S().name) + "</b>");
    },
  };
  A.tab = (el) => {
    UI.tabs[el.dataset.panel] = el.dataset.tab;
    UI.renderPanel(true);
  };
  function sheet() {
    const s = S();
    const sum = E.heroSummary(s);
    const C = D.CLASSES[s.cls];
    const left = ["helm", "amulett", "ruestung", "umhang", "handschuhe"];
    const right = ["waffe", "nebenhand", "ring", "talisman", "stiefel"];
    const slotIcon = { helm: "held", amulett: "abzeichen", ruestung: "ruestung", umhang: "ruestung", handschuhe: "kraft", waffe: "schaden", nebenhand: "ruestung", ring: "perle", talisman: "glueck", stiefel: "geschick" };
    const col = (arr) => '<div class="col">' + arr.map((sl) => UI.slotHtml(s.equip[sl], "eq:" + sl, { emptyIcon: slotIcon[sl], label: D.SLOT_INFO[sl].name })).join("") + "</div>";
    let h = '<div class="sheet">' + col(left) + '<div class="heroview" id="heroViewSlot"></div>' + col(right) + "</div>";
    h += '<div class="section-title">Attribute <span class="muted" style="font-family:var(--font-body);font-size:13px">Gold: ' + UI.gold(s.gold) + "</span></div>";
    h += '<div class="row" style="margin-bottom:8px"><span class="muted">Kaufmenge</span>' + [1, 5, 10].map((q) => '<button class="tab' + (UI.qty === q ? " on" : "") + '" data-act="qty" data-q="' + q + '">×' + q + "</button>").join("") + "</div>";
    h += '<div class="attrs">';
    for (const a of D.ATTRS) {
      let cost = 0;
      for (let i = 0; i < UI.qty; i++) cost += E.attrCost(s.bought[a] + i);
      h +=
        '<div class="attr' + (a === C.main ? " main" : "") + '" title="' + esc(D.ATTR_INFO[a].desc) + '">' + I.ui(a) + "<div><div>" + D.ATTR_INFO[a].name + (a === C.main ? ' <span class="tag">Hauptwert</span>' : "") + '</div><div class="cost">' + UI.gold(cost) + "</div></div>" +
        '<span class="val num">' + U.fmt(sum.attrs[a]) + '</span><button class="btn plus" data-act="attr" data-a="' + a + '"' + (s.gold < E.attrCost(s.bought[a]) ? " disabled" : "") + ' aria-label="' + D.ATTR_INFO[a].name + ' erhöhen">+</button></div>';
    }
    h += "</div>";
    const mount = D.MOUNTS.filter((m) => s.mounts.owned.indexOf(m.id) >= 0).sort((a, b) => b.cut - a.cut)[0];
    h +=
      '<div class="stats"><div><span>' + I.ui("konstitution") + ' Lebenspunkte</span><b class="num">' + U.fmt(sum.hp) + "</b></div>" +
      "<div><span>" + I.ui("schaden") + ' Schaden</span><b class="num">' + U.fmt(sum.dmgMin) + " bis " + U.fmt(sum.dmgMax) + "</b></div>" +
      "<div><span>" + I.ui("ruestung") + ' Rüstung</span><b class="num">' + U.fmt(sum.armor) + " (" + Math.round(sum.reduction * 100) + " %)</b></div>" +
      "<div><span>" + I.ui("glueck") + ' Kritisch</span><b class="num">' + Math.round(sum.crit * 100) + " %</b></div>" +
      "<div><span>" + I.ui(s.cls === "klinge" ? "ruestung" : "geschick") + " " + (s.cls === "klinge" ? "Block" : s.cls === "wind" ? "Ausweichen" : "Zauber") + '</span><b class="num">' + (s.cls === "klinge" ? Math.round(sum.block * 100) + " %" : s.cls === "wind" ? Math.round(sum.evade * 100) + " %" : "unaufhaltsam") + "</b></div>" +
      "<div><span>" + I.ui("ehre") + ' Ehre</span><b class="num">' + U.fmt(s.honor) + "</b></div>" +
      "<div><span>" + I.ui("stall") + ' Reittier</span><b>' + (mount ? esc(mount.name) : "keins") + "</b></div>" +
      "<div><span>" + I.ui("xp") + ' Erfahrung</span><b class="num">' + U.fmt(s.xp) + " / " + U.fmt(E.xpNeed(s.level)) + "</b></div></div>";
    h += '<div class="muted" style="font-size:13px;margin-top:8px">Spezialangriff jede vierte Aktion: <b>' + esc(C.special.name) + "</b>. " + esc(C.special.desc) + "</div>";
    const buffs = E.activeBuffs(s);
    if (buffs.length) h += '<div class="muted" style="font-size:13px;margin-top:6px">Aktive Tränke: ' + buffs.map((b) => esc(D.POTIONS.find((p) => p.id === b.id).name) + ' (<span class="num" data-until="' + b.until + '"></span>)').join(", ") + "</div>";
    h += invSection();
    return h;
  }
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
  function bestiary() {
    const s = S();
    const all = D.MONSTERS.map((m) => ({ id: m.id, name: m.name, desc: UI.monDesc(m) }));
    D.DUNGEONS.forEach((d) =>
      d.bosses.forEach((b, i) => all.push({ id: d.id + "-" + i, name: b.name, desc: UI.monDesc(b, true, b.final) }))
    );
    const found = all.filter((m) => s.bestiary[m.id]).length;
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
      h += '<div class="ach' + (got ? "" : " locked") + '">' + I.ui("abzeichen") + "<div><b>" + esc(a.name) + '</b><div class="muted" style="font-size:13px">' + esc(a.desc) + "</div></div><span>" + (got ? "✓ " : "") + "+" + a.perlen + " " + I.ui("perle") + "</span></div>";
    }
    return h;
  }

  /* ================= Arena ================= */
  P.arena = {
    render() {
      const s = S();
      const now = E.now();
      const remote = SB.remoteHeroes || null;
      const all = E.allHeroes(s, now, remote);
      const me = all.find((h) => h.kind === "me");
      let h = say("krawall");
      h += '<div class="row" style="margin-bottom:10px"><span class="chip">' + I.ui("ehre") + " " + U.fmt(s.honor) + ' Ehre</span><span class="chip">Platz ' + me.rank + " von " + all.length + "</span>" + '<span class="chip">' + s.arena.wins + " Siege</span></div>";
      if (remote && remote.length) h += '<div class="muted" style="font-size:13px;margin-bottom:8px">' + remote.length + " echte Mitspieler sind in der Rangliste. Sie erkennst du am Zeichen „Spieler“.</div>";
      const busy = E.busy(s, now);
      if (busy) h += busyNote();
      else if (s.arena.next > now)
        h += '<div class="say">Nächster Kampf in <b class="num" data-until="' + s.arena.next + '"></b>. <button class="btn small" data-act="arenaSkip">Sofort · 1 ' + I.ui("perle") + "</button></div>";
      const rivals = E.arenaRivals(s, now, remote);
      const hero = E.heroFighter(s, now);
      h += '<div class="section-title">Herausforderer</div><div class="cards">';
      rivals.forEach((r) => {
        const f = r.fighter || E.npcFighter(r);
        const c = estimate(hero, f, "arena" + r.id + r.level);
        h +=
          '<div class="card"><div class="pic">' + UI.portrait(UI.fighterDesc(f), 128, true) + "</div><div><h4>" + esc(r.name) + (r.kind === "real" ? ' <span class="tag">Spieler</span>' : "") + "</h4>" +
          '<div class="muted" style="font-size:13px">' + I.classCrest(r.cls) + " " + D.CLASSES[r.cls].name + " · Stufe " + r.level + " · Platz " + r.rank + " · " + U.fmt(r.honor) + " Ehre</div>" + chanceTxt(c) + "</div>" +
          '<button class="btn" data-act="arenaFight" data-id="' + esc(r.id) + '"' + (busy || s.arena.next > now ? " disabled" : "") + ">Herausfordern</button></div>";
      });
      h += "</div>";
      return h;
    },
  };
  A.arenaSkip = () => {
    if (!done(E.skipArena(S()))) return;
    UI.refresh();
  };
  A.arenaFight = async (el) => {
    const s = S();
    const now = E.now();
    const opp = E.allHeroes(s, now, SB.remoteHeroes || null).find((h) => h.id === el.dataset.id);
    if (!opp) return;
    const res = E.arenaFight(s, opp, now);
    if (!done(res)) return;
    const rew = E.resolveArena(s, res.fight, now);
    UI.saveNow();
    await UI.runBattle(res.fight, { setting: "arena", title: "Wolkenarena", rewards: rew, foeName: opp.name });
    UI.refresh();
  };

  /* ================= Leuchtturm ================= */
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
          '<div class="progress"><i style="width:' + (fin ? 100 : (((now - g.start) / (g.end - g.start)) * 100).toFixed(1)) + '%"></i></div>' +
          '<div class="row" style="margin-top:8px">Lohn: ' + UI.gold(g.pay) + '<span class="spacer"></span>' +
          (fin ? '<button class="btn" data-act="guardCollect">Lohn abholen</button>' : '<span>noch <b class="num" data-until="' + g.end + '"></b></span><button class="btn small ghost" data-act="guardCancel">Abbrechen</button>') +
          "</div></div></div>";
        return h;
      }
      if (s.quest.active) return h + busyNote();
      const pay = E.shiftPay(s);
      h +=
        '<div class="section-title">Wache übernehmen</div><p class="muted">Eine Schicht dauert ' + E.C.SHIFT_MS / 60000 + " Minuten und bringt " + UI.gold(pay) + ". Während der Wache kannst du keine Aufträge annehmen und nicht kämpfen.</p>" +
        '<label for="shiftRange" class="row"><b>' + UI.shifts + " Schichten</b><span class=\"muted\">(" + (UI.shifts * E.C.SHIFT_MS) / 60000 + " Minuten)</span><span class=\"spacer\"></span>Lohn: " + UI.gold(pay * UI.shifts) + "</label>" +
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
    UI.toast("Funzel drückt dir eine Laterne in die Hand.", "", "leuchtturm");
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
    portrait: () => '<span style="display:grid;place-items:center;height:100%">' + I.ui("tiefen") + "</span>",
    render() {
      const s = S();
      const now = E.now();
      let h = '<div class="say">Unter den Wolken liegen Orte, die niemand freiwillig betritt. Jeder Boss lässt beim ersten Sieg garantiert seltene Beute fallen.</div>';
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
          info = '<div class="muted" style="font-size:13px">Öffnet sich ab Stufe ' + dg.unlock + (d > 0 ? " und nach dem ersten Boss des vorigen Dungeons" : "") + ".</div>";
        } else if (st.done) {
          pic = UI.portrait(UI.monDesc(dg.bosses[7], true, true), 128);
          info = '<div style="font-size:13px" class="delta-up">Gesäubert! Alle acht Bosse besiegt.</div>';
        } else {
          const b = E.bossFor(d, st.cleared);
          const foe = E.monsterFighter(b.mon, b.L, b.power, { boss: true, final: b.final });
          const c = estimate(hero, foe, b.mon.id);
          pic = UI.portrait(UI.monDesc(b.mon, true, b.final), 128);
          info = '<div style="font-size:13px">Boss ' + (st.cleared + 1) + "/8: <b>" + esc(b.mon.name) + "</b> · Stufe " + b.L + "</div>" + chanceTxt(c);
          btn = '<button class="btn" data-act="dungeonFight" data-d="' + d + '"' + (busy || s.dungeons.next > now ? " disabled" : "") + ">Angreifen</button>";
        }
        h +=
          '<div class="card' + (st.unlocked ? "" : " locked") + '"><div class="pic">' + pic + "</div><div><h4>" + esc(dg.name) + '</h4><div class="muted" style="font-size:12.5px">' + esc(dg.desc) + "</div>" +
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
    await UI.runBattle(res.fight, { setting: "dungeon", tint: D.DUNGEONS[d].theme, title: D.DUNGEONS[d].name, rewards: rew, foeName: res.fight.boss.mon.name });
    UI.refresh();
  };

  /* ================= Stall ================= */
  P.stall = {
    render() {
      const s = S();
      let h = say("hufnagel");
      h += '<div class="muted" style="margin-bottom:10px">Reittiere verkürzen die Reisezeit zu jedem Auftrag dauerhaft. Es zählt immer dein schnellstes Tier.</div><div class="cards">';
      const colors = { esel: "#c9d2d8", ziege: "#e8d6b0", greif: "#e0b04a", wal: "#4f8fd8" };
      for (const m of D.MOUNTS) {
        const owned = s.mounts.owned.indexOf(m.id) >= 0;
        const cost = m.cost.gold ? UI.gold(m.cost.gold) : UI.perlen(m.cost.perlen);
        h +=
          '<div class="card"><div class="pic"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="' + colors[m.id] + '" stroke="#1c1626" stroke-width="2.4"/><text x="32" y="40" text-anchor="middle" font-size="22" font-weight="800" fill="#1c1626" font-family="sans-serif">-' + Math.round(m.cut * 100) + "%</text></svg></div>" +
          "<div><h4>" + esc(m.name) + '</h4><div class="muted" style="font-size:13px">' + esc(m.desc) + "</div></div>" +
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

  /* ================= Ruhmeshalle ================= */
  P.ruhmeshalle = {
    role: "Die Besten von Schwebfels",
    portrait: () => '<span style="display:grid;place-items:center;height:100%">' + I.ui("ruhm") + "</span>",
    render() {
      const s = S();
      const all = E.allHeroes(s, E.now(), SB.remoteHeroes || null);
      const me = all.find((h) => h.kind === "me");
      const rows = [];
      const show = new Set();
      for (let i = 0; i < Math.min(10, all.length); i++) show.add(i);
      for (let i = Math.max(0, me.rank - 6); i < Math.min(all.length, me.rank + 5); i++) show.add(i);
      let prev = -1;
      [...show].sort((a, b) => a - b).forEach((i) => {
        if (prev >= 0 && i > prev + 1) rows.push('<tr class="gap"><td colspan="5">⋯</td></tr>');
        prev = i;
        const h = all[i];
        rows.push(
          "<tr" + (h.kind === "me" ? ' class="me"' : ' data-act="heroInfo" data-id="' + esc(h.id) + '"') + '><td class="num">' + h.rank + "</td><td>" + esc(h.name) + (h.kind === "real" ? ' <span class="tag">Spieler</span>' : "") + (h.kind === "me" ? ' <span class="tag">Du</span>' : "") + "</td><td>" + I.classCrest(h.cls) + '</td><td class="num">' + h.level + '</td><td class="num">' + U.fmt(h.honor) + "</td></tr>"
        );
      });
      return '<div class="muted" style="margin-bottom:8px">Ehre gibt es in der Wolkenarena. Klick auf einen Namen für Details.</div><table class="fame"><thead><tr><th>Platz</th><th>Held</th><th>Klasse</th><th>Stufe</th><th>Ehre</th></tr></thead><tbody>' + rows.join("") + "</tbody></table>";
    },
  };
  A.heroInfo = (el) => {
    const s = S();
    const h = E.allHeroes(s, E.now(), SB.remoteHeroes || null).find((x) => x.id === el.dataset.id);
    if (!h) return;
    const f = h.fighter || E.npcFighter(h);
    const hp = f.maxHp;
    UI.dialog(
      '<div class="row" style="align-items:flex-start"><span class="porthole" style="width:96px;height:96px">' + UI.portrait(UI.fighterDesc(f), 160, true) + '</span><div><h2 style="margin:0">' + esc(h.name) + "</h2>" +
        '<div class="muted">' + D.RACES[h.race].name + " · " + D.CLASSES[h.cls].name + " · Stufe " + h.level + "</div><div>Platz " + h.rank + " · " + U.fmt(h.honor) + " Ehre</div></div></div>" +
        '<div class="stats"><div><span>Lebenspunkte</span><b class="num">' + U.fmt(hp) + "</b></div>" + D.ATTRS.map((a) => "<div><span>" + I.ui(a) + " " + D.ATTR_INFO[a].name + '</span><b class="num">' + U.fmt(f.attrs[a]) + "</b></div>").join("") + "</div>" +
        '<div class="actions"><button class="btn ghost" data-act="closeDialog">Schließen</button><button class="btn" data-act="openArena">Zur Arena</button></div>'
    );
  };
  A.openArena = () => {
    UI.closeDialog();
    UI.openPanel("arena");
  };

  /* ================= Wunschbrunnen ================= */
  const COIN_FRONT =
    '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><path d="M14 40 C8 40 8 31 15 30 C15 22 26 20 29 26 C32 18 46 19 46 28 C54 27 56 38 49 40 Z" fill="#fff3c4" stroke="#6a4d18" stroke-width="3" stroke-linejoin="round"/><path d="M22 46 L42 46 M26 51 L38 51" stroke="#6a4d18" stroke-width="3" stroke-linecap="round"/></svg>';
  UI.lastWell = null;
  P.brunnen = {
    role: "Ein Wurf am Tag ist frei",
    portrait: () => '<span style="display:grid;place-items:center;height:100%">' + I.ui("brunnen") + "</span>",
    render() {
      const s = S();
      const free = s.daily.wellFree > 0;
      let h = '<div class="say">Man sagt, der Brunnen erfüllt Wünsche. Meistens wünscht er sich allerdings Münzen.</div>';
      h += '<div class="well"><div class="coin" id="coin"><div class="face">' + COIN_FRONT + '</div><div class="face back">' + I.ui("perle") + "</div></div></div>";
      h += '<div class="row" style="justify-content:center">' + (free ? '<button class="btn big" data-act="well">Kostenlos werfen</button>' : '<button class="btn big" data-act="well"' + (s.daily.wellPaid >= E.C.WELL_PAID_MAX ? " disabled" : "") + ">Werfen · 1 " + I.ui("perle") + "</button>") + "</div>";
      h += '<p class="muted" style="text-align:center">' + (free ? "Dein freier Wurf für heute wartet." : "Weitere Würfe heute: " + (E.C.WELL_PAID_MAX - s.daily.wellPaid)) + "</p>";
      if (UI.lastWell) h += '<div class="say" style="text-align:center;font-style:normal" id="wellResult">' + UI.lastWell + "</div>";
      h += '<div class="section-title">Mögliche Gaben</div><ul class="muted" style="margin:0;padding-left:20px">' + D.WELL_PRIZES.map((p) => "<li>" + esc(p.label) + "</li>").join("") + "</ul>";
      return h;
    },
  };
  A.well = () => {
    const s = S();
    const res = E.tossWell(s);
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
  };

  /* ================= Einstellungen ================= */
  P.einstellungen = {
    title: "Einstellungen",
    role: "Spielstand und Darstellung",
    portrait: () => '<span style="display:grid;place-items:center;height:100%">' + I.ui("einstellungen") + "</span>",
    render() {
      const s = S();
      const q = s.settings.quality;
      let h = '<div class="section-title">Darstellung</div><div class="row">' + [["hoch", "3D mit Schatten"], ["niedrig", "3D schlicht"], ["aus", "Ohne 3D"]].map(([id, n]) => '<button class="tab' + (q === id ? " on" : "") + '" data-act="quality" data-q="' + id + '">' + n + "</button>").join("") + "</div>";
      h += '<p class="muted" style="font-size:13px">Die Änderung wird nach dem Neuladen der Seite wirksam.</p>';
      h += '<div class="section-title">Kämpfe</div><div class="row"><button class="tab' + (s.settings.fastFights ? " on" : "") + '" data-act="fastFights">Kämpfe standardmäßig doppelt so schnell</button></div>';
      h += '<div class="section-title">Ton</div><div class="row"><button class="tab' + (s.settings.sound ? " on" : "") + '" data-act="toggleSound">Klangeffekte ' + (s.settings.sound ? "an" : "aus") + "</button></div>";
      h += '<div class="section-title">Spielstand</div><p class="muted" style="font-size:13px">' + (SB.store.cloud ? "Dein Spielstand wird in diesem Browser und privat in deinem claude.ai-Konto gespeichert." : "Dein Spielstand wird in diesem Browser gespeichert. Sichere ihn als Code, wenn du das Gerät wechseln willst.") + "</p>";
      h += '<div class="row"><button class="btn ghost" data-act="exportSave">Spielstand als Code</button><button class="btn ghost" data-act="importSave">Code laden</button><span class="spacer"></span><button class="btn danger small" data-act="resetHero">Neuen Helden beginnen</button></div>';
      h += '<div class="section-title">Über das Spiel</div><p class="muted" style="font-size:13px">Helden von Schwebfels ist ein eigenständiges Browser-Rollenspiel. Alle Figuren, Texte, Symbole und 3D-Modelle sind eigens dafür entstanden. Die 3D-Darstellung nutzt die Bibliothek three.js.</p>';
      return h;
    },
  };
  A.quality = (el) => {
    S().settings.quality = el.dataset.q;
    UI.saveNow();
    UI.renderPanel();
    UI.toast("Gespeichert. Lade die Seite neu, um die Darstellung zu wechseln.", "", "einstellungen");
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
      UI.dialog('<h2>Wirklich neu beginnen?</h2><p>Dein Held <b>' + esc(S().name) + "</b> geht dabei verloren, außer du sicherst vorher den Spielstand als Code.</p><div class=\"actions\"><button class=\"btn ghost\" data-act=\"closeDialog\">Behalten</button><button class=\"btn danger\" data-act=\"resetHero\" data-sure=\"1\">Neu beginnen</button></div>");
      return;
    }
    UI.closeDialog();
    SB.main.newHero();
  };
})();
