// Spiel-HUD (UI05): Leben, Welle, Zeit, Beute, Erfahrung, Waffenplätze,
// Ausweichanzeige, Bossbalken; die Kampfmitte bleibt frei.

import { el } from './dom.js';
import { t, weaponName, bossName } from '../i18n.js';
import { D, xpToNextLevel } from '../data.js';

let nodes = null;

export function buildHud() {
  const hud = document.getElementById('hud');
  hud.replaceChildren();
  nodes = {
    hpRow: el('div', { class: 'row' }, el('span', { text: 'KNORZ' }), el('span', { class: 'hpText' })),
    hpBar: el('div'),
    waveLabel: el('div', { class: 'wave' }),
    timer: el('div', { class: 'timer' }),
    wax: el('div', { class: 'hud-panel hud-wax' }),
    xpBar: el('div'),
    slots: [],
    dodge: el('div', { class: 'hud-dodge' }),
    bossWrap: el('div', { class: 'hud-boss hidden' }),
    bossName: el('div'),
    bossBar: el('div'),
    pulse: el('div', { class: 'critical-pulse' }),
  };
  const top = el('div', { class: 'hud-top' },
    el('div', { class: 'hud-panel hud-hp' }, nodes.hpRow, el('div', { class: 'bar hp' }, nodes.hpBar)),
    el('div', { class: 'hud-panel hud-wave' }, nodes.waveLabel, nodes.timer),
    nodes.wax,
  );
  const xp = el('div', { class: 'hud-xp' }, el('div', { class: 'bar xp' }, nodes.xpBar));
  const bottom = el('div', { class: 'hud-bottom' });
  for (let i = 0; i < 6; i++) {
    const slot = el('div', { class: 'hud-slot' });
    nodes.slots.push(slot);
    bottom.append(slot);
  }
  bottom.append(nodes.dodge);
  nodes.bossWrap.append(nodes.bossName, el('div', { class: 'bar' }, nodes.bossBar));
  hud.append(top, xp, bottom, nodes.bossWrap, nodes.pulse);
}

export function showHud(show) {
  document.getElementById('hud').classList.toggle('hidden', !show);
}

export function updateHud(run, options) {
  if (!nodes) return;
  const world = run.world;
  const hero = world.hero;
  const st = run.heroStats;

  nodes.hpRow.querySelector('.hpText').textContent = t('ui.health', { current: Math.max(0, Math.ceil(hero.hp)), max: st.maxHp });
  nodes.hpBar.style.width = `${Math.max(0, hero.hp / st.maxHp) * 100}%`;
  nodes.waveLabel.textContent = t('ui.wave', { wave: run.wave });
  if (run.phase === 'boss' || run.phase === 'bossintro') {
    nodes.timer.textContent = '—';
  } else {
    const left = Math.max(0, (run.waveData.duration_seconds || 0) - run.waveT);
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(Math.ceil(left % 60)).padStart(2, '0');
    nodes.timer.textContent = `${mm}:${ss}`;
  }
  nodes.wax.textContent = t('ui.currency', { count: run.wax });
  const need = xpToNextLevel(run.level);
  nodes.xpBar.style.width = `${Math.min(1, run.xp / need) * 100}%`;

  run.weapons.forEach((w, i) => {
    const slot = nodes.slots[i];
    if (!w) {
      slot.replaceChildren();
      slot.classList.add('empty');
      return;
    }
    slot.classList.remove('empty');
    // Zählerpunkte nur an Waffen mit Aktivierungszähler (E012/E029/E037).
    const eff = D.effekte.effects.find((e) => e.weapon_id === w.weaponId);
    const n = eff && eff.parameters.every_n_activations;
    const dots = n ? ((w.fx ? w.fx.activations : 0) % n) : -1;
    const want = `assets/waffen/${w.weaponId}.webp#${w.tier}#${dots}`;
    if (slot.dataset.v !== want) {
      slot.dataset.v = want;
      slot.replaceChildren(
        el('img', { src: `assets/waffen/${w.weaponId}.webp`, alt: weaponName(w.weaponId) }),
        el('span', { class: 'tier', text: ['I', 'II', 'III', 'IV', 'V'][w.tier - 1] }),
      );
      if (n) {
        const dotWrap = el('span', { style: 'position: absolute; top: 2px; left: 3px; display: flex; gap: 2px' });
        for (let d = 0; d < n - 1; d++) {
          dotWrap.append(el('span', { style: `width: 5px; height: 5px; border-radius: 50%; background: ${d < dots ? 'var(--gold)' : 'rgba(241,227,200,0.25)'}` }));
        }
        slot.append(dotWrap);
      }
    }
  });

  if (hero.dodgeCooldown > 0) {
    nodes.dodge.classList.remove('ready');
    nodes.dodge.textContent = t('ui.dodge_cooldown', { seconds: hero.dodgeCooldown.toFixed(1) });
  } else {
    nodes.dodge.classList.add('ready');
    nodes.dodge.textContent = t('ui.dodge_ready');
  }

  const boss = world.boss;
  if (boss && !boss.dead) {
    nodes.bossWrap.classList.remove('hidden');
    nodes.bossName.textContent = bossName(boss.data.id);
    nodes.bossBar.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  } else {
    nodes.bossWrap.classList.add('hidden');
  }

  // Kritisches Leben: Randpuls, optional abschaltbar.
  const critical = hero.hp / st.maxHp <= 0.25;
  nodes.pulse.classList.toggle('on', critical && options.criticalPulse && !options.reducedMotion);
}
