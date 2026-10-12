// Fabelbruch: Start, Spielschleife und Verdrahtung.
// Ablauf nach spielablauf.json loop: Profil -> Intro einmal -> Hauptmenü ->
// Knorz/Startwaffe -> Arena wählen -> Eintrittsdialog einmal -> Wellen 1-19
// mit Aufstiegen und Laden -> Bossdialog -> Welle 20 Boss -> Siegesdialog ->
// Ende nur nach erstem B10-Sieg -> Belohnung/Werkstatt.

import { loadData, D } from './data.js';
import { loadTexts, setLanguage, t } from './i18n.js';
import { initInput, pollMovement, pollGamepadUi, consumeDodge, consumePause, input } from './input.js';
import { loadOptions, saveOptions, save, persist } from './save.js';
import { setVolume, sfx } from './audio.js';
import { App } from './app.js';
import { Run } from './engine/run.js';
import { render, preloadArena } from './engine/render.js';
import { moveHero } from './engine/world.js';
import { buildHud, showHud, updateHud } from './ui/hud.js';
import { closeAllScreens, goBack as goBackScreen, currentScreenId, toast, el, screenRoot, showScreen } from './ui/dom.js';
import {
  loadingScreen, profileScreen, mainMenu, workshopScreen, arenaMapScreen, saveErrorDialog, btn,
} from './ui/screens.js';
import {
  dialogScene, pauseScreen, levelupScreen, shopScreen, victoryScreen, defeatScreen,
} from './ui/runscreens.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let lastTime = 0;

// Nur für Tests (README "Testwerkzeuge"): ?zeitraffer=4 beschleunigt die
// Kampfzeit, ?unverwundbar=1 schützt Knorz, ?testschaden=10 vervielfacht
// Heldenschaden. Im normalen Spiel ohne Parameter wirkungslos.
const DEV = new URLSearchParams(location.search);
const DEV_TIMESCALE = Math.min(10, Math.max(0.1, parseFloat(DEV.get('zeitraffer') || '1') || 1));
const DEV_INVULN = DEV.get('unverwundbar') === '1';
const DEV_DAMAGE = Math.min(100, Math.max(1, parseFloat(DEV.get('testschaden') || '1') || 1));

// ---------- Optionen ----------

function applyOptions(o) {
  App.options = { ...o };
  setLanguage(o.language);
  setVolume(o.audioVolume);
  document.documentElement.style.setProperty('--ui-scale', String(o.uiScale / 100));
  document.body.classList.toggle('reduced-motion', !!o.reducedMotion);
}

// ---------- Tutorials (einmal bei erster passender Situation) ----------

function maybeTutorial(id, params = {}) {
  if (!save.data || save.data.seenTutorials.includes(id)) return false;
  save.data.seenTutorials.push(id);
  if (!persist()) saveErrorDialog();
  showScreen('TUT', (root) => {
    const l = tLine(id, params);
    root.append(el('div', { class: 'screen overlay' },
      el('div', { class: 'modal' },
        el('div', { class: 'dialog-box', style: 'position: static; transform: none; width: auto' },
          el('div', { class: 'speaker', text: l.speaker || '' }),
          el('div', { class: 'text', text: l.text }),
          el('div', { class: 'controls' }, btn(t('ui.confirm'), () => { if (!goBackScreen()) closeAllScreens(); }, { cls: 'primary', defaultFocus: true })),
        ),
      ),
    ));
  });
  return true;
}
function tLine(id, params) {
  // kleine Hilfe, um line() ohne Importkonflikt zu nutzen
  const { line } = i18nRef;
  return line(id, params);
}
let i18nRef = null;

// ---------- Lauf starten / fortsetzen ----------

function makeRunEvents() {
  return {
    onWaveStart: (wave) => {
      if (wave === 1) {
        maybeTutorial('tutorial.move', { move_binding: 'WASD' })
          || maybeTutorial('tutorial.dodge', { dodge_binding: App.options.language === 'en' ? 'Space' : 'Leertaste' });
      }
    },
    onLevelup: () => {
      levelupScreen();
      maybeTutorial('tutorial.level'); // Tutorialfeld liegt über der Auswahl
    },
    onShop: () => {
      shopScreen();
      maybeTutorial('tutorial.shop');
    },
    onScene: (sceneId, done) => dialogScene(sceneId, done),
    onBossStart: (bossId) => {
      toast(t('ui.boss_warning'));
      maybeTutorial('tutorial.boss');
    },
    onVictory: (bossId, first) => {
      showHud(false);
      const sceneId = `${bossId}.victory`;
      const showV = () => {
        if (bossId === 'B10' && first) {
          dialogScene('ending', () => victoryScreen(bossId, first));
        } else {
          victoryScreen(bossId, first);
        }
      };
      if (first) dialogScene(sceneId, showV);
      else showV();
    },
    onDefeat: () => {
      showHud(false);
      maybeTutorial('tutorial.death');
      defeatScreen();
    },
    onDiscovery: (id) => toast(t('ui.new_entry')),
    onHeal: (amount) => toast(t('ui.heal', { amount })),
    onSaveError: () => saveErrorDialog(),
  };
}

function startRun(arenaId, startingWeaponId) {
  closeAllScreens();
  const run = new Run(makeRunEvents());
  App.run = run;
  run.startNew(arenaId, startingWeaponId);
  preloadArena(arenaId);
  showHud(true);
  const entryScene = `${arenaId}.entry`;
  dialogScene(entryScene, () => {
    run.beginWave();
  });
}

