// Bildschirme während eines Laufs: UI06 Pause, UI07 Wunschsplitter,
// UI08 Glimms Laden (mit UI22-Zuständen), UI09 Inventar, UI12 Sieg,
// UI13 Niederlage, UI17 Dialog, UI18 Bossbelohnung, UI19 Waffentausch,
// UI20 Zusammenführen, UI23 Auswahl bestätigt, UI24 Waffendetails.

import { el, showScreen, replaceScreen, goBack, closeAllScreens, toast, lockInput, attachTooltip, refreshScreen } from './dom.js';
import { header, footerHints, btn, confirmDialog, saveErrorDialog } from './screens.js';
import {
  t, line, sceneById, upgradeName, upgradeNote, statAmountLabel, statLabel,
  weaponName, weaponVisual, weaponFamilyName, weaponAbility, relicName, relicFlavor, bossName, getLanguage,
} from '../i18n.js';
import { D, weaponTierDamage, weaponDamageRaw, weaponSellValue, xpToNextLevel } from '../data.js';
import { save, persist, markSceneSeen } from '../save.js';
import { App } from '../app.js';
import { sfx } from '../audio.js';

const TIERS = ['I', 'II', 'III', 'IV', 'V'];

function run() { return App.run; }

// ---------- UI17: Dialog / Erinnerung ----------

export function dialogScene(sceneId, onDone, options = {}) {
  const scene = sceneById(sceneId);
  if (!scene) { onDone?.(); return; }
  if (scene.once_per_profile && save.data.seenScenes.includes(sceneId) && !options.replay) {
    onDone?.(); return;
  }
  let idx = 0;
  let typing = null;

  showScreen('UI17', (root) => render(root), {}, {});

  function finish(skipped) {
    clearInterval(typing);
    // Überspringen darf Fortschrittsflags nicht verhindern; Flag erst nach
    // Abschluss oder bewusstem Überspringen speichern.
    if (!options.replay && scene.once_per_profile) {
      if (!markSceneSeen(sceneId)) saveErrorDialog();
    }
    if (!goBack()) closeAllScreens();
    onDone?.();
  }

  function render(root) {
    const l = line(scene.line_ids[idx]);
    const textNode = el('div', { class: 'text' });
    const full = l.text;
    let shown = 0;
    const speed = Math.max(0.4, App.options.textSpeed || 1);
    clearInterval(typing);
    if (App.options.reducedMotion || speed >= 3) {
      textNode.textContent = full;
      shown = full.length;
    } else {
      typing = setInterval(() => {
        shown = Math.min(full.length, shown + Math.max(1, Math.round(speed)));
        textNode.textContent = full.slice(0, shown);
        if (shown >= full.length) clearInterval(typing);
      }, 18);
    }
    const next = () => {
      if (shown < full.length) { // erst vollständig anzeigen
        clearInterval(typing);
        textNode.textContent = full;
        shown = full.length;
        return;
      }
      idx += 1;
      if (idx >= scene.line_ids.length) finish(false);
      else refreshScreen();
    };
    root.append(el('div', { class: 'screen transparent' },
      el('div', { class: 'dialog-box' },
        el('div', { class: 'speaker', text: l.speaker || '' }),
        textNode,
        el('div', { class: 'controls' },
          btn(t('ui.dialog_skip'), () => finish(true), { back: true }),
          btn(t('ui.dialog_next'), next, { cls: 'primary', defaultFocus: true }),
        ),
      ),
    ));
  }
}

// ---------- UI06: Pause ----------

export function pauseScreen(onResume) {
  showScreen('UI06', (root) => {
    root.append(el('div', { class: 'screen overlay' },
      el('div', { class: 'modal' },
        el('h2', { text: t('ui.pause') }),
        el('div', { style: 'display: flex; flex-direction: column; gap: 0.8em' },
          btn(t('ui.resume'), () => { goBack(); onResume(); }, { cls: 'primary', defaultFocus: true, back: true }),
          btn(t('ui.settings'), async () => (await import('./screens.js')).settingsScreen()),
          btn(t('ui.restart'), () => confirmDialog({
            title: t('ui.restart_confirm'),
            body: t('ui.restart_body'),
            confirmLabel: t('ui.restart'),
            onConfirm: () => App.startRun(run().arenaId, App.startingWeapon),
          })),
          btn(t('ui.abandon'), () => confirmDialog({
            title: t('ui.abandon_confirm'),
            body: t('ui.abandon_body'),
            confirmLabel: t('ui.abandon'),
            onConfirm: () => {
              save.data.run = null;
              if (!persist()) { saveErrorDialog(); return; }
              App.backToMenu('workshop');
            },
          })),
        ),
      ),
    ));
  });
}

