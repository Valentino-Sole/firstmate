// Laufcontroller: 20 Wellen nach spielablauf.json, Aufstiege, Laden mit
// Glücksregeln (Ergänzung v0.4.1), Bosskampf, Belohnung, Speichern.

import { D, xpToNextLevel, shopRarityWeights, weaponTierPrice, weaponSellValue, scaledArena, scaledSpawnPoints } from '../data.js';
import { RNG, newSeed } from '../rng.js';
import { save, persist, addMemories, discoverMonster } from '../save.js';
import { computeHeroStats, stacksLeft } from './stats.js';
import { createWorld, createHero, updateCommon } from './world.js';
import { spawnMonster, updateMonster } from './monsters.js';
import { spawnBoss, updateBoss, updateOrbitals } from './bosses.js';
import { updateWeapons, processWeaponFires, updateHeroProjectiles, createWeaponInstance } from './weapons.js';
import { createHazardState, updateHazard } from './hazards.js';
import { updateEffects, clearAllEffects } from './effects.js';
import { dist } from './geometry.js';
import { sfx } from '../audio.js';

const WEAPON_SLOTS = 6;
const LEVEL_CAP = 30;

export class Run {
  constructor(events) {
    this.events = events; // UI-Rückrufe: onLevelup, onShop, onScene, onVictory, onDefeat, onBossStart, onTutorial, onSaveError
  }

  // ---- Start / Wiederherstellung ----

  startNew(arenaId, startingWeaponId) {
    const arena = D.arenasById.get(arenaId);
    const runDef = D.runsByArena.get(arenaId);
    this.arenaId = arenaId;
    this.runDef = runDef;
    this.rng = new RNG(newSeed());
    this.wave = 1;
    this.wax = D.ablauf.start.wax;
    this.level = D.ablauf.start.level;
    this.xp = 0;
    this.pendingLevels = 0;
    this.levelRerollsLeft = D.boni.levelup.rerolls_per_run;
    this.freeShopRerollUsed = false;
    this.upgrades = {};
    this.relics = {};
    this.weapons = new Array(WEAPON_SLOTS).fill(null);
    this.weapons[0] = createWeaponInstance(startingWeaponId, 1);
    this.phase = 'prewave';
    this.memoryMilestones = [];
    this.shop = null;
    this.heldOffers = [];
    this.pendingWeaponFires = [];
    this.delayedHeroStrikes = [];
    this.levelChoices = null;
    this.bossDefeated = false;
    this.poolCursor = 0;
    this.initWorld();
    this.waveStartSnapshot = null;
    if (!save.data.enteredArenas) save.data.enteredArenas = [];
    if (!save.data.enteredArenas.includes(arenaId)) {
      save.data.enteredArenas.push(arenaId);
      persist();
    }
  }

  initWorld() {
    // Vergrößerte Arenakopie; Fachdaten bleiben unverändert.
    const arena = scaledArena(this.arenaId);
    const world = createWorld(arena, this.runDef.stat_scaling);
    world.spawnPoints = scaledSpawnPoints();
    this.world = world;
    world.run = this;
    world.runRng = this.rng;
    this.heroStats = computeHeroStats(this, save.data.workshop);
    world.heroStats = this.heroStats;
    const [hx, hy] = arena.hero_spawn;
    world.hero = createHero(this.heroStats, hx, hy);
    this.hazard = createHazardState(arena);
    this.spawnPointIndex = 0;
    this.deferredSpawns = [];
  }

  refreshStats(healDelta = 0) {
    const prevMax = this.heroStats ? this.heroStats.maxHp : null;
    this.heroStats = computeHeroStats(this, save.data.workshop);
    this.world.heroStats = this.heroStats;
    const hero = this.world.hero;
    if (prevMax !== null && this.heroStats.maxHp > prevMax) {
      // Maximalleben-Zuwachs erhöht aktuelles Leben um denselben Betrag.
      hero.hp += this.heroStats.maxHp - prevMax;
    }
    if (healDelta > 0) hero.hp += healDelta;
    hero.hp = Math.min(hero.hp, this.heroStats.maxHp);
  }

