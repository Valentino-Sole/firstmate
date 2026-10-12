// Menü- und Metabildschirme: UI01 Hauptmenü, UI02 Profil, UI03 Knorz,
// UI04 Bezirkskarte, UI10 Bestiarium, UI11 Werkstatt, UI14 Einstellungen,
// UI15 Hilfe, UI16 Mitwirkende, UI21 Bestätigung, UI25 Laden, UI26 Speicherfehler.
// Struktur und Zustände folgen data/ui-spezifikation.json; Texte ausschließlich
// aus den Textdateien; Werte aus den Fachdateien.

import { el, showScreen, replaceScreen, goBack, toast, attachTooltip, svgIcon, refreshScreen } from './dom.js';
import {
  t, line, getLanguage, monsterName, monsterText, bossName, bossText, bossPhaseText,
  arenaName, arenaText, familyName, workshopName, workshopEffect, weaponName, heroSubtitle,
} from '../i18n.js';
import { D } from '../data.js';
import { save, listProfiles, createProfile, openProfile, deleteProfile, persist, saveOptions } from '../save.js';
import { App } from '../app.js';
import { sfx } from '../audio.js';

// ---------- Gemeinsame Bausteine ----------

export function header(title, meta = '') {
  return el('div', { class: 'screen-header' },
    el('span', { class: 'brand', text: 'FABELBRUCH' }),
    el('h1', { text: title }),
    meta ? el('span', { class: 'meta', text: meta }) : null,
  );
}

export function footerHints(...extra) {
  return el('div', { class: 'screen-footer' },
    el('span', { class: 'hint', text: 'ESC ' + t('ui.back') }),
    el('span', { class: 'spacer' }),
    ...extra,
  );
}

export function btn(label, onClick, opts = {}) {
  const b = el('button', {
    class: `btn ${opts.cls || ''}`,
    text: label,
    'data-focus': '1',
    onclick: () => { if (!b.disabled) onClick(); },
  });
  if (opts.defaultFocus) b.setAttribute('data-default-focus', '1');
  if (opts.back) b.setAttribute('data-back-action', '1');
  if (opts.disabled) b.disabled = true;
  if (opts.icon) b.prepend(svgIcon(opts.icon));
  return b;
}

// UI21: Bestätigungsdialog; Fokus immer auf Abbrechen, kurze Eingabesperre
// gegen durchgereichte Kampftasten.
export function confirmDialog({ title, body, confirmLabel, onConfirm, danger = true, detail = null }) {
  showScreen('UI21', (root) => {
    root.append(el('div', { class: 'screen overlay' },
      el('div', { class: 'modal' },
        el('h2', { text: title }),
        el('div', { class: 'body', text: body }),
        detail ? el('div', { class: 'detail', text: detail }) : null,
        el('div', { class: 'row' },
          btn(t('ui.cancel'), () => goBack(), { defaultFocus: true, back: true }),
          btn(confirmLabel, () => { goBack(); onConfirm(); }, { cls: danger ? 'danger' : 'primary' }),
        ),
      ),
    ));
  });
  import('./dom.js').then((m) => m.lockInput(250));
}

// UI26: Speicherfehler; Erfolg wird nie vorgetäuscht.
export function saveErrorDialog() {
  showScreen('UI26', (root) => {
    root.append(el('div', { class: 'screen overlay' },
      el('div', { class: 'modal' },
        el('h2', { text: t('ui.save_error') }),
        el('div', { class: 'row' },
          btn(t('ui.save_retry'), () => {
            if (persist()) { toast(t('ui.saved')); goBack(); }
            else refreshScreen();
          }, { defaultFocus: true, cls: 'primary' }),
          btn(t('ui.back'), () => goBack(), { back: true }),
        ),
        save.lastError ? el('div', { class: 'detail', text: String(save.lastError) }) : null,
      ),
    ));
  });
}

// ---------- UI25: Ladebildschirm ----------

