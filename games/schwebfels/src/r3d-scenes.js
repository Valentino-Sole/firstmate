/* Helden von Schwebfels - 3D-Schauplaetze: Insel (Hauptmenue), Heldenansicht, Kampfbuehne, Portraits. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const R = (SB.R3D = SB.R3D || {});
  let T = null;
  let mesh, grp, toon, glow, basic, g;

  function init() {
    T = R.T();
    mesh = R.mesh;
    grp = R.grp;
    toon = R.mat.toon;
    glow = R.mat.glow;
    basic = R.mat.basic;
    g = R.geo;
  }

  function makeRenderer(el, opts) {
    opts = opts || {};
    const r = new T.WebGLRenderer({ antialias: true, alpha: !!opts.alpha, preserveDrawingBuffer: !!opts.preserve, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2));
    r.outputColorSpace = T.SRGBColorSpace;
    if (opts.shadows) {
      r.shadowMap.enabled = true;
      r.shadowMap.type = T.PCFSoftShadowMap;
    }
    if (el) {
      r.domElement.className = "r3d-canvas";
      el.appendChild(r.domElement);
    }
    return r;
  }
  function killRenderer(r) {
    try {
      r.dispose();
      r.forceContextLoss();
      if (r.domElement && r.domElement.parentNode) r.domElement.parentNode.removeChild(r.domElement);
    } catch (e) {
      /* bereits entsorgt */
    }
  }

  function skyDome(top, bottom) {
    const geo = new T.SphereGeometry(220, 24, 16);
    const cols = [];
    const pos = geo.attributes.position;
    const ct = new T.Color(top);
    const cb = new T.Color(bottom);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 220;
      const k = Math.max(0, Math.min(1, (y + 0.15) / 0.9));
      const c = cb.clone().lerp(ct, Math.pow(k, 0.8));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new T.Float32BufferAttribute(cols, 3));
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
    m.userData.recolor = (top2, bottom2) => {
      const a = geo.attributes.color;
      const t2 = new T.Color(top2);
      const b2 = new T.Color(bottom2);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 220;
        const k = Math.max(0, Math.min(1, (y + 0.15) / 0.9));
        const c = b2.clone().lerp(t2, Math.pow(k, 0.8));
        a.setXYZ(i, c.r, c.g, c.b);
      }
      a.needsUpdate = true;
    };
    return m;
  }

  function cloud(rng, size, op) {
    const c = grp();
    const n = 4 + Math.floor(rng() * 3);
    const m = toon("#ffffff", op ? { op } : null);
    for (let i = 0; i < n; i++) {
      const r = size * (0.5 + rng() * 0.5);
      c.add(mesh(g.sph(1, 12, 10), m, { p: [(i - n / 2) * size * 0.7, rng() * size * 0.4, (rng() - 0.5) * size], s: [r * 1.2, r, r], ol: 0, shadow: false }));
    }
    return c;
  }

  function tree(rng, kind) {
    const t = grp();
    const trunk = toon("#7a4f2c");
    if (kind === 0) {
      t.add(mesh(g.cyl(0.14, 0.2, 0.9, 8), trunk, { p: [0, 0.45, 0] }));
      const col = ["#3f8f4f", "#4f9f55", "#2f7a45"][Math.floor(rng() * 3)];
      t.add(mesh(g.cone(0.9, 1.5, 9), toon(col), { p: [0, 1.4, 0] }));
      t.add(mesh(g.cone(0.7, 1.2, 9), toon(col), { p: [0, 2.1, 0] }));
    } else {
      t.add(mesh(g.cyl(0.13, 0.18, 1.0, 8), trunk, { p: [0, 0.5, 0] }));
      const col = ["#6fbf4f", "#8fcf5a", "#e08aa8", "#f0b44a"][Math.floor(rng() * 4)];
      t.add(mesh(g.sph(0.75, 12, 10), toon(col), { p: [0, 1.5, 0] }));
      t.add(mesh(g.sph(0.5, 10, 8), toon(col), { p: [0.45, 1.25, 0.1] }));
      t.add(mesh(g.sph(0.45, 10, 8), toon(col), { p: [-0.4, 1.3, -0.1] }));
    }
    t.scale.setScalar(0.8 + rng() * 0.5);
    return t;
  }

  // Satteldach: First entlang x, Giebel an den Seiten, Unterkante auf y=0
  let prismGeo = null;
  function gableRoof(w, d, h, color) {
    if (!prismGeo) {
      prismGeo = new T.CylinderGeometry(1, 1, 1, 3, 1);
      prismGeo.rotateZ(-Math.PI / 2);
      prismGeo.rotateX(-Math.PI / 2);
    }
    const sy = h / 1.5;
    return mesh(prismGeo, toon(color, { flat: true }), { p: [0, 0.5 * sy, 0], s: [w, sy, d / 1.732] });
  }

  /* ---------- Gebaeude ---------- */
  const B = {};
  B.taverne = function (rng) {
    const b = grp();
    const wall = toon("#efdcb6");
    const beam = toon("#6b4a2f");
    b.add(mesh(g.box(3.4, 2.2, 2.8), wall, { p: [0, 1.1, 0] }));
    for (const x of [-1.65, 1.65]) b.add(mesh(g.box(0.16, 2.2, 0.16), beam, { p: [x, 1.1, 1.4], ol: 0 }));
    b.add(mesh(g.box(3.4, 0.16, 0.16), beam, { p: [0, 2.1, 1.42], ol: 0 }));
    b.add(mesh(g.box(3.4, 0.16, 0.16), beam, { p: [0, 1.1, 1.42], ol: 0 }));
    const roof = gableRoof(3.8, 3.3, 1.5, "#b5523b");
    roof.position.set(0, 2.85, 0);
    b.add(roof);
    b.add(mesh(g.box(0.5, 1.0, 0.5), toon("#9aa0a6", { flat: true }), { p: [1.0, 3.6, -0.5] }));
    b.add(mesh(g.box(0.8, 1.3, 0.1), toon("#5a3d2a"), { p: [0, 0.65, 1.42] }));
    const win = toon("#ffd27a", { e: "#ffb347", ei: 0.6 });
    win.userData = { night: true };
    for (const x of [-1.05, 1.05]) b.add(mesh(g.box(0.6, 0.55, 0.08), win, { p: [x, 1.4, 1.43] }));
    b.add(mesh(g.box(0.7, 0.5, 0.08), win, { p: [0, 2.6, 1.3] }));
    const sign = grp([1.95, 1.9, 1.3]);
    sign.add(mesh(g.box(0.9, 0.06, 0.06), beam, { p: [-0.3, 0.2, 0], ol: 0 }));
    sign.add(mesh(g.box(0.55, 0.5, 0.06), toon("#d9a441"), { p: [0, -0.1, 0] }));
    sign.add(mesh(g.cyl(0.11, 0.1, 0.22, 10), toon("#fff3d6"), { p: [0, -0.1, 0.06], ol: 0 }));
    b.add(sign);
    b.userData.swing = sign;
    for (let i = 0; i < 2; i++) b.add(mesh(g.cyl(0.28, 0.28, 0.6, 12), toon("#8a5a35"), { p: [-2.1, 0.3, 0.8 - i * 0.65] }));
    return b;
  };
  B.schmiede = function () {
    const b = grp();
    const stone = toon("#a3a8ae", { flat: true });
    b.add(mesh(g.box(3.0, 1.8, 2.4), stone, { p: [0, 0.9, -0.3] }));
    const roof = mesh(g.box(3.6, 0.2, 3.4), toon("#5a4a3a"), { p: [0, 2.1, 0.2], r: [0.22, 0, 0] });
    b.add(roof);
    for (const x of [-1.6, 1.6]) b.add(mesh(g.cyl(0.1, 0.1, 1.9, 8), toon("#6b4a2f"), { p: [x, 0.95, 1.6] }));
    b.add(mesh(g.box(0.7, 3.4, 0.7), stone, { p: [-1.0, 1.7, -1.0] }));
    const forge = toon("#ff8a3d", { e: "#ff6a1a", ei: 1.2 });
    b.add(mesh(g.box(1.0, 0.5, 0.2), forge, { p: [0.4, 0.6, 0.92] }));
    const anvil = grp([0.6, 0, 1.9]);
    anvil.add(mesh(g.box(0.3, 0.4, 0.3), toon("#4a4f58"), { p: [0, 0.2, 0] }));
    anvil.add(mesh(g.box(0.7, 0.18, 0.32), toon("#5a606a"), { p: [0, 0.48, 0] }));
    anvil.add(mesh(g.cone(0.1, 0.3, 4), toon("#5a606a"), { p: [0.45, 0.48, 0], r: [0, 0, -Math.PI / 2] }));
    b.add(anvil);
    b.userData.smoke = [-1.0, 3.5, -1.0];
    return b;
  };
  B.arkanum = function () {
    const b = grp();
    b.add(mesh(g.cyl(1.15, 1.3, 4.2, 14), toon("#d9d0ef"), { p: [0, 2.1, 0] }));
    b.add(mesh(g.torus(1.2, 0.08, Math.PI * 2, 6, 24), toon("#d9a441"), { p: [0, 2.6, 0], r: [Math.PI / 2, 0, 0], ol: 0 }));
    b.add(mesh(g.cone(1.6, 2.4, 14), toon("#5b3fa8"), { p: [0, 5.4, 0] }));
    b.add(mesh(g.cone(0.4, 0.9, 10), toon("#5b3fa8"), { p: [0.15, 6.9, -0.15], r: [-0.4, 0, 0.3] }));
    const win = toon("#9fe3ff", { e: "#7fd0ff", ei: 0.7 });
    for (let i = 0; i < 3; i++) {
      const a = -0.6 + i * 0.6;
      b.add(mesh(g.cyl(0.24, 0.24, 0.08, 12), win, { p: [Math.sin(a) * 1.18, 1.6 + i * 0.95, Math.cos(a) * 1.18], r: [Math.PI / 2, 0, -a] }));
    }
    b.add(mesh(g.box(0.7, 1.1, 0.1), toon("#5a3d2a"), { p: [0, 0.55, 1.25] }));
    const crystal = mesh(g.octa(0.42), toon("#5fd0d6", { e: "#5fd0d6", ei: 0.9 }), { p: [0, 7.6, 0], s: [1, 1.5, 1] });
    b.add(crystal);
    b.userData.float = crystal;
    return b;
  };
  B.arena = function (rng) {
    const b = grp();
    const wall = new T.CylinderGeometry(3.2, 3.4, 1.4, 28, 1, true);
    b.add(mesh(wall, toon("#c9b89a", { ds: true, flat: true }), { p: [0, 0.7, 0], ol: 0 }));
    b.add(mesh(g.cyl(3.0, 3.0, 0.1, 28), toon("#e8d29a"), { p: [0, 0.05, 0], ol: 0 }));
    b.add(mesh(g.torus(3.3, 0.14, Math.PI * 2, 6, 32), toon("#9a8a6a"), { p: [0, 1.42, 0], r: [Math.PI / 2, 0, 0], ol: 0 }));
    const flags = [];
    const colors = ["#c0392b", "#2f6fbf", "#e0b04a", "#5fbf7a"];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const p = grp([Math.cos(a) * 3.3, 0, Math.sin(a) * 3.3]);
      p.add(mesh(g.cyl(0.06, 0.06, 3.0, 6), toon("#6b4a2f"), { p: [0, 1.5, 0] }));
      const f = mesh(g.box(0.8, 0.5, 0.03), toon(colors[i], { ds: true }), { p: [0.42, 2.7, 0] });
      p.add(f);
      flags.push(f);
      b.add(p);
    }
    // Publikum
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const c = ["#e0644f", "#4fa9ff", "#ffd25a", "#74d86f", "#c47bff", "#f2cba8"][i % 6];
      const s = mesh(g.sph(0.17, 8, 6), toon(c), { p: [Math.cos(a) * 3.0, 1.5, Math.sin(a) * 3.0], ol: 0 });
      s.userData.bounce = rng() * 6;
      b.add(s);
    }
    b.userData.flags = flags;
    return b;
  };
  B.leuchtturm = function () {
    const b = grp();
    for (let i = 0; i < 6; i++) {
      const r0 = 0.95 - i * 0.07;
      b.add(mesh(g.cyl(r0 - 0.07, r0, 0.9, 14), toon(i % 2 ? "#c0392b" : "#f4efe6"), { p: [0, 0.45 + i * 0.9, 0] }));
    }
    b.add(mesh(g.cyl(0.85, 0.85, 0.15, 16), toon("#4a4f58"), { p: [0, 5.45, 0] }));
    b.add(mesh(g.torus(0.82, 0.04, Math.PI * 2, 4, 20), toon("#4a4f58"), { p: [0, 5.75, 0], r: [Math.PI / 2, 0, 0], ol: 0 }));
    const lamp = toon("#fff3b0", { e: "#ffe27a", ei: 1.4 });
    b.add(mesh(g.cyl(0.5, 0.5, 0.7, 12), lamp, { p: [0, 5.9, 0] }));
    b.add(mesh(g.cone(0.7, 0.8, 12), toon("#c0392b"), { p: [0, 6.65, 0] }));
    const beam = new T.Mesh(new T.ConeGeometry(1.6, 9, 16, 1, true), glow("#fff1a8", 0.16));
    beam.rotation.z = Math.PI / 2;
    beam.position.set(4.5, 0, 0);
    const pivot = grp([0, 5.9, 0]);
    pivot.add(beam);
    b.add(pivot);
    b.userData.beam = pivot;
    b.add(mesh(g.box(0.6, 1.0, 0.1), toon("#5a3d2a"), { p: [0, 0.5, 0.92] }));
    return b;
  };
  B.tiefen = function () {
    const b = grp();
    const st = toon("#6a6577", { flat: true });
    for (const x of [-1.3, 1.3]) b.add(mesh(g.box(0.7, 3.0, 0.8), st, { p: [x, 1.5, 0] }));
    b.add(mesh(g.torus(1.3, 0.38, Math.PI, 6, 14), st, { p: [0, 3.0, 0] }));
    // Portal mit Spiraltextur
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const cx = cv.getContext("2d");
    const grd = cx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, "#ffffff");
    grd.addColorStop(0.3, "#c47bff");
    grd.addColorStop(1, "#2a1846");
    cx.fillStyle = grd;
    cx.fillRect(0, 0, 128, 128);
    cx.strokeStyle = "rgba(255,255,255,0.55)";
    cx.lineWidth = 5;
    for (let k = 0; k < 3; k++) {
      cx.beginPath();
      for (let i = 0; i < 80; i++) {
        const a = i * 0.18 + (k * Math.PI * 2) / 3;
        const r = i * 0.75;
        const x = 64 + Math.cos(a) * r;
        const y = 64 + Math.sin(a) * r;
        i ? cx.lineTo(x, y) : cx.moveTo(x, y);
      }
      cx.stroke();
    }
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    const portal = new T.Mesh(new T.CircleGeometry(1.0, 32), new T.MeshBasicMaterial({ map: tex }));
    portal.position.set(0, 2.0, 0.05);
    portal.scale.set(0.95, 1.35, 1);
    b.add(portal);
    b.userData.portal = portal;
    const runes = [];
    for (let i = 0; i < 4; i++) {
      const r = mesh(g.box(0.3, 0.4, 0.12), toon("#4a4558", { flat: true }), { p: [0, 0, 0] });
      r.add(mesh(g.box(0.12, 0.2, 0.02), toon("#c47bff", { e: "#c47bff", ei: 1 }), { p: [0, 0, 0.07], ol: 0 }));
      b.add(r);
      runes.push(r);
    }
    b.userData.runes = runes;
    for (let i = 0; i < 3; i++) b.add(mesh(g.box(2.0 - i * 0.3, 0.15, 0.5), st, { p: [0, 0.07 + i * 0.15, 1.1 - i * 0.4] }));
    return b;
  };
  B.stall = function (rng) {
    const b = grp();
    b.add(mesh(g.box(2.8, 1.8, 2.4), toon("#b5523b"), { p: [0, 0.9, 0] }));
    const roof = gableRoof(3.2, 2.9, 1.3, "#5a4a3a");
    roof.position.set(0, 2.45, 0);
    b.add(roof);
    b.add(mesh(g.box(1.2, 1.3, 0.08), toon("#f4efe6"), { p: [0, 0.65, 1.21] }));
    b.add(mesh(g.box(0.1, 1.6, 0.04), toon("#b5523b"), { p: [0, 0.65, 1.26], r: [0, 0, 0.7], ol: 0 }));
    b.add(mesh(g.box(0.1, 1.6, 0.04), toon("#b5523b"), { p: [0, 0.65, 1.26], r: [0, 0, -0.7], ol: 0 }));
    // Windrad
    const mill = grp([1.8, 0, -0.6]);
    mill.add(mesh(g.cyl(0.08, 0.12, 3.2, 6), toon("#7a4f2c"), { p: [0, 1.6, 0] }));
    const rotor = grp([0, 3.2, 0.15]);
    for (let i = 0; i < 4; i++) {
      const blade = grp([0, 0, 0], [0, 0, (i * Math.PI) / 2]);
      blade.add(mesh(g.box(0.2, 1.1, 0.03), toon("#f4efe6"), { p: [0, 0.6, 0] }));
      rotor.add(blade);
    }
    mill.add(rotor);
    b.add(mill);
    b.userData.rotor = rotor;
    // Zaun
    for (let i = 0; i < 5; i++) b.add(mesh(g.box(0.1, 0.6, 0.1), toon("#7a4f2c"), { p: [-1.7 + i * 0.5, 0.3, 2.1] }));
    b.add(mesh(g.box(2.2, 0.08, 0.06), toon("#8a5a35"), { p: [-0.7, 0.45, 2.1], ol: 0 }));
    b.add(mesh(g.cyl(0.4, 0.4, 0.6, 12), toon("#e8c35a"), { p: [-1.9, 0.3, 0.9], r: [Math.PI / 2, 0, 0.4] }));
    // Wolkenesel
    const don = grp([-0.9, 0, 1.6]);
    don.add(mesh(g.sph(0.45, 12, 10), toon("#c9d2d8"), { p: [0, 0.75, 0], s: [1.3, 0.9, 0.9] }));
    don.add(mesh(g.sph(0.27, 10, 8), toon("#c9d2d8"), { p: [0.62, 1.05, 0] }));
    for (const s of [1, -1]) don.add(mesh(g.cone(0.07, 0.35, 6), toon("#9aa4ad"), { p: [0.62, 1.38, 0.1 * s], r: [0.2 * s, 0, -0.2] }));
    for (const [x, z] of [[0.3, 0.2], [0.3, -0.2], [-0.3, 0.2], [-0.3, -0.2]]) don.add(mesh(g.cyl(0.06, 0.06, 0.45, 6), toon("#7f8a96"), { p: [x, 0.25, z] }));
    for (let i = 0; i < 4; i++) don.add(mesh(g.sph(0.2, 8, 6), toon("#ffffff"), { p: [-0.2 + i * 0.15, 1.05, (i % 2) * 0.1 - 0.05], ol: 0 }));
    b.add(don);
    b.userData.donkey = don;
    return b;
  };
  B.ruhmeshalle = function () {
    const b = grp();
    const marble = toon("#eee8dc");
    for (let i = 0; i < 2; i++) b.add(mesh(g.box(3.6 - i * 0.4, 0.25, 2.8 - i * 0.4), marble, { p: [0, 0.12 + i * 0.25, 0] }));
    for (let i = 0; i < 4; i++) for (const z of [-0.9, 0.9]) b.add(mesh(g.cyl(0.17, 0.2, 2.2, 10), marble, { p: [-1.3 + i * 0.87, 1.6, z] }));
    b.add(mesh(g.box(3.4, 0.3, 2.4), marble, { p: [0, 2.85, 0] }));
    const roof = gableRoof(3.6, 2.6, 0.8, "#d9a441");
    roof.position.set(0, 3.4, 0);
    b.add(roof);
    // Goldene Statue
    const statue = R.buildHero({ race: "wolkling", cls: "klinge", gender: "w", look: { skin: "#e0b04a", hair: "#e0b04a", hairStyle: 2 }, gear: { waffe: { base: "schwert", rarity: "legendaer" }, nebenhand: { base: "schild", tint: "#e0b04a" }, umhang: { base: "umhang", tint: "#e0b04a" } } });
    const gold = toon("#e0b04a");
    statue.obj.traverse((o) => {
      if (o.isMesh && !o.userData.outline) o.material = gold;
    });
    statue.obj.position.set(0, 0.5, 0);
    statue.obj.scale.multiplyScalar(0.75);
    statue.parts.armR.rotation.x = -2.6;
    b.add(statue.obj);
    return b;
  };
  B.brunnen = function () {
    const b = grp();
    const st = toon("#a3a8ae", { flat: true });
    const ring = new T.CylinderGeometry(0.9, 0.95, 0.7, 16, 1, true);
    b.add(mesh(ring, toon("#a3a8ae", { ds: true, flat: true }), { p: [0, 0.35, 0], ol: 0 }));
    b.add(mesh(g.torus(0.92, 0.12, Math.PI * 2, 6, 20), st, { p: [0, 0.7, 0], r: [Math.PI / 2, 0, 0] }));
    const water = new T.MeshToonMaterial({ color: new T.Color("#4fa9ff"), emissive: new T.Color("#2f7fd0"), emissiveIntensity: 0.4 });
    b.add(mesh(g.cyl(0.85, 0.85, 0.05, 18), water, { p: [0, 0.5, 0], ol: 0 }));
    b.userData.water = water;
    for (const x of [-0.8, 0.8]) b.add(mesh(g.cyl(0.07, 0.07, 1.6, 6), toon("#7a4f2c"), { p: [x, 1.2, 0] }));
    b.add(mesh(g.cone(1.3, 0.8, 4), toon("#3f6fbf"), { p: [0, 2.3, 0], r: [0, Math.PI / 4, 0] }));
    b.add(mesh(g.cyl(0.18, 0.15, 0.25, 10), toon("#8a5a35"), { p: [0.3, 1.5, 0] }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.add(mesh(g.sph(0.07, 6, 6), toon("#ffd25a", { e: "#ffd25a", ei: 0.6 }), { p: [Math.cos(a) * 0.4, 0.55, Math.sin(a) * 0.4], s: [1, 0.3, 1], ol: 0 }));
    }
    return b;
  };
  B.heim = function () {
    const b = grp();
    b.add(mesh(g.box(2.2, 1.6, 2.0), toon("#f2e6d0"), { p: [0, 0.8, 0] }));
    const roof = gableRoof(2.6, 2.4, 1.2, "#3f6fbf");
    roof.position.set(0, 2.2, 0);
    b.add(roof);
    b.add(mesh(g.cyl(0.38, 0.38, 0.1, 16, 1), toon("#5a3d2a"), { p: [0, 0.55, 1.01], r: [Math.PI / 2, 0, 0] }));
    b.add(mesh(g.box(0.76, 0.55, 0.1), toon("#5a3d2a"), { p: [0, 0.27, 1.01] }));
    const win = toon("#ffd27a", { e: "#ffb347", ei: 0.6 });
    b.add(mesh(g.box(0.45, 0.45, 0.08), win, { p: [0.72, 1.0, 1.01] }));
    b.add(mesh(g.box(0.6, 0.15, 0.25), toon("#8a5a35"), { p: [0.72, 0.72, 1.1] }));
    for (let i = 0; i < 3; i++) b.add(mesh(g.sph(0.08, 6, 6), toon(["#e0644f", "#ffd25a", "#c47bff"][i]), { p: [0.55 + i * 0.17, 0.85, 1.15], ol: 0 }));
    const pole = grp([-1.3, 0, 1.0]);
    pole.add(mesh(g.cyl(0.04, 0.04, 2.6, 6), toon("#6b4a2f"), { p: [0, 1.3, 0] }));
    const flag = mesh(g.box(0.7, 0.45, 0.02), toon("#d9a441", { ds: true }), { p: [0.37, 2.3, 0] });
    pole.add(flag);
    b.add(pole);
    b.userData.flag = flag;
    return b;
  };

  function airship() {
    const s = grp();
    s.add(mesh(g.sph(1, 18, 12), toon("#e8d6b0"), { p: [0, 1.6, 0], s: [2.4, 1.0, 1.0] }));
    for (let i = -1; i <= 1; i++) s.add(mesh(g.torus(1.0, 0.05, Math.PI * 2, 4, 24), toon("#c0392b"), { p: [i * 0.8, 1.6, 0], r: [0, Math.PI / 2, 0], s: [1, 1 - Math.abs(i) * 0.2, 1 - Math.abs(i) * 0.2], ol: 0 }));
    s.add(mesh(g.box(1.8, 0.4, 0.7), toon("#8a5a35"), { p: [0, 0.1, 0] }));
    for (const x of [-0.6, 0.6]) s.add(mesh(g.cyl(0.03, 0.03, 1.0, 4), toon("#5a3d2a"), { p: [x, 0.8, 0], ol: 0 }));
    const prop = grp([-1.1, 0.15, 0]);
    for (let i = 0; i < 3; i++) {
      const blade = grp([0, 0, 0], [(i * Math.PI * 2) / 3, 0, 0]);
      blade.add(mesh(g.box(0.04, 0.5, 0.12), toon("#5a3d2a"), { p: [0, 0.25, 0], ol: 0 }));
      prop.add(blade);
    }
    s.add(prop);
    s.add(mesh(g.cone(0.4, 0.6, 3), toon("#c0392b", { ds: true }), { p: [2.4, 1.6, 0], r: [0, 0, -Math.PI / 2], s: [1, 1, 0.1] }));
    s.userData.prop = prop;
    return s;
  }

  function islandMesh(radius, height, rng, grass, rock) {
    const isl = grp();
    const top = new T.CylinderGeometry(radius, radius * 0.94, 1.2, 40, 1);
    const pos = top.attributes.position;
    const seed = rng() * 10;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.05 * Math.sin(3 * a + seed) + 0.03 * Math.sin(7 * a + seed * 2);
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    top.computeVertexNormals();
    const tm = new T.Mesh(top, toon(grass));
    tm.position.y = -0.6;
    tm.receiveShadow = true;
    isl.add(tm);
    const under = new T.ConeGeometry(radius * 0.97, height, 24, 5);
    const up = under.attributes.position;
    for (let i = 0; i < up.count; i++) {
      const y = up.getY(i);
      const f = 1 + (rng() - 0.5) * 0.18 * (1 - Math.abs(y / height));
      up.setX(i, up.getX(i) * f);
      up.setZ(i, up.getZ(i) * f);
    }
    under.computeVertexNormals();
    const um = new T.Mesh(under, toon(rock, { flat: true }));
    um.rotation.x = Math.PI;
    um.position.y = -1.2 - height / 2;
    isl.add(um);
    const band = new T.Mesh(new T.CylinderGeometry(radius * 0.95, radius * 0.9, 0.6, 40, 1), toon("#8a6a4e", { flat: true }));
    band.position.y = -1.35;
    isl.add(band);
    return isl;
  }

  /* ---------- Insel-Hub ---------- */
  const LAYOUT = {
    taverne: [-5.6, 1.2],
    schmiede: [-6.4, -4.4],
    arkanum: [-1.6, -7.2],
    ruhmeshalle: [3.8, -6.6],
    arena: [7.2, -1.8],
    leuchtturm: [9.6, 4.6],
    stall: [4.8, 4.6],
    heim: [-2.4, 5.6],
    brunnen: [0.6, 0.4],
    tiefen: [-10.2, -0.6],
  };
  const LABEL_H = { taverne: 4.7, schmiede: 4.0, arkanum: 8.5, ruhmeshalle: 4.6, arena: 2.6, leuchtturm: 7.4, stall: 3.8, heim: 3.5, brunnen: 3.0, tiefen: 4.4 };

  R.createHub = function (el, opts) {
    init();
    opts = opts || {};
    const quality = opts.quality || "hoch";
    const renderer = makeRenderer(el, { shadows: quality === "hoch", maxDpr: quality === "hoch" ? 1.75 : 1.25 });
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(40, 1, 0.5, 600);
    const rng = SB.util.rng(42);
    const sky = skyDome("#5fb0ff", "#dff3ff");
    scene.add(sky);
    scene.fog = new T.Fog("#dff3ff", 60, 170);
    const hemi = new T.HemisphereLight("#e8f4ff", "#7a6a4e", 1.25);
    scene.add(hemi);
    const sun = new T.DirectionalLight("#fff4dc", 2.4);
    sun.position.set(14, 24, 10);
    if (quality === "hoch") {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera;
      sc.left = -17;
      sc.right = 17;
      sc.top = 17;
      sc.bottom = -17;
      sc.near = 1;
      sc.far = 70;
      sun.shadow.bias = -0.0008;
      sun.shadow.normalBias = 0.03;
    }
    scene.add(sun);
    const amb = new T.AmbientLight("#ffffff", 0.25);
    scene.add(amb);

    // Sterne
    const starGeo = new T.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 500; i++) {
      const u = rng() * Math.PI * 2;
      const v = rng() * 0.9 + 0.05;
      sp.push(Math.cos(u) * Math.sin(v * Math.PI * 0.5) * 180, Math.cos(v * Math.PI * 0.5) * 180, Math.sin(u) * Math.sin(v * Math.PI * 0.5) * 180);
    }
    starGeo.setAttribute("position", new T.Float32BufferAttribute(sp, 3));
    const starMat = new T.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: true, transparent: true, opacity: 0, fog: false });
    scene.add(new T.Points(starGeo, starMat));

    const world = grp();
    scene.add(world);
    world.add(islandMesh(13, 11, rng, "#8cc663", "#8a7058"));
    // Platz und Wege
    const sand = toon("#e6d3a3");
    const plaza = mesh(g.cyl(3.2, 3.2, 0.06, 28), sand, { p: [0.4, 0.03, 0.6], ol: 0, shadow: false });
    plaza.receiveShadow = true;
    world.add(plaza);
    for (const id in LAYOUT) {
      const [x, z] = LAYOUT[id];
      const len = Math.hypot(x, z);
      const path = mesh(g.box(1.0, 0.05, 1), sand, { ol: 0, shadow: false });
      path.scale.z = len;
      path.position.set(x / 2, 0.025, z / 2);
      path.rotation.y = Math.atan2(x, z);
      path.receiveShadow = true;
      world.add(path);
    }
    // Gebaeude
    const buildings = {};
    const pickables = [];
    const anim = { smoke: [], flags: [], rotor: null, beam: null, portal: null, runes: null, float: null, water: null, swing: null, crowd: [], donkey: null, homeFlag: null };
    for (const id in LAYOUT) {
      const [x, z] = LAYOUT[id];
      const bg = B[id](rng);
      bg.position.set(x, 0, z);
      bg.rotation.y = Math.atan2(0 - x, 9 - z);
      bg.userData.bid = id;
      world.add(bg);
      buildings[id] = bg;
      const bb = new T.Box3().setFromObject(bg);
      const size = bb.getSize(new T.Vector3());
      const center = bb.getCenter(new T.Vector3());
      const hit = new T.Mesh(new T.BoxGeometry(size.x + 0.4, size.y + 0.4, size.z + 0.4), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.copy(center);
      hit.userData.bid = id;
      scene.add(hit);
      pickables.push(hit);
      const u = bg.userData;
      if (u.smoke) anim.smoke.push({ b: bg, p: u.smoke, parts: [] });
      if (u.flags) anim.flags.push(...u.flags);
      if (u.rotor) anim.rotor = u.rotor;
      if (u.beam) anim.beam = u.beam;
      if (u.portal) anim.portal = u.portal;
      if (u.runes) anim.runes = u.runes;
      if (u.float) anim.float = u.float;
      if (u.water) anim.water = u.water;
      if (u.swing) anim.swing = u.swing;
      if (u.donkey) anim.donkey = u.donkey;
      if (u.flag) anim.homeFlag = u.flag;
      bg.traverse((o) => {
        if (o.userData.bounce !== undefined) anim.crowd.push(o);
      });
    }
    // Rauch
    for (const s of anim.smoke) {
      for (let i = 0; i < 7; i++) {
        const m = new T.MeshToonMaterial({ color: new T.Color("#d8d8de"), gradientMap: null, transparent: true, opacity: 0.7, depthWrite: false });
        const puff = new T.Mesh(g.sph(0.3, 8, 6), m);
        puff.userData.t = i / 7;
        s.b.add(puff);
        s.parts.push(puff);
      }
    }
    // Baeume, Steine, Laternen
    const blocked = Object.values(LAYOUT).concat([[0.4, 0.6]]);
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < 34; tries++) {
      const a = rng() * Math.PI * 2;
      const r = 3.5 + rng() * 8.6;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (blocked.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 3.0)) continue;
      if (Math.abs(Math.atan2(x, z)) < 0.2 && z > 0) continue;
      const tr = tree(rng, rng() < 0.45 ? 0 : 1);
      tr.position.set(x, 0, z);
      world.add(tr);
      blocked.push([x, z]);
      placed++;
    }
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const r = 4 + rng() * 8.5;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (blocked.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 1.5)) continue;
      world.add(mesh(g.dodeca(0.3 + rng() * 0.3), toon("#9aa0a6", { flat: true }), { p: [x, 0.15, z], r: [rng(), rng(), rng()] }));
    }
    const lampMat = toon("#ffe7a3", { e: "#ffcf5a", ei: 0.4 });
    const lamps = [];
    for (const id of ["taverne", "arena", "heim", "stall", "arkanum", "ruhmeshalle"]) {
      const [x, z] = LAYOUT[id];
      const lx = x * 0.5 + 0.8;
      const lz = z * 0.5;
      world.add(mesh(g.cyl(0.05, 0.06, 1.6, 6), toon("#3a3346"), { p: [lx, 0.8, lz] }));
      const bulb = mesh(g.sph(0.16, 10, 8), lampMat, { p: [lx, 1.7, lz] });
      world.add(bulb);
      lamps.push(bulb);
    }
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2;
      const r = 3.4 + rng() * 9;
      const c = ["#ff6f91", "#ffd25a", "#ffffff", "#9f8cff", "#ff9a3d"][i % 5];
      world.add(mesh(g.sph(0.08, 6, 6), toon(c), { p: [Math.cos(a) * r, 0.1, Math.sin(a) * r], ol: 0, shadow: false }));
    }
    // Hafen und Luftschiff
    const dock = grp([7.8, 0, -8.6], [0, -0.75, 0]);
    for (let i = 0; i < 6; i++) dock.add(mesh(g.box(1.4, 0.12, 0.45), toon("#8a5a35"), { p: [0, 0.05, -i * 0.5] }));
    for (const x of [-0.65, 0.65]) for (let i = 0; i < 3; i++) dock.add(mesh(g.cyl(0.07, 0.07, 1.2, 6), toon("#6b4a2f"), { p: [x, 0.2, -i * 1.2] }));
    world.add(dock);
    const ship = airship();
    ship.position.set(10.5, 1.2, -12.5);
    ship.rotation.y = 0.6;
    world.add(ship);
    // Nebeninseln
    const islets = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      const isl = grp([Math.cos(a) * (21 + i * 2), -3 + i * 1.5, Math.sin(a) * (21 + i * 2)]);
      isl.add(islandMesh(2.2 + rng() * 1.2, 3 + rng() * 2, rng, "#8cc663", "#8a7058"));
      const tr = tree(rng, i % 2);
      isl.add(tr);
      islets.push({ g: isl, ph: rng() * 6, y: isl.position.y });
      scene.add(isl);
    }
    // Wolken
    const clouds = [];
    for (let i = 0; i < 18; i++) {
      const c = cloud(rng, 1.4 + rng() * 1.8, 0.92);
      const r = 17 + rng() * 26;
      const a = rng() * Math.PI * 2;
      const y = -12 + rng() * 22;
      c.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      clouds.push({ c, a, r, y, sp: 0.01 + rng() * 0.02 });
      scene.add(c);
    }
    // Voegel
    const birds = [];
    for (let i = 0; i < 5; i++) {
      const b = grp();
      for (const s of [1, -1]) {
        const w = mesh(g.box(0.5, 0.04, 0.14), toon("#2a2633"), { p: [0.22 * s, 0, 0], r: [0, 0, 0.3 * s], ol: 0 });
        b.add(w);
      }
      birds.push({ b, ph: rng() * 6, r: 9 + rng() * 8, h: 10 + rng() * 4, sp: 0.2 + rng() * 0.2 });
      scene.add(b);
    }

    // Held und Dorfbewohner
    let heroModel = null;
    const villagers = [];
    const villagerSpots = [[-3.4, 2.2, 0.8], [5.3, 1.4, -1.2], [-3.4, -3.6, 0.4]];
    const vr = SB.util.rng(7);
    for (const [x, z, ry] of villagerSpots) {
      const races = Object.keys(SB.data.RACES);
      const race = races[Math.floor(vr() * races.length)];
      const R0 = SB.data.RACES[race];
      const v = R.buildHero({ race, cls: "klinge", gender: vr() < 0.5 ? "m" : "w", look: { skin: R0.skins[Math.floor(vr() * 4)], hair: R0.hairs[Math.floor(vr() * 5)], hairStyle: Math.floor(vr() * 5), beard: Math.floor(vr() * 4) }, gear: {} });
      v.obj.position.set(x, 0, z);
      v.obj.rotation.y = ry;
      v.obj.scale.multiplyScalar(0.7);
      world.add(v.obj);
      villagers.push(v);
    }

    // Kamera
    const cam = { az: 0.05, pol: 0.98, rad: 34, target: new T.Vector3(0, 0.5, 0) };
    const goal = { az: 0.05, pol: 0.98, rad: 34, target: new T.Vector3(0, 0.5, 0) };
    let inset = 0;
    function updateCamera() {
      const s = Math.sin(cam.pol);
      camera.position.set(cam.target.x + cam.rad * s * Math.sin(cam.az), cam.target.y + cam.rad * Math.cos(cam.pol), cam.target.z + cam.rad * s * Math.cos(cam.az));
      camera.lookAt(cam.target);
    }

    // Beschriftungen
    const labelLayer = document.createElement("div");
    labelLayer.className = "hub-labels";
    el.appendChild(labelLayer);
    const labels = {};
    for (const bdef of SB.data.BUILDINGS) {
      const d = document.createElement("button");
      d.type = "button";
      d.className = "hub-label";
      d.dataset.bid = bdef.id;
      d.innerHTML = '<span class="hl-name"></span><span class="hl-badge" hidden></span>';
      d.querySelector(".hl-name").textContent = bdef.short;
      d.addEventListener("click", (e) => {
        e.stopPropagation();
        if (opts.onPick) opts.onPick(bdef.id);
      });
      labelLayer.appendChild(d);
      labels[bdef.id] = d;
    }
    const tmpV = new T.Vector3();
    function updateLabels(w, h) {
      for (const id in labels) {
        const bg = buildings[id];
        if (!bg) continue;
        tmpV.set(bg.position.x, LABEL_H[id] || 4, bg.position.z);
        tmpV.project(camera);
        const lab = labels[id];
        if (tmpV.z > 1) {
          lab.style.opacity = "0";
          continue;
        }
        lab.style.opacity = "";
        lab.style.transform = "translate(" + ((tmpV.x * 0.5 + 0.5) * w).toFixed(1) + "px," + ((-tmpV.y * 0.5 + 0.5) * h).toFixed(1) + "px) translate(-50%,-100%)";
      }
    }

    // Eingabe
    const ray = new T.Raycaster();
    const ndc = new T.Vector2();
    let hover = null;
    let drag = null;
    const canvas = renderer.domElement;
    function pick(ev) {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(pickables, false);
      return hits.length ? hits[0].object.userData.bid : null;
    }
    function setHover(id) {
      if (hover === id) return;
      if (hover && labels[hover]) labels[hover].classList.remove("hover");
      hover = id;
      if (id && labels[id]) labels[id].classList.add("hover");
      canvas.style.cursor = id ? "pointer" : "grab";
      if (opts.onHover) opts.onHover(id);
    }
    const pointers = new Map();
    let pinchStart = 0;
    canvas.addEventListener("pointerdown", (ev) => {
      canvas.setPointerCapture(ev.pointerId);
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
        drag = null;
      } else drag = { x: ev.clientX, y: ev.clientY, moved: 0, az: goal.az, pol: goal.pol };
    });
    canvas.addEventListener("pointermove", (ev) => {
      if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchStart) goal.rad = Math.max(18, Math.min(44, goal.rad * (pinchStart / d)));
        pinchStart = d;
        return;
      }
      if (drag) {
        const dx = ev.clientX - drag.x;
        const dy = ev.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
        goal.az = drag.az - dx * 0.006;
        goal.pol = Math.max(0.55, Math.min(1.25, drag.pol - dy * 0.004));
        if (drag.moved > 6) canvas.style.cursor = "grabbing";
      } else if (ev.pointerType === "mouse") setHover(pick(ev));
    });
    const endPointer = (ev) => {
      pointers.delete(ev.pointerId);
      if (drag && drag.moved < 6) {
        const id = pick(ev);
        if (id && opts.onPick) opts.onPick(id);
      }
      drag = null;
      pinchStart = 0;
      canvas.style.cursor = hover ? "pointer" : "grab";
    };
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", (ev) => {
      pointers.delete(ev.pointerId);
      drag = null;
    });
    canvas.addEventListener("pointerleave", () => setHover(null));
    canvas.addEventListener(
      "wheel",
      (ev) => {
        ev.preventDefault();
        goal.rad = Math.max(18, Math.min(44, goal.rad * (1 + Math.sign(ev.deltaY) * 0.08)));
      },
      { passive: false }
    );

    // Tageszeit
    function applyDaytime() {
      const d = new Date();
      const hrs = d.getHours() + d.getMinutes() / 60;
      const ss = (a, b, x) => Math.max(0, Math.min(1, (x - a) / (b - a)));
      const day = ss(5.5, 7.5, hrs) * (1 - ss(19, 21, hrs));
      const dusk = Math.max(0, 1 - Math.abs(hrs - 20) / 1.3) + Math.max(0, 1 - Math.abs(hrs - 6.5) / 1.2);
      const night = 1 - day;
      const lerp = (a, b, t) => "#" + new T.Color(a).lerp(new T.Color(b), t).getHexString();
      let top = lerp("#1b2350", "#5fb0ff", day);
      let bot = lerp("#3a3f78", "#dff3ff", day);
      if (dusk > 0) {
        bot = lerp(bot, "#ffb38a", Math.min(0.7, dusk));
        top = lerp(top, "#6a6fb8", Math.min(0.4, dusk));
      }
      sky.userData.recolor(top, bot);
      scene.fog.color.set(bot);
      hemi.intensity = 0.55 + 0.75 * day;
      sun.intensity = 0.6 + 1.9 * day;
      sun.color.set(day > 0.5 ? "#fff4dc" : "#9fb7ff");
      starMat.opacity = Math.max(0, night - 0.2);
      lampMat.emissiveIntensity = 0.4 + 1.4 * night;
      return night;
    }
    let night = applyDaytime();
    let dayTimer = 0;

    let running = true;
    let raf = 0;
    let last = performance.now();
    let w = 1;
    let h = 1;
    function resize() {
      w = Math.max(1, el.clientWidth);
      h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = w + "px";
      renderer.domElement.style.height = h + "px";
      camera.aspect = w / h;
      if (inset > 0) camera.setViewOffset(w + inset, h, inset, 0, w, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      goal.rad = Math.max(goal.rad, w < 640 ? 40 : 30);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!running || document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const k = 1 - Math.pow(0.0015, dt);
      cam.az += (goal.az - cam.az) * k;
      cam.pol += (goal.pol - cam.pol) * k;
      cam.rad += (goal.rad - cam.rad) * k;
      cam.target.lerp(goal.target, k);
      updateCamera();
      // Animationen
      for (const s of anim.smoke) {
        for (const p of s.parts) {
          p.userData.t = (p.userData.t + dt * 0.18) % 1;
          const u = p.userData.t;
          p.position.set(s.p[0] + Math.sin(u * 6 + t) * 0.2, s.p[1] + u * 2.6, s.p[2]);
          p.scale.setScalar(0.4 + u * 1.4);
          p.material.opacity = 0.75 * (1 - u);
        }
      }
      for (const f of anim.flags) f.rotation.y = Math.sin(t * 3 + f.position.x) * 0.35;
      if (anim.rotor) anim.rotor.rotation.z += dt * 1.2;
      if (anim.beam) {
        anim.beam.rotation.y += dt * 0.8;
        anim.beam.children[0].material.opacity = 0.05 + 0.18 * night;
      }
      if (anim.portal) anim.portal.rotation.z -= dt * 1.4;
      if (anim.runes)
        anim.runes.forEach((r, i) => {
          const a = t * 0.8 + (i * Math.PI) / 2;
          r.position.set(Math.cos(a) * 1.9, 2.0 + Math.sin(t * 2 + i) * 0.3, Math.sin(a) * 0.8 + 0.4);
          r.rotation.y = -a;
        });
      if (anim.float) {
        anim.float.position.y = 7.6 + Math.sin(t * 1.5) * 0.25;
        anim.float.rotation.y += dt;
      }
      if (anim.water) anim.water.emissiveIntensity = 0.35 + Math.sin(t * 2) * 0.12;
      if (anim.swing) anim.swing.rotation.x = Math.sin(t * 1.7) * 0.12;
      if (anim.donkey) anim.donkey.rotation.y = Math.sin(t * 0.4) * 0.6;
      if (anim.homeFlag) anim.homeFlag.rotation.y = Math.sin(t * 3) * 0.3;
      for (const c of anim.crowd) c.position.y = 1.5 + Math.max(0, Math.sin(t * 6 + c.userData.bounce)) * 0.15;
      ship.position.y = 1.2 + Math.sin(t * 0.8) * 0.25;
      ship.userData.prop.rotation.x += dt * 8;
      for (const is of islets) is.g.position.y = is.y + Math.sin(t * 0.5 + is.ph) * 0.4;
      for (const cl of clouds) {
        cl.a += dt * cl.sp;
        cl.c.position.set(Math.cos(cl.a) * cl.r, cl.y, Math.sin(cl.a) * cl.r);
      }
      for (const bd of birds) {
        const a = t * bd.sp + bd.ph;
        bd.b.position.set(Math.cos(a) * bd.r, bd.h + Math.sin(t + bd.ph) * 0.6, Math.sin(a) * bd.r);
        bd.b.rotation.y = -a;
        bd.b.children.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (0.3 + Math.sin(t * 9 + bd.ph) * 0.4)));
      }
      for (const id in buildings) {
        const b = buildings[id];
        const target = id === hover ? 1.06 : 1;
        const s = b.scale.x + (target - b.scale.x) * Math.min(1, dt * 10);
        b.scale.setScalar(s);
      }
      if (heroModel) heroModel.update(dt);
      for (const v of villagers) v.update(dt);
      dayTimer += dt;
      if (dayTimer > 30) {
        dayTimer = 0;
        night = applyDaytime();
      }
      renderer.render(scene, camera);
      updateLabels(w, h);
    }
    raf = requestAnimationFrame(frame);

    return {
      setHero(desc) {
        if (heroModel) world.remove(heroModel.obj);
        heroModel = R.buildHero(desc);
        heroModel.obj.position.set(2.2, 0, 2.6);
        heroModel.obj.rotation.y = 0.2;
        heroModel.obj.scale.multiplyScalar(0.95);
        world.add(heroModel.obj);
      },
      cheer() {
        if (heroModel) heroModel.play("victory", 1.2);
      },
      setBadges(map) {
        for (const id in labels) {
          const b = labels[id].querySelector(".hl-badge");
          const v = map && map[id];
          b.hidden = !v;
          b.textContent = v || "";
          labels[id].classList.toggle("ready", !!v);
        }
      },
      focus(id) {
        if (id && buildings[id]) {
          const p = buildings[id].position;
          goal.target.set(p.x * 0.85, 1.0, p.z * 0.85);
          goal.rad = 20;
          goal.az = Math.atan2(p.x, p.z + 12) * 0.6;
          goal.pol = 0.95;
        } else {
          goal.target.set(0, 0.5, 0);
          goal.rad = w < 640 ? 40 : 34;
          goal.pol = 0.98;
        }
      },
      setInset(px) {
        inset = Math.max(0, Math.round(px || 0));
        resize();
      },
      pause() {
        running = false;
      },
      resume() {
        running = true;
      },
      dispose() {
        cancelAnimationFrame(raf);
        ro.disconnect();
        labelLayer.remove();
        killRenderer(renderer);
      },
    };
  };

  /* ---------- Heldenansicht ---------- */
  R.createHeroView = function (el, opts) {
    init();
    opts = opts || {};
    const renderer = makeRenderer(el, { alpha: true, maxDpr: 2 });
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 100);
    const dist = opts.distance || 7.2;
    camera.position.set(0, 1.55 + (dist - 7.2) * 0.08, dist);
    camera.lookAt(0, opts.lookY || 1.15, 0);
    scene.add(new T.HemisphereLight("#f4f8ff", "#6a5a4a", 1.4));
    const key = new T.DirectionalLight("#fff2dc", 2.2);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new T.DirectionalLight("#9fc9ff", 1.2);
    rim.position.set(-4, 3, -3);
    scene.add(rim);
    const ped = grp();
    ped.add(mesh(g.cyl(1.1, 1.25, 0.3, 28), toon("#3a4a5a"), { p: [0, -0.15, 0] }));
    ped.add(mesh(g.torus(1.12, 0.05, Math.PI * 2, 6, 40), toon("#d9a441"), { p: [0, 0, 0], r: [Math.PI / 2, 0, 0], ol: 0 }));
    scene.add(ped);
    let model = null;
    let rotY = 0.35;
    let goalY = 0.35;
    let dragX = null;
    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", (e) => {
      dragX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (dragX == null) return;
      goalY += (e.clientX - dragX) * 0.012;
      dragX = e.clientX;
    });
    canvas.addEventListener("pointerup", () => (dragX = null));
    canvas.addEventListener("pointercancel", () => (dragX = null));
    let raf = 0;
    let last = performance.now();
    function resize() {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = w + "px";
      renderer.domElement.style.height = h + "px";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      rotY += (goalY - rotY) * Math.min(1, dt * 8);
      if (model) {
        model.obj.rotation.y = rotY;
        model.update(dt);
      }
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);
    return {
      set(desc, celebrate) {
        if (model) scene.remove(model.obj);
        model = R.buildFighter(desc);
        scene.add(model.obj);
        const box3 = new T.Box3().setFromObject(model.obj);
        const hgt = box3.max.y - box3.min.y;
        const s = hgt > 2.6 ? 2.6 / hgt : 1;
        model.obj.scale.multiplyScalar(s);
        if (celebrate) model.play("victory", 1.1);
      },
      play(name, dur) {
        if (model) model.play(name, dur);
      },
      dispose() {
        cancelAnimationFrame(raf);
        ro.disconnect();
        killRenderer(renderer);
      },
    };
  };

  /* ---------- Portraits ---------- */
  let snapR = null;
  let snapScene = null;
  let snapCam = null;
  const snapCache = new Map();
  R.snapshot = function (desc, size, bust) {
    if (!R.ready()) return null;
    init();
    size = size || 160;
    const key = JSON.stringify(desc) + "|" + size + "|" + (bust ? 1 : 0);
    if (snapCache.has(key)) return snapCache.get(key);
    try {
      if (!snapR) {
        snapR = makeRenderer(null, { alpha: true, preserve: true, maxDpr: 1 });
        snapScene = new T.Scene();
        snapScene.add(new T.HemisphereLight("#f4f8ff", "#6a5a4a", 1.5));
        const k = new T.DirectionalLight("#fff2dc", 2.2);
        k.position.set(3, 5, 5);
        snapScene.add(k);
        snapCam = new T.PerspectiveCamera(30, 1, 0.1, 100);
      }
      snapR.setSize(size, size, false);
      const model = R.buildFighter(desc);
      model.update(0.016);
      model.obj.rotation.y = desc.kind === "monster" ? 0.5 : 0.35;
      snapScene.add(model.obj);
      const box3 = new T.Box3().setFromObject(model.obj);
      const c = box3.getCenter(new T.Vector3());
      const sz = box3.getSize(new T.Vector3());
      let span = Math.max(sz.y, sz.x * 0.9);
      if (bust) {
        span = Math.max(sz.y * 0.5, sz.x * 0.7);
        c.y = box3.max.y - span * 0.52;
      }
      const dist = (span / (2 * Math.tan((30 * Math.PI) / 360))) * 1.12;
      snapCam.position.set(c.x, c.y + span * 0.08, c.z + dist + sz.z * 0.5);
      snapCam.lookAt(c.x, c.y, c.z);
      snapR.setClearColor(0x000000, 0);
      snapR.render(snapScene, snapCam);
      const url = snapR.domElement.toDataURL("image/png");
      snapScene.remove(model.obj);
      snapCache.set(key, url);
      return url;
    } catch (e) {
      console.warn("Portrait fehlgeschlagen", e);
      return null;
    }
  };

  /* ---------- Kampfbuehne ---------- */
  R.createBattle = function (el, opts) {
    init();
    const renderer = makeRenderer(el, { maxDpr: 2 });
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(36, 1, 0.1, 400);
    const setting = opts.setting || "quest";
    const themes = {
      quest: { top: "#6fb6ff", bottom: "#e6f6ff", ground: "#8cc663", rock: "#8a7058", fog: "#e6f6ff", hemi: 1.3, sun: 2.3 },
      arena: { top: "#ff9a6a", bottom: "#ffe2b8", ground: "#e8d29a", rock: "#9a8a6a", fog: "#ffe2b8", hemi: 1.25, sun: 2.3 },
      dungeon: { top: "#140f24", bottom: "#3b2a5a", ground: "#4a4558", rock: "#2a2633", fog: "#2a1f40", hemi: 0.7, sun: 1.0 },
    };
    const th = Object.assign({}, themes[setting] || themes.quest);
    if (opts.tint && setting === "dungeon") th.bottom = new T.Color(opts.tint).multiplyScalar(0.45).getHexString().replace(/^/, "#");
    scene.add(skyDome(th.top, th.bottom));
    scene.fog = new T.Fog(th.fog, 25, 90);
    scene.add(new T.HemisphereLight("#f0f6ff", "#5a4a3a", th.hemi));
    const sun = new T.DirectionalLight(setting === "dungeon" ? "#b9a6ff" : "#fff2dc", th.sun);
    sun.position.set(4, 9, 6);
    scene.add(sun);
    const rng = SB.util.rng(setting.length * 17 + 3);
    const stage = islandMesh(7, 6, rng, th.ground, th.rock);
    scene.add(stage);
    const flickers = [];
    if (setting === "arena") {
      const wall = new T.CylinderGeometry(9, 9.4, 2.4, 40, 1, true, Math.PI * 0.42, Math.PI * 1.16);
      scene.add(mesh(wall, toon("#c9b89a", { ds: true, flat: true }), { p: [0, 1.2, 0], ol: 0 }));
      for (let i = 0; i < 70; i++) {
        const a = Math.PI * 0.5 + (i / 70) * Math.PI;
        const row = i % 2;
        const c = ["#e0644f", "#4fa9ff", "#ffd25a", "#74d86f", "#c47bff", "#f2cba8", "#ffffff"][i % 7];
        const s = mesh(g.sph(0.28, 8, 6), toon(c), { p: [Math.sin(a) * (9.3 + row * 0.8), 2.6 + row * 0.6, Math.cos(a) * (9.3 + row * 0.8)], ol: 0 });
        s.userData.bounce = rng() * 6;
        scene.add(s);
        flickers.push(s);
      }
      for (const x of [-6, 6]) {
        const p = grp([x, 0, -5.5]);
        p.add(mesh(g.cyl(0.1, 0.1, 5, 6), toon("#6b4a2f"), { p: [0, 2.5, 0] }));
        p.add(mesh(g.box(1.4, 0.9, 0.04), toon(x < 0 ? "#c0392b" : "#2f6fbf", { ds: true }), { p: [0.72, 4.4, 0] }));
        scene.add(p);
      }
    } else if (setting === "dungeon") {
      for (const x of [-5.5, 5.5]) {
        const p = grp([x, 0, -3.5]);
        p.add(mesh(g.box(0.9, 5, 0.9), toon("#3a3346", { flat: true }), { p: [0, 2.5, 0] }));
        p.add(mesh(g.cone(0.25, 0.6, 6), toon("#ff9a3d", { e: "#ff7a1a", ei: 1.5 }), { p: [0, 5.3, 0.5], ol: 0 }));
        const pl = new T.PointLight("#ff9a3d", 12, 14, 1.5);
        pl.position.set(0, 5.4, 0.8);
        p.add(pl);
        flickers.push(pl);
        scene.add(p);
      }
      for (let i = 0; i < 6; i++) scene.add(mesh(g.octa(0.3 + rng() * 0.4), toon(opts.tint || "#c47bff", { e: opts.tint || "#c47bff", ei: 0.8 }), { p: [-6 + rng() * 12, 0.3, -2 - rng() * 3], r: [rng(), rng(), rng()] }));
    } else {
      for (let i = 0; i < 5; i++) {
        const tr = tree(rng, i % 2);
        tr.position.set(-5.5 + i * 2.7 + rng(), 0, -3.5 - rng() * 1.5);
        scene.add(tr);
      }
    }
    const clouds = [];
    for (let i = 0; i < 10; i++) {
      const c = cloud(rng, 2 + rng() * 2, setting === "dungeon" ? 0.25 : 0.95);
      c.position.set(-40 + rng() * 80, -8 + rng() * 14, -30 - rng() * 30);
      scene.add(c);
      clouds.push(c);
    }

    // Kaempfer
    const overlay = document.createElement("div");
    overlay.className = "battle-fx";
    el.appendChild(overlay);
    const portrait = el.clientWidth < el.clientHeight;
    const sep = portrait ? 2.5 : 2.7;
    const F = [opts.left, opts.right].map((desc, i) => {
      const m = R.buildFighter(desc);
      const side = i === 0 ? -1 : 1;
      const home = new T.Vector3(side * sep, 0, 0.4);
      m.obj.position.copy(home);
      m.obj.rotation.y = side < 0 ? Math.PI / 2 - 0.55 : -Math.PI / 2 + 0.55;
      const box3 = new T.Box3().setFromObject(m.obj);
      const hgt = box3.max.y - box3.min.y;
      if (hgt > 3.6) {
        const s = 3.6 / hgt;
        m.obj.scale.multiplyScalar(s);
        m.headY *= s;
      }
      const sh = new T.Mesh(new T.CircleGeometry(1, 24), basic("#000000", 0.25));
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(home.x, 0.02, home.z);
      sh.scale.setScalar(desc.kind === "monster" && (desc.arch === "drache" || desc.arch === "golem") ? 1.4 : 0.9);
      scene.add(sh);
      scene.add(m.obj);
      return { m, home, side, shadow: sh, desc };
    });

    let speed = 1;
    let w = 1;
    let h = 1;
    let shake = 0;
    const camBase = new T.Vector3(0, 2.7, 9.0);
    const lookY = 1.45;
    const tweens = [];
    function resize() {
      w = Math.max(1, el.clientWidth);
      h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = w + "px";
      renderer.domElement.style.height = h + "px";
      camera.aspect = w / h;
      camera.fov = w / h < 1 ? 50 : 36;
      // Beide Kaempfer muessen in die Breite passen
      const halfW = sep + (portrait ? 1.15 : 1.6);
      const tanH = Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
      camBase.z = Math.max(9.0, halfW / tanH);
      camBase.y = 2.7 + (camBase.z - 9) * 0.1;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let raf = 0;
    let last = performance.now();
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        tw.t += dt * speed;
        const u = Math.min(1, tw.t / tw.dur);
        tw.fn(u);
        if (u >= 1) {
          tweens.splice(i, 1);
          tw.res();
        }
      }
      for (const f of F) {
        f.m.speed = speed;
        f.m.update(dt * speed);
        f.shadow.position.x = f.m.obj.position.x;
      }
      for (const c of flickers) {
        if (c.isLight) c.intensity = 10 + Math.sin(t * 13 + c.position.x) * 2 + Math.random() * 2;
        else c.position.y = 2.6 + Math.max(0, Math.sin(t * 7 + c.userData.bounce)) * 0.25 + (c.position.y > 3 ? 0.6 : 0);
      }
      for (const c of clouds) c.position.x += dt * 0.4;
      camera.position.copy(camBase);
      if (shake > 0) {
        shake -= dt;
        camera.position.x += (Math.random() - 0.5) * 0.25;
        camera.position.y += (Math.random() - 0.5) * 0.25;
      }
      camera.lookAt(0, lookY, 0);
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);

    const tween = (dur, fn) => new Promise((res) => tweens.push({ t: 0, dur, fn, res }));
    const wait = (dur) => tween(dur, () => {});
    const tmp = new T.Vector3();
    function screenPos(f, yOff) {
      tmp.set(f.m.obj.position.x, (f.m.headY || 1.8) + (yOff || 0.3), f.m.obj.position.z);
      tmp.project(camera);
      return { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h };
    }
    function floatText(f, text, cls) {
      const p = screenPos(f, 0.35);
      const d = document.createElement("div");
      d.className = "fx-text " + (cls || "");
      d.textContent = text;
      d.style.left = p.x + (Math.random() - 0.5) * 30 + "px";
      d.style.top = p.y + "px";
      d.style.animationDuration = 1.1 / Math.sqrt(speed) + "s";
      overlay.appendChild(d);
      setTimeout(() => d.remove(), 1400);
    }
    function banner(text, side) {
      const d = document.createElement("div");
      d.className = "fx-banner " + (side < 0 ? "left" : "right");
      d.textContent = text;
      overlay.appendChild(d);
      setTimeout(() => d.remove(), 1300 / speed + 200);
    }
    function burst(pos, color, n, spread) {
      const parts = [];
      for (let i = 0; i < n; i++) {
        const p = new T.Mesh(g.sph(0.08, 6, 4), glow(color, 0.9));
        p.position.copy(pos);
        p.userData.v = new T.Vector3((Math.random() - 0.5) * spread, Math.random() * spread, (Math.random() - 0.5) * spread);
        scene.add(p);
        parts.push(p);
      }
      tween(0.5, (u) => {
        for (const p of parts) {
          p.position.addScaledVector(p.userData.v, 0.03);
          p.userData.v.y -= 0.08;
          p.scale.setScalar(1 - u);
        }
        if (u >= 1) parts.forEach((p) => scene.remove(p));
      });
    }
    function ring(f, color) {
      const r = new T.Mesh(g.torus(0.6, 0.08, Math.PI * 2, 6, 32), glow(color, 0.85));
      r.rotation.x = Math.PI / 2;
      r.position.set(f.m.obj.position.x, 0.15, f.m.obj.position.z);
      scene.add(r);
      return tween(0.45, (u) => {
        r.scale.setScalar(1 + u * 3);
        r.material.opacity = 0.85 * (1 - u);
        if (u >= 1) {
          scene.remove(r);
          r.material.opacity = 0.85;
        }
      });
    }
    function stunStars(f) {
      const s = grp();
      for (let i = 0; i < 3; i++) s.add(mesh(g.octa(0.1), toon("#ffe45a", { e: "#ffe45a", ei: 1 }), { p: [Math.cos((i * Math.PI * 2) / 3) * 0.45, 0, Math.sin((i * Math.PI * 2) / 3) * 0.45], ol: 0 }));
      s.position.set(f.m.obj.position.x, (f.m.headY || 1.8) + 0.35, f.m.obj.position.z);
      scene.add(s);
      f.stars = s;
      tween(99, (u) => (s.rotation.y = u * 300));
    }
    function clearStars(f) {
      if (f.stars) {
        scene.remove(f.stars);
        f.stars = null;
      }
    }
    async function projectile(A, Bf, kind, color) {
      const start = new T.Vector3(A.m.obj.position.x + A.side * -0.6, (A.m.headY || 1.8) * 0.65, A.m.obj.position.z);
      const end = new T.Vector3(Bf.m.obj.position.x, (Bf.m.headY || 1.8) * 0.6, Bf.m.obj.position.z);
      let obj;
      if (kind === "arrow") {
        obj = grp();
        obj.add(mesh(g.cyl(0.025, 0.025, 1.0, 5), toon("#c9b89a"), { r: [0, 0, Math.PI / 2], ol: 0 }));
        obj.add(mesh(g.cone(0.07, 0.2, 5), toon("#c8ced6"), { p: [0.55, 0, 0], r: [0, 0, -Math.PI / 2], ol: 0 }));
        if (A.side > 0) obj.rotation.y = Math.PI;
      } else {
        obj = grp();
        obj.add(mesh(g.sph(kind === "star" ? 0.38 : 0.22, 12, 10), toon(color, { e: color, ei: 1.5 }), { ol: 0 }));
        obj.add(mesh(g.sph(kind === "star" ? 0.7 : 0.42, 12, 10), glow(color, 0.45), { ol: 0 }));
      }
      obj.position.copy(start);
      scene.add(obj);
      const trail = [];
      await tween(kind === "arrow" ? 0.28 : 0.38, (u) => {
        obj.position.lerpVectors(start, end, u);
        obj.position.y += Math.sin(u * Math.PI) * (kind === "arrow" ? 0.5 : 0.3);
        if (kind !== "arrow" && Math.random() < 0.6) {
          const p = new T.Mesh(g.sph(0.1, 6, 4), glow(color, 0.6));
          p.position.copy(obj.position);
          scene.add(p);
          trail.push(p);
        }
        trail.forEach((p) => p.scale.multiplyScalar(0.9));
      });
      scene.remove(obj);
      trail.forEach((p) => scene.remove(p));
      burst(end, color, kind === "star" ? 18 : 8, kind === "star" ? 3 : 1.6);
    }
    const hp = [opts.hp ? opts.hp[0] : 1, opts.hp ? opts.hp[1] : 1];
    async function impact(ev, A, Bf, hit, idx) {
      const def = 1 - ev.a;
      if (hit.res === "evade") {
        const dx = -Bf.side * -0.0 + Bf.side * 0.6;
        Bf.m.play("evade", 0.4);
        tween(0.4, (u) => (Bf.m.obj.position.x = Bf.home.x + Math.sin(u * Math.PI) * dx));
        floatText(Bf, "Ausgewichen!", "evade");
        if (opts.sfx) opts.sfx("evade");
      } else if (hit.res === "block") {
        Bf.m.play("block", 0.4);
        burst(new T.Vector3(Bf.m.obj.position.x - Bf.side * 0.6, 1.4, Bf.m.obj.position.z), "#ffe27a", 10, 2);
        floatText(Bf, "Geblockt!", "block");
        if (opts.sfx) opts.sfx("block");
      } else {
        hp[def] = Math.max(0, hp[def] - hit.dmg);
        Bf.m.play("hit", 0.35);
        Bf.m.flash(0.09);
        tween(0.3, (u) => (Bf.m.obj.position.x = Bf.home.x + Bf.side * Math.sin(u * Math.PI) * (hit.res === "crit" ? 0.6 : 0.3)));
        floatText(Bf, SB.util.fmt(hit.dmg), hit.res === "crit" ? "crit" : "dmg");
        if (hit.res === "crit") {
          shake = 0.25;
          floatText(Bf, "Kritisch!", "critlabel");
        }
        burst(new T.Vector3(Bf.m.obj.position.x, (Bf.m.headY || 1.8) * 0.6, Bf.m.obj.position.z), hit.res === "crit" ? "#ffb13b" : "#ffffff", hit.res === "crit" ? 14 : 7, 1.8);
        if (opts.sfx) opts.sfx(hit.res === "crit" ? "crit" : "hit");
      }
      if (opts.onImpact) opts.onImpact(def, hp[def], ev, idx);
    }

    async function play(ev) {
      const A = F[ev.a];
      const Bf = F[1 - ev.a];
      if (ev.kind === "stun") {
        floatText(A, "Betäubt!", "stun");
        A.m.play("hit", 0.4);
        await wait(0.7);
        clearStars(A);
        return;
      }
      const special = ev.kind === "special";
      if (special) {
        banner(ev.spName || "Spezialangriff", A.side);
        ring(A, A.m.projColor || "#ffd25a");
        if (opts.sfx) opts.sfx("special");
        await wait(0.35);
      }
      const isHero = A.desc.kind !== "monster";
      const bowLike = isHero && (A.m.weaponBase === "bogen" || A.m.weaponBase === "armbrust");
      const spell = (isHero && A.desc.cls === "rune") || (!isHero && A.m.ranged);
      if (bowLike || spell) {
        for (let i = 0; i < ev.hits.length; i++) {
          A.m.play(bowLike ? "shoot" : "cast", 0.5);
          await wait(bowLike ? 0.28 : 0.3);
          if (opts.sfx) opts.sfx(bowLike ? "bow" : "spell");
          const kind = bowLike ? "arrow" : ev.sp === "sternenbruch" ? "star" : "orb";
          await projectile(A, Bf, kind, A.m.projColor || "#c47bff");
          await impact(ev, A, Bf, ev.hits[i], i);
          await wait(ev.hits.length > 1 ? 0.12 : 0.3);
        }
      } else {
        const target = Bf.home.x - Bf.side * (Bf.desc.kind === "monster" ? 1.8 : 1.4);
        const from = A.home.x;
        if (special && ev.sp === "zermalmen") A.m.play("special", 0.6);
        else A.m.play("walk", 0.3);
        await tween(0.26, (u) => (A.m.obj.position.x = from + (target - from) * u));
        for (let i = 0; i < ev.hits.length; i++) {
          A.m.play("attack", 0.42);
          if (opts.sfx) opts.sfx("swing");
          await wait(0.22);
          await impact(ev, A, Bf, ev.hits[i], i);
          await wait(0.18);
        }
        await tween(0.26, (u) => (A.m.obj.position.x = target + (from - target) * u));
      }
      if (ev.stun) {
        floatText(Bf, "Betäubt!", "stun");
        stunStars(Bf);
      }
      await wait(0.15);
    }

    return {
      play,
      setSpeed(s) {
        speed = s;
      },
      async finish(winner) {
        const W = F[winner];
        const L = F[1 - winner];
        clearStars(L);
        L.m.play("defeat", 0.9);
        if (opts.sfx) opts.sfx("ko");
        await wait(0.6);
        W.m.play("victory", 1.4);
        burst(new T.Vector3(W.m.obj.position.x, 2.2, W.m.obj.position.z), "#ffd25a", 22, 3);
        await wait(1.2);
      },
      dispose() {
        cancelAnimationFrame(raf);
        ro.disconnect();
        overlay.remove();
        killRenderer(renderer);
      },
    };
  };
})();