  // Glück: Summe aus gewählten Upgrades und aktuell besessenen Relikten, gekappt.
  currentLuck() {
    return this.heroStats.luck;
  }

  // ---- Wellenlogik ----

  get waveData() {
    return this.runDef.waves[this.wave - 1];
  }

  beginWave() {
    const wd = this.waveData;
    this.phase = wd.boss_id ? 'bossintro' : 'fight';
    this.waveT = 0;
    this.spawnBudgetLeft = wd.spawn_budget;
    this.spawnTimer = 0;
    this.poolCursor = 0;
    this.deferredSpawns = [];
    this.world.waveStartedAt = this.world.time;
    this.waveStartSnapshot = this.serialize();
    this.saveSafePoint();
    if (wd.boss_id) {
      this.startBossFight(wd.boss_id);
    } else {
      this.events.onWaveStart?.(this.wave);
    }
  }

  startBossFight(bossId) {
    // Keine normalen Spawns, Arenagefahr aus; Dialog vor dem Kampf.
    this.world.monsters = [];
    this.world.enemyProjectiles = [];
    this.world.fields = [];
    const first = !save.data.firstVictories.includes(bossId);
    const sceneId = first ? `${bossId}.intro` : `${bossId}.echo`;
    this.events.onScene?.(sceneId, () => {
      spawnBoss(this.world, bossId);
      const d = discoverMonster(bossId);
      if (d.isNew) this.events.onDiscovery?.(bossId);
      this.phase = 'boss';
      this.events.onBossStart?.(bossId);
    });
  }

  update(dt) {
    if (this.phase !== 'fight' && this.phase !== 'boss') return;
    const world = this.world;
    world.time += dt;
    this.waveT += dt;

    if (this.phase === 'fight') {
      this.updateSpawning(dt);
      updateHazard(world, this.hazard, dt, this.wave, false);
      const wd = this.waveData;
      if (this.waveT >= wd.duration_seconds) {
        this.endWaveByTimer();
        return;
      }
    }

    for (const m of world.monsters) updateMonster(world, m, dt);
    world.monsters = world.monsters.filter((m) => !m.dead);
    if (world.boss && !world.boss.dead) updateBoss(world, world.boss, dt);
    updateOrbitals(world, dt);
    updateWeapons(world, dt);
    processWeaponFires(world);
    updateHeroProjectiles(world, dt);
    updateEffects(world, dt);
    updateCommon(world, dt);

    // Entdeckungen registrieren
    for (const m of world.monsters) {
      if (!m.discovered) {
        m.discovered = true;
        const d = discoverMonster(m.data.id);
        if (d.isNew) this.events.onDiscovery?.(m.data.id);
      }
    }

    if (world.hero.hp <= 0) {
      this.onDefeat();
      return;
    }
    if (this.phase === 'boss' && world.boss && world.boss.dead) {
      this.onBossVictory();
      return;
    }
    // Aufstieg mitten im Kampf: pausiert sofort mit genau drei Karten.
    if (this.pendingLevels > 0 && (this.phase === 'fight' || this.phase === 'boss')) {
      this.prevCombatPhase = this.phase;
      this.openLevelup();
    }
  }