// ---------- UI07: Wunschsplitter wählen ----------

export function levelupScreen() {
  const r = run();
  replaceScreen('UI07', (root) => {
    const row = el('div', { class: 'card-row' });
    r.levelChoices.forEach((c, i) => {
      let title;
      let effect;
      let note;
      let iconFile = 'symbole/gem.svg';
      let stacks = '';
      if (c.kind === 'upgrade') {
        const u = D.upgradesById.get(c.id);
        title = upgradeName(c.id);
        effect = statAmountLabel(u.stat, u.amount, u.operation);
        note = upgradeNote(c.id);
        iconFile = u.icon_file;
        stacks = `${(r.upgrades[c.id] || 0)} / ${u.max_stacks}`;
        if (u.stat === 'luck') {
          const before = r.heroStats.luck;
          const after = Math.min(100, r.heroStats.luckRaw + u.amount);
          note = `${t('stat.luck.preview', { before, after })} · ${note}`;
        }
      } else {
        title = t('ui.currency', { count: c.amount });
        effect = t('ui.all_capped');
        note = '';
      }
      // Wunschsplitter-Karten im Wachskartenstil (v0.4.3), Seltenheit I.
      const card = el('div', { class: 'waxcard r1 levelcard', 'data-focus': '1', tabindex: '0', onclick: choose });
      function choose() {
        if (!r.chooseLevelOption(i) && c.kind !== 'wax') return;
        selectionConfirmed();
      }
      card.append(
        el('span', { class: 'stud s1' }), el('span', { class: 'stud s2' }),
        el('span', { class: 'stud s3' }), el('span', { class: 'stud s4' }),
        el('span', { class: 'drip d1' }), el('span', { class: 'drip d2' }),
        el('span', { class: 'seal' }, el('img', { src: 'assets/symbole/seal.svg', alt: '' })),
        el('div', { class: 'art-wrap' }, el('img', { src: `assets/${iconFile}`, style: 'max-height: 5.5em', alt: '' })),
        el('div', { class: 'title', text: title }),
        el('div', { class: 'rarity-line', text: t('ui.rarity.1').split(' · ')[0] + (stacks ? ` · ${stacks}` : '') }),
        el('div', { class: 'bodytext' },
          el('b', { text: effect }),
          note ? el('span', { text: note }) : null,
        ),
        el('button', { class: 'btn buy', 'data-focus': '1', onclick: (e) => { e.stopPropagation(); choose(); } },
          el('span', { text: t('ui.choose') })),
      );
      if (i === 0) card.setAttribute('data-default-focus', '1');
      row.append(card);
    });
    root.append(el('div', { class: 'screen' },
      header(t('ui.level_title'), t('ui.level_subtitle', { level: r.level })),
      el('div', { class: 'screen-body' }, row),
      el('div', { class: 'screen-footer' },
        btn(t('ui.reroll_level', { count: r.levelRerollsLeft }), () => {
          if (!r.rerollLevelOptions()) toast(t('ui.no_reroll'));
          else levelupScreen();
        }, { disabled: r.levelRerollsLeft <= 0, icon: 'assets/symbole/wuerfel.svg' }),
        el('span', { class: 'spacer' }),
        r.pendingLevels > 1 ? el('span', { class: 'hint', text: t('ui.pending_levels', { count: r.pendingLevels }) }) : null,
        btn(t('ui.skip'), () => { r.skipLevelOption(); selectionConfirmed(); }),
      ),
    ));
  });
}

