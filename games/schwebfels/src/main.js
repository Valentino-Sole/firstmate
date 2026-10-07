/* Helden von Schwebfels - Start, Spielstand-Wechsel, Cloud-Abgleich. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const UI = SB.ui;
  const E = SB.engine;
  const M = (SB.main = {});
  let ticker = 0;

  function shell() {
    const app = document.getElementById("app");
    app.innerHTML =
      '<div id="stage"></div><header id="topbar"></header><nav id="dock" aria-label="Orte auf Schwebfels"></nav>' +
      '<div id="activity" role="button" tabindex="0" hidden></div><section id="panel" hidden></section><div id="hint" hidden></div>';
  }

  function teardown() {
    clearInterval(ticker);
    if (UI.hub) UI.hub.dispose();
    UI.hub = null;
    UI.disposeHeroView();
    UI.panelId = null;
    UI.closeDialog();
    const app = document.getElementById("app");
    app.innerHTML = "";
  }

  // Heimatinsel: das gemalte Inselbild des Reiches, falls vorhanden und nicht abgewaehlt, sonst die 3D-Insel
  M.makeHub = function (S) {
    const stage = document.getElementById("stage");
    if (!stage) return;
    if (UI.hub) UI.hub.dispose();
    UI.hub = null;
    stage.innerHTML = "";
    const opts = { quality: S.settings.quality, dayCycle: S.settings.dayCycle || "zyklus", homeTier: S.house.tier, realm: S.realm, onPick: (id) => (UI.panelId === id ? UI.closePanel() : UI.openPanel(id)) };
    if (SB.hubPainted && SB.hubPainted.has(S.realm) && S.settings.island !== "3d") {
      try {
        UI.hub = SB.hubPainted.create(stage, opts);
      } catch (e) {
        console.warn("Gemalte Insel nicht verfuegbar", e);
        UI.hub = null;
      }
    }
    if (!UI.hub && UI.use3d) {
      try {
        UI.hub = SB.R3D.createHub(stage, opts);
      } catch (e) {
        console.warn("3D-Insel nicht verfuegbar", e);
        UI.hub = null;
      }
    }
    if (!UI.hub) stage.innerHTML = '<div class="stage-fallback"><div class="fb-grid"></div></div>';
  };

  M.start = function (S) {
    UI.S = S;
    SB.audio.setSfx(S.settings.sound !== false);
    SB.audio.setMusic(S.settings.music !== false);
    UI.use3d = S.settings.quality !== "aus" && SB.R3D.ready();
    shell();
    M.makeHub(S);
    E.tick(S);
    UI.refresh();
    clearInterval(ticker);
    ticker = setInterval(UI.tick, 1000);
    UI.saveNow();
    UI.updateMusic();
    // Helden aus Version 1 waehlen beim ersten Start ihr Reich
    if (S.migratedFrom) setTimeout(() => UI.showRealmChoice(), 400);
  };

  M.replaceState = function (S) {
    S = E.migrate(S);
    if (!S) return;
    UI.closeCreate();
    teardown();
    M.start(S);
  };

  M.newHero = function () {
    teardown();
    SB.store.clearLocal();
    UI.S = null;
    UI.use3d = SB.R3D.ready();
    UI.showCreate((st) => M.start(st));
  };

  M.boot = function (saved) {
    const S = saved ? E.migrate(saved) : null;
    if (S) M.start(S);
    else {
      UI.use3d = SB.R3D.ready();
      UI.showCreate((st) => M.start(st));
    }
    // Spielstand im claude.ai-Konto abgleichen, falls verfuegbar
    SB.store.initCloud((cloud) => {
      const local = UI.S;
      if (cloud && E.migrate(cloud) && (!local || (cloud.savedAt || 0) > (local.savedAt || 0) + 2000)) {
        M.replaceState(cloud);
        UI.toast("Spielstand aus deinem Konto geladen.", "good", "rucksack");
      } else if (local) {
        SB.store.saveCloud(local);
        SB.store.publishHero(local);
      }
    });
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && UI.S) {
      SB.store.save(UI.S);
      SB.store.flush(UI.S);
    }
  });
  window.addEventListener("pagehide", () => {
    if (UI.S) SB.store.saveLocal(UI.S);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target && ev.target.id === "activity") ev.target.click();
  });

  const claude = globalThis.claude;
  const hot = claude && claude.hot;
  if (hot && typeof hot.snapshot === "function") hot.snapshot(() => ({ save: UI.S ? JSON.stringify(UI.S) : null }));
  const start = (data) => {
    let saved = null;
    if (data && data.save) {
      try {
        saved = JSON.parse(data.save);
      } catch (e) {
        saved = null;
      }
    }
    // Modellpaket zuerst entpacken (dauert nur einen Augenblick), danach starten
    const go = () => M.boot(saved || SB.store.loadLocal());
    if (SB.assets && SB.assets.load) SB.assets.load().then(go, go);
    else go();
  };
  if (hot && typeof hot.ready === "function") hot.ready(start);
  else start((hot && hot.data) || {});
})();