export function loadingScreen(root) {
  const bar = el('div');
  root.append(el('div', { class: 'screen' },
    el('div', { class: 'loading-center' },
      el('h1', { text: 'FABELBRUCH' }),
      el('div', { class: 'hint', id: 'loading-text', text: '' }),
      el('div', { class: 'bar', style: 'width: 36em' }, bar),
    ),
  ));
  return (done, total, label) => {
    // Nur echten Fortschritt zeigen (UI25-Regel).
    bar.style.width = `${(done / total) * 100}%`;
    const tnode = document.getElementById('loading-text');
    if (tnode) tnode.textContent = label || '';
  };
}

// ---------- UI02: Profil wählen ----------

export function profileScreen() {
  replaceScreen('UI02', (root) => {
    const body = el('div', { class: 'screen-body' });
    const row = el('div', { class: 'card-row' });
    const profiles = listProfiles();
    profiles.forEach((p, i) => {
      const number = i + 1;
      const card = el('div', { class: 'card', 'data-focus': '1', tabindex: '0' });
      card.append(el('h3', { text: t('ui.profile', { number }) }));
      if (p) {
        card.append(
          el('div', { class: 'note', text: `${t('ui.memories', { count: p.memories })}` }),
          el('div', { class: 'note', text: `${p.firstVictories.length} / 10 · ${p.discoveredMonsters.length} / 100` }),
          el('button', {
            class: 'cta', text: t('ui.choose'), 'data-focus': '1', onclick: (e) => { e.stopPropagation(); selectProfile(number); },
          }),
          el('button', {
            class: 'cta', text: t('ui.profile_delete'), 'data-focus': '1', onclick: (e) => { e.stopPropagation(); deleteFlow(number); },
          }),
        );
        card.onclick = () => selectProfile(number);
      } else {
        card.append(
          el('div', { class: 'note', text: t('ui.empty') }),
          el('button', { class: 'cta', text: t('ui.profile_new'), 'data-focus': '1', onclick: (e) => { e.stopPropagation(); newProfile(number); } }),
        );
        card.onclick = () => newProfile(number);
      }
      if (i === 0) card.setAttribute('data-default-focus', '1');
      row.append(card);
    });
    body.append(row);
    root.append(el('div', { class: 'screen' }, header(t('ui.profile', { number: '' }).replace(/\s+$/, '')), body));
  });

  function selectProfile(number) {
    if (!openProfile(number)) { saveErrorDialog(); return; }
    App.startingWeapon = save.data.startingWeapon || 'W001';
    App.selectedArena = save.data.lastArena || 'AR01';
    mainMenu();
  }
  function newProfile(number) {
    if (!createProfile(number)) { saveErrorDialog(); return; }
    // Intro einmal pro Profil, danach Hauptmenü.
    App.playScene('intro', () => mainMenu());
  }
  function deleteFlow(number) {
    // Löschen nur nach namentlicher Bestätigung (UI02-Zustand).
    const name = `Profil ${number}`;
    const input = el('input', { class: 'btn', style: 'width: 100%', 'data-focus': '1' });
    showScreen('UI02_delete', (root) => {
      root.append(el('div', { class: 'screen overlay' },
        el('div', { class: 'modal' },
          el('h2', { text: t('ui.profile_delete') }),
          el('div', { class: 'body', text: t('ui.profile_delete_body', { profile: name }) }),
          input,
          el('div', { class: 'row' },
            btn(t('ui.cancel'), () => goBack(), { defaultFocus: true, back: true }),
            btn(t('ui.profile_delete'), () => {
              if (input.value.trim() === name) {
                deleteProfile(number);
                goBack();
                profileScreen();
              } else {
                toast(t('ui.profile_delete_body', { profile: name }));
              }
            }, { cls: 'danger' }),
          ),
        ),
      ));
    });
  }
}

// ---------- UI01: Hauptmenü ----------

