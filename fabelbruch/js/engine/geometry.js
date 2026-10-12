// Treffergeometrie. Alle Formen folgen den Festlegungen der Fachdateien:
// sector (Winkel in Grad), disk, line/rectangle (Breite), ring (Projektilring
// mit sicherer Lücke), square, aura, polyline. Dekor erzeugt nie Treffer.

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

export function angleOf(dx, dy) {
  return Math.atan2(dy, dx);
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// Kreis (Ziel mit Radius r) in Sektor um (ox,oy), Richtung dirRad,
// Öffnungswinkel degrees, Reichweite range?
export function circleInSector(tx, ty, r, ox, oy, dirRad, degrees, range) {
  const d = dist(tx, ty, ox, oy);
  if (d - r > range) return false;
  if (d <= r) return true;
  const half = (degrees * Math.PI / 180) / 2;
  const ang = angleOf(tx - ox, ty - oy);
  const extra = Math.asin(Math.min(1, r / d));
  return Math.abs(angleDiff(ang, dirRad)) <= half + extra;
}

export function circleInDisk(tx, ty, r, cx, cy, radius) {
  return dist(tx, ty, cx, cy) <= radius + r;
}

// Kreis in Rechteck/Linie: von (ox,oy) in Richtung dirRad, Länge length, Breite width.
export function circleInLine(tx, ty, r, ox, oy, dirRad, length, width) {
  const cos = Math.cos(dirRad);
  const sin = Math.sin(dirRad);
  const relX = (tx - ox) * cos + (ty - oy) * sin;
  const relY = -(tx - ox) * sin + (ty - oy) * cos;
  const half = width / 2;
  const nx = Math.max(0, Math.min(length, relX));
  const ny = Math.max(-half, Math.min(half, relY));
  return Math.hypot(relX - nx, relY - ny) <= r;
}

export function circleInRect(tx, ty, r, x, y, w, h) {
  const nx = Math.max(x, Math.min(x + w, tx));
  const ny = Math.max(y, Math.min(y + h, ty));
  return dist(tx, ty, nx, ny) <= r;
}

// Polylinie mit Breite width; points = [[x,y],...] in Weltkoordinaten.
export function circleInPolyline(tx, ty, r, points, width) {
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const len = dist(ax, ay, bx, by);
    const dir = angleOf(bx - ax, by - ay);
    if (circleInLine(tx, ty, r, ax, ay, dir, len, width)) return true;
  }
  return false;
}

// Punkt an Arena-Grenzen und Hindernissen entlang bewegen (Kreiskollision).
export function resolveMove(x, y, radius, nx, ny, arena, blocksKey) {
  const [px, py, pw, ph] = arena.playable_rect;
  let rx = nx;
  let ry = ny;
  rx = Math.max(px + radius, Math.min(px + pw - radius, rx));
  ry = Math.max(py + radius, Math.min(py + ph - radius, ry));
  for (const o of arena.obstacles) {
    if (!o[blocksKey]) continue;
    const d = dist(rx, ry, o.center[0], o.center[1]);
    const minD = o.radius + radius;
    if (d < minD && d > 0.0001) {
      const push = (minD - d);
      rx += ((rx - o.center[0]) / d) * push;
      ry += ((ry - o.center[1]) / d) * push;
    } else if (d <= 0.0001) {
      rx += minD;
    }
  }
  rx = Math.max(px + radius, Math.min(px + pw - radius, rx));
  ry = Math.max(py + radius, Math.min(py + ph - radius, ry));
  return [rx, ry];
}