  updateSpawning(dt) {
    const wd = this.waveData;
    const world = this.world;
    this.spawnTimer -= dt;

    // Zurückgestellte Spawns zuerst (höchstens 3 s aufheben, dann verfallen).
    this.deferredSpawns = this.deferredSpawns.filter((d) => {
      d.age += dt;
      return d.age <= 3;
    });

    const aliveCount = world.monsters.filter((m) => !m.dead).length;
    const tryPlace = (monsterId) => {
      // Zyklische Randpunkte, mindestens 240 Einheiten Abstand zu Knorz.
      const pts = world.spawnPoints;
      for (let i = 0; i < pts.length; i++) {
        const idx = (this.spawnPointIndex + i) % pts.length;
        const [sx, sy] = pts[idx];
        if (dist(sx, sy, world.hero.x, world.hero.y) >= 240) {
          this.spawnPointIndex = (idx + 1) % pts.length;
          world.spawnWarnings.push({ x: sx, y: sy, t: 0, monsterId });
          return true;
        }
      }
      return false;
    };

    for (const d of [...this.deferredSpawns]) {
      if (tryPlace(d.monsterId)) {
        this.deferredSpawns.splice(this.deferredSpawns.indexOf(d), 1);
      }
    }

    if (this.spawnBudgetLeft > 0 && this.spawnTimer <= 0 && wd.spawn_interval_seconds) {
      this.spawnTimer += wd.spawn_interval_seconds;
      if (aliveCount >= wd.max_alive) {
        // Deckel erreicht: diesen Zeit-Slot überspringen, keine Nachholspawns.
      } else {
        const monsterId = wd.monster_pool[this.poolCursor % wd.monster_pool.length];
        this.poolCursor += 1;
        this.spawnBudgetLeft -= 1;
        if (!tryPlace(monsterId)) {
          this.deferredSpawns.push({ monsterId, age: 0 });
        }
      }
    }

    // Warnringe: 0,8 s matt + 0,4 s Einblenden, dann aktiv ohne Erscheinensschaden.
    for (const w of world.spawnWarnings) {
      w.t += dt;
      if (w.t >= 1.2) {
        const m = spawnMonster(world, w.monsterId, w.x, w.y);
        m.spawnGrace = 0.2;
        w.done = true;
      }
    }
    world.spawnWarnings = world.spawnWarnings.filter((w) => !w.done);
  }

  endWaveByTimer() {
    const world = this.world;
    // Normale Gegner ohne Beute ausblenden; Projektile und Flächen entfernen;
    // liegende Beute automatisch einsammeln. Alle Waffeneffekte, Felder,
    // Minen, Marken und Zähler enden schadlos (gemeinsame-regeln lifecycle).
    world.monsters = [];
    world.enemyProjectiles = [];
    world.fields = [];
    world.spawnWarnings = [];
    world.orbitals = [];
    world.heroProjectiles = [];
    this.pendingWeaponFires = [];
    this.delayedHeroStrikes = [];
    clearAllEffects(world);
    for (const p of world.pickups) {
      if (p.type === 'wax') { this.wax += p.value; world.stats.waxEarned += p.value; }
      else if (p.type === 'xp') this.gainXp(p.value);
    }
    world.pickups = [];
    sfx.waveClear();

    // Wellenheilung nach Einsammeln und vor Laden.
    if (this.heroStats.waveHeal > 0) {
      world.hero.hp = Math.min(this.heroStats.maxHp, world.hero.hp + this.heroStats.waveHeal);
      this.events.onHeal?.(this.heroStats.waveHeal);
    }

    // Dauerhafte Erinnerungen nach Welle 5/10/15: sofort sichern.
    if ([5, 10, 15].includes(this.wave) && !this.memoryMilestones.includes(this.wave)) {
      this.memoryMilestones.push(this.wave);
      if (!addMemories(1)) this.events.onSaveError?.();
    }

    this.phase = 'between';
    this.continueBetween();
  }

  // Zwischenphase: erst aufgestaute Aufstiege, dann Laden, dann nächste Welle.
  continueBetween() {
    if (this.pendingLevels > 0) {
      this.openLevelup();
      return;
    }
    if (this.waveData.shop_after) {
      this.openShop();
      return;
    }
    this.advanceWave();
  }

  advanceWave() {
    this.wave += 1;
    this.beginWave();
  }

  // ---- Erfahrung und Aufstieg ----

  gainXp(n) {
    if (this.level >= LEVEL_CAP) return; // keine Auswahl, keine Ersatzwährung
    this.xp += n;
    while (this.level < LEVEL_CAP && this.xp >= xpToNextLevel(this.level)) {
      this.xp -= xpToNextLevel(this.level);
      this.level += 1;
      this.pendingLevels += 1;
    }
  }

