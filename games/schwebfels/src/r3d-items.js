/* Helden von Schwebfels - feste Ausruestungsteile (Version 5): Waffen, Nebenhand, Schmuck, Kopfschmuck.
   Jede benannte Grundform hat eine eigene Bauregel; die Seltenheit veraendert Konstruktion und Material
   (Normal schlicht, Gruen verstaerkt, Blau eigene Kontur mit Einlage, Episch gestaffelte Rahmen,
   Legendaer ein ikonisches Merkmal). Die Gestaltungskultur waehlt Motive (Sonne, Rune, Blatt).
   Alles entsteht im Code aus Drehkoerpern, Extrusionen mit Fasen, Rohren und facettierten Steinen. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const R = (SB.R3D = SB.R3D || {});
  const IT = (R.items = R.items || {});
  const PI = Math.PI;
  let T = null;
  const RI = { gewoehnlich: 0, ungewoehnlich: 1, selten: 2, episch: 3, legendaer: 4 };

  /* ---------- Bausteine ---------- */
  // Sammelt Geometrien je Materialklasse und fuegt sie am Ende zusammen
  class Kit {
    constructor() {
      this.parts = {};
    }
    add(cls, geo, m) {
      if (m) geo.applyMatrix4(m);
      (this.parts[cls] = this.parts[cls] || []).push(geo);
      return geo;
    }
    group(pal, culture) {
      const g = new T.Group();
      for (const cls in this.parts) {
        const merged = merge(this.parts[cls]);
        const mesh = new T.Mesh(merged, R.gear.material(cls, pal, culture));
        mesh.castShadow = true;
        g.add(mesh);
      }
      return g;
    }
  }
  function merge(list) {
    let n = 0;
    let ni = 0;
    for (const g of list) {
      if (g.index === null) g.setIndex([...Array(g.attributes.position.count).keys()]);
      n += g.attributes.position.count;
      ni += g.index.count;
    }
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const idx = new Uint32Array(ni);
    let o = 0;
    let oi = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (!g.attributes.normal) g.computeVertexNormals();
      nrm.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[oi + i] = gi[i] + o;
      o += c;
      oi += gi.length;
    }
    const out = new T.BufferGeometry();
    out.setAttribute("position", new T.BufferAttribute(pos, 3));
    out.setAttribute("normal", new T.BufferAttribute(nrm, 3));
    out.setAttribute("uv", new T.BufferAttribute(uv, 2));
    out.setIndex(new T.BufferAttribute(idx, 1));
    return out;
  }
  const M4 = () => new T.Matrix4();
  function at(x, y, z, rx, ry, rz, s) {
    const m = new T.Matrix4();
    const q = new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0));
    const sc = Array.isArray(s) ? new T.Vector3(s[0], s[1], s[2]) : new T.Vector3(s || 1, s || 1, s || 1);
    m.compose(new T.Vector3(x || 0, y || 0, z || 0), q, sc);
    return m;
  }
  // Drehkoerper aus (Radius, Hoehe)-Punkten; seg Segmente rundum
  function lathe(pts, seg, flat) {
    const g = new T.LatheGeometry(pts.map((p) => new T.Vector2(Math.max(0.0005, p[0]), p[1])), seg || 16);
    if (flat) {
      const ng = g.toNonIndexed();
      ng.computeVertexNormals();
      return ng;
    }
    return g;
  }
  // Rohr entlang eines Pfades, Radius als Funktion von t
  function tube(pts, r, seg, radial, rf) {
    const curve = new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(p[0], p[1], p[2])));
    const g = new T.TubeGeometry(curve, seg || 16, r, radial || 6, false);
    if (rf) {
      // Radius entlang des Rohres veraendern
      const p = g.attributes.position;
      const fr = curve.computeFrenetFrames(seg || 16, false);
      for (let i = 0; i <= (seg || 16); i++) {
        const c = curve.getPointAt(i / (seg || 16));
        const k = rf(i / (seg || 16));
        for (let j = 0; j <= (radial || 6); j++) {
          const vi = i * ((radial || 6) + 1) + j;
          const v = new T.Vector3(p.getX(vi), p.getY(vi), p.getZ(vi)).sub(c).multiplyScalar(k).add(c);
          p.setXYZ(vi, v.x, v.y, v.z);
        }
      }
      g.computeVertexNormals();
    }
    return g;
  }
  // Flache Form mit Dicke und Fase (Klingen, Axtblaetter, Schilde, Platten)
  function slab(pts2, depth, bevel, curveSeg) {
    const sh = new T.Shape(pts2.map((p) => new T.Vector2(p[0], p[1])));
    const g = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: curveSeg || 6 });
    g.translate(0, 0, -depth / 2);
    g.computeVertexNormals();
    return g;
  }
  // Klinge: Mittelgrat, zwei Schneiden (Querschnitt Raute)
  function blade(len, w0, w1, thick, tip, curve) {
    const seg = 10;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const w = (w0 + (w1 - w0) * t) * (t > 1 - tip ? Math.max(0.02, (1 - t) / tip) : 1);
      const y = t * len;
      const cx = curve ? curve * Math.sin(t * PI * 0.9) : 0;
      pos.push(cx - w, y, 0, cx, y, thick, cx + w, y, 0, cx, y, -thick);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 4;
      const b = a + 4;
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        idx.push(a + k, a + k2, b + k2, a + k, b + k2, b + k);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    const uv = [];
    for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] * 4, pos[i + 1] * 4);
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const ng = g.toNonIndexed();
    ng.computeVertexNormals();
    return ng;
  }
  // Facettierter Kristall (Doppelspitze)
  function gem(r, h, facets, top) {
    const pts = [[0, -h * 0.5], [r * 0.6, -h * 0.28], [r, 0], [r * 0.6, h * (top || 0.3)], [0, h * 0.5]];
    return lathe(pts, facets || 6, true);
  }
  function ring(r, tube, seg, rad, arc) {
    return new T.TorusGeometry(r, tube, rad || 6, seg || 24, arc || PI * 2);
  }
  function box(w, h, d, bevel) {
    if (!bevel) return new T.BoxGeometry(w, h, d);
    const b = Math.min(bevel, w / 3, h / 3);
    const pts = [[-w / 2 + b, -h / 2], [w / 2 - b, -h / 2], [w / 2, -h / 2 + b], [w / 2, h / 2 - b], [w / 2 - b, h / 2], [-w / 2 + b, h / 2], [-w / 2, h / 2 - b], [-w / 2, -h / 2 + b]];
    return slab(pts, Math.max(0.001, d - 2 * b), b * 0.8);
  }
  function sphere(r, ws, hs) {
    return new T.SphereGeometry(r, ws || 12, hs || 8);
  }
  IT.kit = { Kit, lathe, tube, slab, blade, gem, ring, box, sphere, at, merge };

  /* ---------- Motive der Kulturen (kleine Zierplatten) ---------- */
  function motif(kit, cls, culture, x, y, z, s, rx, ry, rz) {
    const m = at(x, y, z, rx, ry, rz, s);
    if (culture === "albion") {
      // Sonnenscheibe mit Strahlen
      kit.add(cls, new T.CylinderGeometry(0.5, 0.5, 0.18, 16).rotateX(PI / 2), m);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2;
        kit.add(cls, new T.ConeGeometry(0.16, 0.45, 4).rotateX(PI / 2).rotateZ(-PI / 2).translate(Math.cos(a) * 0.68, Math.sin(a) * 0.68, 0).rotateZ(0), at(0, 0, 0, 0, 0, a, 1).premultiply(m));
      }
    } else if (culture === "hibernia") {
      // Blatt
      const leaf = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        leaf.push([Math.sin(t * PI) * 0.42, t * 1.4 - 0.7]);
      }
      for (let i = 11; i > 0; i--) {
        const t = i / 12;
        leaf.push([-Math.sin(t * PI) * 0.42, t * 1.4 - 0.7]);
      }
      kit.add(cls, slab(leaf, 0.08, 0.04), m);
    } else {
      // Raute mit Rune
      kit.add(cls, slab([[0, -0.7], [0.5, 0], [0, 0.7], [-0.5, 0]], 0.1, 0.05), m);
    }
  }
  IT.motif = motif;

  /* ---------- Formregeln ---------- */
  const F = {};
  IT.forms = F;

  // ===== Magier: Staebe (Eichenstab, Kristallstab, Druidenstab, Sternenstab) =====
  F["stab"] = function (kit, v, r, c) {
    const L = 1.75;
    const wood = r >= 2 && v === 1 ? "metal" : "wood";
    // Schaft: knorrig bei Eiche und Druide, gerade sonst
    const knot = v === 0 || v === 2;
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push([knot ? Math.sin(t * 9) * 0.012 : 0, -0.55 + t * L, knot ? Math.cos(t * 7) * 0.01 : 0]);
    }
    kit.add(wood, tube(pts, 0.018, 24, 7, (t) => 1 + (knot ? 0.25 * Math.sin(t * 31) ** 2 : 0) - 0.15 * t));
    const top = -0.55 + L;
    // Beschlaege je Seltenheit
    if (r >= 1) for (const y of [-0.5, 0.05, top - 0.25]) kit.add(r >= 3 ? "silver" : "metal", ring(0.021, 0.006, 16, 6), at(0, y, 0, PI / 2));
    if (r >= 2) kit.add("leather", lathe([[0.021, 0], [0.021, 0.22]], 12), at(0, -0.12, 0));
    // Kopf je Form
    if (v === 0) {
      // geschnitzte Eichenkrone: auseinanderlaufende Zweige
      const n = 4 + r;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * PI * 2;
        kit.add("wood", tube([[0, top - 0.05, 0], [Math.cos(a) * 0.05, top + 0.06, Math.sin(a) * 0.05], [Math.cos(a) * 0.06, top + 0.16, Math.sin(a) * 0.06]], 0.008, 8, 5));
      }
      if (r >= 2) kit.add("gem", gem(0.03, 0.08, 6), at(0, top + 0.09, 0));
    } else if (v === 1) {
      // gefasster Kristallkopf (Tafel 08/09 B): Rahmen aus Spitzen
      const s = 1 + r * 0.12;
      kit.add("gem", gem(0.045 * s, 0.16 * s, 6, 0.4), at(0, top + 0.12, 0));
      const nArms = r >= 3 ? 4 : 2;
      for (let i = 0; i < nArms; i++) {
        const a = (i / nArms) * PI * 2 + PI / 4;
        const m = at(0, top, 0, 0, a, 0);
        kit.add(r >= 2 ? "silver" : "metal", tube([[0, 0.0, 0], [0.06 * s, 0.08, 0], [0.065 * s, 0.17 * s, 0], [0.02, 0.26 * s, 0]], 0.009, 12, 5), m);
      }
      kit.add(r >= 2 ? "silver" : "metal", lathe([[0.02, -0.02], [0.034, 0.02], [0.02, 0.05]], 8), at(0, top, 0));
      if (r >= 4) {
        // legendaer: zwei schwebende Splitter ueber dem Kopf
        kit.add("gem", gem(0.022, 0.08, 5), at(0, top + 0.36, 0));
        kit.add("gem", gem(0.016, 0.06, 5), at(0, top + 0.46, 0));
      }
    } else if (v === 2) {
      // Astgabel mit Ranken
      for (const s of [-1, 1]) kit.add("wood", tube([[0, top - 0.06, 0], [s * 0.05, top + 0.05, 0], [s * 0.03, top + 0.18, 0.01]], 0.011, 10, 5, (t) => 1 - t * 0.6));
      kit.add("leather", tube([[-0.03, top + 0.02, 0.0], [0, top + 0.06, 0.03], [0.03, top + 0.1, 0.0], [0, top + 0.13, -0.03]], 0.004, 16, 4));
      if (r >= 2) kit.add("gem", sphere(0.028, 10, 8), at(0, top + 0.1, 0));
    } else {
      // Sternenstab: geometrischer Sternrahmen
      const s = 0.09 + r * 0.01;
      const star = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * PI * 2;
        const rr = i % 2 ? s * 0.45 : s;
        star.push([Math.sin(a) * rr, Math.cos(a) * rr]);
      }
      kit.add(r >= 2 ? "silver" : "metal", slab(star, 0.012, 0.004), at(0, top + 0.12, 0));
      kit.add("gem", gem(0.022, 0.05, 6), at(0, top + 0.12, 0, PI / 2));
      if (r >= 3) kit.add("silver", ring(s * 1.15, 0.005, 32, 5), at(0, top + 0.12, 0));
    }
    if (r >= 3) motif(kit, r >= 4 ? "gold" : "silver", c, 0, top - 0.32, 0.022, 0.03);
  };
  // Zepter (Zepter, Machtzepter, Seelenzepter)
  F["zepter"] = function (kit, v, r, c) {
    const L = 0.62;
    kit.add("wood", tube([[0, -0.18, 0], [0, L - 0.18, 0]], 0.016, 6, 7));
    kit.add("metal", lathe([[0.012, -0.24], [0.022, -0.2], [0.016, -0.17]], 10));
    const top = L - 0.18;
    if (v === 0) kit.add(r >= 2 ? "silver" : "metal", sphere(0.045, 14, 10), at(0, top + 0.03, 0));
    else if (v === 1) {
      kit.add(r >= 2 ? "silver" : "metal", lathe([[0.02, 0], [0.05, 0.03], [0.04, 0.07], [0.06, 0.1], [0.02, 0.16]], 8), at(0, top, 0));
      for (let i = 0; i < 4 + r; i++) kit.add("metal", box(0.012, 0.05, 0.03, 0.003), at(Math.cos((i / (4 + r)) * PI * 2) * 0.055, top + 0.06, Math.sin((i / (4 + r)) * PI * 2) * 0.055, 0, -(i / (4 + r)) * PI * 2));
    } else {
      // hohler Reliktrahmen
      kit.add(r >= 2 ? "silver" : "metal", ring(0.055, 0.009, 24, 6), at(0, top + 0.07, 0));
      kit.add(r >= 2 ? "silver" : "metal", ring(0.055, 0.009, 24, 6), at(0, top + 0.07, 0, 0, PI / 2));
      kit.add("gem", sphere(0.025, 10, 8), at(0, top + 0.07, 0));
    }
    if (r >= 1) kit.add("leather", lathe([[0.0175, 0], [0.0175, 0.1]], 10), at(0, top - 0.25, 0));
    if (r >= 2 && v !== 2) kit.add("gem", gem(0.016, 0.04, 6), at(0, top + (v === 0 ? 0.08 : 0.18), 0));
  };
  // Runenstab, Knochenstab, Weltenstab
  F["runenstab"] = function (kit, v, r, c) {
    const L = 1.8;
    const top = -0.55 + L;
    if (v === 1) {
      // gegliederter knochenartiger Stab
      for (let i = 0; i < 9; i++) kit.add("bone", lathe([[0.012, 0], [0.02, 0.02], [0.016, 0.1], [0.02, 0.18], [0.012, 0.2]], 8), at(0, -0.55 + i * 0.2, 0));
    } else kit.add(r >= 3 ? "metal" : "wood", tube([[0, -0.55, 0], [0, top, 0]], 0.019, 8, 8));
    // breite Runentafeln
    const n = v === 0 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      kit.add(r >= 2 ? "silver" : "stone", box(0.065, 0.09, 0.022, 0.006), at(0, top - 0.15 - i * 0.14, 0));
      if (r >= 2) kit.add("gem", box(0.02, 0.05, 0.026), at(0, top - 0.15 - i * 0.14, 0));
    }
    if (v === 2) {
      // ineinandergreifende Weltringe
      for (let i = 0; i < 2 + Math.min(2, r); i++) kit.add(r >= 2 ? "silver" : "metal", ring(0.09 - i * 0.012, 0.006, 32, 5), at(0, top + 0.1, 0, (i * PI) / 3, (i * PI) / 5));
      kit.add("gem", sphere(0.03, 10, 8), at(0, top + 0.1, 0));
    } else kit.add(r >= 2 ? "silver" : "metal", lathe([[0.02, 0], [0.04, 0.03], [0.008, 0.12]], 6, true), at(0, top, 0));
  };

  // ===== Nebenhand Magier: Fokuskristall, Seelenstein, Zauberfolianten =====
  F["fokus"] = function (kit, v, r, c) {
    if (v === 0) {
      kit.add(r >= 1 ? "gem" : "stone", gem(0.045 + r * 0.004, 0.15, 6, 0.4));
      if (r >= 2) for (let i = 0; i < 2; i++) kit.add("silver", ring(0.06, 0.004, 24, 4), at(0, 0, 0, PI / 2 + i * 0.6, i * 0.9));
      if (r >= 3) for (const s of [-1, 1]) kit.add("silver", slab([[0, -0.08], [0.02, 0], [0, 0.08], [-0.01, 0]], 0.01, 0.003), at(s * 0.08, 0, 0));
    } else if (v === 1) {
      // organisch geglaetteter, durchbrochener Seelenstein
      kit.add(r >= 2 ? "gem" : "stone", sphere(0.055, 14, 10), at(0, 0, 0, 0, 0, 0, [1, 1.2, 0.8]));
      kit.add("metal", ring(0.058, 0.006, 24, 5), at(0, 0, 0, 0, PI / 2));
      if (r >= 1) kit.add("leather", ring(0.061, 0.005, 24, 4), at(0, 0, 0, PI / 2));
    } else {
      // Foliant mit beweglichen Seiten
      kit.add("leather", box(0.16, 0.2, 0.025, 0.004), at(-0.0, 0, -0.03));
      kit.add("leather", box(0.16, 0.2, 0.025, 0.004), at(0, 0, 0.03));
      kit.add("cloth3", box(0.15, 0.19, 0.05, 0.002), at(0, 0, 0));
      if (r >= 1) for (const s of [-1, 1]) kit.add("metal", box(0.03, 0.03, 0.065, 0.004), at(0.07, s * 0.09, 0));
      if (r >= 2) motif(kit, "silver", c, 0, 0, 0.045, 0.035);
    }
  };

  // ===== Schmuck (Tafel 18) =====
  F["amulett"] = function (kit, v, r, c) {
    const metal = r >= 4 ? "gold" : r >= 2 ? "silver" : "metal";
    if (v === 0 || v === 1) {
      // Amulett (Scheibe mit Sonne) bzw. Medaillon (rund, aufklappbar)
      kit.add(metal, new T.CylinderGeometry(0.03, 0.03, 0.008, 24).rotateX(PI / 2));
      if (r >= 1) kit.add(metal, ring(0.03, 0.003, 24, 4));
      motif(kit, r >= 2 ? "silver" : metal, c, 0, 0, 0.006, 0.02);
    } else if (v === 2) {
      // geometrische Runenplatte in Rautenfassung
      kit.add(metal, slab([[0, -0.045], [0.028, 0], [0, 0.045], [-0.028, 0]], 0.006, 0.002));
      if (r >= 2) kit.add("gem", gem(0.016, 0.05, 4), at(0, 0, 0.005, PI / 2, 0, 0, [1, 1, 0.4]));
    } else {
      // Totem: geschnitztes Holz
      kit.add("wood", box(0.022, 0.05, 0.014, 0.004));
      kit.add("bone", box(0.03, 0.01, 0.016, 0.003), at(0, 0.012, 0));
    }
    if (r >= 3) kit.add(metal, ring(0.042, 0.003, 32, 4));
    if (r >= 4) for (let i = 0; i < 4; i++) kit.add("gold", new T.ConeGeometry(0.006, 0.02, 4), at(Math.cos((i * PI) / 2) * 0.05, Math.sin((i * PI) / 2) * 0.05, 0, 0, 0, -(i * PI) / 2));
    kit.add(metal, ring(0.006, 0.002, 12, 4), at(0, 0.036, 0));
  };
  F["ring"] = function (kit, v, r, c) {
    const metal = r >= 4 ? "gold" : r >= 2 ? "silver" : "metal";
    const band = v === 3 ? "bone" : metal;
    kit.add(band, ring(0.0105, v === 1 ? 0.0032 : 0.0022, 20, 6));
    if (v === 1) kit.add(metal, new T.CylinderGeometry(0.006, 0.006, 0.004, 12), at(0, 0.012, 0));
    if (v === 2 || r >= 2) kit.add("gem", gem(0.0045, 0.009, 5), at(0, 0.0135, 0));
    if (r >= 3) kit.add(metal, ring(0.006, 0.0012, 12, 4), at(0, 0.0125, 0, PI / 2));
  };
  F["talisman"] = function (kit, v, r, c) {
    // Lederschlaufe am Guertel und das Relikt darunter
    kit.add("leather", box(0.018, 0.045, 0.006, 0.002), at(0, 0.03, 0));
    const metal = r >= 4 ? "gold" : r >= 2 ? "silver" : "metal";
    if (v === 2 || v === 0) {
      kit.add(r >= 2 && v === 2 ? "stone" : "stone", sphere(0.025, 10, 8), at(0, -0.02, 0, 0, 0, 0, [0.85, 1.3, 0.55]));
      if (r >= 1) kit.add("leather", ring(0.024, 0.003, 16, 4), at(0, -0.02, 0, 0, 0, 0.6));
      if (r >= 2) kit.add(metal, ring(0.027, 0.0025, 20, 4), at(0, -0.02, 0, 0, PI / 2));
      if (r >= 2) kit.add("gem", box(0.008, 0.02, 0.004), at(0, -0.02, 0.014));
    } else if (v === 1) {
      kit.add("wood", box(0.022, 0.06, 0.012, 0.004), at(0, -0.02, 0, 0, 0, 0.2));
      if (r >= 1) motif(kit, metal, c, 0, -0.02, 0.008, 0.012);
    } else {
      kit.add("wood", lathe([[0.008, 0], [0.014, 0.01], [0.012, 0.03], [0.016, 0.045], [0.006, 0.06]], 8), at(0, -0.05, 0));
    }
    if (r >= 3) {
      // Laterne / Rahmen um das Relikt
      for (let i = 0; i < 4; i++) kit.add(metal, tube([[0, 0.0, 0], [Math.cos((i * PI) / 2) * 0.03, -0.02, Math.sin((i * PI) / 2) * 0.03], [0, -0.05, 0]], 0.0025, 8, 4));
    }
  };

  // ===== Kopfschmuck: Runenkrone (offener Reif / Diadem) =====
  // Masse am Grundkopf (Stirnhoehe), im Spiel je Volk skaliert
  const HEAD = { cy: 1.935, cz: 0.07, rx: 0.1, rz: 0.112 };
  IT.HEAD = HEAD;
  F["krone"] = function (kit, v, r, c) {
    const metal = r >= 4 ? "gold" : r >= 1 ? "silver" : "metal";
    const g = ring(1, 0.07 + r * 0.008, 48, 6);
    g.scale(HEAD.rx * 1.02, HEAD.rz * 1.02, 0.12 + r * 0.02);
    g.rotateX(PI / 2);
    kit.add(metal, g, at(0, HEAD.cy, HEAD.cz, -0.12, 0, 0));
    // Stirnteil: Spitzen und gefasster Stein
    const fz = HEAD.cz + HEAD.rz * 1.02;
    const fy = HEAD.cy - 0.012;
    const n = r >= 3 ? 5 : r >= 1 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 0.32;
      const x = Math.sin(a) * HEAD.rx * 1.03;
      const z = HEAD.cz + Math.cos(a) * HEAD.rz * 1.03;
      const h = i === (n - 1) / 2 ? 0.05 + r * 0.008 : 0.028;
      kit.add(metal, slab([[0, 0], [0.012, 0.012], [0, h], [-0.012, 0.012]], 0.005, 0.002), at(x, fy, z, -0.15, a, 0));
    }
    if (r >= 2) kit.add("gem", gem(0.011 + r * 0.001, 0.03, 4), at(0, fy + 0.018, fz + 0.006, 0, 0, 0, [1, 1, 0.45]));
    if (r >= 4) {
      // legendaer: Reliktbogen ueber dem Kopf (Tafel 13)
      const arc = ring(0.13, 0.005, 32, 5, PI);
      kit.add("gold", arc, at(0, HEAD.cy + 0.02, HEAD.cz - 0.03, -0.25, 0, 0));
    }
  };

  /* ---------- Aufbau eines Gegenstands ---------- */
  IT.build = function (base, variant, rarity, culture, pal) {
    T = R.T();
    const f = F[base];
    if (!f) return null;
    const kit = new Kit();
    f(kit, variant | 0, RI[rarity] || 0, culture || "midgard");
    return kit.group(pal, culture);
  };
})();
