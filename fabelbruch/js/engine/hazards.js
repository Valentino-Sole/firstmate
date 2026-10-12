// Arenagefahren nach arenen.json: ab Welle 5, Periode 14 s, Zonen wechseln
// sich ab (nie beide gleichzeitig), 1,2 s Warnung, 0,65 s aktiv, Schaden 8,
// höchstens 1 Treffer pro Aktivierung, im Bosskampf deaktiviert.
// new_spawn_safety_seconds: frisch erschienene Wesen bleiben kurz verschont.

import { damageHero } from './world.js';
import { circleInRect, circleInDisk } from './geometry.js';

export function createHazardState(arena) {
  return {
    def: arena.hazard,
    enabled: false,
    cycleT: 0,
    zoneIndex: 0,
    phase: 'idle',   // idle -> warn -> active -> idle
    phaseT: 0,
    heroHitThisActivation: false,
  };
}

export function updateHazard(world, hz, dt, waveNumber, bossActive) {
  const def = hz.def;
  hz.enabled = !bossActive && waveNumber >= def.enabled_from_wave && world.run.waveData.hazard_enabled;
  if (!hz.enabled) {
    hz.phase = 'idle';
    hz.cycleT = 0;
    return;
  }
  hz.cycleT += dt;
  hz.phaseT += dt;
  switch (hz.phase) {
    case 'idle': {
      if (hz.cycleT >= def.period_seconds) {
        hz.cycleT = 0;
        hz.phase = 'warn';
        hz.phaseT = 0;
        hz.heroHitThisActivation = false;
      }
      break;
    }
    case 'warn': {
      if (hz.phaseT >= def.warning_seconds) {
        hz.phase = 'active';
        hz.phaseT = 0;
      }
      break;
    }
    case 'active': {
      const hero = world.hero;
      if (!hz.heroHitThisActivation && world.time - (world.run.waveStartedAt || 0) > def.new_spawn_safety_seconds) {
        if (zoneHits(def, hz.zoneIndex, hero.x, hero.y, hero.radius)) {
          damageHero(world, def.damage, null);
          hz.heroHitThisActivation = true;
        }
      }
      if (hz.phaseT >= def.active_seconds) {
        hz.phase = 'idle';
        hz.phaseT = 0;
        hz.zoneIndex = (hz.zoneIndex + 1) % def.zones.length;
      }
      break;
    }
    default:
      break;
  }
}

export function zoneHits(def, zoneIndex, tx, ty, tr) {
  const z = def.zones[zoneIndex];
  if (def.geometry === 'rects') {
    return circleInRect(tx, ty, tr, z[0], z[1], z[2], z[3]);
  }
  return circleInDisk(tx, ty, tr, z[0], z[1], z[2]);
}
