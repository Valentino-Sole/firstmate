// Renderer. Ebenen nach arenen.json visual_layers:
// Boden -> Bodenschatten -> Bodenwarnungen -> Figuren nach Fußpunkt-Y ->
// Angriffseffekte -> (Randdeko liegt im Bodenbild) -> HUD (DOM).
// Warnsprache aus design.json combat_rules: Vorbereitung gestrichelt,
// Aktivphase solide mit Füllung 0.24, Kontur 3 px, Farbe #E87768.
// Die Figurenbilder sind Zwischenlösungen aus den Konzeptkarten
// (docs/fehlende-produktionsmedien.md); Knorz wird nie gespiegelt.

import { D } from '../data.js';
import { telegraphShape, activeShape } from './attacks.js';
import { zoneHits } from './hazards.js';

const COLORS = {
  hostile: '#E87768',
  friendly: '#B6DDD0',
  support: '#B5A2CB',
  ink: '#F1E3C8',
};

const imageCache = new Map();
function img(path) {
  let entry = imageCache.get(path);
  if (!entry) {
    entry = new Image();
    entry.src = path;
    imageCache.set(path, entry);
  }
  return entry;
}

export function preloadArena(arenaId) {
  img(`assets/arenen/${arenaId}.webp`);
}

function monsterSprite(m) {
  const pose = m.state === 'windup' || m.state === 'active' ? 'windup'
    : m.state === 'recovery' ? 'recovery' : 'idle';
  return img(`assets/monster/${m.data.id}_${pose}.webp`);
}