// UI23: Doppelbestätigung verhindern; Eingaben 250 ms sperren.
function selectionConfirmed() {
  const r = run();
  replaceScreen('UI23', (root) => {
    lockInput(250);
    root.append(el('div', { class: 'screen overlay' },
      el('div', { class: 'modal', style: 'text-align: center' },
        el('h2', { text: t('ui.selection_done') }),
        el('div', { class: 'row', style: 'justify-content: center' },
          btn(r.pendingLevels > 0 ? t('ui.pending_levels', { count: r.pendingLevels }) : t('ui.confirm'), () => {
            closeAllScreens();
            r.afterLevelChoice();
            if (r.phase === 'levelup') levelupScreen();
            else if (r.phase === 'shop') shopScreen();
            else App.resumeCombat();
          }, { cls: 'primary', defaultFocus: true }),
        ),
      ),
    ));
  });
}

// ---------- UI08 + UI22: Glimms Laden ----------

export function shopScreen() {
  const r = run();
  if (!save.data.seenScenes.includes('shop.first')) {
    dialogScene('shop.first', () => shopScreen());
    return;
  }
  replaceScreen('UI08', (root) => {
    const grid = el('div', { class: 'shop-grid' });
    r.shop.offers.forEach((o, slot) => grid.append(offerCard(o, slot)));
    const rerollPrice = r.shopRerollPrice();
    const meta = el('span', { class: 'meta', style: 'display: inline-flex; align-items: center; gap: 0.45em' },
      el('img', { src: 'assets/symbole/gem-rot.svg', style: 'height: 1.2em', alt: '' }),
      el('span', { text: t('ui.currency', { count: r.wax }) }),
      el('span', { text: '·' }),
      el('img', { src: 'assets/symbole/glueck.svg', style: 'height: 1.2em', alt: '' }),
      el('span', { text: `${t('stat.luck.name')} ${t('stat.luck.value', { value: r.currentLuck() })}` }),
    );
    const head = header(t('ui.shop_title'));
    head.append(meta);
    root.append(el('div', { class: 'screen' },
      el('div', { class: 'shop-ambience' }),
      head,
      el('div', { class: 'screen-body' },
        el('div', { class: 'hint', style: 'margin-bottom: 1em', text: t('ui.shop_subtitle') }),
        grid,
      ),
      el('div', { class: 'screen-footer' },
        btn(t('ui.reroll_shop', { price: rerollPrice }), () => {
          const res = r.shopReroll();
          if (!res.ok) toast(t('ui.missing_short', { amount: res.missing }));
          shopScreen();
        }, { icon: 'assets/symbole/wuerfel.svg' }),
        btn(t('ui.inventory'), () => inventoryScreen({ context: 'shop' }), { icon: 'assets/symbole/box.svg' }),
        el('span', { class: 'spacer' }),
        btn(t('ui.next_wave') + ' ›', () => {
          closeAllScreens();
          r.closeShop();
          App.resumeCombat();
        }, { cls: 'amber', defaultFocus: true }),
      ),
    ));
  });

  // Wachskarte nach Stilreferenz v0.4.3: Bildfläche, Name, Seltenheit mit
  // geprägtem Siegel, Fähigkeit/Bonus, Kaufknopf, kurzer Fehlbetrag,
  // Messinglasche zum Halten. Gleiche Maße und Grundlinien für alle Karten.
  function offerCard(o, slot) {
    if (!o) {
      return el('div', { class: 'waxcard r1 leer' },
        el('div', { class: 'art-wrap' }),
        el('div', { class: 'title', text: t('ui.empty') }));
    }
    const affordable = o.price <= r.wax;
    const rarity = o.kind === 'weapon' ? o.tier : D.relicsById.get(o.id).rarity;
    const cls = ['waxcard', rarity >= 2 ? 'r2' : 'r1'];
    if (o.sold) cls.push('sold');
    if (o.locked) cls.push('locked');
    const card = el('div', { class: cls.join(' ') });
    card.append(
      el('span', { class: 'stud s1' }), el('span', { class: 'stud s2' }),
      el('span', { class: 'stud s3' }), el('span', { class: 'stud s4' }),
      el('span', { class: 'drip d1' }), el('span', { class: 'drip d2' }), el('span', { class: 'drip d3' }),
      el('span', { class: 'seal' }, el('img', { src: 'assets/symbole/seal.svg', alt: '' })),
    );

    if (o.kind === 'weapon') {
      const spec = D.weaponsById.get(o.id);
      card.append(
        el('div', { class: 'art-wrap' }, el('img', { src: `assets/waffen/${o.id}.webp`, alt: '' })),
        el('div', { class: 'title', text: `${weaponName(o.id)} · ${TIERS[o.tier - 1]}` }),
        el('div', { class: 'rarity-line', text: t('ui.rarity.' + o.tier).split(' · ')[0] }),
        el('div', { class: 'bodytext' },
          el('b', { text: weaponAbility(o.id, 'name') }),
          el('span', { text: weaponAbility(o.id, 'role') }),
        ),
      );
      attachTooltip(card, () => weaponTooltip(o.id, o.tier));
    } else {
      const rel = D.relicsById.get(o.id);
      const luckNote = rel.stat === 'luck'
        ? ` · ${t('stat.luck.preview', { before: r.heroStats.luck, after: Math.min(100, r.heroStats.luckRaw + rel.amount) })}`
        : '';
      card.append(
        el('div', { class: 'art-wrap' }, el('img', { src: `assets/${rel.icon_file}`, style: 'max-height: 4.6em', alt: '' })),
        el('div', { class: 'title', text: relicName(o.id) }),
        el('div', { class: 'rarity-line', text: t('ui.rarity.' + rel.rarity).split(' · ')[0] }),
        el('div', { class: 'bodytext' },
          el('b', { text: `${statAmountLabel(rel.stat, rel.amount, rel.operation)} · ${(r.relics[o.id] || 0)} / ${rel.max_stacks}` }),
          el('span', { text: relicFlavor(o.id) + luckNote }),
        ),
      );
    }

    if (o.sold) {
      card.append(el('div', { class: 'emboss', text: t('ui.sold').toUpperCase() }));
      return card;
    }

    const buyBtn = el('button', {
      class: 'btn buy', 'data-focus': '1',
      onclick: () => buy(slot),
    },
      !affordable ? el('img', { src: 'assets/symbole/schloss.svg', alt: '' }) : null,
      el('span', { text: t('ui.buy', { price: o.price }) }),
      el('img', { src: 'assets/symbole/gem-rot.svg', alt: '' }),
    );
    if (!affordable) buyBtn.disabled = true; // sichtbar deaktiviert, Preis lesbar
    card.append(
      buyBtn,
      el('div', { class: 'shortfall', text: affordable ? '' : t('ui.missing_short', { amount: o.price - r.wax }) }),
      el('button', {
        class: 'btn hold', 'data-focus': '1',
        onclick: () => { r.toggleLock(slot); shopScreen(); },
      },
        el('img', { src: 'assets/symbole/seal.svg', alt: '' }),
        el('span', { text: o.locked ? t('ui.release_offer') : t('ui.lock') }),
      ),
    );
    return card;
  }

  function buy(slot) {
    const o = r.shop.offers[slot];
    const res = r.buyOffer(slot);
    if (res.ok) {
      if (o.kind === 'relic' && D.relicsById.get(o.id).stat === 'luck') {
        toast(t('shop.luck.snapshot'));
      }
      shopScreen();
      return;
    }
    if (res.reason === 'money') toast(t('ui.no_money', { missing: res.missing }));
    else if (res.reason === 'swap_needed') swapScreen(slot);
  }
}