export function mainMenu() {
  replaceScreen('UI01', (root) => {
    const hasRun = !!save.data.run;
    const panel = el('div', { class: 'menu-panel' },
      btn(t('ui.continue'), () => App.resumeRun(), {
        disabled: !hasRun, defaultFocus: hasRun, icon: 'assets/symbole/seal.svg',
      }),
      btn(t('ui.new_run'), () => knorzScreen(), { defaultFocus: !hasRun, icon: 'assets/symbole/seal.svg' }),
      btn(t('ui.workshop'), () => workshopScreen(), { icon: 'assets/symbole/heart.svg' }),
      btn(t('ui.bestiary'), () => bestiaryScreen(), { icon: 'assets/symbole/book.svg' }),
      btn(t('ui.settings'), () => settingsScreen(), { icon: 'assets/symbole/eye.svg' }),
    );
    if (!hasRun) {
      panel.append(el('div', { class: 'hint', text: t('ui.no_save') }));
    }
    root.append(el('div', { class: 'screen menu-screen' },
      el('div', { class: 'menu-bg', style: "background-image:url('assets/ui/startbildschirm.webp')" }),
      el('div', { class: 'menu-title' },
        el('h1', { text: t('ui.title') }),
        el('div', { class: 'sub', text: t('ui.subtitle') }),
      ),
      panel,
      el('div', { class: 'menu-corner left' },
        btn(t('ui.quit'), () => confirmDialog({
          title: t('ui.quit_confirm'),
          body: t('ui.quit_body'),
          confirmLabel: t('ui.quit'),
          onConfirm: () => App.quitGame(),
        }), { back: true }),
      ),
      el('div', { class: 'menu-corner right' },
        el('span', { class: 'hud-panel', text: t('ui.profile', { number: save.profileNumber }) }),
      ),
    ));
  });
}

// ---------- UI03: Knorz ausrüsten ----------