export function render(ctx, world, options, uiFlags = {}) {
  const arena = world.arena;
  const [aw, ah] = arena.reference_size;
  // Kamera folgt Knorz durch die vergrößerte Arena (Kapitänsanweisung).
  const camX = Math.max(0, Math.min(aw - 1600, world.hero.x - 800));
  const camY = Math.max(0, Math.min(ah - 900, world.hero.y - 450));
  world.camera = { x: camX, y: camY };
  ctx.save();
  ctx.clearRect(0, 0, 1600, 900);
  let shakeX = 0;
  let shakeY = 0;
  if (world.shake > 0 && !options.reducedMotion) {
    shakeX = (Math.random() - 0.5) * world.shake;
    shakeY = (Math.random() - 0.5) * world.shake;
  }
  ctx.translate(-camX + shakeX, -camY + shakeY);

  // 1. Boden
  const bg = img(`assets/arenen/${arena.id}.webp`);
  if (bg.complete && bg.naturalWidth) {
    ctx.drawImage(bg, 0, 0, aw, ah);
  } else {
    ctx.fillStyle = arena.floor_color;
    ctx.fillRect(0, 0, aw, ah);
  }

  // 2. Bodenschatten
  ctx.fillStyle = 'rgba(16, 22, 25, 0.28)';
  const shadow = (x, y, r) => {
    ctx.beginPath();
    ctx.ellipse(x, y + 4, r, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const m of world.monsters) shadow(m.x, m.y, m.radius + 6);
  if (world.boss && !world.boss.dead) shadow(world.boss.x, world.boss.y, world.boss.radius + 10);
  shadow(world.hero.x, world.hero.y, world.hero.radius + 8);

  // 3. Bodenwarnungen (Gefahrenkonturen vor Bodendekor; UI immer oben)
  drawHazard(ctx, world, options);
  for (const w of world.spawnWarnings) drawSpawnWarning(ctx, w);
  for (const f of world.fields) drawField(ctx, f, options);
  for (const m of world.monsters) drawEnemyTelegraph(ctx, world, m, m.data.attack, options);
  if (world.boss && !world.boss.dead && world.boss.aim) {
    const action = world.boss.data.combat.phase_specs[world.boss.phaseIndex]
      .actions[world.boss.actionIndex % world.boss.data.combat.phase_specs[world.boss.phaseIndex].actions.length];
    drawEnemyTelegraph(ctx, world, world.boss, action, options);
  }
  drawHeroWeaponFx(ctx, world);

  // 4. Figuren nach Fußpunkt-Y
  const bodies = [...world.monsters.filter((m) => !m.dead)];
  if (world.boss && !world.boss.dead) bodies.push(world.boss);
  bodies.push(world.hero);
  bodies.sort((a, b) => a.y - b.y);
  for (const b of bodies) {
    if (b.kind === 'hero') drawHero(ctx, world, b, options);
    else if (b.kind === 'boss') drawBoss(ctx, b, options);
    else drawMonster(ctx, b, options);
  }

  // 5. Angriffseffekte
  for (const p of world.enemyProjectiles) {
    ctx.fillStyle = p.color || COLORS.hostile;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#292431';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (const p of world.heroProjectiles) {
    ctx.fillStyle = p.color || COLORS.friendly;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const o of world.orbitals) {
    ctx.fillStyle = o.fromBoss ? COLORS.hostile : (o.color || COLORS.friendly);
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.plateR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#292431';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (const f of world.fx) {
    ctx.globalAlpha = Math.max(0, f.t / 0.35);
    if (f.ring) {
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.ring * (1 - f.t / 0.35 * 0.4), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = f.color;
      ctx.fillRect(f.x - 3, f.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
  }

  // Beute
  for (const p of world.pickups) {
    if (p.type === 'wax') {
      ctx.fillStyle = '#D6AD64';
      ctx.strokeStyle = '#292431';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 6);
      ctx.lineTo(p.x + 5, p.y);
      ctx.lineTo(p.x, p.y + 6);
      ctx.lineTo(p.x - 5, p.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = COLORS.friendly;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Effektsystem v0.4.2: Minen, Kettengeschosse, Heldenfelder, Statuszeichen
  for (const m of world.mines) {
    ctx.strokeStyle = world.time >= m.armedAt ? COLORS.ink : 'rgba(241, 227, 200, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(m.x - 2.5, m.y - 2.5, 5, 5);
  }
  for (const c of world.chainShots) {
    ctx.fillStyle = COLORS.friendly;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const holder of world.heroFields) {
    for (const f of holder.fields) {
      ctx.strokeStyle = f.kind === 'slow' ? COLORS.friendly : COLORS.support;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }
  }
  drawStatusMarks(ctx, world);

  ctx.restore();

  // Trefferblitz des Helden (max 0,08 s, abschaltbar); bildschirmfest.
  if (world.damageFlash > 0 && !options.noFlash) {
    ctx.fillStyle = `rgba(232, 119, 104, ${Math.min(0.18, world.damageFlash * 2)})`;
    ctx.fillRect(0, 0, 1600, 900);
  }
}

function dashPattern(ctx, on) {
  ctx.setLineDash(on ? [10, 8] : []);
}

function strokeFillShape(ctx, shape, { active, options }) {
  ctx.strokeStyle = COLORS.hostile;
  ctx.lineWidth = options.highContrast ? 4.5 : 3;
  dashPattern(ctx, !active);
  ctx.fillStyle = `rgba(232, 119, 104, ${active ? 0.24 : 0.10})`;
  const path = () => {
    ctx.beginPath();
    switch (shape.kind) {
      case 'sector': {
        const a0 = shape.dirRad - (shape.angle * Math.PI / 180) / 2;
        const a1 = shape.dirRad + (shape.angle * Math.PI / 180) / 2;
        ctx.moveTo(shape.x, shape.y);
        ctx.arc(shape.x, shape.y, shape.range, a0, a1);
        ctx.closePath();
        break;
      }
      case 'disk':
        ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
        break;
      case 'line': {
        const c = Math.cos(shape.dirRad);
        const s = Math.sin(shape.dirRad);
        const hw = shape.width / 2;
        const px = -s * hw;
        const py = c * hw;
        ctx.moveTo(shape.x + px, shape.y + py);
        ctx.lineTo(shape.x + c * shape.len + px, shape.y + s * shape.len + py);
        ctx.lineTo(shape.x + c * shape.len - px, shape.y + s * shape.len - py);
        ctx.lineTo(shape.x - px, shape.y - py);
        ctx.closePath();
        break;
      }
      case 'square':
        ctx.rect(shape.x - shape.side / 2, shape.y - shape.side / 2, shape.side, shape.side);
        break;
      case 'fan': {
        for (const off of shape.offsets) {
          const dir = shape.dirRad + off * Math.PI / 180;
          const c = Math.cos(dir);
          const s = Math.sin(dir);
          const hw = shape.width / 2;
          ctx.moveTo(shape.x - s * hw, shape.y + c * hw);
          ctx.lineTo(shape.x + c * shape.len - s * hw, shape.y + s * shape.len + c * hw);
          ctx.lineTo(shape.x + c * shape.len + s * hw, shape.y + s * shape.len - c * hw);
          ctx.lineTo(shape.x + s * hw, shape.y - c * hw);
          ctx.closePath();
        }
        break;
      }
      case 'polyline':
      case 'triangle': {
        const pts = shape.kind === 'triangle' ? [...shape.points, shape.points[0]] : shape.points;
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay] = pts[i];
          const [bx, by] = pts[i + 1];
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
        break;
      }
      case 'ring': {
        // Projektilring: Umfang mit sichtbarer sicherer Lücke (ungefüllt).
        const gapHalf = (shape.gapDeg * Math.PI / 180) / 2;
        ctx.arc(shape.x, shape.y, shape.r, shape.gapDirRad + gapHalf, shape.gapDirRad - gapHalf + Math.PI * 2);
        break;
      }
      case 'orbitplates': {
        ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
        break;
      }
      case 'spawnmarks': {
        const offs = shape.offsets || [[46, 0], [-46, 0]];
        for (let i = 0; i < shape.count; i++) {
          const [ox, oy] = offs[i % offs.length];
          ctx.moveTo(shape.x + ox + 14, shape.y + oy);
          ctx.arc(shape.x + ox, shape.y + oy, 14, 0, Math.PI * 2);
        }
        break;
      }
      default:
        break;
    }
  };
  path();
  const lineLike = ['polyline', 'triangle', 'ring', 'orbitplates', 'spawnmarks'].includes(shape.kind);
  if (!lineLike) ctx.fill();
  if (lineLike && shape.kind !== 'ring') ctx.lineWidth = Math.max(ctx.lineWidth, (shape.width || 6) * (shape.kind === 'polyline' || shape.kind === 'triangle' ? 1 : 0.5));
  ctx.stroke();
  dashPattern(ctx, false);
}

function drawEnemyTelegraph(ctx, world, self, spec, options) {
  if (!self.aim) return;
  if (self.state === 'windup') {
    const shape = telegraphShape(self, spec);
    if (shape && !shape.support) strokeFillShape(ctx, shape, { active: false, options });
    if (shape && shape.support) drawSupportAura(ctx, shape);
  } else if (self.state === 'active') {
    const arch = spec.archetype;
    if (['shot', 'turret', 'guard_shot', 'dual_shot', 'ring', 'summon', 'shield', 'loot'].includes(arch)) return;
    if ((arch === 'fan' || arch === 'triple_beam') && spec.projectile_radius) return;
    if (['slow_field', 'cloud', 'zone', 'trail'].includes(arch)) return; // Felder zeichnen sich selbst
    const shape = activeShape(world, self, spec);
    if (shape && !shape.support) strokeFillShape(ctx, shape, { active: true, options });
    if (shape && shape.support) drawSupportAura(ctx, shape);
  }
}

function drawSupportAura(ctx, shape) {
  // Unterstützungs-Effekte (Buff/Schirm): Violett, kein Schaden.
  ctx.strokeStyle = COLORS.support;
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawField(ctx, f, options) {
  const active = f.t >= f.warnSeconds;
  strokeFillShape(ctx, f.shape, { active, options });
}

function drawHazard(ctx, world, options) {
  const hz = world.run.hazardView;
  if (!hz || hz.phase === 'idle' || !hz.enabled) return;
  const def = hz.def;
  const z = def.zones[hz.zoneIndex];
  ctx.strokeStyle = def.color;
  ctx.lineWidth = options.highContrast ? 4.5 : 3;
  dashPattern(ctx, hz.phase === 'warn');
  ctx.fillStyle = `rgba(232, 119, 104, ${hz.phase === 'active' ? 0.24 : 0.10})`;
  ctx.beginPath();
  if (def.geometry === 'rects') ctx.rect(z[0], z[1], z[2], z[3]);
  else ctx.arc(z[0], z[1], z[2], 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  dashPattern(ctx, false);
}

function drawSpawnWarning(ctx, w) {
  // 0,8 s matter Ring, dann 0,4 s Einblenden.
  const alpha = w.t < 0.8 ? 0.35 : 0.35 + (w.t - 0.8) / 0.4 * 0.45;
  ctx.strokeStyle = `rgba(232, 119, 104, ${Math.min(0.8, alpha)})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w.x, w.y, 22, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHeroWeaponFx(ctx, world) {
  // Kurze freundliche Effekte der Waffenauslösung (Mint/Elfenbein).
  for (const f of world.run.pendingWeaponFires) {
    // Vorbereitung andeuten: dünner Richtungsstrich.
    ctx.strokeStyle = 'rgba(182, 221, 208, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(world.hero.x, world.hero.y);
    ctx.lineTo(world.hero.x + Math.cos(f.dirRad) * 36, world.hero.y + Math.sin(f.dirRad) * 36);
    ctx.stroke();
  }
  for (const w of world.run.weapons) {
    if (!w) continue;
    if (world.time < w.activeUntil && world.time >= w.telegraphUntil - 0.001) {
      const spec = D.weaponsById.get(w.weaponId);
      const geo = spec.geometry;
      ctx.strokeStyle = spec.effect_color;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (geo.shape === 'sector') {
        const range = spec.range * (1 + world.heroStats.rangeBonus);
        const a0 = w.dirRad - (geo.angle * Math.PI / 180) / 2;
        const a1 = w.dirRad + (geo.angle * Math.PI / 180) / 2;
        ctx.moveTo(w.originX, w.originY);
        ctx.arc(w.originX, w.originY, range, a0, a1);
        ctx.closePath();
      } else if (geo.shape === 'rectangle') {
        const range = spec.range * (1 + world.heroStats.rangeBonus);
        ctx.moveTo(w.originX, w.originY);
        ctx.lineTo(w.originX + Math.cos(w.dirRad) * range, w.originY + Math.sin(w.dirRad) * range);
        ctx.lineWidth = geo.width;
        ctx.globalAlpha = 0.4;
      } else if (geo.shape === 'disk') {
        const off = parseFloat(geo.center) || 80;
        ctx.arc(w.originX + Math.cos(w.dirRad) * off, w.originY + Math.sin(w.dirRad) * off, geo.radius, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  // Spiegelschild-Fenster
  const hero = world.hero;
  if (hero.shield && world.time < hero.shield.until) {
    ctx.strokeStyle = 'rgba(182, 221, 208, 0.9)';
    ctx.lineWidth = 5;
    const half = (hero.shield.angle * Math.PI / 180) / 2;
    ctx.beginPath();
    ctx.arc(hero.x, hero.y, 46, hero.shield.dirRad - half, hero.shield.dirRad + half);
    ctx.stroke();
  }
}

function drawSprite(ctx, image, x, y, displayHeight, faceLeft, flash, options) {
  if (!image.complete || !image.naturalWidth) {
    ctx.fillStyle = '#AEC0B9';
    ctx.beginPath();
    ctx.arc(x, y - displayHeight / 2, displayHeight / 2.4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const scale = displayHeight / image.naturalHeight;
  const wpx = image.naturalWidth * scale;
  ctx.save();
  ctx.translate(x, y);
  if (faceLeft) ctx.scale(-1, 1);
  if (flash > 0 && !options.noFlash) ctx.filter = 'brightness(1.6)';
  ctx.drawImage(image, -wpx / 2, -displayHeight + 4, wpx, displayHeight);
  ctx.restore();
}

function drawMonster(ctx, m, options) {
  // Atmen: höchstens 2 % Körperhöhe (asset-vertrag.animation.idle)
  const breathe = options.reducedMotion ? 0 : Math.sin(performance.now() / 420 + m.spawnSeq) * 0.02 + 1;
  const h = m.data.base_stats.render_height * (m.state === 'move' ? breathe : 1);
  drawSprite(ctx, monsterSprite(m), m.x, m.y, h, m.faceLeft, m.hitFlash, options);
  drawHpBar(ctx, m.x, m.y - m.data.base_stats.render_height - 8, 36, m.hp / m.maxHp);
}

function drawBoss(ctx, b, options) {
  const image = img(`assets/boss/${b.data.id}.webp`);
  drawSprite(ctx, image, b.x, b.y, b.data.combat.display_height, b.faceLeft, b.hitFlash, options);
}

function drawHero(ctx, world, hero, options) {
  const image = img('assets/held/knorz.webp');
  // Ausweichen: Körper duckt sich; nie spiegeln (Ring bleibt anatomisch links).
  const squash = hero.dodging > 0 ? 0.82 : 1;
  const h = D.design.units.hero_height * squash;
  drawSprite(ctx, image, hero.x, hero.y, h, false, 0, options);
  if (hero.invuln > 0 && !options.noFlash) {
    ctx.strokeStyle = 'rgba(241, 227, 200, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hero.x, hero.y - h / 2, h / 1.6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Statuszeichen: höchstens 3 je Ziel, Form zusätzlich zur Farbe
// (gemeinsame-regeln vfx: Prioritaet time_mark, root, burn, rend, brittle,
// weakness, slow; Brand Gold, Naht Mauve, Heldeneffekte Mint/Elfenbein).
function drawStatusMarks(ctx, world) {
  const now = world.time;
  const targets = [...world.monsters];
  if (world.boss && !world.boss.dead) targets.push(world.boss);
  for (const tgt of targets) {
    const s = tgt.status;
    if (!s) continue;
    const marks = [];
    if (s.timeMarks && s.timeMarks.size > 0) marks.push({ shape: 'diamond', color: '#F1E3C8' });
    if (s.rootUntil > now) marks.push({ shape: 'bar', color: '#B6DDD0' });
    if (s.burn) marks.push({ shape: 'triangle', color: '#D6AD64' });
    if (s.rend) marks.push({ shape: 'notch', color: '#BD9DC1' });
    if (s.brittles.some((b) => b.until > now)) marks.push({ shape: 'square', color: '#F1E3C8' });
    if (s.weaknesses.some((b) => b.until > now)) marks.push({ shape: 'down', color: '#B5A2CB' });
    if (s.slows.some((b) => b.until > now) || (s.sandUntil > now && s.sandStacks > 0)) marks.push({ shape: 'circle', color: '#B6DDD0' });
    if (s.bookmark && s.bookmark.until > now) marks.push({ shape: 'flag', color: '#F1E3C8' });
    const extra = marks.length - 3;
    const top = (tgt.kind === 'boss' ? tgt.data.combat.display_height : tgt.data.base_stats.render_height) + 16;
    marks.slice(0, 3).forEach((m, i) => {
      const x = tgt.x - 14 + i * 14;
      const y = tgt.y - top;
      ctx.fillStyle = m.color;
      ctx.strokeStyle = '#292431';
      ctx.lineWidth = 1;
      ctx.beginPath();
      switch (m.shape) {
        case 'triangle': ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4); ctx.closePath(); break;
        case 'square': ctx.rect(x - 4, y - 4, 8, 8); break;
        case 'diamond': ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); break;
        case 'down': ctx.moveTo(x - 5, y - 4); ctx.lineTo(x + 5, y - 4); ctx.lineTo(x, y + 5); ctx.closePath(); break;
        case 'bar': ctx.rect(x - 5, y - 2, 10, 4); break;
        case 'notch': ctx.moveTo(x - 5, y + 4); ctx.lineTo(x, y - 5); ctx.lineTo(x + 5, y + 4); break;
        case 'flag': ctx.rect(x - 1, y - 5, 2, 10); ctx.rect(x + 1, y - 5, 5, 4); break;
        default: ctx.arc(x, y, 4.5, 0, Math.PI * 2); break;
      }
      ctx.fill();
      ctx.stroke();
    });
    if (extra > 0) {
      ctx.fillStyle = '#F1E3C8';
      ctx.font = '11px sans-serif';
      ctx.fillText(`+${extra}`, tgt.x + 30, tgt.y - top + 4);
    }
  }
}

function drawHpBar(ctx, x, y, w, frac) {
  if (frac >= 1 || frac <= 0) return;
  ctx.fillStyle = 'rgba(13, 30, 35, 0.8)';
  ctx.fillRect(x - w / 2, y, w, 5);
  ctx.fillStyle = '#E87768';
  ctx.fillRect(x - w / 2 + 1, y + 1, (w - 2) * Math.max(0, frac), 3);
}