// ---------- UI19: Waffentausch ----------

function swapScreen(shopSlot) {
  const r = run();
  const o = r.shop.offers[shopSlot];
  showScreen('UI19', (root) => {
    let chosen = -1;
    const grid = el('div', { class: 'slot-grid' });
    r.weapons.forEach((w, i) => {
      const cell = el('div', {
        class: 'slot', 'data-focus': '1', tabindex: '0',
        onclick: () => { chosen = i; update(); },
      },
        el('img', { src: `assets/waffen/${w.weaponId}.webp`, alt: '' }),
        el('b', { text: weaponName(w.weaponId) }),
        el('span', { class: 'tier', text: TIERS[w.tier - 1] }),
      );
      grid.append(cell);
    });
    const confirmBtn = btn(t('ui.confirm'), () => {
      const res = r.confirmSwap(shopSlot, chosen);
      if (res.ok) { goBack(); shopScreen(); }
      else if (res.reason === 'money') toast(t('ui.no_money', { missing: res.missing }));
    }, { cls: 'primary', disabled: true });
    function update() {
      [...grid.children].forEach((c, i) => c.classList.toggle('selected', i === chosen));
      // Bestätigung nur mit gewähltem Platz und ausreichend Splittern (UI19).
      confirmBtn.disabled = chosen < 0 || o.price > r.wax;
      confirmBtn.textContent = chosen >= 0
        ? t('ui.swap_confirm', { old: weaponName(r.weapons[chosen].weaponId), new: weaponName(o.id) })
        : t('ui.confirm');
    }
    root.append(el('div', { class: 'screen' },
      header(t('ui.swap_title'), `${weaponName(o.id)} · ${TIERS[o.tier - 1]} · ${t('ui.buy', { price: o.price })}`),
      el('div', { class: 'screen-body' },
        el('div', { class: 'hint', style: 'margin-bottom: 1em', text: t('ui.weapon_full') + ' ' + t('ui.swap_effect') }),
        grid,
      ),
      el('div', { class: 'screen-footer' },
        btn(t('ui.cancel'), () => goBack(), { defaultFocus: true, back: true }),
        el('span', { class: 'spacer' }),
        confirmBtn,
      ),
    ));
  });
}

