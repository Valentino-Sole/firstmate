/* Helden von Schwebfels - modulare Ausruestung (Version 5).
   Teile aus dem Modellpaket: gebundene Schalen (passen sich jedem Koerper an), frei haengende Teile
   (Roecke, Umhaenge) und feste Teile (Waffen, Schmuck, Helme). Materialien nach Klasse, Farben aus dem
   Gegenstand, seiner Gestaltungskultur (Albion, Midgard, Hibernia) und seiner Seltenheit. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const R = (SB.R3D = SB.R3D || {});
  const G = (R.gear = R.gear || {});
  let T = null;

  const pk = () => SB.assets.data.pieces || {};
  G.has = (key) => !!pk()[key];

  /* ---------- Farben ---------- */
  const CULT = {
    albion: { cloth: "#e8dcc4", dark: "#7a1f1f", metal: "#aab2bc", accent: "#c9a14a", glow: "#ffd27a", leather: "#6b4a30", fur: "#a08a6e", blued: "#3a4672", wrap: "#2a2f4a", gem: "#5c86ff" },
    midgard: { cloth: "#2a3566", dark: "#1c2240", metal: "#7c848e", accent: "#c8ced6", glow: "#8fe3ff", leather: "#5a3c26", fur: "#5e5e62", blued: "#34445f", wrap: "#232a3e", gem: "#46b6ff" },
    hibernia: { cloth: "#3f5a2e", dark: "#2a3a20", metal: "#9a8a60", accent: "#b08040", glow: "#9fe0c0", leather: "#5a4030", fur: "#7a6248", blued: "#2e4c44", wrap: "#22382f", gem: "#3fd18e" },
  };
  G.CULT = CULT;
  const RAR_GLOW = { gewoehnlich: 0, ungewoehnlich: 0, selten: 0.9, episch: 1.3, legendaer: 1.8 };
  function shade(hex, f) {
    const c = new T.Color(hex);
    c.multiplyScalar(f);
    return c;
  }
  G.palette = function (it, culture, extra) {
    T = R.T();
    const C = CULT[culture] || CULT.midgard;
    const rar = (it && it.rarity) || "gewoehnlich";
    const ri = ["gewoehnlich", "ungewoehnlich", "selten", "episch", "legendaer"].indexOf(rar);
    const tint = (it && it.tint) || C.cloth;
    const pal = {
      cloth: new T.Color(tint),
      cloth2: shade(tint, 0.78),
      cloth3: new T.Color((extra && extra.cloth3) || C.dark),
      band: shade(tint, ri >= 2 ? 0.45 : 0.7),
      pat: new T.Color(ri >= 4 ? (culture === "albion" ? "#e8e4f0" : "#d9b45a") : ri >= 1 ? C.accent : "#b8aa90"),
      patMetal: ri >= 1 ? 1 : 0,
      glow: new T.Color(C.glow).multiplyScalar(RAR_GLOW[rar] || 0),
      leather: new T.Color(C.leather),
      leather2: shade(C.leather, 0.55),
      metal: new T.Color(ri >= 3 ? C.accent : C.metal),
      silver: new T.Color("#c8ccd2"),
      gold: new T.Color("#c9a14a"),
      fur: new T.Color(C.fur),
      gem: new T.Color(C.gem),
      wood: new T.Color("#6b4a2f"),
      bone: new T.Color("#d8ceb8"),
      stone: new T.Color("#8a8a86"),
      felt: shade(tint, 0.8),
      veil: new T.Color(tint).lerp(new T.Color("#dfe6ee"), 0.5),
      // Waffenmaterialien: heller Klingenstahl, gebläuter Stahl der Kultur, Bronze, Elfenbein,
      // Weissgold (legendaer), Griffwicklung je Seltenheit, Sehne und Giftleuchten
      steel: new T.Color("#c3c9d0"),
      blued: new T.Color(C.blued),
      bronze: new T.Color("#a8783e"),
      ivory: new T.Color("#e4dccb"),
      pale: new T.Color("#f3eedf"),
      wrap: new T.Color(ri >= 4 ? "#7a2a24" : ri >= 2 ? C.wrap : C.leather),
      string: new T.Color("#d9d0bc"),
      venom: new T.Color("#8dff6a"),
      rune: new T.Color(C.glow),
    };
    if (extra) for (const k in extra) if (k !== "cloth3") pal[k] = new T.Color(extra[k]);
    return pal;
  };

  /* ---------- Materialien ---------- */
  const CLS = {
    cloth: { tile: "cloth", rough: 0.88, metal: 0, n: 0.6 },
    cloth2: { tile: "cloth", rough: 0.92, metal: 0, n: 0.4 },
    cloth3: { tile: "wool", rough: 0.92, metal: 0, n: 0.6 },
    leather: { tile: "leather", rough: 0.62, metal: 0, n: 0.8 },
    leather2: { tile: "leather", rough: 0.7, metal: 0, n: 0.8 },
    metal: { tile: "metal", rough: 0.36, metal: 0.85, n: 0.5 },
    silver: { tile: "brushed", rough: 0.26, metal: 1, n: 0.3 },
    gold: { tile: "brushed", rough: 0.3, metal: 1, n: 0.3 },
    fur: { tile: "fur", rough: 1, metal: 0, n: 1.2 },
    wood: { tile: "wood", rough: 0.72, metal: 0, n: 0.7 },
    bone: { tile: "bone", rough: 0.55, metal: 0, n: 0.5 },
    stone: { tile: "stone", rough: 0.9, metal: 0, n: 1 },
    chain: { tile: "chain", rough: 0.4, metal: 0.9, n: 1.2 },
    scale: { tile: "scale", rough: 0.45, metal: 0.8, n: 1.2 },
    felt: { tile: "felt", rough: 0.95, metal: 0, n: 0.5 },
    steel: { tile: "brushed", rough: 0.24, metal: 1, n: 0.25 },
    blued: { tile: "metal", rough: 0.34, metal: 0.85, n: 0.4 },
    bronze: { tile: "brushed", rough: 0.32, metal: 1, n: 0.3 },
    ivory: { tile: "bone", rough: 0.42, metal: 0, n: 0.35 },
    pale: { tile: "brushed", rough: 0.22, metal: 0.95, n: 0.2 },
    wrap: { tile: "leather", rough: 0.7, metal: 0, n: 1 },
    string: { tile: "cloth", rough: 0.8, metal: 0, n: 0.2 },
  };
  function tile(name, kind) {
    const M = SB.assets.data.mat;
    if (!M || !M.tiles[name]) return null;
    return SB.assets.texture("tile." + name + "." + kind, M.tiles[name][kind], { srgb: kind === "alb", repeat: true });
  }
  const MC = {};
  function material(cls, pal, culture) {
    T = R.T();
    const col = pal[cls] || pal.cloth;
    const key = cls + "|" + (col.getHexString ? col.getHexString() : col) + "|" + culture + "|" + pal.band.getHexString() + pal.pat.getHexString() + pal.glow.getHexString() + "|" + (pal.row || 0);
    if (MC[key]) return MC[key];
    let m;
    if (cls === "trim") m = trimMat(pal, culture);
    else if (cls === "gem" || cls === "glow" || cls === "venom" || cls === "rune") {
      // Steine satt und facettiert mit leichtem Eigenleuchten, Runen und Gift hell leuchtend
      const strong = cls !== "gem";
      m = new T.MeshStandardMaterial({ color: col.clone().multiplyScalar(strong ? 0.6 : 0.5), emissive: col.clone().multiplyScalar(strong ? 1 : 0.42), emissiveIntensity: cls === "glow" ? 1.6 : strong ? 1.2 : 1, roughness: 0.08, metalness: strong ? 0.1 : 0.35 });
      if (cls === "glow") {
        m.transparent = true;
        m.opacity = 0.75;
        m.depthWrite = false;
      }
    } else if (cls === "veil") {
      // Nebelschleier: durchscheinender Stoff mit leichtem Eigenlicht
      m = new T.MeshStandardMaterial({ color: col, map: tile("cloth", "alb"), roughness: 0.9, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false, emissive: pal.glow.clone().multiplyScalar(0.25) });
    } else if (cls === "glass") {
      m = new T.MeshStandardMaterial({ color: col, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.45 });
    } else {
      const c = CLS[cls] || CLS.cloth;
      m = new T.MeshStandardMaterial({ color: col, roughness: c.rough, metalness: c.metal, map: tile(c.tile, "alb"), normalMap: tile(c.tile, "nrm") });
      m.normalScale = new T.Vector2(c.n, c.n);
      if (c.metal > 0.5) m.envMapIntensity = 1.2;
    }
    m.side = T.FrontSide;
    return (MC[key] = m);
  }
  G.material = material;

  // Borte: Maskenbild (R Muster, G Grundband, B Leuchten) mit Bandfarbe, Metallfaden und Runenlicht
  function trimMat(pal, culture) {
    const M = SB.assets.data.mat;
    const tex = M ? SB.assets.texture("trim." + culture, M.trims[culture] || M.trims.midgard, { srgb: false, repeat: true }) : null;
    const m = new T.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.8, metalness: 0 });
    const U = { uBand: { value: pal.band.clone() }, uPat: { value: pal.pat.clone() }, uPatMetal: { value: pal.patMetal }, uGlow: { value: pal.glow.clone() }, uRow: { value: pal.row != null ? pal.row : 0 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uBand, uPat, uGlow; uniform float uPatMetal, uRow;")
        .replace("#include <map_fragment>", "vec2 tuv = vec2(vMapUv.x, (4.0 - uRow + fract(vMapUv.y * 5.0)) / 5.0);\nvec3 tm = texture2D(map, tuv).rgb;\ndiffuseColor.rgb = mix(uBand, uPat, tm.r);")
        .replace("#include <metalnessmap_fragment>", "float metalnessFactor = mix(metalness, uPatMetal, tm.r);")
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = mix(roughness, 0.32, tm.r);")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlow * tm.b;");
    };
    m.customProgramCacheKey = () => "sbtrim";
    return m;
  }

  /* ---------- Geometrie je Teil und Koerper ---------- */
  // Masse eines Profils fuer frei haengende Teile (Huefte, Brust, Kopf ...)
  const FIT = {};
  function fitOf(profKey) {
    if (FIT[profKey]) return FIT[profKey];
    const HU = R.human;
    const g = HU.bodyGeo(profKey);
    const p = g.attributes.position.array;
    const D = SB.assets.data.humans;
    const P = D.profiles[profKey];
    const J = (n) => {
      const i = D.bones.findIndex((b) => b[0] === n);
      return [P.j[i * 3], P.j[i * 3 + 1], P.j[i * 3 + 2]];
    };
    const J0 = (n) => {
      const i = D.bones.findIndex((b) => b[0] === n);
      return [D.joints[i * 3], D.joints[i * 3 + 1], D.joints[i * 3 + 2]];
    };
    // Arme und Haende nicht mitmessen (sie haengen neben der Huefte)
    const armBone = new Uint8Array(D.bones.length);
    D.bones.forEach((b, i) => (armBone[i] = /^(clavicle|upperarm|forearm|hand|thumb|fing)/.test(b[0]) ? 1 : 0));
    function span(arr, y, band, sel) {
      let x0 = 1e9;
      let x1 = -1e9;
      let z0 = 1e9;
      let z1 = -1e9;
      for (let i = 0; i < arr.length; i += 3) {
        if (Math.abs(arr[i + 1] - y) > band) continue;
        if (armBone[D.skinI[(i / 3) * 4]]) continue;
        if (sel && !sel(arr[i], arr[i + 1], arr[i + 2])) continue;
        x0 = Math.min(x0, arr[i]);
        x1 = Math.max(x1, arr[i]);
        z0 = Math.min(z0, arr[i + 2]);
        z1 = Math.max(z1, arr[i + 2]);
      }
      return [x1 - x0, z1 - z0];
    }
    const base = D.pos;
    const out = {};
    // Huefte: Breite und Tiefe auf Hueftgelenkhoehe, Laenge Huefte bis Knoechel
    {
      const a = J("hips");
      const a0 = J0("hips");
      const s = span(p, a[1], 0.02);
      const s0 = span(base, a0[1], 0.02);
      const leg = a[1] - J("foot.L")[1];
      const leg0 = a0[1] - J0("foot.L")[1];
      out.hips = { o: a, o0: a0, s: [s[0] / s0[0], leg / leg0, s[1] / s0[1]] };
    }
    {
      const a = J("chest");
      const a0 = J0("chest");
      const narrow = (x, y, z) => Math.abs(x) < 0.25;
      const s = span(p, a[1] + 0.08, 0.02, narrow);
      const s0 = span(base, a0[1] + 0.08, 0.02, narrow);
      const back = J("neck")[1] - J("hips")[1];
      const back0 = J0("neck")[1] - J0("hips")[1];
      out.chest = { o: a, o0: a0, s: [s[0] / s0[0], back / back0, s[1] / s0[1]] };
    }
    {
      const a = J("head");
      const a0 = J0("head");
      const top = P.top - a[1];
      const top0 = 2.0 - a0[1];
      const s = span(p, a[1] + 0.09, 0.015);
      const s0 = span(base, a0[1] + 0.09, 0.015);
      out.head = { o: a, o0: a0, s: [s[0] / s0[0], top / top0, s[1] / s0[1]] };
    }
    return (FIT[profKey] = out);
  }
  G.fitOf = fitOf;

  /* Querschnitte des Koerpers um die Hochachse (fuer Roecke und Umhaenge): groesster Abstand je Winkel */
  const RP = {};
  function ringProfiles(pos, profKey, yTop, yBot, zc, nr, na, withShoulders) {
    const k = profKey + "|" + yTop.toFixed(3) + "|" + yBot.toFixed(3) + "|" + zc.toFixed(3) + "|" + (withShoulders ? 1 : 0);
    if (RP[k]) return RP[k];
    const D = SB.assets.data.humans;
    const arm = new Uint8Array(D.bones.length);
    D.bones.forEach((b, i) => (arm[i] = (withShoulders ? /^(upperarm|forearm|hand|thumb|fing)/ : /^(clavicle|upperarm|forearm|hand|thumb|fing)/).test(b[0]) ? 1 : 0));
    const out = new Float32Array(nr * na);
    const n = pos.length / 3;
    let prev = null;
    for (let r = 0; r < nr; r++) {
      const y = yTop + ((yBot - yTop) * r) / (nr - 1);
      const ring = new Float32Array(na);
      for (let i = 0; i < n; i++) {
        const py = pos[i * 3 + 1];
        if (Math.abs(py - y) > 0.015) continue;
        if (arm[D.skinI[i * 4]]) continue;
        const x = pos[i * 3];
        const z = pos[i * 3 + 2] - zc;
        const th = Math.atan2(x, z);
        const b = ((Math.floor(((th + Math.PI) / (2 * Math.PI)) * na) % na) + na) % na;
        const rr = Math.hypot(x, z);
        if (rr > ring[b]) ring[b] = rr;
      }
      for (let it = 0; it < 3; it++) {
        const c = ring.slice();
        for (let b = 0; b < na; b++) ring[b] = Math.max(c[b], ((c[(b + 1) % na] + c[(b + na - 1) % na]) / 2) * 0.98);
      }
      const c = ring.slice();
      for (let b = 0; b < na; b++) ring[b] = (c[(b + 1) % na] + 2 * c[b] + c[(b + na - 1) % na]) / 4;
      if (prev) for (let b = 0; b < na; b++) ring[b] = Math.max(ring[b], prev[b] * 0.995);
      prev = ring;
      out.set(ring, r * na);
    }
    return (RP[k] = { R: out, nr, na });
  }
  function sampleRing(P, th, t) {
    const na = P.na;
    const nr = P.nr;
    const fb = (((th + Math.PI) / (2 * Math.PI)) * na - 0.5 + na) % na;
    const b0 = Math.floor(fb);
    const fa = fb - b0;
    const b1 = (b0 + 1) % na;
    const fr = Math.max(0, Math.min(nr - 1, t * (nr - 1)));
    const r0 = Math.floor(fr);
    const r1 = Math.min(nr - 1, r0 + 1);
    const ft = fr - r0;
    const g = (r, b) => P.R[r * na + b];
    return (g(r0, b0) * (1 - fa) + g(r0, b1) * fa) * (1 - ft) + (g(r1, b0) * (1 - fa) + g(r1, b1) * fa) * ft;
  }

  const GC = {};
  function pieceGeo(key, profKey, hidden) {
    const piece = pk()[key];
    if (!piece) return null;
    const meta = piece.meta;
    const hk = hidden ? hidden.key : "";
    const ck = key + "|" + profKey + "|" + (meta.mode === "bound" ? hk : "");
    if (GC[ck]) return GC[ck];
    let g;
    if (meta.mode === "bound") {
      const full = R.human.boundGeo(key, profKey);
      g = new T.BufferGeometry();
      for (const n of ["position", "normal", "uv", "skinIndex", "skinWeight"]) g.setAttribute(n, full.getAttribute(n));
      const idx = piece.idx;
      const out = [];
      const groups = [];
      // Dreiecke unter hoeher liegenden Teilen weglassen
      for (const [mat, start, count] of meta.groups) {
        const s0 = out.length;
        for (let t = start / 3; t < (start + count) / 3; t++) {
          if (hidden && piece.anch && hidden.over(piece.anch[t], meta.layer)) continue;
          out.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
        }
        groups.push([mat, s0, out.length - s0]);
      }
      g.setIndex(out);
      g.userData.groups = groups;
    } else {
      // frei haengend oder fest: Lage je Profil anpassen
      const n = piece.pos.length / 3;
      const pos = new Float32Array(n * 3);
      const f = meta.anchor ? fitOf(profKey)[meta.anchor] : null;
      if (meta.mode === "radial" && piece.rad && f) {
        // Abstand zum Koerper je Winkel und Hoehe bleibt erhalten: passt auf schmale und breite Voelker
        const D = SB.assets.data.humans;
        const bodyP = R.human.bodyGeo(profKey).attributes.position.array;
        const yT = f.o[1] + (meta.yTop - f.o0[1]) * f.s[1];
        const yB = f.o[1] + (meta.yBot - f.o0[1]) * f.s[1];
        const zc1 = (meta.zc || 0) + (f.o[2] - f.o0[2]);
        const Pb = ringProfiles(D.pos, "basis", meta.yTop, meta.yBot, meta.zc || 0, 20, 64, meta.shoulders);
        const Pp = ringProfiles(bodyP, profKey, yT, yB, zc1, 20, 64, meta.shoulders);
        for (let i = 0; i < n; i++) {
          const th = piece.rad[i * 3];
          const t = piece.rad[i * 3 + 1];
          const tc = Math.max(0, Math.min(1, t));
          const r = piece.rad[i * 3 + 2] + sampleRing(Pp, th, tc) - sampleRing(Pb, th, tc);
          pos[i * 3] = Math.sin(th) * r;
          pos[i * 3 + 1] = yT + t * (yB - yT);
          pos[i * 3 + 2] = zc1 + Math.cos(th) * r;
        }
      } else
        for (let i = 0; i < n; i++) {
          for (let k = 0; k < 3; k++) {
            const v = piece.pos[i * 3 + k];
            pos[i * 3 + k] = f ? f.o[k] + (v - f.o0[k]) * f.s[k] : v;
          }
        }
      g = new T.BufferGeometry();
      g.setAttribute("position", new T.BufferAttribute(pos, 3));
      g.setAttribute("normal", new T.BufferAttribute(piece.nrm, 3, true));
      g.setAttribute("uv", new T.BufferAttribute(piece.uv, 2));
      if (piece.skinI) {
        g.setAttribute("skinIndex", new T.BufferAttribute(piece.skinI, 4));
        g.setAttribute("skinWeight", new T.BufferAttribute(piece.skinW, 4, true));
      }
      g.setIndex(new T.BufferAttribute(piece.idx, 1));
      g.userData.groups = meta.groups;
    }
    for (const [mi, s, c] of g.userData.groups) if (c > 0) g.addGroup(s, c, g.groups.length);
    g.userData.mats = g.userData.groups.filter((x) => x[2] > 0).map((x) => x[0]);
    return (GC[ck] = g);
  }

  // Verdeckung: Koerperdreiecke unter Teilen (je Schicht)
  function makeHidden(keys) {
    const D = SB.assets.data.humans;
    const nt = D.idx.length / 3;
    const layer = new Uint8Array(nt);
    for (const k of keys) {
      const p = pk()[k];
      if (!p || !p.hide || p.meta.mode !== "bound") continue;
      const L = p.meta.layer;
      for (let t = 0; t < nt; t++) if (p.hide[t >> 3] & (1 << (t & 7)) && layer[t] < L) layer[t] = L;
    }
    return {
      key: keys.slice().sort().join(","),
      layer,
      over: (t, L) => layer[t] > L,
      body: (t) => layer[t] > 0,
    };
  }

  const MATNAMES = () => ["cloth", "cloth2", "trim", "leather", "leather2", "metal", "silver", "gold", "fur", "gem", "wood", "bone", "stone", "cloth3", "chain", "scale", "glow", "skin", "felt", "glass", "veil"];

  /* ---------- Rezepte: Grundform und Seltenheit -> Teile ----------
     Kleidung (Schalen, Roecke, Umhaenge, Stiefel, Handschuhe, Kapuzen) liegt fertig im Modellpaket;
     je Grundform ein Grundaufbau, Zusaetze je Seltenheit (Kragen, Bahnen, Mantel, Platten). Fehlt ein
     Teil, faellt die Darstellung auf die Grundkleidung zurueck. */
  const RIx = { gewoehnlich: 0, ungewoehnlich: 1, selten: 2, episch: 3, legendaer: 4 };
  G.RI = RIx;
  const CLOTH = (G.CLOTH = G.CLOTH || {});
  const pick = (...keys) => keys.filter((k) => k && G.has(k));
  // Magier: Robe, Runenrobe, Sternengewand, Druidenmantel
  CLOTH["robe.0"] = (r) => pick("robe.einfach.top", "robe.einfach.skirt", "robe.einfach.belt", r >= 2 && "robe.runen.tabard");
  CLOTH["robe.1"] = (r) => pick("robe.runen.top", "robe.runen.skirt", r >= 1 && "robe.runen.tabard", "robe.runen.belt");
  CLOTH["robe.2"] = (r) => pick("robe.stern.top", "robe.stern.skirt", r >= 1 && "robe.stern.collar", r >= 2 && "robe.stern.tabard", "robe.runen.belt");
  CLOTH["robe.3"] = (r) => pick("robe.druide.top", "robe.druide.skirt", "robe.druide.mantel", r >= 1 && "robe.druide.mantel.hood", "robe.einfach.belt");
  // Krieger: Brustharnisch, Plattenpanzer, Schuppenpanzer, Kriegsharnisch
  const shoulder = (r, big) => (big || r >= 3 ? "harnisch.schulter.gross" : "harnisch.schulter");
  const tabard = (r) => (r >= 4 ? "harnisch.wappenrock.lang" : "harnisch.wappenrock");
  CLOTH["harnisch.0"] = (r) => pick("harnisch.gambeson", "harnisch.brust", shoulder(r), tabard(r), "harnisch.guertel", r >= 1 && "harnisch.arm", r >= 2 && "harnisch.kette", r >= 3 && "harnisch.bein");
  CLOTH["harnisch.1"] = (r) => pick("harnisch.gambeson", "harnisch.brust", shoulder(r, true), "harnisch.arm", "harnisch.bein", "harnisch.beintaschen", "harnisch.guertel", r >= 2 && "harnisch.kette", r >= 4 && "harnisch.wappenrock.lang");
  CLOTH["harnisch.2"] = (r) => pick("harnisch.gambeson", "harnisch.schuppe", shoulder(r), "harnisch.kette", "harnisch.guertel", r >= 1 && "harnisch.arm", r >= 3 && tabard(r));
  CLOTH["harnisch.3"] = (r) => pick("harnisch.gambeson", "harnisch.brust", shoulder(r, true), "harnisch.arm", "harnisch.kette", tabard(r), "harnisch.bein", "harnisch.guertel", r >= 2 && "harnisch.beintaschen");
  // Schurke: Schattenwams, Nachtgewand, Diebesleder
  CLOTH["schattenwams.0"] = (r) => pick("schurke.hemd", "schurke.wams", "schurke.schoss", "schurke.guertel", "schurke.riemen.a", r >= 1 && "schurke.tuch", r >= 1 && "schurke.arm", r >= 2 && "schurke.guertel2", r >= 2 && "schurke.riemen.b", r >= 3 && "schurke.umhang");
  CLOTH["schattenwams.1"] = (r) => pick("schurke.hemd", "schurke.wams", "schurke.mantel", "schurke.guertel", "schurke.tuch", r >= 1 && "schurke.arm", r >= 2 && "schurke.riemen.a", r >= 3 && "schurke.umhang");
  CLOTH["schattenwams.2"] = (r) => pick("schurke.hemd", "schurke.wams", "schurke.schoss", "schurke.guertel", "schurke.guertel2", "schurke.riemen.a", "schurke.riemen.b", "schurke.arm", r >= 2 && "schurke.tuch", r >= 3 && "schurke.umhang");
  // Jaeger: Jaegerwams, Schuppenleder, Fellwams
  CLOTH["wams.0"] = (r) => pick("jaeger.hemd", "jaeger.weste", "jaeger.schoss", "jaeger.guertel", "jaeger.riemen", r >= 1 && "jaeger.arm", r >= 2 && "jaeger.mantel", r >= 2 && "jaeger.mantel.fur", r >= 3 && "jaeger.umhang");
  CLOTH["wams.1"] = (r) => pick("jaeger.hemd", "jaeger.schuppe", "jaeger.schoss", "jaeger.guertel", "jaeger.riemen", "jaeger.arm", r >= 2 && "jaeger.mantel", r >= 3 && "jaeger.umhang");
  CLOTH["wams.2"] = (r) => pick("jaeger.hemd", "jaeger.weste", "jaeger.schoss", "jaeger.guertel", "jaeger.mantel", "jaeger.mantel.fur", r >= 1 && "jaeger.arm", r >= 3 && "jaeger.umhang");
  // Umhaenge: Umhang, Wolfsfellmantel, Reisemantel, Nebelschleier
  CLOTH["umhang.0"] = (r) => pick("umhang.einfach", r >= 2 && "umhang.einfach.hood");
  CLOTH["umhang.1"] = (r) => pick("umhang.fell", "umhang.fell.fur", r >= 1 && "umhang.fell.hood");
  CLOTH["umhang.2"] = () => pick("umhang.reise");
  CLOTH["umhang.3"] = () => pick("umhang.nebel");
  // Stiefel und Handschuhe je Grundart (Namen aus den Spieldaten)
  const straps = (k, n) => Array.from({ length: n }, (_, i) => k + ".strap" + i);
  CLOTH["stiefel.krieger.0"] = () => pick("stiefel.eisen", "stiefel.eisen.plate");
  CLOTH["stiefel.krieger.1"] = (r) => pick("stiefel.platte", r >= 1 && "stiefel.platte.plate");
  CLOTH["stiefel.schurke.0"] = (r) => pick("stiefel.schleicher", ...straps("stiefel.schleicher", 2 + Math.min(2, r)));
  CLOTH["stiefel.schurke.1"] = () => pick("stiefel.filz");
  CLOTH["stiefel.jaeger.0"] = (r) => pick("stiefel.wander", ...straps("stiefel.wander", r >= 1 ? 2 : 1));
  CLOTH["stiefel.jaeger.1"] = () => pick("stiefel.fell", "stiefel.fell.fur");
  CLOTH["stiefel.magier.0"] = () => pick("stiefel.sandale", ...straps("stiefel.sandale", 2));
  CLOTH["stiefel.magier.1"] = () => pick("stiefel.schuh");
  CLOTH["handschuhe.krieger.0"] = (r) => pick("handschuhe.platte", "handschuhe.platte.plate");
  CLOTH["handschuhe.krieger.1"] = () => pick("handschuhe.platte", "handschuhe.platte.plate");
  CLOTH["handschuhe.schurke.0"] = () => pick("handschuhe.dieb");
  CLOTH["handschuhe.schurke.1"] = () => pick("handschuhe.dieb");
  CLOTH["handschuhe.jaeger.0"] = () => pick("handschuhe.schuetze");
  CLOTH["handschuhe.jaeger.1"] = () => pick("handschuhe.stulpe");
  CLOTH["handschuhe.magier.0"] = () => pick("handschuhe.runen");
  CLOTH["handschuhe.magier.1"] = () => pick("handschuhe.seide");
  // aeltere Spielstaende ohne Grundart in der Erscheinung
  for (const k of ["stiefel", "handschuhe"]) CLOTH[k + ".*"] = (r, V) => (CLOTH[k + ".krieger." + (V.variant % 2)] || (() => []))(r, V);
  // Kopf
  CLOTH["hut.0"] = () => pick("kopf.kapuze");
  CLOTH["hut.1"] = (r) => pick(r <= 1 && "kopf.band");
  CLOTH["hut.2"] = () => pick("kopf.kapuze");
  CLOTH["maske.0"] = () => pick("kopf.kapuze");
  CLOTH["maske.1"] = () => pick("kopf.kapuze");
  CLOTH["kappe.0"] = () => pick("kopf.kapuze");
  CLOTH["amulett.*"] = () => pick("schmuck.band");

  // Erscheinung eines getragenen Gegenstands: Grundform, Variante, Grundart, Kultur
  function visOf(it, fallbackCulture) {
    const v = it.vis || {};
    const parts = (v.f || "").split(".");
    const variant = parts.length ? parseInt(parts[parts.length - 1], 10) : NaN;
    return {
      base: it.base,
      variant: isFinite(variant) ? variant : it.variant != null ? it.variant : it.style || 0,
      arch: parts.length === 3 ? parts[1] : null,
      culture: CULT[v.c] ? v.c : fallbackCulture,
      orn: v.o || 0,
      ri: RIx[it.rarity] || 0,
      form: v.f || it.base + "." + (it.variant != null ? it.variant : it.style || 0),
    };
  }
  G.visOf = visOf;
  function clothFor(it, V) {
    const fn = CLOTH[V.form] || CLOTH[V.base + "." + V.variant] || CLOTH[V.base + ".*"];
    return fn ? fn(V.ri, V) : [];
  }

  G.dressHero = function (parts, gear, ctx) {
    T = R.T();
    const hc = ctx.culture || "midgard";
    const list = [];
    const basePal = G.palette({ tint: "#c9b892", rarity: "gewoehnlich" }, hc, { cloth3: "#3f342c" });
    const add = (it, keys) => {
      const V = visOf(it, hc);
      const pal = G.palette(it, V.culture);
      pal.row = V.ri;
      for (const k of keys) list.push({ key: k, pal, culture: V.culture });
    };
    // Ruestungssaetze bringen ab Episch einen eigenen Umhang mit; ein getragener Umhang ersetzt ihn
    const body = (gear.ruestung ? clothFor(gear.ruestung, visOf(gear.ruestung, hc)) : []).filter((k) => !(gear.umhang && /\.umhang$/.test(k)));
    if (body.length) add(gear.ruestung, body);
    else for (const k of ["base.shirt", "base.shirtskirt", "base.belt"]) list.push({ key: k, pal: basePal, culture: hc });
    if (!body.some((k) => /\.legs/.test(k))) list.push({ key: "base.pants", pal: basePal, culture: hc });
    for (const slot of ["umhang", "stiefel", "handschuhe", "helm", "amulett"]) {
      const it = gear[slot];
      if (!it) continue;
      const keys = clothFor(it, visOf(it, hc));
      if (keys.length) add(it, keys);
    }
    if (!gear.stiefel || !list.some((e) => e.key.indexOf("stiefel.") === 0)) list.push({ key: "base.shoes", pal: basePal, culture: hc });
    // Pruefansicht: nur bestimmte Teile zeigen (tests/preview.mjs, "only")
    const only = G.debugOnly || null;
    const meshes = G.attach(parts, only ? list.filter((e) => only.some((o) => e.key.indexOf(o) >= 0)) : list);
    if (only && G.debugHideBody) parts.mesh.visible = false;
    parts.hidesHair = list.some((e) => pk()[e.key] && pk()[e.key].meta.hidesHair);
    G.attachRigid(parts, gear, hc);
    return meshes;
  };

  /* ---------- Feste Teile an Haltepunkten ---------- */
  const V3 = (a) => new T.Vector3(a[0], a[1], a[2]);
  function placeOnBone(parts, obj, bone, worldP) {
    const j = R.human.jointOf(parts.rig, bone);
    obj.position.copy(V3(worldP).sub(j));
    // Feinlage aus der Bauregel: zusaetzliche Drehung und Verschiebung im eigenen Rahmen
    const u = obj.userData;
    if (u.mountOffset) obj.position.add(V3(u.mountOffset).applyQuaternion(obj.quaternion).multiplyScalar(obj.scale.y));
    if (u.mountRot) obj.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(u.mountRot[0], u.mountRot[1], u.mountRot[2])));
    parts.B[bone].add(obj);
  }
  // Griff: Schaft entlang der Griffachse (kleiner Finger zum Zeigefinger), Schneiden in Fingerrichtung
  function gripFrame(sock, mirror) {
    const Y = V3(sock.axis).normalize();
    const X = V3(sock.along);
    X.addScaledVector(Y, -X.dot(Y)).normalize();
    if (mirror) X.negate();
    const Z = new T.Vector3().crossVectors(X, Y).normalize();
    return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(X, Y, Z));
  }
  const DUAL = { dolch: 1, sichel: 1, kurzschwert: 1 };
  const HEAD_RIGID = { helm: 1, krone: 1, maske: 1, kappe: 1, hut: 1 };
  // Kopf: am Grundkopf gebaute Teile auf den Kopf des Volkes setzen
  function onHead(parts, g) {
    const f = G.fitOf(parts.pk).head;
    const j0 = V3(f.o0);
    g.children.forEach((m) => {
      if (!m.geometry.userData.headMoved) {
        m.geometry = m.geometry.clone();
        m.geometry.translate(-j0.x, -j0.y, -j0.z);
        m.geometry.userData.headMoved = true;
      }
    });
    g.scale.set(f.s[0], f.s[1], f.s[2]);
    parts.B.head.add(g);
  }
  G.attachRigid = function (parts, gear, hc) {
    const IT = R.items;
    if (!IT) return;
    const S = parts.prof.sockets;
    const build = (it, base, variant) => {
      const V = visOf(it, hc);
      const b = base || V.base;
      if (!IT.forms[b]) return null;
      const pal = G.palette(it, V.culture);
      return IT.build(b, variant != null ? variant : V.variant, it.rarity, V.culture, pal, V);
    };
    const hs = Math.max(0.85, Math.min(1.3, S.gripR.size / 0.19));
    const w = gear.waffe;
    if (w) {
      const V = visOf(w, hc);
      if (V.base === "bogen") {
        const g = build(w);
        if (g) {
          g.quaternion.copy(gripFrame(S.gripL, false));
          g.scale.setScalar(hs);
          placeOnBone(parts, g, "hand.L", S.gripL.p);
          parts.weapon = g;
          parts.gripL = 1;
        }
      } else {
        const g = build(w);
        if (g) {
          g.quaternion.copy(gripFrame(S.gripR, false));
          g.scale.setScalar(hs);
          placeOnBone(parts, g, "hand.R", S.gripR.p);
          parts.weapon = g;
          parts.gripR = 1;
          if (DUAL[V.base]) {
            const g2 = build(w);
            g2.quaternion.copy(gripFrame(S.gripL, true));
            g2.scale.set(-hs, hs, hs);
            placeOnBone(parts, g2, "hand.L", S.gripL.p);
            parts.weapon2 = g2;
            parts.gripL = 1;
          }
        }
      }
    }
    const o = gear.nebenhand;
    if (o) {
      const V = visOf(o, hc);
      const g = build(o);
      if (g) {
        if (V.base === "fokus") {
          placeOnBone(parts, g, "hand.L", S.gripL.p);
          g.userData.hover = g.position.clone();
          g.position.y += 0.12;
          parts.focus = g;
        } else if (V.base === "schild") {
          // vor der linken Faust: die Flaeche zeigt in Unterarmrichtung und nach aussen (nach dem Beugen
          // des Ellbogens also nach vorn links), die Laengsachse steht senkrecht auf Unterarm und Seite
          const a = S.armL;
          const fa = V3(a.along).normalize();
          const lat = new T.Vector3(1, 0, 0.3).normalize();
          lat.addScaledVector(fa, -lat.dot(fa)).normalize();
          const out = fa.clone().multiplyScalar(0.62).addScaledVector(lat, 0.78).normalize();
          const up = new T.Vector3().crossVectors(fa, lat).normalize();
          const X = new T.Vector3().crossVectors(up, out).normalize();
          g.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(X, up, out));
          const p = V3(S.gripL.p).addScaledVector(out, 0.075);
          placeOnBone(parts, g, "forearm.L", [p.x, p.y, p.z]);
        } else if (V.base === "koecher") {
          // schraeg auf dem Ruecken, Oeffnung ueber der rechten Schulter
          const p = S.back.p.slice();
          p[2] -= 0.05;
          g.rotation.set(0.15, 0, -0.55);
          placeOnBone(parts, g, "chest", p);
        } else if (V.base === "wurfmesser") {
          // Halterung vorne rechts am Guertel
          const p = S.belt.right.slice();
          p[0] -= 0.01;
          p[2] += 0.06;
          g.rotation.set(0, -1.1, 0);
          placeOnBone(parts, g, "hips", p);
        } else placeOnBone(parts, g, "hand.L", S.gripL.p);
        parts.offhand = g;
      }
    }
    const a = gear.amulett;
    if (a) {
      const g = build(a, "amulett");
      if (g) {
        const p = S.chest.p.slice();
        p[2] += 0.012;
        placeOnBone(parts, g, "chest", p);
        parts.amulet = g;
      }
    }
    const rg = gear.ring;
    if (rg) {
      const g = build(rg, "ring");
      if (g) {
        g.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), V3(S.gripR.along).normalize());
        placeOnBone(parts, g, "fing1.R", S.ringR.p);
        parts.ring = g;
      }
    }
    const ta = gear.talisman;
    if (ta) {
      const g = build(ta, "talisman");
      if (g) {
        const p = S.belt.left.slice();
        p[0] += 0.02;
        g.rotation.y = Math.PI / 2;
        placeOnBone(parts, g, "hips", p);
        parts.talisman = g;
      }
    }
    const h = gear.helm;
    if (h) {
      const V = visOf(h, hc);
      // Runenkrone als fester Reif; uebrige Kopfteile, sofern eine feste Bauregel besteht
      const key = V.base === "hut" && V.variant === 1 ? "krone" : IT.forms[V.base + "." + V.variant] ? V.base + "." + V.variant : IT.forms[V.base] && V.base !== "hut" ? V.base : null;
      if (key) {
        const g = build(h, key, V.variant);
        if (g) {
          onHead(parts, g);
          parts.helmet = g;
          if (g.userData.hidesHair) parts.hidesHair = true;
        }
      }
    }
  };

  /* Ein Satz Teile an den Helden haengen; list: [{key, pal, culture}] */
  G.attach = function (parts, list) {
    T = R.T();
    const keys = list.map((e) => e.key).filter((k) => pk()[k]);
    const hidden = makeHidden(keys);
    const names = MATNAMES();
    const meshes = [];
    for (const e of list) {
      const piece = pk()[e.key];
      if (!piece) continue;
      const g = pieceGeo(e.key, parts.pk, hidden);
      if (!g || !g.index || g.index.count === 0) continue;
      const mats = g.userData.mats.map((mi) => material(names[mi], e.pal, e.culture));
      let m;
      if (piece.meta.mode === "rigid") {
        m = new T.Mesh(g, mats);
        const bone = parts.B[piece.meta.bone];
        (bone || parts.body).add(m);
      } else {
        m = new T.SkinnedMesh(g, mats);
        m.bind(parts.mesh.skeleton, parts.mesh.bindMatrix);
        m.frustumCulled = false;
        parts.body.add(m);
      }
      m.castShadow = true;
      meshes.push(m);
    }
    // Koerper unter Kleidung ausblenden
    parts.mesh.geometry = R.human.bodySubset(parts.pk, hidden.key, hidden.body);
    return meshes;
  };
})();