  openLevelup() {
    this.phase = 'levelup';
    this.levelChoices = this.rollLevelChoices(null);
    this.events.onLevelup?.(this.levelChoices);
  }

  rollLevelChoices(excludeIds) {
    // Alle Upgrades unter Stapelgrenze, gleichgewichtet, drei verschiedene.
    let pool = D.boni.upgrades.filter((u) => stacksLeft(u, this.upgrades[u.id]) > 0);
    if (excludeIds && pool.filter((u) => !excludeIds.includes(u.id)).length >= 3) {
      pool = pool.filter((u) => !excludeIds.includes(u.id));
    }
    const choices = [];
    const bag = [...pool];
    while (choices.length < 3 && bag.length > 0) {
      const i = this.rng.int(bag.length);
      choices.push({ kind: 'upgrade', id: bag[i].id });
      bag.splice(i, 1);
    }
    // Ersatzregel: fehlende Plätze geben 20 Wachssplitter.
    while (choices.length < 3) {
      choices.push({ kind: 'wax', amount: 20 });
    }
    return choices;
  }

  chooseLevelOption(index) {
    if (this.phase !== 'levelup' || !this.levelChoices) return false;
    const c = this.levelChoices[index];
    if (!c) return false;
    if (c.kind === 'upgrade') {
      const u = D.upgradesById.get(c.id);
      this.upgrades[c.id] = (this.upgrades[c.id] || 0) + 1;
      this.refreshStats(u.heal_on_choose || 0);
    } else {
      this.wax += c.amount;
    }
    this.pendingLevels -= 1;
    this.levelChoices = null;
    sfx.levelUp();
    this.saveSafePoint(); // sicherer Punkt: nach Aufstiegsauswahl
    return true;
  }

  skipLevelOption() {
    if (this.phase !== 'levelup') return false;
    this.pendingLevels -= 1; // Keine Belohnung; verbraucht genau eine Auswahl.
    this.levelChoices = null;
    this.saveSafePoint();
    return true;
  }

  rerollLevelOptions() {
    if (this.phase !== 'levelup' || this.levelRerollsLeft <= 0) return false;
    this.levelRerollsLeft -= 1;
    const shown = this.levelChoices.filter((c) => c.kind === 'upgrade').map((c) => c.id);
    this.levelChoices = this.rollLevelChoices(shown);
    this.events.onLevelup?.(this.levelChoices);
    return true;
  }

  afterLevelChoice() {
    if (this.phase !== 'levelup') return;
    if (this.pendingLevels > 0) {
      this.openLevelup();
      return;
    }
    if (this.prevCombatPhase) {
      this.phase = this.prevCombatPhase;
      this.prevCombatPhase = null;
      return;
    }
    this.phase = 'between';
    this.continueBetween();
  }

  // ---- Laden (Glimms Laden) mit Glücksregeln v0.4.1 ----

  unlockedWeaponIds() {
    const entered = save.data.enteredArenas || [this.arenaId];
    return D.waffen.weapons.filter((w) => entered.includes(w.unlock_arena)).map((w) => w.id);
  }

  openShop() {
    this.phase = 'shop';
    this.rerollsPaidThisVisit = 0;
    const kept = this.heldOffers;
    this.shop = { offers: [null, null, null, null] };
    // Gehaltene Angebote bleiben bis zum nächsten Laden.
    for (const h of kept) {
      if (h.slot >= 0 && h.slot < 4) this.shop.offers[h.slot] = { ...h.offer, locked: true };
    }
    this.fillShopSlots();
    this.heldOffers = [];
    this.saveSafePoint();
    this.events.onShop?.();
  }

