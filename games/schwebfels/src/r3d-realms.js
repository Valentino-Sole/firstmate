/* Helden von Schwebfels - Heimatinseln der drei Reiche: Landschaft, Gebaeude, Wetter und Wahrzeichen.
   Albion (Kreidenfels): Kreideklippen, Eichen, Fachwerk und Burgen, goldene Pollen in der Luft.
   Midgard (Hrimholm): Schnee, Langhaeuser mit Drachenkoepfen, Runensteine, Schneefall und starkes Nordlicht.
   Hibernia (Glenfeyn): sattes Gruen, Rundhaeuser mit Moosdach, bunte Feenlichter, Bluetenblaetter und ein Weltenbaum.
   Wird von r3d-scenes.js beim Bau der Insel und der Kampfbuehne benutzt. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const R = (SB.R3D = SB.R3D || {});
  const PI = Math.PI;
  let T, mesh, grp, G, pm, emis, glow, basic, X;
  function init() {
    T = R.T();
    mesh = R.mesh;
    grp = R.grp;
    G = R.geo;
    pm = R.mat.pmat;
    emis = R.mat.emis;
    glow = R.mat.glow;
    basic = R.mat.basic;
    X = R._sc;
  }
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

  /* ---------- Stimmung je Reich ---------- */
  const THEMES = {
    albion: {
      id: "albion",
      sky: { dayTop: "#3f6a9f", dayBot: "#b9c6c4", duskTop: "#3a2c5a", duskBot: "#d8885a", nightTop: "#05080f", nightBot: "#18223c", fogDay: "#8c9ea6", fogNight: "#182036", sunDay: "#ffe9c8", hemiGround: "#4a3e30" },
      ground: { grass: "#4a6c3c", grass2: "#6e8446", dirt: "#8a7a5c", rock: "#cfc8b8", vineGlow: "#ffe39a", cob: "#8a847a" },
      flies: ["#ffe9a0"], weather: "pollen", aurora: 0.25, roots: 14,
    },
    midgard: {
      id: "midgard",
      sky: { dayTop: "#46597a", dayBot: "#b4c2d0", duskTop: "#24284a", duskBot: "#9a7c96", nightTop: "#01030a", nightBot: "#0c182e", fogDay: "#a6b4c2", fogNight: "#0e1a2e", sunDay: "#e8f0ff", hemiGround: "#5a6070" },
      ground: { grass: "#e2e8ee", grass2: "#c2cedb", dirt: "#7c7672", rock: "#4c5462", vineGlow: "#9fe3ff", cob: "#6a6e76" },
      flies: ["#bfe8ff"], weather: "snow", aurora: 1.0, roots: 10,
    },
    hibernia: {
      id: "hibernia",
      sky: { dayTop: "#2e7898", dayBot: "#b4dcc6", duskTop: "#3a2a6a", duskBot: "#e08ab0", nightTop: "#050918", nightBot: "#1c1a46", fogDay: "#86bca8", fogNight: "#1c1a48", sunDay: "#fff3c8", hemiGround: "#3a4a2a" },
      ground: { grass: "#3c8a44", grass2: "#7ab84a", dirt: "#6e5a3a", rock: "#566856", vineGlow: "#9fffc8", cob: "#6a7462" },
      flies: ["#9fffc8", "#ff9fe0", "#ffe08a", "#9fd8ff"], weather: "petals", aurora: 0.35, roots: 26,
    },
  };
  R.realmTheme = (realm) => THEMES[realm] || THEMES.albion;

  /* ---------- Baeume und Kleinkram ---------- */
  function poplar(rng) {
    const t = grp();
    t.add(mesh(G.cyl(0.08, 0.13, 1.2, 6), pm("bark", "#4a3a2e"), { p: [0, 0.6, 0] }));
    const m = pm("plain", pick(rng, ["#3c6432", "#466e36", "#355a2e"]), { flat: true });
    for (let i = 0; i < 4; i++) t.add(mesh(G.ico(0.55 - i * 0.08, 1), m, { p: [0, 1.4 + i * 0.6, 0], s: [1, 1.5, 1] }));
    t.scale.setScalar(0.9 + rng() * 0.5);
    return t;
  }
  function snowPine(rng) {
    const t = grp();
    t.add(mesh(G.cyl(0.1, 0.16, 1.0, 6), pm("bark", "#3a2e24"), { p: [0, 0.5, 0] }));
    const m = pm("plain", pick(rng, ["#1d3230", "#22372f", "#26392f"]), { flat: true });
    const snow = pm("plain", "#eef3f8", { flat: true });
    for (let i = 0; i < 4; i++) {
      const r0 = 1.0 - i * 0.2;
      t.add(mesh(G.cone(r0, 1.2, 7), m, { p: [0, 1.1 + i * 0.6, 0], r: [0, i, 0] }));
      t.add(mesh(G.cone(r0 * 0.62, 0.55, 7), snow, { p: [0, 1.47 + i * 0.6, 0], r: [0, i, 0] }));
    }
    t.scale.setScalar(0.9 + rng() * 0.7);
    return t;
  }
  function birch(rng) {
    const t = grp();
    const bark = pm("bark", "#d8d4cc");
    t.add(mesh(G.tube("birch", [[0, 0, 0], [0.08, 1.0, 0], [-0.06, 2.0, 0.05], [0.1, 2.7, 0]], 0.09, 10, 6), bark));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + rng();
      t.add(mesh(G.tube("bbr", [[0, 0, 0], [0.35, 0.3, 0], [0.6, 0.65, 0.1]], 0.035, 6, 4), bark, { p: [0, 1.3 + i * 0.35, 0], r: [0, a, 0] }));
    }
    t.add(mesh(G.ico(0.2, 0), pm("plain", "#eef3f8", { flat: true }), { p: [0.1, 2.75, 0], s: [1.2, 0.4, 1.2] }));
    return t;
  }
  function feyTree(rng) {
    const leaf = pick(rng, ["#3f9a4a", "#5ab04a", "#c86ab0", "#e8a0d0", "#e8b040", "#4fa88a"]);
    const t = X.gnarledTree(rng, { leaf, bark: "#4a3628" });
    if (rng() < 0.6) {
      const c = pick(rng, ["#ffe08a", "#9fffc8", "#ff9fe0"]);
      for (let i = 0; i < 4; i++) t.add(mesh(G.sph(0.07, 6, 6), emis(c, 1.1), { p: [(rng() - 0.5) * 1.6, 2.4 + rng() * 0.9, (rng() - 0.5) * 1.6] }));
    }
    return t;
  }
  function giantShroom(rng) {
    const g = grp();
    const h = 0.9 + rng() * 0.9;
    g.add(mesh(G.cyl(0.1, 0.16, h, 8), pm("plain", "#e8e0cc"), { p: [0, h / 2, 0] }));
    const c = pick(rng, ["#c84a6a", "#6a4ac8", "#e8a040", "#4ac8b0"]);
    g.add(mesh(G.cap(0.55, PI * 0.5), pm("plain", c), { p: [0, h, 0], s: [1, 0.55, 1] }));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      g.add(mesh(G.sph(0.06, 6, 6), emis("#fff6d8", 0.8), { p: [Math.cos(a) * 0.32, h + 0.18, Math.sin(a) * 0.32] }));
    }
    g.add(R.haloSprite(c, 1.6, 0.25, [0, h, 0]));
    return g;
  }
  function flowerPatch(rng, colors) {
    const g = grp();
    const stem = pm("plain", "#3f6a32");
    for (let i = 0; i < 9; i++) {
      const x = (rng() - 0.5) * 0.9;
      const z = (rng() - 0.5) * 0.9;
      const h = 0.12 + rng() * 0.15;
      g.add(mesh(G.cyl(0.012, 0.012, h, 4), stem, { p: [x, h / 2, z], shadow: false }));
      g.add(mesh(G.sph(0.05, 6, 5), pm("plain", pick(rng, colors)), { p: [x, h, z], s: [1, 0.6, 1], shadow: false }));
    }
    return g;
  }
  function fern(rng) {
    const g = grp();
    const m = pm("plain", pick(rng, ["#2f7a3a", "#3f8a3a", "#4a9a4a"]), { ds: true });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2;
      g.add(mesh(G.box(0.08, 0.02, 0.6), m, { p: [Math.cos(a) * 0.25, 0.2, Math.sin(a) * 0.25], r: [0.6, -a + PI / 2, 0] }));
    }
    return g;
  }
  function haybale() {
    return mesh(G.cyl(0.35, 0.35, 0.55, 12), pm("fur", "#c9a85a"), { p: [0, 0.35, 0], r: [PI / 2, 0, 0.3] });
  }
  function barrel() {
    const g = grp();
    g.add(mesh(G.cyl(0.26, 0.26, 0.6, 10), pm("wood", "#6a4a30"), { p: [0, 0.3, 0] }));
    for (const y of [0.1, 0.5]) g.add(mesh(G.torus(0.265, 0.02, PI * 2, 4, 14), pm("metal", "#3a3a40"), { p: [0, y, 0], r: [PI / 2, 0, 0] }));
    return g;
  }
  function snowRock(rng) {
    const g = grp();
    const r0 = X.rock(rng, "#5a6270");
    g.add(r0);
    g.add(mesh(G.dodeca(0.3), pm("plain", "#eef3f8", { flat: true }), { p: [0, 0.18, 0], s: [1.1, 0.35, 1.1] }));
    return g;
  }
  function woodpile() {
    const g = grp();
    const m = pm("bark", "#5a4232");
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) g.add(mesh(G.cyl(0.1, 0.1, 0.9, 7), m, { p: [-0.3 + i * 0.21 + row * 0.1, 0.1 + row * 0.18, 0], r: [PI / 2, 0, 0] }));
    g.add(mesh(G.box(0.95, 0.06, 0.95), pm("plain", "#eef3f8"), { p: [0, 0.62, 0], s: [0.9, 1, 1] }));
    return g;
  }
  function runeStone(rng, c) {
    const s = X.standingStone(rng, 1.4 + rng() * 0.8, c || "#9fd8ff");
    s.add(mesh(G.dodeca(0.36), pm("plain", "#eef3f8", { flat: true }), { p: [0, 1.6, 0], s: [1, 0.35, 0.7] }));
    return s;
  }

  // Baeume und Deko je Reich fuer die Insel
  R.realmTree = function (realm, rng) {
    if (!T) init();
    const k = rng();
    if (realm === "midgard") return k < 0.78 ? snowPine(rng) : birch(rng);
    if (realm === "hibernia") return k < 0.72 ? feyTree(rng) : k < 0.9 ? giantShroom(rng) : X.pine(rng);
    return k < 0.6 ? X.gnarledTree(rng, { leaf: pick(rng, ["#3c6a32", "#4a7a38", "#557a34", "#466a30"]) }) : k < 0.85 ? poplar(rng) : X.pine(rng);
  };
  R.realmDeco = function (realm, rng, i) {
    if (!T) init();
    const k = i % 5;
    if (realm === "midgard") return [snowRock(rng), X.crystals(rng, "#bfe8ff"), woodpile(), runeStone(rng), snowRock(rng)][k];
    if (realm === "hibernia") return [X.shrooms(rng), flowerPatch(rng, ["#ff7ad0", "#ffe05a", "#ffffff", "#9f7aff", "#ff9a5a"]), fern(rng), X.crystals(rng, pick(rng, ["#9fffc8", "#ff9fe0"])), flowerPatch(rng, ["#ff5a7a", "#ffd0f0", "#9fd8ff"])][k];
    return [flowerPatch(rng, ["#d9443a", "#f2d04a", "#f2f2f2", "#8a5ad9"]), X.rock(rng, "#c9c2b4"), haybale(), barrel(), flowerPatch(rng, ["#f2d04a", "#f2f2f2"])][k];
  };

  /* ---------- Wetter: Schnee, Bluetenblaetter, Pollen ---------- */
  R.realmWeather = function (kind, rng, hi) {
    if (!T) init();
    const n = kind === "snow" ? (hi ? 1100 : 500) : kind === "petals" ? (hi ? 260 : 130) : hi ? 180 : 90;
    const geo = new T.BufferGeometry();
    const p = new Float32Array(n * 3);
    const c = new Float32Array(n * 3);
    const base = [];
    const pal = kind === "snow" ? ["#ffffff", "#e8f2ff"] : kind === "petals" ? ["#ffb6e0", "#ffffff", "#ff8ac8", "#ffe0f0", "#c8f0a0"] : ["#ffe9a0", "#fff4c8"];
    for (let i = 0; i < n; i++) {
      const a = rng() * PI * 2;
      const r = Math.sqrt(rng()) * 19;
      base.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: rng() * 18 - 2, ph: rng() * 10, sp: 0.6 + rng() * 0.8 });
      const cc = new T.Color(pick(rng, pal));
      c[i * 3] = cc.r;
      c[i * 3 + 1] = cc.g;
      c[i * 3 + 2] = cc.b;
    }
    geo.setAttribute("position", new T.BufferAttribute(p, 3));
    geo.setAttribute("color", new T.BufferAttribute(c, 3));
    const mat = new T.PointsMaterial({ size: kind === "snow" ? 0.16 : kind === "petals" ? 0.2 : 0.12, map: X.dot(), vertexColors: true, transparent: true, depthWrite: false, opacity: 0.9, blending: kind === "pollen" ? T.AdditiveBlending : T.NormalBlending });
    const pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    const fall = kind === "snow" ? 1.1 : kind === "petals" ? 0.35 : -0.05;
    pts.userData.update = (dt, t, info) => {
      mat.opacity = kind === "pollen" ? 0.25 + 0.55 * info.day : kind === "petals" ? 0.85 : 0.75 + 0.2 * info.day;
      for (let i = 0; i < n; i++) {
        const b = base[i];
        b.y -= dt * fall * b.sp;
        if (kind === "pollen") b.y += Math.sin(t * 0.7 + b.ph) * dt * 0.15;
        if (b.y < -3) b.y = 16;
        if (b.y > 16) b.y = -2;
        const sway = kind === "snow" ? 0.4 : kind === "petals" ? 1.2 : 0.6;
        p[i * 3] = b.x + Math.sin(t * 0.6 + b.ph) * sway + (kind === "petals" ? Math.sin(t * 0.15) * 2 : 0);
        p[i * 3 + 1] = b.y;
        p[i * 3 + 2] = b.z + Math.cos(t * 0.5 + b.ph * 1.3) * sway;
      }
      geo.attributes.position.needsUpdate = true;
    };
    return pts;
  };

  /* ---------- Schnee auf Daechern (Midgard) ---------- */
  R.snowify = function (b) {
    if (!T) init();
    const snow = pm("plain", "#eef3f8");
    const list = [];
    b.traverse((o) => {
      if (o.isMesh && o.userData.roof) list.push(o);
    });
    for (const o of list) {
      const s = new T.Mesh(o.geometry, snow);
      s.position.copy(o.position);
      s.rotation.copy(o.rotation);
      s.scale.copy(o.scale);
      if (o.userData.roof === "gable") {
        s.scale.x *= 0.97;
        s.position.y += 0.08;
      } else {
        const hgt = (o.geometry.parameters && o.geometry.parameters.height) || 1;
        s.scale.set(o.scale.x * 0.5, o.scale.y * 0.45, o.scale.z * 0.5);
        s.position.y += hgt * o.scale.y * 0.275 + 0.03;
      }
      s.castShadow = true;
      o.parent.add(s);
    }
    return b;
  };

  /* ---------- Bauformen ---------- */
  // Midgard: Langhaus mit Grassodendach, gekreuzten Giebelbrettern und Drachenkoepfen, Schilde an der Wand
  function longhouse(N, w, d, h, o) {
    o = o || {};
    const b = grp();
    const wood = pm("wood", o.wood || "#3e2c1e");
    const dark = pm("wood", "#2a1e14");
    const RM = SB.data.REALMS.midgard;
    b.add(mesh(G.box(w + 0.2, 0.35, d + 0.2), pm("stone", "#4e5260", { flat: true }), { p: [0, 0.17, 0] }));
    b.add(mesh(G.box(w, h, d), wood, { p: [0, 0.35 + h / 2, 0] }));
    for (let i = 1; i < 5; i++) for (const z of [d / 2 + 0.01, -d / 2 - 0.01]) b.add(mesh(G.box(w, 0.035, 0.03), dark, { p: [0, 0.35 + (i * h) / 5, z], shadow: false }));
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.add(mesh(G.cyl(0.13, 0.16, h + 0.3, 8), dark, { p: [x, 0.35 + h / 2, z] }));
    const rh = o.roofH || h * 1.35;
    const roof = X.gableRoof(w + 0.6, d + 1.0, rh, pm("fur", o.roofC || "#4a3e2c"));
    roof.position.y = 0.35 + h;
    b.add(roof);
    const base = 0.35 + h;
    const top = base + rh;
    for (const s of [-1, 1]) {
      const gx = s * ((w + 0.6) / 2 + 0.02);
      for (const k of [-1, 1]) {
        const pts = [[0, base - 0.05, k * ((d + 1.0) / 2)], [0, top, 0], [0, top + 0.45, -k * 0.38], [0, top + 0.75, -k * 0.12]];
        b.add(mesh(G.tube("lhb" + d.toFixed(2) + h.toFixed(2) + rh.toFixed(2) + k, pts, 0.055, 14, 5), dark, { p: [gx, 0, 0] }));
        const head = grp([gx, top + 0.75, -k * 0.12], [0, 0, 0]);
        head.add(mesh(G.cone(0.08, 0.28, 5), dark, { p: [s * 0.12, 0.02, 0], r: [0, 0, -s * PI / 2] }));
        head.add(mesh(G.sph(0.025, 6, 6), emis("#ff7a3d", 1), { p: [s * 0.12, 0.06, 0.05] }));
        b.add(head);
      }
    }
    // Tuer mit geschnitztem Rahmen
    b.add(mesh(G.box(0.85, 1.35, 0.08), dark, { p: [0, 0.35 + 0.68, d / 2 + 0.03] }));
    for (const x of [-0.5, 0.5]) b.add(mesh(G.box(0.12, 1.55, 0.12), pm("wood", "#5a3e26"), { p: [x, 0.35 + 0.78, d / 2 + 0.05] }));
    b.add(mesh(G.torus(0.16, 0.03, PI * 2, 4, 12), pm("wood", "#5a3e26"), { p: [0, 0.35 + 1.62, d / 2 + 0.06] }));
    // Rundschilde
    const shieldCols = [RM.color, "#d9d2c5", "#8a2a2a", "#2a2a30"];
    const n = Math.max(2, Math.floor((w - 1.2) / 0.75));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.45 + (i * (w - 0.9)) / Math.max(1, n - 1);
      if (Math.abs(x) < 0.7) continue;
      const sg = grp([x, 0.35 + h * 0.62, d / 2 + 0.06]);
      sg.add(mesh(G.cyl(0.26, 0.26, 0.05, 16), pm("wood", shieldCols[i % 4]), { r: [PI / 2, 0, 0] }));
      sg.add(mesh(G.sph(0.07, 8, 6), pm("metal", "#8a8f98"), { p: [0, 0, 0.04], s: [1, 1, 0.6] }));
      sg.add(mesh(G.torus(0.26, 0.018, PI * 2, 4, 18), pm("metal", "#5a5f68"), {}));
      b.add(sg);
    }
    for (const x of [-w * 0.32, w * 0.32]) b.add(mesh(G.box(0.3, 0.22, 0.06), N.win, { p: [x, 0.35 + h * 0.9, -d / 2 - 0.04] }));
    b.userData.smoke = [w * 0.25, top + 0.1, 0];
    return b;
  }
  // Hibernia: Rundhaus mit Lehmwand, Reetkegel voller Moos und Blumen, Feenlaterne an der Tuer
  function roundhouse(N, r, h, o) {
    o = o || {};
    const b = grp();
    b.add(mesh(G.cyl(r, r * 1.04, h, 18), pm("plain", o.wall || "#d6c49a"), { p: [0, h / 2, 0] }));
    b.add(mesh(G.cyl(r * 1.012, r * 1.02, 0.14, 18, true), pm("plain", o.band || "#3f8a5a", { ds: true }), { p: [0, h * 0.72, 0] }));
    // Spiralmuster auf dem Band
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      b.add(mesh(G.torus(0.05, 0.012, PI * 1.6, 3, 10), pm("plain", "#e8d8a8"), { p: [Math.cos(a) * r * 1.025, h * 0.72, Math.sin(a) * r * 1.025], r: [0, -a + PI / 2, 0], shadow: false }));
    }
    const rh = h * 1.5;
    const roof = mesh(G.cone(r * 1.45, rh, 18), pm("fur", o.roofC || "#b0904e"), { p: [0, h + rh / 2 - 0.05, 0] });
    roof.userData.roof = "cone";
    b.add(roof);
    const moss = pm("plain", "#3f9a3a", { flat: true });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2 + 0.3;
      const f = 0.15 + (i % 3) * 0.22;
      const rr = r * 1.45 * (1 - f);
      b.add(mesh(G.ico(0.28, 0), moss, { p: [Math.cos(a) * rr * 0.92, h + f * rh, Math.sin(a) * rr * 0.92], s: [1.2, 0.35, 1.2], r: [0, a, 0.4] }));
    }
    const fc = ["#ff7ad0", "#ffe05a", "#ffffff", "#9f7aff"];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2;
      const f = 0.08 + (i % 4) * 0.12;
      const rr = r * 1.45 * (1 - f);
      b.add(mesh(G.sph(0.06, 6, 5), pm("plain", fc[i % 4]), { p: [Math.cos(a) * rr * 0.98, h + f * rh + 0.05, Math.sin(a) * rr * 0.98], shadow: false }));
    }
    b.add(mesh(G.cone(0.14, 0.4, 6), pm("wood", "#4a3628"), { p: [0, h + rh + 0.05, 0] }));
    const orb = mesh(G.sph(0.11, 10, 8), emis(o.orb || "#9fffc8", 1.2), { p: [0, h + rh + 0.38, 0] });
    b.add(orb);
    b.add(R.haloSprite(o.orb || "#9fffc8", 1.2, 0.5, [0, h + rh + 0.38, 0]));
    // Rundbogentuer
    const dz = r * 1.02;
    b.add(mesh(G.box(0.75, 1.0, 0.1), pm("wood", "#3a281a"), { p: [0, 0.5, dz] }));
    b.add(mesh(G.cyl(0.375, 0.375, 0.1, 12, false), pm("wood", "#3a281a"), { p: [0, 1.0, dz], r: [PI / 2, 0, 0], s: [1, 1, 1] }));
    b.add(mesh(G.torus(0.42, 0.05, PI, 4, 12), pm("stone", "#7a7a6a"), { p: [0, 1.0, dz + 0.04] }));
    for (const s of [-1, 1]) b.add(mesh(G.box(0.1, 1.0, 0.1), pm("stone", "#7a7a6a"), { p: [s * 0.42, 0.5, dz + 0.04] }));
    // runde Fenster
    for (const a of [0.7, -0.7]) b.add(mesh(G.cyl(0.17, 0.17, 0.06, 12), N.win, { p: [Math.sin(a) * r * 1.01, h * 0.48, Math.cos(a) * r * 1.01], r: [PI / 2, 0, -a] }));
    // Feenlaterne
    const lan = grp([0.62, 1.45, dz + 0.18]);
    lan.add(mesh(G.sph(0.08, 8, 6), emis("#9fffc8", 1.4)));
    const hl = R.haloSprite("#9fffc8", 0.9, 0.6);
    lan.add(hl);
    N.halos.push(hl);
    b.add(lan);
    // Ranke mit Blaettern an der Wand
    const vine = pm("plain", "#3f7a32");
    const vp = [];
    for (let i = 0; i <= 8; i++) {
      const a = -1.6 + i * 0.12;
      vp.push([Math.cos(a) * r * 1.03, 0.1 + i * h * 0.11, Math.sin(a) * r * 1.03]);
    }
    b.add(mesh(G.tube("vine" + r.toFixed(2) + h.toFixed(2), vp, 0.025, 20, 4), vine));
    for (let i = 1; i < 8; i++) b.add(mesh(G.sph(0.06, 6, 4), vine, { p: [vp[i][0] * 1.01, vp[i][1], vp[i][2] * 1.01], s: [1, 0.5, 1.4], shadow: false }));
    b.userData.smoke = [0, h + rh + 0.2, 0];
    b.userData.apexOrb = orb;
    return b;
  }
  // Albion: runder Wehrturm mit Zinnen und rotem Kegeldach
  function tower(r, h, roofC) {
    const b = grp();
    const st = pm("stone", "#9a948a", { flat: true });
    b.add(mesh(G.cyl(r, r * 1.08, h, 12), st, { p: [0, h / 2, 0] }));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2;
      b.add(mesh(G.box(0.3 * r, 0.32, 0.3 * r), st, { p: [Math.cos(a) * r * 1.02, h + 0.16, Math.sin(a) * r * 1.02], r: [0, -a, 0] }));
    }
    const roof = mesh(G.cone(r * 1.2, r * 1.9, 12), pm("stone", roofC || "#8a2a24", { flat: true }), { p: [0, h + 0.35 + r * 0.95, 0] });
    roof.userData.roof = "cone";
    b.add(roof);
    return b;
  }
  function crenelWall(len, h) {
    const b = grp();
    const st = pm("stone", "#9a948a", { flat: true });
    b.add(mesh(G.box(len, h, 0.7), st, { p: [0, h / 2, 0] }));
    const n = Math.max(2, Math.floor(len / 0.6));
    for (let i = 0; i < n; i++) b.add(mesh(G.box(0.32, 0.3, 0.72), st, { p: [-len / 2 + 0.3 + (i * (len - 0.6)) / (n - 1), h + 0.15, 0] }));
    return b;
  }
  function anvilSet(b, x, z) {
    const anvil = grp([x, 0, z]);
    anvil.add(mesh(G.box(0.3, 0.4, 0.3), pm("metal", "#3a3a42"), { p: [0, 0.2, 0] }));
    anvil.add(mesh(G.box(0.75, 0.2, 0.32), pm("metal", "#4a4f58"), { p: [0, 0.5, 0] }));
    anvil.add(mesh(G.cone(0.1, 0.32, 4), pm("metal", "#4a4f58"), { p: [0.5, 0.5, 0], r: [0, 0, -PI / 2] }));
    b.add(anvil);
    b.userData.sparks = [x, 0.6, z];
    b.userData.anvil = [x, z];
  }
  function forgePit(b, N, x, z) {
    const st = pm("stone", "#4a4a52", { flat: true });
    b.add(mesh(G.box(1.1, 0.6, 0.9), st, { p: [x, 0.3, z] }));
    b.add(mesh(G.box(0.9, 0.08, 0.7), emis("#ff6a1a", 1.4), { p: [x, 0.62, z] }));
    const hl = R.haloSprite("#ff7a2a", 2.2, 0.8, [x, 0.9, z]);
    b.add(hl);
    const f = X.fire(N, 0.6);
    f.position.set(x, 0.62, z);
    b.add(f);
  }
  function weaponRack(b, x, z, realm) {
    const rack = grp([x, 0, z]);
    rack.add(mesh(G.box(1.0, 0.08, 0.1), pm("wood", "#5a4130"), { p: [0, 1.1, 0] }));
    for (const s of [-0.5, 0.5]) rack.add(mesh(G.box(0.08, 1.15, 0.08), pm("wood", "#33261c"), { p: [s, 0.57, 0] }));
    [["axt", 0], ["schwert", 1], ["hammer", 2]].forEach(([base, i]) => {
      const w = R.buildWeapon({ base, rarity: "gewoehnlich", style: i % 3 }, realm);
      w.position.set(-0.35 + i * 0.35, 0.05, 0.05);
      w.scale.setScalar(0.8);
      rack.add(w);
    });
    b.add(rack);
  }
  function realmFlags(b, list, radius) {
    const flags = [];
    const realms = ["albion", "midgard", "hibernia"];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2 + 0.5;
      const p = grp([Math.cos(a) * radius, 0, Math.sin(a) * radius]);
      p.add(mesh(G.cyl(0.06, 0.07, 4.0, 6), pm("metal", "#3a3a42"), { p: [0, 2.0, 0] }));
      const RM = SB.data.REALMS[realms[i]];
      const banner = new T.Mesh(G.geo("banner", () => new T.PlaneGeometry(0.9, 1.6, 1, 6)), R.crestMat(realms[i], RM.color, RM.trim));
      banner.position.set(0.5, 3.0, 0);
      p.add(banner);
      flags.push(banner);
      p.rotation.y = -a;
      b.add(p);
    }
    list.push(...flags);
  }
  function brazier(b, N, x, z, s) {
    const br = grp([x, 0, z]);
    br.add(mesh(G.cyl(0.08, 0.1, 1.2, 6), pm("metal", "#3a3a42"), { p: [0, 0.6, 0] }));
    br.add(mesh(G.cyl(0.35, 0.18, 0.3, 8), pm("metal", "#3a3a42"), { p: [0, 1.3, 0] }));
    const f = X.fire(N, s || 1);
    f.position.y = 1.4;
    br.add(f);
    b.add(br);
  }
  function guildBannerPoles(b, xs, z, tall) {
    const banners = [];
    for (const x of xs) {
      const p = grp([x, 0, z]);
      p.add(mesh(G.cyl(0.05, 0.06, tall || 3.2, 6), pm("metal", "#3a3a42"), { p: [0, (tall || 3.2) / 2, 0] }));
      const bn = mesh(G.box(0.7, 1.2, 0.03), pm("cloth", x < 0 ? "#6a2a2a" : "#2a3a6a", { ds: true }), { p: [0.38, (tall || 3.2) - 0.7, 0] });
      p.add(bn);
      banners.push(bn);
      b.add(p);
    }
    b.userData.flags = banners;
    b.userData.guildBanners = banners;
  }

  /* ---------- Gebaeude je Reich (ueberschreiben die Albion-Grundformen) ---------- */
  const RB = { albion: {}, midgard: {}, hibernia: {} };

  // Albion: steinerne Gildenhalle mit Wehrturm; Arena mit Turnierzelten
  RB.albion.gildenhalle = function (rng, N) {
    const b = grp();
    const st = pm("stone", "#8a847a", { flat: true });
    b.add(mesh(G.box(4.0, 2.2, 2.6), st, { p: [0, 1.1, 0] }));
    for (const x of [-1.9, -0.95, 0, 0.95, 1.9]) b.add(mesh(G.box(0.18, 2.2, 0.18), pm("wood", "#33261c"), { p: [x, 1.1, 1.32] }));
    const roof = X.gableRoof(4.4, 3.2, 1.6, pm("stone", "#2f3a4a", { flat: true }));
    roof.position.y = 2.2;
    b.add(roof);
    const tw = tower(0.75, 4.4, "#8a2a24");
    tw.position.set(-2.2, 0, -0.4);
    b.add(tw);
    b.add(mesh(G.box(1.0, 1.5, 0.1), pm("wood", "#2a1e16"), { p: [0, 0.75, 1.32] }));
    for (const x of [-1.4, 1.4]) b.add(mesh(G.box(0.5, 0.6, 0.08), N.win, { p: [x, 1.4, 1.32] }));
    const realms = ["albion", "midgard", "hibernia"];
    for (let i = 0; i < 3; i++) {
      const sh = R.buildOffhand({ base: "schild", style: 0 }, realms[i]);
      sh.position.set(-1.2 + i * 1.2, 2.55, 1.6);
      sh.scale.setScalar(0.5);
      b.add(sh);
    }
    guildBannerPoles(b, [-2.4, 2.4], 1.6);
    b.add(X.lantern(N).translateX(1.6).translateZ(1.5));
    return b;
  };
  RB.albion.arena = function (rng, N, ctx) {
    const b = X.B.arena(rng, N, ctx);
    const RM = SB.data.REALMS.albion;
    for (const [a, c] of [[2.4, RM.color], [3.9, "#2f4f8f"]]) {
      const tent = grp([Math.cos(a) * 5.0, 0, Math.sin(a) * 5.0]);
      tent.add(mesh(G.cyl(0.8, 0.8, 1.1, 10, true), pm("cloth", "#e8e0d0", { ds: true }), { p: [0, 0.55, 0] }));
      for (let i = 0; i < 5; i++) tent.add(mesh(G.box(0.28, 1.1, 0.02), pm("cloth", c), { p: [Math.cos((i / 5) * PI * 2) * 0.81, 0.55, Math.sin((i / 5) * PI * 2) * 0.81], r: [0, -(i / 5) * PI * 2 + PI / 2, 0] }));
      tent.add(mesh(G.cone(1.0, 0.9, 10), pm("cloth", c), { p: [0, 1.55, 0] }));
      tent.add(mesh(G.cyl(0.02, 0.02, 0.6, 4), pm("wood", "#3a2a1e"), { p: [0, 2.2, 0] }));
      tent.add(mesh(G.box(0.3, 0.18, 0.01), pm("cloth", "#e8c35a", { ds: true }), { p: [0.15, 2.4, 0] }));
      b.add(tent);
    }
    return b;
  };

  // Midgard
  RB.midgard.taverne = function (rng, N) {
    const b = longhouse(N, 4.6, 3.0, 1.6, { roofC: "#4a3e2c" });
    // Schild mit Trinkhorn
    const sign = grp([2.3, 2.3, 1.75]);
    sign.add(mesh(G.box(1.0, 0.07, 0.07), pm("metal", "#3a3a42"), { p: [-0.35, 0.3, 0] }));
    const board = grp();
    board.add(mesh(G.box(0.6, 0.5, 0.06), pm("wood", "#5a4130")));
    board.add(mesh(G.tube("horn", [[-0.18, -0.12, 0.05], [0, -0.05, 0.05], [0.15, 0.12, 0.05]], 0.035, 8, 5), pm("bone", "#e8dcc0")));
    sign.add(board);
    b.add(sign);
    b.userData.swing = board;
    for (let i = 0; i < 3; i++) {
      const br = barrel();
      br.position.set(-2.8, 0, 0.8 - i * 0.65);
      b.add(br);
    }
    b.add(woodpile().translateX(2.8).translateZ(-0.6));
    brazier(b, N, 1.4, 2.1, 0.8);
    return b;
  };
  RB.midgard.schmiede = function (rng, N) {
    const b = longhouse(N, 2.8, 2.2, 1.3, { roofC: "#3a3228" });
    b.position.z = 0;
    forgePit(b, N, -0.8, 1.9);
    anvilSet(b, 0.7, 1.9);
    weaponRack(b, 1.9, 1.3, "midgard");
    b.userData.smoke = [-0.8, 1.8, 1.9];
    return b;
  };
  RB.midgard.stall = function (rng, N) {
    const b = longhouse(N, 3.4, 2.2, 1.2, { roofC: "#4a4030" });
    for (let i = 0; i < 5; i++) b.add(mesh(G.cyl(0.06, 0.07, 0.8, 6), pm("wood", "#33261c"), { p: [-1.6 + i * 0.5, 0.4, 2.2] }));
    b.add(mesh(G.box(2.3, 0.06, 0.06), pm("wood", "#5a4130"), { p: [-0.6, 0.6, 2.2] }));
    const gr = X.griffin();
    gr.position.set(1.3, 0, 1.9);
    gr.rotation.y = -0.6;
    gr.scale.setScalar(0.9);
    b.add(gr);
    b.userData.griffin = gr;
    return b;
  };
  RB.midgard.leuchtturm = function (rng, N) {
    const b = grp();
    const log = pm("wood", "#3a2a1e");
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) b.add(mesh(G.cyl(0.12, 0.16, 5.6, 7), log, { p: [x * 0.9, 2.8, z * 0.9], r: [z * 0.05, 0, -x * 0.05] }));
    for (const y of [1.4, 3.0]) for (const s of [-1, 1]) {
      b.add(mesh(G.box(1.6, 0.08, 0.08), log, { p: [0, y, s * 0.75], r: [0, 0, s * 0.6] }));
      b.add(mesh(G.box(0.08, 0.08, 1.6), log, { p: [s * 0.75, y + 0.4, 0], r: [s * 0.6, 0, 0] }));
    }
    b.add(mesh(G.box(2.2, 0.18, 2.2), log, { p: [0, 5.6, 0] }));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      b.add(mesh(G.cyl(0.05, 0.05, 0.7, 5), log, { p: [Math.cos(a) * 1.05, 6.0, Math.sin(a) * 1.05] }));
    }
    const roof = mesh(G.cone(1.6, 1.4, 4), pm("fur", "#4a3e2c"), { p: [0, 7.2, 0], r: [0, PI / 4, 0] });
    roof.userData.roof = "cone";
    b.add(roof);
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) b.add(mesh(G.cyl(0.05, 0.05, 0.9, 5), log, { p: [x, 6.35, z] }));
    brazier(b, N, 0, 0, 1.3);
    b.children[b.children.length - 1].position.set(0, 5.0, 0);
    // Kriegshorn
    b.add(mesh(G.tube("whorn", [[0, 0, 0], [0.3, 0.1, 0], [0.55, 0.35, 0]], 0.06, 8, 6), pm("bone", "#e8dcc0"), { p: [0.9, 6.0, 0.9] }));
    b.add(mesh(G.box(0.7, 1.2, 0.1), pm("wood", "#2a1e14"), { p: [0, 0.6, 0.95] }));
    return b;
  };
  RB.midgard.arkanum = function (rng, N) {
    const b = grp();
    const st = pm("stone", "#3e4452", { flat: true });
    for (let i = 0; i < 5; i++) b.add(mesh(G.cyl(1.25 - i * 0.12, 1.32 - i * 0.12, 1.15, 8), st, { p: [0, 0.58 + i * 1.1, 0], r: [0, i * 0.3, 0.02 * (i % 2 ? 1 : -1)] }));
    const rm = emis("#9fd8ff", 1.2);
    for (let i = 0; i < 5; i++) {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * PI * 2 + i * 0.6;
        const rr = 1.3 - i * 0.12;
        b.add(mesh(G.box(0.1, 0.32, 0.03), rm, { p: [Math.cos(a) * rr, 0.6 + i * 1.1, Math.sin(a) * rr], r: [0, -a + PI / 2, (k % 2 ? 0.4 : -0.3)], shadow: false }));
      }
    }
    const roof = mesh(G.cone(1.1, 1.6, 8), pm("stone", "#2a2e3a", { flat: true }), { p: [0, 6.3, 0] });
    roof.userData.roof = "cone";
    b.add(roof);
    b.add(mesh(G.box(0.8, 1.3, 0.1), pm("wood", "#2a1e14"), { p: [0, 0.65, 1.3] }));
    const crystal = mesh(G.octa(0.38), emis("#9fe3ff", 1.1), { p: [0, 8.6, 0], s: [1, 1.6, 1] });
    b.add(crystal);
    b.add(R.haloSprite("#9fe3ff", 2.4, 0.7, [0, 8.6, 0]));
    const ring = grp([0, 3.0, 0]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2;
      const rs = grp([Math.cos(a) * 1.9, Math.sin(i) * 0.4, Math.sin(a) * 1.9]);
      rs.add(mesh(G.box(0.26, 0.4, 0.12), st));
      rs.add(mesh(G.box(0.08, 0.22, 0.02), rm, { p: [0, 0, 0.07] }));
      ring.add(rs);
    }
    b.add(ring);
    b.userData.float = crystal;
    b.userData.orbit = ring;
    return b;
  };
  RB.midgard.arena = function (rng, N) {
    const b = grp();
    const log = pm("wood", "#3e2c1e");
    const RM = SB.data.REALMS;
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * PI * 2;
      if (Math.abs(((a - PI / 2 + PI * 3) % (PI * 2)) - PI) < 0.28) continue;
      const hgt = 1.7 + (i % 3) * 0.12;
      b.add(mesh(G.cyl(0.17, 0.19, hgt, 6), log, { p: [Math.cos(a) * 3.4, hgt / 2, Math.sin(a) * 3.4] }));
      b.add(mesh(G.cone(0.17, 0.35, 6), log, { p: [Math.cos(a) * 3.4, hgt + 0.17, Math.sin(a) * 3.4] }));
      if (i % 4 === 0) {
        const sg = grp([Math.cos(a) * 3.15, 1.0, Math.sin(a) * 3.15], [0, -a - PI / 2, 0]);
        sg.add(mesh(G.cyl(0.24, 0.24, 0.05, 14), pm("wood", [RM.midgard.color, "#d9d2c5", "#8a2a2a"][(i / 4) % 3]), { r: [PI / 2, 0, 0] }));
        sg.add(mesh(G.sph(0.06, 8, 6), pm("metal", "#8a8f98"), { p: [0, 0, 0.04] }));
        b.add(sg);
      }
    }
    b.add(mesh(G.cyl(3.2, 3.2, 0.08, 24), pm("plain", "#8a8078"), { p: [0, 0.04, 0] }));
    const flags = [];
    realmFlags(b, flags, 3.8);
    b.userData.flags = flags;
    brazier(b, N, Math.cos(1.2) * 2.6, Math.sin(1.2) * 2.6, 1);
    brazier(b, N, Math.cos(1.2 + PI) * 2.6, Math.sin(1.2 + PI) * 2.6, 1);
    return b;
  };

  // Hibernia
  RB.hibernia.taverne = function (rng, N) {
    const b = roundhouse(N, 2.0, 1.6, { band: "#3f8a5a" });
    const side = roundhouse(N, 1.2, 1.2, { band: "#8a3f6a", orb: "#ff9fe0" });
    side.position.set(-2.2, 0, -0.6);
    b.add(side);
    const sign = grp([1.7, 2.1, 1.6]);
    sign.add(mesh(G.box(0.9, 0.06, 0.06), pm("wood", "#4a3628"), { p: [-0.3, 0.3, 0] }));
    const board = grp();
    board.add(mesh(G.box(0.55, 0.45, 0.05), pm("wood", "#6a4a30")));
    board.add(mesh(R.SH ? G.ext("leaf", R.SH.leaf, 0.01, 0.004) : G.sph(0.1, 6, 6), pm("plain", "#4fa84a"), { p: [0, 0, 0.04], s: 0.4 }));
    sign.add(board);
    b.add(sign);
    b.userData.swing = board;
    for (let i = 0; i < 2; i++) {
      const br = barrel();
      br.position.set(2.3, 0, -0.4 - i * 0.65);
      b.add(br);
    }
    const fp = flowerPatch(rng, ["#ff7ad0", "#ffe05a", "#ffffff"]);
    fp.position.set(-1.0, 0, 2.2);
    b.add(fp);
    return b;
  };
  RB.hibernia.schmiede = function (rng, N) {
    const b = roundhouse(N, 1.5, 1.3, { band: "#8a6a3a", orb: "#ffb050" });
    b.position.z = 0;
    forgePit(b, N, -0.9, 1.9);
    anvilSet(b, 0.7, 2.0);
    weaponRack(b, 1.8, 1.0, "hibernia");
    b.userData.smoke = [-0.9, 1.8, 1.9];
    return b;
  };
  RB.hibernia.stall = function (rng, N) {
    const b = roundhouse(N, 1.6, 1.2, { band: "#6a5a2a" });
    const wat = pm("wood", "#6a5038");
    for (let i = 0; i < 14; i++) {
      const a = PI * 0.15 + (i / 13) * PI * 0.7;
      b.add(mesh(G.cyl(0.04, 0.05, 0.7, 5), wat, { p: [Math.cos(a) * 2.6, 0.35, Math.sin(a) * 2.6] }));
    }
    b.add(mesh(G.torus(2.6, 0.04, PI * 0.7, 4, 24), wat, { p: [0, 0.5, 0], r: [PI / 2, 0, -PI * 0.15 - PI * 0.7] }));
    const gr = X.griffin();
    gr.position.set(1.0, 0, 1.9);
    gr.rotation.y = -0.6;
    gr.scale.setScalar(0.9);
    b.add(gr);
    b.userData.griffin = gr;
    return b;
  };
  RB.hibernia.leuchtturm = function (rng, N) {
    const b = grp();
    const bark = pm("bark", "#4a3628");
    b.add(mesh(G.tube("feytrunk", [[0, 0, 0], [0.25, 1.6, 0.1], [-0.2, 3.4, -0.1], [0.1, 5.4, 0]], 0.55, 18, 9), bark));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      b.add(mesh(G.tube("feyroot", [[0, 0.6, 0], [0.6, 0.2, 0], [1.1, -0.05, 0.1]], 0.16, 8, 6), bark, { r: [0, a, 0] }));
    }
    b.add(mesh(G.cyl(1.4, 1.5, 0.16, 12), pm("wood", "#6a4a30"), { p: [0.1, 5.5, 0] }));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      b.add(mesh(G.cyl(0.03, 0.03, 0.55, 4), pm("wood", "#4a3628"), { p: [0.1 + Math.cos(a) * 1.35, 5.85, Math.sin(a) * 1.35] }));
    }
    const leaves = ["#3f9a4a", "#5ab04a", "#c86ab0", "#4fa88a"];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2;
      b.add(mesh(G.ico(0.6 + (i % 3) * 0.12, 1), pm("plain", leaves[i % 4], { flat: true }), { p: [Math.cos(a) * 1.0, 7.1 + (i % 2) * 0.4, Math.sin(a) * 1.0], s: [1, 0.7, 1] }));
    }
    const orb = mesh(G.sph(0.32, 14, 10), emis("#9fffc8", 1.3), { p: [0.1, 6.2, 0] });
    b.add(orb);
    const hl = R.haloSprite("#9fffc8", 3.2, 0.7, [0.1, 6.2, 0]);
    b.add(hl);
    N.halos.push(hl);
    const beam = new T.Mesh(new T.ConeGeometry(1.6, 11, 16, 1, true), new T.MeshBasicMaterial({ color: new T.Color("#9fffc8"), transparent: true, opacity: 0.1, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    beam.rotation.z = PI / 2;
    beam.position.set(5.5, 0, 0);
    const pivot = grp([0.1, 6.2, 0]);
    pivot.add(beam);
    b.add(pivot);
    b.userData.beam = pivot;
    // Wendelstufen aus Pilzen
    for (let i = 0; i < 8; i++) {
      const a = i * 0.8;
      b.add(mesh(G.cap(0.32, PI * 0.5), pm("plain", "#e8a040"), { p: [Math.cos(a) * 0.62, 0.6 + i * 0.6, Math.sin(a) * 0.62], s: [1, 0.3, 1] }));
    }
    return b;
  };
  RB.hibernia.arkanum = function (rng, N, ctx) {
    const b = X.B.arkanum(rng, N, ctx);
    const vine = pm("plain", "#3f8a3a");
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const a = i * 0.55;
      const rr = 1.38 - (i / 24) * 0.25;
      pts.push([Math.cos(a) * rr, 0.2 + i * 0.2, Math.sin(a) * rr]);
    }
    b.add(mesh(G.tube("arkvine", pts, 0.05, 60, 5), vine));
    const fc = ["#ff7ad0", "#ffe05a", "#9fffc8"];
    for (let i = 2; i < 24; i += 2) b.add(mesh(G.sph(0.09, 6, 5), i % 3 ? vine : pm("plain", fc[i % 3]), { p: [pts[i][0] * 1.05, pts[i][1], pts[i][2] * 1.05], s: [1, 0.6, 1.3] }));
    return b;
  };
  RB.hibernia.arena = function (rng, N) {
    const b = grp();
    b.add(mesh(G.cyl(3.2, 3.2, 0.08, 24), pm("plain", "#5a8a44"), { p: [0, 0.04, 0] }));
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * PI * 2;
      if (Math.abs(((a - PI / 2 + PI * 3) % (PI * 2)) - PI) < 0.3) continue;
      const s = X.standingStone(rng, 1.8 + rng() * 0.8, i % 2 ? "#9fffc8" : null);
      s.position.set(Math.cos(a) * 3.4, 0, Math.sin(a) * 3.4);
      s.rotation.y = -a + PI / 2;
      b.add(s);
      b.add(mesh(G.ico(0.3, 0), pm("plain", "#4f8a3a", { flat: true }), { p: [Math.cos(a) * 3.4, 0.15, Math.sin(a) * 3.4], s: [1.6, 0.4, 1.2] }));
    }
    // Wurzelbogen ueber dem Eingang
    b.add(mesh(G.tube("rootarch", [[-1.0, 0, 3.3], [-0.9, 1.6, 3.4], [0, 2.6, 3.5], [0.9, 1.6, 3.4], [1.0, 0, 3.3]], 0.14, 24, 6), pm("bark", "#4a3628")));
    for (let i = 0; i < 5; i++) b.add(mesh(G.sph(0.08, 6, 5), pm("plain", ["#ff7ad0", "#ffe05a", "#ffffff"][i % 3]), { p: [-0.8 + i * 0.4, 1.7 + Math.sin((i / 4) * PI) * 0.85, 3.5] }));
    const flags = [];
    realmFlags(b, flags, 3.9);
    b.userData.flags = flags;
    for (let i = 0; i < 4; i++) {
      const sh = X.shrooms(rng, "#9fffc8");
      const a = 0.8 + i * 1.5;
      sh.position.set(Math.cos(a) * 2.9, 0, Math.sin(a) * 2.9);
      b.add(sh);
    }
    brazier(b, N, Math.cos(1.2) * 2.6, Math.sin(1.2) * 2.6, 1);
    brazier(b, N, Math.cos(1.2 + PI) * 2.6, Math.sin(1.2 + PI) * 2.6, 1);
    return b;
  };
  RB.hibernia.gildenhalle = function (rng, N) {
    const b = roundhouse(N, 2.3, 1.9, { band: "#2f6a8a", orb: "#9fd8ff" });
    guildBannerPoles(b, [-2.7, 2.7], 1.4);
    const realms = ["albion", "midgard", "hibernia"];
    for (let i = 0; i < 3; i++) {
      const sh = R.buildOffhand({ base: "schild", style: 0 }, realms[i]);
      const a = -0.6 + i * 0.6;
      sh.position.set(Math.sin(a) * 2.38, 1.35, Math.cos(a) * 2.38);
      sh.rotation.y = a;
      sh.scale.setScalar(0.45);
      b.add(sh);
    }
    return b;
  };
  RB.hibernia.brunnen = function (rng, N, ctx) {
    const b = X.B.brunnen(rng, N, ctx);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + 0.4;
      const f = flowerPatch(rng, ["#ff7ad0", "#ffe05a", "#ffffff", "#9f7aff"]);
      f.position.set(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5);
      f.scale.setScalar(0.7);
      b.add(f);
    }
    return b;
  };

  // Heim je Reich und Ausbaustufe
  function realmFlag(b, realm, x, z) {
    const RM = SB.data.REALMS[realm];
    const pole = grp([x, 0, z]);
    pole.add(mesh(G.cyl(0.04, 0.05, 2.8, 6), pm("metal", "#3a3a42"), { p: [0, 1.4, 0] }));
    const flag = new T.Mesh(G.geo("homeflag", () => new T.PlaneGeometry(0.8, 0.55, 4, 1)), R.crestMat(realm, RM.color, RM.trim));
    flag.position.set(0.42, 2.5, 0);
    pole.add(flag);
    b.add(pole);
    b.userData.flag = flag;
  }
  RB.midgard.heim = function (rng, N, ctx) {
    const tier = ctx.homeTier || 0;
    let b;
    if (tier <= 0) {
      b = grp();
      b.add(mesh(G.cone(1.3, 2.0, 7), pm("fur", "#8a7a66", { ds: true }), { p: [0, 1.0, 0] }));
      for (let i = 0; i < 5; i++) b.add(mesh(G.cyl(0.03, 0.03, 2.4, 4), pm("wood", "#3a2a1e"), { p: [Math.cos(i) * 0.2, 1.3, Math.sin(i) * 0.2], r: [Math.sin(i * 2) * 0.25, 0, Math.cos(i * 2) * 0.25] }));
      b.add(mesh(G.box(0.55, 0.85, 0.05), basic("#1a1410"), { p: [0, 0.42, 0.95], r: [-0.5, 0, 0] }));
      const f = X.fire(N, 0.8);
      f.position.set(1.4, 0, 1.2);
      b.add(f);
      b.add(woodpile().translateX(-1.4).translateZ(0.6));
    } else if (tier === 1) b = longhouse(N, 2.4, 1.8, 1.0, { roofC: "#4a4030" });
    else if (tier === 2) b = longhouse(N, 3.6, 2.2, 1.3, { roofC: "#4a3e2c" });
    else {
      b = longhouse(N, 4.2, 2.6, 1.6, { roofC: "#3a3228" });
      const tw = RB.midgard.leuchtturm(rng, N);
      tw.scale.setScalar(0.55);
      tw.position.set(-2.8, 0, -0.6);
      b.add(tw);
    }
    realmFlag(b, ctx.realm || "midgard", -1.9, 1.3);
    return b;
  };
  RB.hibernia.heim = function (rng, N, ctx) {
    const tier = ctx.homeTier || 0;
    let b;
    if (tier <= 0) {
      b = grp();
      b.add(mesh(G.cone(1.3, 1.7, 8), pm("plain", "#4f8a3a", { ds: true, flat: true }), { p: [0, 0.85, 0] }));
      for (let i = 0; i < 8; i++) b.add(mesh(G.ico(0.25, 0), pm("plain", ["#5ab04a", "#3f9a4a"][i % 2], { flat: true }), { p: [Math.cos(i) * 0.9, 0.3 + (i % 3) * 0.3, Math.sin(i) * 0.9], s: [1, 0.5, 1] }));
      b.add(mesh(G.box(0.55, 0.8, 0.05), basic("#1a1410"), { p: [0, 0.4, 0.9], r: [-0.5, 0, 0] }));
      const f = X.fire(N, 0.7);
      f.position.set(1.3, 0, 1.2);
      b.add(f);
    } else if (tier === 1) b = roundhouse(N, 1.2, 1.1, { band: "#6a5a2a" });
    else if (tier === 2) {
      b = roundhouse(N, 1.6, 1.3, { band: "#3f8a5a" });
      const fp = flowerPatch(rng, ["#ff7ad0", "#ffe05a", "#ffffff", "#9f7aff"]);
      fp.position.set(1.8, 0, 1.0);
      b.add(fp);
    } else {
      // Baumhaus: Rundhaus auf einer Plattform im Stamm
      b = grp();
      b.add(mesh(G.tube("hometrunk", [[0, 0, 0], [0.2, 1.2, 0.1], [0, 2.4, 0]], 0.6, 12, 9), pm("bark", "#4a3628")));
      b.add(mesh(G.cyl(1.9, 1.9, 0.16, 14), pm("wood", "#6a4a30"), { p: [0, 2.4, 0] }));
      const rh = roundhouse(N, 1.4, 1.2, { band: "#8a3f6a", orb: "#ff9fe0" });
      rh.position.y = 2.48;
      b.add(rh);
      b.add(mesh(G.tube("ladder", [[0.6, 0, 1.6], [0.6, 2.4, 1.5]], 0.04, 2, 4), pm("wood", "#5a4130")));
      b.add(mesh(G.tube("ladder2", [[1.0, 0, 1.6], [1.0, 2.4, 1.5]], 0.04, 2, 4), pm("wood", "#5a4130")));
      for (let i = 0; i < 6; i++) b.add(mesh(G.box(0.45, 0.04, 0.05), pm("wood", "#5a4130"), { p: [0.8, 0.35 + i * 0.38, 1.58] }));
      b.userData.smoke = [0, 6.2, 0];
    }
    realmFlag(b, ctx.realm || "hibernia", -1.8, 1.3);
    return b;
  };
  RB.hibernia.ruhmeshalle = function (rng, N, ctx) {
    const b = X.B.ruhmeshalle(rng, N, ctx);
    const vine = pm("plain", "#3f8a3a");
    for (const x of [-1.35, 1.35]) b.add(mesh(G.tube("hallvine" + x, [[0, 0, 0], [0.15, 0.8, 0.1], [-0.1, 1.6, 0.15], [0.1, 2.4, 0.1]], 0.04, 14, 4), vine, { p: [x, 0.6, 1.2] }));
    return b;
  };

  R.realmBuilding = function (realm, id) {
    if (!T) init();
    const set = RB[realm] || {};
    return set[id] || X.B[id];
  };
  // Nach dem Bau: Midgard bekommt Schnee auf alle Daecher
  R.realmFinish = function (realm, b) {
    if (realm === "midgard") R.snowify(b);
    return b;
  };

  /* ---------- Wahrzeichen auf eigener Felsinsel ---------- */
  function castle(N) {
    const b = grp();
    const st = pm("stone", "#9a948a", { flat: true });
    // Ringmauer mit vier Ecktuermen
    const wr = 5.2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4;
      const tw = tower(1.0, 5.2, "#8a2a24");
      tw.position.set(Math.cos(a) * wr, 0, Math.sin(a) * wr);
      b.add(tw);
      const a2 = a + PI / 4;
      const wall = crenelWall(wr * 1.25, 3.4);
      wall.position.set(Math.cos(a2) * wr * 0.72, 0, Math.sin(a2) * wr * 0.72);
      wall.rotation.y = -a2 + PI / 2;
      b.add(wall);
    }
    // Torhaus vorne
    const gate = grp([0, 0, wr * 0.72]);
    gate.add(mesh(G.box(2.6, 4.2, 1.4), st, { p: [0, 2.1, 0] }));
    gate.add(mesh(G.box(1.2, 2.0, 0.1), basic("#141016"), { p: [0, 1.0, 0.72] }));
    for (let i = 0; i < 5; i++) gate.add(mesh(G.box(0.06, 1.9, 0.06), pm("metal", "#3a3a42"), { p: [-0.48 + i * 0.24, 1.0, 0.76] }));
    for (const x of [-1.0, 1.0]) gate.add(mesh(G.box(0.4, 0.4, 1.4), st, { p: [x, 4.4, 0] }));
    b.add(gate);
    // Bergfried mit hohem Turm
    const keep = grp([0, 0, -0.8]);
    keep.add(mesh(G.box(4.4, 7.0, 4.0), st, { p: [0, 3.5, 0] }));
    for (const [x, z] of [[-2.2, -2.0], [2.2, -2.0], [-2.2, 2.0], [2.2, 2.0]]) {
      const tt = tower(0.55, 8.2, "#2f3a4a");
      tt.position.set(x, 0, z);
      keep.add(tt);
    }
    const big = tower(1.3, 11.5, "#8a2a24");
    big.position.set(0.6, 0, -0.4);
    keep.add(big);
    for (let i = 0; i < 4; i++) for (const y of [2.4, 4.4]) keep.add(mesh(G.box(0.36, 0.7, 0.08), N.win, { p: [-1.5 + i, y, 2.02] }));
    for (const y of [6, 8.4, 10.2]) keep.add(mesh(G.box(0.3, 0.6, 0.08), N.win, { p: [0.6, y, 0.92] }));
    const RM = SB.data.REALMS.albion;
    const banners = [];
    for (const x of [-1.4, 1.4]) {
      const bn = new T.Mesh(G.geo("castlebanner", () => new T.PlaneGeometry(0.9, 2.4, 1, 6)), R.crestMat("albion", RM.color, RM.trim));
      bn.position.set(x, 5.2, 2.05);
      keep.add(bn);
      banners.push(bn);
    }
    const flag = new T.Mesh(G.geo("castleflag", () => new T.PlaneGeometry(1.4, 0.9, 4, 1)), R.crestMat("albion", RM.color, RM.trim));
    flag.position.set(1.3, 15.2, -0.4);
    keep.add(mesh(G.cyl(0.05, 0.05, 2.2, 5), pm("metal", "#3a3a42"), { p: [0.6, 14.4, -0.4] }));
    keep.add(flag);
    b.add(keep);
    b.userData.flags = [flag];
    return b;
  }
  function frostPeak(N, rng) {
    const b = grp();
    const rockM = pm("stone", "#4c5462", { flat: true });
    const snow = pm("plain", "#eef3f8", { flat: true });
    for (const [x, z, r, h] of [[-2.5, -2.5, 5.2, 15], [3.5, -3.5, 4.0, 11], [-5.5, 0.5, 3.2, 8.5]]) {
      b.add(mesh(G.cone(r, h, 7), rockM, { p: [x, h / 2, z], r: [0, rng() * PI, 0] }));
      b.add(mesh(G.cone(r * 0.5, h * 0.5, 7), snow, { p: [x, h * 0.75 + 0.05, z], r: [0, rng() * PI, 0], s: [1.04, 1, 1.04] }));
    }
    // Gefrorener Wasserfall
    const ice = new T.MeshLambertMaterial({ color: new T.Color("#cfe8ff"), emissive: new T.Color("#4f8fbf"), emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
    b.add(mesh(G.box(1.4, 8, 0.4), ice, { p: [1.0, 4, -0.2], r: [0.15, 0, 0] }));
    // Grosse Halle am Fuss des Berges
    const hall = longhouse(N, 6.0, 3.4, 2.0, { roofC: "#3a3228" });
    hall.position.set(0.5, 0, 3.2);
    R.snowify(hall);
    b.add(hall);
    // Riesiger Runenstein und die Steinstatue eines Ahnen
    const rs = grp([-3.8, 0, 3.4]);
    rs.add(mesh(G.box(1.3, 5.8, 0.8), pm("stone", "#5a6270", { flat: true }), { p: [0, 2.9, 0], r: [0.04, 0.3, 0.03] }));
    const rm = emis("#9fd8ff", 1.2);
    for (let i = 0; i < 6; i++) rs.add(mesh(G.box(0.12, 0.45, 0.03), rm, { p: [-0.2 + (i % 2) * 0.4, 1.0 + i * 0.75, 0.42], r: [0, 0.3, i % 2 ? 0.35 : -0.35] }));
    rs.add(R.haloSprite("#9fd8ff", 3.6, 0.35, [0, 3, 0.6]));
    b.add(rs);
    const st = R.buildHero({ race: "nordmann", cls: "sturmhuene", realm: "midgard", gender: "m", look: { hairStyle: 1, beard: 3 }, gear: { waffe: { base: "axt", rarity: "gewoehnlich" }, helm: { base: "helm", style: 1 }, umhang: { base: "umhang" } } });
    st.update(0.01);
    const stoneM = pm("stone", "#8a92a0");
    st.obj.traverse((o) => {
      if (o.isMesh) o.material = stoneM;
      if (o.isSprite) o.visible = false;
    });
    st.obj.scale.multiplyScalar(2.6);
    st.obj.position.set(4.4, 0.5, 2.6);
    st.obj.rotation.y = -0.4;
    b.add(st.obj);
    b.add(mesh(G.box(1.8, 0.5, 1.4), pm("stone", "#5a6270", { flat: true }), { p: [4.4, 0.25, 2.6] }));
    return b;
  }
  function worldTree(N, rng) {
    const b = grp();
    const bark = pm("bark", "#4a3628");
    b.add(mesh(G.tube("wtrunk", [[0, -0.5, 0], [0.8, 3, 0.3], [-0.6, 7, -0.2], [0.4, 11, 0.2], [0, 14, 0]], 1.3, 30, 12), bark));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2;
      b.add(mesh(G.tube("wroot" + i, [[0, 1.4, 0], [Math.cos(a) * 2.0, 0.4, Math.sin(a) * 2.0], [Math.cos(a) * 3.6, -0.1, Math.sin(a) * 3.6]], 0.4, 10, 7), bark));
      b.add(mesh(G.tube("wbranch" + i, [[0, 0, 0], [Math.cos(a) * 2.5, 1.6, Math.sin(a) * 2.5], [Math.cos(a) * 5, 2.0 + (i % 2), Math.sin(a) * 5]], 0.32, 10, 6), bark, { p: [0, 10.5 + (i % 3) * 1.2, 0] }));
    }
    const cols = ["#3f9a4a", "#2f8a6a", "#5ab04a", "#4fa88a", "#c86ab0"];
    const glows = [];
    for (let i = 0; i < 22; i++) {
      const a = rng() * PI * 2;
      const rr = 2 + rng() * 4.5;
      const y = 12.5 + rng() * 4.5 - rr * 0.25;
      b.add(mesh(G.ico(1.6 + rng() * 1.2, 1), pm("plain", cols[i % cols.length], { flat: true }), { p: [Math.cos(a) * rr, y, Math.sin(a) * rr], s: [1, 0.7, 1] }));
      if (i % 2 === 0) {
        const c = ["#9fffc8", "#ffe08a", "#ff9fe0"][i % 3];
        b.add(mesh(G.sph(0.18, 8, 6), emis(c, 1.4), { p: [Math.cos(a) * (rr + 1.4), y - 0.9, Math.sin(a) * (rr + 1.4)] }));
        const h = R.haloSprite(c, 1.6, 0.6, [Math.cos(a) * (rr + 1.4), y - 0.9, Math.sin(a) * (rr + 1.4)]);
        b.add(h);
        N.halos.push(h);
        glows.push(h);
      }
    }
    // Steintisch der Druiden
    const dol = grp([4.2, 0, 3.0]);
    for (const x of [-0.6, 0.6]) dol.add(mesh(G.box(0.5, 1.6, 0.6), pm("stone", "#6a7a6a", { flat: true }), { p: [x, 0.8, 0] }));
    dol.add(mesh(G.box(2.0, 0.35, 1.1), pm("stone", "#6a7a6a", { flat: true }), { p: [0, 1.75, 0], r: [0, 0, 0.05] }));
    b.add(dol);
    return b;
  }
  // Wahrzeichen eines Reiches samt eigener Felsinsel
  R.realmLandmark = function (realm, N, rng, o) {
    if (!T) init();
    o = o || {};
    const th = R.realmTheme(realm);
    const g = grp();
    const isl = X.island(o.radius || 9, o.depth || 9, rng, { grass: th.ground.grass, grass2: th.ground.grass2, dirt: th.ground.dirt, rock: th.ground.rock, roots: realm === "hibernia" ? 22 : 8, hills: 0.4, vineGlow: th.ground.vineGlow });
    g.add(isl);
    const lm = realm === "midgard" ? frostPeak(N, rng) : realm === "hibernia" ? worldTree(N, rng) : castle(N);
    g.add(lm);
    g.userData.flags = lm.userData.flags || [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + 0.3;
      const tr = R.realmTree(realm, rng);
      tr.position.set(Math.cos(a) * 7.2, 0, Math.sin(a) * 7.2);
      g.add(tr);
    }
    return g;
  };
})();
