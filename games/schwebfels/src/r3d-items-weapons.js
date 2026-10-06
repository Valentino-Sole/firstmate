/* Helden von Schwebfels - Waffen (Version 5) nach den Tafeln 14 bis 17 des Grafikkonzepts:
   Schwerter, Aexte, Haemmer, Dolche, Sicheln, Kurzschwerter, Boegen, Armbrueste, Speere und Magierstaebe.
   Seltenheit veraendert den Aufbau: Normal (Eisen, Holz, Leder, schlicht), Gruen (Bronzebeschlaege, Wicklung,
   verfeinerte Kontur), Blau (gebläuter Stahl mit Schneidenrand, leuchtende Runen, gefasster Stein), Episch
   (gestaffelte Goldrahmen, Zacken, grosses Kulturzeichen), Legendaer (helles Edelmetall und Elfenbein,
   ikonisches Merkmal: Albion Sonnenkranz, Midgard Kristallkrone, Hibernia Geweih und Ranken).
   Lage: Griff im Ursprung, Klinge oder Schaft entlang +y, Schneide entlang +x, Flachseite entlang z.
   Boegen liegen in der linken Hand (Sehne bei -x), Armbrueste mit Schaft entlang +x ueber der Faust. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const R = (SB.R3D = SB.R3D || {});
  const IT = R.items;
  if (!IT) return;
  const { lathe, tube, slab, gem, ring, box, sphere, at } = IT.kit;
  const motif = IT.motif;
  const F = IT.forms;
  const PI = Math.PI;
  let T = null;
  const form = (fn) =>
    function (kit, v, r, c, vis) {
      T = R.T();
      return fn(kit, v | 0, r | 0, c || "midgard", vis || {});
    };
  const cl = (x, a, b) => Math.max(a == null ? 0 : a, Math.min(b == null ? 1 : b, x));

  /* ---------- Werkstoffe je Seltenheit ---------- */
  function mats(r) {
    return {
      blade: ["metal", "steel", "blued", "blued", "pale"][r],
      edge: r === 0 ? "metal" : "steel",
      fit: ["metal", "bronze", "silver", "gold", "gold"][r],
      haft: r >= 4 ? "ivory" : "wood",
      grip: r >= 1 ? "wrap" : "leather",
    };
  }

  /* ---------- Bausteine ---------- */
  // Klinge entlang einer Mittellinie in der xy-Ebene. prof(t) liefert wa (Halbbreite zur Schneide, rechte
  // Normalenseite), wb (Gegenseite), th (halbe Dicke) und fd (Tiefe der Hohlkehle 0 bis 1).
  // spine: Gegenseite als stumpfer Ruecken (einschneidige Klingen).
  function sweep(path, prof, spine) {
    const n = path.length;
    const RING = 11;
    const pos = [];
    const uv = [];
    const idx = [];
    for (let i = 0; i < n; i++) {
      const p = path[i];
      const a = path[Math.max(0, i - 1)];
      const b = path[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0];
      let ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      const nx = ty;
      const ny = -tx;
      const q = prof(i / (n - 1));
      const wa = Math.max(q.wa, 0.0004);
      const wb = Math.max(q.wb != null ? q.wb : q.wa, 0.0004);
      const th = Math.max(q.th, 0.0003);
      const f = 1 - (q.fd || 0);
      const sp = spine ? 0.78 : 0;
      const sec = [[wa, 0], [wa * 0.42, th], [wa * 0.14, th * f], [-wb * 0.14, th * f], [-wb * 0.42, th], [-wb, th * sp], [-wb, -th * sp], [-wb * 0.42, -th], [-wb * 0.14, -th * f], [wa * 0.14, -th * f], [wa * 0.42, -th]];
      for (const [s, z] of sec) {
        pos.push(p[0] + nx * s, p[1] + ny * s, z);
        uv.push(s * 3 + 0.5, p[1] * 2);
      }
    }
    for (let i = 0; i < n - 1; i++)
      for (let k = 0; k < RING; k++) {
        const a = i * RING + k;
        const b = i * RING + ((k + 1) % RING);
        idx.push(a, a + RING, b, b, a + RING, b + RING);
      }
    // Kappen an beiden Enden
    for (const [ring0, dir] of [[0, 1], [n - 1, -1]]) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let k = 0; k < RING; k++) {
        cx += pos[(ring0 * RING + k) * 3];
        cy += pos[(ring0 * RING + k) * 3 + 1];
        cz += pos[(ring0 * RING + k) * 3 + 2];
      }
      const ci = pos.length / 3;
      pos.push(cx / RING, cy / RING, cz / RING);
      uv.push(0.5, 0.5);
      for (let k = 0; k < RING; k++) {
        const a = ring0 * RING + k;
        const b = ring0 * RING + ((k + 1) % RING);
        if (dir > 0) idx.push(ci, a, b);
        else idx.push(ci, b, a);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const ng = g.toNonIndexed();
    ng.computeVertexNormals();
    return ng;
  }
  // Flache Form, deren Dicke zur Schneide hin abnimmt: taper(x, y) zwischen 0 und 1
  function wedge(pts, depth, taper, bevel) {
    const g = slab(pts, depth, bevel || 0, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * taper(p.getX(i), p.getY(i)));
    const ng = g.index ? g.toNonIndexed() : g;
    ng.computeVertexNormals();
    return ng;
  }
  function arc(cx, cy, rad, a0, a1, n) {
    const o = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      o.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
    return o;
  }
  function bez(p0, p1, p2, n) {
    const o = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      o.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
    }
    return o;
  }
  // Umriss um einen Ankerpunkt schrumpfen (Einlage in einer Klinge)
  const shrink = (pts, ax, ay, k) => pts.map((p) => [ax + (p[0] - ax) * k, ay + (p[1] - ay) * k]);
  const mirrorX = (pts) => pts.map((p) => [-p[0], p[1]]).reverse();
  function helix(kit, cls, y0, y1, rad, turns, tr, ph, dir) {
    const pts = [];
    const n = Math.max(8, turns * 8);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = ph + (dir || 1) * t * turns * PI * 2;
      pts.push([Math.cos(a) * rad, y0 + (y1 - y0) * t, Math.sin(a) * rad]);
    }
    kit.add(cls, tube(pts, tr, n, 4));
  }
  // Griff mit Wicklung; cross legt eine zweite Lage ueber Kreuz, wire eine Drahtwicklung aus Metall
  function grip(kit, cls, y0, y1, rad, cross, wire) {
    kit.add(cls, lathe([[rad * 0.9, y0], [rad, y0 + 0.004], [rad * 1.04, (y0 + y1) / 2], [rad, y1 - 0.004], [rad * 0.9, y1]], 10));
    const turns = Math.max(3, Math.round((y1 - y0) / 0.02));
    helix(kit, wire || cls, y0 + 0.003, y1 - 0.003, rad * 1.02, turns, rad * (wire ? 0.12 : 0.2), 0, 1);
    if (cross) helix(kit, cls, y0 + 0.003, y1 - 0.003, rad * 1.02, turns, rad * 0.16, PI, -1);
  }
  function spike(kit, cls, p, d, len, rad, seg) {
    const g = new T.ConeGeometry(rad, len, seg || 5);
    g.translate(0, len / 2, 0);
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(d[0], d[1], d[2]).normalize());
    kit.add(cls, g, new T.Matrix4().compose(new T.Vector3(p[0], p[1], p[2]), q, new T.Vector3(1, 1, 1)));
  }
  // Gebogenes, spitz zulaufendes Horn oder Zacke entlang von Punkten
  function horn(kit, cls, pts, r0, seg) {
    kit.add(cls, tube(pts, r0, seg || 10, 6, (t) => Math.max(0.1, 1 - t * 0.92)));
  }
  function leaf(kit, cls, m, len, w) {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push([Math.sin(t * PI) * w * (1 - 0.35 * t), t * len]);
    }
    for (let i = 9; i > 0; i--) {
      const t = i / 10;
      pts.push([-Math.sin(t * PI) * w * (1 - 0.35 * t), t * len]);
    }
    kit.add(cls, slab(pts, w * 0.12, w * 0.05, 4), m);
  }
  // Geweih: Hauptstange mit Sprossen in der xy-Ebene, side = Biegerichtung
  function antler(kit, cls, base, dir, len, side, rad) {
    const d = new T.Vector2(dir[0], dir[1]).normalize();
    const pp = new T.Vector2(-d.y, d.x).multiplyScalar(side);
    const P = (t, bend) => [base[0] + d.x * len * t + pp.x * len * bend, base[1] + d.y * len * t + pp.y * len * bend, base[2] || 0];
    const main = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      main.push(P(t, 0.22 * Math.sin(t * PI * 0.85)));
    }
    horn(kit, cls, main, rad || 0.008, 14);
    for (const t of [0.35, 0.62, 0.86]) {
      const s = P(t, 0.22 * Math.sin(t * PI * 0.85));
      const td = d.clone().rotateAround(new T.Vector2(0, 0), -side * 0.95);
      const L = len * (0.36 - t * 0.12);
      horn(kit, cls, [s, [s[0] + td.x * L * 0.55, s[1] + td.y * L * 0.55, s[2]], [s[0] + td.x * L + d.x * L * 0.25, s[1] + td.y * L + d.y * L * 0.25, s[2]]], (rad || 0.008) * 0.7, 8);
    }
  }
  // Zerkluefteter Stein (feste Verschiebung je Ecke, kein Zufall)
  function rock(rad, sx, sy, sz) {
    const g = new T.IcosahedronGeometry(rad, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const h = Math.sin(x * 129.898 + y * 782.33 + z * 377.19) * 43758.5453;
      const k = 0.86 + 0.22 * (h - Math.floor(h));
      p.setXYZ(i, x * k * (sx || 1), y * k * (sy || 1), z * k * (sz || 1));
    }
    g.computeVertexNormals();
    return g;
  }
  // Runen aus Strichen in der xy-Ebene (Flaeche nach +z); s = halbe Zeichenhoehe
  const GLYPHS = [
    [[0, -1, 0, 1], [0, 0.25, 0.55, 0.75], [0, -0.25, 0.55, 0.25]],
    [[0, -1, 0, 1], [0, 1, 0.5, 0.45], [0.5, 0.45, 0, 0], [0, 0, 0.5, -1]],
    [[0, -1, 0, 1], [0, 0.3, -0.5, 0.9], [0, 0.3, 0.5, 0.9]],
    [[0, -1, 0, 1], [0, 1, -0.5, 0.4], [0, 1, 0.5, 0.4]],
    [[-0.45, -1, 0.45, 1], [0.45, -1, -0.45, 1]],
    [[0, 1, 0.45, 0.3], [0.45, 0.3, 0, -0.4], [0, -0.4, -0.45, 0.3], [-0.45, 0.3, 0, 1], [0, -0.4, -0.4, -1], [0, -0.4, 0.4, -1]],
  ];
  function rune(kit, cls, m, k, s) {
    if (cls === "gem") cls = "rune";
    for (const [x0, y0, x1, y1] of GLYPHS[k % GLYPHS.length]) {
      const L = Math.hypot(x1 - x0, y1 - y0) * s;
      const g = new T.BoxGeometry(s * 0.2, L + s * 0.18, s * 0.12);
      g.rotateZ(Math.atan2(-(x1 - x0), y1 - y0));
      g.translate(((x0 + x1) / 2) * s, ((y0 + y1) / 2) * s, 0);
      kit.add(cls, g, m);
    }
  }
  // Runenreihe auf beiden Flachseiten (z und -z)
  function runeRow(kit, cls, y0, y1, n, s, z, x, seed) {
    for (let i = 0; i < n; i++) {
      const y = n === 1 ? (y0 + y1) / 2 : y0 + ((y1 - y0) * i) / (n - 1);
      rune(kit, cls, at(x || 0, y, z), (seed || 0) + i, s);
      rune(kit, cls, at(x || 0, y, -z, 0, PI, 0), (seed || 0) + i + 3, s);
    }
  }
  // Runen rund um einen Schaft
  function runeRing(kit, cls, y, rad, n, s, seed) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2;
      rune(kit, cls, at(Math.sin(a) * rad, y, Math.cos(a) * rad, 0, a, 0), (seed || 0) + i, s);
    }
  }
  // Kulturendstueck: Albion Kleeblatt, Midgard Wuerfel, Hibernia Schnecke
  function finial(kit, cls, c, x, y, s, dx) {
    if (c === "albion") {
      for (const [ox, oy] of [[0.75, 0], [0.2, 0.6], [0.2, -0.6]]) kit.add(cls, sphere(s * 0.55, 8, 6), at(x + dx * ox * s, y + oy * s, 0));
    } else if (c === "hibernia") {
      kit.add(cls, ring(s * 0.62, s * 0.24, 14, 5, PI * 1.6), at(x + dx * s * 0.45, y + s * 0.2, 0, 0, dx > 0 ? 0 : PI, -PI / 2));
    } else kit.add(cls, box(s * 1.25, s * 1.25, s * 1.25, s * 0.25), at(x + dx * s * 0.5, y, 0, 0, 0, PI / 4));
  }
  // Ikonisches legendaeres Zeichen in der xy-Ebene um (x, y, z): Sonnenkranz, Kristallstern, Geweih mit Ranken
  function legend(kit, c, x, y, z, s) {
    if (c === "albion") {
      kit.add("gold", ring(s, s * 0.12, 32, 6), at(x, y, z));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * PI * 2;
        const L = i % 2 ? s * 0.35 : s * 0.6;
        spike(kit, "gold", [x + Math.cos(a) * s, y + Math.sin(a) * s, z], [Math.cos(a), Math.sin(a), 0], L, s * 0.1, 4);
      }
      kit.add("gem", gem(s * 0.32, s * 0.5, 8), at(x, y, z, PI / 2, 0, 0, [1, 0.5, 1]));
    } else if (c === "hibernia") {
      for (const sd of [-1, 1]) antler(kit, "ivory", [x + sd * s * 0.2, y + s * 0.1, z], [sd * 0.55, 1], s * 1.5, -sd, s * 0.09);
      for (const sd of [-1, 1]) leaf(kit, "gold", at(x + sd * s * 0.3, y - s * 0.2, z, 0, 0, sd * 2.2), s * 0.8, s * 0.28);
      kit.add("gem", sphere(s * 0.25, 10, 8), at(x, y, z));
    } else {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + PI / 2;
        kit.add("gem", gem(s * 0.18, s * 0.9, 6, 0.35), at(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5, z, 0, 0, a - PI / 2));
      }
      kit.add("silver", ring(s * 0.42, s * 0.07, 6, 4), at(x, y, z, 0, 0, PI / 6));
      kit.add("gem", gem(s * 0.25, s * 0.4, 6), at(x, y, z, PI / 2, 0, 0, [1, 0.6, 1]));
    }
  }
  // Knauf unterhalb von y; liefert die Unterkante
  function pommel(kit, cls, style, y, s) {
    if (style === "wheel") {
      kit.add(cls, new T.CylinderGeometry(0.026 * s, 0.026 * s, 0.02 * s, 18).rotateX(PI / 2), at(0, y - 0.024 * s, 0));
      return { y: y - 0.05 * s, c: y - 0.024 * s, f: 0.011 * s };
    }
    if (style === "ball") {
      kit.add(cls, lathe([[0.002, -0.021], [0.015, -0.016], [0.021, 0], [0.015, 0.016], [0.004, 0.02]].map((p) => [p[0] * s, p[1] * s]), 8, true), at(0, y - 0.02 * s, 0));
      return { y: y - 0.041 * s, c: y - 0.02 * s, f: 0.019 * s };
    }
    if (style === "pear") {
      kit.add(cls, lathe([[0.003, -0.042], [0.014, -0.036], [0.02, -0.022], [0.016, -0.008], [0.009, 0]].map((p) => [p[0] * s, p[1] * s]), 10), at(0, y, 0));
      return { y: y - 0.042 * s, c: y - 0.022 * s, f: 0.018 * s };
    }
    if (style === "lobed") {
      kit.add(cls, box(0.052 * s, 0.012 * s, 0.024 * s, 0.003 * s), at(0, y - 0.006 * s, 0));
      kit.add(cls, sphere(0.013 * s, 10, 8), at(0, y - 0.022 * s, 0, 0, 0, 0, [1, 1, 0.8]));
      for (const sx of [-1, 1]) kit.add(cls, sphere(0.01 * s, 8, 6), at(sx * 0.019 * s, y - 0.016 * s, 0, 0, 0, 0, [1, 1, 0.8]));
      return { y: y - 0.034 * s, c: y - 0.02 * s, f: 0.011 * s };
    }
    if (style === "ring") {
      kit.add(cls, lathe([[0.012 * s, 0], [0.008 * s, -0.008 * s]], 8), at(0, y, 0));
      kit.add(cls, ring(0.014 * s, 0.0045 * s, 18, 6), at(0, y - 0.022 * s, 0));
      return { y: y - 0.04 * s, c: y - 0.022 * s, f: 0.005 * s, ring: 0.014 * s };
    }
    // Spitzknauf
    kit.add(cls, lathe([[0.012 * s, 0], [0.016 * s, -0.008 * s], [0.002 * s, -0.04 * s]], 6, true), at(0, y, 0));
    return { y: y - 0.04 * s, c: y - 0.01 * s, f: 0.01 * s };
  }
  // Holzstiel mit Griffwicklung um die Hand und Endkappe je Seltenheit
  function haft(kit, m, r, y0, y1, rad, gripTop) {
    kit.add(m.haft, lathe([[rad * 1.28, y0], [rad * 1.36, y0 + 0.018], [rad * 1.06, y0 + 0.05], [rad, y0 + 0.2], [rad * 0.94, y1]], 10));
    grip(kit, m.grip, -0.1, gripTop || 0.075, rad * 1.1, r >= 1, r >= 2 ? m.fit : null);
    if (r >= 1) {
      kit.add(m.fit, lathe([[rad * 1.44, y0 + 0.028], [rad * 1.5, y0 + 0.004], [rad * 1.1, y0 - 0.008]], 10));
      kit.add(m.fit, ring(rad * 1.12, rad * 0.24, 12, 5), at(0, (gripTop || 0.075) + 0.008, 0, PI / 2));
      kit.add(m.fit, ring(rad * 1.12, rad * 0.24, 12, 5), at(0, -0.104, 0, PI / 2));
    }
    if (r >= 2) spike(kit, m.fit, [0, y0 - 0.006, 0], [0, -1, 0], 0.035, rad * 0.9, 6);
    if (r >= 3) kit.add("gem", gem(rad * 0.7, rad * 1.6, 6), at(0, y0 + 0.012, rad * 1.3, PI / 2, 0, 0, [1, 0.5, 1]));
  }

  /* ===== Krieger: Schwerter (Langschwert, Breitschwert, Bastardschwert, Runenschwert) ===== */
  F.schwert = form(function (kit, v, r, c) {
    const m = mats(r);
    const P = [
      { L: 0.84, w0: 0.034, w1: 0.025, tip: 0.17, grip: 0.15, g: 0.11, pm: "wheel" },
      { L: 0.74, w0: 0.05, w1: 0.045, tip: 0.1, grip: 0.14, g: 0.115, pm: "ball" },
      { L: 0.94, w0: 0.037, w1: 0.021, tip: 0.24, grip: 0.24, g: 0.13, pm: "pear" },
      { L: 0.8, w0: 0.034, w1: 0.036, tip: 0.24, grip: 0.15, g: 0.09, pm: "lobed" },
    ][v % 4];
    const yg = 0.075;
    const yb = yg + 0.012;
    const L = P.L * (1 + r * 0.025);
    const fuller = r >= 1 || v === 3;
    const prof = (t) => {
      let w = P.w0 + (P.w1 - P.w0) * t;
      if (v === 3) w *= 1 + 0.24 * Math.sin(Math.min(1, t / 0.82) * PI);
      if (v === 1) w *= 1 - 0.06 * Math.sin(t * PI);
      if (t > 1 - P.tip) w *= Math.pow(Math.max(0, (1 - t) / P.tip), 0.8);
      const fd = fuller ? 0.6 * cl((0.72 - t) / 0.08) * cl(t / 0.03) : 0;
      return { wa: w, th: 0.0078 * (1 - t * 0.45), fd };
    };
    const path = [];
    for (let i = 0; i <= 24; i++) path.push([0, yb + (L * i) / 24]);
    // ab Blau: gebläuter Kern mit hellem Schneidenrand
    kit.add(r === 2 || r === 3 ? "steel" : m.blade, sweep(path, prof));
    if (r === 2 || r === 3) kit.add("blued", sweep(path, (t) => {
      const q = prof(t);
      return { wa: q.wa * 0.7, th: q.th * 1.07, fd: q.fd };
    }));
    const zf = 0.0078 * 0.9 * 0.4 * 1.07 + 0.0004;
    if (v === 3 || r >= 2) runeRow(kit, r >= 2 ? "gem" : "blued", yb + 0.07, yb + L * 0.52, v === 3 ? 5 : 4, 0.014, zf, 0, v);
    if (r === 3)
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const pts = [];
          for (let i = 0; i <= 8; i++) {
            const t = 0.03 + (i / 8) * 0.62;
            pts.push([sx * prof(t).wa * 0.52, yb + L * t, sz * prof(t).th * 0.8]);
          }
          kit.add("gold", tube(pts, 0.0017, 16, 4));
        }
    if (r >= 4) for (const sz of [-1, 1]) kit.add("gold", box(0.009, L * 0.6, 0.002), at(0, yb + L * 0.33, sz * zf));
    // Parierstange je Form
    const G = P.g * (1 + r * 0.07);
    let ey = yg;
    if (v === 0) kit.add(m.fit, box(G * 2, 0.018, 0.03, 0.005), at(0, yg, 0));
    else if (v === 1) {
      ey = yg + 0.03;
      kit.add(m.fit, tube([[-G, ey, 0], [-G * 0.55, yg + 0.004, 0], [0, yg - 0.002, 0], [G * 0.55, yg + 0.004, 0], [G, ey, 0]], 0.0105, 18, 6, (t) => 1 - 0.3 * Math.abs(2 * t - 1)));
    } else if (v === 2) {
      ey = yg - 0.03;
      kit.add(m.fit, tube([[-G, ey, 0], [-G * 0.55, yg - 0.004, 0], [0, yg + 0.002, 0], [G * 0.55, yg - 0.004, 0], [G, ey, 0]], 0.0105, 18, 6, (t) => 1 - 0.3 * Math.abs(2 * t - 1)));
    } else {
      const lens = [];
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * PI * 2;
        lens.push([Math.cos(a) * G, Math.sin(a) * 0.013 * (1 + 0.4 * Math.cos(a) ** 2)]);
      }
      kit.add(m.fit, slab(lens, 0.03, 0.004, 4), at(0, yg, 0));
    }
    if (r >= 1 && v !== 3) for (const sx of [-1, 1]) finial(kit, m.fit, c, sx * G, ey, 0.012, sx);
    if (r >= 1) kit.add(m.fit, slab([[0, -0.02], [0.018, 0], [0, 0.03], [-0.018, 0]], 0.03, 0.003), at(0, yg, 0));
    if (r === 2)
      for (const sz of [-1, 1]) {
        kit.add("gem", gem(0.009, 0.016, 6), at(0, yg + 0.002, sz * 0.02, PI / 2, 0, 0, [1, 0.6, 1]));
        kit.add("silver", ring(0.01, 0.0026, 16, 5), at(0, yg + 0.002, sz * 0.02));
      }
    if (r >= 3) {
      for (const sz of [-1, 1]) {
        motif(kit, "gold", c, 0, yg + 0.004, sz * 0.026, 0.03);
        kit.add("gem", gem(0.008, 0.014, 6), at(0, yg + 0.004, sz * 0.03, PI / 2, 0, 0, [1, 0.6, 1]));
      }
      for (const sx of [-1, 1]) {
        horn(kit, m.fit, [[sx * G * 0.5, yg, 0], [sx * G * 0.62, yg + 0.025, 0], [sx * G * 0.55, yg + 0.05, 0]], 0.005);
        horn(kit, m.fit, [[sx * G * 0.42, yg, 0], [sx * G * 0.52, yg - 0.018, 0], [sx * G * 0.46, yg - 0.034, 0]], 0.004);
      }
    }
    if (r >= 4) legend(kit, c, 0, yg + 0.012, -0.004, 0.06);
    // Griff und Knauf
    const y0 = yg - 0.01 - P.grip;
    kit.add(m.fit, lathe([[0.017, yg - 0.013], [0.019, yg - 0.007]], 10));
    grip(kit, m.grip, y0, yg - 0.009, 0.0145, r >= 1, r >= 2 ? m.fit : null);
    const pm = pommel(kit, m.fit, P.pm, y0, 1 + r * 0.08);
    if (r >= 2) for (const sz of [-1, 1]) kit.add("gem", gem(0.006, 0.01, 6), at(0, pm.c, sz * pm.f, PI / 2, 0, 0, [1, 0.6, 1]));
    if (r >= 3) spike(kit, m.fit, [0, pm.y + 0.004, 0], [0, -1, 0], 0.03, 0.008, 6);
  });

  /* ===== Krieger: Aexte (Streitaxt, Bartaxt, Doppelaxt, Kriegsaxt) ===== */
  function axeOutline(v) {
    if (v === 0) return [[0.02, 0.026], [0.08, 0.04], ...arc(0.06, 0, 0.12, 0.74, -0.8, 12), [0.08, -0.045], [0.02, -0.03]];
    if (v === 1) return [[0.02, 0.03], [0.1, 0.046], ...arc(0.06, -0.03, 0.11, 0.85, -1.2, 12), [0.085, -0.175], [0.062, -0.125], [0.034, -0.055], [0.02, -0.03]];
    if (v === 2) return [[0.02, 0.03], ...bez([0.05, 0.04], [0.1, 0.05], [0.145, 0.122], 5), ...arc(0, 0, 0.185, 0.72, -0.72, 12), ...bez([0.145, -0.122], [0.1, -0.05], [0.05, -0.04], 5), [0.02, -0.03]];
    return [[0.02, 0.03], ...bez([0.06, 0.045], [0.1, 0.08], [0.125, 0.15], 5), ...arc(0.03, 0, 0.2, 0.86, -0.9, 14), ...bez([0.125, -0.158], [0.095, -0.09], [0.055, -0.05], 5), [0.02, -0.03]];
  }
  F.axt = form(function (kit, v, r, c) {
    const m = mats(r);
    const top = v === 3 ? 0.66 : 0.58;
    const ye = top - 0.07;
    haft(kit, m, r, -0.15, top + 0.012, 0.0175);
    // Auge (Tuelle) und Blaetter
    kit.add(m.blade, box(0.05, 0.1, 0.044, 0.008), at(0, ye, 0));
    const out = axeOutline(v);
    const xmax = Math.max(...out.map((p) => p[0]));
    const taper = (x) => 1 - 0.86 * Math.pow(cl((Math.abs(x) - 0.028) / (xmax - 0.028)), 0.9);
    const D = 0.03;
    const sides = v === 2 ? [1, -1] : [1];
    const inner = shrink(out, 0.02, 0, 0.8);
    for (const sx of sides) {
      const o = sx > 0 ? out : mirrorX(out);
      const ii = sx > 0 ? inner : mirrorX(inner);
      kit.add(r >= 2 ? m.edge : m.blade, wedge(o, D, taper, 0.002), at(0, ye, 0));
      if (r >= 2) kit.add(r >= 4 ? "ivory" : m.blade, wedge(ii, D * 1.12, taper, 0.002), at(0, ye, 0));
      const surf = (x) => (D / 2 + 0.002) * 1.12 * taper(x);
      if (r >= 2) for (const sz of [-1, 1]) rune(kit, "gem", at(sx * 0.1, ye + (v === 1 ? -0.03 : 0), sz * (surf(0.1) + 0.0006), 0, sz < 0 ? PI : 0, 0), v + (sz < 0 ? 2 : 0), 0.022);
      if (r >= 3)
        for (const sz of [-1, 1]) {
          const pts = ii.filter((p, k) => k % 2 === 0).map((p) => [p[0], ye + p[1], sz * (surf(p[0]) + 0.0012)]);
          pts.push(pts[0]);
          kit.add("gold", tube(pts, 0.0028, 64, 4));
        }
      if (r >= 4)
        for (const sz of [-1, 1]) {
          const fil = [];
          for (let i = 0; i <= 12; i++) {
            const t = i / 12;
            const a = t * PI * 1.6;
            fil.push([sx * (0.05 + t * 0.07), ye + Math.sin(a) * 0.035 * (1 - t * 0.5), 0]);
          }
          kit.add("gold", tube(fil.map((p) => [p[0], p[1], sz * (surf(p[0]) + 0.001)]), 0.002, 24, 4));
        }
    }
    if (r >= 1) for (const sz of [-1, 1]) for (const oy of [-0.025, 0.025]) kit.add(m.fit, sphere(0.0055, 6, 5), at(0.0, ye + oy, sz * 0.023));
    if (r >= 1) for (const sz of [-1, 1]) kit.add(m.fit, box(0.012, 0.16, 0.004, 0.001), at(0, ye - 0.12, sz * 0.019));
    if (v === 3 || r >= 3) spike(kit, m.blade, [0, ye + 0.048, 0], [0, 1, 0], v === 3 ? 0.1 : 0.06, 0.017, 4);
    if (v === 3) horn(kit, m.blade, [[-0.022, ye, 0], [-0.07, ye - 0.005, 0], [-0.12, ye - 0.035, 0]], 0.017);
    else if (r >= 3 && v !== 2) horn(kit, m.fit, [[-0.022, ye, 0], [-0.055, ye, 0], [-0.08, ye - 0.025, 0]], 0.012);
    if (r >= 3) for (const sz of [-1, 1]) motif(kit, "gold", c, 0, ye, sz * 0.024, 0.026);
    if (r >= 4) legend(kit, c, 0, ye + 0.075, 0, 0.04);
  });

  /* ===== Krieger: Haemmer (Streitkolben, Kriegshammer, Morgenstern, Donnerhammer) ===== */
  F.hammer = form(function (kit, v, r, c) {
    const m = mats(r);
    const top = v === 3 ? 0.6 : 0.54;
    haft(kit, m, r, -0.15, top - 0.02, 0.0185);
    const head = r >= 4 ? "ivory" : m.blade;
    const yh = top - 0.05;
    if (v === 0) {
      kit.add(m.blade, lathe([[0.02, yh - 0.11], [0.03, yh - 0.08], [0.034, yh + 0.03], [0.022, yh + 0.065], [0.004, yh + 0.08]], 8));
      const n = r >= 2 ? 8 : 6;
      const fl = r >= 3 ? [[0.02, -0.085], [0.07, -0.045], [0.088, 0.02], [0.07, 0.07], [0.02, 0.072]] : [[0.02, -0.08], [0.06, -0.03], [0.066, 0.03], [0.02, 0.064]];
      const tp = (x) => 1 - 0.7 * cl((x - 0.02) / 0.07);
      for (let i = 0; i < n; i++) kit.add(i % 2 && r >= 2 ? m.edge : head, wedge(fl, 0.013, tp, 0.0015), at(0, yh, 0, 0, (i / n) * PI * 2, 0));
      if (r >= 2) runeRing(kit, "gem", yh - 0.095, 0.0265, 4, 0.008, 1);
      if (r >= 3) spike(kit, m.fit, [0, yh + 0.075, 0], [0, 1, 0], 0.06, 0.012, 6);
      if (r >= 4) legend(kit, c, 0, yh + 0.17, 0, 0.04);
      return;
    }
    if (v === 2) {
      const R0 = 0.055 + r * 0.004;
      kit.add(head, new T.IcosahedronGeometry(R0, 1), at(0, yh, 0));
      kit.add(m.fit, ring(R0 * 1.0, 0.007, 24, 5), at(0, yh, 0, PI / 2));
      const n = [10, 12, 16, 18, 20][r];
      const ico = new T.IcosahedronGeometry(1, 1).attributes.position;
      const dirs = [];
      for (let i = 0; i < ico.count && dirs.length < n; i++) {
        const d = [ico.getX(i), ico.getY(i), ico.getZ(i)];
        if (d[1] < -0.8) continue;
        if (!dirs.some((e) => Math.abs(e[0] - d[0]) + Math.abs(e[1] - d[1]) + Math.abs(e[2] - d[2]) < 0.4)) dirs.push(d);
      }
      for (const d of dirs) spike(kit, r >= 3 ? m.fit : m.edge, [d[0] * R0 * 0.9, yh + d[1] * R0 * 0.9, d[2] * R0 * 0.9], d, 0.035 + r * 0.004, 0.011, 4);
      if (r >= 2) runeRing(kit, "gem", yh, R0 + 0.006, 5, 0.006, 2);
      if (r >= 4) legend(kit, c, 0, yh + R0 + 0.07, 0, 0.035);
      kit.add(m.fit, lathe([[0.022, yh - R0 - 0.02], [0.03, yh - R0 + 0.01]], 10));
      return;
    }
    // Hammerkopf quer zum Stiel (Kriegshammer eckig, Donnerhammer achteckig und schwerer)
    const W = v === 3 ? 0.26 : 0.21;
    const Hh = v === 3 ? 0.13 : 0.09;
    if (v === 1) {
      kit.add(head, box(W, Hh, Hh, 0.01), at(0, yh, 0));
      for (const sx of [-1, 1]) kit.add(m.blade, box(0.02, Hh * 1.12, Hh * 1.12, 0.005), at(sx * (W / 2 - 0.005), yh, 0));
    } else {
      kit.add(head, new T.CylinderGeometry(Hh / 2, Hh / 2, W, 8).rotateZ(PI / 2), at(0, yh, 0, PI / 8, 0, 0));
      for (const sx of [-1, 1]) kit.add(m.blade, new T.CylinderGeometry(Hh * 0.56, Hh * 0.56, 0.022, 8).rotateZ(PI / 2), at(sx * (W / 2), yh, 0, PI / 8, 0, 0));
      kit.add(m.fit, new T.CylinderGeometry(Hh * 0.54, Hh * 0.54, 0.03, 8).rotateZ(PI / 2), at(0, yh, 0, PI / 8, 0, 0));
    }
    if (r >= 1) for (const sx of [-1, 1]) kit.add(m.fit, box(0.012, Hh * 1.06, Hh * 1.06, 0.002), at(sx * W * 0.24, yh, 0));
    if (r >= 1) for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.add(m.fit, sphere(0.006, 6, 5), at(sx * W * 0.36, yh, sz * Hh * 0.51));
    if (v === 3 || r >= 2) for (const sz of [-1, 1]) rune(kit, r >= 2 ? "gem" : "blued", at(0, yh, sz * (Hh * 0.52 + 0.004), 0, sz < 0 ? PI : 0, 0), v + (sz > 0 ? 0 : 3), Hh * 0.28);
    if (r >= 2)
      for (const sx of [-1, 1])
        for (const [oy, oz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) spike(kit, m.edge, [sx * W * 0.5, yh + oy * Hh * 0.28, oz * Hh * 0.28], [sx, oy * 0.35, oz * 0.35], 0.03, 0.012, 4);
    if (r >= 3) {
      for (const sz of [-1, 1]) motif(kit, "gold", c, 0, yh, sz * (Hh * 0.55 + 0.006), Hh * 0.36);
      for (const sy of [-1, 1]) kit.add("gold", wedge([[-0.05, 0], [0.05, 0], [0.02, 0.05], [0, 0.075], [-0.02, 0.05]], 0.03, () => 1, 0.003), at(0, yh + sy * Hh * 0.5, 0, 0, 0, sy < 0 ? PI : 0));
    }
    if (r >= 4) legend(kit, c, 0, yh + Hh * 0.5 + 0.1, 0, 0.04);
  });

  /* ===== Schurke: Dolchpaar, Klingenpaar, Stilettpaar, Giftzahnpaar ===== */
  function rogueHilt(kit, m, r, c, yg, style, gw) {
    // Griff, Knauf und Seltenheitsschmuck der Schurkenklingen
    grip(kit, m.grip, -0.05, yg - 0.008, 0.012, r >= 1, r >= 2 ? m.fit : null);
    const pm = pommel(kit, m.fit, style, -0.05, 1 + r * 0.06);
    if (r >= 2 && pm.ring) kit.add("gem", gem(pm.ring * 0.55, pm.ring * 0.9, 6), at(0, pm.c, 0, PI / 2, 0, 0, [1, 0.5, 1]));
    if (r >= 3) for (const a of [-0.6, 0, 0.6]) spike(kit, m.fit, [Math.sin(a) * 0.01, pm.y + 0.006, 0], [Math.sin(a), -1, 0], 0.022, 0.0045, 4);
    if (r >= 3)
      for (const sx of [-1, 1]) {
        horn(kit, m.fit, [[sx * gw * 0.6, yg, 0], [sx * gw * 0.95, yg + 0.02, 0], [sx * gw * 1.15, yg + 0.05, 0]], 0.005);
        horn(kit, m.fit, [[sx * gw * 0.5, yg, 0], [sx * gw * 0.8, yg - 0.012, 0], [sx * gw * 0.95, yg - 0.03, 0]], 0.004);
      }
    if (r >= 4) {
      // Quaste mit Blattanhaenger am Knauf
      kit.add("cloth3", tube([[0, pm.y + 0.004, 0], [0.012, pm.y - 0.03, 0.004], [0.006, pm.y - 0.07, 0.008]], 0.004, 10, 4, (t) => 1 + t * 0.6));
      leaf(kit, "gold", at(0.006, pm.y - 0.075, 0.008, 0, 0, PI), 0.03, 0.01);
      legend(kit, c, 0, yg + 0.004, 0.012, 0.016);
    }
  }
  // Ranken als Filigran ueber einer Klinge (legendaer)
  function vines(kit, cls, yb, L, w, th, z) {
    for (const sz of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        pts.push([Math.sin(t * PI * 3) * w * 0.6 * (1 - t * 0.6), yb + t * L * 0.75, sz * (th + z)]);
      }
      kit.add(cls, tube(pts, 0.0018, 28, 4));
    }
  }
  F.dolch = form(function (kit, v, r, c) {
    const m = mats(r);
    const yg = 0.062;
    const yb = yg + 0.008;
    const L = [0.3, 0.3, 0.34, 0.27][v % 4] * (1 + r * 0.03);
    const path = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      let x = 0;
      if (v === 1) x = 0.008 * Math.sin(t * PI * 3) * (1 - t * 0.5);
      if (v === 3) x = 0.075 * t * t;
      path.push([x, yb + L * t]);
    }
    const leafy = r >= 1 && v === 0;
    const prof = (t) => {
      let w;
      let th = 0.0062 * (1 - t * 0.5);
      if (v === 2) {
        w = 0.0095 * (1 - t * 0.85);
        th = w * 0.85;
      } else if (v === 3) w = 0.02 * (1 - t) + 0.0015;
      else {
        w = (0.022 - 0.008 * t) * (leafy ? 1 + 0.25 * Math.sin(t * PI) : 1);
        if (t > 0.7) w *= Math.pow((1 - t) / 0.3, 0.8);
      }
      return { wa: w, wb: v === 3 ? 0.006 * (1 - t) + 0.001 : w, th, fd: r >= 1 && v !== 2 ? 0.5 * cl((0.6 - t) / 0.1) * cl(t / 0.05) : 0 };
    };
    kit.add(v === 3 && r < 4 ? "blued" : m.blade, sweep(path, prof, v === 3));
    if (v === 3) {
      // Giftrinne entlang des Rueckens
      for (const sz of [-1, 1]) {
        const pts = path.filter((p, i) => i <= 13).map((p, i) => [p[0] - 0.003, p[1], sz * prof(i / 18).th * 0.8]);
        kit.add("venom", tube(pts, 0.0016, 20, 4));
      }
    }
    if (r >= 2 && v !== 2) runeRow(kit, "gem", yb + 0.04, yb + L * 0.42, 2, 0.008, 0.0062 * 0.5 * 0.9 + 0.0004, v === 3 ? 0.012 : 0, v);
    if (r >= 4) vines(kit, "gold", yb, L, 0.02, 0.004, 0.0006);
    // Parier je Form
    const gw = v === 2 ? 0.03 : 0.04;
    if (v === 0) kit.add(m.fit, box(gw * 2, 0.012, 0.022, 0.004), at(0, yg, 0));
    else if (v === 1) kit.add(m.fit, tube([[-gw, yg + 0.022, 0], [-gw * 0.5, yg, 0], [0, yg - 0.003, 0], [gw * 0.5, yg, 0], [gw, yg + 0.022, 0]], 0.0068, 16, 6, (t) => 1 - 0.4 * Math.abs(2 * t - 1)));
    else if (v === 2) kit.add(m.fit, new T.CylinderGeometry(gw * 0.6, gw * 0.6, 0.008, 12), at(0, yg, 0));
    else {
      kit.add(m.fit, box(0.05, 0.012, 0.022, 0.004), at(-0.005, yg, 0));
      horn(kit, m.fit, [[-0.02, yg, 0], [-0.045, yg - 0.012, 0], [-0.05, yg - 0.04, 0]], 0.006);
    }
    if (r === 1 || r === 2) for (const sx of [-1, 1]) if (v !== 2) leaf(kit, m.fit, at(sx * gw * 0.55, yg, 0, 0, 0, -sx * 1.1), 0.03, 0.009);
    rogueHilt(kit, m, r, c, yg, v === 2 ? "ball" : v === 3 ? "spike" : "ring", gw);
  });

  /* ===== Schurke: Sichelpaar, Krummklingenpaar, Mondsichelpaar ===== */
  F.sichel = form(function (kit, v, r, c) {
    const m = mats(r);
    const yg = 0.062;
    const yb = yg + 0.006;
    let path;
    let prof;
    if (v === 1) {
      path = [];
      for (let i = 0; i <= 22; i++) {
        const t = i / 22;
        path.push([-0.085 * Math.pow(t, 1.8), yb + 0.4 * t]);
      }
      prof = (t) => ({ wa: (0.022 + 0.012 * Math.sin(t * PI * 0.9)) * (t > 0.82 ? Math.pow((1 - t) / 0.18, 0.7) : 1), wb: 0.005, th: 0.006 * (1 - t * 0.4) });
    } else {
      // kurzer gerader Ansatz, dann ein Bogen von gut 200 Grad nach vorn
      const rad = v === 2 ? 0.085 : 0.09;
      const cy = yb + 0.05;
      path = [[0, yb], [0, yb + 0.025], ...arc(rad, cy, rad, PI, v === 2 ? -0.7 : -0.26, 30)];
      prof =
        v === 2
          ? (t) => ({ wa: 0.004 + 0.034 * Math.pow(Math.sin(PI * (0.12 + 0.88 * t)), 0.8), wb: 0.005, th: 0.0058 })
          : (t) => ({ wa: 0.003 + 0.024 * Math.pow(1 - t, 0.7), wb: 0.006 * (1 - t) + 0.0015, th: 0.006 * (1 - t * 0.5) });
    }
    kit.add(m.blade, sweep(path, prof, true));
    const n = path.length;
    // Seltenheit: Ruckenrahmen (gruen), Runen (blau), Dornen (episch), Filigran (legendaer)
    const along = (f) => path[Math.min(n - 1, Math.round(f * (n - 1)))];
    const tangent = (f) => {
      const i = Math.min(n - 2, Math.round(f * (n - 1)));
      const a = path[i];
      const b = path[i + 1];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    };
    const spinePt = (f, k) => {
      const p = along(f);
      const t = tangent(f);
      const w = prof(f).wb;
      return [p[0] - t[1] * w * k, p[1] + t[0] * w * k];
    };
    if (r >= 1) {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const p = spinePt(i / 12, 1.05);
        pts.push([p[0], p[1], 0]);
      }
      kit.add(m.fit, tube(pts, 0.0042, 24, 5));
    }
    if (r >= 2)
      for (const f of [0.25, 0.45, 0.65]) {
        const p = along(f);
        const t = tangent(f);
        const w = prof(f).wa;
        const q = [p[0] + t[1] * w * 0.4, p[1] - t[0] * w * 0.4];
        for (const sz of [-1, 1]) rune(kit, "gem", at(q[0], q[1], sz * 0.0042, 0, sz < 0 ? PI : 0, Math.atan2(-t[0], t[1])), Math.round(f * 10), 0.007);
      }
    if (r >= 3)
      for (let i = 1; i <= 5; i++) {
        const f = i / 7;
        const p = spinePt(f, 1);
        const t = tangent(f);
        spike(kit, m.fit, [p[0], p[1], 0], [-t[1] + t[0] * 0.5, t[0] + t[1] * 0.5, 0], 0.025, 0.005, 4);
      }
    if (r >= 4) {
      for (const sz of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const f = (i / 16) * 0.85;
          const p = along(f);
          const t = tangent(f);
          const w = prof(f).wa * (0.35 + 0.25 * Math.sin(i * 1.3));
          pts.push([p[0] + t[1] * w, p[1] - t[0] * w, sz * 0.0048]);
        }
        kit.add("gold", tube(pts, 0.0017, 32, 4));
      }
    }
    if (v === 2) horn(kit, m.blade, [[0, yb, 0], [-0.03, yb - 0.004, 0], [-0.055, yb + 0.02, 0]], 0.007);
    kit.add(m.fit, lathe([[0.014, yg - 0.008], [0.016, yg], [0.012, yg + 0.01]], 10));
    rogueHilt(kit, m, r, c, yg, "ring", 0.025);
  });

  /* ===== Schurke: Kurzschwertpaar, Schattenklingenpaar, Rabenklingenpaar ===== */
  F.kurzschwert = form(function (kit, v, r, c) {
    const m = mats(r);
    const yg = 0.065;
    const yb = yg + 0.01;
    const L = [0.42, 0.44, 0.42][v % 3] * (1 + r * 0.03);
    const path = [];
    for (let i = 0; i <= 22; i++) {
      const t = i / 22;
      path.push([v === 2 ? -0.05 * Math.pow(cl((t - 0.72) / 0.28), 2) : 0, yb + L * t]);
    }
    const prof = (t) => {
      if (v === 0) {
        let w = 0.03 * (1 - 0.1 * Math.sin(t * PI * 0.8)) * (1 + 0.12 * Math.sin(cl((t - 0.5) / 0.4) * PI));
        if (t > 0.8) w *= Math.pow((1 - t) / 0.2, 0.75);
        return { wa: w, th: 0.0068 * (1 - t * 0.4), fd: r >= 1 ? 0.5 * cl((0.65 - t) / 0.08) * cl(t / 0.04) : 0 };
      }
      if (v === 1) {
        const wa = 0.03 * (t > 0.84 ? Math.pow((1 - t) / 0.16, 0.6) : 1);
        return { wa, wb: 0.006 * (t > 0.9 ? (1 - t) / 0.1 : 1) + 0.001, th: 0.0068 * (1 - t * 0.3) };
      }
      const wa = 0.028 * (t > 0.86 ? Math.pow((1 - t) / 0.14, 0.7) : 1);
      return { wa, wb: 0.006 + 0.01 * Math.sin(cl((t - 0.7) / 0.3) * PI), th: 0.0066 };
    };
    kit.add(v === 1 && r < 4 ? "blued" : m.blade, sweep(path, prof, v !== 0));
    if (r >= 2) runeRow(kit, "gem", yb + 0.05, yb + L * 0.5, 3, 0.009, 0.0068 * 0.6 + 0.0004, v === 0 ? 0 : 0.008, v);
    if (r >= 4) vines(kit, "gold", yb, L, 0.028, 0.0045, 0.0006);
    if (v === 1 && r >= 3) for (const sz of [-1, 1]) kit.add("gold", tube([[0.028, yb + 0.01, sz * 0.001], [0.028, yb + L * 0.84, sz * 0.001], [0.0, yb + L, 0]], 0.0015, 12, 4));
    const gw = 0.045;
    if (v === 0) kit.add(m.fit, box(gw * 2, 0.014, 0.026, 0.004), at(0, yg, 0));
    else if (v === 1) kit.add(m.fit, box(0.06, 0.008, 0.05, 0.003), at(0, yg, 0));
    else
      for (const sx of [-1, 1])
        for (let k = 0; k < 3; k++) {
          const fe = [[0, -0.006], [0.05 - k * 0.01, -0.004], [0.06 - k * 0.012, 0.004], [0, 0.008]];
          kit.add(m.fit, slab(sx > 0 ? fe : mirrorX(fe), 0.006 + k * 0.002, 0.0015), at(0, yg - k * 0.006, 0, 0, 0, -sx * (0.25 + k * 0.25)));
        }
    if (r >= 1 && v === 0) for (const sx of [-1, 1]) finial(kit, m.fit, c, sx * gw, yg, 0.008, sx);
    if (r >= 2) for (const sz of [-1, 1]) kit.add("gem", gem(0.008, 0.014, 6), at(0, yg + 0.004, sz * 0.016, PI / 2, 0, 0, [1, 0.6, 1]));
    rogueHilt(kit, m, r, c, yg, v === 0 ? "ring" : v === 1 ? "wheel" : "spike", gw);
  });

  /* ===== Jaeger: Boegen (Langbogen, Kompositbogen, Eibenbogen, Hornbogen), linke Hand ===== */
  F.bogen = form(function (kit, v, r, c) {
    const m = mats(r);
    const P = [{ H: 0.84, b: 0.14, rc: 0, w: 0.029 }, { H: 0.6, b: 0.11, rc: 0.075, w: 0.03 }, { H: 0.8, b: 0.13, rc: 0.012, w: 0.028 }, { H: 0.55, b: 0.1, rc: 0.095, w: 0.032 }][v % 4];
    const H = P.H * (1 + r * 0.025);
    const X = (y) => {
      const u = Math.abs(y) / H;
      return -P.b * u * u + P.rc * Math.pow(Math.max(0, u - 0.68) / 0.32, 2);
    };
    const limb = [];
    for (let i = 0; i <= 28; i++) {
      const y = -H + (2 * H * i) / 28;
      limb.push([X(y), y, 0]);
    }
    const rf = (t) => 0.42 + 0.58 * Math.pow(1 - Math.abs(2 * t - 1), 0.55);
    const body = v === 3 ? "bone" : r >= 4 ? "ivory" : "wood";
    kit.add(body, tube(limb, P.w * 0.5, 56, 6, rf), at(0, 0, 0, 0, 0, 0, [1, 1, 1.35]));
    if (v === 1 || v === 2) {
      // zweite Lage: Horn auf dem Bauch (Komposit) bzw. helles Splintholz auf dem Ruecken (Eibe)
      const off = v === 1 ? -P.w * 0.32 : P.w * 0.32;
      kit.add(v === 1 ? "bone" : "ivory", tube(limb.map((p) => [p[0] + off, p[1], 0]), P.w * 0.3, 56, 5, rf), at(0, 0, 0, 0, 0, 0, [1, 1, 1.3]));
    }
    if (v === 3)
      for (let i = 1; i < 8; i++) {
        const y = -H * 0.85 + (H * 1.7 * i) / 8;
        if (Math.abs(y) < 0.08) continue;
        const d = new T.Vector3(X(y + 0.01) - X(y - 0.01), 0.02, 0).normalize();
        const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), d);
        kit.add("leather", ring(P.w * 0.5 * rf(0.5 + y / (2 * H)) * 1.05, 0.0025, 12, 4), new T.Matrix4().compose(new T.Vector3(X(y), y, 0), q, new T.Vector3(1, 1.35, 1)));
      }
    // Sehne und Griff
    const sx = X(H) - 0.004;
    kit.add("string", tube([[sx, -H * 0.985, 0], [sx, H * 0.985, 0]], 0.0022, 2, 4));
    grip(kit, m.grip, -0.07, 0.07, P.w * 0.62, r >= 1, r >= 2 ? m.fit : null);
    if (r >= 1)
      for (const sy of [-1, 1]) {
        kit.add(m.fit, ring(P.w * 0.64, 0.003, 12, 4), at(0, sy * 0.075, 0, PI / 2));
        kit.add(m.fit, lathe([[P.w * 0.3, 0], [P.w * 0.34, sy * 0.02], [0.002, sy * 0.05]], 6), at(X(H), sy * H, 0));
      }
    else for (const sy of [-1, 1]) kit.add(v === 1 ? "bone" : "wood", lathe([[P.w * 0.26, 0], [0.002, sy * 0.03]], 6), at(X(H), sy * H, 0));
    if (r >= 2) {
      for (const sz of [-1, 1]) rune(kit, "gem", at(0, 0, sz * P.w * 0.72, 0, sz < 0 ? PI : 0, 0), v + 1, 0.016);
      for (const sy of [-1, 1]) {
        const y = sy * H * 0.3;
        const pl = [[0, -0.07], [0.016, -0.03], [0.018, 0.04], [0, 0.07]];
        kit.add(r >= 3 ? m.fit : "blued", wedge(pl, P.w * 0.9, () => 1, 0.002), at(X(y) + P.w * 0.35, y, 0, 0, 0, Math.atan2(X(y + 0.01) - X(y - 0.01), 0.02) * -1));
      }
    }
    if (r >= 3)
      for (const sy of [-1, 1])
        for (const u of [0.55, 0.78]) {
          const y = sy * H * u;
          const pl = [[0, -0.04], [0.05, sy * 0.02 - 0.01], [0.012, 0.035]];
          kit.add(m.fit, wedge(sy > 0 ? pl : pl.map((p) => [p[0], -p[1]]).reverse(), 0.008, () => 1, 0.0015), at(X(y) + P.w * 0.3, y, 0));
          kit.add("gem", gem(0.007, 0.018, 5), at(X(y) + P.w * 0.55, y, 0, 0, 0, -PI / 2));
        }
    if (r >= 4) {
      if (c === "hibernia") for (const sy of [-1, 1]) antler(kit, "ivory", [X(H), sy * H * 0.92, 0], [0.5, sy], 0.2, sy, 0.007);
      else if (c === "albion")
        for (const sy of [-1, 1]) {
          for (let i = -2; i <= 2; i++) spike(kit, "gold", [X(H), sy * H, 0], [Math.sin(i * 0.35) * sy, sy * Math.cos(i * 0.35), 0], i ? 0.05 : 0.08, 0.006, 4);
        }
      else for (const sy of [-1, 1]) kit.add("gem", gem(0.016, 0.1, 6, 0.35), at(X(H), sy * (H + 0.03), 0, 0, 0, sy > 0 ? 0.25 : PI - 0.25));
      legend(kit, c, P.w * 0.6, 0, 0, 0.035);
    }
  });

  /* ===== Jaeger: Armbrust, Windenarmbrust, Repetierarmbrust (Schaft entlang +x ueber der Faust) ===== */
  F.armbrust = form(function (kit, v, r, c) {
    const m = mats(r);
    const ys = 0.085;
    const stock = r >= 4 ? "ivory" : "wood";
    kit.add(stock, box(0.035, 0.13, 0.034, 0.008), at(-0.012, 0.0, 0, 0, 0, 0.18));
    kit.add(stock, box(0.64, 0.05, 0.042, 0.009), at(0.06, ys, 0));
    kit.add(stock, slab([[-0.26, 0.11], [-0.26, 0.06], [-0.4, 0.0], [-0.43, 0.04], [-0.42, 0.115]], 0.05, 0.006), at(0, 0, 0));
    // Bogen (Prod) quer zur Schaftrichtung, Sehne zur Nuss
    const px = 0.37;
    const span = v === 1 ? 0.28 : 0.32;
    const prod = [];
    for (let i = 0; i <= 12; i++) {
      const z = -span + (2 * span * i) / 12;
      const u = Math.abs(z) / span;
      prod.push([px - 0.08 * u * u, ys + 0.008, z]);
    }
    const pcls = v === 0 && r < 2 ? "wood" : r >= 2 ? "blued" : m.blade;
    kit.add(pcls, tube(prod, v === 1 ? 0.017 : 0.013, 24, 6, (t) => 0.55 + 0.45 * Math.pow(1 - Math.abs(2 * t - 1), 0.5)), at(0, 0, 0, 0, 0, 0, [1, 0.7, 1]).premultiply(new T.Matrix4().makeTranslation(0, ys * 0.3, 0)));
    for (const sz of [-1, 1]) kit.add("string", tube([[px - 0.08, ys + 0.012, sz * span * 0.99], [0.1, ys + 0.03, 0]], 0.002, 2, 4));
    kit.add(m.fit, new T.CylinderGeometry(0.012, 0.012, 0.03, 10).rotateX(PI / 2), at(0.1, ys + 0.03, 0));
    // eingelegter Bolzen
    kit.add("wood", tube([[0.1, ys + 0.034, 0], [0.43, ys + 0.034, 0]], 0.0045, 2, 5));
    spike(kit, m.edge, [0.43, ys + 0.034, 0], [1, 0, 0], 0.03, 0.007, 4);
    for (let k = 0; k < 2; k++) kit.add("cloth3", slab([[0, 0], [0.04, 0], [0.03, 0.012], [0.004, 0.012]], 0.0015, 0), at(0.105, ys + 0.034, 0, k * PI, 0, 0));
    kit.add(m.fit, box(0.06, 0.02, 0.05, 0.003), at(px - 0.02, ys + 0.006, 0));
    if (v >= 1) kit.add(m.fit, ring(0.035, 0.0055, 14, 5, PI), at(px + 0.04, ys, 0, PI / 2, 0, -PI / 2));
    if (v === 1) {
      // Winde am Schaftende
      kit.add(m.fit, new T.CylinderGeometry(0.02, 0.02, 0.08, 10).rotateX(PI / 2), at(-0.22, ys + 0.03, 0));
      for (const sz of [-1, 1]) {
        kit.add(m.fit, box(0.01, 0.07, 0.008, 0.002), at(-0.22, ys + 0.055, sz * 0.045));
        kit.add("wood", new T.CylinderGeometry(0.007, 0.007, 0.03, 6).rotateX(PI / 2), at(-0.22, ys + 0.09, sz * 0.06));
      }
    }
    if (v === 2) {
      // Magazin und Spannhebel
      kit.add(stock, box(0.26, 0.06, 0.032, 0.005), at(0.18, ys + 0.07, 0));
      for (let i = 0; i < 4; i++) kit.add("wood", new T.CylinderGeometry(0.0035, 0.0035, 0.24, 4).rotateZ(PI / 2), at(0.18, ys + 0.105, -0.009 + i * 0.006));
      kit.add(m.fit, tube([[0.06, ys + 0.09, 0.022], [-0.04, ys + 0.12, 0.022], [-0.16, ys + 0.04, 0.022]], 0.006, 12, 5));
    }
    if (r >= 1) for (const x of [-0.18, 0.02, 0.24]) kit.add(m.fit, box(0.014, 0.054, 0.046, 0.002), at(x, ys, 0));
    if (r >= 2) for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) rune(kit, "gem", at(-0.1 + i * 0.07, ys, sz * 0.0225, 0, sz < 0 ? PI : 0, PI / 2), i + v, 0.012);
    if (r >= 3) {
      for (const sz of [-1, 1]) {
        kit.add(m.fit, wedge([[-0.14, -0.022], [0.16, -0.022], [0.19, 0], [0.16, 0.022], [-0.14, 0.022], [-0.17, 0]], 0.003, () => 1, 0.001), at(0.04, ys, sz * 0.022));
        spike(kit, m.fit, [px - 0.08, ys + 0.01, sz * span], [0.6, 0, sz * 0.8], 0.05, 0.008, 4);
      }
      for (const sz of [-1, 1]) motif(kit, "gold", c, -0.32, 0.07, sz * 0.027, 0.03);
    }
    if (r >= 4) {
      if (c === "hibernia") for (const sz of [-1, 1]) antler(kit, "ivory", [px - 0.05, ys + 0.02, sz * span * 0.7], [0.8, 0.6], 0.16, sz, 0.007);
      else if (c === "midgard") kit.add("gem", gem(0.03, 0.12, 6, 0.35), at(px + 0.03, ys + 0.03, 0, 0, 0, -PI / 2));
      legend(kit, c, px - 0.02, ys + 0.07, 0, 0.035);
    }
  });

  /* ===== Jaeger: Wurfspeer, Jagdspeer, Runenspeer ===== */
  F.speer = form(function (kit, v, r, c) {
    const m = mats(r);
    const P = [{ y0: -0.55, top: 0.9, rad: 0.015, hl: 0.22, hw: 0.03 }, { y0: -0.62, top: 0.98, rad: 0.019, hl: 0.28, hw: 0.046 }, { y0: -0.6, top: 1.0, rad: 0.018, hl: 0.34, hw: 0.036 }][v % 3];
    haft(kit, Object.assign({}, m, { haft: "wood" }), r, P.y0, P.top, P.rad, 0.09);
    if (r >= 4) helix(kit, "silver", P.y0 + 0.1, P.top - 0.1, P.rad * 1.02, 14, 0.0028, 0, 1);
    const ys = P.top;
    kit.add(m.blade, lathe([[P.rad * 1.15, ys - 0.07], [P.rad * 1.25, ys - 0.02], [P.rad * 0.8, ys + 0.012]], 8));
    const L = P.hl * (1 + r * 0.06);
    const path = [];
    for (let i = 0; i <= 16; i++) path.push([0, ys + 0.008 + (L * i) / 16]);
    const prof = (t) => {
      let w = P.hw * (v === 2 ? 1 - 0.45 * t : Math.sin(Math.min(1, (t + 0.08) / 0.55) * PI * 0.5));
      if (t > 0.45) w *= Math.pow((1 - t) / 0.55, v === 2 ? 0.5 : 0.85);
      if (r >= 2 && v !== 2) w *= 1.1;
      return { wa: w + 0.003, th: 0.0075 * (1 - t * 0.5), fd: r >= 2 ? 0.5 * cl((0.6 - t) / 0.1) * cl(t / 0.08) : 0 };
    };
    kit.add(m.blade, sweep(path, prof));
    if (r >= 2 || v === 2) runeRow(kit, r >= 2 ? "gem" : "blued", ys + 0.04, ys + L * 0.4, v === 2 ? 3 : 2, 0.009, 0.0075 * 0.5 * 0.9 + 0.0004, 0, v);
    if (v === 1) {
      kit.add(m.fit, box(0.11, 0.012, 0.014, 0.003), at(0, ys - 0.06, 0));
      for (const sx of [-1, 1]) kit.add("leather", tube([[sx * 0.05, ys - 0.06, 0], [sx * 0.02, ys - 0.085, 0.01], [0, ys - 0.1, 0]], 0.003, 6, 4));
    }
    if (r >= 1) for (const y of [ys - 0.075, ys - 0.12]) kit.add(m.fit, ring(P.rad * 1.15, 0.003, 12, 4), at(0, y, 0, PI / 2));
    if (r >= 3) {
      // seitliche Fluegelklingen
      for (const sx of [-1, 1]) {
        const wpts = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          wpts.push([sx * (0.02 + 0.05 * t), ys + 0.02 + 0.09 * t * t]);
        }
        kit.add(r >= 4 ? "pale" : m.edge, sweep(wpts, (t) => ({ wa: 0.009 * (1 - t) + 0.001, wb: 0.004, th: 0.004 }), true));
      }
      kit.add("gem", gem(0.012, 0.03, 6), at(0, ys + 0.03, 0.012, PI / 2, 0, 0, [1, 0.5, 1]));
      kit.add("gem", gem(0.012, 0.03, 6), at(0, ys + 0.03, -0.012, PI / 2, 0, 0, [1, 0.5, 1]));
    }
    if (r >= 4) {
      if (c === "midgard") for (const sx of [-1, 1]) kit.add("gem", gem(0.01, 0.12, 6, 0.35), at(sx * 0.05, ys + 0.13, 0, 0, 0, -sx * 0.15));
      else if (c === "hibernia") for (const sx of [-1, 1]) antler(kit, "ivory", [sx * 0.02, ys - 0.03, 0], [sx * 0.9, 0.5], 0.13, -sx, 0.006);
      else legend(kit, c, 0, ys - 0.03, 0, 0.04);
      kit.add("silver", tube([[0, ys - 0.08, 0.02], [0.01, ys - 0.12, 0.03], [0.005, ys - 0.17, 0.025]], 0.002, 8, 4));
      kit.add("gem", gem(0.008, 0.03, 4), at(0.005, ys - 0.19, 0.025));
    }
  });

  /* ===== Magier: Staebe (Eichenstab, Kristallstab, Druidenstab, Sternenstab) nach Tafel 17 ===== */
  // Herzstueck je Seltenheit: Normal und Gruen ein grauer Stein, ab Blau ein leuchtender Kristall
  function core(kit, r, x, y, z, s, round) {
    if (r <= 1) kit.add("stone", rock(0.04 * s, 0.85, 1.15, 0.85), at(x, y, z));
    else if (round) kit.add("gem", sphere(0.036 * s, 14, 10), at(x, y, z));
    else kit.add("gem", gem(0.038 * s, 0.13 * s, 6, 0.38), at(x, y, z));
  }
  F.stab = form(function (kit, v, r, c) {
    const m = mats(r);
    const L = 1.78;
    const y0 = -0.56;
    const top = y0 + L;
    const knot = v === 0 || v === 2;
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      pts.push([knot ? Math.sin(t * 9) * 0.012 : 0, y0 + t * (L - 0.02), knot ? Math.cos(t * 7) * 0.01 : 0]);
    }
    const wood = r >= 4 ? "silver" : "wood";
    kit.add(wood, tube(pts, 0.024, 28, 8, (t) => 1 + (knot ? 0.22 * Math.sin(t * 31) ** 2 : 0) - 0.15 * t));
    if (knot || r >= 1) helix(kit, r >= 3 ? "gold" : r >= 1 ? "silver" : "wood", y0 + 0.4, top - 0.2, 0.024, 7, 0.0045, 0, 1);
    spike(kit, m.fit, [0, y0 + 0.02, 0], [0, -1, 0], 0.07, 0.022, 6);
    if (r >= 2) kit.add("gem", gem(0.012, 0.035, 6), at(0, y0 + 0.05, 0));
    if (r >= 1) for (const y of [y0 + 0.08, 0.12, top - 0.28]) kit.add(m.fit, ring(0.027, 0.006, 16, 6), at(0, y, 0, PI / 2));
    if (r >= 4) for (let i = 0; i < 4; i++) kit.add("gem", gem(0.008, 0.02, 4), at(0, top - 0.45 - i * 0.22, 0.026, PI / 2, 0, 0, [1, 0.5, 1]));
    kit.add(m.fit, lathe([[0.026, top - 0.08], [0.034, top - 0.03], [0.024, top]], 10));
    const cy = top + 0.11;
    if (v === 0) {
      // Krallenfassung aus Eichenholz
      const n = r >= 2 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * PI * 2;
        kit.add(r >= 1 ? m.fit : "wood", tube([[0, top - 0.01, 0], [Math.cos(a) * 0.055, top + 0.06, Math.sin(a) * 0.055], [Math.cos(a) * 0.05, cy + 0.04, Math.sin(a) * 0.05], [Math.cos(a) * 0.02, cy + 0.1, Math.sin(a) * 0.02]], 0.009, 14, 5, (t) => 1 - t * 0.7));
      }
      core(kit, r, 0, cy, 0, 1.2);
    } else if (v === 1) {
      // Metallgabel mit Kristall
      for (let i = 0; i < 2; i++) {
        const a = i * PI;
        kit.add(m.fit, tube([[0, top, 0], [Math.cos(a) * 0.065, top + 0.07, 0], [Math.cos(a) * 0.07, cy + 0.04, 0], [Math.cos(a) * 0.02, cy + 0.13, 0]], 0.01, 14, 5, (t) => 1 - t * 0.6));
      }
      core(kit, r, 0, cy + 0.02, 0, 1.35);
    } else if (v === 2) {
      // Astgabel mit Ranken und Blaettern
      for (const s of [-1, 1]) kit.add("wood", tube([[0, top - 0.06, 0], [s * 0.06, top + 0.06, 0], [s * 0.04, cy + 0.08, 0.01], [s * 0.01, cy + 0.12, 0]], 0.013, 12, 5, (t) => 1 - t * 0.6));
      kit.add("leather", tube([[-0.04, top + 0.03, 0], [0, top + 0.07, 0.035], [0.04, top + 0.11, 0], [0, top + 0.15, -0.035]], 0.004, 16, 4));
      for (let i = 0; i < 3 + r; i++) leaf(kit, r >= 3 ? "gold" : "cloth", at(Math.cos(i * 2.1) * 0.05, top + 0.02 + i * 0.03, Math.sin(i * 2.1) * 0.05, 0, i * 2.1, 0.9), 0.05, 0.016);
      core(kit, r, 0, cy, 0, 1.0, true);
    } else {
      // Sternenstab: Sternrahmen
      const s = 0.1 + r * 0.008;
      const star = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * PI * 2;
        const rr = i % 2 ? s * 0.5 : s;
        star.push([Math.sin(a) * rr, Math.cos(a) * rr]);
      }
      const ring2 = star.map((p) => [p[0] * 0.72, p[1] * 0.72]).reverse();
      const sh = new T.Shape(star.map((p) => new T.Vector2(p[0], p[1])));
      sh.holes.push(new T.Path(ring2.map((p) => new T.Vector2(p[0], p[1]))));
      const g = new T.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1 });
      g.translate(0, 0, -0.007);
      kit.add(r >= 2 ? "silver" : "metal", g, at(0, cy + 0.03, 0));
      core(kit, r, 0, cy + 0.03, 0, 0.8);
    }
    if (r >= 3) {
      // Mondsichelrahmen und Wimpel (Tafel 17, episch)
      kit.add(m.fit, ring(0.1, 0.008, 32, 6, PI * 1.5), at(0, cy + 0.02, 0, 0, 0, -PI * 0.25));
      kit.add("cloth3", slab([[0, 0], [0.05, -0.02], [0.06, -0.3], [0.035, -0.26], [0.015, -0.32], [0, -0.04]], 0.003, 0), at(0.02, top - 0.12, 0.02, 0, -0.3, 0.06));
    }
    if (r >= 4) legend(kit, c, 0, cy + 0.02, 0, 0.13);
  });

  /* ===== Magier: Zepter, Machtzepter, Seelenzepter ===== */
  F.zepter = form(function (kit, v, r, c) {
    const m = mats(r);
    const top = 0.38;
    kit.add(r >= 4 ? "silver" : "wood", lathe([[0.017, -0.2], [0.019, -0.1], [0.018, 0.2], [0.022, top - 0.02], [0.016, top]], 10));
    grip(kit, r >= 2 ? "wrap" : "leather", -0.09, 0.08, 0.02, r >= 1, r >= 3 ? m.fit : null);
    kit.add(m.fit, lathe([[0.016, -0.26], [0.024, -0.22], [0.02, -0.19]], 8, true));
    if (r >= 2) kit.add("gem", gem(0.008, 0.02, 6), at(0, -0.265, 0));
    kit.add(m.fit, lathe([[0.02, top - 0.04], [0.03, top], [0.024, top + 0.02]], 10));
    const hy = top + 0.08;
    if (r <= 1) {
      // Stein auf dem Stiel, bei Gruen von Bronzekrallen gehalten
      kit.add("stone", rock(0.055 + v * 0.008, 0.9, 1.25, 0.9), at(0, hy, 0));
      if (r === 1)
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * PI * 2 + PI / 4;
          kit.add(m.fit, tube([[0, top + 0.01, 0], [Math.cos(a) * 0.05, hy - 0.02, Math.sin(a) * 0.05], [Math.cos(a) * 0.04, hy + 0.05, Math.sin(a) * 0.04]], 0.007, 10, 5, (t) => 1 - t * 0.6));
        }
      if (v === 1) for (let i = 0; i < 6; i++) spike(kit, m.fit, [Math.cos((i / 6) * PI * 2) * 0.04, top + 0.02, Math.sin((i / 6) * PI * 2) * 0.04], [Math.cos((i / 6) * PI * 2), 1.4, Math.sin((i / 6) * PI * 2)], 0.04, 0.008, 4);
      if (v === 2) kit.add(m.fit, ring(0.07, 0.006, 24, 5), at(0, hy, 0, PI / 2));
      return;
    }
    if (r === 2) {
      // Kristall im kantigen Rahmen mit Runen
      kit.add("gem", gem(0.042, 0.15, 6, 0.38), at(0, hy + 0.02, 0));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + PI / 4;
        kit.add(m.fit, box(0.016, 0.11, 0.012, 0.003), at(Math.cos(a) * 0.05, hy, Math.sin(a) * 0.05, 0, -a, 0));
        rune(kit, "gem", at(Math.cos(a) * 0.057, hy, Math.sin(a) * 0.057, 0, PI / 2 - a, 0), i + v, 0.012);
      }
      if (v === 1) for (let i = 0; i < 4; i++) spike(kit, m.fit, [Math.cos((i / 4) * PI * 2) * 0.05, hy + 0.055, Math.sin((i / 4) * PI * 2) * 0.05], [Math.cos((i / 4) * PI * 2) * 0.4, 1, Math.sin((i / 4) * PI * 2) * 0.4], 0.04, 0.008, 4);
      if (v === 2) kit.add(m.fit, ring(0.075, 0.005, 24, 5), at(0, hy, 0, PI / 2));
      return;
    }
    if (r === 3) {
      // Kugel mit Kreiselringen
      kit.add("gem", sphere(0.055, 18, 12), at(0, hy + 0.01, 0));
      for (let i = 0; i < 3; i++) kit.add(i ? "silver" : "gold", ring(0.07 + i * 0.008, 0.005, 32, 5), at(0, hy + 0.01, 0, PI / 2 + i * 0.7, i * 1.1, 0.3 * i));
      if (v === 1) for (let i = 0; i < 6; i++) spike(kit, "gold", [Math.cos((i / 6) * PI * 2) * 0.035, top + 0.025, Math.sin((i / 6) * PI * 2) * 0.035], [Math.cos((i / 6) * PI * 2), 1.2, Math.sin((i / 6) * PI * 2)], 0.035, 0.007, 4);
      if (v === 2) motif(kit, "gold", c, 0, hy + 0.01, 0.075, 0.03);
      return;
    }
    // Legendaer: Rautenrahmen mit Kristall
    const fr = [[0, -0.1], [0.07, 0], [0, 0.13], [-0.07, 0]];
    const inn = fr.map((p) => [p[0] * 0.7, p[1] * 0.7 + 0.008]).reverse();
    const sh = new T.Shape(fr.map((p) => new T.Vector2(p[0], p[1])));
    sh.holes.push(new T.Path(inn.map((p) => new T.Vector2(p[0], p[1]))));
    const g = new T.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.004, bevelSegments: 1 });
    g.translate(0, 0, -0.011);
    const g2 = g.clone();
    kit.add("silver", g, at(0, hy + 0.02, 0));
    kit.add("gold", g2, at(0, hy + 0.025, 0, 0, PI / 2, 0, [0.8, 0.8, 0.8]));
    kit.add("gem", gem(0.04, 0.18, 6, 0.38), at(0, hy + 0.03, 0));
    legend(kit, c, 0, hy + 0.17, 0, 0.03);
  });

  /* ===== Magier: Runenstab, Knochenstab, Weltenstab ===== */
  F.runenstab = form(function (kit, v, r, c) {
    const m = mats(r);
    const y0 = -0.56;
    const top = y0 + 1.76;
    if (v === 1) {
      for (let i = 0; i < 9; i++) kit.add(r >= 4 ? "ivory" : "bone", lathe([[0.016, 0], [0.025, 0.02], [0.02, 0.1], [0.025, 0.18], [0.016, 0.2]], 8), at(0, y0 + i * 0.195, 0));
    } else kit.add(r >= 4 ? "silver" : "wood", lathe([[0.022, y0], [0.025, y0 + 0.1], [0.024, top - 0.3], [0.028, top]], 8));
    spike(kit, m.fit, [0, y0 + 0.02, 0], [0, -1, 0], 0.06, 0.022, 6);
    // eingeschnittene Runen am Schaft (immer), ab Blau leuchtend
    for (let i = 0; i < 5; i++) rune(kit, r >= 2 ? "gem" : "blued", at(0, top - 0.5 - i * 0.12, 0.025), i + v, 0.016);
    if (r >= 2) helix(kit, "silver", y0 + 0.5, top - 0.2, 0.026, 6, 0.004, 0, 1);
    if (r >= 1) grip(kit, r >= 3 ? "wrap" : "leather", -0.1, 0.12, 0.027, r >= 2, r >= 3 ? m.fit : null);
    const hy = top + 0.08;
    if (v === 2) {
      // ineinandergreifende Weltringe
      for (let i = 0; i < 2 + Math.min(2, r); i++) kit.add(r >= 2 ? "silver" : "metal", ring(0.1 - i * 0.012, 0.007, 32, 5), at(0, hy + 0.04, 0, (i * PI) / 3, (i * PI) / 5));
      core(kit, r, 0, hy + 0.04, 0, 0.9, true);
      if (r >= 4) legend(kit, c, 0, hy + 0.04, 0, 0.14);
      return;
    }
    if (r === 0) {
      kit.add("wood", lathe([[0.028, top - 0.02], [0.034, top + 0.03], [0.006, top + 0.1]], 6, true));
      return;
    }
    if (r === 1) {
      // Runenstein mit Lederbindung
      kit.add("stone", box(0.075, 0.13, 0.03, 0.01), at(0, hy, 0));
      rune(kit, "blued", at(0, hy, 0.0165), v, 0.03);
      for (const y of [hy - 0.04, hy + 0.04]) kit.add("leather", box(0.08, 0.012, 0.034, 0.003), at(0, y, 0));
      return;
    }
    if (r === 2) {
      // gestapelte Runensteine mit Silberspirale
      for (let i = 0; i < 3; i++) {
        kit.add("stone", box(0.06 - i * 0.008, 0.07, 0.028, 0.008), at(0, hy - 0.06 + i * 0.08, 0, 0, i * 0.4, 0));
        rune(kit, "gem", at(0, hy - 0.06 + i * 0.08, 0.015, 0, i * 0.4, 0), i + v, 0.022);
      }
      helix(kit, "silver", hy - 0.1, hy + 0.14, 0.04, 2, 0.004, 0, 1);
      return;
    }
    if (r === 3) {
      // Rahmentafel mit drei Steinen
      const fr = [[-0.06, -0.12], [0.06, -0.12], [0.07, 0.1], [0, 0.15], [-0.07, 0.1]];
      const sh = new T.Shape(fr.map((p) => new T.Vector2(p[0], p[1])));
      sh.holes.push(new T.Path(fr.map((p) => new T.Vector2(p[0] * 0.75, p[1] * 0.78)).reverse()));
      const g = new T.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1 });
      g.translate(0, 0, -0.01);
      kit.add("silver", g, at(0, hy + 0.04, 0));
      kit.add("blued", box(0.09, 0.2, 0.01, 0.002), at(0, hy + 0.035, 0));
      for (let i = 0; i < 3; i++) kit.add("stone", rock(0.022, 1, 0.9, 0.6), at(0, hy - 0.03 + i * 0.065, 0.008));
      for (let i = 0; i < 3; i++) kit.add("gem", gem(0.006, 0.014, 4), at(0.055, hy - 0.03 + i * 0.065, 0.012));
      return;
    }
    // Legendaer: leuchtender Monolith wie eine Klinge
    const mono = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      mono.push([0, hy - 0.06 + t * 0.28]);
    }
    kit.add("silver", sweep(mono, (t) => ({ wa: 0.055 * (t > 0.75 ? Math.pow((1 - t) / 0.25, 0.6) : 1) * (1 - 0.15 * t), th: 0.016, fd: 0.5 * cl((0.85 - t) / 0.1) * cl(t / 0.05) })));
    kit.add("gem", box(0.012, 0.22, 0.03), at(0, hy + 0.07, 0));
    runeRow(kit, "gem", hy - 0.03, hy + 0.15, 3, 0.012, 0.012, 0.03, v);
    legend(kit, c, 0, hy - 0.07, 0, 0.05);
  });

  IT.wk = { sweep, wedge, arc, bez, shrink, mirrorX, helix, grip, spike, horn, leaf, antler, rock, rune, runeRow, runeRing, finial, legend, pommel, mats, core };
})();