export function knorzScreen() {
  showScreen('UI03', (root) => {
    const body = el('div', { class: 'screen-body', style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 2em; align-items: center;' });
    body.append(
      el('div', { style: 'text-align: center' },
        el('img', { src: 'assets/held/knorz.webp', style: 'max-height: 48vh', alt: 'Knorz' }),
        el('h2', { text: D.design.hero.name }),
        el('div', { class: 'hint', text: heroSubtitle() }),
      ),
      el('div', {},
        el('div', { class: 'kv' },
          el('div', { class: 'k', text: t('ui.inventory') }),
          el('div', { class: 'v', text: `${weaponName(App.startingWeapon)}` }),
        ),
        el('div', { style: 'display: flex; flex-direction: column; gap: 1em; max-width: 26em' },
          btn(weaponName(App.startingWeapon) + ' …', () => startingWeaponScreen(), { defaultFocus: true }),
          btn(arenaName(App.selectedArena || save.data.lastArena || 'AR01') + ' →', () => arenaMapScreen(), { cls: 'primary' }),
        ),
      ),
    );
    root.append(el('div', { class: 'screen' },
      header(D.design.hero.name, heroSubtitle()),
      body,
      footerHints(btn(t('ui.back'), () => goBack(), { back: true })),
    ));
  });
}

// Startwaffenwahl (UI09_starting_weapon_selection): nur W001 und Signaturwaffen
// bereits erstmals besiegter Bosse; keine Verkäufe/Fusion in diesem Modus.
export function startingWeaponScreen() {
  showScreen('UI09start', (root) => {
    const ids = ['W001'];
    for (const bossId of save.data.firstVictories) {
      const run = D.ablauf.runs.find((r) => r.waves[19].boss_id === bossId);
      if (run) ids.push(run.boss_reward_weapon_id);
    }
    const grid = el('div', { class: 'slot-grid', style: 'grid-template-columns: repeat(4, 1fr)' });
    for (const id of ids) {
      const chosen = App.startingWeapon === id;
      const cell = el('div', {
        class: `slot ${chosen ? 'selected' : ''}`,
        'data-focus': '1', tabindex: '0',
        onclick: () => {
          App.startingWeapon = id;
          save.data.startingWeapon = id;
          if (!persist()) saveErrorDialog();
          goBack();
        },
      },
        el('img', { src: `assets/waffen/${id}.webp`, alt: '' }),
        el('b', { text: weaponName(id) }),
        chosen ? el('span', { class: 'tier', text: '✓' }) : null,
      );
      if (chosen) cell.setAttribute('data-default-focus', '1');
      grid.append(cell);
    }
    root.append(el('div', { class: 'screen' },
      header(t('ui.inventory'), weaponName(App.startingWeapon)),
      el('div', { class: 'screen-body' }, grid),
      footerHints(btn(t('ui.back'), () => goBack(), { back: true })),
    ));
  });
}

// ---------- UI04: Bezirkskarte ----------

export function arenaMapScreen() {
  let selected = App.selectedArena || save.data.lastArena || 'AR01';
  showScreen('UI04', (root) => render(root), {});
  function render(root) {
    const grid = el('div', { class: 'arena-grid' });
    for (const a of D.arenen.arenas) {
      const unlocked = save.data.unlockedArenas.includes(a.id);
      const done = save.data.firstVictories.includes(a.boss_id);
      const tile = el('button', {
        class: `arena-tile ${unlocked ? '' : 'locked'} ${done ? 'done' : ''} ${selected === a.id ? 'selected' : ''}`,
        'data-focus': '1',
        onclick: () => { selected = a.id; App.selectedArena = unlocked ? a.id : App.selectedArena; rerender(); },
      },
        el('img', { src: `assets/arenen/${a.id}.webp`, alt: '' }),
        el('span', { class: 'label' },
          el('b', { text: unlocked ? arenaName(a.id) : '???' }),
          el('span', { text: unlocked ? familyName(a.family_id) : lockHint(a) }),
        ),
      );
      if (selected === a.id) tile.setAttribute('data-default-focus', '1');
      grid.append(tile);
    }
    const a = D.arenasById.get(selected);
    const unlocked = save.data.unlockedArenas.includes(a.id);
    const detail = el('div', { class: 'arena-detail' },
      el('div', {},
        el('h2', { text: unlocked ? arenaName(a.id) : '???' }),
        el('div', { class: 'hint', text: unlocked ? `„${arenaText(a.id, 'failed_wish')}“` : lockHint(a) }),
        unlocked ? el('div', { class: 'kv', style: 'margin-top: 0.8em' },
          el('div', { class: 'k', text: familyName(a.family_id) }),
          el('div', { class: 'v', text: `${bossName(a.boss_id)} · ${arenaText(a.id, 'hazard_name')}` }),
          el('div', { class: 'hint', text: arenaText(a.id, 'hazard_desc') }),
        ) : null,
      ),
      el('div', { style: 'display: flex; flex-direction: column; gap: 1em; justify-content: center' },
        btn(t('ui.new_run'), () => App.startRun(a.id, App.startingWeapon), { cls: 'primary', disabled: !unlocked }),
      ),
    );
    root.append(el('div', { class: 'screen' },
      header(t('ui.new_run'), t('ui.memories', { count: save.data.memories })),
      el('div', { class: 'screen-body' }, grid, detail),
      footerHints(btn(t('ui.back'), () => goBack(), { back: true })),
    ));
  }
  function rerender() {
    refreshScreen();
  }
  function lockHint(a) {
    const order = D.arenen.arenas.map((x) => x.id);
    const prev = D.arenen.arenas[order.indexOf(a.id) - 1];
    return prev ? t('ui.locked_arena', { boss: bossName(prev.boss_id) }) : '';
  }
}

// ---------- UI11: Brassas Werkstatt ----------

export function workshopScreen() {
  showScreen('UI11', (root) => {
    const grid = el('div', { class: 'workshop-grid' });
    for (const p of D.ablauf.workshop) {
      const rank = save.data.workshop[p.id] || 0;
      const maxed = rank >= p.max_rank;
      const cost = maxed ? null : p.cost_per_rank[rank];
      const afford = cost !== null && save.data.memories >= cost;
      const perk = el('div', { class: 'perk' },
        el('h3', { text: workshopName(p.id) }),
        el('div', { class: 'ranks', text: `${rank} / ${p.max_rank}` }),
        el('div', { text: workshopEffect(p.id) }),
        el('div', { class: 'cost', text: maxed ? '—' : t('ui.memories', { count: cost }) }),
        btn(maxed ? t('ui.merge_max') : t('ui.buy', { price: cost }), () => {
          save.data.workshop[p.id] = rank + 1;
          save.data.memories -= cost;
          if (!persist()) { saveErrorDialog(); return; }
          sfx.buy();
          refreshScreen();
        }, { disabled: maxed || !afford, cls: 'primary' }),
        !maxed && !afford ? el('div', { class: 'hint', text: t('ui.no_money', { missing: cost - save.data.memories }) }) : null,
      );
      grid.append(perk);
    }
    root.append(el('div', { class: 'screen' },
      header(t('ui.workshop'), t('ui.memories', { count: save.data.memories })),
      el('div', { class: 'screen-body' },
        el('div', { style: 'display: grid; grid-template-columns: 1fr 2fr; gap: 2em; align-items: start' },
          el('img', { src: 'assets/held/begleiter.webp', style: 'width: 100%; border-radius: 10px; border: 2px solid var(--line)', alt: '' }),
          grid,
        ),
      ),
      footerHints(btn(t('ui.back'), () => goBack(), { back: true, defaultFocus: true })),
    ));
  });
}

// ---------- UI10: Bestiarium ----------

export function bestiaryScreen() {
  let filter = null;
  let newIds = App._newBestiary || new Set();
  showScreen('UI10', (root) => render(root));
  // Erstes Öffnen: Szene archive.first über dem Bestiarium zeigen.
  if (!save.data.seenScenes.includes('archive.first')) {
    App.playScene('archive.first', () => {});
  }

  function render(root) {
    const families = el('div', { class: 'family-list' },
      btn(t('ui.bestiary'), () => { filter = null; refreshScreen(); }, { defaultFocus: true }),
      ...D.design.families.map((f) => btn(familyName(f.id), () => { filter = f.id; refreshScreen(); })),
      // Erinnerungsbuch: gesehene Szenen erneut lesen (Fleck verwaltet
      // Erinnerungen und Bestiarium; UI17-Zustand "Wiederholung im Erinnerungsbuch").
      btn(t('ui.dialog_log'), () => memoryBook()),
    );
    const grid = el('div', { class: 'besti-grid' });
    const list = D.design.monsters.filter((m) => !filter || m.family_id === filter);
    for (const m of list) {
      const discovered = save.data.discoveredMonsters.includes(m.id);
      const cell = el('div', {
        class: `besti-cell ${discovered ? '' : 'undiscovered'}`,
        'data-focus': '1', tabindex: '0',
        onclick: () => discovered && detail(m.id),
      },
        el('img', { src: `assets/monster/${m.id}_idle.webp`, loading: 'lazy', alt: '' }),
        el('span', { class: 'nm', text: discovered ? monsterName(m.id) : t('ui.unseen') }),
        newIds.has(m.id) ? el('span', { class: 'new-chip', text: '!' }) : null,
      );
      grid.append(cell);
    }
    // Bossreihe anhängen
    for (const b of D.design.bosses) {
      if (filter && b.family_id !== filter) continue;
      const discovered = save.data.discoveredBosses.includes(b.id);
      grid.append(el('div', {
        class: `besti-cell ${discovered ? '' : 'undiscovered'}`,
        'data-focus': '1', tabindex: '0',
        onclick: () => discovered && bossDetail(b.id),
      },
        el('img', { src: `assets/boss/${b.id}.webp`, loading: 'lazy', alt: '' }),
        el('span', { class: 'nm', text: discovered ? bossName(b.id) : t('ui.unseen') }),
      ));
    }
    root.append(el('div', { class: 'screen' },
      header(t('ui.bestiary'), `${save.data.discoveredMonsters.length} / 100`),
      el('div', { class: 'screen-body' }, el('div', { class: 'besti-layout' }, families, grid)),
      footerHints(btn(t('ui.back'), () => goBack(), { back: true })),
    ));
  }

  // UI10_detail: Karte, Beschreibung, Vorbereitung, Diagramm, Ausweichregel,
  // dazu einfache Posen-Ansicht (Animationssteuerung der Zwischenlösung).
  function detail(id) {
    newIds.delete(id);
    showScreen('UI10_detail', (root) => {
      const m = D.monstersById.get(id);
      let pose = 'idle';
      const poseImg = el('img', { class: 'card-img', src: `assets/monster/${id}_idle.webp`, style: 'background: var(--panel); object-fit: contain; max-height: 34vh', alt: '' });
      const poses = el('div', { style: 'display: flex; gap: 0.6em; margin-top: 0.6em' },
        ...['idle', 'windup', 'recovery'].map((p) => btn(p === 'idle' ? '01' : p === 'windup' ? '02' : '04', () => {
          pose = p;
          poseImg.src = `assets/monster/${id}_${p}.webp`;
        })),
      );
      root.append(el('div', { class: 'screen' },
        header(monsterName(id), familyName(m.family_id)),
        el('div', { class: 'screen-body' },
          el('div', { class: 'besti-detail' },
            el('div', {}, poseImg, poses,
              el('img', { class: 'diagram', src: `assets/diagramme/${id}.svg`, style: 'margin-top: 1em', alt: '' })),
            el('div', {},
              kv(monsterText(id, 'behavior'), t('ui.bestiary')),
              el('div', { class: 'kv' }, el('div', { class: 'k', text: monsterText(id, 'attack') }), el('div', { class: 'v', text: monsterText(id, 'telegraph') })),
              el('div', { class: 'kv' }, el('div', { class: 'k', text: '→' }), el('div', { class: 'v', text: monsterText(id, 'counterplay') })),
              el('table', { class: 'stat-table' },
                statRow('LP', m.base_stats.hp),
                statRow(t('ui.wave', { wave: '' }).split(' ')[0], null, m.attack.damage),
              ),
            ),
          ),
        ),
        footerHints(btn(t('ui.back'), () => goBack(), { back: true, defaultFocus: true })),
      ));
    });
  }
  function bossDetail(id) {
    showScreen('UI10_boss', (root) => {
      const b = D.bossesById.get(id);
      root.append(el('div', { class: 'screen' },
        header(bossName(id), familyName(b.family_id)),
        el('div', { class: 'screen-body' },
          el('div', { class: 'besti-detail' },
            el('div', {}, el('img', { class: 'card-img', src: `assets/bosskarten/${id}.webp`, alt: '' })),
            el('div', {},
              el('div', { class: 'kv' }, el('div', { class: 'k', text: '!' }), el('div', { class: 'v', text: bossText(id, 'telegraph') })),
              ...b.phases.map((p, i) => el('div', { class: 'kv' },
                el('div', { class: 'k', text: `Phase ${i + 1}` }),
                el('div', { class: 'v', text: bossPhaseText(id, i) }))),
            ),
          ),
        ),
        footerHints(btn(t('ui.back'), () => goBack(), { back: true, defaultFocus: true })),
      ));
    });
  }
  function memoryBook() {
    showScreen('UI10_memories', (root) => {
      const seen = save.data.seenScenes;
      const list = el('div', { style: 'display: flex; flex-direction: column; gap: 0.6em; max-width: 36em' });
      if (!seen.length) list.append(el('div', { class: 'hint', text: t('ui.unseen') }));
      for (const sid of seen) {
        const first = line(`${sid === 'intro' || sid === 'ending' ? sid + '.01' : sid + '.01'}`);
        list.append(btn(first.text.slice(0, 60) + (first.text.length > 60 ? ' …' : ''), () => {
          App.playScene(sid, () => {}, { replay: true });
        }));
      }
      root.append(el('div', { class: 'screen' },
        header(t('ui.dialog_log')),
        el('div', { class: 'screen-body' }, list),
        footerHints(btn(t('ui.back'), () => goBack(), { back: true, defaultFocus: true })),
      ));
    });
  }
  function kv(v, k) {
    return el('div', { class: 'kv' }, el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v }));
  }
  function statRow(label, hp, dmg) {
    return el('tr', {}, el('td', { text: label }), el('td', { text: String(hp ?? dmg ?? '') }));
  }
}