// ---------- UI09 / UI20 / UI24: Inventar, Fusion, Details ----------

export function inventoryScreen(params = {}) {
  const r = run();
  const inShop = params.context === 'shop';
  let selected = [];
  showScreen('UI09', (root) => render(root));

  function render(root) {
    const grid = el('div', { class: 'slot-grid' });
    r.weapons.forEach((w, i) => {
      if (!w) {
        grid.append(el('div', { class: 'slot empty', text: t('ui.empty') }));
        return;
      }
      const spec = D.weaponsById.get(w.weaponId);
      const cell = el('div', {
        class: `slot ${selected.includes(i) ? 'selected' : ''}`,
        'data-focus': '1', tabindex: '0',
        onclick: () => toggle(i),
      },
        el('img', { src: `assets/waffen/${w.weaponId}.webp`, alt: '' }),
        el('b', { text: weaponName(w.weaponId) }),
        el('span', { class: 'tier', text: TIERS[w.tier - 1] }),
      );
      attachTooltip(cell, () => weaponTooltip(w.weaponId, w.tier));
      grid.append(cell);
    });

    const st = r.heroStats;
    const stats = el('table', { class: 'stat-table' },
      row(statLabel('max_hp'), `${Math.ceil(r.world.hero.hp)} / ${st.maxHp}`),
      row(statLabel('damage'), pct(st.damageBonus)),
      row(statLabel('attack_speed'), pct(st.attackSpeedBonus)),
      row(statLabel('crit_chance'), `${Math.round(st.critChance * 100)} %`),
      row(statLabel('weapon_range'), pct(st.rangeBonus)),
      row(statLabel('armor'), String(st.armor)),
      row(statLabel('move_speed'), String(Math.round(st.moveSpeed))),
      row(statLabel('dodge_cooldown'), `${st.dodgeCooldown.toFixed(1)} s`),
      row(statLabel('pickup_radius'), String(Math.round(st.pickupRadius))),
      row(statLabel('wave_heal'), String(st.waveHeal)),
      row(statLabel('wax_bonus'), pct(st.waxBonus)),
      row(statLabel('xp_bonus'), pct(st.xpBonus)),
    );
    // Glück-Zeile nach dem Wachssplitterbonus (glueck-ergaenzung UI09).
    const luckRow = row(t('stat.luck.name'), t('stat.luck.value', { value: st.luck }));
    luckRow.setAttribute('data-focus', '1');
    luckRow.setAttribute('tabindex', '0');
    attachTooltip(luckRow, () => t('stat.luck.tooltip'));
    stats.append(luckRow);

    const relicList = el('div', {},
      ...Object.entries(r.relics).map(([rid, count]) => {
        const rel = D.relicsById.get(rid);
        return el('div', { class: 'kv' },
          el('div', { class: 'k', text: `${relicName(rid)} × ${count}` }),
          el('div', { class: 'v', text: statAmountLabel(rel.stat, rel.amount * count, rel.operation) }),
        );
      }),
    );

    const actions = el('div', { style: 'display: flex; gap: 1em; margin-top: 1.2em; flex-wrap: wrap' });
    if (selected.length === 1) {
      const w = r.weapons[selected[0]];
      actions.append(btn(weaponName(w.weaponId) + ' …', () => weaponDetailScreen(w.weaponId, w.tier)));
      if (inShop) {
        const spec = D.weaponsById.get(w.weaponId);
        actions.append(btn(t('ui.sell', { price: weaponSellValue(spec, w.tier) }), () => {
          confirmDialog({
            title: t('ui.sell_confirm', { name: weaponName(w.weaponId), price: weaponSellValue(spec, w.tier) }),
            body: '',
            confirmLabel: t('ui.sell', { price: weaponSellValue(spec, w.tier) }),
            onConfirm: () => { r.sellWeapon(selected[0]); selected = []; refreshScreen(); },
          });
        }));
      }
    }
    if (selected.length === 2) {
      if (r.canMerge(selected[0], selected[1])) {
        actions.append(btn(t('ui.merge'), () => mergeScreen(selected[0], selected[1])));
      } else {
        const a = r.weapons[selected[0]];
        actions.append(el('span', { class: 'hint', text: a && a.tier >= 5 ? t('ui.merge_max') : t('ui.merge_preview', { name: '…', tier: '', next_tier: '' }).split('→')[0] }));
      }
    }

    root.append(el('div', { class: 'screen' },
      header(t('ui.inventory'), t('ui.currency', { count: r.wax })),
      el('div', { class: 'screen-body' },
        el('div', { class: 'inv-layout' },
          el('div', {}, grid, actions),
          el('div', {}, stats, el('h3', { style: 'margin: 1em 0 0.5em', text: t('ui.reward') }), relicList),
        ),
      ),
      footerHints(btn(t('ui.back'), () => goBack(), { back: true, defaultFocus: true })),
    ));
  }
  function toggle(i) {
    if (selected.includes(i)) selected = selected.filter((x) => x !== i);
    else selected = [...selected, i].slice(-2);
    refreshScreen();
  }
  function row(k, v) {
    return el('tr', {}, el('td', { text: k }), el('td', { text: v }));
  }
  function pct(x) {
    const v = Math.round(x * 100);
    return `${v >= 0 ? '+' : ''}${v} %`;
  }
}

