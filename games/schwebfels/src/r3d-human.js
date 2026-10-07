/* Helden von Schwebfels - modellierte Helden (Version 5).
   Koerper aus dem Modellpaket: ein gehaeuteter Koerper je Volk und Geschlecht mit 30 Knochen,
   Augen, Haaren und zehn austauschbaren Ausruestungsteilen. Bewegungen werden wie bisher im Code
   erzeugt (Ruhe, Gang, Angriff, Zauber, Schuss, Treffer, Ausweichen, Block, Sieg, Niederlage, Sitzen). */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const R = (SB.R3D = SB.R3D || {});
  const HU = (R.human = R.human || {});
  const PI = Math.PI;
  let T = null;

  const OLD_RACE = { wolkling: "albier", steinbart: "kreidezwerg", hornvolk: "trollblut", nebelalb: "sidhe", moosling: "moorling" };
  const OLD_CLS = { klinge: "schildritter", wind: "mondschuetze", rune: "runenwirker" };

  HU.ok = function () {
    return !!(SB.assets && SB.assets.data && SB.assets.data.humans && R.ready && R.ready());
  };
  const H = () => SB.assets.data.humans;

  function profileKey(race, gender) {
    const P = H().profiles;
    race = OLD_RACE[race] || race;
    const k = race + "." + (gender === "w" ? "f" : "m");
    return P[k] ? k : "albier." + (gender === "w" ? "f" : "m");
  }
  HU.profileKey = profileKey;

  /* ---------- Geometrie je Profil (einmal berechnet) ---------- */
  function smoothNormals(pos, idx) {
    const n = pos.length / 3;
    const nr = new Float32Array(n * 3);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a];
      const uy = pos[b + 1] - pos[a + 1];
      const uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a];
      const vy = pos[c + 1] - pos[a + 1];
      const vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) {
        nr[k] += nx;
        nr[k + 1] += ny;
        nr[k + 2] += nz;
      }
    }
    // Naehte (gleiche Lage, andere UV) zusammenfassen, damit keine Kanten sichtbar werden
    const map = new Map();
    for (let i = 0; i < n; i++) {
      const key = Math.round(pos[i * 3] * 2e4) + "," + Math.round(pos[i * 3 + 1] * 2e4) + "," + Math.round(pos[i * 3 + 2] * 2e4);
      const l = map.get(key);
      if (l) l.push(i);
      else map.set(key, [i]);
    }
    for (const l of map.values()) {
      if (l.length < 2) continue;
      let x = 0;
      let y = 0;
      let z = 0;
      for (const i of l) {
        x += nr[i * 3];
        y += nr[i * 3 + 1];
        z += nr[i * 3 + 2];
      }
      for (const i of l) {
        nr[i * 3] = x;
        nr[i * 3 + 1] = y;
        nr[i * 3 + 2] = z;
      }
    }
    for (let i = 0; i < n; i++) {
      const x = nr[i * 3];
      const y = nr[i * 3 + 1];
      const z = nr[i * 3 + 2];
      const l = Math.hypot(x, y, z) || 1;
      nr[i * 3] = x / l;
      nr[i * 3 + 1] = y / l;
      nr[i * 3 + 2] = z / l;
    }
    return nr;
  }
  HU.smoothNormals = smoothNormals;

  const GEO = {};
  function bodyGeo(pk) {
    if (GEO[pk]) return GEO[pk];
    const D = H();
    const P = D.profiles[pk];
    const pos = new Float32Array(D.pos.length);
    for (let i = 0; i < pos.length; i++) pos[i] = D.pos[i] + P.d[i];
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(pos, 3));
    g.setAttribute("normal", new T.BufferAttribute(smoothNormals(pos, D.idx), 3));
    g.setAttribute("uv", new T.BufferAttribute(D.uv, 2));
    g.setAttribute("skinIndex", new T.BufferAttribute(D.skinI, 4));
    g.setAttribute("skinWeight", new T.BufferAttribute(D.skinW, 4, true));
    g.setIndex(new T.BufferAttribute(D.idx, 1));
    if (D.tex) g.computeTangents();
    g.userData.pk = pk;
    return (GEO[pk] = g);
  }
  HU.bodyGeo = bodyGeo;

  /* Teilnetz ohne verdeckte Koerperbereiche (Bitmaske je Dreieck, z. B. unter einer Ruestung) */
  const SUB = {};
  function bodySubset(pk, hideKey, hideFn) {
    const k = pk + "|" + hideKey;
    if (SUB[k]) return SUB[k];
    const full = bodyGeo(pk);
    if (!hideKey) return full;
    const D = H();
    const idx = D.idx;
    const out = [];
    for (let t = 0; t < idx.length / 3; t++) if (!hideFn(t)) out.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
    const g = new T.BufferGeometry();
    for (const name of ["position", "normal", "uv", "skinIndex", "skinWeight", "tangent"]) if (full.getAttribute(name)) g.setAttribute(name, full.getAttribute(name));
    g.setIndex(out);
    return (SUB[k] = g);
  }
  HU.bodySubset = bodySubset;

  /* Geglaettete Koerperform je Profil (fuer lockeren Stoff); gleiches Verfahren wie assets-src/bindlib.py */
  const SOFT = {};
  function softBody(pk, iters) {
    const k = pk + "|" + iters;
    if (SOFT[k]) return SOFT[k];
    const g = bodyGeo(pk);
    const src = g.attributes.position.array;
    const n = src.length / 3;
    const canon = new Int32Array(n);
    const map = new Map();
    let m = 0;
    for (let i = 0; i < n; i++) {
      const key = Math.round(src[i * 3] * 2e4) + "," + Math.round(src[i * 3 + 1] * 2e4) + "," + Math.round(src[i * 3 + 2] * 2e4);
      let c = map.get(key);
      if (c === undefined) {
        c = m++;
        map.set(key, c);
      }
      canon[i] = c;
    }
    let P = new Float64Array(m * 3);
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) P[canon[i] * 3 + j] = src[i * 3 + j];
    const nb = Array.from({ length: m }, () => new Set());
    const idx = H().idx;
    for (let t = 0; t < idx.length; t += 3) {
      const a = canon[idx[t]];
      const b = canon[idx[t + 1]];
      const c = canon[idx[t + 2]];
      nb[a].add(b).add(c);
      nb[b].add(a).add(c);
      nb[c].add(a).add(b);
    }
    const nbl = nb.map((s) => Int32Array.from(Array.from(s).sort((x, y) => x - y)));
    for (let it = 0; it < iters; it++) {
      const Q = new Float64Array(m * 3);
      for (let i = 0; i < m; i++) {
        const L = nbl[i];
        if (!L.length) {
          Q[i * 3] = P[i * 3];
          Q[i * 3 + 1] = P[i * 3 + 1];
          Q[i * 3 + 2] = P[i * 3 + 2];
          continue;
        }
        let x = 0;
        let y = 0;
        let z = 0;
        for (let j = 0; j < L.length; j++) {
          x += P[L[j] * 3];
          y += P[L[j] * 3 + 1];
          z += P[L[j] * 3 + 2];
        }
        x /= L.length;
        y /= L.length;
        z /= L.length;
        Q[i * 3] = P[i * 3] + (x - P[i * 3]) * 0.5;
        Q[i * 3 + 1] = P[i * 3 + 1] + (y - P[i * 3 + 1]) * 0.5;
        Q[i * 3 + 2] = P[i * 3 + 2] + (z - P[i * 3 + 2]) * 0.5;
      }
      P = Q;
    }
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) pos[i * 3 + j] = P[canon[i] * 3 + j];
    return (SOFT[k] = { pos, nrm: smoothNormals(pos, idx) });
  }

  /* ---------- Gebundene Teile: Haare, Baerte, Kleidung ----------
     Jede Ecke haengt an einem Koerperdreieck (baryzentrisch plus Versatz im Dreiecksrahmen) und erbt
     dessen Hautgewichte. So passt jedes Teil ohne eigene Anpassung auf alle Voelker und Geschlechter. */
  const BOUND = {};
  function boundGeo(key, pk) {
    const ck = key + "|" + pk;
    if (BOUND[ck]) return BOUND[ck];
    const piece = SB.assets.data.pieces[key];
    if (!piece) return null;
    const soft = piece.meta && piece.meta.soft ? softBody(pk, piece.meta.soft) : null;
    const bg = bodyGeo(pk);
    const bp = soft ? soft.pos : bg.attributes.position.array;
    const bn = soft ? soft.nrm : bg.attributes.normal.array;
    const D = H();
    const idx = D.idx;
    const SI = D.skinI;
    const SW = D.skinW;
    const n = piece.tri.length;
    const pos = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const acc = new Float32Array(32);
    for (let i = 0; i < n; i++) {
      const t = piece.tri[i] * 3;
      const a = idx[t];
      const b = idx[t + 1];
      const c = idx[t + 2];
      const w0 = piece.bc[i * 2];
      const w1 = piece.bc[i * 2 + 1];
      const w2 = Math.max(0, 1 - w0 - w1);
      const A = a * 3;
      const Bq = b * 3;
      const Cq = c * 3;
      const px = bp[A] * w0 + bp[Bq] * w1 + bp[Cq] * w2;
      const py = bp[A + 1] * w0 + bp[Bq + 1] * w1 + bp[Cq + 1] * w2;
      const pz = bp[A + 2] * w0 + bp[Bq + 2] * w1 + bp[Cq + 2] * w2;
      let nx = bn[A] * w0 + bn[Bq] * w1 + bn[Cq] * w2;
      let ny = bn[A + 1] * w0 + bn[Bq + 1] * w1 + bn[Cq + 1] * w2;
      let nz = bn[A + 2] * w0 + bn[Bq + 2] * w1 + bn[Cq + 2] * w2;
      let l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      let ex = bp[Bq] - bp[A];
      let ey = bp[Bq + 1] - bp[A + 1];
      let ez = bp[Bq + 2] - bp[A + 2];
      const dd = ex * nx + ey * ny + ez * nz;
      ex -= nx * dd;
      ey -= ny * dd;
      ez -= nz * dd;
      l = Math.hypot(ex, ey, ez) || 1;
      ex /= l;
      ey /= l;
      ez /= l;
      const bx = ny * ez - nz * ey;
      const by = nz * ex - nx * ez;
      const bz = nx * ey - ny * ex;
      const o0 = piece.off[i * 3];
      const o1 = piece.off[i * 3 + 1];
      const o2 = piece.off[i * 3 + 2];
      pos[i * 3] = px + nx * o0 + ex * o1 + bx * o2;
      pos[i * 3 + 1] = py + ny * o0 + ey * o1 + by * o2;
      pos[i * 3 + 2] = pz + nz * o0 + ez * o1 + bz * o2;
      // Gewichte der drei Ecken mischen, die vier staerksten behalten
      acc.fill(0);
      for (const [v, w] of [[a, w0], [b, w1], [c, w2]]) for (let k = 0; k < 4; k++) acc[SI[v * 4 + k]] += (SW[v * 4 + k] / 255) * w;
      for (let k = 0; k < 4; k++) {
        let best = 0;
        for (let j = 1; j < 32; j++) if (acc[j] > acc[best]) best = j;
        si[i * 4 + k] = best;
        sw[i * 4 + k] = acc[best];
        acc[best] = -1;
      }
      const s = sw[i * 4] + sw[i * 4 + 1] + sw[i * 4 + 2] + sw[i * 4 + 3] || 1;
      for (let k = 0; k < 4; k++) sw[i * 4 + k] = Math.max(0, sw[i * 4 + k]) / s;
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(pos, 3));
    g.setAttribute("normal", new T.BufferAttribute(smoothNormals(pos, piece.idx), 3));
    g.setAttribute("uv", new T.BufferAttribute(piece.uv, 2));
    if (piece.col) {
      const c3 = new Uint8Array(n * 3);
      for (let i = 0; i < n; i++) c3[i * 3] = c3[i * 3 + 1] = c3[i * 3 + 2] = piece.col[i];
      g.setAttribute("color", new T.BufferAttribute(c3, 3, true));
    }
    g.setAttribute("skinIndex", new T.BufferAttribute(si, 4));
    g.setAttribute("skinWeight", new T.BufferAttribute(sw, 4));
    g.setIndex(new T.BufferAttribute(piece.idx, 1));
    return (BOUND[ck] = g);
  }
  HU.boundGeo = boundGeo;
  // ein gebundenes Teil an das Skelett eines Helden haengen
  function attachBound(parts, key, mat) {
    const g = boundGeo(key, parts.pk);
    if (!g) return null;
    const m = new T.SkinnedMesh(g, mat);
    m.bind(parts.mesh.skeleton, parts.mesh.bindMatrix);
    m.frustumCulled = false;
    m.castShadow = true;
    parts.body.add(m);
    return m;
  }
  HU.attachBound = attachBound;

  /* Haarmaterial: Straehnenbild entlang der Laenge, dunklere Ansaetze (Eckfarbe) */
  let HAIR_TEX = null;
  function hairTex() {
    if (HAIR_TEX) return HAIR_TEX;
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#c8c8c8";
    g.fillRect(0, 0, 64, 256);
    const r = R.rng(11);
    for (let i = 0; i < 90; i++) {
      const x = r() * 64;
      const w = 0.6 + r() * 2.2;
      const v = Math.floor(150 + r() * 105);
      g.fillStyle = "rgba(" + v + "," + v + "," + v + "," + (0.35 + r() * 0.5) + ")";
      g.fillRect(x, 0, w, 256);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = "rgba(60,60,60," + 0.15 * r() + ")";
      g.fillRect(r() * 64, 0, 1 + r() * 3, 256);
    }
    HAIR_TEX = new T.CanvasTexture(c);
    HAIR_TEX.wrapS = HAIR_TEX.wrapT = T.RepeatWrapping;
    HAIR_TEX.colorSpace = T.SRGBColorSpace;
    return HAIR_TEX;
  }
  function hairMat(color) {
    const k = "hair" + color;
    if (MATS[k]) return MATS[k];
    const m = new T.MeshStandardMaterial({ color: new T.Color(color), map: hairTex(), vertexColors: true, roughness: 0.5, metalness: 0.0 });
    return (MATS[k] = m);
  }
  HU.hairMat = hairMat;

  /* ---------- Skelett ---------- */
  function makeRig(pk) {
    return makeRigJ(H().profiles[pk].j);
  }
  function makeRigJ(J) {
    const D = H();
    const bones = D.bones.map((b) => {
      const bone = new T.Bone();
      bone.name = b[0];
      return bone;
    });
    const by = {};
    D.bones.forEach((b, i) => {
      const bone = bones[i];
      const p = b[1];
      if (p < 0) bone.position.set(J[i * 3], J[i * 3 + 1], J[i * 3 + 2]);
      else {
        bone.position.set(J[i * 3] - J[p * 3], J[i * 3 + 1] - J[p * 3 + 1], J[i * 3 + 2] - J[p * 3 + 2]);
        bones[p].add(bone);
      }
      bone.userData.p0 = bone.position.clone();
      by[b[0]] = bone;
    });
    return { bones, by, J };
  }
  // Weltlage eines Gelenks in Ruhehaltung
  function jointOf(rig, name) {
    const i = H().bones.findIndex((b) => b[0] === name);
    return new T.Vector3(rig.J[i * 3], rig.J[i * 3 + 1], rig.J[i * 3 + 2]);
  }
  HU.jointOf = jointOf;

  /* ---------- Augen ---------- */
  const EYE_TEX = {};
  function eyeTexture(color, glow) {
    const k = color + (glow ? "g" : "");
    if (EYE_TEX[k]) return EYE_TEX[k];
    const S = 128;
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    const g = c.getContext("2d");
    // Kugelabwicklung: Mitte des Bildes ist die Blickrichtung
    g.fillStyle = "#bdb3a8";
    g.fillRect(0, 0, S, S);
    const cx = S * 0.25;
    const cy = S * 0.5;
    const iris = g.createRadialGradient(cx, cy, 1, cx, cy, S * 0.11);
    iris.addColorStop(0, "#111");
    iris.addColorStop(0.32, "#111");
    iris.addColorStop(0.36, color);
    iris.addColorStop(0.85, color);
    iris.addColorStop(1, "#2a2420");
    g.fillStyle = iris;
    g.beginPath();
    g.ellipse(cx, cy, S * 0.055, S * 0.11, 0, 0, PI * 2);
    g.fill();
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return (EYE_TEX[k] = tex);
  }
  const eyeGeo = () => R.geo.sph(1, 16, 12);

  /* ---------- Materialien ---------- */
  const MATS = {};
  const TAT_A = { runen: [1, 0, 0], knoten: [0, 1, 0], kriegsbemalung: [0, 0, 1] };
  const TAT_B = { linien: [1, 0, 0], mond: [0, 1, 0], dornen: [0, 0, 1] };
  const SCAR = { auge: [1, 0, 0], wange: [0, 1, 0], kreuz: [0, 0, 1] };
  function tex(name, srgb) {
    const tx = H().tex;
    return tx && tx[name] ? SB.assets.texture("human." + name, tx[name], { srgb }) : null;
  }
  // Hautmaterial: Hautfarbe mal gemaltes Hautbild, darueber Augenbrauen, Lippen, Taetowierung und Narben
  function skinMat(look, D) {
    const tc = D.TATTOO_COLORS.find((t) => t.c === look.tattooColor) || {};
    const k = ["skin", look.skin, look.hair, look.tattoo, look.tattooColor, look.scar].join("|");
    if (MATS[k]) return MATS[k];
    const m = new T.MeshStandardMaterial({ color: new T.Color(look.skin), roughness: 0.58, metalness: 0, map: tex("detail", true), normalMap: tex("normal", false) });
    m.normalScale = new T.Vector2(0.9, 0.9);
    const tx = H().tex;
    if (tx) {
      const hair = new T.Color(look.hair).multiplyScalar(0.7);
      const U = {
        uFaceA: { value: tex("faceA", false) },
        uFaceB: { value: tex("faceB", false) },
        uFaceC: { value: tex("faceC", false) },
        uFaceD: { value: tex("faceD", false) },
        uFaceBox: { value: new T.Vector4(tx.faceBox[0], tx.faceBox[1], tx.faceBox[2], tx.faceBox[3]) },
        uBrow: { value: new T.Vector3(hair.r, hair.g, hair.b) },
        uTatA: { value: new T.Vector3().fromArray(TAT_A[look.tattoo] || [0, 0, 0]) },
        uTatB: { value: new T.Vector3().fromArray(TAT_B[look.tattoo] || [0, 0, 0]) },
        uScar: { value: new T.Vector3().fromArray(SCAR[look.scar] || [0, 0, 0]) },
        uTatCol: { value: new T.Color(look.tattooColor || "#2f5fd0") },
        uTatGlow: { value: tc.glow ? 1.4 : 0 },
      };
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.fragmentShader = sh.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform sampler2D uFaceA, uFaceB, uFaceC, uFaceD; uniform vec4 uFaceBox; uniform vec3 uBrow, uTatA, uTatB, uScar, uTatCol; uniform float uTatGlow;"
          )
          .replace(
            "#include <map_fragment>",
            [
              "#include <map_fragment>",
              "vec2 fbUv = (vMapUv - uFaceBox.xy) / uFaceBox.zw;",
              "float inBox = step(0.0, fbUv.x) * step(fbUv.x, 1.0) * step(0.0, fbUv.y) * step(fbUv.y, 1.0);",
              "vec3 fa = texture2D(uFaceA, fbUv).rgb * inBox; vec3 fb = texture2D(uFaceB, fbUv).rgb * inBox;",
              "vec3 fc = texture2D(uFaceC, fbUv).rgb * inBox; vec3 fd = texture2D(uFaceD, fbUv).rgb * inBox;",
              "diffuseColor.rgb = mix(diffuseColor.rgb, uBrow, clamp(fc.r * 0.9, 0.0, 1.0));",
              "diffuseColor.rgb *= mix(vec3(1.0), vec3(0.9, 0.7, 0.7), fc.g * 0.45);",
              "float tat = clamp(dot(fa, uTatA) + dot(fb, uTatB), 0.0, 1.0);",
              "diffuseColor.rgb = mix(diffuseColor.rgb, uTatCol, tat * 0.82);",
              "float scar = clamp(dot(fd, uScar), 0.0, 1.0);",
              "diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 0.86, 0.84), scar);",
            ].join("\n")
          )
          .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uTatCol * tat * uTatGlow;");
      };
      m.customProgramCacheKey = () => "sbskin";
    }
    return (MATS[k] = m);
  }
  HU.skinMat = skinMat;

  /* ---------- Erzeugte Figuren (Bild-zu-3D-Strecke) ----------
     Eigener Koerper mit gemalter Textur und eigenen Gelenken, gleiches Skelett und gleiche Bewegungen wie
     alle Helden. Kleidungsteile sind auf genau diesen Koerper angepasst und blenden die Haut darunter aus. */
  const GEN = () => (SB.assets.data && SB.assets.data.gen) || {};
  HU.hasGen = (key) => !!GEN()[key];
  const GGEO = {};
  function genGeo(src, ck, hide) {
    if (GGEO[ck]) return GGEO[ck];
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(src.pos, 3));
    g.setAttribute("normal", new T.BufferAttribute(smoothNormals(src.pos, src.idx), 3));
    g.setAttribute("uv", new T.BufferAttribute(src.uv, 2));
    g.setAttribute("skinIndex", new T.BufferAttribute(src.skinI, 4));
    g.setAttribute("skinWeight", new T.BufferAttribute(src.skinW, 4, true));
    let idx = src.idx;
    if (hide) {
      const out = [];
      for (let t = 0; t < idx.length / 3; t++) if (!hide(t)) out.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
      idx = new Uint32Array(out);
    }
    g.setIndex(new T.BufferAttribute(idx, 1));
    return (GGEO[ck] = g);
  }
  const GMAT = {};
  function genMat(key, ref, color) {
    if (GMAT[key]) return GMAT[key];
    const m = new T.MeshStandardMaterial({ color: new T.Color(color || "#ffffff"), roughness: 0.75, metalness: 0, map: ref ? SB.assets.texture("gen." + key, ref, { srgb: true }) : null });
    return (GMAT[key] = m);
  }
  function buildGen(desc) {
    const D = SB.data;
    const G0 = GEN()[desc.gen];
    const clsId = D.CLASSES[desc.cls] ? desc.cls : "schildritter";
    const C = D.CLASSES[clsId];
    const gear = desc.gear || {};
    const root = R.grp();
    const body = R.grp();
    root.add(body);
    const rig = makeRigJ(G0.j);
    const worn = (desc.genGear || []).filter((p) => G0.pieces[p]);
    const masks = worn.map((p) => G0.pieces[p].mask).filter(Boolean);
    const hide = masks.length ? (t) => masks.some((m) => (m[t >> 3] >> (t & 7)) & 1) : null;
    const mesh = new T.SkinnedMesh(genGeo(G0, desc.gen + "|" + worn.join(","), hide), genMat(desc.gen, G0.tex));
    mesh.add(rig.bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new T.Skeleton(rig.bones));
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    body.add(mesh);
    const prof = { j: G0.j, top: G0.top, sockets: G0.sockets };
    const parts = { root, body, mesh, rig, B: rig.by, prof, pk: "gen:" + desc.gen, gen: true };
    for (const p of worn) {
      const src = G0.pieces[p];
      const m = new T.SkinnedMesh(genGeo(src, desc.gen + "." + p, null), genMat(desc.gen + "." + p, src.tex, src.tex ? null : src.color || "#6b4a32"));
      m.bind(mesh.skeleton, mesh.bindMatrix);
      m.frustumCulled = false;
      m.castShadow = true;
      body.add(m);
    }
    if (R.gear && R.gear.attachRigid && (gear.waffe || gear.nebenhand)) R.gear.attachRigid(parts, { waffe: gear.waffe, nebenhand: gear.nebenhand }, desc.realm || C.realm);
    const model = R.makeModel(root, parts, "hero");
    model.cls = clsId;
    model.arch = C.arch;
    model.realm = desc.realm || C.realm;
    const wpn = gear.waffe;
    model.dual = !!(wpn && ["dolch", "sichel", "kurzschwert"].indexOf(wpn.base) >= 0);
    model.ranged = !!(wpn && D.BASES[wpn.base] && D.BASES[wpn.base].ranged);
    model.weaponBase = wpn ? wpn.base : null;
    model.hipH = jointOf(rig, "hips").y;
    model.height = G0.top;
    model.headY = jointOf(rig, "head").y + 0.12;
    model.projColor = "#ffd25a";
    model.rest = restPose(rig);
    return model;
  }

  /* ---------- Held ---------- */
  HU.build = function (desc) {
    T = R.T();
    const RG = R.rigged;
    if (desc.gen && GEN()[desc.gen]) return RG && RG.is(desc.gen) ? RG.build(desc, desc.gen) : buildGen(desc);
    const D = SB.data;
    const raceId = D.RACES[desc.race] ? desc.race : OLD_RACE[desc.race] || "albier";
    // Figur mit eigenem Skelett (Meshy-Strecke), die fuer dieses Volk und Geschlecht hinterlegt ist
    const auto = RG && !desc.noGen ? RG.auto(raceId, desc.gender, desc.look && desc.look.hairStyle) : null;
    if (auto) return RG.build(desc, auto);
    const race = D.RACES[raceId];
    const clsId = D.CLASSES[desc.cls] ? desc.cls : OLD_CLS[desc.cls] || "schildritter";
    const C = D.CLASSES[clsId];
    const arch = C.arch;
    const look = Object.assign({ skin: race.skins[0], hair: race.hairs[0], hairStyle: 0, beard: 0, eyes: "#3a2a1e", tattoo: "keine", tattooColor: "#2f5fd0", scar: "keine", horns: 0 }, desc.look || {});
    const gear = desc.gear || {};
    const pk = profileKey(raceId, desc.gender);
    const prof = H().profiles[pk];
    const root = R.grp();
    const body = R.grp();
    root.add(body);
    const rig = makeRig(pk);
    const mesh = new T.SkinnedMesh(bodyGeo(pk), skinMat(look, D));
    mesh.add(rig.bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new T.Skeleton(rig.bones));
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    body.add(mesh);
    const parts = { root, body, mesh, rig, B: rig.by, prof, pk };

    // Augen am Kopfknochen
    const eyeInfo = D.EYES.find((e) => e.c === look.eyes) || {};
    const glow = !!eyeInfo.glow || !!desc.undead;
    const eyeM = new T.MeshStandardMaterial({ map: eyeTexture(look.eyes, glow), roughness: 0.25, emissive: glow ? new T.Color(look.eyes) : new T.Color(0), emissiveIntensity: glow ? 0.9 : 0 });
    const hj = jointOf(rig, "head");
    for (let i = 0; i < 2; i++) {
      const e = prof.eyes;
      const r = e[i * 4 + 3] * 0.9;
      const eye = new T.Mesh(eyeGeo(), eyeM);
      eye.scale.setScalar(r);
      eye.position.set(e[i * 4] - hj.x, e[i * 4 + 1] - hj.y, e[i * 4 + 2] - hj.z - r * 0.06);
      rig.by.head.add(eye);
    }

    // Haare und Bart
    const hs = look.hairStyle | 0;
    if (hs !== 4) parts.hairMesh = attachBound(parts, "hair." + hs, hairMat(look.hair));
    if (look.beard) attachBound(parts, "beard." + (look.beard | 0), hairMat(look.hair));
    // Kleidung und Ausruestung; geschlossene Kopfteile verdecken das Haupthaar (der Bart bleibt)
    if (R.gear && R.gear.dressHero) parts.gearMeshes = R.gear.dressHero(parts, gear, { arch, culture: desc.realm || C.realm, look });
    if (parts.hidesHair && parts.hairMesh) parts.hairMesh.visible = false;

    const model = R.makeModel(root, parts, "hero");
    model.cls = clsId;
    model.arch = arch;
    model.realm = desc.realmDef ? null : desc.realm || C.realm;
    const wpn = gear.waffe;
    model.dual = !!(wpn && ["dolch", "sichel", "kurzschwert"].indexOf(wpn.base) >= 0);
    model.ranged = !!(wpn && D.BASES[wpn.base] && D.BASES[wpn.base].ranged);
    model.weaponBase = wpn ? wpn.base : null;
    model.hipH = jointOf(rig, "hips").y;
    model.height = prof.top;
    model.headY = hj.y + 0.12;
    model.projColor = arch === "magier" ? (model.realm === "albion" ? "#ffd27a" : model.realm === "midgard" ? "#9fd8ff" : "#7fffb0") : arch === "jaeger" ? "#e9d8a6" : "#ffd25a";
    model.rest = restPose(rig);
    return model;
  };

  /* ---------- Bewegung ---------- */
  // Ruhehaltung: Arme und Beine aus der A-Haltung senkrecht nach unten drehen
  function restPose(rig) {
    const out = {};
    const down = new T.Vector3(0, -1, 0);
    for (const s of ["L", "R"]) {
      for (const [a, b] of [["upperarm", "forearm"], ["thigh", "shin"]]) {
        const d = jointOf(rig, b + "." + s).sub(jointOf(rig, a + "." + s)).normalize();
        out[a + s] = new T.Quaternion().setFromUnitVectors(d, down);
      }
      // Unterarm: Rest gegenueber dem Oberarm ausgleichen
      const ua = jointOf(rig, "forearm." + s).sub(jointOf(rig, "upperarm." + s)).normalize();
      const fa = jointOf(rig, "hand." + s).sub(jointOf(rig, "forearm." + s)).normalize();
      out["forearm" + s] = new T.Quaternion().setFromUnitVectors(fa, ua);
      const th = jointOf(rig, "shin." + s).sub(jointOf(rig, "thigh." + s)).normalize();
      const sh = jointOf(rig, "foot." + s).sub(jointOf(rig, "shin." + s)).normalize();
      out["shin" + s] = new T.Quaternion().setFromUnitVectors(sh, th);
    }
    return out;
  }

  let QA = null;
  let EU = null;
  function rot(bone, x, y, z, pre) {
    if (!EU) {
      EU = new T.Euler();
      QA = new T.Quaternion();
    }
    EU.set(x, y, z, "XYZ");
    QA.setFromEuler(EU);
    if (pre) QA.multiply(pre);
    bone.quaternion.copy(QA);
  }
  HU.pose = function (m, name, u, dt) {
    const P = m.parts;
    // Figuren mit eigenem Skelett spielen Clips ab (src/r3d-rigged.js)
    if (P.clips) return P.clips.tick(dt || 0);
    const B = P.B;
    const t = m.t;
    const s = R.stance(m);
    const br = Math.sin(t * 2.1);
    let shL = s.shL.slice();
    let shR = s.shR.slice();
    let elL = s.elL + br * 0.04;
    let elR = s.elR - br * 0.04;
    let hipL = s.hipL;
    let hipR = s.hipR;
    let knL = s.knL;
    let knR = s.knR;
    let lean = s.lean + br * 0.015;
    let twist = s.twist;
    let y = s.y + br * 0.012;
    let headX = s.head + Math.sin(t * 1.1) * 0.03;
    let rootRX = 0;
    let rootRZ = 0;
    let rootY = 0;
    const gripL = m.gripL != null ? m.gripL : P.gripL != null ? P.gripL : 0.3;
    const gripR = m.gripR != null ? m.gripR : P.gripR != null ? P.gripR : 0.3;
    const st = R.poseState(m, name, u, s, { shL, shR, elL, elR, hipL, hipR, knL, knR, lean, twist, y, headX, rootRX, rootRZ, rootY });
    ({ shL, shR, elL, elR, hipL, hipR, knL, knR, lean, twist, y, headX, rootRX, rootRZ, rootY } = st);
    const RP = m.rest;
    P.body.position.y = y + rootY;
    P.body.rotation.x = rootRX;
    P.body.rotation.z = rootRZ;
    rot(B.spine, lean * 0.45, twist * 0.4, 0);
    rot(B.chest, lean * 0.55, twist * 0.6, 0);
    rot(B.neck, (headX - lean * 0.6) * 0.4, 0, 0);
    rot(B.head, (headX - lean * 0.6) * 0.6, 0, 0);
    rot(B["upperarm.L"], shL[0], 0, shL[1], RP.upperarmL);
    rot(B["upperarm.R"], shR[0], 0, shR[1], RP.upperarmR);
    rot(B["forearm.L"], elL, 0, 0, RP.forearmL);
    rot(B["forearm.R"], elR, 0, 0, RP.forearmR);
    rot(B["thigh.L"], hipL, 0, 0, RP.thighL);
    rot(B["thigh.R"], hipR, 0, 0, RP.thighR);
    rot(B["shin.L"], knL, 0, 0, RP.shinL);
    rot(B["shin.R"], knR, 0, 0, RP.shinR);
    rot(B["foot.L"], -(hipL + knL) * 0.7, 0, 0);
    rot(B["foot.R"], -(hipR + knR) * 0.7, 0, 0);
    curl(B, "L", gripL, P.prof.sockets.gripL.axis);
    curl(B, "R", gripR, P.prof.sockets.gripR.axis);
    if (P.focus) {
      // Fokus schwebt und dreht sich langsam
      P.focus.position.copy(P.focus.userData.hover);
      P.focus.position.y += 0.11 + Math.sin(t * 2.2) * 0.012;
      P.focus.rotation.y = t * 0.8;
    }
    if (R.human.afterPose) R.human.afterPose(m, name, u, st);
  };

  const AX = {};
  function curl(B, side, k, axis) {
    if (!AX[side]) AX[side] = new T.Vector3();
    const a = AX[side].set(axis[0], axis[1], axis[2]).normalize();
    const sgn = side === "L" ? -1 : 1;
    B["fing1." + side].quaternion.setFromAxisAngle(a, sgn * k * 1.25);
    B["fing2." + side].quaternion.setFromAxisAngle(a, sgn * k * 1.45);
    B["thumb1." + side].quaternion.setFromAxisAngle(a, sgn * k * 0.35);
    B["thumb2." + side].quaternion.setFromAxisAngle(a, sgn * k * 0.6);
  }
})();