// ---------- UI14: Einstellungen ----------

export function settingsScreen() {
  showScreen('UI14', (root) => {
    const o = { ...App.options };
    let revertTimer = null;

    const langSel = el('select', { 'data-focus': '1' },
      el('option', { value: 'de', text: 'Deutsch' }),
      el('option', { value: 'en', text: 'English' }),
    );
    langSel.value = o.language;

    const scale = el('input', { type: 'range', min: '80', max: '140', step: '10', value: String(o.uiScale), 'data-focus': '1' });
    const scaleVal = el('span', { class: 'val', text: `${o.uiScale} %` });
    scale.oninput = () => {
      scaleVal.textContent = `${scale.value} %`;
      // Vorschau sofort; kritischer Bildschirmmodus wird nach 15 s ohne
      // Bestätigung zurückgesetzt (UI14-Regel).
      document.documentElement.style.setProperty('--ui-scale', String(Number(scale.value) / 100));
      clearTimeout(revertTimer);
      revertTimer = setTimeout(() => {
        document.documentElement.style.setProperty('--ui-scale', String(App.options.uiScale / 100));
        scale.value = String(App.options.uiScale);
        scaleVal.textContent = `${App.options.uiScale} %`;
        toast(t('ui.display_timer', { seconds: 0 }));
      }, 15000);
    };

    const checkbox = (key, labelId) => {
      const c = el('input', { type: 'checkbox', 'data-focus': '1' });
      c.checked = !!o[key];
      c.onchange = () => { o[key] = c.checked; };
      return el('div', { class: 'setting' }, el('label', { text: t(labelId) }), c);
    };

    const vol = el('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(o.audioVolume * 100)), 'data-focus': '1' });
    const volVal = el('span', { class: 'val', text: `${Math.round(o.audioVolume * 100)} %` });
    vol.oninput = () => { volVal.textContent = `${vol.value} %`; };

    // Hinweis: Für den Randpuls-Schalter liefert die Textdatei keine eigene ID;
    // die Beschriftung folgt der UI05-Zustandsbeschreibung (siehe docs/abweichungen.md).
    const pulseBox = el('input', { type: 'checkbox', 'data-focus': '1' });
    pulseBox.checked = !!o.criticalPulse;
    pulseBox.onchange = () => { o.criticalPulse = pulseBox.checked; };
    const grid = el('div', { class: 'settings-grid' },
      el('div', { class: 'setting' }, el('label', { text: 'Sprache / Language' }), langSel),
      el('div', { class: 'setting' }, el('label', { text: t('ui.ui_scale') }), scale, scaleVal),
      checkbox('reducedMotion', 'ui.reduced_motion'),
      checkbox('highContrast', 'ui.high_contrast'),
      checkbox('noFlash', 'ui.no_flash'),
      el('div', { class: 'setting' }, el('label', { text: getLanguage() === 'en' ? 'Critical health pulse' : 'Randpuls bei kritischem Leben' }), pulseBox),
      el('div', { class: 'setting' }, el('label', { text: 'Audio' }), vol, volVal),
    );

    root.append(el('div', { class: 'screen' },
      header(t('ui.settings')),
      el('div', { class: 'screen-body' }, grid,
        el('div', { style: 'display: flex; gap: 1em; margin-top: 1.6em' },
          btn(t('ui.apply'), () => {
            clearTimeout(revertTimer);
            o.language = langSel.value;
            o.uiScale = Number(scale.value);
            o.audioVolume = Number(vol.value) / 100;
            App.applyOptions(o);
            if (!saveOptions(App.options)) { saveErrorDialog(); return; }
            toast(t('ui.saved'));
            refreshScreen();
          }, { cls: 'primary', defaultFocus: true }),
          btn(t('ui.reset'), () => { App.applyOptions({ ...App.options }); refreshScreen(); }),
          el('span', { class: 'spacer', style: 'flex: 1' }),
          // Hinweis: Die Textdatei enthält keine eigene Hilfe-Beschriftung;
          // Übergangsbeschriftung dokumentiert in docs/abweichungen.md.
          btn(getLanguage() === 'en' ? 'Help' : 'Hilfe', () => helpScreen()),
          btn(t('ui.credits'), () => creditsScreen()),
        ),
      ),
      footerHints(btn(t('ui.back'), () => { clearTimeout(revertTimer); document.documentElement.style.setProperty('--ui-scale', String(App.options.uiScale / 100)); goBack(); }, { back: true })),
    ));
  });
}

// ---------- UI15: Hilfe ----------

export function helpScreen() {
  showScreen('UI15', (root) => {
    const tut = ['tutorial.move', 'tutorial.dodge', 'tutorial.warning', 'tutorial.active', 'tutorial.pickup',
      'tutorial.level', 'tutorial.shop', 'tutorial.merge', 'tutorial.arena', 'tutorial.boss', 'tutorial.death', 'tutorial.story'];
    root.append(el('div', { class: 'screen' },
      header(getLanguage() === 'en' ? 'Help' : 'Hilfe'),
      el('div', { class: 'screen-body' },
        ...tut.map((id) => {
          const l = line(id, { move_binding: 'WASD', dodge_binding: getLanguage() === 'en' ? 'Space' : 'Leertaste' });
          return el('div', { class: 'kv' },
            el('div', { class: 'k', text: l.speaker || '' }),
            el('div', { class: 'v', text: l.text }),
          );
        }),
      ),
      footerHints(btn(t('ui.back'), () => goBack(), { back: true, defaultFocus: true })),
    ));
  });
}

// ---------- UI16: Mitwirkende ----------

export function creditsScreen() {
  showScreen('UI16', (root) => {
    root.append(el('div', { class: 'screen' },
      header(t('ui.credits')),
      el('div', { class: 'screen-body' },
        el('div', { class: 'kv' }, el('div', { class: 'k', text: 'FABELBRUCH' }), el('div', { class: 'v', text: 'Designpaket v0.4 / Ergänzung v0.4.1' })),
        el('div', { class: 'kv' }, el('div', { class: 'k', text: 'Design' }), el('div', { class: 'v', text: 'FABELBRUCH Designübergabe (Konzeptkarten, Arenen, UI-Vorlagen, Texte)' })),
        el('div', { class: 'kv' }, el('div', { class: 'k', text: 'Umsetzung' }), el('div', { class: 'v', text: 'Technische Umsetzung mit Claude Code; Zwischenlösungs-Grafikaufbereitung aus den Konzeptkarten, siehe docs/fehlende-produktionsmedien.md' })),
        el('div', { class: 'kv' }, el('div', { class: 'k', text: 'Schrift' }), el('div', { class: 'v', text: 'Vorschau: Segoe UI/Arial (Systemschrift). Lizenzierte Produktionsschrift steht noch aus.' })),
      ),
      footerHints(btn(t('ui.back'), () => goBack(), { back: true, defaultFocus: true })),
    ));
  });
}
