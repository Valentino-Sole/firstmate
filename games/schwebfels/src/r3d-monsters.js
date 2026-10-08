/* Helden von Schwebfels - Monster der Tiefe (three.js, prozedural).
   Bedrohliche Kreaturen statt niedlicher Figuren: gluehende Augen, Zaehne, Klauen, gebeugte Haltung. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const R = (SB.R3D = SB.R3D || {});
  const PI = Math.PI;
  let T = null;
  let mesh, grp, G, M;

  function init() {
    T = R.T();
    mesh = R.mesh;
    grp = R.grp;
    G = R.geo;
    M = R.mat;
  }

  /* ---------- Bausteine ---------- */
  // Zweigliedrige Gliedmasse: Ansatz, Gelenk, Ende
  function limb(parent, at, l1, l2, r1, r2, mat, rot) {
    const up = grp(at, rot);
    up.add(mesh(G.capsule(r1, Math.max(0.01, l1 - r1 * 1.4), 8), mat, { p: [0, -l1 / 2, 0] }));
    const lo = grp([0, -l1, 0]);
    up.add(lo);
    lo.add(mesh(G.capsule(r2, Math.max(0.01, l2 - r2 * 1.4), 8), mat, { p: [0, -l2 / 2, 0] }));
    const end = grp([0, -l2, 0]);
    lo.add(end);
    parent.add(up);
    return { up, lo, end };
  }
  function claws(g, n, len, mat, spread) {
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * (spread || 0.35);
      g.add(mesh(G.cone(len * 0.18, len, 5), mat, { p: [Math.sin(a) * len * 0.4, -len * 0.4, Math.cos(a) * len * 0.25 + 0.02], r: [PI - 0.5, 0, a] }));
    }
  }
  function eyes(g, pts, color, r) {
    const em = M.emis(color, 1.4);
    for (const p of pts) {
      g.add(mesh(G.sph(r, 8, 6), em, { p }));
      g.add(R.haloSprite(color, r * 7, 0.75, p));
    }
  }
  function teeth(g, n, x0, x1, y, z, len, mat, down) {
    for (let i = 0; i < n; i++) {
      const x = x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
      g.add(mesh(G.cone(len * 0.28, len, 4), mat, { p: [x, y, z], r: [down ? PI : 0, 0, 0] }));
    }
  }
  function spikes(g, pts, len, mat) {
    for (const [x, y, z, rx, rz] of pts) g.add(mesh(G.cone(len * 0.22, len, 5), mat, { p: [x, y, z], r: [rx || 0, 0, rz || 0] }));
  }
  const bone = () => M.pmat("bone", "#e6dcc4");

  /* ---------- Monsterbauplaene ---------- */
  const B = {};

  // Untoter: abgemagert, gebeugt, lange Klauenarme
  B.ghul = function (m, root, P) {
    const skin = M.pmat("skin", m.color);
    const rag = M.pmat("cloth", R.shade(m.color, 0.35), { ds: true });
    const body = grp([0, 0, 0]);
    root.add(body);
    P.spine = body;
    for (const s of [1, -1]) {
      const L = limb(body, [0.14 * s, 0.95, 0], 0.48, 0.5, 0.06, 0.05, skin, [-0.5, 0, 0]);
      L.lo.rotation.x = 0.9;
      L.end.add(mesh(G.box(0.1, 0.05, 0.22), skin, { p: [0, 0, 0.08], r: [-0.4, 0, 0] }));
      (P.legs = P.legs || []).push({ up: L.up, lo: L.lo, ph: s > 0 ? 0 : PI, base: -0.5, kb: 0.9 });
    }
    const torso = grp([0, 0.95, 0], [0.75, 0, 0]);
    body.add(torso);
    P.torso = torso;
    torso.add(mesh(G.sph(0.16, 12, 10), skin, { p: [0, 0.05, 0], s: [1.2, 0.8, 0.9] }));
    torso.add(mesh(G.cyl(0.06, 0.07, 0.5, 8), skin, { p: [0, 0.3, -0.04] }));
    for (let i = 0; i < 5; i++) torso.add(mesh(G.torus(0.2 - i * 0.012, 0.022, PI * 1.3, 5, 14), bone(), { p: [0, 0.3 + i * 0.075, 0.02], r: [PI / 2, 0, PI * 0.35 + PI], s: [1.15, 0.85, 1] }));
    torso.add(mesh(G.sph(0.17, 10, 8), M.basic("#0b0a0e"), { p: [0, 0.45, 0], s: [1, 1.3, 0.7] }));
    for (let i = 0; i < 6; i++) torso.add(mesh(G.cone(0.03, 0.09, 4), bone(), { p: [0, 0.18 + i * 0.09, -0.15], r: [-1.9, 0, 0] }));
    // Lumpen
    torso.add(mesh(G.cyl(0.18, 0.28, 0.4, 10, true), rag, { p: [0, -0.15, 0] }));
    // Arme bis zum Boden
    const sh = 0.72;
    for (const s of [1, -1]) {
      const A = limb(torso, [0.24 * s, sh, 0], 0.48, 0.5, 0.055, 0.045, skin, [0, 0, 0.15 * s]);
      claws(A.end, 3, 0.18, bone(), 0.4);
      A.end.add(mesh(G.sph(0.06, 8, 6), skin, { s: [1, 1.2, 1] }));
      P[s > 0 ? "armL" : "armR"] = A;
    }
    // Kopf mit herabhaengendem Kiefer
    const head = grp([0, 0.95, 0.08], [-0.8, 0, 0]);
    torso.add(head);
    P.head = head;
    head.add(mesh(R.headGeo(0.7, 0.4, 1.05), skin, { s: [0.95, 1, 1] }));
    for (const s of [1, -1]) head.add(mesh(G.sph(0.055, 8, 6), M.basic("#050407"), { p: [s * 0.07, 0.02, 0.15] }));
    eyes(head, [[0.07, 0.02, 0.18], [-0.07, 0.02, 0.18]], m.accent, 0.022);
    const jaw = grp([0, -0.08, 0.02]);
    head.add(jaw);
    jaw.add(mesh(G.box(0.16, 0.04, 0.16), skin, { p: [0, -0.04, 0.08] }));
    teeth(jaw, 6, -0.06, 0.06, -0.01, 0.15, 0.05, bone());
    teeth(head, 6, -0.06, 0.06, -0.09, 0.17, 0.045, bone(), true);
    P.jaw = jaw;
    P.jawOpen = 0.35;
    head.add(mesh(G.cyl(0.13, 0.2, 0.18, 10, true), rag, { p: [0, -0.04, -0.06], r: [0.3, 0, 0] }));
    root.add(R.haloSprite(m.accent, 1.2, 0.15, [0, 1.3, 0]));
    P.headY = 1.75;
  };

  // Schlund: ein Maul auf Beinen mit Zahnkranz und Tentakeln
  B.schlund = function (m, root, P) {
    const hide = M.pmat("scale", m.color);
    const body = grp();
    root.add(body);
    P.spine = body;
    body.add(mesh(G.sph(0.75, 22, 16), hide, { p: [0, 0.9, -0.1], s: [1.15, 0.9, 1.05] }));
    // Maul: oberer Schaedel klappt auf
    const top = grp([0, 1.0, 0.2]);
    body.add(top);
    top.add(mesh(G.cap(0.7, PI * 0.5), hide, { p: [0, 0, 0.05], s: [1.1, 0.75, 1.0] }));
    teeth(top, 9, -0.5, 0.5, -0.02, 0.62, 0.16, bone(), true);
    for (let i = 0; i < 5; i++) {
      const a = -0.6 + i * 0.3;
      top.add(mesh(G.sph(0.05, 8, 6), M.emis(m.accent, 1.4), { p: [Math.sin(a) * 0.45, 0.42 - Math.abs(a) * 0.1, Math.cos(a) * 0.3] }));
    }
    top.add(R.haloSprite(m.accent, 0.7, 0.4, [0, 0.45, 0.25]));
    spikes(top, [[0, 0.5, -0.3, -0.8], [0.3, 0.45, -0.3, -0.8, -0.4], [-0.3, 0.45, -0.3, -0.8, 0.4], [0, 0.35, -0.6, -1.4]], 0.3, bone());
    P.jaw = top;
    P.jawOpen = -0.55;
    P.jawSign = -1;
    // Rachen und unterer Zahnkranz
    body.add(mesh(G.sph(0.55, 16, 10), M.emis(R.shade(m.accent, 0.35), 0.6), { p: [0, 0.95, 0.3], s: [1, 0.5, 0.8] }));
    teeth(body, 9, -0.5, 0.5, 0.95, 0.75, 0.15, bone());
    body.add(mesh(G.cone(0.12, 0.6, 8), M.pmat("skin", R.mix(m.color, "#c03050", 0.5)), { p: [0, 0.98, 0.5], r: [1.4, 0, 0], s: [1.4, 1, 0.5] }));
    // Tentakel
    P.tentacles = [];
    for (const s of [1, -1]) {
      for (let k = 0; k < 2; k++) {
        const tg = grp([0.7 * s, 0.9 - k * 0.25, -0.1 - k * 0.2], [0, 0, -s * (0.9 + k * 0.4)]);
        tg.add(mesh(G.tube("tent", [[0, 0, 0], [0.05, 0.25, 0.05], [0, 0.5, 0.1], [-0.08, 0.7, 0.05], [-0.04, 0.85, 0]], 0.06, 16, 6), hide));
        tg.add(mesh(G.cone(0.04, 0.12, 5), bone(), { p: [-0.04, 0.9, 0] }));
        body.add(tg);
        P.tentacles.push({ g: tg, s, k });
      }
    }
    for (const [x, z] of [[0.45, 0.3], [-0.45, 0.3], [0.45, -0.45], [-0.45, -0.45]]) {
      body.add(mesh(G.capsule(0.13, 0.25, 8), hide, { p: [x, 0.25, z] }));
      const foot = grp([x, 0.06, z + 0.1]);
      body.add(foot);
      claws(foot, 3, 0.1, bone());
    }
    P.headY = 1.8;
  };

  // Nachtgoblin: klein, krumm, grosse Ohren, Krummklinge
  B.goblin = function (m, root, P) {
    const skin = M.pmat("skin", m.color);
    const leather = M.pmat("leather", "#3a2a1e");
    const body = grp();
    root.add(body);
    P.spine = body;
    for (const s of [1, -1]) {
      const L = limb(body, [0.11 * s, 0.6, 0], 0.3, 0.3, 0.06, 0.05, skin, [-0.45, 0, 0]);
      L.lo.rotation.x = 0.8;
      L.end.add(mesh(G.box(0.1, 0.05, 0.2), leather, { p: [0, 0, 0.06], r: [-0.35, 0, 0] }));
      (P.legs = P.legs || []).push({ up: L.up, lo: L.lo, ph: s > 0 ? 0 : PI, base: -0.45, kb: 0.8 });
    }
    const torso = grp([0, 0.6, 0], [0.35, 0, 0]);
    body.add(torso);
    P.torso = torso;
    torso.add(mesh(G.sph(0.22, 14, 10), skin, { p: [0, 0.22, 0], s: [1.1, 1.0, 0.85] }));
    torso.add(mesh(G.cyl(0.18, 0.24, 0.24, 10, true), M.pmat("leather", "#4a3424", { ds: true }), { p: [0, 0.0, 0] }));
    torso.add(mesh(G.box(0.05, 0.4, 0.03), leather, { p: [0, 0.22, 0.17], r: [0, 0, 0.6] }));
    torso.add(mesh(G.cap(0.12, PI * 0.5), M.pmat("metal", "#6a6258"), { p: [0.2, 0.38, 0], r: [0, 0, -0.5], s: [1.2, 0.7, 1.1] }));
    for (const s of [1, -1]) {
      const A = limb(torso, [0.23 * s, 0.36, 0], 0.26, 0.26, 0.045, 0.04, skin, [-0.3, 0, 0.25 * s]);
      A.end.add(mesh(G.sph(0.05, 8, 6), skin));
      claws(A.end, 3, 0.07, bone(), 0.5);
      P[s > 0 ? "armL" : "armR"] = A;
    }
    // Krummklinge rechts
    const blade = grp([0, -0.02, 0.02], [PI / 2, 0, 0]);
    blade.add(mesh(G.cyl(0.02, 0.022, 0.12, 6), leather));
    blade.add(mesh(G.ext("sickle", R.SH.sickle, 0.01, 0.008), M.pmat("metal", "#8a8f96"), { p: [0, 0.06, 0], s: 1.3 }));
    P.armR.end.add(blade);
    // Kopf
    const head = grp([0, 0.6, 0.06], [-0.3, 0, 0]);
    torso.add(head);
    P.head = head;
    head.add(mesh(R.headGeo(1.5, 1.3, 0.9), skin, { s: [1.15, 0.95, 1] }));
    head.add(mesh(G.cone(0.04, 0.2, 6), skin, { p: [0, -0.02, 0.24], r: [1.2, 0, 0] }));
    for (const s of [1, -1]) head.add(mesh(G.cone(0.08, 0.42, 5), skin, { p: [s * 0.27, 0.05, -0.02], r: [0.3, 0, -s * 1.3], s: [1, 1, 0.35] }));
    eyes(head, [[0.08, 0.04, 0.17], [-0.08, 0.04, 0.17]], m.accent, 0.028);
    head.add(mesh(G.box(0.22, 0.03, 0.06), M.basic("#0b0a0e"), { p: [0, -0.1, 0.16] }));
    teeth(head, 7, -0.09, 0.09, -0.095, 0.185, 0.03, bone(), true);
    head.add(mesh(G.box(0.24, 0.06, 0.2), M.pmat("skin", R.shade(m.color, 0.85)), { p: [0, 0.08, 0.06], r: [-0.3, 0, 0] }));
    P.headY = 1.25;
  };

  // Bestie / Wolf: massiger Nacken, Maehne, Fangzaehne
  B.wolf = function (m, root, P) {
    const fur = M.pmat("fur", m.color);
    const dark = M.pmat("fur", R.shade(m.color, 0.6));
    const body = grp();
    root.add(body);
    P.spine = body;
    body.add(mesh(G.capsule(0.27, 0.8, 12), fur, { p: [0, 0.95, -0.15], r: [PI / 2 - 0.2, 0, 0], s: [0.95, 1, 1] }));
    body.add(mesh(G.sph(0.4, 16, 12), fur, { p: [0, 1.1, 0.35], s: [0.95, 1.05, 1.05] }));
    // Maehne
    for (let i = 0; i < 9; i++) {
      const z = 0.45 - i * 0.12;
      body.add(mesh(G.cone(0.09, 0.4 - i * 0.025, 5), dark, { p: [0, 1.48 - i * 0.05, z], r: [-1.1, 0, 0] }));
      for (const s of [1, -1]) if (i < 4) body.add(mesh(G.cone(0.07, 0.28, 5), dark, { p: [s * 0.3, 1.25 - i * 0.03, z], r: [-0.6, 0, -s * 0.8] }));
    }
    P.legs = [];
    const legAt = [[0.24, 0.95, 0.4, 0], [-0.24, 0.95, 0.4, PI], [0.22, 0.9, -0.6, PI], [-0.22, 0.9, -0.6, 0]];
    for (const [x, y, z, ph] of legAt) {
      const front = z > 0;
      const L = limb(body, [x, y, z], 0.45, 0.45, 0.085, 0.06, fur, [front ? 0.1 : 0.5, 0, 0]);
      L.lo.rotation.x = front ? -0.2 : -0.9;
      L.end.add(mesh(G.sph(0.09, 8, 6), dark, { p: [0, 0, 0.05], s: [1, 0.6, 1.4] }));
      claws(L.end, 3, 0.08, bone(), 0.4);
      P.legs.push({ up: L.up, lo: L.lo, ph, base: front ? 0.1 : 0.5, kb: front ? -0.2 : -0.9, quad: true });
    }
    // Kopf mit Schnauze und Kiefer
    const head = grp([0, 1.25, 0.8], [0.15, 0, 0]);
    body.add(head);
    P.head = head;
    head.add(mesh(G.sph(0.2, 14, 10), fur, { s: [1.1, 0.95, 1.05] }));
    head.add(mesh(G.cyl(0.08, 0.15, 0.42, 6), fur, { p: [0, -0.05, 0.3], r: [PI / 2, 0, 0], s: [1.1, 1, 0.7] }));
    head.add(mesh(G.sph(0.045, 8, 6), M.basic("#0b0a0e"), { p: [0, -0.02, 0.52] }));
    for (const s of [1, -1]) {
      head.add(mesh(G.cone(0.08, 0.28, 4), fur, { p: [s * 0.12, 0.2, -0.06], r: [-0.5, 0, -s * 0.3] }));
      head.add(mesh(G.box(0.12, 0.035, 0.06), M.pmat("fur", R.shade(m.color, 0.35)), { p: [s * 0.08, 0.1, 0.15], r: [0, 0, s * 0.4] }));
    }
    eyes(head, [[0.085, 0.06, 0.17], [-0.085, 0.06, 0.17]], m.accent, 0.03);
    teeth(head, 2, -0.065, 0.065, -0.13, 0.42, 0.1, bone(), true);
    teeth(head, 4, -0.06, 0.06, -0.13, 0.3, 0.05, bone(), true);
    const jaw = grp([0, -0.12, 0.06]);
    head.add(jaw);
    jaw.add(mesh(G.box(0.15, 0.05, 0.36), fur, { p: [0, -0.03, 0.2] }));
    jaw.add(mesh(G.box(0.12, 0.02, 0.3), M.pmat("skin", "#7a2a2a"), { p: [0, 0.0, 0.2] }));
    teeth(jaw, 2, -0.055, 0.055, 0.0, 0.34, 0.09, bone());
    P.jaw = jaw;
    P.jawOpen = 0.5;
    // Schwanz
    const tail = grp([0, 1.05, -0.65]);
    for (let i = 0; i < 4; i++) tail.add(mesh(G.sph(0.11 - i * 0.015, 8, 6), fur, { p: [0, -i * 0.08, -i * 0.12], s: [1, 1, 1.5] }));
    body.add(tail);
    P.tail = tail;
    P.headY = 1.75;
  };

  // Golem: Runenstein, gluehende Risse, schwebende Felsen
  B.golem = function (m, root, P) {
    const st = M.pmat("stone", m.color, { flat: true });
    const rune = M.emis(m.accent, 1.3);
    const body = grp();
    root.add(body);
    P.spine = body;
    for (const s of [1, -1]) {
      const L = limb(body, [0.32 * s, 1.0, 0], 0.5, 0.5, 0.18, 0.2, st, [-0.15, 0, 0]);
      L.lo.rotation.x = 0.2;
      L.end.add(mesh(G.dodeca(0.24), st, { p: [0, 0.02, 0.06], s: [1, 0.6, 1.3] }));
      (P.legs = P.legs || []).push({ up: L.up, lo: L.lo, ph: s > 0 ? 0 : PI, base: -0.15, kb: 0.2, heavy: true });
    }
    const torso = grp([0, 1.0, 0], [0.18, 0, 0]);
    body.add(torso);
    P.torso = torso;
    torso.add(mesh(G.dodeca(0.55), st, { p: [0, 0.75, 0], s: [1.35, 1.05, 0.95] }));
    torso.add(mesh(G.dodeca(0.32), st, { p: [0, 0.2, 0], s: [1.2, 0.9, 0.9] }));
    torso.add(mesh(G.octa(0.16), rune, { p: [0, 0.8, 0.48], s: [1, 1.4, 0.6] }));
    torso.add(R.haloSprite(m.accent, 1.1, 0.6, [0, 0.8, 0.55]));
    for (let i = 0; i < 6; i++) torso.add(mesh(G.box(0.03, 0.18, 0.02), rune, { p: [Math.cos(i) * 0.4, 0.55 + Math.sin(i * 2) * 0.3, 0.42 - Math.abs(Math.cos(i)) * 0.15], r: [0, Math.cos(i) * 0.6, i] }));
    // Schultern mit Felsen
    for (const s of [1, -1]) {
      torso.add(mesh(G.dodeca(0.3), st, { p: [s * 0.72, 1.05, 0], s: [1.2, 0.9, 1.1] }));
      torso.add(mesh(G.cone(0.1, 0.4, 5), st, { p: [s * 0.78, 1.32, -0.05], r: [0, 0, -s * 0.3] }));
      const A = limb(torso, [0.8 * s, 0.95, 0], 0.6, 0.6, 0.18, 0.2, st, [0, 0, 0.15 * s]);
      A.end.add(mesh(G.dodeca(0.32), st, { s: [1.1, 1, 1] }));
      A.end.add(mesh(G.box(0.04, 0.14, 0.02), rune, { p: [0, 0, 0.3] }));
      P[s > 0 ? "armL" : "armR"] = A;
    }
    const head = grp([0, 1.2, 0.18]);
    torso.add(head);
    P.head = head;
    head.add(mesh(G.dodeca(0.24), st, { s: [1.2, 0.9, 1] }));
    head.add(mesh(G.box(0.26, 0.04, 0.04), rune, { p: [0, 0.02, 0.22] }));
    head.add(R.haloSprite(m.accent, 0.6, 0.7, [0, 0.02, 0.25]));
    // Schwebende Brocken
    const orbit = grp([0, 1.7, 0]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2;
      orbit.add(mesh(G.dodeca(0.1 + (i % 2) * 0.05), st, { p: [Math.cos(a) * 1.2, Math.sin(a * 2) * 0.2, Math.sin(a) * 0.9] }));
    }
    body.add(orbit);
    P.orbit = orbit;
    P.headY = 2.55;
  };

  // Flugbestie: Hautfluegel mit Fingerknochen, Fangzaehne, Krallen
  function batWing(color, s) {
    const g = grp();
    const memb = M.pmat("skin", color, { ds: true });
    const pts = [[0, 0], [0.5, 0.35], [1.2, 0.5], [1.65, 0.2], ["q", 1.35, 0.0, 1.3, -0.35], ["q", 1.05, -0.1, 0.85, -0.45], ["q", 0.6, -0.15, 0.4, -0.45], ["q", 0.2, -0.2, 0, -0.3]];
    const geo = G.geo("batwing", () => new T.ShapeGeometry(R.shapeOf(pts), 6));
    const w = new T.Mesh(geo, memb);
    w.castShadow = true;
    g.add(w);
    const fing = M.pmat("bone", R.shade(color, 0.7));
    for (const [x, y] of [[1.65, 0.2], [1.3, -0.35], [0.85, -0.45], [0.4, -0.45]]) {
      const len = Math.hypot(x - 0.5, y - 0.35);
      const f = mesh(G.cyl(0.018, 0.012, len, 5), fing, { p: [(x + 0.5) / 2, (y + 0.35) / 2, 0.01] });
      f.rotation.z = Math.atan2(y - 0.35, x - 0.5) - PI / 2;
      g.add(f);
    }
    g.add(mesh(G.cyl(0.03, 0.02, 0.62, 6), fing, { p: [0.25, 0.18, 0.01], r: [0, 0, Math.atan2(0.35, 0.5) - PI / 2] }));
    if (s < 0) g.scale.x = -1;
    return g;
  }
  B.fledermaus = function (m, root, P) {
    const fur = M.pmat("fur", m.color);
    const body = grp([0, 0.6, 0]);
    root.add(body);
    P.hover = body;
    P.hoverY = 0.6;
    body.add(mesh(G.sph(0.32, 14, 10), fur, { p: [0, 0.95, 0], s: [1, 1.3, 0.9] }));
    body.add(mesh(G.sph(0.22, 12, 8), M.pmat("fur", R.shade(m.color, 1.3)), { p: [0, 0.95, 0.12], s: [1, 1.2, 0.7] }));
    const head = grp([0, 1.42, 0.08]);
    body.add(head);
    P.head = head;
    head.add(mesh(G.sph(0.2, 12, 10), fur, { s: [1.1, 0.95, 1] }));
    head.add(mesh(G.cone(0.1, 0.16, 6), fur, { p: [0, -0.04, 0.2], r: [1.5, 0, 0] }));
    for (const s of [1, -1]) {
      head.add(mesh(G.cone(0.1, 0.36, 4), fur, { p: [s * 0.13, 0.25, -0.02], r: [0, 0, -s * 0.35], s: [1, 1, 0.4] }));
    }
    eyes(head, [[0.08, 0.05, 0.16], [-0.08, 0.05, 0.16]], m.accent, 0.03);
    teeth(head, 2, -0.05, 0.05, -0.1, 0.18, 0.09, bone(), true);
    P.wings = [];
    for (const s of [1, -1]) {
      const wg = grp([0.22 * s, 1.1, -0.05]);
      wg.add(batWing(m.color, s));
      body.add(wg);
      P.wings.push({ g: wg, s });
    }
    for (const s of [1, -1]) {
      const L = limb(body, [0.12 * s, 0.7, 0], 0.22, 0.24, 0.05, 0.035, fur, [0.3, 0, 0]);
      L.lo.rotation.x = -0.6;
      claws(L.end, 3, 0.12, bone(), 0.5);
    }
    const tail = grp([0, 0.7, -0.1]);
    tail.add(mesh(G.tube("battail", [[0, 0, 0], [0, -0.2, -0.15], [0, -0.35, -0.1], [0, -0.5, 0.05]], 0.03, 12, 5), fur));
    tail.add(mesh(G.cone(0.05, 0.12, 4), bone(), { p: [0, -0.55, 0.07], r: [PI, 0, 0] }));
    body.add(tail);
    P.tail = tail;
    P.headY = 2.35;
  };

  // Sporenwesen: verwachsener Pilz mit leuchtenden Flecken und Wurzelbeinen
  B.pilz = function (m, root, P) {
    const stem = M.pmat("bark", R.mix(m.color, "#d9c8a8", 0.55));
    const capM = M.pmat("skin", m.color);
    const glowM = M.emis(m.accent, 1.2);
    const body = grp();
    root.add(body);
    P.spine = body;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      body.add(mesh(G.tube("root", [[0, 0.5, 0], [0.2, 0.3, 0.05], [0.4, 0.08, 0], [0.55, 0.0, -0.05]], 0.06, 10, 5), stem, { r: [0, a, 0] }));
    }
    body.add(mesh(G.lathe("pilzstem", [[0.0, 0.3], [0.32, 0.35], [0.36, 0.7], [0.3, 1.1], [0.26, 1.4], [0.0, 1.45]], 16), stem));
    // Maul im Stiel
    body.add(mesh(G.box(0.3, 0.08, 0.1), M.basic("#0b0a0e"), { p: [0, 0.82, 0.31] }));
    teeth(body, 6, -0.12, 0.12, 0.86, 0.34, 0.06, bone(), true);
    teeth(body, 5, -0.1, 0.1, 0.78, 0.34, 0.05, bone());
    eyes(body, [[0.12, 1.12, 0.27], [-0.12, 1.12, 0.27], [0, 1.22, 0.26]], m.accent, 0.03);
    const capG = grp([0, 1.42, 0]);
    body.add(capG);
    capG.add(mesh(G.lathe("pilzcap", [[0.0, 0.45], [0.35, 0.42], [0.7, 0.25], [0.95, 0.0], [0.9, -0.08], [0.5, -0.06], [0.0, -0.02]], 22), capM, { s: [1, 1, 1] }));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * PI * 2;
      capG.add(mesh(G.box(0.02, 0.06, 0.6), M.pmat("plain", R.shade(m.color, 0.5)), { p: [Math.cos(a) * 0.45, -0.07, Math.sin(a) * 0.45], r: [0, -a + PI / 2, 0] }));
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2 + 0.3;
      const rr = i % 3 === 0 ? 0.25 : 0.6;
      const y = rr > 0.5 ? 0.22 : 0.4;
      capG.add(mesh(G.sph(0.06 + (i % 2) * 0.03, 8, 6), glowM, { p: [Math.cos(a) * rr, y, Math.sin(a) * rr], s: [1, 0.5, 1] }));
    }
    capG.add(R.haloSprite(m.accent, 1.6, 0.25, [0, 0.3, 0]));
    P.cap = capG;
    for (const s of [1, -1]) {
      const A = { up: grp([0.3 * s, 0.95, 0], [0, 0, -s * 0.6]) };
      A.up.add(mesh(G.tube("parm", [[0, 0, 0], [0.12 * s, -0.15, 0.05], [0.2 * s, -0.4, 0.1], [0.18 * s, -0.55, 0.12]], 0.045, 10, 5), stem));
      const hnd = grp([0.18 * s, -0.55, 0.12]);
      A.up.add(hnd);
      claws(hnd, 3, 0.1, stem);
      body.add(A.up);
      P[s > 0 ? "armL" : "armR"] = A;
    }
    // Sporen
    const spores = grp([0, 1.3, 0]);
    for (let i = 0; i < 10; i++) {
      const sp = R.haloSprite(m.accent, 0.12, 0.8, [Math.cos(i * 2.4) * 0.9, (i % 4) * 0.25, Math.sin(i * 2.4) * 0.9]);
      spores.add(sp);
    }
    body.add(spores);
    P.orbit = spores;
    P.headY = 2.0;
  };

  // Riesenspinne: acht gegliederte Beine, Augenhaufen, Giftklauen
  B.spinne = function (m, root, P) {
    const ch = M.pmat("fur", m.color);
    const shell = M.pmat("scale", R.shade(m.color, 0.85));
    const body = grp();
    root.add(body);
    P.spine = body;
    body.add(mesh(G.sph(0.65, 18, 14), ch, { p: [0, 0.9, -0.75], s: [1, 0.85, 1.2] }));
    for (let i = 0; i < 3; i++) body.add(mesh(G.box(0.5 - i * 0.12, 0.04, 0.08), M.emis(m.accent, 0.9), { p: [0, 1.42 - i * 0.03, -0.55 - i * 0.28], r: [0.35 + i * 0.25, 0, 0] }));
    body.add(mesh(G.sph(0.36, 14, 10), shell, { p: [0, 0.8, 0.12], s: [1, 0.75, 1.1] }));
    const head = grp([0, 0.82, 0.45]);
    body.add(head);
    P.head = head;
    head.add(mesh(G.sph(0.22, 12, 10), shell, { s: [1.1, 0.8, 0.9] }));
    const ep = [];
    for (let i = 0; i < 8; i++) ep.push([(i % 4 - 1.5) * 0.07, 0.1 + Math.floor(i / 4) * 0.06, 0.17 - Math.abs(i % 4 - 1.5) * 0.02]);
    eyes(head, ep, m.accent, 0.022);
    const jaw = grp([0, -0.06, 0.15]);
    head.add(jaw);
    for (const s of [1, -1]) {
      jaw.add(mesh(G.capsule(0.04, 0.12, 6), shell, { p: [s * 0.07, -0.06, 0.04], r: [0.3, 0, 0] }));
      jaw.add(mesh(G.cone(0.025, 0.14, 5), bone(), { p: [s * 0.07, -0.17, 0.07], r: [PI - 0.2, 0, -s * 0.4] }));
    }
    P.jaw = jaw;
    P.jawOpen = -0.4;
    P.legs = [];
    for (let i = 0; i < 4; i++) {
      for (const s of [1, -1]) {
        const base = grp([0.28 * s, 0.85, 0.32 - i * 0.18], [0, (i - 1.5) * 0.4 * s, 0]);
        const up = grp([0, 0, 0], [0, 0, s * 2.25]);
        base.add(up);
        up.add(mesh(G.capsule(0.05, 0.55, 6), ch, { p: [0, -0.32, 0] }));
        const lo = grp([0, -0.62, 0], [0, 0, -s * 1.85]);
        up.add(lo);
        lo.add(mesh(G.capsule(0.035, 0.75, 6), ch, { p: [0, -0.4, 0] }));
        lo.add(mesh(G.cone(0.03, 0.12, 4), bone(), { p: [0, -0.82, 0], r: [PI, 0, 0] }));
        body.add(base);
        P.legs.push({ up: base, lo, ph: i * 1.3 + (s > 0 ? 0 : PI), spider: true, s, rz: -s * 1.85 });
      }
    }
    P.headY = 1.6;
  };

  // Drache: langer Hals, Hoerner, Hautfluegel, Ruckenstacheln, gluehender Rachen
  B.drache = function (m, root, P) {
    const sc = M.pmat("scale", m.color);
    const belly = M.pmat("scale", R.mix(m.color, "#e8d8b0", 0.45));
    const horn = M.pmat("bone", "#3a3036");
    const body = grp();
    root.add(body);
    P.spine = body;
    body.add(mesh(G.sph(0.75, 18, 14), sc, { p: [0, 1.15, -0.3], s: [1, 0.9, 1.4] }));
    body.add(mesh(G.sph(0.55, 14, 10), belly, { p: [0, 1.0, 0.15], s: [0.95, 0.9, 0.8] }));
    P.legs = [];
    for (const [x, z, ph] of [[0.5, 0.25, 0], [-0.5, 0.25, PI], [0.55, -0.85, PI], [-0.55, -0.85, 0]]) {
      const front = z > 0;
      const L = limb(body, [x, 1.0, z], 0.5, 0.5, 0.21, 0.16, sc, [front ? -0.2 : 0.4, 0, 0]);
      L.lo.rotation.x = front ? 0.3 : -0.6;
      L.end.add(mesh(G.sph(0.14, 8, 6), sc, { p: [0, 0, 0.06], s: [1, 0.55, 1.4] }));
      claws(L.end, 3, 0.14, horn, 0.4);
      P.legs.push({ up: L.up, lo: L.lo, ph, base: front ? -0.2 : 0.4, kb: front ? 0.3 : -0.6, heavy: true, quad: true });
    }
    // Hals
    const neck = grp([0, 1.45, 0.45]);
    body.add(neck);
    P.neck = neck;
    const npts = [[0, -0.1, -0.15], [0, 0.3, 0.12], [0, 0.62, 0.3], [0, 0.85, 0.5], [0, 0.95, 0.6]];
    neck.add(mesh(G.tube("dneck2", npts, 0.25, 20, 10), sc));
    neck.add(mesh(G.sph(0.3, 12, 10), sc, { p: [0, -0.05, -0.05] }));
    for (let i = 0; i < 4; i++) neck.add(mesh(G.cone(0.05, 0.2, 4), horn, { p: [0, npts[i][1] + 0.15, npts[i][2] - 0.17], r: [-0.9, 0, 0] }));
    const head = grp([0, 1.0, 0.68]);
    neck.add(head);
    P.head = head;
    head.add(mesh(G.sph(0.33, 14, 10), sc, { s: [1, 0.8, 1.15] }));
    head.add(mesh(G.cyl(0.13, 0.22, 0.5, 7), sc, { p: [0, -0.02, 0.35], r: [PI / 2, 0, 0], s: [1.1, 1, 0.7] }));
    for (const s of [1, -1]) {
      head.add(mesh(G.tube("dhorn" + s, [[0, 0, 0], [0.06 * s, 0.12, -0.15], [0.1 * s, 0.18, -0.38], [0.08 * s, 0.14, -0.58]], 0.045, 12, 6), horn, { p: [s * 0.14, 0.15, -0.05] }));
      head.add(mesh(G.cone(0.04, 0.2, 4), horn, { p: [s * 0.24, -0.04, 0.0], r: [0, 0, -s * 1.3] }));
    }
    eyes(head, [[0.13, 0.1, 0.22], [-0.13, 0.1, 0.22]], m.accent, 0.035);
    teeth(head, 6, -0.12, 0.12, -0.12, 0.45, 0.07, bone(), true);
    const jaw = grp([0, -0.12, 0.1]);
    head.add(jaw);
    jaw.add(mesh(G.box(0.24, 0.07, 0.48), sc, { p: [0, -0.04, 0.25] }));
    teeth(jaw, 6, -0.1, 0.1, 0.0, 0.42, 0.06, bone());
    jaw.add(mesh(G.sph(0.08, 8, 6), M.emis(m.accent, 1.4), { p: [0, 0.03, 0.2] }));
    P.jaw = jaw;
    P.jawOpen = 0.5;
    head.add(R.haloSprite(m.accent, 0.6, 0.5, [0, -0.1, 0.4]));
    // Fluegel
    P.wings = [];
    for (const s of [1, -1]) {
      const wg = grp([0.5 * s, 1.6, -0.3], [0, 0, 0]);
      const w = batWing(R.shade(m.color, 0.7), s);
      w.scale.set(s * 1.6, 1.6, 1.6);
      w.rotation.y = -s * 0.3;
      wg.add(w);
      body.add(wg);
      P.wings.push({ g: wg, s, slow: true });
    }
    // Rueckenstacheln und Schwanz
    for (let i = 0; i < 6; i++) body.add(mesh(G.cone(0.07, 0.28, 4), horn, { p: [0, 1.85 - i * 0.07, 0.2 - i * 0.25], r: [-0.5, 0, 0] }));
    const tail = grp([0, 1.0, -1.25]);
    for (let i = 0; i < 6; i++) tail.add(mesh(G.sph(0.22 - i * 0.03, 10, 8), sc, { p: [0, -i * 0.06, -i * 0.27] }));
    tail.add(mesh(G.ext("leaf", R.SH.leaf, 0.04, 0.02), horn, { p: [0, -0.36, -1.75], r: [PI / 2, 0, 0], s: 0.45 }));
    body.add(tail);
    P.tail = tail;
    P.headY = 3.0;
    P.big = true;
  };

  // Schemen: zerrissene Robe ohne Koerper, nur gluehende Augen in der Kapuze
  B.schemen = function (m, root, P) {
    const cloth = M.pmat("cloth", m.color, { op: 0.82, ds: true, e: m.accent, ei: 0.12 });
    const body = grp([0, 0.4, 0]);
    root.add(body);
    P.hover = body;
    P.hoverY = 0.4;
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const y = 1.6 - i * 0.17;
      pts.push([0.16 + i * 0.045 + (i === 10 ? 0.05 : 0), y]);
    }
    body.add(mesh(G.lathe("wraith", pts.reverse(), 18), cloth));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      const tg = mesh(G.cone(0.08, 0.5, 4), cloth, { p: [Math.cos(a) * 0.55, -0.05, Math.sin(a) * 0.55], r: [PI, 0, 0] });
      tg.userData.flick = i;
      body.add(tg);
    }
    const head = grp([0, 1.75, 0.05]);
    body.add(head);
    P.head = head;
    head.add(mesh(G.cap(0.3, PI * 0.62), cloth, { r: [-1.0, 0, 0], s: [1, 1.15, 1.2] }));
    head.add(mesh(G.cone(0.14, 0.5, 6), cloth, { p: [0, 0.12, -0.3], r: [-2.3, 0, 0] }));
    head.add(mesh(G.sph(0.2, 12, 10), M.basic("#020104"), { p: [0, -0.06, 0.1], s: [1, 1.15, 0.8] }));
    eyes(head, [[0.075, -0.02, 0.27], [-0.075, -0.02, 0.27]], m.accent, 0.03);
    for (const s of [1, -1]) {
      const A = limb(body, [0.3 * s, 1.45, 0.05], 0.5, 0.5, 0.08, 0.06, cloth, [-0.5, 0, 0.35 * s]);
      A.up.add(mesh(G.cyl(0.08, 0.16, 0.45, 8, true), cloth, { p: [0, -0.3, 0] }));
      A.lo.rotation.x = -0.5;
      A.end.add(mesh(G.sph(0.06, 8, 6), M.pmat("bone", R.mix(m.color, "#ffffff", 0.3))));
      claws(A.end, 4, 0.2, M.pmat("bone", "#d9d2c5"), 0.35);
      P[s > 0 ? "armL" : "armR"] = A;
    }
    body.add(R.haloSprite(m.accent, 2.2, 0.18, [0, 1.0, 0]));
    P.headY = 2.5;
  };

  // Panzerkrebs: Stachelpanzer, eine riesige Schere
  B.krebs = function (m, root, P) {
    const sh = M.pmat("scale", m.color);
    const dark = M.pmat("scale", R.shade(m.color, 0.65));
    const body = grp();
    root.add(body);
    P.spine = body;
    body.add(mesh(G.sph(0.62, 18, 12), sh, { p: [0, 0.9, -0.1], s: [1.15, 0.62, 0.95] }));
    body.add(mesh(G.sph(0.5, 14, 10), dark, { p: [0, 0.72, 0.0], s: [1.3, 0.4, 0.95] }));
    spikes(body, [[0, 1.08, 0], [0.4, 1.0, -0.1, 0, -0.4], [-0.4, 1.0, -0.1, 0, 0.4], [0.7, 0.9, 0.1, 0, -0.9], [-0.7, 0.9, 0.1, 0, 0.9], [0.2, 1.0, -0.4, -0.5, -0.2], [-0.2, 1.0, -0.4, -0.5, 0.2]], 0.25, M.pmat("bone", R.shade(m.accent, 0.8)));
    for (const s of [1, -1]) {
      const stalk = grp([0.2 * s, 0.95, 0.5]);
      stalk.add(mesh(G.cyl(0.03, 0.035, 0.3, 6), dark, { p: [0, 0.12, 0] }));
      body.add(stalk);
      eyes(stalk, [[0, 0.3, 0]], m.accent, 0.045);
    }
    teeth(body, 4, -0.12, 0.12, 0.62, 0.7, 0.08, bone(), true);
    P.legs = [];
    for (let i = 0; i < 3; i++) {
      for (const s of [1, -1]) {
        const base = grp([0.6 * s, 0.75, 0.2 - i * 0.28], [0, (i - 1) * 0.3 * s, 0]);
        const up = grp([0, 0, 0], [0, 0, s * 2.0]);
        base.add(up);
        up.add(mesh(G.capsule(0.055, 0.3, 6), sh, { p: [0, -0.2, 0] }));
        const lo = grp([0, -0.4, 0], [0, 0, -s * 1.6]);
        up.add(lo);
        lo.add(mesh(G.cone(0.05, 0.55, 6), dark, { p: [0, -0.27, 0], r: [PI, 0, 0] }));
        body.add(base);
        P.legs.push({ up: base, lo, ph: i * 1.6 + (s > 0 ? 0 : PI), spider: true, s, rz: -s * 1.6 });
      }
    }
    for (const s of [1, -1]) {
      const big = s < 0;
      const k = big ? 1.4 : 0.85;
      const arm = grp([0.5 * s, 0.85, 0.5], [0, -s * 0.35, 0]);
      arm.add(mesh(G.capsule(0.08 * k, 0.3 * k, 6), sh, { p: [0, 0.07 * k, 0.16 * k], r: [1.15, 0, 0] }));
      const claw = grp([0, 0.15 * k, 0.4 * k]);
      arm.add(claw);
      claw.add(mesh(G.sph(0.22 * k, 12, 10), M.pmat("scale", R.shade(m.color, 1.15)), { s: [0.9, 0.75, 1.25] }));
      claw.add(mesh(G.cone(0.03, 0.1, 4), M.pmat("bone", R.shade(m.accent, 0.8)), { p: [0, 0.18 * k, 0], r: [-0.4, 0, 0] }));
      claw.add(mesh(G.cone(0.1 * k, 0.4 * k, 6), dark, { p: [0, 0.06 * k, 0.32 * k], r: [1.45, 0, 0] }));
      const pin = grp([0, -0.05 * k, 0.12 * k]);
      pin.add(mesh(G.cone(0.08 * k, 0.36 * k, 6), dark, { p: [0, -0.04 * k, 0.18 * k], r: [1.8, 0, 0] }));
      claw.add(pin);
      body.add(arm);
      P[s > 0 ? "armL" : "armR"] = { up: arm };
      if (big) P.pincer = pin;
    }
    P.headY = 1.5;
  };

  // Todesritter: untoter Ritter, gebaut aus dem Heldenbausatz
  B.todesritter = function (m, root, P) {
    const realmDef = { key: "tod", style: "midgard", name: "Tod", color: R.shade(m.color, 0.9), dark: "#0b0a0e", accent: m.accent, metal: m.color, trim: "#5a5f6a" };
    const hero = R.buildHero({
      race: "nordmann",
      cls: "sturmhuene",
      gender: "m",
      realmDef,
      undead: true,
      look: { skin: "#4a4f58", hair: "#14121c", hairStyle: 4, beard: 0, eyes: m.accent, tattoo: "keine" },
      gear: {
        helm: { base: "helm", tint: m.color, rarity: "episch", style: 2 },
        ruestung: { base: "harnisch", tint: m.color, rarity: "episch", style: 2 },
        umhang: { base: "umhang", tint: "#14121c", rarity: "selten", style: 0 },
        handschuhe: { base: "handschuhe", tint: R.shade(m.color, 0.85) },
        stiefel: { base: "stiefel", tint: R.shade(m.color, 0.7), rarity: "selten" },
        waffe: { base: "schwert", tint: "#2a2a30", rarity: "episch", style: 2 },
      },
    });
    root.add(hero.obj);
    hero.obj.add(R.haloSprite(m.accent, 1.6, 0.2, [0, 1.4, 0]));
    P.inner = hero;
    P.headY = hero.headY + 0.35;
  };

  // Troll: riesig, gebeugt, lange Arme, Hauer, Knueppel
  B.troll = function (m, root, P) {
    const skin = M.pmat("skin", m.color);
    const moss = M.pmat("fur", R.mix(m.color, "#3f5a2a", 0.6));
    const body = grp();
    root.add(body);
    P.spine = body;
    for (const s of [1, -1]) {
      const L = limb(body, [0.3 * s, 1.0, 0], 0.5, 0.5, 0.16, 0.13, skin, [-0.35, 0, 0]);
      L.lo.rotation.x = 0.5;
      L.end.add(mesh(G.sph(0.16, 10, 8), skin, { p: [0, 0, 0.1], s: [1, 0.5, 1.5] }));
      claws(L.end, 3, 0.08, bone(), 0.5);
      (P.legs = P.legs || []).push({ up: L.up, lo: L.lo, ph: s > 0 ? 0 : PI, base: -0.35, kb: 0.5, heavy: true });
    }
    const torso = grp([0, 1.0, 0], [0.5, 0, 0]);
    body.add(torso);
    P.torso = torso;
    torso.add(mesh(G.sph(0.42, 16, 12), skin, { p: [0, 0.25, 0.05], s: [1.15, 0.9, 1] }));
    torso.add(mesh(G.sph(0.55, 16, 12), skin, { p: [0, 0.8, -0.05], s: [1.3, 0.85, 0.95] }));
    torso.add(mesh(G.sph(0.4, 12, 8), moss, { p: [0, 1.05, -0.2], s: [1.4, 0.6, 1] }));
    torso.add(mesh(G.cyl(0.4, 0.5, 0.35, 12, true), M.pmat("leather", "#3a2a1e", { ds: true }), { p: [0, 0.05, 0] }));
    for (let i = 0; i < 5; i++) torso.add(mesh(G.cone(0.06, 0.25, 4), M.pmat("hair", "#1f1a14"), { p: [0, 1.15 - i * 0.05, -0.35 - i * 0.07], r: [-1.2, 0, 0] }));
    for (const s of [1, -1]) {
      const A = limb(torso, [0.68 * s, 0.95, 0], 0.62, 0.62, 0.14, 0.13, skin, [0, 0, 0.12 * s]);
      A.end.add(mesh(G.sph(0.17, 10, 8), skin, { s: [1, 1.1, 1.1] }));
      claws(A.end, 4, 0.12, bone(), 0.35);
      P[s > 0 ? "armL" : "armR"] = A;
    }
    // Knueppel
    const club = grp([0, -0.05, 0.05], [PI / 2, 0, 0]);
    club.add(mesh(G.cyl(0.07, 0.15, 1.1, 8), M.pmat("wood", "#5a3a24"), { p: [0, 0.45, 0] }));
    for (let i = 0; i < 5; i++) club.add(mesh(G.cone(0.03, 0.14, 4), M.pmat("metal", "#8a8f96"), { p: [Math.cos(i * 2) * 0.14, 0.75 + i * 0.05, Math.sin(i * 2) * 0.14], r: [Math.sin(i * 2) * 1.5, 0, -Math.cos(i * 2) * 1.5] }));
    P.armR.end.add(club);
    const head = grp([0, 1.15, 0.38], [-0.5, 0, 0]);
    torso.add(head);
    P.head = head;
    head.add(mesh(R.headGeo(1.8, 1.8, 0.95), skin, { s: [1.25, 1.1, 1.2] }));
    head.add(mesh(G.cone(0.07, 0.2, 6), skin, { p: [0, 0.0, 0.26], r: [1.3, 0, 0] }));
    head.add(mesh(G.box(0.36, 0.06, 0.12), skin, { p: [0, 0.1, 0.18] }));
    for (const s of [1, -1]) {
      head.add(mesh(G.cone(0.035, 0.16, 6), bone(), { p: [s * 0.1, -0.12, 0.22], r: [-0.3, 0, s * 0.2] }));
      head.add(mesh(G.cone(0.06, 0.3, 5), skin, { p: [s * 0.27, 0.05, -0.02], r: [0.2, 0, -s * 1.3], s: [1, 1, 0.4] }));
    }
    eyes(head, [[0.08, 0.05, 0.21], [-0.08, 0.05, 0.21]], m.accent, 0.025);
    P.headY = 2.65;
  };

  // Baumhirte: Rinde, Wurzelfuesse, Astarme, Gesicht im Holz
  B.baum = function (m, root, P) {
    const bark = M.pmat("bark", m.color);
    const leaf = M.pmat("fur", R.mix(m.accent, "#2f4a2a", 0.6), { flat: true });
    const body = grp();
    root.add(body);
    P.spine = body;
    for (const s of [1, -1]) {
      const L = limb(body, [0.3 * s, 1.0, 0], 0.5, 0.5, 0.17, 0.15, bark, [-0.1, 0, 0.05 * s]);
      L.lo.rotation.x = 0.15;
      for (let i = 0; i < 3; i++) L.end.add(mesh(G.cone(0.07, 0.35, 5), bark, { p: [Math.cos(i * 2.1) * 0.12, -0.02, Math.sin(i * 2.1) * 0.12 + 0.08], r: [PI / 2 + 0.4, i * 2.1, 0] }));
      (P.legs = P.legs || []).push({ up: L.up, lo: L.lo, ph: s > 0 ? 0 : PI, base: -0.1, kb: 0.15, heavy: true });
    }
    const torso = grp([0, 1.0, 0], [0.12, 0, 0]);
    body.add(torso);
    P.torso = torso;
    torso.add(mesh(G.lathe("trunk", [[0.42, 0], [0.38, 0.4], [0.42, 0.9], [0.5, 1.3], [0.35, 1.6], [0.0, 1.7]], 12), bark, { s: [1, 1, 0.85] }));
    // Gesicht
    const face = grp([0, 1.15, 0.36]);
    torso.add(face);
    P.head = face;
    for (const s of [1, -1]) face.add(mesh(G.sph(0.08, 8, 6), M.basic("#050407"), { p: [s * 0.13, 0.05, 0], s: [1.2, 0.8, 0.5] }));
    eyes(face, [[0.13, 0.05, 0.04], [-0.13, 0.05, 0.04]], m.accent, 0.035);
    face.add(mesh(G.box(0.3, 0.1, 0.06), M.emis(R.shade(m.accent, 0.4), 0.8), { p: [0, -0.22, 0], r: [0, 0, 0.05] }));
    face.add(mesh(G.box(0.4, 0.06, 0.12), bark, { p: [0, 0.16, 0.03], r: [0, 0, 0] }));
    for (let i = 0; i < 5; i++) face.add(mesh(G.cone(0.04, 0.3, 4), M.pmat("fur", "#4f6a3c"), { p: [(i - 2) * 0.07, -0.42, 0.03], r: [PI, 0, (i - 2) * 0.1] }));
    // Krone aus Aesten und Laub
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      const br = grp([Math.cos(a) * 0.2, 1.6, Math.sin(a) * 0.15], [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6]);
      br.add(mesh(G.cyl(0.03, 0.07, 0.6, 5), bark, { p: [0, 0.3, 0] }));
      br.add(mesh(G.ico(0.28, 0), leaf, { p: [0, 0.65, 0], s: [1, 0.8, 1] }));
      torso.add(br);
    }
    for (const s of [1, -1]) {
      const A = limb(torso, [0.48 * s, 1.25, 0], 0.65, 0.6, 0.12, 0.09, bark, [0, 0, 0.25 * s]);
      for (let i = 0; i < 4; i++) A.end.add(mesh(G.cone(0.03, 0.28, 4), bark, { p: [(i - 1.5) * 0.05, -0.12, 0.03], r: [PI, 0, (i - 1.5) * 0.3] }));
      A.up.add(mesh(G.ico(0.18, 0), leaf, { p: [0.05 * s, -0.1, -0.05] }));
      P[s > 0 ? "armL" : "armR"] = A;
    }
    P.headY = 3.0;
  };

  // Kultist: Kapuzenrobe, Knochenmaske, Augenstab, kreisende Runen
  B.kultist = function (m, root, P) {
    const robe = M.pmat("cloth", m.color, { ds: true });
    const dark = M.pmat("cloth", R.shade(m.color, 0.55), { ds: true });
    const body = grp();
    root.add(body);
    P.spine = body;
    body.add(mesh(G.lathe("cultrobe", [[0.0, 1.62], [0.24, 1.6], [0.3, 1.35], [0.28, 1.0], [0.36, 0.5], [0.46, 0.0], [0.0, 0.0]], 18), robe));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2;
      body.add(mesh(G.cone(0.07, 0.18, 4), robe, { p: [Math.cos(a) * 0.44, 0.02, Math.sin(a) * 0.44], r: [PI, 0, 0] }));
    }
    body.add(mesh(G.box(0.14, 1.1, 0.02), dark, { p: [0, 0.75, 0.31], r: [-0.12, 0, 0] }));
    body.add(mesh(G.torus(0.27, 0.03, PI * 2, 5, 18), M.pmat("leather", "#2a1e18"), { p: [0, 1.0, 0], r: [PI / 2, 0, 0] }));
    body.add(mesh(G.octa(0.05), M.emis(m.accent, 1.2), { p: [0, 1.25, 0.3] }));
    const head = grp([0, 1.85, 0.02]);
    body.add(head);
    P.head = head;
    head.add(mesh(G.cap(0.26, PI * 0.66), robe, { r: [-0.3, 0, 0], s: [1, 1.2, 1.1] }));
    head.add(mesh(G.cone(0.08, 0.3, 6), robe, { p: [0, 0.2, -0.2], r: [-2.2, 0, 0] }));
    head.add(mesh(G.sph(0.19, 12, 10), M.basic("#050407"), { p: [0, -0.04, 0.03] }));
    // Knochenmaske
    head.add(mesh(G.sph(0.15, 12, 10, 0), M.pmat("bone", "#e8dcc0"), { p: [0, -0.03, 0.1], s: [0.9, 1.1, 0.5] }));
    for (const s of [1, -1]) head.add(mesh(G.sph(0.03, 6, 6), M.basic("#050407"), { p: [s * 0.055, 0.0, 0.17] }));
    eyes(head, [[0.055, 0.0, 0.18], [-0.055, 0.0, 0.18]], m.accent, 0.018);
    for (const s of [1, -1]) {
      const A = limb(body, [0.3 * s, 1.5, 0.02], 0.38, 0.36, 0.07, 0.065, robe, [-0.35, 0, 0.25 * s]);
      A.lo.rotation.x = -0.8;
      A.end.add(mesh(G.sph(0.05, 8, 6), M.pmat("skin", "#8a8090")));
      claws(A.end, 4, 0.1, M.pmat("skin", "#8a8090"), 0.35);
      P[s > 0 ? "armL" : "armR"] = A;
    }
    const staff = grp([0, -0.05, 0.03], [0.9, 0, 0]);
    staff.add(mesh(G.cyl(0.025, 0.03, 1.8, 6), M.pmat("wood", "#2a1e18"), { p: [0, 0.3, 0] }));
    staff.add(mesh(G.torus(0.12, 0.02, PI * 1.6, 5, 14), M.pmat("metal", "#5a5f6a"), { p: [0, 1.28, 0], r: [0, 0, PI * 0.7] }));
    const orb = mesh(G.sph(0.085, 12, 10), M.emis(m.accent, 1.3), { p: [0, 1.28, 0] });
    staff.add(orb);
    staff.add(mesh(G.sph(0.035, 8, 6), M.basic("#050407"), { p: [0, 1.28, 0.07] }));
    staff.add(R.haloSprite(m.accent, 0.6, 0.85, [0, 1.28, 0]));
    P.armR.end.add(staff);
    // Runenkreis
    const ring = grp([0, 0.08, 0]);
    ring.add(mesh(G.torus(0.9, 0.012, PI * 2, 4, 48), M.glow(m.accent, 0.6), { r: [PI / 2, 0, 0] }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      ring.add(mesh(G.box(0.06, 0.12, 0.01), M.glow(m.accent, 0.8), { p: [Math.cos(a) * 0.9, 0.12, Math.sin(a) * 0.9], r: [0, -a + PI / 2, 0] }));
    }
    body.add(ring);
    P.ring = ring;
    P.headY = 2.2;
  };

  // Alte Bauplaene der ersten Version auf die neuen abbilden
  const ALIAS = { schleim: "schlund", kobold: "goblin", skelett: "ghul", flatterer: "fledermaus", geist: "schemen", krabbe: "krebs", ritter: "todesritter" };

  // Geschoepfe passen zu ihrer Heimatinsel: Raureif und Eiszapfen in Midgard, Moos und Leuchtpilze in Hibernia
  function realmDecor(root, realm, seed, P) {
    const body = root.children[0] || root;
    // Nur feste Koerperteile zaehlen (keine Leuchtsprites), und die Oberkante nahe der Koerpermitte
    root.updateMatrixWorld(true);
    const pts = [];
    const v = new T.Vector3();
    body.traverse((o) => {
      if (!o.isMesh || o.material.transparent || !o.geometry.attributes.position) return;
      const pos = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 60));
      for (let i = 0; i < pos.count; i += step) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
    });
    if (!pts.length) return;
    const bb = new T.Box3().setFromPoints(pts);
    const r = R.rng(R.hash ? R.hash(seed) : 7);
    const w = Math.min(1.6, bb.max.x - bb.min.x);
    const d = Math.min(1.6, bb.max.z - bb.min.z);
    const cx = (bb.max.x + bb.min.x) / 2;
    const cz = (bb.max.z + bb.min.z) / 2;
    let top = bb.min.y;
    for (const p of pts) if (Math.abs(p.x - cx) < w * 0.22 && Math.abs(p.z - cz) < Math.max(0.25, d * 0.3) && p.y > top) top = p.y;
    const g = grp();
    if (realm === "midgard") {
      const ice = M.emis("#cfeaff", 0.45);
      for (let i = 0; i < 6; i++) {
        const sz = 0.05 + r() * 0.06;
        g.add(mesh(G.octa(sz), ice, { p: [cx + (r() - 0.5) * w * 0.3, top - 0.02 - r() * 0.06, cz + (r() - 0.5) * d * 0.25], s: [0.6, 2.2, 0.6], r: [(r() - 0.5) * 0.8, r(), (r() - 0.5) * 0.8] }));
      }
      for (let i = 0; i < 5; i++) g.add(mesh(G.sph(0.05 + r() * 0.04, 6, 5), M.pmat("plain", "#eef6ff"), { p: [cx + (r() - 0.5) * w * 0.3, top - 0.04, cz + (r() - 0.5) * d * 0.25], s: [1.4, 0.5, 1.2] }));
      g.add(R.haloSprite("#bfe8ff", Math.max(1.2, w * 1.2), 0.1, [cx, top * 0.6, cz]));
    } else {
      const moss = M.pmat("plain", "#3f8a3a", { flat: true });
      for (let i = 0; i < 6; i++) g.add(mesh(G.ico(0.07 + r() * 0.06, 0), moss, { p: [cx + (r() - 0.5) * w * 0.3, top - 0.03, cz + (r() - 0.5) * d * 0.25], s: [1.3, 0.45, 1.3] }));
      const shroomC = ["#9fffc8", "#ff9fe0", "#ffe08a"][Math.floor(r() * 3)];
      for (let i = 0; i < 3; i++) {
        const x = cx + (r() - 0.5) * w * 0.25;
        const z = cz + (r() - 0.5) * d * 0.2;
        g.add(mesh(G.cyl(0.012, 0.016, 0.08, 5), M.pmat("plain", "#e8e0cc"), { p: [x, top - 0.02, z] }));
        g.add(mesh(G.cap(0.045, Math.PI * 0.5), M.emis(shroomC, 0.9), { p: [x, top + 0.02, z], s: [1, 0.6, 1] }));
      }
      g.add(R.haloSprite(shroomC, Math.max(0.8, w * 0.8), 0.25, [cx, top, cz]));
    }
    // Schwebende Wesen tragen den Schmuck an ihrem schwebenden Koerper
    const target = (P && P.hover) || body;
    target.updateMatrixWorld(true);
    g.applyMatrix4(new T.Matrix4().copy(target.matrixWorld).invert());
    target.add(g);
  }
  R.buildMonster = function (m) {
    if (!T) init();
    // Monsterkonzept v06: eigene Meshy-Figur fuer genau dieses Monster (Monster-ID oder Name als visual); ohne eigene
    // die geliehene Figur eines Monsters derselben Familie (look, UI.monLook)
    const own = (k) => !!k && ((R.rigged && R.rigged.is && R.rigged.is(k)) || (R.beasts && R.beasts.hasOwn && R.beasts.hasOwn(k)));
    if (!own(m.visual) && own(m.look)) m = Object.assign({}, m, { visual: m.look, borrowed: true });
    let gen = null;
    if (m.visual && R.rigged && R.rigged.is && R.rigged.is(m.visual)) {
      try {
        gen = R.rigged.buildMonster(m, m.visual);
      } catch (e) {
        console.warn("Monsterfigur nicht moeglich, alte Figur", e);
      }
    }
    // Version 5: modellierte Bestie, falls fuer diese Familie vorhanden
    if (!gen && R.beasts && R.beasts.has && R.beasts.has(m.arch, m.visual)) {
      try {
        gen = R.beasts.build(m);
      } catch (e) {
        console.warn("Modellierte Bestie nicht moeglich, alte Figur", e);
      }
    }
    if (gen) {
      // Bosse leuchten wie die gebauten in ihrer Akzentfarbe
      if (m.boss && gen.obj) gen.obj.add(R.haloSprite(m.accent || "#ff5a3d", Math.max(2.4, (gen.height || 2) * 1.3), 0.16, [0, (gen.height || 2) * 0.45, 0]));
      return gen;
    }
    const root = grp();
    const P = {};
    const arch = B[m.arch] ? m.arch : ALIAS[m.arch] || "ghul";
    const mm = Object.assign({ color: "#6a6a6a", accent: "#ff5a3d" }, m, { arch });
    B[arch](mm, root, P);
    if (m.realm === "midgard" || m.realm === "hibernia") realmDecor(root, m.realm, arch + mm.color, P);
    if (m.boss) {
      const s = m.final ? 1.4 : 1.2;
      root.scale.setScalar(s);
      P.headY = (P.headY || 1.5) * s;
      // Aura und bei Endgegnern eine eiserne Dornenkrone
      root.add(R.haloSprite(mm.accent, 2.4, 0.16, [0, 1.0, 0]));
      if (m.final) {
        const crown = grp([0, P.headY / s + 0.15, 0]);
        const iron = M.pmat("metal", "#3a3640");
        crown.add(mesh(G.torus(0.2, 0.03, PI * 2, 5, 18), iron, { r: [PI / 2, 0, 0] }));
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * PI * 2;
          crown.add(mesh(G.cone(0.035, 0.22, 4), iron, { p: [Math.cos(a) * 0.2, 0.1, Math.sin(a) * 0.2], r: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3] }));
        }
        crown.add(R.haloSprite(mm.accent, 0.9, 0.5, [0, 0.12, 0]));
        crown.userData.bob = 0;
        root.add(crown);
        P.crown = crown;
      }
    }
    const model = R.makeModel(root, P, "monster");
    model.arch = arch;
    model.headY = P.headY || 1.5;
    model.height = model.headY + 0.2;
    model.ranged = SB.data.ARCH_TYPE[arch] === "verstand";
    model.projColor = mm.accent;
    if (P.inner) model.inner = P.inner;
    return model;
  };

  /* ---------- Monsteranimation ---------- */
  const ease = (u) => u * u * (3 - 2 * u);
  const bell = (u) => Math.sin(PI * u);
  R.poseMonster = function (m, name, u) {
    if (m.parts && m.parts.beast) return R.beasts.pose(m, name, u);
    const P = m.parts;
    const t = m.t;
    const root = m.obj.children[0];
    if (!root || P.inner) return;
    let y = 0;
    let rx = 0;
    let rz = 0;
    let lean = 0;
    let jaw = 0.12 + Math.max(0, Math.sin(t * 1.7)) * 0.08;
    let armX = Math.sin(t * 1.8) * 0.12;
    let armBend = -0.3;
    let walk = 0;
    const breathe = Math.sin(t * 2);
    if (P.hover) P.hover.position.y = (P.hoverY || 0.4) + Math.sin(t * 1.8) * 0.12;
    if (P.wings) for (const w of P.wings) w.g.rotation.z = w.s * (w.slow ? Math.sin(t * 2.2) * 0.25 : Math.sin(t * 10) * 0.55);
    if (P.tail) P.tail.rotation.y = Math.sin(t * 2.4) * 0.3;
    if (P.cap) P.cap.rotation.z = Math.sin(t * 1.4) * 0.05;
    if (P.orbit) P.orbit.rotation.y = t * 0.6;
    if (P.ring) P.ring.rotation.y = t * 0.8;
    if (P.neck) P.neck.rotation.x = Math.sin(t * 1.2) * 0.06;
    if (P.tentacles) for (const k of P.tentacles) k.g.rotation.x = Math.sin(t * 2.5 + k.k * 1.5 + k.s) * 0.35;
    switch (name) {
      case "attack":
      case "special": {
        const wind = u < 0.4 ? ease(u / 0.4) : 1 - ease((u - 0.4) / 0.6);
        const hit = u < 0.4 ? 0 : bell((u - 0.4) / 0.6);
        lean = -0.15 * wind + 0.4 * hit;
        armX = -2.2 * wind + 0.6 * hit;
        armBend = -0.2 - 0.6 * wind;
        jaw = 0.1 + 1.0 * Math.max(wind, hit);
        if (name === "special") y = 0.45 * bell(u);
        break;
      }
      case "cast": {
        const b = bell(u);
        y = 0.2 * b;
        lean = -0.2 * b;
        armX = -1.8 * b;
        armBend = -0.1;
        jaw = 0.1 + 0.8 * b;
        break;
      }
      case "hit":
        lean = -0.35 * bell(u);
        jaw = 0.6 * bell(u);
        break;
      case "evade":
        rz = 0.35 * bell(u);
        y = 0.2 * bell(u);
        break;
      case "block":
        lean = -0.15 * bell(u);
        armX = -1.2 * bell(u);
        break;
      case "victory":
        y = 0.3 * Math.abs(Math.sin(u * PI * 2));
        jaw = 1;
        armX = -2.4;
        break;
      case "walk":
        walk = 1;
        break;
      case "defeat":
        rz = 1.4 * ease(u);
        y = -0.25 * ease(u);
        jaw = 1;
        break;
    }
    if (P.spine) {
      P.spine.rotation.x = lean;
      P.spine.position.y = breathe * 0.015;
    }
    if (P.head) P.head.rotation.x = (P.head.userData.rx0 == null ? (P.head.userData.rx0 = P.head.rotation.x) : P.head.userData.rx0) + Math.sin(t * 1.3) * 0.05 - lean * 0.4;
    if (P.jaw) {
      if (P.jaw.userData.rx0 == null) P.jaw.userData.rx0 = P.jaw.rotation.x;
      P.jaw.rotation.x = P.jaw.userData.rx0 + (P.jawOpen || 0.4) * Math.min(1, jaw);
    }
    if (P.pincer) P.pincer.rotation.x = 0.45 * Math.min(1, jaw);
    for (const k of ["armR", "armL"]) {
      const A = P[k];
      if (!A || !A.up) continue;
      if (A.up.userData.rx0 == null) A.up.userData.rx0 = A.up.rotation.x;
      const main = k === "armR" || !P.armR;
      A.up.rotation.x = A.up.userData.rx0 + (main ? armX : armX * 0.35 + Math.sin(t * 1.6 + 1) * 0.08);
      if (A.lo) {
        if (A.lo.userData.rx0 == null) A.lo.userData.rx0 = A.lo.rotation.x;
        A.lo.rotation.x = A.lo.userData.rx0 + (main ? armBend : -0.2);
      }
    }
    if (P.legs)
      for (const L of P.legs) {
        const sp = walk ? 9 : 0;
        const ph = Math.sin(t * sp + L.ph);
        if (L.spider) {
          if (L.up.userData.ry0 == null) L.up.userData.ry0 = L.up.rotation.y;
          L.up.rotation.x = Math.sin(t * (walk ? 10 : 3) + L.ph) * (walk ? 0.25 : 0.04);
          L.lo.rotation.z = L.rz + Math.sin(t * 3 + L.ph) * 0.04;
        } else {
          L.up.rotation.x = L.base + ph * (walk ? 0.5 : 0);
          L.lo.rotation.x = L.kb + (walk ? Math.max(0, -ph) * (L.quad ? -0.5 : 0.6) : 0);
        }
      }
    root.position.y = y;
    root.rotation.x = rx;
    root.rotation.z = rz;
  };

  R.buildFighter = function (desc) {
    if (!desc) return null;
    if (desc.kind === "monster") return R.buildMonster(desc);
    return R.buildHero(desc);
  };
})();