// UI20: Kostenlose Fusion gleicher Waffen mit Vorschau.
function mergeScreen(slotA, slotB) {
  const r = run();
  const a = r.weapons[slotA];
  showScreen('UI20', (root) => {
    root.append(el('div', { class: 'screen overlay' },
      el('div', { class: 'modal' },
        el('h2', { text: t('ui.merge') }),
        el('div', { class: 'body', text: t('ui.merge_preview', { name: weaponName(a.weaponId), tier: TIERS[a.tier - 1], next_tier: TIERS[a.tier] }) }),
        el('div', { class: 'row' },
          btn(t('ui.cancel'), () => goBack(), { defaultFocus: true, back: true }),
          btn(t('ui.merge'), () => {
            const res = r.merge(slotA, slotB);
            goBack();
            if (res.ok) toast(t('ui.merge_preview', { name: weaponName(a.weaponId), tier: TIERS[a.tier - 1], next_tier: TIERS[a.tier] }));
            refreshScreen();
          }, { cls: 'primary' }),
        ),
      ),
    ));
  });
}

// UI24: Waffendetails; alle Werte aus der Datenquelle, keine Roh-Feldnamen.
export function weaponTooltip(weaponId, tier) {
  const r = run();
  const spec = D.weaponsById.get(weaponId);
  const st = r ? r.heroStats : { damageBonus: 0, attackSpeedBonus: 0, rangeBonus: 0 };
  const dmg = weaponTierDamage(spec, tier, st.damageBonus);
  const Draw = weaponDamageRaw(spec, tier, st.damageBonus);
  const cd = Math.max(0.2, spec.cooldown_seconds / (1 + st.attackSpeedBonus));
  const wrap = el('div', {},
    el('div', { class: 'speaker', text: `${weaponName(weaponId)} · ${TIERS[tier - 1]} · ${weaponFamilyName(spec.family)}` }),
    el('div', { text: weaponVisual(weaponId) }),
    el('div', { class: 'hint', text: `${statLabel('damage')}: ${spec.category === 'shield' ? '—' : dmg} · ${cd.toFixed(2)} s · ${statLabel('weapon_range')}: ${Math.round(spec.range * (1 + st.rangeBonus))}` }),
    // Fähigkeit (v0.4.2): Titel, Rolle, genaue Wirkung; Vorschau mit aktuellem D.
    el('div', { class: 'speaker', style: 'margin-top: 0.5em', text: `${weaponAbility(weaponId, 'name')} — ${weaponAbility(weaponId, 'role')}` }),
    el('div', { style: 'font-size: 0.92em', text: weaponAbility(weaponId, 'description') }),
    spec.category === 'shield' ? null : el('div', { class: 'hint', text: `D = ${Draw.toFixed(1)}` }),
  );
  return wrap;
}