  // Slots füllen; Glück-Schnappschuss vor Erzeugung des gesamten Angebotssets.
  fillShopSlots(onlyEmpty = true) {
    const L = this.currentLuck();
    const baseWeights = shopRarityWeights(this.wave);
    const offerIds = () => this.shop.offers.filter(Boolean).map((o) => o.id);

    // Zwei Waffenplätze (0,1), zwei Reliktplätze (2,3).
    for (let slot = 0; slot < 4; slot++) {
      const existing = this.shop.offers[slot];
      if (existing && (existing.locked || !onlyEmpty && existing.sold)) continue;
      if (existing && onlyEmpty) continue;
      if (slot < 2) {
        this.shop.offers[slot] = this.rollWeaponOffer(L, baseWeights, offerIds());
      } else {
        this.shop.offers[slot] = this.rollRelicOffer(L, offerIds());
      }
    }
  }

  rollWeaponOffer(L, baseWeights, excludeIds) {
    // Erst freigeschaltete, noch nicht angebotene Waffen-ID gleichverteilt,
    // dann Stufe nach Glück-Gewichten; Stufe V bleibt Fusion vorbehalten.
    const ids = this.unlockedWeaponIds().filter((id) => !excludeIds.includes(id));
    if (!ids.length) return null;
    const id = ids[this.rng.int(ids.length)];
    const weights = baseWeights.map((base, idx) => base * (1 + L * 0.01 * idx));
    let total = 0;
    for (const w of weights) total += w;
    let r = this.rng.next() * total;
    let tier = 1;
    for (let t = 0; t < weights.length; t++) {
      r -= weights[t];
      if (r <= 0) { tier = t + 1; break; }
    }
    const spec = D.weaponsById.get(id);
    return { kind: 'weapon', id, tier, price: weaponTierPrice(spec, tier), locked: false, sold: false };
  }

  rollRelicOffer(L, excludeIds) {
    // Gewicht je zulässiger ID: 1 + L*0.01*(r-1); ohne Zurücklegen;
    // nur unter Stapelgrenze und nicht gehalten/angeboten.
    const heldIds = this.shop.offers.filter((o) => o && o.locked).map((o) => o.id);
    const pool = D.boni.relics.filter((rel) =>
      stacksLeft(rel, this.relics[rel.id]) > 0
      && !excludeIds.includes(rel.id)
      && !heldIds.includes(rel.id));
    if (!pool.length) return null; // Slot bleibt leer und nicht kaufbar
    const items = pool.map((rel) => ({ item: rel, weight: 1 + L * 0.01 * (rel.rarity - 1) }));
    const rel = this.rng.weighted(items);
    return { kind: 'relic', id: rel.id, price: rel.price, locked: false, sold: false };
  }

  shopRerollPrice() {
    // 8 + 4 x bezahlte Neuwürfe; Werkstatt P03: erster Neuwurf pro Lauf gratis.
    if ((save.data.workshop.P03 || 0) > 0 && !this.freeShopRerollUsed) return 0;
    return 8 + 4 * this.rerollsPaidThisVisit;
  }

  shopReroll() {
    const price = this.shopRerollPrice();
    if (price > this.wax) return { ok: false, missing: price - this.wax };
    if (price === 0) this.freeShopRerollUsed = true;
    else {
      this.wax -= price;
      this.rerollsPaidThisVisit += 1;
    }
    // Nur ungesperrte Slots neu erzeugen; verkaufte Slots werden ersetzt.
    for (let i = 0; i < 4; i++) {
      const o = this.shop.offers[i];
      if (o && o.locked) continue;
      this.shop.offers[i] = null;
    }
    this.fillShopSlots();
    this.saveSafePoint();
    return { ok: true };
  }

  toggleLock(slot) {
    const o = this.shop.offers[slot];
    if (!o || o.sold) return false; // Verkauftes Angebot ist nicht haltbar.
    o.locked = !o.locked;
    this.saveSafePoint();
    return true;
  }

  freeWeaponSlot() {
    return this.weapons.findIndex((w) => w === null);
  }

