/* Helden von Schwebfels - modellierte Bestien (Version 5).
   Jede Familie kommt als gehaeutetes Modell aus dem Modellpaket (assets-src/beasts/), mit Farbbereichen
   (Grundfarbe, Akzent, Leuchten, Verdeckung in den Eckfarben), Merkmalsgruppen fuer Varianten und
   einem Skelett mit Rollen (Wirbelsaeule, Kopf, Kiefer, Schwanz, Beine, Fluegel). Die Bewegungen
   entstehen im Code je Rolle. Die Kampfwerte (arch) bleiben unveraendert; die Erscheinung waehlt
   eine eigene Familie und Variante (visual). */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const R = (SB.R3D = SB.R3D || {});
  const BE = (R.beasts = R.beasts || {});
  const PI = Math.PI;
  let T = null;

  const pack = () => (SB.assets && SB.assets.data && SB.assets.data.beasts) || {};
  // Kampfprofil (arch) -> Erscheinungsfamilie
  const FAMILY = { schlund: "schlund" };
  // erzeugte Bestien (assets/gen.pack) nennen ihre Monsterarten selbst (meta.archs) und gehen vor
  function genFamily(arch) {
    const P = pack();
    for (const k in P) if (P[k].tex && P[k].meta.archs && P[k].meta.archs.indexOf(arch) >= 0) return k;
    return null;
  }
  BE.familyOf = (arch, visual) => (visual && pack()[visual] ? visual : genFamily(arch) || (FAMILY[arch] && pack()[FAMILY[arch]] ? FAMILY[arch] : null));
  BE.has = (arch, visual) => !!BE.familyOf(arch, visual);
  // eigenes Modell unter genau diesem Schluessel (Monster-ID oder Name eines Endbosses)
  BE.hasOwn = (key) => !!(key && pack()[key]);
  // erzeugte Bestie (Meshy, mit Textur) statt einer gebauten Familie
  BE.isGen = (arch, visual) => {
    const f = BE.familyOf(arch, visual);
    return !!(f && pack()[f].tex);
  };

  /* ---------- Materialien ---------- */
  const TILE = { skin: "leather", horn: "bone", claw: "bone", plant: "cloth", bone: "bone", stone: "stone", fur: "fur", wood: "bark", shell: "scale", metal: "metal", cloth: "wool", membrane: "leather", crystal: "brushed", slime: "leather" };
  function tile(name, kind) {
    const M = SB.assets.data.mat;
    if (!M || !M.tiles[name]) return null;
    return SB.assets.texture("tile." + name + "." + kind, M.tiles[name][kind], { srgb: kind === "alb", repeat: true });
  }
  const MC = {};
  function beastMat(cls, C) {
    const key = cls + "|" + C.base.getHexString() + C.second.getHexString() + C.glow.getHexString() + C.horn.getHexString();
    if (MC[key]) return MC[key];
    const tn = TILE[cls] || "leather";
    const baseCol = cls === "skin" || cls === "fur" || cls === "shell" || cls === "slime" ? C.base : cls === "horn" ? C.horn : cls === "claw" ? C.claw : cls === "bone" ? C.bone : cls === "plant" ? C.plant : cls === "membrane" ? C.membrane : cls === "stone" ? C.stone : cls === "metal" ? C.metal : cls === "crystal" ? C.glow : cls === "wood" ? C.wood : C.base;
    const isGlow = cls === "eye" || cls === "glow";
    const m = new T.MeshStandardMaterial({
      color: 0xffffff,
      map: isGlow ? null : tile(tn, "alb"),
      normalMap: isGlow ? null : tile(tn, "nrm"),
      roughness: cls === "metal" ? 0.4 : cls === "crystal" ? 0.15 : cls === "bone" || cls === "horn" || cls === "claw" ? 0.45 : cls === "slime" ? 0.25 : 0.82,
      metalness: cls === "metal" ? 0.85 : 0,
      emissive: isGlow ? C.glow.clone() : new T.Color(0),
      emissiveIntensity: isGlow ? 1.6 : 1,
      vertexColors: true,
      side: cls === "plant" || cls === "membrane" ? T.DoubleSide : T.FrontSide,
    });
    if (m.normalMap) m.normalScale = new T.Vector2(1.1, 1.1);
    m.envMapIntensity = cls === "metal" || cls === "crystal" ? 1 : 0.45;
    const U = { uA: { value: baseCol.clone() }, uB: { value: (cls === "skin" || cls === "fur" ? C.second : baseCol.clone().multiplyScalar(1.25)).clone() }, uG: { value: C.glow.clone() }, uGlow: { value: isGlow ? 1.0 : C.glowAmt } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uA, uB, uG; uniform float uGlow;")
        .replace("#include <color_fragment>", "diffuseColor.rgb *= mix(uA, uB, vColor.g) * vColor.r * (0.25 + 0.75 * vColor.a);")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uG * vColor.b * uGlow;");
    };
    m.customProgramCacheKey = () => "sbbeast";
    return (MC[key] = m);
  }

  // erzeugte Bestie mit eigener Textur: leicht in der Farbe des Gegners getoent, damit Varianten unterscheidbar bleiben
  function texMat(fam, B, m) {
    // eigenes Modell genau dieses Monsters (Monsterkonzept): Farben wie im Konzept, sonst leicht in Gegnerfarbe getoent
    // eine geliehene Figur (Gegner ohne eigene, UI.monLook) nur leicht, damit sie ihr Konzept behaelt
    const own = !!m.visual && fam === m.visual && !m.borrowed;
    const amt = own ? 0 : m.borrowed ? 0.3 : 0.45;
    const key = "tex|" + fam + "|" + (own ? "" : (m.color || "") + amt);
    if (MC[key]) return MC[key];
    const tint = new T.Color("#ffffff").lerp(new T.Color(m.color || "#ffffff"), amt);
    const mat = new T.MeshStandardMaterial({ color: tint, map: SB.assets.texture("beast." + fam, B.tex, { srgb: true }), roughness: 0.8, metalness: 0 });
    if (B.ntex) mat.normalMap = SB.assets.texture("beast." + fam + ".n", B.ntex, { srgb: false });
    return (MC[key] = mat);
  }

  /* ---------- Geometrie (einmal je Familie und Merkmalsauswahl) ---------- */
  const GEO = {};
  function beastGeo(fam, hide) {
    const k = fam + "|" + (hide || []).join(",");
    if (GEO[k]) return GEO[k];
    const B = pack()[fam];
    const meta = B.meta;
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(B.pos, 3));
    g.setAttribute("normal", new T.BufferAttribute(B.nrm, 3, true));
    g.setAttribute("uv", new T.BufferAttribute(B.uv, 2));
    g.setAttribute("color", new T.BufferAttribute(B.col, 4, true));
    g.setAttribute("skinIndex", new T.BufferAttribute(B.skinI, 4));
    g.setAttribute("skinWeight", new T.BufferAttribute(B.skinW, 4, true));
    // ausgeblendete Merkmale (Varianten) aus dem Index nehmen
    const drop = new Uint8Array(B.idx.length / 3);
    for (const h of hide || []) {
      const rs = meta.features[h];
      if (rs) for (const [s, c] of rs) for (let t = s; t < s + c; t++) drop[t] = 1;
    }
    const out = [];
    const groups = [];
    for (const [mi, start, count] of meta.groups) {
      const s0 = out.length;
      for (let t = start / 3; t < (start + count) / 3; t++) if (!drop[t]) out.push(B.idx[t * 3], B.idx[t * 3 + 1], B.idx[t * 3 + 2]);
      groups.push([mi, s0, out.length - s0]);
    }
    g.setIndex(out);
    g.userData.mats = [];
    for (const [mi, s, c] of groups)
      if (c > 0) {
        g.addGroup(s, c, g.userData.mats.length);
        g.userData.mats.push(meta.matNames[mi]);
      }
    return (GEO[k] = g);
  }

  /* ---------- Varianten: Farben und Merkmale je Gegner ---------- */
  function colors(m, fam) {
    const base = new T.Color(m.color || "#6a6a6a");
    const acc = new T.Color(m.accent || "#ff5a3d");
    const hsl = {};
    base.getHSL(hsl);
    const second = new T.Color().setHSL(hsl.h + 0.03, Math.max(0, hsl.s * 0.7), Math.min(0.85, hsl.l * 1.7 + 0.12));
    return {
      base,
      second,
      glow: acc,
      glowAmt: m.boss ? 0.8 : 0.4,
      horn: new T.Color().setHSL(0.08, 0.28, 0.22 + hsl.l * 0.25),
      claw: new T.Color("#2a241e"),
      bone: new T.Color("#cfc2a2"),
      plant: new T.Color().setHSL(0.2, 0.42, 0.2),
      membrane: new T.Color("#3a0e12"),
      stone: new T.Color("#7a7670"),
      metal: new T.Color("#6a6460"),
      wood: new T.Color("#5a4030"),
    };
  }

  BE.build = function (m) {
    T = R.T();
    const fam = BE.familyOf(m.arch, m.visual);
    const B = pack()[fam];
    const meta = B.meta;
    const C = colors(m, fam);
    const hide = (m.hideFeatures || []).slice();
    const geo = beastGeo(fam, hide);
    const mats = B.tex ? geo.userData.mats.map(() => texMat(fam, B, m)) : geo.userData.mats.map((cls) => beastMat(cls, C));
    const bones = meta.bones.map((b) => {
      const bone = new T.Bone();
      bone.name = b[0];
      return bone;
    });
    meta.bones.forEach((b, i) => {
      const h = b[2];
      if (b[1] < 0) bones[i].position.set(h[0], h[1], h[2]);
      else {
        const ph = meta.bones[b[1]][2];
        bones[i].position.set(h[0] - ph[0], h[1] - ph[1], h[2] - ph[2]);
        bones[b[1]].add(bones[i]);
      }
      bones[i].userData.p0 = bones[i].position.clone();
      bones[i].userData.role = b[4];
    });
    const mesh = new T.SkinnedMesh(geo, mats);
    for (const b of bones) if (!b.parent) mesh.add(b);
    mesh.updateMatrixWorld(true);
    mesh.bind(new T.Skeleton(bones));
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    const root = R.grp();
    const body = R.grp();
    root.add(body);
    body.add(mesh);
    const by = {};
    bones.forEach((b) => (by[b.name] = b));
    const s = (m.boss ? (m.final ? 1.35 : 1.18) : 1) * (meta.scale || 1);
    body.scale.setScalar(s);
    const P = { beast: true, fam, body, mesh, B: by, bones, meta };
    const model = R.makeModel(root, P, "monster");
    model.arch = m.arch;
    model.headY = ((meta.headY || 1.4) + (meta.form === "flieger" ? HOVER : 0)) * s;
    model.height = (meta.height || 1.6) * s;
    model.ranged = SB.data.ARCH_TYPE[m.arch] === "verstand";
    model.projColor = m.accent || "#ff5a3d";
    return model;
  };

  /* ---------- Bewegung je Rolle ---------- */
  const E = () => new T.Euler();
  let EU = null;
  function rot(b, x, y, z) {
    if (!EU) EU = new T.Euler();
    EU.set(x, y, z);
    b.quaternion.setFromEuler(EU);
  }
  const ease = (u) => u * u * (3 - 2 * u);
  const bell = (u) => Math.sin(PI * u);
  // einfache Bewegung je Rolle fuer Bestien ohne vollstaendige Beine (aeltere Familien)
  function poseBasic(m, name, u) {
    const P = m.parts;
    const t = m.t;
    const B = P.B;
    let lean = 0;
    let lunge = 0;
    let jaw = 0.1 + Math.max(0, Math.sin(t * 1.3)) * 0.08;
    let gait = 0;
    let rz = 0;
    let y = 0;
    let rx = 0;
    let head = Math.sin(t * 0.9) * 0.05;
    let tailK = 1;
    switch (name) {
      case "attack":
      case "special": {
        const wind = u < 0.35 ? ease(u / 0.35) : 1 - ease((u - 0.35) / 0.65);
        const hit = u < 0.35 ? 0 : bell((u - 0.35) / 0.65);
        lean = 0.12 * wind - 0.15 * hit;
        lunge = -0.18 * wind + 0.45 * hit;
        jaw = 0.2 + 0.9 * Math.max(wind, hit);
        head = -0.25 * wind + 0.2 * hit;
        if (name === "special") y = 0.35 * bell(u);
        break;
      }
      case "cast":
        jaw = 0.3 + 0.9 * bell(u);
        head = -0.35 * bell(u);
        lean = 0.1 * bell(u);
        break;
      case "hit":
        lean = 0.2 * bell(u);
        lunge = -0.2 * bell(u);
        jaw = 0.6 * bell(u);
        head = -0.3 * bell(u);
        break;
      case "evade":
        rz = 0.25 * bell(u);
        lunge = -0.3 * bell(u);
        break;
      case "block":
        lean = 0.15 * bell(u);
        head = 0.25 * bell(u);
        break;
      case "victory":
        jaw = 1;
        head = -0.4;
        y = 0.1 * Math.abs(Math.sin(u * PI * 3));
        tailK = 2;
        break;
      case "walk":
        gait = 1;
        break;
      case "defeat": {
        const e = ease(u);
        rz = 1.35 * e;
        y = -0.15 * e;
        jaw = 0.8;
        head = 0.4 * e;
        tailK = 0.2;
        break;
      }
    }
    const br = Math.sin(t * 1.8) * 0.015;
    P.body.position.set(0, y + br, lunge);
    P.body.rotation.set(rx, 0, rz);
    for (const b of P.bones) {
      const role = b.userData.role;
      if (role === "spine") rot(b, lean * 0.4 + br * 0.5, Math.sin(t * 1.1) * 0.02, 0);
      else if (role === "head") rot(b, head, Math.sin(t * 0.7) * 0.06, 0);
      else if (role === "jaw") {
        b.quaternion.identity();
        const k = 1 + jaw * 0.22;
        b.scale.set(k, k, 1);
      } else if (role === "tail") {
        const i = parseInt(b.name.replace(/\D/g, ""), 10) || 1;
        rot(b, Math.sin(t * 1.6 + i) * 0.04 * tailK, Math.sin(t * 2.2 - i * 0.7) * 0.18 * tailK, 0);
      } else if (role && role.indexOf("leg.") === 0) {
        const k = role.slice(4);
        const i = parseInt(b.name.slice(-1), 10);
        // Diagonalgang: vorne links mit hinten rechts
        const ph = k === "FL" || k === "BR" ? 0 : PI;
        const sw = gait ? Math.sin(t * 7 + ph) : 0;
        const side = k[1] === "L" ? 1 : -1;
        if (i === 1) rot(b, sw * 0.45, 0, gait ? Math.max(0, -sw) * 0.25 * side : 0);
        else if (i === 2) rot(b, gait ? Math.max(0, sw) * -0.5 : 0, 0, 0);
        else rot(b, gait ? Math.max(0, sw) * 0.3 : 0, 0, 0);
      }
    }
  }

  /* ---------- Vierbeiner mit Pfoten am Boden (erzeugte Bestien wie der Wolf) ----------
     Jedes Bein hat drei Knochen (Oberarm oder Oberschenkel, Unterarm oder Unterschenkel, Pfote). Die Bewegung setzt
     Rumpf, Wirbelsaeule, Kopf und Schwanz und gibt je Bein nur den Punkt der Pfote vor; die zwei oberen Knochen folgen
     ueber eine Gelenkrechnung in der Seitenebene des Beins, die Pfote haelt ihre Neigung. So bleiben die Pfoten beim
     Lauern, Ducken und Zurueckzucken am Boden, beim Galopp und Sprung heben sie sich in Boegen.
     Knochen haben keine Ruhedrehung: Drehung um +X schwingt ein Bein nach hinten, senkt Kopf und Rumpfspitze und hebt
     den Schwanz. */
  const LEGS = ["FL", "FR", "BL", "BR"];
  function quadRig(bones, meta) {
    const V = (a) => new T.Vector3(a[0], a[1], a[2]);
    const fa = (a, b) => Math.atan2(b.z - a.z, -(b.y - a.y));
    const yz = (a, b) => Math.hypot(b.y - a.y, b.z - a.z);
    const find = (nm) => meta.bones.findIndex((b) => b[0] === nm);
    const legs = {};
    for (const k of LEGS) {
      const idx = [1, 2, 3].map((n) => find("leg" + k + n));
      if (idx.some((i) => i < 0)) return null;
      const [m1, m2, m3] = idx.map((i) => meta.bones[i]);
      const J1 = V(m1[2]);
      const J2 = V(m2[2]);
      const J3 = V(m3[2]);
      const tip = V(m3[3]);
      const parent = bones[m1[1]];
      const ph = V(meta.bones[m1[1]][2]);
      legs[k] = {
        b: idx.map((i) => bones[i]),
        parent,
        J1: J1.clone().sub(ph),
        l1: yz(J1, J2),
        l2: yz(J2, J3),
        l3: yz(J3, tip),
        a1r: fa(J1, J2),
        a2r: fa(J2, J3),
        a3r: fa(J3, tip),
        bend: fa(J1, J2) > fa(J1, J3) ? 1 : -1,
        tip,
        front: k[0] === "F",
        side: k[1] === "L" ? 1 : -1,
      };
    }
    const by = {};
    for (const b of bones) by[b.name] = b;
    if (!by.hips || !by.head) return null;
    return {
      legs,
      by,
      tail: bones.filter((b) => b.userData.role === "tail"),
      M: new T.Matrix4(),
      MB: new T.Matrix4(),
      v: new T.Vector3(),
      w: new T.Vector3(),
      d: new T.Vector3(),
    };
  }

  const cl01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const seg = (u, a, b) => cl01((u - a) / (b - a));
  // Haltung je Bewegung: Rumpf (x, y, z, rx, rz, ry), Wirbel (hips, spine, chest, neck, head), Blick (hy),
  // Schwanz (tail, wag, wagF) und je Bein { dz, dy, carry (Pfote folgt dem Rumpf), flex (Pfotenneigung), body (Pfote
  // am Koerper statt am Boden, 0..1) }
  function quadPose(name, u, t, ph) {
    const breath = Math.sin(t * 1.9);
    const Q = {
      x: 0,
      y: -0.03 + breath * 0.008,
      z: 0,
      rx: 0,
      rz: Math.sin(t * 0.8) * 0.02,
      ry: 0,
      hips: 0.02,
      spine: 0.035 + breath * 0.012,
      chest: 0.04,
      // Lauerhaltung: Kopf tief, Schnauze auf den Gegner
      neck: 0.24 + Math.sin(t * 0.6) * 0.03,
      head: -0.2 + Math.sin(t * 1.3) * 0.03,
      hy: Math.sin(t * 0.55) * 0.12 + Math.sin(t * 7.3) * 0.012,
      hz: 0,
      tail: 0.32 + Math.sin(t * 0.9) * 0.04,
      wag: 0.1,
      wagF: 1.4,
      legs: {},
    };
    for (const k of LEGS) Q.legs[k] = { dz: 0, dy: 0, carry: 0, flex: 0, body: 0, dyB: 0, dzB: 0 };
    const L = Q.legs;
    switch (name) {
      case "walk": {
        // Galopp: Hinterbeine kurz nacheinander, dann die Vorderbeine; Ruecken beugt und streckt sich
        const f = (t * 3.1) % 1;
        const PH = { BL: 0, BR: 0.1, FL: 0.48, FR: 0.6 };
        const st = 0.42;
        for (const k of LEGS) {
          const l = L[k];
          const fr = k[0] === "F";
          const A = fr ? 0.2 : 0.17;
          const p = (f + PH[k]) % 1;
          l.carry = 1;
          if (p < st) {
            l.dz = A - (2 * A * p) / st;
          } else {
            const w = (p - st) / (1 - st);
            l.dz = -A + 2 * A * ease(w);
            l.dy = (fr ? 0.14 : 0.1) * Math.sin(PI * w);
            l.flex = fr ? -1.5 * Math.sin(PI * w) : 0.55 * Math.sin(PI * w);
          }
        }
        const c = Math.sin(2 * PI * f);
        Q.y = 0.01 + 0.035 * Math.sin(4 * PI * f + 0.6);
        Q.hips = 0.06 * c;
        Q.spine = 0.03 + 0.11 * Math.sin(2 * PI * f + 0.9);
        Q.chest = 0.05 * Math.sin(2 * PI * f + 1.4);
        Q.neck = 0.08 - 0.09 * c;
        Q.head = -0.06 + 0.07 * c;
        Q.hy = 0;
        Q.rz = 0;
        Q.tail = 0.5 + 0.08 * c;
        Q.wag = 0.05;
        break;
      }
      case "attack":
      case "special": {
        // Sprungbiss: ducken, abspringen (Hinterbeine stossen ab), Biss mit Kopfschuetteln, zurueck in den Stand
        const sp = name === "special";
        const zMax = sp ? 0.42 : 0.5;
        const hMax = sp ? 0.38 : 0.13;
        const c = seg(u, 0, 0.3);
        const crouch = u < 0.3 ? ease(c) : 1 - ease(seg(u, 0.3, 0.42));
        const leap = seg(u, 0.3, 0.6);
        const land = u > 0.6 ? Math.sin(PI * seg(u, 0.6, 0.78)) : 0;
        const back = ease(seg(u, 0.8, 1));
        Q.z = u < 0.3 ? -0.07 * ease(c) : u < 0.6 ? -0.07 + (zMax + 0.07) * ease(leap) : zMax * (1 - back);
        Q.y = -0.03 - 0.1 * crouch + (u > 0.3 && u < 0.62 ? hMax * Math.sin(PI * seg(u, 0.3, 0.62)) : 0) - 0.05 * land;
        Q.hips = 0.02 + 0.08 * crouch - 0.12 * Math.sin(PI * leap);
        Q.spine = 0.12 * crouch - 0.1 * Math.sin(PI * leap);
        Q.chest = 0.04 + 0.06 * crouch;
        const bite = Math.sin(PI * seg(u, 0.46, 0.62));
        Q.neck = 0.24 + 0.2 * crouch - 0.45 * Math.sin(PI * leap) + 0.3 * bite;
        Q.head = -0.2 - 0.15 * crouch + 0.1 * Math.sin(PI * leap) + 0.25 * bite;
        const shake = u > 0.55 && u < 0.85 ? Math.sin(PI * seg(u, 0.55, 0.85)) : 0;
        Q.hy = shake * (sp ? 0.4 : 0.28) * Math.sin(t * 38);
        Q.hz = shake * 0.15 * Math.sin(t * 38 + 1);
        Q.tail = 0.45 + 0.25 * Math.sin(PI * leap);
        Q.wag = 0.05;
        if (sp) Q.rz = 0.25 * Math.sin(PI * leap) * Math.sin(PI * leap);
        const air = u > 0.32 && u < 0.6 ? Math.sin(PI * seg(u, 0.32, 0.6)) : 0;
        for (const k of LEGS) {
          const l = L[k];
          if (k[0] === "F") {
            // Vorderpfoten greifen nach vorn und landen weiter vorn
            l.carry = 1;
            l.dz = 0.3 * air;
            l.dy = (sp ? 0.24 : 0.18) * air + 0.04 * Math.sin(PI * seg(u, 0.82, 1));
            l.flex = -0.5 * air;
          } else {
            // Hinterpfoten bleiben beim Absprung stehen und ziehen in der Luft nach
            l.carry = ease(seg(u, 0.42, 0.62));
            l.dy = 0.1 * Math.sin(PI * seg(u, 0.42, 0.66)) + 0.04 * Math.sin(PI * seg(u, 0.82, 1));
            l.dz = -0.08 * Math.sin(PI * seg(u, 0.42, 0.66));
            l.flex = 0.5 * Math.sin(PI * seg(u, 0.42, 0.66));
          }
        }
        break;
      }
      case "hit": {
        // zurueckzucken: Kopf hoch und weg, Ruecken rund, Schwanz eingezogen, Pfoten bleiben stehen
        const k = u < 0.22 ? ease(u / 0.22) : 1 - ease(seg(u, 0.22, 1));
        Q.z = -0.12 * k;
        Q.y += 0.015 * k;
        Q.hips = 0.02 - 0.08 * k;
        Q.spine -= 0.14 * k;
        Q.neck = 0.24 - 0.5 * k;
        Q.head = -0.2 - 0.15 * k;
        Q.hy = 0.3 * k * ph;
        Q.hz = -0.15 * k * ph;
        Q.rz = 0.07 * k * ph;
        Q.tail = 0.32 - 0.7 * k;
        Q.wag = 0.02;
        break;
      }
      case "evade": {
        // Satz zurueck: ducken, mit hoher Brust abspringen, Pfoten angezogen, landen
        const c = u < 0.2 ? ease(u / 0.2) : 1 - ease(seg(u, 0.2, 0.32));
        const air = Math.sin(PI * seg(u, 0.2, 0.72));
        const land = Math.sin(PI * seg(u, 0.7, 0.92));
        Q.y = -0.03 - 0.08 * c + 0.16 * air - 0.05 * land;
        Q.hips = 0.02 - 0.22 * air + 0.06 * c;
        Q.spine = 0.08 * c - 0.06 * air;
        Q.neck = 0.24 - 0.3 * air;
        Q.head = -0.2 + 0.1 * air;
        Q.tail = 0.32 + 0.2 * air;
        for (const k of LEGS) {
          const l = L[k];
          l.carry = 1;
          l.dy = (k[0] === "F" ? 0.12 : 0.07) * air;
          l.dz = (k[0] === "F" ? -0.06 : 0.04) * air;
          l.flex = (k[0] === "F" ? -0.9 : 0.4) * air;
        }
        break;
      }
      case "block": {
        // ducken und abwehren: Brust tief, Kopf zur Seite, Lefzen zum Gegner
        const k = Math.sin(PI * u);
        Q.y -= 0.08 * k;
        Q.z = -0.05 * k;
        Q.hips = 0.02 + 0.06 * k;
        Q.neck = 0.24 + 0.25 * k;
        Q.head = -0.2 - 0.25 * k;
        Q.hy = 0.25 * k * ph;
        Q.tail = 0.32 - 0.4 * k;
        break;
      }
      case "cast": {
        const k = Math.sin(PI * u);
        Q.hips = 0.02 - 0.12 * k;
        Q.neck = 0.24 - 0.7 * k;
        Q.head = -0.2 - 0.4 * k;
        Q.hy = 0.03 * k * Math.sin(t * 22);
        break;
      }
      case "victory": {
        // Siegesgeheul: Hinterteil tiefer, Brust und Schnauze zum Himmel, Schwanz wedelt
        const r = u < 0.15 ? ease(u / 0.15) : u > 0.85 ? 1 - ease(seg(u, 0.85, 1)) : 1;
        Q.y = -0.03 - 0.07 * r;
        Q.hips = 0.02 - 0.2 * r;
        Q.spine = 0.035 - 0.08 * r;
        Q.chest = 0.04 - 0.1 * r;
        Q.neck = 0.24 - 0.95 * r;
        Q.head = -0.2 - 0.45 * r + 0.03 * r * Math.sin(t * 21);
        Q.hy = 0.04 * r * Math.sin(t * 2.5);
        Q.tail = 0.32 + 0.1 * r;
        Q.wag = 0.1 + 0.3 * r;
        Q.wagF = 1.4 + 6 * r;
        for (const k of ["BL", "BR"]) L[k].dz = 0.05 * r;
        break;
      }
      case "defeat": {
        // Vorderbeine knicken ein, dann die Hinterbeine, der Koerper kippt auf die Seite, die Beine werden schlaff
        const fr = ease(seg(u, 0, 0.35));
        const bk = ease(seg(u, 0.25, 0.6));
        const roll = ease(seg(u, 0.45, 0.9));
        Q.hips = 0.02 + 0.22 * fr - 0.15 * bk;
        Q.spine = 0.05 * fr;
        Q.y = -0.03 - 0.12 * fr - 0.18 * bk + 0.42 * roll;
        Q.rz = 1.42 * roll;
        Q.x = 0.62 * roll;
        Q.neck = 0.24 + 0.25 * fr - 0.15 * roll;
        Q.head = -0.2 + 0.25 * fr + 0.05 * roll;
        Q.hy = 0;
        Q.tail = 0.32 - 0.5 * fr;
        Q.wag = 0.02 * (1 - roll);
        for (const k of LEGS) {
          const l = L[k];
          l.body = roll;
          l.dyB = k[0] === "F" ? 0.14 : 0.1;
          l.dzB = k[0] === "F" ? 0.08 : -0.04;
          l.flex = k[0] === "F" ? -0.6 * roll : 0.3 * roll;
        }
        break;
      }
    }
    return Q;
  }

  // Gelenkrechnung eines Beins: Pfotenspitze und Pfotenneigung im Raum des Elternknochens
  function solveLeg(l, tip, a3) {
    const J = l.J1;
    const sn = Math.sin(a3);
    const cs = Math.cos(a3);
    // Punkt am Ende von Unterarm oder Unterschenkel
    const ty0 = tip.y + l.l3 * cs;
    const tz0 = tip.z - l.l3 * sn;
    let dy = ty0 - J.y;
    let dz = tz0 - J.z;
    let d = Math.hypot(dy, dz);
    const aD = Math.atan2(dz, -dy);
    d = Math.max(Math.abs(l.l1 - l.l2) * 1.05 + 1e-3, Math.min((l.l1 + l.l2) * 0.999, d));
    const ca = (l.l1 * l.l1 + d * d - l.l2 * l.l2) / (2 * l.l1 * d);
    const A = Math.acos(Math.max(-1, Math.min(1, ca)));
    const a1 = aD + l.bend * A;
    const ky = J.y - l.l1 * Math.cos(a1);
    const kz = J.z + l.l1 * Math.sin(a1);
    const ty = J.y - d * Math.cos(aD);
    const tz = J.z + d * Math.sin(aD);
    const a2 = Math.atan2(tz - kz, -(ty - ky));
    const t1 = l.a1r - a1;
    const t2 = l.a2r - a2 - t1;
    const t3 = l.a3r - a3 - t1 - t2;
    return [t1, t2, t3];
  }

  function poseQuad(m, name, u) {
    const P = m.parts;
    const Qr = P.quad;
    const t = m.t;
    if (name === "defeat" && !m.anim) u = 1;
    if (P.hitSide == null) P.hitSide = Math.random() < 0.5 ? -1 : 1;
    if (name !== "hit" && name !== "block") P.hitSide = null;
    const Q = quadPose(name, u, t, P.hitSide || 1);
    if (name === "defeat" && Qr.wings.length) {
      // Drachen kippen nicht auf die Seite (ein Fluegel stuende in den Himmel, der andere im Boden), sondern sinken
      // auf den Bauch: Beine knicken ein, Hals und Kopf legen sich ab, die Fluegel fallen schlaff herab
      const e = ease(seg(u, 0, 0.75));
      Q.rz = 0.12 * e;
      Q.x = 0;
      Q.y = -0.03 - 0.3 * (P.meta.height || 1.15) * e;
      Q.hips = 0.02 + 0.06 * e;
      Q.spine = 0.03 * e;
      Q.neck = 0.24 + 0.45 * e;
      Q.head = -0.2 + 0.2 * e;
      Q.tail = 0.32 - 0.2 * e;
      for (const k of LEGS) {
        Q.legs[k].body = e;
        Q.legs[k].flex = (k[0] === "F" ? -0.5 : 0.4) * e;
      }
    }
    const by = Qr.by;
    P.body.position.set(Q.x, Q.y, Q.z);
    P.body.rotation.set(Q.rx, Q.ry, Q.rz);
    by.hips.quaternion.setFromEuler(EU.set(Q.hips, 0, 0));
    if (by.spine) by.spine.quaternion.setFromEuler(EU.set(Q.spine, Math.sin(t * 1.1) * 0.015, 0));
    if (by.chest) by.chest.quaternion.setFromEuler(EU.set(Q.chest, 0, 0));
    if (by.neck) by.neck.quaternion.setFromEuler(EU.set(Q.neck, Q.hy * 0.4, 0));
    by.head.quaternion.setFromEuler(EU.set(Q.head, Q.hy * 0.6, Q.hz));
    Qr.tail.forEach((b, i) => {
      const sw = Math.sin(t * Q.wagF * 1.6 - i * 0.8) * Q.wag * (1 + i * 0.4);
      b.quaternion.setFromEuler(EU.set(i ? Math.sin(t * 1.2 + i) * 0.04 : Q.tail, sw, 0));
    });
    // Beine: erst Rumpf und Wirbel in die Welt rechnen, dann je Bein von Boden und Koerper in den Elternknochen
    const root = P.body.parent;
    P.body.updateMatrixWorld(true);
    const s = P.body.scale.x;
    for (const k of LEGS) {
      const l = Qr.legs[k];
      const q = Q.legs[k];
      const M = Qr.M.copy(l.parent.matrixWorld).invert();
      let tip = null;
      let a3 = 0;
      if (q.body < 1) {
        // Boden: Pfote an ihrer Ruhestelle (oder mit dem Rumpf mitgenommen) plus Versatz der Bewegung
        const v = Qr.v.set(l.tip.x * s + q.carry * Q.x, l.tip.y * s + q.dy * s, l.tip.z * s + q.carry * Q.z + q.dz * s);
        const MG = Qr.MB.multiplyMatrices(M, root.matrixWorld);
        v.applyMatrix4(MG);
        const dir = Qr.d.set(0, -Math.cos(l.a3r + q.flex), Math.sin(l.a3r + q.flex)).transformDirection(MG);
        tip = v;
        a3 = Math.atan2(dir.z, -dir.y);
      }
      if (q.body > 0) {
        // Koerper: Pfote angezogen am Rumpf (liegend)
        const MB = Qr.MB.multiplyMatrices(M, P.body.matrixWorld);
        const w = Qr.w.set(l.tip.x, l.tip.y + q.dyB, l.tip.z + q.dzB).applyMatrix4(MB);
        const dir = Qr.d.set(0, -Math.cos(l.a3r + q.flex), Math.sin(l.a3r + q.flex)).transformDirection(MB);
        const ab = Math.atan2(dir.z, -dir.y);
        if (tip) {
          tip.lerp(w, q.body);
          a3 += (ab - a3) * q.body;
        } else {
          tip = w;
          a3 = ab;
        }
      }
      const th = solveLeg(l, tip, a3);
      for (let i = 0; i < 3; i++) l.b[i].quaternion.setFromAxisAngle(XAX, th[i]);
    }
    if (Qr.wings.length) poseWings(Qr.wings, wingBeat(name, u, t));
  }
  let XAX = null;

  /* ---------- Fluegel (Drachen, Aasflatterer) ----------
     Je Seite zwei Glieder. Schlag um die Laengsachse (Z): links hebt +, rechts -; Faltung der Spitze nach innen. */
  function wingBeat(name, u, t) {
    let amp = 0.12;
    let f = 2.2;
    let fold = 0.15;
    let lift = 0;
    if (name === "walk") (amp = 0.45), (f = 7), (fold = 0.05);
    else if (name === "attack" || name === "special") {
      const k = Math.sin(PI * u);
      amp = 0.25 + 0.4 * k;
      f = 6;
      lift = 0.35 * k;
      fold = 0.05;
    } else if (name === "hit") (lift = -0.3 * Math.sin(PI * u)), (fold = 0.4 * Math.sin(PI * u));
    else if (name === "evade") (amp = 0.6), (f = 9);
    else if (name === "victory") (amp = 0.5), (f = 5), (lift = 0.3);
    else if (name === "cast") (lift = 0.4 * Math.sin(PI * u)), (amp = 0.2);
    else if (name === "defeat") (amp = 0.03 * (1 - u)), (lift = -0.5 * ease(u)), (fold = 0.9 * ease(u));
    return { a: lift + amp * Math.sin(t * f), b: amp * 0.7 * Math.sin(t * f - 0.7) + fold, fold };
  }
  function poseWings(wings, w) {
    for (const g of wings) {
      g.b[0].quaternion.setFromEuler(EU.set(0, 0, g.sx * w.a));
      if (g.b[1]) g.b[1].quaternion.setFromEuler(EU.set(0, -g.sx * w.fold * 0.6, g.sx * w.b));
    }
  }
  function wingRig(bones) {
    const out = [];
    for (const sd of ["L", "R"]) {
      const b = [1, 2].map((n) => bones.find((x) => x.name === "wing" + sd + n)).filter(Boolean);
      if (b.length) out.push({ b, sx: sd === "L" ? 1 : -1 });
    }
    return out;
  }

  /* ---------- Spinnen und Krebse (Beine strahlenfoermig um den Rumpf, from_glb.py --form spinne/krebs) ----------
     Jedes Bein hebt sich um die Achse quer zu seiner Richtung und schwingt um die Senkrechte; die Glieder darunter
     beugen sich. Gang im Wechsel zweier Gruppen (L1, R2, L3, R4 gegen die anderen). Scheren (claw.*) heben sich zum
     Angriff und zur Abwehr. */
  const UP = { x: 0, y: 1, z: 0 };
  function radialRig(bones, meta) {
    const by = {};
    for (const b of bones) by[b.name] = b;
    const legs = [];
    const head = (n) => meta.bones.find((b) => b[0] === n);
    for (const b of bones) {
      const r = b.userData.role || "";
      if (!/^(rleg|claw)\./.test(r) || !/1$/.test(b.name)) continue;
      const nm = b.name.slice(3, -1);
      const chain = [1, 2, 3].map((i) => by["leg" + nm + i]).filter(Boolean);
      const h1 = head("leg" + nm + "1");
      const h3 = head("leg" + nm + "3");
      const d = new T.Vector3(h3[3][0] - h1[2][0], 0, h3[3][2] - h1[2][2]).normalize();
      const axis = new T.Vector3().crossVectors(d, new T.Vector3(0, 1, 0)).normalize();
      const side = nm[0] === "L" ? 1 : -1;
      const row = parseInt(nm.slice(1), 10) || 1;
      legs.push({ chain, d, axis, claw: r.indexOf("claw") === 0, side, row, grp: (row + (side > 0 ? 0 : 1)) % 2, front: d.z });
    }
    const maxFront = Math.max(...legs.filter((l) => !l.claw).map((l) => l.front));
    for (const l of legs) l.isFront = !l.claw && l.front > maxFront - 0.25;
    return { by, legs, q: new T.Quaternion(), q2: new T.Quaternion(), yv: new T.Vector3(0, 1, 0) };
  }
  function poseRadial(m, name, u) {
    const P = m.parts;
    const R = P.radial;
    const t = m.t;
    if (name === "defeat" && !m.anim) u = 1;
    const br = Math.sin(t * 2.1);
    let x = 0, y = br * 0.008, z = 0, pitch = 0, roll = 0, yaw = Math.sin(t * 0.5) * 0.03;
    let head = Math.sin(t * 1.7) * 0.05;
    let gait = 0, raise = 0, splay = 0, curl = 0, clawUp = 0, clawOpen = Math.max(0, Math.sin(t * 1.3)) * 0.1, hop = 0;
    switch (name) {
      case "walk":
        gait = 1;
        y += Math.abs(Math.sin(t * 9)) * 0.02;
        break;
      case "attack":
      case "special": {
        const sp = name === "special";
        const up = u < 0.35 ? ease(u / 0.35) : 1 - ease(seg(u, 0.35, 0.75));
        const strike = Math.sin(PI * seg(u, 0.35, 0.7));
        pitch = -0.45 * up + 0.2 * strike;
        raise = 1.0 * up;
        z = -0.06 * up + (sp ? 0.5 : 0.4) * strike;
        y += 0.06 * up + (sp ? 0.18 * Math.sin(PI * seg(u, 0.3, 0.7)) : 0);
        head = -0.3 * up + 0.35 * strike;
        clawUp = 0.9 * up + 0.3 * strike;
        clawOpen = 0.5 * up;
        break;
      }
      case "hit": {
        const k = u < 0.25 ? ease(u / 0.25) : 1 - ease(seg(u, 0.25, 1));
        z = -0.14 * k;
        pitch = 0.15 * k;
        splay = 0.25 * k;
        roll = 0.08 * k * Math.sin(t * 30);
        break;
      }
      case "evade":
        hop = Math.sin(PI * u);
        y += 0.18 * hop;
        z = -0.1 * hop;
        break;
      case "block":
        pitch = -0.2 * Math.sin(PI * u);
        clawUp = 0.7 * Math.sin(PI * u);
        raise = 0.4 * Math.sin(PI * u);
        break;
      case "cast":
      case "victory": {
        const k = name === "victory" ? Math.min(1, u * 5, (1 - u) * 5) : Math.sin(PI * u);
        pitch = -0.35 * k;
        raise = 0.8 * k * (0.7 + 0.3 * Math.sin(t * 8));
        clawUp = 0.8 * k * (0.7 + 0.3 * Math.sin(t * 8 + 1));
        clawOpen = 0.4 * k;
        break;
      }
      case "defeat": {
        const e = ease(u);
        y -= 0.25 * e;
        roll = 0.25 * e;
        curl = e;
        pitch = 0.1 * e;
        break;
      }
    }
    P.body.position.set(x, y, z);
    P.body.rotation.set(pitch, yaw, roll);
    if (R.by.head) R.by.head.quaternion.setFromEuler(EU.set(head, Math.sin(t * 0.8) * 0.06, 0));
    for (const l of R.legs) {
      let lift = Math.sin(t * 1.1 + l.row * 1.7 + l.side) * 0.025;
      let sw = 0;
      let k2 = 0;
      if (gait && !l.claw) {
        const p = (t * 3.2 + l.grp * 0.5) % 1;
        if (p < 0.5) {
          const w = p / 0.5;
          sw = 0.22 * (2 * w - 1);
          lift += 0.32 * Math.sin(PI * w);
          k2 = -0.25 * Math.sin(PI * w);
        } else sw = 0.22 * (1 - 2 * (p - 0.5) / 0.5);
      }
      if (l.isFront) (lift += raise), (k2 -= 0.5 * raise);
      if (l.claw) (lift += clawUp), (k2 -= 0.4 * clawUp + clawOpen);
      lift += splay * 0.6 + hop * 0.35;
      lift += curl * 0.5;
      k2 -= curl * 1.3;
      R.q.setFromAxisAngle(R.yv, sw * l.side);
      R.q2.setFromAxisAngle(l.axis, lift);
      l.chain[0].quaternion.copy(R.q).multiply(R.q2);
      if (l.chain[1]) l.chain[1].quaternion.setFromAxisAngle(l.axis, k2);
      if (l.chain[2]) l.chain[2].quaternion.setFromAxisAngle(l.axis, k2 * 0.5);
    }
  }

  /* ---------- Fliegende Bestie (from_glb.py --form flieger) ----------
     Schwebt ueber dem Boden, schlaegt mit den Fluegeln, stoesst zum Angriff herab und stuerzt bei der Niederlage. */
  const HOVER = 0.9;
  function poseFlyer(m, name, u) {
    const P = m.parts;
    const t = m.t;
    if (name === "defeat" && !m.anim) u = 1;
    let y = HOVER + Math.sin(t * 9 + PI / 2) * 0.06 + Math.sin(t * 1.3) * 0.05;
    let z = 0, x = 0, pitch = 0.1, roll = Math.sin(t * 1.7) * 0.06;
    switch (name) {
      case "attack":
      case "special": {
        const dive = Math.sin(PI * seg(u, 0.2, 0.8));
        const back = u < 0.2 ? ease(u / 0.2) : 0;
        y += 0.25 * back - 0.55 * dive;
        z = -0.15 * back + 0.75 * dive;
        pitch = 0.1 - 0.2 * back + 0.6 * dive;
        break;
      }
      case "hit": {
        const k = Math.sin(PI * u);
        z = -0.25 * k;
        y += 0.1 * k;
        roll += 0.6 * k;
        pitch -= 0.4 * k;
        break;
      }
      case "evade":
        x = 0.35 * Math.sin(PI * u);
        y += 0.3 * Math.sin(PI * u);
        roll -= 0.5 * Math.sin(PI * u);
        break;
      case "victory":
        y += 0.25 * Math.sin(PI * u);
        roll += 0.3 * Math.sin(t * 3);
        break;
      case "defeat": {
        // stuerzt ab und bleibt flach mit ausgebreiteten Fluegeln liegen (nicht hochkant auf einer Fluegelspitze)
        const e = ease(u);
        y = (HOVER + 0.1) * (1 - e);
        roll = 0.15 * e;
        pitch = 0.2 * e;
        break;
      }
    }
    P.body.position.set(x, y, z);
    P.body.rotation.set(pitch, 0, roll);
    const by = P.flyer.by;
    if (by.head) by.head.quaternion.setFromEuler(EU.set(Math.sin(t * 1.9) * 0.08, Math.sin(t * 0.9) * 0.15, 0));
    const w = wingBeat(name === "idle" ? "walk" : name, u, t);
    if (name === "defeat") {
      // am Boden liegen die Fluegel ausgebreitet, ein letztes Zucken
      const e = ease(u);
      w.a = 0.2 * Math.sin(t * 9) * (1 - e) - 0.05 * e;
      w.b = 0.1 * e;
      w.fold = 0.1 * e;
    }
    poseWings(P.flyer.wings, w);
    for (const b of P.bones) if ((b.userData.role || "").indexOf("foot.") === 0) b.quaternion.setFromEuler(EU.set(0.3 + Math.sin(t * 2 + b.name.length) * 0.15, 0, 0));
  }

  BE.pose = function (m, name, u) {
    const P = m.parts;
    const form = P.meta.form;
    if (P.quad === undefined) {
      if (!XAX) XAX = new T.Vector3(1, 0, 0);
      if (!EU) EU = new T.Euler();
      P.quad = form === "spinne" || form === "krebs" || form === "flieger" ? null : quadRig(P.bones, P.meta);
      if (P.quad) P.quad.wings = wingRig(P.bones);
      if (form === "spinne" || form === "krebs") P.radial = radialRig(P.bones, P.meta);
      if (form === "flieger") P.flyer = { by: Object.fromEntries(P.bones.map((b) => [b.name, b])), wings: wingRig(P.bones) };
    }
    if (P.radial) poseRadial(m, name, u);
    else if (P.flyer) poseFlyer(m, name, u);
    else if (P.quad) poseQuad(m, name, u);
    else poseBasic(m, name, u);
  };
})();
