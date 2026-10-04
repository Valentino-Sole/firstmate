/* Helden von Schwebfels - Oberflaechen-Kern: Leisten, Panels, Tooltips, Hinweise, Zeitgeber. */
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
  UI.tabs = {};
  UI.qty = 1;
  UI.ACTIONS = {};
  UI.PANELS = {};
  const $ = (sel, root) => (root || document).querySelector(sel);
  UI.$ = $;
  const esc = U.esc;

  /* ---------- Portraits ---------- */
  UI.NPC_LOOK = {
    hulda: { race: "wolkling", gender: "w", cls: "rune", look: { skin: "#e8b48f", hair: "#c9532f", hairStyle: 3, beard: 0 }, gear: { ruestung: { base: "robe", tint: "#e9dcc0", style: 0 } } },
    brumm: { race: "steinbart", gender: "m", cls: "klinge", look: { skin: "#c99878", hair: "#9b3d24", hairStyle: 4, beard: 2 }, gear: { ruestung: { base: "harnisch", tint: "#5a4a3a", style: 0 }, handschuhe: { base: "handschuhe", tint: "#4a3a30" } } },
    zinnober: { race: "nebelalb", gender: "w", cls: "rune", look: { skin: "#e9e0f2", hair: "#c7a6e0", hairStyle: 2, beard: 0 }, gear: { helm: { base: "hut", tint: "#8f3f8f", rarity: "episch" }, ruestung: { base: "robe", tint: "#5b3fa8", style: 1 } } },
    funzel: { race: "wolkling", gender: "m", cls: "wind", look: { skin: "#e8b48f", hair: "#e8e2d6", hairStyle: 4, beard: 3 }, gear: { helm: { base: "kappe", tint: "#ffcf3a" }, ruestung: { base: "wams", tint: "#ffcf3a" } } },
    krawall: { race: "hornvolk", gender: "w", cls: "klinge", look: { skin: "#8f5c8c", hair: "#1f1f24", hairStyle: 2, beard: 0 }, gear: { helm: { base: "helm", tint: "#c9a441", style: 2 }, ruestung: { base: "harnisch", tint: "#c0392b", style: 1 }, umhang: { base: "umhang", tint: "#c9a441" } } },
    hufnagel: { race: "moosling", gender: "w", cls: "wind", look: { skin: "#a9c98f", hair: "#6aa84f", hairStyle: 3, beard: 0 }, gear: { ruestung: { base: "wams", tint: "#8a5a35" } } },
    ottilie: { race: "wolkling", gender: "w", cls: "klinge", look: { skin: "#dba27a", hair: "#3b2a20", hairStyle: 2, beard: 0 }, gear: { helm: { base: "kappe", tint: "#2f4f8f" }, ruestung: { base: "harnisch", tint: "#2f4f8f", style: 2 }, umhang: { base: "umhang", tint: "#c0392b" } } },
  };
  UI.heroDesc = (S) => ({ kind: "hero", race: S.race, cls: S.cls, gender: S.gender, look: S.look, gear: E.gearVisual(S.equip) });
  UI.fighterDesc = function (f) {
    if (f.kind === "monster") return { kind: "monster", arch: f.arch, color: f.color, accent: f.accent, boss: !!f.boss, final: !!f.final };
    return { kind: "hero", race: f.race, cls: f.cls, gender: f.gender, look: f.look, gear: f.gear };
  };
  UI.monDesc = (m, boss, final) => ({ kind: "monster", arch: m.arch, color: m.color, accent: m.accent, boss: !!boss, final: !!final });
  UI.portrait = function (desc, size, bust) {
    const url = UI.use3d ? SB.R3D.snapshot(desc, size || 128, bust) : null;
    if (url) return '<img alt="" src="' + url + '">';
    return I.silhouette(desc.kind === "monster" ? desc.color : desc.gear && desc.gear.ruestung ? desc.gear.ruestung.tint : "#7f8a96", desc.kind);
  };
  UI.npcPortrait = (id) => (UI.NPC_LOOK[id] ? UI.portrait(Object.assign({ kind: "hero" }, UI.NPC_LOOK[id]), 128, true) : "");
  UI.heroPortrait = (S) => UI.portrait(UI.heroDesc(S), 128, true);

  /* ---------- Speichern ---------- */
  let saveTimer = 0;
  UI.save = function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => SB.store.save(UI.S), 300);
  };
  UI.saveNow = function () {
    clearTimeout(saveTimer);
    SB.store.save(UI.S);
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
    const col = pct < 0.15 ? "#ff7a59" : pct < 0.4 ? "#f3d08a" : "#52d1b4";
    let ticks = "";
    for (let i = 0; i <= 4; i++) {
      const t = Math.PI * (1 - i / 4);
      ticks += '<path d="M' + (cx + Math.cos(t) * 15.5).toFixed(1) + " " + (cy - Math.sin(t) * 15.5).toFixed(1) + " L" + (cx + Math.cos(t) * 17.5).toFixed(1) + " " + (cy - Math.sin(t) * 17.5).toFixed(1) + '" stroke="#dcaa4a" stroke-width="1.3"/>';
    }
    return (
      '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18.5" fill="#0a141b" stroke="#dcaa4a" stroke-width="2"/>' +
      ticks +
      '<path d="M7 23 A13 13 0 0 1 33 23" fill="none" stroke="#24414d" stroke-width="4" stroke-linecap="round"/>' +
      (pct > 0.005 ? '<path d="M7 23 A13 13 0 0 1 ' + ex + " " + ey + '" fill="none" stroke="' + col + '" stroke-width="4" stroke-linecap="round"/>' : "") +
      '<path d="M20 23 L' + nx + " " + ny + '" stroke="#f3ead6" stroke-width="2" stroke-linecap="round"/><circle cx="20" cy="23" r="2.6" fill="#dcaa4a" stroke="#1c1626" stroke-width="1"/>' +
      '<text x="20" y="35.5" text-anchor="middle" font-size="7" font-weight="800" fill="#f3ead6" font-family="sans-serif">' + Math.floor(val) + "</text></svg>"
    );
  };

  /* ---------- Toasts ---------- */
  UI.toast = function (text, kind, icon) {
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
  SB.bus.on("levelup", (p) => {
    UI.toast("Stufe " + p.level + " erreicht! Eine Wolkenperle als Belohnung.", "gold", "xp");
    SB.audio.play("levelup");
    if (UI.hub) UI.hub.cheer();
  });
  SB.bus.on("achievement", (a) => {
    UI.toast("Abzeichen „" + a.name + "“: +" + a.perlen + (a.perlen === 1 ? " Wolkenperle" : " Wolkenperlen"), "gold", "abzeichen");
  });
  SB.bus.on("remote", () => {
    if (UI.panelId === "arena" || UI.panelId === "ruhmeshalle") UI.renderPanel();
  });

  /* ---------- Gegenstands-Karten ---------- */
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
  UI.itemCard = function (it, opts) {
    opts = opts || {};
    const S = UI.S;
    const R = D.RARITIES[it.rarity];
    const lines = [];
    if (it.min) lines.push(["schaden", "Schaden", U.fmt(it.min) + " bis " + U.fmt(it.max)]);
    if (it.armor) lines.push(["ruestung", "Rüstung", U.fmt(it.armor)]);
    for (const a of D.ATTRS) if (it.stats[a]) lines.push([a, D.ATTR_INFO[a].name, "+" + U.fmt(it.stats[a])]);
    let cmp = "";
    const cur = S && S.equip[it.slot];
    if (opts.compare !== false && cur && cur !== it && E.canEquip(S, it)) {
      const parts = [];
      const diff = (label, a, b) => {
        const d = Math.round(a - b);
        if (d) parts.push('<span class="' + (d > 0 ? "delta-up" : "delta-down") + '">' + (d > 0 ? "+" : "") + U.fmt(d) + " " + label + "</span>");
      };
      if (it.min || cur.min) diff("Ø Schaden", ((it.min || 0) + (it.max || 0)) / 2, ((cur.min || 0) + (cur.max || 0)) / 2);
      if (it.armor || cur.armor) diff("Rüstung", it.armor || 0, cur.armor || 0);
      for (const a of D.ATTRS) diff(D.ATTR_INFO[a].name, it.stats[a] || 0, cur.stats[a] || 0);
      cmp = '<div class="cmp"><div class="muted">Im Vergleich zu „' + esc(cur.name) + "“:</div>" + (parts.length ? parts.join(", ") : "gleichwertig") + "</div>";
    } else if (opts.compare !== false && it.cls && S && it.cls !== S.cls) {
      cmp = '<div class="cmp delta-down">Nur für ' + esc(D.CLASSES[it.cls].name) + "</div>";
    }
    return (
      '<div class="itemcard"><h4 class="t-' + it.rarity + '">' + esc(it.name) + '</h4><div class="kind">' + R.name + " · " + UI.slotName(it) + " · Stufe " + it.level + (it.cls ? " · " + D.CLASSES[it.cls].name : "") + "</div><ul>" +
      lines.map((l) => "<li><span>" + I.ui(l[0]) + " " + l[1] + '</span><b class="num">' + l[2] + "</b></li>").join("") +
      "</ul>" + cmp + (opts.price ? '<div class="cmp">' + opts.price + "</div>" : "") + "</div>"
    );
  };
  UI.slotHtml = function (it, ref, extra) {
    extra = extra || {};
    if (!it) return '<div class="slot empty">' + (extra.emptyIcon ? I.ui(extra.emptyIcon) : "") + (extra.label ? '<span class="slot-name">' + extra.label + "</span>" : "") + "</div>";
    return (
      '<button type="button" class="slot r-' + it.rarity + '" data-item="' + ref + '" data-act="' + (extra.act || "itemInfo") + '" data-ref="' + ref + '" aria-label="' + esc(it.name) + '">' +
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
    UI.dialog(UI.itemCard(it, { price }) + '<div class="actions"><button class="btn ghost" data-act="closeDialog">Schließen</button>' + actions + "</div>");
  };

  /* ---------- Kopfleiste und Dock ---------- */
  const DOCK = [
    ["heim", "held", "Held"],
    ["taverne", "taverne", "Taverne"],
    ["schmiede", "schmiede", "Schmiede"],
    ["arkanum", "arkanum", "Kurios."],
    ["arena", "arena", "Arena"],
    ["leuchtturm", "leuchtturm", "Wache"],
    ["tiefen", "tiefen", "Dungeons"],
    ["stall", "stall", "Stall"],
    ["ruhmeshalle", "ruhm", "Ruhm"],
    ["brunnen", "brunnen", "Brunnen"],
  ];
  let lastPortraitKey = "";
  UI.renderTop = function () {
    const S = UI.S;
    const top = $("#topbar");
    if (!top) return;
    const need = E.xpNeed(S.level);
    const en = E.energy(S);
    const key = JSON.stringify(UI.heroDesc(S));
    if (!top.dataset.built) {
      top.innerHTML =
        '<div class="logo">Schwebfels</div>' +
        '<button class="me-chip" data-act="open" data-id="heim" aria-label="Dein Held"><span class="porthole" id="mePortrait"></span><span class="me-meta"><span class="me-name"></span><span class="me-sub"></span><span class="xpbar"><i></i></span></span></button>' +
        '<div class="res"><span class="chip" title="Gold" id="resGold"></span><span class="chip" title="Wolkenperlen" id="resPerl"></span><span class="gauge" title="Tatendrang" id="resEnergy"></span><span class="chip hon" title="Ehre" id="resHonor"></span>' +
        '<button class="iconbtn" data-act="toggleSound" id="soundBtn" aria-label="Ton an oder aus"></button><button class="iconbtn" data-act="open" data-id="einstellungen" aria-label="Einstellungen">' + I.ui("einstellungen") + "</button></div>";
      top.dataset.built = "1";
    }
    if (key !== lastPortraitKey) {
      lastPortraitKey = key;
      $("#mePortrait").innerHTML = UI.heroPortrait(S);
      if (UI.hub) UI.hub.setHero(UI.heroDesc(S));
    }
    top.querySelector(".me-name").textContent = S.name;
    top.querySelector(".me-sub").textContent = innerWidth <= 520 ? "Stufe " + S.level : "Stufe " + S.level + " · " + D.CLASSES[S.cls].name;
    top.querySelector(".xpbar i").style.width = Math.min(100, (S.xp / need) * 100).toFixed(1) + "%";
    top.querySelector(".xpbar").title = U.fmt(S.xp) + " / " + U.fmt(need) + " Erfahrung";
    $("#resGold").innerHTML = I.ui("gold") + '<span class="num">' + U.fmtShort(S.gold) + "</span>";
    $("#resPerl").innerHTML = I.ui("perle") + '<span class="num">' + U.fmt(S.perlen) + "</span>";
    $("#resEnergy").innerHTML = UI.gauge(en, E.C.ENERGY_MAX) + "<span><small>Tatendrang</small>" + Math.floor(en) + "</span>";
    $("#resHonor").innerHTML = I.ui("ehre") + '<span class="num">' + U.fmt(S.honor) + "</span>";
    $("#soundBtn").innerHTML = I.ui(S.settings.sound ? "ton" : "stumm");
  };

  UI.badges = function () {
    const S = UI.S;
    const now = E.now();
    const b = {};
    const a = S.quest.active;
    if (a && a.end <= now) b.taverne = "!";
    else if (!E.busy(S, now) && S.quest.offers.some((o) => E.energy(S, now) >= o.energy)) b.taverne = "3";
    if (S.guard && S.guard.end <= now) b.leuchtturm = "✓";
    if (!E.busy(S, now) && S.arena.next <= now) b.arena = "!";
    if (S.daily.wellFree > 0) b.brunnen = "1";
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
    if (S.gold >= E.attrCost(S.bought[C.main]) || S.inv.some((it) => UI.isUpgrade(it))) b.heim = "+";
    return b;
  };
  UI.renderDock = function () {
    const dock = $("#dock");
    if (!dock) return;
    const b = UI.badges();
    dock.innerHTML = DOCK.map(
      ([id, ic, label]) =>
        '<button class="dock-btn' + (UI.panelId === id ? " active" : "") + '" data-act="open" data-id="' + id + '">' + I.ui(ic) + "<span>" + label + "</span>" + (b[id] ? '<span class="badge">' + b[id] + "</span>" : "") + "</button>"
    ).join("");
    if (UI.hub) UI.hub.setBadges(b);
    UI.renderFallbackStage(b);
  };
  UI.renderFallbackStage = function (b) {
    const fb = $(".stage-fallback .fb-grid");
    if (!fb) return;
    fb.innerHTML = D.BUILDINGS.map((bd) => {
      const ic = (DOCK.find((d) => d[0] === bd.id) || [0, "held"])[1];
      return '<button data-act="open" data-id="' + bd.id + '">' + I.ui(ic) + "<b>" + esc(bd.name) + "</b>" + (b[bd.id] ? '<span class="tag">' + b[bd.id] + "</span>" : "") + "</button>";
    }).join("");
  };

  /* Aktivitaetsanzeige ueber dem Dock */
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
      html = I.ui(done ? "arena" : "uhr") + '<div class="act-text"><div class="act-title">' + (done ? "Auftrag erledigt: Der Kampf wartet!" : esc(a.offer.title)) + '</div><div class="progress"><i style="width:' + pct.toFixed(1) + '%"></i></div></div>' + (done ? '<span class="btn small">Kämpfen</span>' : '<b class="num" data-until="' + a.end + '"></b>');
    } else if (S.guard) {
      const g = S.guard;
      done = g.end <= now;
      const pct = done ? 100 : ((now - g.start) / (g.end - g.start)) * 100;
      target = "leuchtturm";
      html = I.ui("leuchtturm") + '<div class="act-text"><div class="act-title">' + (done ? "Wache beendet: Lohn abholen" : "Wache am Leuchtturm") + '</div><div class="progress"><i style="width:' + pct.toFixed(1) + '%"></i></div></div>' + (done ? '<span class="btn small">Abholen</span>' : '<b class="num" data-until="' + g.end + '"></b>');
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
  };

  /* ---------- Panels ---------- */
  UI.openPanel = function (id) {
    if (!UI.PANELS[id]) return;
    SB.audio.unlock();
    SB.audio.play("click");
    UI.panelId = id;
    document.body.classList.add("panel-open");
    const P = $("#panel");
    P.hidden = false;
    P.dataset.id = id;
    UI.renderPanel(true);
    if (UI.hub) {
      UI.hub.focus(id === "einstellungen" ? null : id);
      const wide = innerWidth > 860;
      UI.hub.setInset(wide ? P.offsetWidth + 24 : 0);
      if (!wide) UI.hub.pause();
    }
    UI.renderDock();
    UI.renderActivity();
    UI.checkHint();
  };
  UI.closePanel = function () {
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
  };
  UI.ACTIONS.open = (el) => {
    const id = el.dataset.id;
    if (!id) return;
    if (UI.panelId === id && !el.closest("#activity")) UI.closePanel();
    else UI.openPanel(id);
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
      const celebrate = !!heroViewKey;
      heroViewKey = k;
      heroView.set(desc, celebrate);
    }
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

  /* ---------- Hinweise von Kaept'n Ottilie ---------- */
  const TUT = [
    { when: () => true, text: (S) => "Willkommen an Bord, " + S.name + "! Ich bin Käpt'n Ottilie, Hafenmeisterin von Schwebfels. In der Taverne „Zur Schiefen Möwe“ warten deine ersten Aufträge.", btn: "Zur Taverne", act: () => UI.openPanel("taverne"), panel: "taverne" },
    { when: () => UI.panelId === "taverne" && !UI.S.quest.active, text: () => "Jeder Auftrag kostet Tatendrang, der sich mit der Zeit wieder auffüllt. Achte auf die Siegchance: Gemütliche Aufträge sind sicher, halsbrecherische bringen mehr Beute.", btn: "Verstanden" },
    { when: () => UI.S.stats.quests >= 1 && !UI.S.quest.active, text: () => "Gut gemacht! Gold steckst du am besten in deine Attribute. Klick oben auf dein Portrait oder unten auf „Held“.", btn: "Zum Quartier", act: () => UI.openPanel("heim"), panel: "heim" },
    { when: () => UI.S.stats.quests >= 3, text: () => "Brumms Schmiede und Zinnobers Kuriositäten verkaufen bessere Ausrüstung. Ein grüner Pfeil zeigt dir, was besser ist als dein jetziger Kram.", btn: "Verstanden" },
    { when: () => UI.S.level >= 3, text: () => "Kein Tatendrang mehr? Wache am Leuchtturm bringt Gold, in der Arena gibt es Ehre, und der Wunschbrunnen schenkt dir jeden Tag einen Wurf.", btn: "Leinen los!" },
    { when: () => UI.S.level >= 10, text: () => "Stufe 10! Das Tor zur Tiefe hat sich geöffnet. Dort warten Bosse mit seltener und epischer Beute.", btn: "Ab in die Tiefe", act: () => UI.openPanel("tiefen"), panel: "tiefen" },
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
    if (!step || !step.when() || !$("#battle").hidden) {
      box.hidden = true;
      return;
    }
    if (box.dataset.step === String(S.tut) && !box.hidden) return;
    box.dataset.step = String(S.tut);
    box.innerHTML = '<span class="porthole">' + UI.npcPortrait("ottilie") + '</span><div><p></p><button class="btn small" data-act="hintNext">' + step.btn + '</button> <button class="btn small ghost" data-act="hintSkip">Keine Tipps mehr</button></div>';
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
    UI.checkHint();
    UI.save();
  };

  /* Sekundentakt: Zeitgeber, Zustandswechsel */
  let lastState = "";
  UI.tick = function () {
    const S = UI.S;
    if (!S) return;
    const now = E.now();
    E.tick(S, now);
    const qDone = !!(S.quest.active && S.quest.active.end <= now);
    const gDone = !!(S.guard && S.guard.end <= now);
    const aReady = S.arena.next <= now;
    const dReady = S.dungeons.next <= now;
    const st = [qDone, gDone, aReady, dReady, Math.floor(E.energy(S, now))].join("|");
    if (st !== lastState) {
      const prev = lastState.split("|");
      if (lastState) {
        if (qDone && prev[0] === "false") {
          UI.toast("Auftrag erledigt! Der Kampf wartet in der Taverne.", "good", "arena");
          SB.audio.play("coin");
        }
        if (gDone && prev[1] === "false") UI.toast("Deine Wache ist vorbei. Funzel hat deinen Lohn bereit.", "good", "leuchtturm");
      }
      lastState = st;
      UI.renderTop();
      UI.renderDock();
      UI.renderActivity();
      if (UI.panelId && (prev[0] !== String(qDone) || prev[1] !== String(gDone) || prev[2] !== String(aReady) || prev[3] !== String(dReady))) UI.renderPanel();
    } else {
      UI.renderTop();
      const box = $("#activity");
      if (box && !box.hidden) {
        const a = S.quest.active || S.guard;
        const bar = box.querySelector(".progress i");
        if (a && bar) bar.style.width = Math.min(100, ((now - a.start) / (a.end - a.start)) * 100).toFixed(1) + "%";
      }
    }
    UI.updateTimers();
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
    if (!$("#battle") || !$("#battle").hidden) return;
    if (!$("#modal").hidden) UI.closeDialog();
    else if (UI.panelId) UI.closePanel();
  });
  document.addEventListener("click", (ev) => {
    if (ev.target && ev.target.id === "modal" && !ev.target.dataset.locked) UI.closeDialog();
  });

  UI.ACTIONS.toggleSound = function () {
    UI.S.settings.sound = !UI.S.settings.sound;
    SB.audio.enabled = UI.S.settings.sound;
    UI.renderTop();
    UI.save();
  };
})();