function resumeRun() {
  if (!save.data.run) return;
  closeAllScreens();
  const run = new Run(makeRunEvents());
  App.run = run;
  preloadArena(save.data.run.arenaId);
  showHud(true);
  run.restore(save.data.run);
}

// Kampf fortsetzen: Bildschirme schließt der Aufrufer; hier nur HUD zeigen.
// Wichtig: beginWave kann einen Bossdialog öffnen, der nicht weggeräumt
// werden darf.
function resumeCombat() {
  showHud(true);
}

function backToMenu(target) {
  App.run = null;
  showHud(false);
  closeAllScreens();
  mainMenu();
  if (target === 'workshop') workshopScreen();
  if (target === 'arenamap') {
    App.selectedArena = save.data.lastArena || App.selectedArena;
    arenaMapScreen();
  }
}

function quitGame() {
  // Letzter sicherer Zwischenstand bleibt erhalten; im Browser schließt das
  // Fenster nur, wenn es das Skript selbst geöffnet hat.
  persist();
  window.close();
  toast(t('ui.saved'));
}

// ---------- Spielschleife ----------

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
  lastTime = now;
  pollGamepadUi();

  const run = App.run;
  if (!run) return;

  const uiOpen = currentScreenId() !== null;
  const inCombat = (run.phase === 'fight' || run.phase === 'boss') && !uiOpen;

  if (inCombat) {
    const cdt = dt * DEV_TIMESCALE;
    if (DEV_INVULN) run.world.hero.hp = run.heroStats.maxHp;
    run.world.devDamageMul = DEV_DAMAGE;
    pollMovement();
    updateHeroControl(run, cdt);
    run.update(cdt);
    run.hazardView = run.hazard;
    if (consumePause()) {
      pauseScreen(() => {});
    }
    // Tutorials bei erster passender Situation
    if (run.world.monsters.some((m) => m.state === 'windup')) maybeTutorial('tutorial.warning');
    else if (run.world.monsters.some((m) => m.state === 'active')) maybeTutorial('tutorial.active');
    if (run.world.pickups.length > 0) maybeTutorial('tutorial.pickup');
    if (run.hazard.phase === 'warn') maybeTutorial('tutorial.arena');
  } else {
    consumePause();
    consumeDodge();
  }

  render(ctx, run.world, App.options);
  updateHud(run, App.options);
}

function updateHeroControl(run, dt) {
  const world = run.world;
  const hero = world.hero;
  const st = run.heroStats;

  if (hero.invuln > 0) hero.invuln -= dt;
  if (hero.dodgeCooldown > 0) hero.dodgeCooldown -= dt;

  let speed = st.moveSpeed;
  if (world.heroSlowUntil && world.time < world.heroSlowUntil) {
    speed *= Math.max(0, world.heroSlowFactor ?? 1);
  }

  if (hero.dodging > 0) {
    hero.dodging -= dt;
    const dodge = st.dodge;
    const dodgeSpeed = dodge.distance / dodge.duration;
    moveHero(world, hero.x + hero.dodgeDirX * dodgeSpeed * dt, hero.y + hero.dodgeDirY * dodgeSpeed * dt);
  } else {
    const mx = input.moveX;
    const my = input.moveY;
    hero.moving = mx !== 0 || my !== 0;
    if (hero.moving) {
      hero.lastDirX = mx;
      hero.lastDirY = my;
      moveHero(world, hero.x + mx * speed * dt, hero.y + my * speed * dt);
    }
    if (consumeDodge() && hero.dodgeCooldown <= 0) {
      const dx = hero.moving ? mx : hero.lastDirX;
      const dy = hero.moving ? my : hero.lastDirY;
      const len = Math.hypot(dx, dy) || 1;
      hero.dodging = st.dodge.duration;
      hero.dodgeDirX = dx / len;
      hero.dodgeDirY = dy / len;
      hero.dodgeCooldown = st.dodgeCooldown;
      sfx.dodge();
    }
  }
}

// ---------- Start ----------

async function boot() {
  applyOptions(loadOptions());
  initInput();
  buildHud();
  showHud(false);

  let progress = () => {};
  showScreen('UI25', (root) => { progress = loadingScreen(root); }, {}, { clearStack: true });

  // Gebündelte Auslieferung (packs/) zuerst auflösen; ohne Pakete ein No-Op.
  const { initAssetPack } = await import('./assetpack.js');
  await initAssetPack();

  i18nRef = await import('./i18n.js');
  await loadTexts();
  // Textfortschritt ist echt: 6 Fachdateien + Texte.
  await loadData((done, total, path) => progress(done, total, path.split('/').pop()));
  document.getElementById('loading-text')?.replaceChildren(document.createTextNode(t('ui.loading')));

  // App-Fassade füllen
  App.applyOptions = (o) => { applyOptions(o); saveOptions(App.options); };
  App.startRun = startRun;
  App.resumeRun = resumeRun;
  App.resumeCombat = resumeCombat;
  App.backToMenu = backToMenu;
  App.playScene = (id, done, opts) => dialogScene(id, done, opts || {});
  App.quitGame = quitGame;

  App.startingWeapon = 'W001';
  profileScreenWithDefaults();
  requestAnimationFrame((ts) => { lastTime = ts; requestAnimationFrame(frame); });
}

function profileScreenWithDefaults() {
  profileScreen();
}

boot().catch((err) => {
  console.error(err);
  const root = screenRoot();
  root.replaceChildren(el('div', { class: 'screen' },
    el('div', { class: 'loading-center' },
      el('h1', { text: 'FABELBRUCH' }),
      el('div', { class: 'hint', text: String(err) }),
    ),
  ));
});