  buyOffer(slot) {
    const o = this.shop.offers[slot];
    if (!o || o.sold) return { ok: false, reason: 'sold' };
    if (o.price > this.wax) return { ok: false, reason: 'money', missing: o.price - this.wax };
    if (o.kind === 'weapon') {
      const free = this.freeWeaponSlot();
      if (free === -1) {
        // Tauschfenster: Geld erst nach bestätigtem Tausch abziehen.
        return { ok: false, reason: 'swap_needed' };
      }
      this.wax -= o.price;
      this.weapons[free] = createWeaponInstance(o.id, o.tier);
      o.sold = true;
      o.locked = false;
      sfx.buy();
      this.saveSafePoint();
      return { ok: true };
    }
    // Relikt: Wert sofort wirksam; Glück-Schnappschuss ändert Angebote nicht.
    this.wax -= o.price;
    this.relics[o.id] = (this.relics[o.id] || 0) + 1;
    this.refreshStats();
    o.sold = true;
    o.locked = false;
    sfx.buy();
    this.saveSafePoint();
    return { ok: true };
  }

  // Tausch bestätigt: alte Waffe geht ersatzlos, dann Kauf atomar abschließen.
  confirmSwap(shopSlot, weaponSlot) {
    const o = this.shop.offers[shopSlot];
    if (!o || o.sold || o.kind !== 'weapon') return { ok: false };
    if (o.price > this.wax) return { ok: false, reason: 'money', missing: o.price - this.wax };
    if (!this.weapons[weaponSlot]) return { ok: false };
    this.wax -= o.price;
    this.weapons[weaponSlot] = createWeaponInstance(o.id, o.tier);
    o.sold = true;
    o.locked = false;
    sfx.buy();
    this.saveSafePoint();
    return { ok: true };
  }

  sellWeapon(slot) {
    const w = this.weapons[slot];
    if (!w || this.phase !== 'shop') return { ok: false }; // Verkauf nur im Laden
    const spec = D.weaponsById.get(w.weaponId);
    this.wax += weaponSellValue(spec, w.tier);
    this.weapons[slot] = null;
    this.saveSafePoint();
    return { ok: true };
  }

  canMerge(slotA, slotB) {
    const a = this.weapons[slotA];
    const b = this.weapons[slotB];
    return !!(a && b && slotA !== slotB && a.weaponId === b.weaponId && a.tier === b.tier && a.tier < 5);
  }

  merge(slotA, slotB) {
    if (!this.canMerge(slotA, slotB)) return { ok: false };
    const a = this.weapons[slotA];
    this.weapons[slotA] = createWeaponInstance(a.weaponId, a.tier + 1);
    this.weapons[slotB] = null;
    this.saveSafePoint();
    return { ok: true };
  }

  closeShop() {
    // Gehaltene Angebote für den nächsten Laden merken.
    this.heldOffers = [];
    this.shop.offers.forEach((o, slot) => {
      if (o && o.locked && !o.sold) this.heldOffers.push({ slot, offer: { ...o } });
    });
    this.shop = null;
    this.advanceWave();
  }

  // ---- Boss-Ende, Sieg, Niederlage ----

  onBossVictory() {
    this.phase = 'victory';
    const bossId = this.waveData.boss_id;
    const first = !save.data.firstVictories.includes(bossId);
    this.world.fields = [];
    this.world.enemyProjectiles = [];
    this.world.orbitals = [];
    if (first) {
      save.data.firstVictories.push(bossId);
      save.data.memories += this.runDef.first_win_memories;
      // Nächste Arena freischalten
      const order = D.arenen.arenas.map((a) => a.id);
      const next = order[order.indexOf(this.arenaId) + 1];
      if (next && !save.data.unlockedArenas.includes(next)) {
        save.data.unlockedArenas.push(next);
      }
    } else {
      save.data.memories += this.runDef.repeat_win_memories;
    }
    save.data.lastArena = this.arenaId;
    save.data.run = null; // Lauf ist beendet
    if (!persist()) this.events.onSaveError?.();
    this.events.onVictory?.(bossId, first);
  }

  onDefeat() {
    this.phase = 'defeat';
    save.data.run = null;
    save.data.lastArena = this.arenaId;
    if (!persist()) this.events.onSaveError?.();
    this.events.onDefeat?.();
  }

