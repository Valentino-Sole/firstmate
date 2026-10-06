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

  // Die Bauregeln stehen in r3d-items-weapons.js (Waffen) und r3d-items-armor.js (Schilde, Kopfteile, Schmuck).
  // Masse am Grundkopf (Stirnhoehe), im Spiel je Volk skaliert
  IT.HEAD = { cy: 1.935, cz: 0.07, rx: 0.1, rz: 0.112 };

  /* ---------- Aufbau eines Gegenstands ---------- */
  // vis: Erscheinung (Ornamentvariante o) fuer kleine Unterschiede bei gleicher Form
  IT.build = function (base, variant, rarity, culture, pal, vis) {
    T = R.T();
    const f = F[base];
    if (!f) return null;
    const kit = new Kit();
    let flags = null;
    try {
      flags = f(kit, variant | 0, RI[rarity] || 0, culture || "midgard", vis || {});
    } catch (e) {
      console.warn("Bauregel " + base + " fehlgeschlagen", e);
      return null;
    }
    const g = kit.group(pal, culture);
    if (flags) Object.assign(g.userData, flags);
    return g;
  };
})();