export function weaponDetailScreen(weaponId, tier) {
  const spec = D.weaponsById.get(weaponId);
  showScreen('UI24', (root) => {
    root.append(el('div', { class: 'screen overlay' },
      el('div', { class: 'modal' },
        el('h2', { text: `${weaponName(weaponId)} · ${TIERS[tier - 1]}` }),
        el('img', { src: `assets/waffen/${weaponId}.webp`, style: 'height: 10em; object-fit: contain; align-self: center', alt: '' }),
        weaponTooltip(weaponId, tier),
        el('div', { class: 'detail', text: t('ui.rarity.' + Math.min(5, tier)) }),
        el('div', { class: 'row' }, btn(t('ui.back'), () => goBack(), { defaultFocus: true, back: true })),
      ),
    ));
  });
}

// ---------- UI12 / UI18: Sieg und Belohnung ----------

export function victoryScreen(bossId, first) {
  const r = run();
  replaceScreen('UI12', (root) => {
    root.append(el('div', { class: 'screen' },
      el('div', { class: 'result-center' },
        el('div', { class: 'hud-panel', text: first ? t('ui.first_victory') : t('ui.echo_victory') }),
        el('h1', { text: t('ui.victory') }),
        el('img', { class: 'big-art', src: `assets/boss/${bossId}.webp`, alt: '' }),
        el('div', { class: 'hint', text: bossName(bossId) }),
        el('div', { class: 'row' },
          btn(t('ui.reward'), () => rewardScreen(bossId, first), { cls: 'primary', defaultFocus: true }),
          btn(t('ui.abandon'), () => App.backToMenu('workshop')),
        ),
      ),
    ));
  });
}

export function rewardScreen(bossId, first) {
  const r = run();
  const runDef = D.runsByArena.get(r.arenaId);
  const weaponId = runDef.boss_reward_weapon_id;
  replaceScreen('UI18', (root) => {
    const memories = first ? runDef.first_win_memories : runDef.repeat_win_memories;
    root.append(el('div', { class: 'screen' },
      el('div', { class: 'result-center' },
        el('h1', { text: t('ui.reward') }),
        first ? el('img', { class: 'big-art', src: `assets/waffen/${weaponId}.webp`, alt: '' }) : null,
        first
          ? el('div', { text: `${weaponName(weaponId)} — ${weaponVisual(weaponId)}` })
          : el('div', { class: 'hint', text: t('ui.echo_victory') }),
        el('div', { class: 'hud-panel', text: t('ui.memories', { count: '+' + memories }) }),
        first ? el('div', { class: 'hint', text: t('ui.new_entry') }) : null,
        el('div', { class: 'row' },
          btn(t('ui.abandon'), () => App.backToMenu('workshop'), { cls: 'primary', defaultFocus: true }),
        ),
      ),
    ));
  });
}

// ---------- UI13: Niederlage ----------

export function defeatScreen() {
  const r = run();
  const show = () => replaceScreen('UI13', (root) => {
    root.append(el('div', { class: 'screen' },
      el('div', { class: 'result-center defeat' },
        el('h1', { text: t('ui.defeat') }),
        el('div', { class: 'hint', text: t('ui.abandon_body') }),
        el('div', { class: 'row' },
          // UI04_last_selection: Bezirkskarte mit vorausgewähltem letzten
          // Bezirk; neuer Lauf erst nach Betreten.
          btn(t('ui.retry'), () => App.backToMenu('arenamap'), { cls: 'primary', defaultFocus: true }),
          btn(t('ui.abandon'), () => App.backToMenu('workshop')),
        ),
      ),
    ));
  });
  // Erste Niederlage: Szene nach der Ergebnisanzeige.
  if (!save.data.seenScenes.includes('defeat.first')) {
    show();
    dialogScene('defeat.first', () => {});
  } else {
    show();
  }
}