  // ---- Serialisierung (sichere Punkte) ----

  serialize() {
    return {
      arenaId: this.arenaId,
      wave: this.wave,
      phase: this.phase === 'fight' || this.phase === 'boss' || this.phase === 'bossintro' ? 'wavestart' : this.phase,
      heroHp: this.world.hero.hp,
      wax: this.wax,
      level: this.level,
      xp: this.xp,
      pendingLevels: this.pendingLevels,
      levelRerollsLeft: this.levelRerollsLeft,
      freeShopRerollUsed: this.freeShopRerollUsed,
      rerollsPaidThisVisit: this.rerollsPaidThisVisit || 0,
      upgrades: { ...this.upgrades },
      relics: { ...this.relics },
      weapons: this.weapons.map((w) => (w ? { weaponId: w.weaponId, tier: w.tier } : null)),
      rngState: this.rng.serialize(),
      memoryMilestones: [...this.memoryMilestones],
      shop: this.shop ? { offers: this.shop.offers.map((o) => (o ? { ...o } : null)) } : null,
      heldOffers: this.heldOffers.map((h) => ({ slot: h.slot, offer: { ...h.offer } })),
      levelChoices: this.levelChoices ? this.levelChoices.map((c) => ({ ...c })) : null,
      waxFrac: this.world.waxFrac,
      xpFrac: this.world.xpFrac,
    };
  }

  // Mitten in der Welle beenden: gespeicherter Anfang derselben Welle.
  saveSafePoint() {
    const snap = (this.phase === 'fight' || this.phase === 'boss' || this.phase === 'bossintro')
      ? this.waveStartSnapshot
      : this.serialize();
    if (!snap) return true;
    // Zwischenphasen (Laden/Aufstieg) exakt sichern; Kampf als Wellenanfang.
    save.data.run = snap;
    const ok = persist();
    if (!ok) this.events.onSaveError?.();
    return ok;
  }

  restore(snap) {
    this.arenaId = snap.arenaId;
    this.runDef = D.runsByArena.get(snap.arenaId);
    this.rng = RNG.from(snap.rngState);
    this.wave = snap.wave;
    this.wax = snap.wax;
    this.level = snap.level;
    this.xp = snap.xp;
    this.pendingLevels = snap.pendingLevels;
    this.levelRerollsLeft = snap.levelRerollsLeft;
    this.freeShopRerollUsed = snap.freeShopRerollUsed;
    this.rerollsPaidThisVisit = snap.rerollsPaidThisVisit || 0;
    this.upgrades = { ...snap.upgrades };
    this.relics = { ...snap.relics };
    this.memoryMilestones = [...(snap.memoryMilestones || [])];
    this.heldOffers = (snap.heldOffers || []).map((h) => ({ slot: h.slot, offer: { ...h.offer } }));
    this.pendingWeaponFires = [];
    this.delayedHeroStrikes = [];
    this.bossDefeated = false;
    this.poolCursor = 0;
    this.initWorld();
    this.weapons = snap.weapons.map((w) => (w ? createWeaponInstance(w.weaponId, w.tier) : null));
    this.refreshStats();
    this.world.hero.hp = Math.min(snap.heroHp, this.heroStats.maxHp);
    this.world.waxFrac = snap.waxFrac || 0;
    this.world.xpFrac = snap.xpFrac || 0;

    if (snap.phase === 'shop' && snap.shop) {
      this.phase = 'shop';
      this.shop = { offers: snap.shop.offers.map((o) => (o ? { ...o } : null)) };
      this.waveStartSnapshot = null;
      this.events.onShop?.();
    } else if (snap.phase === 'levelup') {
      this.phase = 'levelup';
      this.levelChoices = (snap.levelChoices || this.rollLevelChoices(null)).map((c) => ({ ...c }));
      this.waveStartSnapshot = null;
      this.events.onLevelup?.(this.levelChoices);
    } else {
      // Anfang der gespeicherten Welle wiederherstellen.
      this.beginWave();
    }
  }
}
