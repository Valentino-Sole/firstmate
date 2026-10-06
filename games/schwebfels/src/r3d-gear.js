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
    albion: { cloth: "#e8dcc4", dark: "#7a1f1f", metal: "#aab2bc", accent: "#c9a14a", glow: "#ffd27a", leather: "#6b4a30", fur: "#a08a6e" },
    midgard: { cloth: "#2a3566", dark: "#1c2240", metal: "#7c848e", accent: "#c8ced6", glow: "#8fe3ff", leather: "#5a3c26", fur: "#5e5e62" },
    hibernia: { cloth: "#3f5a2e", dark: "#2a3a20", metal: "#9a8a60", accent: "#b08040", glow: "#9fe0c0", leather: "#5a4030", fur: "#7a6248" },
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
      gem: new T.Color(C.glow),
      wood: new T.Color("#6b4a2f"),
      bone: new T.Color("#d8ceb8"),
      stone: new T.Color("#8a8a86"),
      felt: shade(tint, 0.8),
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
    const key = cls + "|" + (col.getHexString ? col.getHexString() : col) + "|" + culture + "|" + pal.band.getHexString() + pal.pat.getHexString() + pal.glow.getHexString();
    if (MC[key]) return MC[key];
    let m;
    if (cls === "trim") m = trimMat(pal, culture);
    else if (cls === "gem" || cls === "glow") {
      m = new T.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.6), emissive: col, emissiveIntensity: cls === "glow" ? 1.6 : 1.1, roughness: 0.15, metalness: 0.1 });
      if (cls === "glow") {
        m.transparent = true;
        m.opacity = 0.75;
        m.depthWrite = false;
      }
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
    const U = { uBand: { value: pal.band.clone() }, uPat: { value: pal.pat.clone() }, uPatMetal: { value: pal.patMetal }, uGlow: { value: pal.glow.clone() } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uBand, uPat, uGlow; uniform float uPatMetal;")
        .replace("#include <map_fragment>", "vec3 tm = texture2D(map, vMapUv).rgb;\ndiffuseColor.rgb = mix(uBand, uPat, tm.r);")
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

  const MATNAMES = () => ["cloth", "cloth2", "trim", "leather", "leather2", "metal", "silver", "gold", "fur", "gem", "wood", "bone", "stone", "cloth3", "chain", "scale", "glow", "skin", "felt", "glass"];

  /* Vorlaeufige Zuordnung Ausruestung -> Teile (wird durch die Rezepte aus dem Katalog ersetzt) */
  G.dressHero = function (parts, gear, ctx) {
    T = R.T();
    const culture = ctx.culture || "midgard";
    const list = [];
    const basePal = G.palette({ tint: "#c9b892", rarity: "gewoehnlich" }, culture, { cloth3: "#3f342c" });
    const r = gear.ruestung;
    if (r && r.base === "robe" && G.has("robe.runen.top")) {
      const pal = G.palette(r, culture);
      for (const k of ["robe.runen.top", "robe.runen.skirt", "robe.runen.tabard", "robe.runen.belt"]) list.push({ key: k, pal, culture });
    } else {
      for (const k of ["base.shirt", "base.shirtskirt", "base.belt"]) list.push({ key: k, pal: basePal, culture });
    }
    list.push({ key: "base.pants", pal: basePal, culture });
    if (!gear.stiefel) list.push({ key: "base.shoes", pal: basePal, culture });
    const add = (it, keys) => {
      const pal = G.palette(it, culture);
      for (const k of keys) if (G.has(k)) list.push({ key: k, pal, culture });
    };
    const vis = (it) => (it.variant != null ? it.variant : it.style || 0);
    const u = gear.umhang;
    if (u) add(u, vis(u) === 1 ? ["umhang.fell", "umhang.fell.fur", "umhang.fell.hood"] : ["umhang.reise"]);
    const st = gear.stiefel;
    if (st) add(st, vis(st) === 1 ? ["stiefel.platte", "stiefel.platte.plate"] : ["stiefel.leder", "stiefel.leder.strap0"]);
    const hs = gear.handschuhe;
    if (hs) add(hs, vis(hs) === 0 ? ["handschuhe.platte", "handschuhe.platte.plate"] : ["handschuhe.leder"]);
    const he = gear.helm;
    if (he) add(he, vis(he) === 1 ? ["kopf.band"] : ["kopf.kapuze"]);
    if (gear.amulett) add(gear.amulett, ["schmuck.band"]);
    // Pruefansicht: nur bestimmte Teile zeigen (tests/preview.mjs, "only")
    const only = (G.debugOnly || null);
    const meshes = G.attach(parts, only ? list.filter((e) => only.some((o) => e.key.indexOf(o) >= 0)) : list);
    if (only && G.debugHideBody) parts.mesh.visible = false;
    G.attachRigid(parts, gear, culture);
    return meshes;
  };

  /* Feste Teile an Haltepunkten: Waffe in der rechten Hand, Fokus ueber der linken, Schmuck, Kopfschmuck */
  const V3 = (a) => new T.Vector3(a[0], a[1], a[2]);
  function placeOnBone(parts, obj, bone, worldP) {
    const j = R.human.jointOf(parts.rig, bone);
    obj.position.copy(V3(worldP).sub(j));
    parts.B[bone].add(obj);
  }
  G.attachRigid = function (parts, gear, culture) {
    const IT = R.items;
    if (!IT) return;
    const S = parts.prof.sockets;
    const vis = (it) => (it.variant != null ? it.variant : it.style || 0);
    const w = gear.waffe;
    if (w && IT.forms[w.base]) {
      const g = IT.build(w.base, vis(w), w.rarity, culture, G.palette(w, culture));
      // Schaft entlang der Griffachse (vom kleinen Finger zum Zeigefinger)
      g.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), V3(S.gripR.axis).normalize());
      const hs = S.gripR.size / 0.19;
      g.scale.setScalar(Math.max(0.85, Math.min(1.25, hs)) * 1.0);
      placeOnBone(parts, g, "hand.R", S.gripR.p);
      parts.weapon = g;
      parts.gripR = 1;
    }
    const o = gear.nebenhand;
    if (o && IT.forms[o.base]) {
      const g = IT.build(o.base, vis(o), o.rarity, culture, G.palette(o, culture));
      if (o.base === "fokus") {
        // schwebt ueber der offenen linken Hand
        const p = S.gripL.p.slice();
        placeOnBone(parts, g, "hand.L", p);
        g.userData.hover = g.position.clone();
        g.position.y += 0.12;
        parts.focus = g;
      } else placeOnBone(parts, g, "hand.L", S.gripL.p);
      parts.offhand = g;
    }
    const a = gear.amulett;
    if (a && IT.forms.amulett) {
      const g = IT.build("amulett", vis(a), a.rarity, culture, G.palette(a, culture));
      const p = S.chest.p.slice();
      p[2] += 0.012;
      placeOnBone(parts, g, "chest", p);
      parts.amulet = g;
    }
    const rg = gear.ring;
    if (rg && IT.forms.ring) {
      const g = IT.build("ring", vis(rg), rg.rarity, culture, G.palette(rg, culture));
      g.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), V3(S.gripR.along).normalize());
      placeOnBone(parts, g, "fing1.R", S.ringR.p);
      parts.ring = g;
    }
    const ta = gear.talisman;
    if (ta && IT.forms.talisman) {
      const g = IT.build("talisman", vis(ta), ta.rarity, culture, G.palette(ta, culture));
      const p = S.belt.left.slice();
      p[0] += 0.02;
      g.rotation.y = Math.PI / 2;
      placeOnBone(parts, g, "hips", p);
      parts.talisman = g;
    }
    const h = gear.helm;
    if (h && h.base === "hut" && vis(h) === 1) {
      const g = IT.build("krone", 0, h.rarity, culture, G.palette(h, culture));
      // am Grundkopf gebaut: auf Kopf des Volkes skalieren
      const f = G.fitOf(parts.pk).head;
      const j0 = V3(f.o0);
      g.children.forEach((m) => m.geometry.translate(-j0.x, -j0.y, -j0.z));
      g.scale.set(f.s[0], f.s[1], f.s[2]);
      parts.B.head.add(g);
      parts.crown = g;
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
