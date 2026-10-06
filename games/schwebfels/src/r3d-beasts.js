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
  BE.familyOf = (arch, visual) => (visual && pack()[visual] ? visual : FAMILY[arch] && pack()[FAMILY[arch]] ? FAMILY[arch] : null);
  BE.has = (arch, visual) => !!BE.familyOf(arch, visual);

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
    const mats = geo.userData.mats.map((cls) => beastMat(cls, C));
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
    model.headY = (meta.headY || 1.4) * s;
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
  BE.pose = function (m, name, u) {
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
  };
})();
