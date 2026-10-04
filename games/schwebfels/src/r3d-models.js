/* Helden von Schwebfels - 3D-Modelle (three.js, prozedural, Cartoon-Schattierung).
   Alle Figuren werden aus Grundkoerpern gebaut, es werden keine fremden Grafiken geladen. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const R = (SB.R3D = SB.R3D || {});
  let T = null;

  R.ready = function () {
    T = globalThis.THREE || null;
    if (!T) return false;
    if (R._webgl === undefined) {
      try {
        const c = document.createElement("canvas");
        R._webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
      } catch (e) {
        R._webgl = false;
      }
    }
    return R._webgl;
  };
  R.T = () => T;

  /* ---------- Geometrie- und Materialcache ---------- */
  const G = {};
  const geo = (k, make) => G[k] || (G[k] = make());
  const sph = (r, w, h) => geo("s" + r + "|" + (w || 18) + "|" + (h || 14), () => new T.SphereGeometry(r, w || 18, h || 14));
  const cap = (r, th) => geo("cap" + r + "|" + th, () => new T.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, th));
  const box = (x, y, z) => geo("b" + x + "|" + y + "|" + z, () => new T.BoxGeometry(x, y, z));
  const cyl = (rt, rb, h, s) => geo("c" + rt + "|" + rb + "|" + h + "|" + (s || 14), () => new T.CylinderGeometry(rt, rb, h, s || 14));
  const cone = (r, h, s) => geo("k" + r + "|" + h + "|" + (s || 12), () => new T.ConeGeometry(r, h, s || 12));
  const capsule = (r, l, s) => geo("p" + r + "|" + l + "|" + (s || 10), () => new T.CapsuleGeometry(r, l, 4, s || 10));
  const torus = (r, t, arc, rs, ts) => geo("t" + r + "|" + t + "|" + arc + "|" + (rs || 8) + "|" + (ts || 24), () => new T.TorusGeometry(r, t, rs || 8, ts || 24, arc || Math.PI * 2));
  const octa = (r) => geo("o" + r, () => new T.OctahedronGeometry(r, 0));
  const ico = (r, d) => geo("i" + r + "|" + (d || 0), () => new T.IcosahedronGeometry(r, d || 0));
  const dodeca = (r) => geo("d" + r, () => new T.DodecahedronGeometry(r, 0));
  R.geo = { sph, cap, box, cyl, cone, capsule, torus, octa, ico, dodeca, geo };

  let gradTex = null;
  function grad() {
    if (gradTex) return gradTex;
    const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
    gradTex = new T.DataTexture(data, 4, 1, T.RGBAFormat);
    gradTex.minFilter = gradTex.magFilter = T.NearestFilter;
    gradTex.needsUpdate = true;
    return gradTex;
  }
  const MC = {};
  function toon(color, o) {
    o = o || {};
    const k = "t" + color + "|" + (o.e || "") + "|" + (o.ei || 0) + "|" + (o.op || 1) + "|" + (o.ds ? 1 : 0) + "|" + (o.flat ? 1 : 0);
    if (MC[k]) return MC[k];
    const m = new T.MeshToonMaterial({ color: new T.Color(color), gradientMap: grad() });
    if (o.e) {
      m.emissive = new T.Color(o.e);
      m.emissiveIntensity = o.ei == null ? 1 : o.ei;
    }
    if (o.op && o.op < 1) {
      m.transparent = true;
      m.opacity = o.op;
      m.depthWrite = false;
    }
    if (o.ds) m.side = T.DoubleSide;
    if (o.flat) m.flatShading = true;
    return (MC[k] = m);
  }
  function glow(color, op) {
    const k = "g" + color + "|" + (op || 1);
    if (MC[k]) return MC[k];
    return (MC[k] = new T.MeshBasicMaterial({ color: new T.Color(color), transparent: true, opacity: op == null ? 0.6 : op, blending: T.AdditiveBlending, depthWrite: false }));
  }
  function basic(color, op) {
    const k = "bs" + color + "|" + (op || 1);
    if (MC[k]) return MC[k];
    const m = new T.MeshBasicMaterial({ color: new T.Color(color) });
    if (op && op < 1) {
      m.transparent = true;
      m.opacity = op;
      m.depthWrite = false;
    }
    return (MC[k] = m);
  }
  let outlineM = null;
  const outline = () => outlineM || (outlineM = new T.MeshBasicMaterial({ color: 0x1c1626, side: T.BackSide }));
  let flashM = null;
  const flashMat = () => flashM || (flashM = new T.MeshBasicMaterial({ color: 0xffffff }));
  R.mat = { toon, glow, basic, outline };

  function mesh(g, m, o) {
    const me = new T.Mesh(g, m);
    o = o || {};
    if (o.p) me.position.set(o.p[0], o.p[1], o.p[2]);
    if (o.r) me.rotation.set(o.r[0], o.r[1], o.r[2]);
    if (o.s != null) typeof o.s === "number" ? me.scale.setScalar(o.s) : me.scale.set(o.s[0], o.s[1], o.s[2]);
    me.castShadow = o.shadow !== false;
    if (o.ol !== 0 && !m.transparent) {
      const ol = new T.Mesh(g, outline());
      ol.scale.setScalar(1 + (o.ol || 0.06));
      ol.userData.outline = true;
      ol.castShadow = false;
      ol.raycast = () => {};
      me.add(ol);
    }
    return me;
  }
  const grp = (p, r) => {
    const g = new T.Group();
    if (p) g.position.set(p[0], p[1], p[2]);
    if (r) g.rotation.set(r[0], r[1], r[2]);
    return g;
  };
  R.mesh = mesh;
  R.grp = grp;

  const RAR_GLOW = { gewoehnlich: null, ungewoehnlich: null, selten: "#4fa9ff", episch: "#c47bff", legendaer: "#ffb13b" };
  const shade = (hex, f) => {
    const c = new T.Color(hex);
    c.multiplyScalar(f);
    return "#" + c.getHexString();
  };
  const mix = (a, b, t) => {
    const c = new T.Color(a);
    c.lerp(new T.Color(b), t);
    return "#" + c.getHexString();
  };
  R.shade = shade;

  /* ---------- Waffen und Nebenhand ---------- */
  function buildWeapon(w, accentGlow) {
    const g = grp();
    const metal = w.tint && w.base !== "bogen" && w.base !== "stab" ? "#c8ced6" : "#c8ced6";
    const wood = "#7a4f2c";
    const glowC = RAR_GLOW[w.rarity];
    const edge = glowC ? toon(mix(metal, glowC, 0.35), { e: glowC, ei: 0.55 }) : toon(metal);
    const grip = toon(shade(w.tint || wood, 0.85));
    switch (w.base) {
      case "schwert": {
        g.add(mesh(cyl(0.035, 0.035, 0.24, 8), grip, { p: [0, 0, 0] }));
        g.add(mesh(sph(0.055, 10, 8), toon("#d9a441"), { p: [0, -0.14, 0] }));
        g.add(mesh(box(0.34, 0.06, 0.08), toon("#d9a441"), { p: [0, 0.14, 0] }));
        g.add(mesh(box(0.1, 0.78, 0.03), edge, { p: [0, 0.56, 0] }));
        g.add(mesh(cone(0.071, 0.16, 4), edge, { p: [0, 1.03, 0], r: [0, Math.PI / 4, 0], s: [1, 1, 0.42] }));
        if (w.style === 1) g.add(mesh(box(0.03, 0.6, 0.035), toon("#5a5f6a"), { p: [0, 0.5, 0], ol: 0 }));
        break;
      }
      case "axt": {
        g.add(mesh(cyl(0.04, 0.045, 1.0, 8), toon(wood), { p: [0, 0.32, 0] }));
        const head = mesh(box(0.34, 0.3, 0.05), edge, { p: [0.17, 0.72, 0] });
        g.add(head);
        g.add(mesh(cyl(0.16, 0.16, 0.055, 16, 1), edge, { p: [0.32, 0.72, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 1.1] }));
        if (w.style !== 0) g.add(mesh(cone(0.07, 0.22, 4), toon("#9aa4ad"), { p: [-0.12, 0.72, 0], r: [0, 0, Math.PI / 2] }));
        break;
      }
      case "hammer": {
        g.add(mesh(cyl(0.04, 0.045, 0.95, 8), toon(wood), { p: [0, 0.3, 0] }));
        g.add(mesh(box(0.42, 0.24, 0.24), edge, { p: [0, 0.82, 0] }));
        g.add(mesh(box(0.08, 0.3, 0.3), toon("#d9a441"), { p: [0, 0.82, 0] }));
        break;
      }
      case "dolch": {
        g.add(mesh(cyl(0.03, 0.03, 0.16, 8), grip, {}));
        g.add(mesh(box(0.18, 0.04, 0.05), toon("#d9a441"), { p: [0, 0.09, 0] }));
        g.add(mesh(cone(0.06, 0.42, 4), edge, { p: [0, 0.32, 0], r: [0, Math.PI / 4, 0], s: [1, 1, 0.35] }));
        break;
      }
      case "armbrust": {
        g.add(mesh(box(0.08, 0.08, 0.7), toon(wood), { p: [0, 0.05, 0.2] }));
        g.add(mesh(torus(0.35, 0.025, Math.PI * 0.8, 6, 16), toon(shade(w.tint || wood, 0.8)), { p: [0, 0.08, 0.5], r: [Math.PI / 2, 0, Math.PI * 0.1 + Math.PI] }));
        g.add(mesh(cyl(0.012, 0.012, 0.55, 5), toon("#c9b89a"), { p: [0, 0.12, 0.35], r: [0, 0, Math.PI / 2], ol: 0 }));
        break;
      }
      case "bogen": {
        g.add(mesh(torus(0.55, 0.035, Math.PI * 0.95, 6, 20), toon(w.tint || wood), { r: [0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.025] }));
        g.add(mesh(cyl(0.008, 0.008, 1.08, 4), basic("#efe6d2"), { p: [0, 0, -0.06], ol: 0 }));
        if (glowC) g.add(mesh(sph(0.07, 8, 6), glow(glowC, 0.8), { p: [0, 0, 0.55], ol: 0 }));
        break;
      }
      case "stab": {
        g.add(mesh(cyl(0.04, 0.05, 1.6, 8), toon(w.tint || wood), { p: [0, 0.45, 0] }));
        const crystal = mesh(octa(0.15), toon(glowC || "#7fe3ff", { e: glowC || "#7fe3ff", ei: 0.8 }), { p: [0, 1.4, 0], s: [1, 1.5, 1] });
        crystal.userData.spin = 1.5;
        g.add(crystal);
        g.add(mesh(torus(0.13, 0.025, Math.PI * 2, 6, 14), toon("#d9a441"), { p: [0, 1.25, 0], r: [Math.PI / 2, 0, 0] }));
        break;
      }
      case "zepter": {
        g.add(mesh(cyl(0.035, 0.04, 0.7, 8), toon("#d9a441"), { p: [0, 0.18, 0] }));
        g.add(mesh(sph(0.14, 14, 10), toon(glowC || "#ff7a9a", { e: glowC || "#ff7a9a", ei: 0.7 }), { p: [0, 0.62, 0] }));
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          g.add(mesh(cone(0.035, 0.14, 5), toon("#d9a441"), { p: [Math.cos(a) * 0.12, 0.72, Math.sin(a) * 0.12] }));
        }
        break;
      }
      default:
        g.add(mesh(box(0.08, 0.6, 0.08), toon(wood), { p: [0, 0.3, 0] }));
    }
    return g;
  }

  function buildOffhand(o) {
    const g = grp();
    const glowC = RAR_GLOW[o.rarity];
    if (o.base === "schild") {
      const face = toon(o.tint || "#8d6b4a");
      const rim = toon(glowC ? mix("#c9a441", glowC, 0.5) : "#c9a441", glowC ? { e: glowC, ei: 0.4 } : null);
      if (o.style === 1) {
        g.add(mesh(box(0.62, 0.72, 0.07), face, { p: [0, 0.05, 0] }));
        g.add(mesh(cone(0.44, 0.34, 4), face, { p: [0, -0.48, 0], r: [Math.PI, Math.PI / 4, 0], s: [1, 1, 0.12] }));
        g.add(mesh(box(0.08, 0.9, 0.09), rim, { p: [0, -0.05, 0.02] }));
        g.add(mesh(box(0.62, 0.08, 0.09), rim, { p: [0, 0.18, 0.02] }));
      } else if (o.style === 2) {
        g.add(mesh(box(0.66, 0.9, 0.08), face, {}));
        g.add(mesh(box(0.74, 0.08, 0.1), rim, { p: [0, 0.45, 0] }));
        g.add(mesh(box(0.74, 0.08, 0.1), rim, { p: [0, -0.45, 0] }));
        g.add(mesh(sph(0.1, 10, 8), rim, { p: [0, 0, 0.05] }));
      } else {
        g.add(mesh(cyl(0.42, 0.42, 0.07, 22), face, { r: [Math.PI / 2, 0, 0] }));
        g.add(mesh(torus(0.42, 0.04, Math.PI * 2, 6, 26), rim, {}));
        g.add(mesh(sph(0.11, 12, 8), rim, { p: [0, 0, 0.05] }));
      }
    } else if (o.base === "koecher") {
      g.add(mesh(cyl(0.11, 0.09, 0.62, 10), toon(o.tint || "#6b4a2f"), {}));
      for (let i = 0; i < 3; i++) {
        g.add(mesh(cyl(0.012, 0.012, 0.3, 4), toon("#c9b89a"), { p: [(i - 1) * 0.045, 0.42, 0], ol: 0 }));
        g.add(mesh(box(0.06, 0.1, 0.01), toon(i === 1 ? "#ffffff" : "#d0503a"), { p: [(i - 1) * 0.045, 0.57, 0], ol: 0 }));
      }
    } else if (o.base === "fokus") {
      const c = glowC || o.tint || "#5fd0d6";
      const cr = mesh(octa(0.17), toon(c, { e: c, ei: 0.8 }), { s: [1, 1.3, 1] });
      cr.userData.spin = 2.2;
      cr.userData.bob = 1;
      g.add(cr);
      g.add(mesh(torus(0.26, 0.015, Math.PI * 2, 4, 26), glow(c, 0.7), { r: [Math.PI / 2.3, 0, 0], ol: 0 }));
    }
    return g;
  }

  /* ---------- Helden ---------- */
  const DEF_LOOK = { skin: "#f2cba8", hair: "#3b2a20", hairStyle: 0, beard: 0, eyes: "#1d1b26" };

  R.buildHero = function (desc) {
    const D = SB.data;
    const race = D.RACES[desc.race] || D.RACES.wolkling;
    const C = D.CLASSES[desc.cls] || D.CLASSES.klinge;
    const look = Object.assign({}, DEF_LOOK, desc.look || {});
    const gear = desc.gear || {};
    const h = race.height;
    const w = race.width * (desc.gender === "w" ? 0.92 : 1);
    const skin = toon(look.skin);
    const root = grp();
    const body = grp();
    root.add(body);
    const parts = { root, body };

    const armor = gear.ruestung;
    const mat = C.material;
    const shirt = armor ? armor.tint : desc.gender === "w" ? "#c9b8d6" : "#cfc3ad";
    const pantsC = mat === "stoff" && armor ? shade(armor.tint, 0.7) : "#6b5a4a";
    const bootC = gear.stiefel ? gear.stiefel.tint : "#4a3a30";

    // Beine
    const hipY = 0.78 * h;
    for (const side of [1, -1]) {
      const leg = grp([0.16 * w * side, hipY, 0]);
      leg.add(mesh(capsule(0.13 * w, 0.36 * h), toon(pantsC), { p: [0, -0.3 * h, 0] }));
      const bootH = gear.stiefel ? 0.3 : 0.18;
      leg.add(mesh(cyl(0.15 * w, 0.16 * w, bootH, 12), toon(bootC), { p: [0, -0.62 * h - 0.06 + bootH / 2 - 0.06, 0] }));
      leg.add(mesh(box(0.24 * w, 0.13, 0.36), toon(shade(bootC, 0.9)), { p: [0, -0.72 * h, 0.06] }));
      if (gear.stiefel && gear.stiefel.rarity && RAR_GLOW[gear.stiefel.rarity]) leg.add(mesh(torus(0.16 * w, 0.025, Math.PI * 2, 5, 16), toon("#d9a441"), { p: [0, -0.5 * h, 0], r: [Math.PI / 2, 0, 0], ol: 0 }));
      body.add(leg);
      parts[side > 0 ? "legL" : "legR"] = leg;
    }

    // Rumpf
    const torso = grp([0, hipY, 0]);
    body.add(torso);
    parts.torso = torso;
    const tH = 0.66 * h;
    torso.add(mesh(cyl(0.31 * w, 0.27 * w, tH, 16), toon(shirt), { p: [0, tH / 2, 0], s: [1, 1, 0.82] }));
    torso.add(mesh(sph(0.27 * w, 16, 10), toon(pantsC), { p: [0, 0.02, 0], s: [1, 0.55, 0.82] }));
    torso.add(mesh(torus(0.28 * w, 0.045, Math.PI * 2, 6, 22), toon(mat === "platte" && armor ? "#5a4a3a" : "#5a3d2a"), { p: [0, 0.08, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.82, 1] }));
    torso.add(mesh(box(0.1, 0.08, 0.04), toon("#d9a441"), { p: [0, 0.08, 0.24 * w], ol: 0.1 }));
    if (armor) {
      if (mat === "platte") {
        torso.add(mesh(box(0.5 * w, 0.42 * h, 0.14), toon(shade(armor.tint, 1.1)), { p: [0, 0.38 * h, 0.2 * w] }));
        if (armor.style === 1) torso.add(mesh(octa(0.08), toon("#d9a441"), { p: [0, 0.42 * h, 0.29 * w], s: [1, 1.3, 0.4] }));
        if (armor.style === 2) torso.add(mesh(box(0.08, 0.36 * h, 0.04), toon("#d9a441"), { p: [0, 0.38 * h, 0.28 * w], ol: 0 }));
      } else if (mat === "leder") {
        torso.add(mesh(box(0.08, 0.72 * h, 0.05), toon("#3e2a1c"), { p: [0, 0.36 * h, 0.23 * w], r: [0, 0, 0.75], ol: 0 }));
        torso.add(mesh(box(0.16, 0.14, 0.1), toon("#5a3d2a"), { p: [0.18 * w, 0.06, 0.2 * w] }));
      } else {
        torso.add(mesh(cyl(0.29 * w, 0.46 * w, 0.62 * h, 16), toon(armor.tint), { p: [0, -0.26 * h, 0], s: [1, 1, 0.85] }));
        torso.add(mesh(torus(0.22 * w, 0.06, Math.PI * 2, 6, 18), toon("#d9a441"), { p: [0, tH - 0.02, 0], r: [Math.PI / 2, 0, 0] }));
        if (armor.style !== 0) torso.add(mesh(box(0.1, 0.5 * h, 0.03), toon("#d9a441"), { p: [0, -0.1 * h, 0.27 * w], ol: 0 }));
      }
    }

    // Umhang (eigene Geometrie fuer die Wellenanimation)
    if (gear.umhang) {
      const cg = new T.PlaneGeometry(0.72 * w, 1.08 * h, 4, 8);
      cg.translate(0, -0.54 * h, 0);
      const capeMesh = new T.Mesh(cg, toon(gear.umhang.tint || "#b04a4a", { ds: true }));
      capeMesh.position.set(0, tH - 0.02, -0.27 * w);
      capeMesh.rotation.x = 0.12;
      capeMesh.castShadow = true;
      capeMesh.userData.cape = cg.attributes.position.array.slice(0);
      torso.add(capeMesh);
      parts.cape = capeMesh;
      torso.add(mesh(torus(0.2 * w, 0.04, Math.PI, 6, 12), toon(shade(gear.umhang.tint || "#b04a4a", 0.8)), { p: [0, tH - 0.02, -0.12 * w], r: [Math.PI / 2 - 0.3, 0, 0], ol: 0 }));
    }

    // Kopf
    const HR = 0.4;
    const head = grp([0, tH + HR * 0.92, 0]);
    torso.add(head);
    parts.head = head;
    head.add(mesh(cyl(0.11, 0.13, 0.14, 10), skin, { p: [0, -HR * 0.9, 0] }));
    head.add(mesh(sph(HR, 22, 16), skin, { s: [1.0 * Math.min(1.12, w), 0.96, 0.94] }));
    // Augen
    for (const side of [1, -1]) {
      head.add(mesh(sph(0.085, 12, 10), basic("#ffffff"), { p: [0.15 * side, 0.03, HR * 0.84], s: [1, 1.15, 0.6], ol: 0 }));
      head.add(mesh(sph(0.055, 10, 8), basic(look.eyes || "#1d1b26"), { p: [0.15 * side, 0.02, HR * 0.89], s: [1, 1.2, 0.6], ol: 0 }));
      head.add(mesh(sph(0.018, 6, 6), basic("#ffffff"), { p: [0.15 * side + 0.02, 0.05, HR * 0.93], ol: 0 }));
      head.add(mesh(box(0.13, 0.03, 0.03), basic(shade(look.hair, 0.8)), { p: [0.15 * side, 0.15, HR * 0.86], r: [0, 0, -0.18 * side], ol: 0 }));
      head.add(mesh(sph(0.05, 8, 6), toon("#ff9a8a", { op: 0.55 }), { p: [0.23 * side, -0.1, HR * 0.78], s: [1.2, 0.7, 0.5], ol: 0 }));
    }
    head.add(mesh(sph(0.06, 10, 8), toon(shade(look.skin, 0.93)), { p: [0, -0.06, HR * 0.95], s: [1, 0.9, 0.9], ol: 0 }));
    head.add(mesh(torus(0.06, 0.014, Math.PI, 5, 10), basic("#5a2f2f"), { p: [0, -0.17, HR * 0.86], r: [0, 0, Math.PI], ol: 0 }));
    // Ohren
    for (const side of [1, -1]) {
      if (race.ears === "long") head.add(mesh(cone(0.07, 0.42, 6), skin, { p: [HR * 0.98 * side, 0.08, -0.02], r: [0, 0, -side * 1.25], s: [1, 1, 0.5] }));
      else if (race.ears === "pointy") head.add(mesh(cone(0.08, 0.22, 6), skin, { p: [HR * 0.98 * side, 0.02, 0], r: [0, 0, -side * 1.35], s: [1, 1, 0.5] }));
      else if (race.ears === "leaf") head.add(mesh(sph(0.1, 10, 8), toon("#6aa84f"), { p: [HR * 0.98 * side, 0.02, 0], s: [1.6, 0.6, 0.35], r: [0, 0, side * 0.4] }));
      else head.add(mesh(sph(0.075, 10, 8), skin, { p: [HR * 0.96 * side, 0, 0], s: [0.6, 1, 0.8] }));
    }
    if (race.horns) {
      for (const side of [1, -1]) {
        const horn = mesh(cone(0.07, 0.34, 8), toon("#efe6d2"), { p: [0.2 * side, HR * 0.78, 0.02], r: [0.2, 0, -side * 0.5] });
        head.add(horn);
      }
    }
    // Haare
    const hairM = toon(look.hair);
    const hs = look.hairStyle | 0;
    const helmOn = !!gear.helm;
    if (desc.race === "moosling") {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        head.add(mesh(sph(0.14, 10, 8), hairM, { p: [Math.cos(a) * 0.18, HR * 0.86, Math.sin(a) * 0.18 - 0.03] }));
      }
      head.add(mesh(sph(0.16, 10, 8), hairM, { p: [0, HR * 0.98, -0.02] }));
    } else if (hs !== 4 && !helmOn) {
      head.add(mesh(cap(HR * 1.05, Math.PI * 0.42), hairM, { p: [0, 0.02, -0.02], r: [-0.25, 0, 0] }));
      if (hs === 1) {
        for (let i = 0; i < 5; i++) head.add(mesh(cone(0.08, 0.24, 6), hairM, { p: [(i - 2) * 0.11, HR * 0.95, -0.05], r: [-0.3, 0, (i - 2) * -0.25] }));
      }
    }
    if (hs === 2) head.add(mesh(box(0.66, 0.6, 0.18), hairM, { p: [0, -0.2, -HR * 0.72], s: [Math.min(1.1, w), 1, 1] }));
    if (hs === 3) {
      head.add(mesh(sph(0.15, 12, 10), hairM, { p: [0, HR * 0.55, -HR * 0.85] }));
      head.add(mesh(capsule(0.06, 0.28), hairM, { p: [0, HR * 0.1, -HR * 1.05], r: [0.4, 0, 0] }));
    }
    if (hs === 0 && desc.gender === "w" && !helmOn) head.add(mesh(box(0.7, 0.36, 0.16), hairM, { p: [0, -0.04, -HR * 0.74] }));
    // Bart
    const bd = look.beard | 0;
    if (bd === 1) head.add(mesh(cone(0.09, 0.22, 8), hairM, { p: [0, -HR * 0.82, HR * 0.55], r: [Math.PI - 0.4, 0, 0] }));
    if (bd === 2) head.add(mesh(sph(0.26, 14, 10), hairM, { p: [0, -HR * 0.5, HR * 0.45], s: [1.15, 0.85, 0.7] }));
    if (bd === 3) for (const side of [1, -1]) head.add(mesh(capsule(0.03, 0.14, 6), hairM, { p: [0.07 * side, -0.12, HR * 0.95], r: [0, 0, side * 1.2] }));

    // Helm
    if (gear.helm) {
      const hm = toon(gear.helm.tint || "#9aa4ad");
      const gl = RAR_GLOW[gear.helm.rarity];
      if (gear.helm.base === "helm") {
        head.add(mesh(cap(HR * 1.1, Math.PI * 0.55), hm, { p: [0, 0.02, 0] }));
        head.add(mesh(box(0.07, 0.3, 0.06), hm, { p: [0, 0.02, HR * 1.04] }));
        head.add(mesh(torus(HR * 1.06, 0.04, Math.PI * 2, 6, 24), toon("#d9a441"), { p: [0, 0.12, 0], r: [Math.PI / 2, 0, 0] }));
        if (gear.helm.style === 1) head.add(mesh(cone(0.09, 0.45, 8), toon(gl || "#c0392b", gl ? { e: gl, ei: 0.4 } : null), { p: [0, HR * 1.25, -0.05], r: [-0.4, 0, 0] }));
        if (gear.helm.style === 2) for (const side of [1, -1]) head.add(mesh(cone(0.08, 0.38, 8), toon("#efe6d2"), { p: [HR * 0.95 * side, HR * 0.55, 0], r: [0, 0, -side * 0.9] }));
      } else if (gear.helm.base === "kappe") {
        head.add(mesh(cap(HR * 1.13, Math.PI * 0.62), hm, { p: [0, 0, -0.04], r: [-0.35, 0, 0] }));
        head.add(mesh(cone(0.16, 0.42, 8), hm, { p: [0, 0.08, -HR * 1.1], r: [-1.9, 0, 0] }));
      } else {
        head.add(mesh(cyl(0.62, 0.62, 0.05, 24), hm, { p: [0, HR * 0.62, 0] }));
        head.add(mesh(cone(0.36, 0.7, 16), hm, { p: [0, HR * 0.62 + 0.36, -0.02], r: [-0.12, 0, 0] }));
        head.add(mesh(cone(0.12, 0.3, 10), hm, { p: [0, HR * 0.62 + 0.78, -0.18], r: [-0.9, 0, 0] }));
        head.add(mesh(torus(0.34, 0.04, Math.PI * 2, 6, 20), toon("#d9a441"), { p: [0, HR * 0.68, 0], r: [Math.PI / 2, 0, 0] }));
        head.add(mesh(octa(0.07), toon(gl || "#ffe27a", { e: gl || "#ffe27a", ei: 0.8 }), { p: [0, HR * 0.72, 0.33] }));
      }
    }

    // Arme
    const shY = tH - 0.1;
    const handM = gear.handschuhe ? toon(gear.handschuhe.tint || "#6b4a2f") : skin;
    for (const side of [1, -1]) {
      const arm = grp([(0.34 * w + 0.08) * side, shY, 0]);
      arm.add(mesh(capsule(0.09 * Math.sqrt(w), 0.36 * h), toon(armor && mat !== "platte" ? armor.tint : shirt), { p: [0, -0.24 * h, 0] }));
      const hand = grp([0, -0.5 * h, 0.02]);
      hand.add(mesh(sph(gear.handschuhe ? 0.125 : 0.11, 12, 10), handM, {}));
      if (gear.handschuhe) hand.add(mesh(cyl(0.12, 0.11, 0.1, 10), handM, { p: [0, 0.1, 0] }));
      arm.add(hand);
      if (armor && mat === "platte") arm.add(mesh(sph(0.19 * w, 14, 10), toon(shade(armor.tint, 1.05)), { p: [0, 0.02, 0], s: [1.1, 0.8, 1.05] }));
      if (armor && mat === "leder") arm.add(mesh(sph(0.13 * w, 12, 8), toon(shade(armor.tint, 0.85)), { p: [0, 0.02, 0], s: [1, 0.7, 1] }));
      torso.add(arm);
      parts[side > 0 ? "armL" : "armR"] = arm;
      parts[side > 0 ? "handL" : "handR"] = hand;
    }

    // Waffe und Nebenhand
    const wpn = gear.waffe;
    if (wpn) {
      if (wpn.base === "bogen") {
        const bow = buildWeapon(wpn);
        bow.rotation.set(0, 0, 0);
        bow.position.set(0, 0, 0.05);
        parts.handL.add(bow);
        parts.weapon = bow;
      } else if (wpn.base === "dolch") {
        const d1 = buildWeapon(wpn);
        d1.rotation.set(1.3, 0, 0);
        parts.handR.add(d1);
        const d2 = buildWeapon(wpn);
        d2.rotation.set(1.3, 0, 0);
        parts.handL.add(d2);
        parts.weapon = d1;
      } else if (wpn.base === "stab") {
        const st = buildWeapon(wpn);
        st.rotation.set(0.15, 0, 0);
        st.position.set(0, -0.4, 0.05);
        parts.handR.add(st);
        parts.weapon = st;
      } else if (wpn.base === "armbrust") {
        const ab = buildWeapon(wpn);
        ab.rotation.set(-0.2, 0, 0);
        parts.handR.add(ab);
        parts.weapon = ab;
      } else {
        const wg = buildWeapon(wpn);
        wg.rotation.set(1.25, 0, 0);
        parts.handR.add(wg);
        parts.weapon = wg;
      }
    }
    const off = gear.nebenhand;
    if (off) {
      const og = buildOffhand(off);
      if (off.base === "schild") {
        og.position.set(0.12, 0.05, 0.16);
        og.rotation.set(0, 0.35, 0);
        parts.handL.add(og);
      } else if (off.base === "koecher") {
        og.position.set(0.12, tH * 0.62, -0.32 * w);
        og.rotation.set(-0.3, 0, -0.5);
        torso.add(og);
      } else {
        og.position.set(0.05, 0.25, 0.32);
        parts.handL.add(og);
      }
      parts.offhand = og;
    }

    const scale = 0.95 + 0.05 * h;
    root.scale.setScalar(scale);
    const model = makeModel(root, parts, "hero");
    model.cls = desc.cls;
    model.ranged = !!(wpn && SB.data.BASES[wpn.base] && SB.data.BASES[wpn.base].ranged);
    model.weaponBase = wpn ? wpn.base : null;
    model.height = (tH + hipY + HR * 2.1) * scale;
    model.headY = (hipY + tH + HR) * scale;
    model.projColor = desc.cls === "rune" ? "#9f8cff" : desc.cls === "wind" ? "#e9d8a6" : "#ffd25a";
    return model;
  };

  /* ---------- Monster ---------- */
  function eyesOn(g, y, z, sep, r, color, glowing) {
    for (const s of [1, -1]) {
      if (glowing) g.add(mesh(sph(r, 10, 8), toon(color, { e: color, ei: 1 }), { p: [sep * s, y, z], ol: 0 }));
      else {
        g.add(mesh(sph(r, 10, 8), basic("#ffffff"), { p: [sep * s, y, z], s: [1, 1.1, 0.6], ol: 0 }));
        g.add(mesh(sph(r * 0.6, 8, 6), basic("#14121c"), { p: [sep * s, y - r * 0.1, z + r * 0.35], s: [1, 1.1, 0.6], ol: 0 }));
      }
    }
  }

  const MONSTER_BUILDERS = {
    schleim(m, root, P) {
      const body = grp();
      root.add(body);
      P.wobble = body;
      body.add(mesh(sph(0.75, 22, 16), toon(m.color, { op: 0.88 }), { p: [0, 0.62, 0], s: [1.15, 0.85, 1.05] }));
      body.add(mesh(sph(0.3, 12, 10), toon(m.accent, { e: m.accent, ei: 0.35 }), { p: [0, 0.6, 0] }));
      body.add(mesh(sph(0.62, 18, 12), toon(shade(m.color, 0.9)), { p: [0, 0.35, 0], s: [1.35, 0.4, 1.25] }));
      eyesOn(body, 0.86, 0.6, 0.22, 0.13, "#fff", false);
      body.add(mesh(torus(0.13, 0.03, Math.PI, 5, 10), basic("#14121c"), { p: [0, 0.62, 0.74], r: [0, 0, Math.PI], ol: 0 }));
      for (let i = 0; i < 3; i++) body.add(mesh(sph(0.09, 8, 6), toon(m.color, { op: 0.88 }), { p: [-0.5 + i * 0.5, 0.12, 0.7 - Math.abs(i - 1) * 0.2] }));
      P.headY = 1.3;
    },
    kobold(m, root, P) {
      const body = grp();
      root.add(body);
      for (const s of [1, -1]) body.add(mesh(capsule(0.09, 0.3), toon(shade(m.color, 0.85)), { p: [0.14 * s, 0.25, 0] }));
      body.add(mesh(sph(0.34, 16, 12), toon(m.accent), { p: [0, 0.68, 0], s: [1, 1.1, 0.85] }));
      const head = grp([0, 1.15, 0.05]);
      body.add(head);
      head.add(mesh(sph(0.36, 16, 12), toon(m.color), { s: [1.1, 0.95, 0.95] }));
      for (const s of [1, -1]) head.add(mesh(cone(0.12, 0.55, 6), toon(m.color), { p: [0.42 * s, 0.08, -0.02], r: [0, 0, -s * 1.35], s: [1, 1, 0.4] }));
      head.add(mesh(cone(0.07, 0.28, 8), toon(shade(m.color, 0.9)), { p: [0, -0.02, 0.38], r: [1.4, 0, 0] }));
      eyesOn(head, 0.08, 0.29, 0.14, 0.08, "#ffe45a", true);
      head.add(mesh(box(0.2, 0.04, 0.04), basic("#14121c"), { p: [0, -0.16, 0.31], ol: 0 }));
      const arm = grp([0.36, 0.8, 0]);
      arm.add(mesh(capsule(0.07, 0.25), toon(m.color), { p: [0, -0.18, 0] }));
      const dag = grp([0, -0.38, 0.06], [1.3, 0, 0]);
      dag.add(mesh(cone(0.06, 0.4, 4), toon("#c8ced6"), { p: [0, 0.24, 0], s: [1, 1, 0.35] }));
      dag.add(mesh(cyl(0.025, 0.025, 0.12, 6), toon("#5a3d2a"), {}));
      arm.add(dag);
      body.add(arm);
      body.add(mesh(capsule(0.07, 0.25), toon(m.color), { p: [-0.36, 0.62, 0], r: [0, 0, -0.3] }));
      P.armR = arm;
      P.head = head;
      P.headY = 1.55;
    },
    skelett(m, root, P) {
      const body = grp();
      root.add(body);
      const bone = toon(m.color);
      for (const s of [1, -1]) {
        body.add(mesh(cyl(0.05, 0.05, 0.75, 6), bone, { p: [0.16 * s, 0.38, 0] }));
        body.add(mesh(box(0.16, 0.08, 0.26), bone, { p: [0.16 * s, 0.04, 0.05] }));
      }
      body.add(mesh(cyl(0.05, 0.05, 0.7, 6), bone, { p: [0, 1.05, -0.05] }));
      body.add(mesh(box(0.42, 0.1, 0.2), bone, { p: [0, 0.78, 0] }));
      for (let i = 0; i < 4; i++) body.add(mesh(torus(0.22 - i * 0.02, 0.03, Math.PI * 1.4, 5, 14), bone, { p: [0, 0.98 + i * 0.12, 0.02], r: [Math.PI / 2, 0, Math.PI * 0.3 + Math.PI], s: [1, 0.8, 1] }));
      const head = grp([0, 1.62, 0]);
      body.add(head);
      head.add(mesh(sph(0.3, 16, 12), bone, { s: [1, 1.05, 1] }));
      head.add(mesh(box(0.34, 0.12, 0.26), bone, { p: [0, -0.26, 0.06] }));
      for (const s of [1, -1]) head.add(mesh(sph(0.08, 8, 6), toon("#14121c"), { p: [0.11 * s, 0.02, 0.24], ol: 0 }));
      for (const s of [1, -1]) head.add(mesh(sph(0.035, 6, 6), toon(m.accent, { e: m.accent, ei: 1 }), { p: [0.11 * s, 0.02, 0.29], ol: 0 }));
      const arm = grp([0.3, 1.28, 0]);
      arm.add(mesh(cyl(0.04, 0.04, 0.55, 6), bone, { p: [0, -0.28, 0] }));
      const sw = grp([0, -0.58, 0.04], [1.3, 0, 0]);
      sw.add(mesh(box(0.08, 0.7, 0.025), toon("#8a6b4a"), { p: [0, 0.4, 0] }));
      sw.add(mesh(box(0.24, 0.05, 0.06), toon("#5a4a3a"), { p: [0, 0.04, 0] }));
      arm.add(sw);
      body.add(arm);
      body.add(mesh(cyl(0.04, 0.04, 0.55, 6), bone, { p: [-0.32, 1.02, 0], r: [0, 0, -0.2] }));
      P.armR = arm;
      P.head = head;
      P.headY = 2.0;
    },
    wolf(m, root, P) {
      const body = grp();
      root.add(body);
      const fur = toon(m.color);
      body.add(mesh(capsule(0.36, 0.7), fur, { p: [0, 0.82, -0.1], r: [Math.PI / 2, 0, 0] }));
      body.add(mesh(sph(0.42, 14, 10), toon(shade(m.color, 1.08)), { p: [0, 0.92, 0.32], s: [1, 1, 0.9] }));
      for (const [x, z] of [[0.22, 0.4], [-0.22, 0.4], [0.22, -0.55], [-0.22, -0.55]]) body.add(mesh(capsule(0.1, 0.42), toon(shade(m.color, 0.85)), { p: [x, 0.35, z] }));
      const head = grp([0, 1.2, 0.72]);
      body.add(head);
      head.add(mesh(sph(0.32, 14, 10), fur, {}));
      head.add(mesh(box(0.26, 0.2, 0.4), fur, { p: [0, -0.08, 0.3] }));
      head.add(mesh(sph(0.06, 8, 6), toon("#14121c"), { p: [0, -0.01, 0.51], ol: 0 }));
      for (const s of [1, -1]) head.add(mesh(cone(0.11, 0.3, 4), fur, { p: [0.17 * s, 0.32, -0.05], r: [0, 0, -0.25 * s] }));
      eyesOn(head, 0.08, 0.24, 0.13, 0.06, m.accent, true);
      for (const s of [1, -1]) head.add(mesh(cone(0.025, 0.1, 4), basic("#ffffff"), { p: [0.08 * s, -0.2, 0.42], r: [Math.PI, 0, 0], ol: 0 }));
      const tail = mesh(cone(0.13, 0.6, 8), fur, { p: [0, 1.0, -0.8], r: [-2.1, 0, 0] });
      body.add(tail);
      P.tail = tail;
      P.head = head;
      P.headY = 1.6;
    },
    golem(m, root, P) {
      const body = grp();
      root.add(body);
      const st = toon(m.color, { flat: true });
      for (const s of [1, -1]) body.add(mesh(box(0.34, 0.6, 0.38), st, { p: [0.28 * s, 0.3, 0] }));
      body.add(mesh(dodeca(0.68), st, { p: [0, 1.05, 0], s: [1.1, 0.95, 0.85] }));
      body.add(mesh(octa(0.18), toon(m.accent, { e: m.accent, ei: 0.9 }), { p: [0, 1.1, 0.5], ol: 0 }));
      const head = grp([0, 1.78, 0.08]);
      body.add(head);
      head.add(mesh(box(0.5, 0.4, 0.45), st, {}));
      head.add(mesh(box(0.34, 0.07, 0.05), toon(m.accent, { e: m.accent, ei: 1.2 }), { p: [0, 0.03, 0.23], ol: 0 }));
      for (const s of [1, -1]) {
        const arm = grp([0.82 * s, 1.35, 0]);
        arm.add(mesh(box(0.32, 0.75, 0.34), st, { p: [0, -0.4, 0] }));
        arm.add(mesh(dodeca(0.3), st, { p: [0, -0.9, 0.05] }));
        arm.add(mesh(octa(0.12), toon(m.accent, { e: m.accent, ei: 0.7 }), { p: [0, 0.18, 0], ol: 0 }));
        body.add(arm);
        if (s > 0) P.armR = arm;
        else P.armL = arm;
      }
      P.head = head;
      P.headY = 2.15;
    },
    flatterer(m, root, P) {
      const body = grp([0, 0.5, 0]);
      root.add(body);
      P.hover = body;
      body.add(mesh(sph(0.42, 16, 12), toon(m.color), { p: [0, 0.9, 0] }));
      body.add(mesh(sph(0.3, 12, 8), toon(shade(m.color, 1.25)), { p: [0, 0.82, 0.18], s: [1, 1, 0.6] }));
      for (const s of [1, -1]) body.add(mesh(cone(0.14, 0.4, 6), toon(m.color), { p: [0.2 * s, 1.36, -0.02], r: [0, 0, -0.3 * s] }));
      eyesOn(body, 1.0, 0.36, 0.14, 0.09, m.accent, true);
      for (const s of [1, -1]) body.add(mesh(cone(0.03, 0.1, 4), basic("#ffffff"), { p: [0.07 * s, 0.78, 0.38], r: [Math.PI, 0, 0], ol: 0 }));
      const wings = [];
      for (const s of [1, -1]) {
        const wg = grp([0.35 * s, 0.95, 0]);
        const wm = mesh(cone(0.5, 1.1, 3), toon(shade(m.color, 0.75), { ds: true }), { p: [0.55 * s, 0, 0], r: [0, 0, -s * Math.PI / 2], s: [1, 1, 0.08] });
        wg.add(wm);
        wg.add(mesh(cyl(0.025, 0.025, 1.0, 5), toon(shade(m.color, 0.6)), { p: [0.5 * s, 0.15, 0], r: [0, 0, Math.PI / 2], ol: 0 }));
        body.add(wg);
        wings.push({ g: wg, s });
      }
      for (const s of [1, -1]) body.add(mesh(cyl(0.03, 0.02, 0.25, 5), toon(m.accent), { p: [0.12 * s, 0.4, 0] }));
      P.wings = wings;
      P.headY = 2.0;
    },
    pilz(m, root, P) {
      const body = grp();
      root.add(body);
      body.add(mesh(cyl(0.32, 0.4, 0.9, 16), toon(m.accent), { p: [0, 0.45, 0] }));
      const capG = grp([0, 1.0, 0]);
      body.add(capG);
      capG.add(mesh(cap(0.8, Math.PI * 0.5), toon(m.color), { s: [1, 0.7, 1] }));
      capG.add(mesh(cyl(0.8, 0.7, 0.08, 20), toon(shade(m.accent, 0.92)), { p: [0, 0, 0] }));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const rr = i % 2 ? 0.45 : 0.55;
        capG.add(mesh(sph(0.1, 8, 6), toon("#fff8ea"), { p: [Math.cos(a) * rr, 0.36 + (i % 2) * 0.1, Math.sin(a) * rr], s: [1, 0.5, 1] }));
      }
      capG.add(mesh(sph(0.12, 8, 6), toon("#fff8ea"), { p: [0, 0.56, 0], s: [1, 0.5, 1] }));
      eyesOn(body, 0.62, 0.33, 0.12, 0.08, "#fff", false);
      body.add(mesh(torus(0.08, 0.02, Math.PI, 5, 10), basic("#14121c"), { p: [0, 0.42, 0.35], r: [0, 0, Math.PI], ol: 0 }));
      for (const s of [1, -1]) body.add(mesh(capsule(0.06, 0.22), toon(m.accent), { p: [0.4 * s, 0.5, 0.05], r: [0, 0, s * 0.8] }));
      P.cap = capG;
      P.headY = 1.7;
      P.spores = m.accent;
    },
    spinne(m, root, P) {
      const body = grp();
      root.add(body);
      body.add(mesh(sph(0.6, 16, 12), toon(m.color), { p: [0, 0.75, -0.55], s: [1, 0.85, 1.15] }));
      body.add(mesh(sph(0.38, 14, 10), toon(shade(m.color, 1.15)), { p: [0, 0.68, 0.25] }));
      for (let i = 0; i < 4; i++) body.add(mesh(sph(0.06, 8, 6), toon(m.accent, { e: m.accent, ei: 1 }), { p: [(i - 1.5) * 0.1, 0.82 + (i % 2) * 0.06, 0.58], ol: 0 }));
      body.add(mesh(sph(0.16, 8, 6), toon(m.accent), { p: [0, 0.9, -0.6], s: [1.6, 0.4, 1.4], ol: 0 }));
      const legs = [];
      for (let i = 0; i < 4; i++) {
        for (const s of [1, -1]) {
          const lg = grp([0.28 * s, 0.7, 0.35 - i * 0.22], [0, (i - 1.5) * 0.35 * s, 0]);
          lg.add(mesh(cyl(0.04, 0.05, 0.62, 6), toon(shade(m.color, 0.8)), { p: [0.28 * s, 0.18, 0], r: [0, 0, -s * 1.05] }));
          lg.add(mesh(cyl(0.035, 0.02, 0.8, 6), toon(shade(m.color, 0.8)), { p: [0.66 * s, -0.12, 0], r: [0, 0, s * 0.45] }));
          body.add(lg);
          legs.push({ g: lg, i, s });
        }
      }
      P.legs = legs;
      P.headY = 1.4;
    },
    drache(m, root, P) {
      const body = grp();
      root.add(body);
      const sc = toon(m.color);
      body.add(mesh(sph(0.75, 16, 12), sc, { p: [0, 1.0, -0.3], s: [1, 0.9, 1.3] }));
      body.add(mesh(sph(0.55, 14, 10), toon(m.accent), { p: [0, 0.9, 0.2], s: [0.9, 0.9, 0.7] }));
      for (const [x, z] of [[0.45, 0.25], [-0.45, 0.25], [0.45, -0.8], [-0.45, -0.8]]) body.add(mesh(capsule(0.15, 0.4), sc, { p: [x, 0.38, z] }));
      let prev = [0, 1.45, 0.45];
      for (let i = 0; i < 3; i++) {
        prev = [0, prev[1] + 0.28, prev[2] + 0.12];
        body.add(mesh(sph(0.26 - i * 0.03, 12, 8), sc, { p: prev }));
      }
      const head = grp([0, 2.45, 0.92]);
      body.add(head);
      head.add(mesh(sph(0.36, 14, 10), sc, { s: [1, 0.85, 1.1] }));
      head.add(mesh(box(0.36, 0.24, 0.5), sc, { p: [0, -0.08, 0.4] }));
      for (const s of [1, -1]) head.add(mesh(cone(0.08, 0.45, 6), toon("#efe6d2"), { p: [0.18 * s, 0.28, -0.25], r: [-1.0, 0, s * 0.3] }));
      eyesOn(head, 0.1, 0.26, 0.16, 0.07, m.accent, true);
      for (const s of [1, -1]) {
        const wg = grp([0.55 * s, 1.5, -0.3]);
        wg.add(mesh(cone(0.9, 1.6, 3), toon(shade(m.color, 0.8), { ds: true }), { p: [0.85 * s, 0.3, 0], r: [0, 0, -s * (Math.PI / 2 - 0.3)], s: [1, 1, 0.07] }));
        body.add(wg);
        (P.wings = P.wings || []).push({ g: wg, s, slow: true });
      }
      const tail = grp([0, 0.95, -1.2]);
      for (let i = 0; i < 4; i++) tail.add(mesh(sph(0.22 - i * 0.04, 10, 8), sc, { p: [0, -i * 0.1, -i * 0.32] }));
      tail.add(mesh(cone(0.14, 0.3, 4), toon(m.accent), { p: [0, -0.42, -1.35], r: [-1.6, 0, 0] }));
      body.add(tail);
      P.tail = tail;
      P.head = head;
      P.headY = 2.9;
      P.big = true;
    },
    geist(m, root, P) {
      const body = grp([0, 0.4, 0]);
      root.add(body);
      P.hover = body;
      const gm = toon(m.color, { op: 0.78 });
      body.add(mesh(sph(0.55, 18, 14), gm, { p: [0, 1.25, 0] }));
      body.add(mesh(cone(0.6, 1.3, 18, 1), gm, { p: [0, 0.45, 0], r: [Math.PI, 0, 0] }));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        body.add(mesh(sph(0.16, 8, 6), gm, { p: [Math.cos(a) * 0.5, -0.15, Math.sin(a) * 0.5] }));
      }
      for (const s of [1, -1]) body.add(mesh(sph(0.11, 10, 8), toon("#14121c"), { p: [0.18 * s, 1.32, 0.48], s: [1, 1.4, 0.5], ol: 0 }));
      body.add(mesh(sph(0.1, 10, 8), toon("#14121c"), { p: [0, 1.05, 0.5], s: [1, 1.3, 0.5], ol: 0 }));
      const arm = grp([0.55, 1.0, 0.1]);
      arm.add(mesh(capsule(0.09, 0.4), gm, { p: [0.15, -0.15, 0], r: [0, 0, 0.8] }));
      const lantern = grp([0.4, -0.45, 0.1]);
      lantern.add(mesh(box(0.2, 0.26, 0.2), toon("#3a3346"), {}));
      lantern.add(mesh(sph(0.1, 8, 6), toon(m.accent, { e: m.accent, ei: 1.5 }), { ol: 0 }));
      lantern.add(mesh(sph(0.22, 10, 8), glow(m.accent, 0.35), { ol: 0 }));
      arm.add(lantern);
      body.add(arm);
      body.add(mesh(capsule(0.09, 0.4), gm, { p: [-0.62, 0.9, 0.1], r: [0, 0, -0.8] }));
      P.armR = arm;
      P.headY = 2.25;
    },
    krabbe(m, root, P) {
      const body = grp();
      root.add(body);
      body.add(mesh(sph(0.7, 18, 12), toon(m.color), { p: [0, 0.65, 0], s: [1.3, 0.6, 1] }));
      body.add(mesh(sph(0.5, 14, 10), toon(m.accent), { p: [0, 0.5, 0.15], s: [1.4, 0.4, 1] }));
      for (const s of [1, -1]) {
        body.add(mesh(cyl(0.04, 0.04, 0.4, 6), toon(m.color), { p: [0.18 * s, 1.0, 0.45] }));
        body.add(mesh(sph(0.09, 10, 8), basic("#ffffff"), { p: [0.18 * s, 1.22, 0.45], ol: 0 }));
        body.add(mesh(sph(0.05, 8, 6), basic("#14121c"), { p: [0.18 * s, 1.23, 0.53], ol: 0 }));
        const claw = grp([0.95 * s, 0.75, 0.55]);
        claw.add(mesh(capsule(0.1, 0.4), toon(m.color), { p: [-0.25 * s, -0.05, -0.2], r: [0.9, 0, s * 0.9] }));
        claw.add(mesh(sph(0.3, 14, 10), toon(m.color), { s: [1, 0.75, 1.2] }));
        claw.add(mesh(cone(0.14, 0.42, 8), toon(shade(m.color, 0.9)), { p: [0, 0.12, 0.3], r: [1.2, 0, 0] }));
        claw.add(mesh(cone(0.11, 0.36, 8), toon(shade(m.color, 0.9)), { p: [0, -0.12, 0.28], r: [1.9, 0, 0] }));
        body.add(claw);
        if (s > 0) P.armR = claw;
        else P.armL = claw;
        for (let i = 0; i < 3; i++) body.add(mesh(cyl(0.035, 0.03, 0.6, 5), toon(shade(m.color, 0.85)), { p: [0.75 * s, 0.38, -0.25 + i * 0.25], r: [0, 0, s * 0.9] }));
      }
      P.headY = 1.5;
    },
    ritter(m, root, P) {
      const hero = R.buildHero({
        race: "hornvolk",
        cls: "klinge",
        gender: "m",
        look: { skin: "#14121c", hair: "#14121c", hairStyle: 4, beard: 0, eyes: m.accent },
        gear: {
          helm: { base: "helm", tint: m.color, rarity: "episch", style: 2 },
          ruestung: { base: "harnisch", tint: m.color, rarity: "selten", style: 2 },
          umhang: { base: "umhang", tint: m.accent, rarity: "selten" },
          handschuhe: { base: "handschuhe", tint: shade(m.color, 0.8) },
          stiefel: { base: "stiefel", tint: shade(m.color, 0.7), rarity: "selten" },
          waffe: { base: "schwert", tint: "#3a3a3a", rarity: "episch", style: 1 },
          nebenhand: { base: "schild", tint: shade(m.color, 0.9), rarity: "selten", style: 1 },
        },
      });
      root.add(hero.obj);
      P.inner = hero;
      P.headY = hero.headY + 0.4;
    },
  };

  R.buildMonster = function (m) {
    const root = grp();
    const P = {};
    const builder = MONSTER_BUILDERS[m.arch] || MONSTER_BUILDERS.schleim;
    builder(m, root, P);
    if (m.boss) {
      const s = m.final ? 1.45 : 1.25;
      root.scale.setScalar(s);
      P.headY = (P.headY || 1.5) * s;
      if (m.final) {
        const onHead = P.head && !P.inner;
        const crown = grp(onHead ? [0, 0.42, 0] : [0, P.headY / s + 0.12, 0]);
        crown.add(mesh(cyl(0.26, 0.22, 0.14, 10), toon("#e0b04a", { e: "#e0b04a", ei: 0.3 }), {}));
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          crown.add(mesh(cone(0.06, 0.18, 5), toon("#e0b04a"), { p: [Math.cos(a) * 0.22, 0.14, Math.sin(a) * 0.22] }));
        }
        (onHead ? P.head : root).add(crown);
        P.crown = crown;
      }
    }
    const model = makeModel(root, P, "monster");
    model.arch = m.arch;
    model.headY = P.headY || 1.5;
    model.height = model.headY + 0.2;
    model.ranged = SB.data.ARCH_TYPE[m.arch] === "verstand";
    model.projColor = m.accent || "#c47bff";
    if (P.inner) {
      model.inner = P.inner;
    }
    return model;
  };

  /* ---------- Animation ---------- */
  function makeModel(root, parts, kind) {
    const model = {
      obj: root,
      parts,
      kind,
      t: Math.random() * 10,
      anim: null,
      hold: null,
      speed: 1,
      flashT: 0,
      play(name, dur) {
        dur = (dur || 0.5) / (model.speed || 1);
        if (model.inner) model.inner.play(name, dur * (model.speed || 1));
        return new Promise((res) => {
          if (model.anim && model.anim.res) model.anim.res();
          model.anim = { name, t: 0, dur, res };
          if (name === "defeat") model.hold = "defeat";
          if (name === "idle") model.hold = null;
        });
      },
      flash(dur) {
        model.flashT = dur || 0.1;
        root.traverse((o) => {
          if (o.isMesh && !o.userData.outline) {
            if (!o.userData.m0) o.userData.m0 = o.material;
            o.material = flashMat();
          }
        });
      },
      update(dt) {
        model.t += dt;
        if (model.flashT > 0) {
          model.flashT -= dt;
          if (model.flashT <= 0)
            root.traverse((o) => {
              if (o.isMesh && o.userData.m0) {
                o.material = o.userData.m0;
                o.userData.m0 = null;
              }
            });
        }
        let u = 0;
        let name = model.hold || "idle";
        if (model.anim) {
          model.anim.t += dt;
          u = Math.min(1, model.anim.t / model.anim.dur);
          name = model.anim.name;
          if (model.anim.t >= model.anim.dur) {
            const res = model.anim.res;
            model.anim = null;
            if (res) res();
            if (name === "defeat") u = 1;
          }
        }
        if (kind === "hero") poseHero(model, name, u, dt);
        else poseMonster(model, name, u, dt);
        if (model.inner) model.inner.update(dt);
        root.traverse((o) => {
          if (o.userData.spin) o.rotation.y += dt * o.userData.spin;
          if (o.userData.bob) o.position.y = Math.sin(model.t * 2.5) * 0.06;
        });
      },
    };
    return model;
  }
  const ease = (u) => u * u * (3 - 2 * u);
  const bell = (u) => Math.sin(Math.PI * u);

  function poseHero(m, name, u, dt) {
    const P = m.parts;
    const t = m.t;
    // Grundhaltung
    let bodyY = Math.sin(t * 2.2) * 0.025;
    let bodyRX = 0;
    let bodyRZ = 0;
    let armLX = -0.25 + Math.sin(t * 2.2) * 0.04;
    let armRX = -0.35 + Math.sin(t * 2.2 + 1) * 0.04;
    let armLZ = 0.18;
    let armRZ = -0.18;
    let headRX = Math.sin(t * 1.1) * 0.04;
    let legSwing = 0;
    let rootRX = 0;
    let rootY = 0;
    const bow = m.weaponBase === "bogen";
    if (bow) armLX = -0.9;
    if (m.cls === "rune") armRX = -0.2;
    switch (name) {
      case "attack": {
        const up = u < 0.45 ? ease(u / 0.45) : 1 - ease((u - 0.45) / 0.55);
        const sw = u < 0.45 ? 0 : bell((u - 0.45) / 0.55);
        armRX = -0.35 - 2.4 * up + 1.2 * sw;
        bodyRX = 0.25 * sw - 0.1 * up;
        armLX = -0.6;
        break;
      }
      case "cast": {
        const up = bell(u);
        armRX = -0.2 - 2.2 * up;
        armLX = -0.25 - 1.4 * up;
        bodyY += 0.12 * up;
        headRX = -0.2 * up;
        break;
      }
      case "shoot": {
        const pull = u < 0.6 ? ease(u / 0.6) : 1 - ease((u - 0.6) / 0.4);
        armLX = -1.5;
        armRX = -1.5 + 0.3 * pull;
        armRZ = -0.2 + 0.5 * pull;
        bodyRZ = 0;
        break;
      }
      case "hit":
        bodyRX = -0.35 * bell(u);
        headRX = -0.3 * bell(u);
        break;
      case "block":
        armLX = -1.4 * bell(u) - 0.25;
        armLZ = 0.4 * bell(u) + 0.18;
        bodyRX = -0.1 * bell(u);
        break;
      case "evade":
        bodyRZ = 0.5 * bell(u);
        bodyY += 0.25 * bell(u);
        break;
      case "victory": {
        const j = Math.abs(Math.sin(u * Math.PI * 2));
        rootY = 0.45 * j;
        armLX = -2.8;
        armRX = -2.8;
        armLZ = 0.4;
        armRZ = -0.4;
        break;
      }
      case "walk":
        legSwing = Math.sin(t * 10) * 0.5;
        armLX = -legSwing * 0.6;
        armRX = legSwing * 0.6;
        break;
      case "defeat":
        rootRX = -1.45 * ease(u);
        rootY = -0.1 * ease(u);
        armLX = -2.5 * ease(u);
        armRX = -2.5 * ease(u);
        break;
      case "special": {
        const up = bell(u);
        rootY = 0.6 * up;
        armRX = -2.9 * up;
        armLX = -1.0 * up;
        break;
      }
    }
    P.body.position.y = bodyY + rootY;
    P.body.rotation.x = bodyRX + rootRX;
    P.body.rotation.z = bodyRZ;
    if (P.armL) {
      P.armL.rotation.x = armLX;
      P.armL.rotation.z = armLZ;
    }
    if (P.armR) {
      P.armR.rotation.x = armRX;
      P.armR.rotation.z = armRZ;
    }
    if (P.head) P.head.rotation.x = headRX;
    if (P.legL) P.legL.rotation.x = legSwing;
    if (P.legR) P.legR.rotation.x = -legSwing;
    if (P.cape) {
      const arr = P.cape.geometry.attributes.position.array;
      const base = P.cape.userData.cape;
      for (let i = 0; i < arr.length; i += 3) {
        const y = base[i + 1];
        const k = Math.max(0, -y);
        arr[i + 2] = base[i + 2] - k * 0.25 - Math.sin(t * 3 + y * 4 + base[i] * 2) * 0.05 * k;
      }
      P.cape.geometry.attributes.position.needsUpdate = true;
    }
  }

  function poseMonster(m, name, u, dt) {
    const P = m.parts;
    const t = m.t;
    const root = m.obj.children[0];
    if (!root) return;
    let y = 0;
    let rx = 0;
    let rz = 0;
    let sx = 1;
    let sy = 1;
    if (P.wobble) {
      sy = 1 + Math.sin(t * 3) * 0.05;
      sx = 1 - Math.sin(t * 3) * 0.04;
    }
    if (P.hover) P.hover.position.y = 0.4 + Math.sin(t * 2) * 0.12;
    if (P.wings) for (const w of P.wings) w.g.rotation.z = w.s * Math.sin(t * (w.slow ? 3 : 14)) * (w.slow ? 0.25 : 0.6);
    if (P.tail) P.tail.rotation.y = Math.sin(t * 3) * 0.3;
    if (P.legs) for (const l of P.legs) l.g.rotation.x = Math.sin(t * 6 + l.i) * 0.08;
    if (P.cap) P.cap.rotation.z = Math.sin(t * 1.6) * 0.05;
    if (P.head) P.head.rotation.x = Math.sin(t * 1.3) * 0.06;
    if (P.armR) P.armR.rotation.x = Math.sin(t * 2) * 0.08;
    switch (name) {
      case "attack":
      case "special": {
        const b = bell(u);
        rx = 0.35 * b;
        sy *= 1 - 0.15 * b;
        sx *= 1 + 0.12 * b;
        if (P.armR) P.armR.rotation.x = -1.6 * (u < 0.5 ? ease(u * 2) : 1 - ease((u - 0.5) * 2));
        if (P.head) P.head.rotation.x = 0.4 * b;
        if (name === "special") y = 0.5 * b;
        break;
      }
      case "cast": {
        const b = bell(u);
        y = 0.3 * b;
        sy *= 1 + 0.1 * b;
        if (P.armR) P.armR.rotation.x = -1.8 * b;
        break;
      }
      case "hit":
        rx = -0.3 * bell(u);
        break;
      case "evade":
        rz = 0.4 * bell(u);
        y = 0.25 * bell(u);
        break;
      case "block":
        rx = -0.15 * bell(u);
        break;
      case "victory":
        y = 0.4 * Math.abs(Math.sin(u * Math.PI * 2));
        break;
      case "defeat":
        rz = 1.4 * ease(u);
        y = -0.25 * ease(u);
        sy *= 1 - 0.3 * ease(u);
        break;
    }
    root.position.y = y;
    root.rotation.x = rx;
    root.rotation.z = rz;
    root.scale.set(sx, sy, sx);
  }

  R.buildFighter = function (desc) {
    if (!desc) return null;
    if (desc.kind === "monster") return R.buildMonster(desc);
    return R.buildHero(desc);
  };
})();
