/* Helden von Schwebfels - 3D-Figuren (three.js, prozedural).
   Heroischer Stil: kraeftige Silhouetten, grosse Schulterstuecke und Haende, handgemalt wirkende Texturen.
   Alle Texturen werden zur Laufzeit auf Canvas gemalt, es werden keine fremden Grafiken geladen. */
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

  /* ---------- kleine Helfer ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) {
    let h = 2166136261;
    s = String(s);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  const PI = Math.PI;
  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  const shade = (hex, f) => {
    const c = new T.Color(hex);
    c.multiplyScalar(f);
    c.r = Math.min(1, c.r);
    c.g = Math.min(1, c.g);
    c.b = Math.min(1, c.b);
    return "#" + c.getHexString();
  };
  const mix = (a, b, t) => {
    const c = new T.Color(a);
    c.lerp(new T.Color(b), t);
    return "#" + c.getHexString();
  };
  R.shade = shade;
  R.mix = mix;

  /* ---------- Geometriecache ---------- */
  const G = {};
  const geo = (k, make) => G[k] || (G[k] = make());
  const sph = (r, w, h) => geo("s" + r + "|" + (w || 18) + "|" + (h || 14), () => new T.SphereGeometry(r, w || 18, h || 14));
  const cap = (r, th) => geo("cap" + r + "|" + th, () => new T.SphereGeometry(r, 18, 10, 0, PI * 2, 0, th));
  const box = (x, y, z) => geo("b" + x + "|" + y + "|" + z, () => new T.BoxGeometry(x, y, z));
  const cyl = (rt, rb, h, s, open) => geo("c" + rt + "|" + rb + "|" + h + "|" + (s || 14) + (open ? "o" : ""), () => new T.CylinderGeometry(rt, rb, h, s || 14, 1, !!open));
  const cone = (r, h, s) => geo("k" + r + "|" + h + "|" + (s || 12), () => new T.ConeGeometry(r, h, s || 12));
  const capsule = (r, l, s) => geo("p" + r + "|" + l + "|" + (s || 12), () => new T.CapsuleGeometry(r, l, 4, s || 12));
  const torus = (r, t, arc, rs, ts) => geo("t" + r + "|" + t + "|" + arc + "|" + (rs || 8) + "|" + (ts || 24), () => new T.TorusGeometry(r, t, rs || 8, ts || 24, arc || PI * 2));
  const octa = (r) => geo("o" + r, () => new T.OctahedronGeometry(r, 0));
  const ico = (r, d) => geo("i" + r + "|" + (d || 0), () => new T.IcosahedronGeometry(r, d || 0));
  const dodeca = (r) => geo("d" + r, () => new T.DodecahedronGeometry(r, 0));
  // Drehkoerper aus [radius, hoehe]-Paaren
  const lathe = (k, pts, segs) => geo("l" + k, () => new T.LatheGeometry(pts.map((p) => new T.Vector2(p[0], p[1])), segs || 20));
  // Flache Form, extrudiert und mittig in z
  function shapeOf(pts) {
    const s = new T.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p[0] === "q") s.quadraticCurveTo(p[1], p[2], p[3], p[4]);
      else s.lineTo(p[0], p[1]);
    }
    s.closePath();
    return s;
  }
  const ext = (k, pts, depth, bev) =>
    geo("x" + k + "|" + depth + "|" + bev, () => {
      const g = new T.ExtrudeGeometry(shapeOf(pts), { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 8 });
      g.translate(0, 0, -depth / 2);
      g.computeVertexNormals();
      return g;
    });
  const tube = (k, pts, r, segs, rs) =>
    geo("u" + k + "|" + r, () => new T.TubeGeometry(new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(p[0], p[1], p[2]))), segs || 24, r, rs || 6, false));
  R.geo = { sph, cap, box, cyl, cone, capsule, torus, octa, ico, dodeca, lathe, ext, tube, geo };

  /* ---------- Gemalte Texturen (Graustufen, werden mit der Materialfarbe multipliziert) ---------- */
  const TEX = {};
  function paintTex(kind) {
    if (TEX[kind]) return TEX[kind];
    const S = 128;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    const r = rng(hash(kind));
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, "#ffffff");
    gr.addColorStop(0.55, "#e2e2e2");
    gr.addColorStop(1, "#a9a9a9");
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    const dab = (n, rmin, rmax, light, alpha) => {
      for (let i = 0; i < n; i++) {
        g.fillStyle = (r() < light ? "rgba(255,255,255," : "rgba(0,0,0,") + alpha * (0.4 + r() * 0.6) + ")";
        g.beginPath();
        g.ellipse(r() * S, r() * S, rmin + r() * (rmax - rmin), rmin + r() * (rmax - rmin) * 0.6, r() * PI, 0, PI * 2);
        g.fill();
      }
    };
    const strokes = (n, len, w, vertical, alpha, light) => {
      g.lineCap = "round";
      for (let i = 0; i < n; i++) {
        g.strokeStyle = (r() < (light || 0.4) ? "rgba(255,255,255," : "rgba(0,0,0,") + alpha * (0.4 + r() * 0.6) + ")";
        g.lineWidth = w * (0.5 + r());
        const x = r() * S;
        const y = r() * S;
        const l = len * (0.5 + r());
        const a = (vertical ? PI / 2 : 0) + (r() - 0.5) * 0.35;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 6, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
    };
    switch (kind) {
      case "metal":
        strokes(90, 60, 1.2, false, 0.1, 0.5);
        g.fillStyle = "rgba(255,255,255,0.35)";
        g.fillRect(0, S * 0.18, S, S * 0.07);
        g.fillStyle = "rgba(0,0,0,0.12)";
        g.fillRect(0, S * 0.72, S, S * 0.05);
        dab(30, 1, 3, 0.2, 0.15);
        break;
      case "leather":
        dab(260, 1, 4, 0.35, 0.09);
        strokes(20, 25, 1, true, 0.12);
        g.setLineDash([3, 3]);
        g.strokeStyle = "rgba(0,0,0,0.35)";
        g.lineWidth = 1.2;
        for (const y of [10, S - 10]) {
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(S, y);
          g.stroke();
        }
        g.setLineDash([]);
        break;
      case "cloth":
        for (let y = 0; y < S; y += 3) {
          g.fillStyle = "rgba(0,0,0," + (0.03 + r() * 0.04) + ")";
          g.fillRect(0, y, S, 1);
        }
        for (let x = 0; x < S; x += 3) {
          g.fillStyle = "rgba(255,255,255," + (0.02 + r() * 0.04) + ")";
          g.fillRect(x, 0, 1, S);
        }
        strokes(14, 70, 6, true, 0.08);
        break;
      case "wood":
        strokes(70, 90, 1.6, true, 0.16, 0.25);
        dab(6, 2, 5, 0, 0.25);
        break;
      case "stone":
        dab(120, 3, 14, 0.4, 0.1);
        g.strokeStyle = "rgba(0,0,0,0.35)";
        g.lineWidth = 1.4;
        for (let i = 0; i < 7; i++) {
          let x = r() * S;
          let y = r() * S;
          g.beginPath();
          g.moveTo(x, y);
          for (let k = 0; k < 5; k++) {
            x += (r() - 0.5) * 30;
            y += (r() - 0.5) * 30;
            g.lineTo(x, y);
          }
          g.stroke();
        }
        break;
      case "fur":
        strokes(500, 9, 1.4, true, 0.2, 0.45);
        break;
      case "hair":
        strokes(260, 40, 1.3, true, 0.2, 0.4);
        break;
      case "skin":
        dab(70, 4, 16, 0.5, 0.05);
        break;
      case "scale":
        for (let y = 0; y < S + 12; y += 10)
          for (let x = (y / 10) % 2 ? 6 : 0; x < S + 12; x += 12) {
            const sg = g.createRadialGradient(x, y - 3, 1, x, y, 8);
            sg.addColorStop(0, "rgba(255,255,255,0.25)");
            sg.addColorStop(1, "rgba(0,0,0,0.3)");
            g.fillStyle = sg;
            g.beginPath();
            g.arc(x, y, 7, 0, PI);
            g.fill();
          }
        break;
      case "bone":
        dab(80, 2, 9, 0.6, 0.08);
        g.strokeStyle = "rgba(60,40,20,0.3)";
        for (let i = 0; i < 10; i++) {
          g.beginPath();
          g.moveTo(r() * S, r() * S);
          g.lineTo(r() * S, r() * S);
          g.stroke();
        }
        break;
      case "bark":
        strokes(60, 120, 4, true, 0.25, 0.2);
        strokes(40, 40, 2, true, 0.18, 0.6);
        break;
      default:
        dab(60, 3, 12, 0.5, 0.05);
    }
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 4;
    return (TEX[kind] = t);
  }

  /* ---------- Materialien ---------- */
  const MC = {};
  // kind: metal, leather, cloth, wood, stone, fur, hair, skin, scale, bone, bark, plain
  function pmat(kind, color, o) {
    o = o || {};
    const k = "m" + kind + "|" + color + "|" + (o.e || "") + "|" + (o.ei || 0) + "|" + (o.op || 1) + "|" + (o.ds ? 1 : 0) + "|" + (o.flat ? 1 : 0) + "|" + (o.sh || 0);
    if (MC[k]) return MC[k];
    const props = { map: paintTex(kind), color: new T.Color(color).multiplyScalar(1.12) };
    let m;
    if (kind === "metal") m = new T.MeshPhongMaterial(Object.assign(props, { specular: new T.Color("#b8b2a6"), shininess: o.sh || 46 }));
    else if (kind === "skin" || kind === "scale" || kind === "bone" || kind === "hair") m = new T.MeshPhongMaterial(Object.assign(props, { specular: new T.Color("#2a2622"), shininess: o.sh || 14 }));
    else m = new T.MeshLambertMaterial(props);
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
  // Rueckwaertskompatibel: frueher Cartoon-Material, jetzt matt bemalt
  const toon = (color, o) => pmat((o && o.kind) || "plain", color, o);
  // Leuchtendes Material: Grundfarbe plus kraeftiges Eigenleuchten
  const emis = (color, ei) => pmat("plain", color, { e: color, ei: ei == null ? 1 : ei });
  function glow(color, op) {
    const k = "g" + color + "|" + (op == null ? 0.6 : op);
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
  let haloTex = null;
  function halo(color, op) {
    const k = "h" + color + "|" + (op || 1);
    if (MC[k]) return MC[k];
    if (!haloTex) {
      const c = canvas(64, 64);
      const g = c.getContext("2d");
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.25, "rgba(255,255,255,0.55)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      haloTex = new T.CanvasTexture(c);
    }
    return (MC[k] = new T.SpriteMaterial({ map: haloTex, color: new T.Color(color), transparent: true, opacity: op || 1, blending: T.AdditiveBlending, depthWrite: false }));
  }
  function haloSprite(color, size, op, pos) {
    const s = new T.Sprite(halo(color, op));
    s.scale.setScalar(size);
    if (pos) s.position.set(pos[0], pos[1], pos[2]);
    s.userData.pulse = 1;
    s.userData.s0 = size;
    return s;
  }
  let flashM = null;
  const flashMat = () => flashM || (flashM = new T.MeshBasicMaterial({ color: 0xffffff }));
  R.mat = { toon, pmat, emis, glow, basic, halo, outline: () => basic("#1c1626") };
  R.haloSprite = haloSprite;
  R.paintTex = paintTex;

  function mesh(g, m, o) {
    const me = new T.Mesh(g, m);
    o = o || {};
    if (o.p) me.position.set(o.p[0], o.p[1], o.p[2]);
    if (o.r) me.rotation.set(o.r[0], o.r[1], o.r[2]);
    if (o.s != null) typeof o.s === "number" ? me.scale.setScalar(o.s) : me.scale.set(o.s[0], o.s[1], o.s[2]);
    me.castShadow = o.shadow !== false && !m.transparent;
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
  R.RAR_GLOW = RAR_GLOW;
  const GOLD = "#d9a441";
  const STEEL = "#b9c0c8";
  const DARKWOOD = "#5a3a24";
  // Ein Reich kann als Schluessel oder als eigenes Farbobjekt (z. B. fuer Untote) uebergeben werden
  const realmOf = (realm) => (realm && typeof realm === "object" ? realm.key || "tod" : SB.data.REALMS[realm] ? realm : "albion");
  const realmData = (realm) => (realm && typeof realm === "object" ? realm : SB.data.REALMS[realmOf(realm)]);

  /* ---------- Gesicht: Canvas-Textur mit Augen, Brauen, Tattoos, Narben ---------- */
  // Kugel-UV: u=0.25 ist vorne (Blickrichtung +z), v=0 oben. Canvas 512x256, Gesichtsmitte x=128.
  const FACE = {};
  function faceTex(o) {
    const key = [o.skin, o.eyes, o.eyeGlow ? 1 : 0, o.brow, o.tattoo, o.tc, o.tglow ? 1 : 0, o.scar, o.fem ? 1 : 0, o.undead ? 1 : 0, o.race].join("|");
    if (FACE[key]) return FACE[key];
    const W = 512;
    const H = 256;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    const e = canvas(W, H);
    const ge = e.getContext("2d");
    ge.fillStyle = "#000";
    ge.fillRect(0, 0, W, H);
    const cx = 128;
    const eyeY = 120;
    // Haut mit gemaltem Licht von oben
    const base = new T.Color(o.skin);
    const hx = (f) => "#" + base.clone().multiplyScalar(f).getHexString();
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, hx(1.05));
    gr.addColorStop(0.45, hx(1.0));
    gr.addColorStop(0.75, hx(0.86));
    gr.addColorStop(1, hx(0.7));
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    const blob = (x, y, rx, ry, col, a) => {
      g.save();
      g.globalAlpha = a;
      const rg = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      rg.addColorStop(0, col);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg;
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, PI * 2);
      g.fill();
      g.restore();
    };
    // Schatten unter den Brauen, Wangenknochen, Kinn
    for (const s of [-1, 1]) {
      blob(cx + s * 28, eyeY - 2, 22, 11, hx(0.6), 0.45);
      blob(cx + s * 52, eyeY + 34, 18, 16, hx(0.8), 0.3);
      blob(cx + s * 36, eyeY + 18, 16, 7, hx(1.15), 0.3);
    }
    blob(cx, eyeY + 46, 18, 8, hx(0.65), 0.45);
    blob(cx, eyeY - 30, 46, 18, hx(1.18), 0.3);
    if (o.undead) {
      for (const s of [-1, 1]) blob(cx + s * 30, eyeY, 30, 20, "#000", 0.85);
      blob(cx, eyeY + 40, 34, 18, "#000", 0.35);
    }
    // Tattoos
    const tc = o.tc || "#2f5fd0";
    const paint = (fn) => {
      for (const [ctx, col] of [[g, tc], o.tglow ? [ge, tc] : null].filter(Boolean)) {
        ctx.save();
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = ctx === g ? 0.85 : 1;
        fn(ctx);
        ctx.restore();
      }
    };
    switch (o.tattoo) {
      case "runen":
        paint((x) => {
          x.lineWidth = 3;
          const rune = (px, py, k) => {
            x.beginPath();
            x.moveTo(px, py - 9);
            x.lineTo(px, py + 9);
            if (k % 3 === 0) {
              x.moveTo(px, py - 9);
              x.lineTo(px + 6, py - 3);
              x.lineTo(px, py + 2);
            } else if (k % 3 === 1) {
              x.moveTo(px - 6, py - 6);
              x.lineTo(px + 6, py + 2);
            } else {
              x.moveTo(px, py - 2);
              x.lineTo(px + 6, py - 8);
              x.moveTo(px, py - 2);
              x.lineTo(px - 6, py - 8);
            }
            x.stroke();
          };
          rune(cx, eyeY - 36, 0);
          rune(cx - 16, eyeY - 30, 1);
          rune(cx + 16, eyeY - 30, 2);
          for (const s of [-1, 1]) {
            rune(cx + s * 44, eyeY + 18, s > 0 ? 1 : 2);
            rune(cx + s * 52, eyeY + 38, 0);
          }
        });
        break;
      case "knoten":
        paint((x) => {
          x.lineWidth = 3;
          for (const s of [-1, 1]) {
            const px = cx + s * 46;
            const py = eyeY + 26;
            for (let i = 0; i < 3; i++) {
              const a = (i / 3) * PI * 2;
              x.beginPath();
              x.arc(px + Math.cos(a) * 7, py + Math.sin(a) * 7, 8, 0, PI * 2);
              x.stroke();
            }
          }
          x.beginPath();
          x.arc(cx, eyeY - 34, 8, 0, PI * 2);
          x.stroke();
          x.beginPath();
          x.moveTo(cx - 22, eyeY - 34);
          x.lineTo(cx + 22, eyeY - 34);
          x.stroke();
        });
        break;
      case "kriegsbemalung":
        paint((x) => {
          x.globalAlpha *= 0.9;
          x.beginPath();
          x.moveTo(cx - 70, eyeY - 12);
          x.quadraticCurveTo(cx, eyeY - 20, cx + 70, eyeY - 12);
          x.lineTo(cx + 66, eyeY + 12);
          x.quadraticCurveTo(cx, eyeY + 4, cx - 66, eyeY + 12);
          x.closePath();
          x.fill();
          x.lineWidth = 5;
          for (const s of [-1, 0, 1]) {
            x.beginPath();
            x.moveTo(cx + s * 10, eyeY + 50);
            x.lineTo(cx + s * 12, eyeY + 76);
            x.stroke();
          }
        });
        break;
      case "linien":
        paint((x) => {
          x.lineWidth = 4;
          for (const s of [-1, 1]) {
            for (let k = 0; k < 2; k++) {
              x.beginPath();
              x.moveTo(cx + s * (24 + k * 9), eyeY - 40);
              x.quadraticCurveTo(cx + s * (60 + k * 8), eyeY + 6, cx + s * (34 + k * 10), eyeY + 56);
              x.stroke();
            }
          }
          x.beginPath();
          x.moveTo(cx, eyeY - 50);
          x.lineTo(cx, eyeY - 18);
          x.stroke();
        });
        break;
      case "mond":
        paint((x) => {
          x.beginPath();
          x.arc(cx, eyeY - 34, 14, 0.25 * PI, 1.75 * PI, false);
          x.arc(cx + 6, eyeY - 34, 11, 1.65 * PI, 0.35 * PI, true);
          x.closePath();
          x.fill();
          for (const s of [-1, 1]) {
            x.beginPath();
            x.arc(cx + s * 40, eyeY + 24, 3, 0, PI * 2);
            x.arc(cx + s * 48, eyeY + 34, 2.5, 0, PI * 2);
            x.fill();
          }
        });
        break;
      case "dornen":
        paint((x) => {
          x.lineWidth = 3;
          x.beginPath();
          x.moveTo(cx - 10, eyeY - 52);
          x.bezierCurveTo(cx - 60, eyeY - 30, cx - 20, eyeY + 20, cx - 58, eyeY + 60);
          x.stroke();
          for (let i = 0; i < 6; i++) {
            const t = i / 6;
            const px = cx - 10 - 40 * Math.sin(t * PI) - t * 30;
            const py = eyeY - 50 + t * 106;
            x.beginPath();
            x.moveTo(px, py);
            x.lineTo(px + (i % 2 ? 9 : -9), py - 5);
            x.lineTo(px + (i % 2 ? 3 : -3), py + 3);
            x.fill();
          }
        });
        break;
    }
    // Narben
    g.save();
    g.strokeStyle = "rgba(120,50,50,0.75)";
    g.lineWidth = 3;
    g.lineCap = "round";
    const scar = (x1, y1, x2, y2) => {
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      g.save();
      g.strokeStyle = "rgba(255,230,210,0.45)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x1 + 1, y1 - 1);
      g.lineTo(x2 + 1, y2 - 1);
      g.stroke();
      g.restore();
    };
    if (o.scar === "auge") scar(cx + 22, eyeY - 30, cx + 36, eyeY + 22);
    if (o.scar === "wange") scar(cx - 52, eyeY + 14, cx - 30, eyeY + 46);
    if (o.scar === "kreuz") {
      scar(cx - 44, eyeY + 20, cx - 22, eyeY + 44);
      scar(cx - 22, eyeY + 20, cx - 46, eyeY + 42);
    }
    g.restore();
    // Augen: mandelfoermig, mit dunklem Lid (heroischer Blick)
    for (const s of [-1, 1]) {
      const ex = cx + s * 27;
      const almond = (x, rx, ry) => {
        x.beginPath();
        x.moveTo(ex - rx, eyeY + 1);
        x.quadraticCurveTo(ex - s * 2, eyeY - ry * 1.5, ex + rx, eyeY - 2 * s * 0 - 2);
        x.quadraticCurveTo(ex + s * 2, eyeY + ry * 1.3, ex - rx, eyeY + 1);
        x.closePath();
      };
      if (o.eyeGlow || o.undead) {
        const col = o.eyes || "#9fe3ff";
        for (const x of [g, ge]) {
          x.save();
          x.fillStyle = col;
          almond(x, 12, 6);
          x.fill();
          x.restore();
        }
        g.fillStyle = "rgba(255,255,255,0.8)";
        g.beginPath();
        g.ellipse(ex, eyeY - 1, 4, 2.5, 0, 0, PI * 2);
        g.fill();
      } else {
        g.fillStyle = "#ece6dc";
        almond(g, 11, 6);
        g.fill();
        g.fillStyle = o.eyes || "#3a2a1e";
        g.beginPath();
        g.arc(ex + s * 1, eyeY - 1, 4.6, 0, PI * 2);
        g.fill();
        g.fillStyle = "#0e0c10";
        g.beginPath();
        g.arc(ex + s * 1, eyeY - 1, 2, 0, PI * 2);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.9)";
        g.fillRect(ex + s * 1 + 1, eyeY - 4, 2, 2);
      }
      // Lidstrich
      g.strokeStyle = "rgba(20,14,12,0.9)";
      g.lineWidth = o.fem ? 2.6 : 2.2;
      g.beginPath();
      g.moveTo(ex - s * 12, eyeY + 2);
      g.quadraticCurveTo(ex - s * 2, eyeY - 10, ex + s * 13, eyeY - 3);
      g.stroke();
      // Brauen: kraeftig, schraeg nach innen unten
      g.strokeStyle = o.brow || "#2b1d16";
      g.lineWidth = o.fem ? 3 : 5;
      g.beginPath();
      g.moveTo(ex - s * 14, eyeY - 10);
      g.quadraticCurveTo(ex, eyeY - 18, ex + s * 16, eyeY - 18);
      g.stroke();
    }
    // Nase und Mund
    g.strokeStyle = hx(0.6);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - 6, eyeY + 30);
    g.quadraticCurveTo(cx, eyeY + 34, cx + 6, eyeY + 30);
    g.stroke();
    g.strokeStyle = o.undead ? "#000" : "rgba(60,25,20,0.85)";
    g.lineWidth = o.fem ? 2.5 : 3;
    g.beginPath();
    g.moveTo(cx - 13, eyeY + 47);
    g.quadraticCurveTo(cx, eyeY + 44, cx + 13, eyeY + 47);
    g.stroke();
    if (o.fem) {
      g.fillStyle = "rgba(150,60,60,0.35)";
      g.beginPath();
      g.ellipse(cx, eyeY + 50, 9, 3.5, 0, 0, PI * 2);
      g.fill();
    }
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    let em = null;
    if (o.eyeGlow || o.tglow || o.undead) {
      em = new T.CanvasTexture(e);
      em.colorSpace = T.SRGBColorSpace;
    }
    const m = new T.MeshPhongMaterial({ map: t, specular: new T.Color("#2a2622"), shininess: 12 });
    if (em) {
      m.emissive = new T.Color("#ffffff");
      m.emissiveMap = em;
      m.emissiveIntensity = 1;
    }
    return (FACE[key] = m);
  }

  // Arm-Tattoo: Haut mit umlaufenden Mustern (Kapsel-UV: u rundherum, v entlang)
  const ARMT = {};
  function armTex(skin, tattoo, tc, tglow) {
    const key = skin + "|" + tattoo + "|" + tc + "|" + (tglow ? 1 : 0);
    if (ARMT[key]) return ARMT[key];
    const W = 256;
    const H = 128;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    const e = canvas(W, H);
    const ge = e.getContext("2d");
    ge.fillStyle = "#000";
    ge.fillRect(0, 0, W, H);
    const base = new T.Color(skin);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "#" + base.clone().multiplyScalar(1.05).getHexString());
    gr.addColorStop(1, "#" + base.clone().multiplyScalar(0.8).getHexString());
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    if (tattoo && tattoo !== "keine") {
      for (const x of tglow ? [g, ge] : [g]) {
        x.save();
        x.strokeStyle = tc;
        x.fillStyle = tc;
        x.lineWidth = 4;
        x.globalAlpha = x === g ? 0.85 : 1;
        // zwei Baender mit Muster, das sich um den Arm zieht
        for (const by of [38, 70]) {
          x.beginPath();
          x.moveTo(0, by - 9);
          x.lineTo(W, by - 9);
          x.moveTo(0, by + 9);
          x.lineTo(W, by + 9);
          x.stroke();
          for (let i = 0; i < 8; i++) {
            const px = i * 32 + 16;
            x.beginPath();
            if (tattoo === "runen") {
              x.moveTo(px, by - 6);
              x.lineTo(px, by + 6);
              x.lineTo(px + 6, by);
            } else if (tattoo === "knoten") {
              x.arc(px, by, 5, 0, PI * 2);
            } else if (tattoo === "dornen") {
              x.moveTo(px - 8, by + 6);
              x.lineTo(px, by - 6);
              x.lineTo(px + 8, by + 6);
            } else if (tattoo === "mond") {
              x.arc(px, by, 5, 0.3 * PI, 1.7 * PI);
            } else {
              x.moveTo(px - 10, by);
              x.quadraticCurveTo(px, by - 8, px + 10, by);
            }
            x.stroke();
          }
        }
        x.restore();
      }
    }
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    const m = new T.MeshPhongMaterial({ map: t, specular: new T.Color("#2a2622"), shininess: 14 });
    if (tglow && tattoo && tattoo !== "keine") {
      const em = new T.CanvasTexture(e);
      em.colorSpace = T.SRGBColorSpace;
      m.emissive = new T.Color("#ffffff");
      m.emissiveMap = em;
    }
    return (ARMT[key] = m);
  }

  // Wappen fuer Schilde und Waffenroecke
  const CREST = {};
  function crestMat(realm, color, trim) {
    const key = realm + "|" + color + "|" + trim;
    if (CREST[key]) return CREST[key];
    const S = 128;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    g.fillStyle = color;
    g.fillRect(0, 0, S, S);
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, "rgba(255,255,255,0.18)");
    gr.addColorStop(1, "rgba(0,0,0,0.3)");
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    g.fillStyle = trim;
    g.strokeStyle = trim;
    g.lineWidth = 7;
    g.lineCap = "round";
    if (realm === "albion") {
      // Kreidekreuz mit Krone
      g.fillRect(S / 2 - 7, 22, 14, 86);
      g.fillRect(28, 50, 72, 14);
      g.beginPath();
      g.moveTo(40, 30);
      g.lineTo(48, 14);
      g.lineTo(56, 26);
      g.lineTo(64, 10);
      g.lineTo(72, 26);
      g.lineTo(80, 14);
      g.lineTo(88, 30);
      g.closePath();
      g.fill();
    } else if (realm === "midgard") {
      // Frostzeichen: sechsarmiger Eisstern
      g.save();
      g.translate(S / 2, S / 2);
      for (let i = 0; i < 6; i++) {
        g.rotate(PI / 3);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -46);
        g.moveTo(0, -24);
        g.lineTo(12, -36);
        g.moveTo(0, -24);
        g.lineTo(-12, -36);
        g.stroke();
      }
      g.beginPath();
      g.arc(0, 0, 9, 0, PI * 2);
      g.fill();
      g.restore();
    } else if (realm === "tod") {
      // gesenktes Schwert
      g.fillRect(S / 2 - 6, 20, 12, 90);
      g.fillRect(34, 36, 60, 10);
      g.beginPath();
      g.moveTo(S / 2 - 6, 110);
      g.lineTo(S / 2, 122);
      g.lineTo(S / 2 + 6, 110);
      g.fill();
    } else {
      // Dreifachspirale
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2 - PI / 2;
        g.beginPath();
        for (let k = 0; k < 30; k++) {
          const t = k / 29;
          const rr = 4 + t * 22;
          const aa = a + t * 4.2;
          const x = S / 2 + Math.cos(a) * 20 + Math.cos(aa) * rr * 0.9;
          const y = S / 2 + Math.sin(a) * 20 + Math.sin(aa) * rr * 0.9;
          k ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
    }
    g.strokeStyle = trim;
    g.lineWidth = 6;
    g.strokeRect(4, 4, S - 8, S - 8);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return (CREST[key] = new T.MeshLambertMaterial({ map: t, side: T.DoubleSide }));
  }
  R.crestMat = crestMat;

  /* ---------- Formen ---------- */
  const SH = {
    blade: [[0, 1], [0.07, 0.84], [0.062, 0.12], [0.045, 0.04], [0.045, 0], [-0.045, 0], [-0.045, 0.04], [-0.062, 0.12], [-0.07, 0.84]],
    broad: [[0, 1], [0.1, 0.8], [0.085, 0.3], [0.1, 0.1], [0.05, 0], [-0.05, 0], [-0.1, 0.1], [-0.085, 0.3], [-0.1, 0.8]],
    runeblade: [[0, 1], [0.05, 0.9], [0.09, 0.75], [0.06, 0.62], [0.09, 0.45], [0.06, 0.12], [0.04, 0], [-0.04, 0], [-0.06, 0.12], [-0.09, 0.45], [-0.06, 0.62], [-0.09, 0.75], [-0.05, 0.9]],
    guard: [[-0.24, 0.02], ["q", -0.12, -0.04, 0, -0.02], ["q", 0.12, -0.04, 0.24, 0.02], [0.26, 0.07], ["q", 0.12, 0.02, 0, 0.04], ["q", -0.12, 0.02, -0.26, 0.07]],
    axe: [[0, -0.06], [0.12, -0.12], ["q", 0.36, -0.1, 0.42, -0.34], ["q", 0.5, 0, 0.42, 0.34], ["q", 0.36, 0.1, 0.12, 0.12], [0, 0.06]],
    axeback: [[0, -0.05], [-0.1, -0.08], [-0.2, -0.02], [-0.2, 0.02], [-0.1, 0.08], [0, 0.05]],
    dagger: [[0, 0.5], ["q", 0.07, 0.3, 0.045, 0.02], [0.03, 0], [-0.03, 0], [-0.045, 0.02], ["q", -0.02, 0.3, 0, 0.5]],
    sickle: [[0.02, 0], ["q", 0.05, 0.25, -0.12, 0.5], ["q", 0.25, 0.42, 0.22, 0.12], ["q", 0.18, 0.32, 0.03, 0.4], ["q", 0.08, 0.2, -0.02, 0]],
    leafblade: [[0, 0.62], ["q", 0.1, 0.42, 0.05, 0.05], [0.04, 0], [-0.04, 0], [-0.05, 0.05], ["q", -0.1, 0.42, 0, 0.62]],
    spearhead: [[0, 0.36], ["q", 0.09, 0.16, 0.035, 0], [-0.035, 0], ["q", -0.09, 0.16, 0, 0.36]],
    heater: [[-0.36, 0.4], [0.36, 0.4], [0.36, 0.05], ["q", 0.3, -0.35, 0, -0.5], ["q", -0.3, -0.35, -0.36, 0.05]],
    kite: [[0, 0.5], ["q", 0.32, 0.45, 0.34, 0.2], ["q", 0.25, -0.3, 0, -0.62], ["q", -0.25, -0.3, -0.34, 0.2], ["q", -0.32, 0.45, 0, 0.5]],
    leaf: [[0, 0.55], ["q", 0.42, 0.2, 0.05, -0.55], [0, -0.6], [-0.05, -0.55], ["q", -0.42, 0.2, 0, 0.55]],
    wing: [[0, 0], [0.3, 0.12], [0.55, 0.35], [0.4, 0.3], [0.45, 0.18], [0.28, 0.16], [0.3, 0.06]],
    feather: [[0, 0], ["q", 0.06, 0.2, 0, 0.42], ["q", -0.05, 0.2, 0, 0]],
  };
  R.SH = SH;

  /* ---------- Waffen ---------- */
  function edgeMat(rarity, base) {
    const gc = RAR_GLOW[rarity];
    return gc ? pmat("metal", mix(base || STEEL, gc, 0.25), { e: gc, ei: 0.35 }) : pmat("metal", base || STEEL);
  }
  function runes(g, color, y0, y1, x, z, n) {
    for (let i = 0; i < n; i++) {
      const y = y0 + ((y1 - y0) * (i + 0.5)) / n;
      g.add(mesh(box(0.022, 0.05, 0.004), basic(color), { p: [x, y, z], r: [0, 0, (i % 2 ? 0.5 : -0.5)], shadow: false }));
    }
  }
  function addGlow(g, rarity, pts, size) {
    const gc = RAR_GLOW[rarity];
    if (!gc) return;
    for (const p of pts) g.add(haloSprite(gc, size * (rarity === "legendaer" ? 1.5 : 1), rarity === "selten" ? 0.5 : 0.75, p));
  }
  function buildWeapon(w, realm) {
    const g = grp();
    const RM = realmData(realm);
    const gc = RAR_GLOW[w.rarity];
    const edge = edgeMat(w.rarity, w.base === "schwert" && w.style === 2 ? "#8f9aa6" : STEEL);
    const trim = pmat("metal", RM.trim, { sh: 70 });
    const grip = pmat("leather", shade(w.tint || "#5a3d2a", 0.8));
    const wood = pmat("wood", w.tint && w.base !== "schwert" ? w.tint : DARKWOOD);
    const gem = gc ? emis(gc, 0.9) : emis(RM.accent, 0.5);
    switch (w.base) {
      case "schwert": {
        const sh = w.style === 1 ? SH.broad : w.style === 2 ? SH.runeblade : SH.blade;
        g.add(mesh(cyl(0.03, 0.034, 0.26, 8), grip, { p: [0, 0.02, 0] }));
        g.add(mesh(sph(0.055, 10, 8), trim, { p: [0, -0.13, 0] }));
        g.add(mesh(octa(0.03), gem, { p: [0, -0.13, 0.045] }));
        g.add(mesh(ext("guard", SH.guard, 0.04, 0.012), trim, { p: [0, 0.15, 0] }));
        g.add(mesh(octa(0.035), gem, { p: [0, 0.17, 0.035] }));
        g.add(mesh(ext("bl" + (w.style || 0), sh, 0.012, 0.012), edge, { p: [0, 0.17, 0], s: [1, 0.95, 1] }));
        g.add(mesh(box(0.018, 0.62, 0.03), pmat("metal", "#6f7782"), { p: [0, 0.5, 0], shadow: false }));
        if (gc || w.style === 2) runes(g, gc || RM.accent, 0.3, 0.8, 0, 0.02, 4);
        addGlow(g, w.rarity, [[0, 0.6, 0], [0, 0.95, 0]], 0.35);
        break;
      }
      case "axt": {
        g.add(mesh(cyl(0.035, 0.042, 1.0, 8), wood, { p: [0, 0.3, 0] }));
        for (const y of [0.0, 0.12]) g.add(mesh(torus(0.042, 0.012, PI * 2, 5, 12), trim, { p: [0, y, 0], r: [PI / 2, 0, 0] }));
        g.add(mesh(ext("axe", SH.axe, 0.03, 0.014), edge, { p: [0.03, 0.72, 0] }));
        if (w.style === 1) g.add(mesh(ext("axe", SH.axe, 0.03, 0.014), edge, { p: [-0.03, 0.72, 0], r: [0, PI, 0] }));
        else g.add(mesh(ext("axeback", SH.axeback, 0.03, 0.01), trim, { p: [-0.02, 0.72, 0] }));
        g.add(mesh(cyl(0.06, 0.06, 0.2, 8), trim, { p: [0, 0.72, 0] }));
        g.add(mesh(cone(0.04, 0.16, 6), trim, { p: [0, 0.88, 0] }));
        if (w.style === 2) for (let i = 0; i < 3; i++) g.add(mesh(cone(0.012, 0.12, 4), pmat("bone", "#e8dcc0"), { p: [0.02, 0.5 - i * 0.07, 0.04], r: [0.2, 0, 0.3] }));
        if (gc) runes(g, gc, 0.6, 0.85, 0.25, 0.03, 3);
        addGlow(g, w.rarity, [[0.3, 0.72, 0]], 0.5);
        break;
      }
      case "hammer": {
        g.add(mesh(cyl(0.035, 0.042, 0.95, 8), wood, { p: [0, 0.28, 0] }));
        g.add(mesh(torus(0.042, 0.014, PI * 2, 5, 12), trim, { p: [0, 0.05, 0], r: [PI / 2, 0, 0] }));
        if (w.style === 1) {
          // Morgenstern
          g.add(mesh(ico(0.16, 1), edge, { p: [0, 0.82, 0] }));
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * PI * 2;
            const y = i % 2 ? 0.07 : -0.07;
            g.add(mesh(cone(0.035, 0.14, 5), edge, { p: [Math.cos(a) * 0.16, 0.82 + y, Math.sin(a) * 0.16], r: [Math.sin(a) * 1.57, 0, -Math.cos(a) * 1.57] }));
          }
          g.add(mesh(cone(0.04, 0.16, 5), edge, { p: [0, 1.0, 0] }));
        } else {
          g.add(mesh(cyl(0.15, 0.15, 0.42, 8), edge, { p: [0, 0.82, 0], r: [0, 0, PI / 2] }));
          for (const s of [-1, 1]) g.add(mesh(cyl(0.165, 0.165, 0.05, 8), trim, { p: [s * 0.17, 0.82, 0], r: [0, 0, PI / 2] }));
          g.add(mesh(cyl(0.16, 0.16, 0.08, 8), trim, { p: [0, 0.82, 0], r: [0, 0, PI / 2] }));
          if (w.style === 2) g.add(mesh(cone(0.05, 0.22, 6), edge, { p: [0, 1.06, 0] }));
          runes(g, gc || RM.accent, 0.72, 0.92, 0.0, 0.16, 2);
        }
        addGlow(g, w.rarity, [[0, 0.82, 0]], 0.55);
        break;
      }
      case "dolch":
      case "sichel":
      case "kurzschwert": {
        g.add(mesh(cyl(0.026, 0.03, 0.15, 8), grip, {}));
        g.add(mesh(sph(0.04, 8, 6), trim, { p: [0, -0.09, 0] }));
        if (w.base === "sichel") {
          g.add(mesh(ext("sickle", SH.sickle, 0.01, 0.008), edge, { p: [0, 0.07, 0] }));
        } else {
          g.add(mesh(ext("dgu", [[-0.1, 0], [0.1, 0], [0.12, 0.04], [-0.12, 0.04]], 0.03, 0.008), trim, { p: [0, 0.07, 0] }));
          const sh = w.base === "dolch" ? SH.dagger : SH.leafblade;
          g.add(mesh(ext("rb" + w.base, sh, 0.008, 0.01), edge, { p: [0, 0.1, 0], s: w.base === "kurzschwert" ? [1, 1.2, 1] : 1 }));
        }
        if (gc) {
          g.add(mesh(box(0.012, 0.25, 0.012), emis(gc, 1), { p: [0, 0.3, 0.012], shadow: false }));
          addGlow(g, w.rarity, [[0, 0.3, 0]], 0.28);
        }
        // Gift auf der Klinge
        if (w.style === 2) g.add(mesh(sph(0.025, 6, 6), emis("#7fff5a", 1), { p: [0.02, 0.32, 0] }));
        break;
      }
      case "bogen": {
        const L = w.style === 1 ? 0.6 : 0.68;
        const pts = [[0, -L, -0.08], [0, -L * 0.75, 0.02], [0, -L * 0.35, 0.12], [0, 0, 0.08], [0, L * 0.35, 0.12], [0, L * 0.75, 0.02], [0, L, -0.08]];
        g.add(mesh(tube("bow" + w.style, pts, 0.026, 28, 6), wood));
        g.add(mesh(cyl(0.036, 0.036, 0.16, 8), grip, { p: [0, 0, 0.08] }));
        for (const s of [-1, 1]) {
          g.add(mesh(cone(0.03, 0.1, 6), trim, { p: [0, s * L, -0.08], r: [s > 0 ? 0 : PI, 0, 0] }));
          if (w.style === 2) g.add(mesh(ext("feather", SH.feather, 0.004, 0), pmat("cloth", RM.accent, { ds: true }), { p: [0, s * L * 0.55, 0.14], r: [0, PI / 2, s > 0 ? -0.4 : PI + 0.4], s: 0.5 }));
        }
        g.add(mesh(cyl(0.004, 0.004, L * 2, 3), basic("#e8dfca"), { p: [0, 0, -0.08], shadow: false }));
        addGlow(g, w.rarity, [[0, L * 0.6, 0.06], [0, -L * 0.6, 0.06]], 0.25);
        break;
      }
      case "armbrust": {
        g.add(mesh(box(0.07, 0.08, 0.62), wood, { p: [0, 0.02, 0.18] }));
        g.add(mesh(box(0.06, 0.16, 0.08), wood, { p: [0, -0.06, -0.08] }));
        const pts = [[-0.36, 0, 0.36], [-0.18, 0, 0.5], [0, 0, 0.52], [0.18, 0, 0.5], [0.36, 0, 0.36]];
        g.add(mesh(tube("xbow", pts, 0.025, 16, 6), pmat("metal", shade(RM.metal, 0.8)), { p: [0, 0.05, 0] }));
        g.add(mesh(cyl(0.004, 0.004, 0.7, 3), basic("#e8dfca"), { p: [0, 0.05, 0.38], r: [0, 0, PI / 2], shadow: false }));
        g.add(mesh(cyl(0.012, 0.012, 0.4, 5), pmat("wood", "#c9b89a"), { p: [0, 0.08, 0.32], r: [PI / 2, 0, 0] }));
        g.add(mesh(box(0.1, 0.02, 0.1), trim, { p: [0, 0.07, 0.48] }));
        addGlow(g, w.rarity, [[0, 0.06, 0.4]], 0.3);
        break;
      }
      case "speer": {
        g.add(mesh(cyl(0.026, 0.03, 1.7, 8), wood, { p: [0, 0.35, 0] }));
        g.add(mesh(ext("spear", SH.spearhead, 0.012, 0.012), edge, { p: [0, 1.2, 0] }));
        g.add(mesh(cyl(0.035, 0.03, 0.1, 8), trim, { p: [0, 1.18, 0] }));
        for (let i = 0; i < 2; i++) g.add(mesh(ext("feather", SH.feather, 0.004, 0), pmat("cloth", i ? RM.accent : RM.color, { ds: true }), { p: [0.02, 1.1, 0], r: [0, i * 1.2, -2.6], s: 0.5 }));
        if (gc) runes(g, gc, 1.24, 1.4, 0, 0.012, 2);
        addGlow(g, w.rarity, [[0, 1.35, 0]], 0.35);
        break;
      }
      case "stab": {
        // gewundener Holzstab mit Krallenfassung und schwebendem Kristall
        const pts = [];
        for (let i = 0; i <= 8; i++) pts.push([Math.sin(i * 1.3) * 0.025, -0.45 + i * 0.22, Math.cos(i * 1.7) * 0.02]);
        g.add(mesh(tube("staff", pts, 0.035, 32, 7), wood));
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * PI * 2;
          g.add(mesh(tube("claw", [[0, 0, 0], [0.06, 0.08, 0], [0.08, 0.2, 0], [0.03, 0.3, 0]], 0.014, 10, 5), wood, { p: [0, 1.32, 0], r: [0, a, 0] }));
        }
        const c = gc || "#7fe3ff";
        const crystal = mesh(octa(0.09), emis(c, 0.9), { p: [0, 1.56, 0], s: [1, 1.7, 1] });
        crystal.userData.spin = 1.5;
        g.add(crystal);
        g.add(haloSprite(c, 0.55, 0.85, [0, 1.56, 0]));
        if (w.style === 1) g.add(mesh(torus(0.15, 0.01, PI * 2, 4, 24), glow(c, 0.7), { p: [0, 1.56, 0], r: [PI / 2.4, 0, 0] }));
        if (w.style === 2) for (const s of [-1, 1]) g.add(mesh(ext("leafs", SH.leaf, 0.004, 0), pmat("plain", "#4f8a3a", { ds: true }), { p: [s * 0.05, 1.3, 0], r: [0, 0, -s * 0.8], s: 0.18 }));
        break;
      }
      case "zepter": {
        g.add(mesh(cyl(0.03, 0.035, 0.7, 8), trim, { p: [0, 0.15, 0] }));
        g.add(mesh(sph(0.045, 8, 6), trim, { p: [0, -0.2, 0] }));
        for (const s of [-1, 1]) g.add(mesh(ext("wing", SH.wing, 0.012, 0.006), trim, { p: [s * 0.02, 0.48, 0], r: [0, s > 0 ? 0 : PI, 0], s: 0.42 }));
        const c = gc || RM.accent;
        const orb = mesh(sph(0.1, 16, 12), emis(c, 0.85), { p: [0, 0.6, 0] });
        g.add(orb);
        g.add(mesh(torus(0.11, 0.012, PI * 2, 4, 20), trim, { p: [0, 0.6, 0], r: [PI / 2, 0, 0] }));
        g.add(haloSprite(c, 0.5, 0.8, [0, 0.6, 0]));
        break;
      }
      case "runenstab": {
        g.add(mesh(cyl(0.032, 0.04, 1.65, 7), pmat("bone", "#d9cfb8"), { p: [0, 0.42, 0] }));
        for (let i = 0; i < 5; i++) g.add(mesh(torus(0.04, 0.01, PI * 2, 4, 10), pmat("leather", "#3a2a1e"), { p: [0, 0.1 + i * 0.25, 0], r: [PI / 2, 0, 0] }));
        // Geweih oben
        for (const s of [-1, 1]) {
          g.add(mesh(tube("ant", [[0, 0, 0], [0.08, 0.1, 0], [0.12, 0.24, 0.02], [0.1, 0.36, 0]], 0.018, 10, 5), pmat("bone", "#e8dcc0"), { p: [0, 1.22, 0], r: [0, s > 0 ? 0 : PI, 0] }));
        }
        const c = gc || RM.accent;
        const stone = mesh(dodeca(0.075), emis(c, 0.8), { p: [0, 1.36, 0] });
        stone.userData.spin = 1;
        g.add(stone);
        g.add(haloSprite(c, 0.45, 0.8, [0, 1.36, 0]));
        runes(g, c, 0.3, 1.0, 0, 0.04, 5);
        for (const s of [-1, 1]) {
          const tal = grp([s * 0.06, 1.12, 0]);
          tal.add(mesh(cyl(0.003, 0.003, 0.16, 3), basic("#3a2a1e"), { p: [0, -0.08, 0] }));
          tal.add(mesh(cone(0.02, 0.06, 5), pmat("bone", "#e8dcc0"), { p: [0, -0.17, 0], r: [PI, 0, 0] }));
          tal.userData.dangle = s;
          g.add(tal);
        }
        break;
      }
      default:
        g.add(mesh(box(0.08, 0.6, 0.08), wood, { p: [0, 0.3, 0] }));
    }
    return g;
  }

  // UV einer flachen Form auf 0..1 strecken, damit Wappen ganz sichtbar sind
  function fitUV(g) {
    g.computeBoundingBox();
    const bb = g.boundingBox;
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
    uv.needsUpdate = true;
    return g;
  }
  R.fitUV = fitUV;

  function buildOffhand(o, realm) {
    const g = grp();
    const RM = realmData(realm);
    const rk = realmOf(realm);
    const gc = RAR_GLOW[o.rarity];
    const trim = pmat("metal", gc ? mix(RM.trim, gc, 0.35) : RM.trim, gc ? { e: gc, ei: 0.25 } : null);
    if (o.base === "schild") {
      const face = o.tint || RM.color;
      const shapeK = o.style === 1 ? "kite" : o.style === 2 ? (rk === "hibernia" ? "leaf" : "heater") : rk === "albion" ? "heater" : rk === "hibernia" ? "leaf" : "round";
      if (shapeK === "round") {
        g.add(mesh(cyl(0.44, 0.44, 0.06, 28), pmat("wood", face), { r: [PI / 2, 0, 0] }));
        g.add(mesh(torus(0.44, 0.035, PI * 2, 6, 32), trim));
        g.add(mesh(sph(0.11, 14, 10), trim, { p: [0, 0, 0.04], s: [1, 1, 0.7] }));
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * PI * 2;
          g.add(mesh(sph(0.025, 6, 6), trim, { p: [Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.035] }));
        }
        const crest = new T.Mesh(new T.CircleGeometry(0.3, 24), crestMat(rk, shade(face, 0.9), RM.trim));
        crest.position.z = 0.032;
        g.add(crest);
      } else {
        const pts = SH[shapeK];
        g.add(mesh(ext("sh" + shapeK, pts, 0.05, 0.03), pmat("metal", shade(RM.metal, 0.85)), { s: [1, 1, 1] }));
        const front = new T.Mesh(geo("shf" + shapeK, () => fitUV(new T.ShapeGeometry(shapeOf(pts), 10))), crestMat(rk, face, RM.trim));
        front.scale.set(0.86, 0.86, 1);
        front.position.z = 0.058;
        g.add(front);
        g.add(mesh(sph(0.07, 12, 8), trim, { p: [0, 0.05, 0.06], s: [1, 1, 0.6] }));
      }
      addGlow(g, o.rarity, [[0, 0.05, 0.12]], 0.5);
    } else if (o.base === "koecher") {
      g.add(mesh(cyl(0.1, 0.085, 0.62, 10), pmat("leather", o.tint || "#6b4a2f")));
      g.add(mesh(torus(0.1, 0.015, PI * 2, 4, 14), trim, { p: [0, 0.3, 0], r: [PI / 2, 0, 0] }));
      g.add(mesh(torus(0.09, 0.015, PI * 2, 4, 14), trim, { p: [0, -0.2, 0], r: [PI / 2, 0, 0] }));
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.035;
        g.add(mesh(cyl(0.008, 0.008, 0.3, 4), pmat("wood", "#c9b89a"), { p: [x, 0.42, (i % 2) * 0.03] }));
        g.add(mesh(ext("feather", SH.feather, 0.003, 0), pmat("cloth", i % 2 ? RM.accent : RM.color, { ds: true }), { p: [x, 0.5, (i % 2) * 0.03], s: 0.32 }));
      }
    } else if (o.base === "wurfmesser") {
      // Bandelier mit Messern quer ueber die Brust
      g.add(mesh(box(0.07, 0.75, 0.025), pmat("leather", "#2a1e18"), {}));
      for (let i = 0; i < 4; i++) {
        const k = grp([0, -0.22 + i * 0.15, 0.02]);
        k.add(mesh(ext("rbdolch", SH.dagger, 0.006, 0.006), edgeMat(o.rarity), { s: 0.45, r: [0, 0, PI] }));
        k.add(mesh(cyl(0.012, 0.012, 0.06, 6), pmat("leather", "#5a3d2a"), { p: [0, 0.03, 0] }));
        g.add(k);
      }
    } else if (o.base === "fokus") {
      const c = gc || o.tint || RM.accent;
      if (o.style === 2) {
        // schwebendes Buch
        const book = grp();
        book.add(mesh(box(0.28, 0.05, 0.22), pmat("leather", "#4a2a3a")));
        book.add(mesh(box(0.26, 0.04, 0.2), pmat("cloth", "#efe6d2"), { p: [0, 0.035, 0] }));
        book.add(mesh(octa(0.04), emis(c, 1), { p: [0, 0.07, 0] }));
        book.userData.bob = 1;
        g.add(book);
      } else {
        const cr = mesh(octa(0.13), emis(c, 0.9), { s: [1, 1.5, 1] });
        cr.userData.spin = 2.2;
        cr.userData.bob = 1;
        g.add(cr);
      }
      g.add(mesh(torus(0.24, 0.008, PI * 2, 4, 30), glow(c, 0.8), { r: [PI / 2.3, 0, 0] }));
      g.add(haloSprite(c, 0.6, 0.8, [0, 0, 0]));
    }
    return g;
  }
  R.buildWeapon = buildWeapon;
  R.buildOffhand = buildOffhand;
  R.shapeOf = shapeOf;
  R.rng = rng;
  R.hash = hash;

  /* ---------- Helden ---------- */
  const OLD_RACE = { wolkling: "albier", steinbart: "kreidezwerg", hornvolk: "trollblut", nebelalb: "sidhe", moosling: "moorling" };
  const OLD_CLS = { klinge: "schildritter", wind: "mondschuetze", rune: "runenwirker" };

  // Kopf mit leicht geformtem Kiefer (verformte Kugel)
  function headGeo(jaw, chin, long) {
    return geo("head" + jaw + "|" + chin + "|" + long, () => {
      const gg = new T.SphereGeometry(0.2, 32, 24);
      const p = gg.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i);
        let y = p.getY(i);
        let z = p.getZ(i);
        const ny = y / 0.2;
        y *= long;
        if (ny < 0) {
          const k = -ny;
          x *= 1 - 0.22 * k * k * (2 - jaw);
          z += Math.max(0, z / 0.2) * 0.03 * k * chin;
          y -= 0.025 * k * k * chin;
        }
        if (z < 0) z *= 1.05;
        // Gesicht vorne leicht abflachen
        if (z > 0.12 && Math.abs(ny) < 0.6) z -= (z - 0.12) * 0.25;
        p.setXYZ(i, x, y, z);
      }
      gg.computeVertexNormals();
      return gg;
    });
  }

  R.buildHero = function (desc) {
    const D = SB.data;
    const raceId = D.RACES[desc.race] ? desc.race : OLD_RACE[desc.race] || "albier";
    const race = D.RACES[raceId];
    const clsId = D.CLASSES[desc.cls] ? desc.cls : OLD_CLS[desc.cls] || "schildritter";
    const C = D.CLASSES[clsId];
    const arch = C.arch;
    const realmArg = desc.realmDef || realmOf(desc.realm || C.realm || race.realm);
    const RM = realmData(realmArg);
    const realm = desc.realmDef ? desc.realmDef.style || "midgard" : realmArg;
    const look = Object.assign({ skin: race.skins[0], hair: race.hairs[0], hairStyle: 0, beard: 0, eyes: "#3a2a1e", tattoo: "keine", tattooColor: "#2f5fd0", scar: "keine", horns: 0 }, desc.look || {});
    const gear = desc.gear || {};
    const fem = desc.gender === "w";
    const undead = !!desc.undead;
    const h = race.height;
    const w = race.width * (fem ? 0.9 : 1);
    const bulk = (race.bulk || 1) * (fem ? 0.88 : 1);
    const tcol = D.TATTOO_COLORS.find((t) => t.c === look.tattooColor) || { c: look.tattooColor || "#2f5fd0" };
    const eyeInfo = D.EYES.find((e) => e.c === look.eyes) || {};
    const skinM = pmat("skin", look.skin);
    const armor = gear.ruestung;
    const mat = D.ARCHETYPES[arch].material;
    const root = grp();
    const body = grp();
    root.add(body);
    const parts = { root, body };

    const armorC = armor ? armor.tint || RM.metal : null;
    const realmCloth = RM.color;
    const pantsC = arch === "krieger" ? shade(RM.dark, 1.3) : arch === "magier" ? shade(armorC || realmCloth, 0.55) : "#4a3a2c";
    const bootC = gear.stiefel ? gear.stiefel.tint || "#4a3424" : "#3e2e22";
    const plate = mat === "platte" && !!armor;
    const metalM = pmat("metal", plate ? armorC : RM.metal);
    const trimM = pmat("metal", RM.trim, { sh: 70 });

    /* Beine: Oberschenkel, Knie, Unterschenkel, Fuss */
    const hipY = 0.95 * h;
    const thighL = 0.44 * h;
    const shinL = 0.42 * h;
    for (const side of [1, -1]) {
      const leg = grp([0.15 * w * side, hipY, 0]);
      const thighM = plate ? pmat("cloth", pantsC) : pmat(arch === "magier" ? "cloth" : "leather", pantsC);
      leg.add(mesh(capsule(0.1 * bulk, thighL * 0.75), thighM, { p: [0, -thighL / 2, 0] }));
      const knee = grp([0, -thighL, 0]);
      leg.add(knee);
      knee.add(mesh(capsule(0.085 * bulk, shinL * 0.7), thighM, { p: [0, -shinL / 2, 0] }));
      // Stiefel
      const bm = arch === "krieger" && gear.stiefel ? pmat("metal", shade(armorC || RM.metal, 0.95)) : pmat("leather", bootC);
      knee.add(mesh(cyl(0.1 * bulk, 0.095 * bulk, shinL * 0.62, 12), bm, { p: [0, -shinL * 0.62, 0] }));
      knee.add(mesh(cyl(0.12 * bulk, 0.105 * bulk, 0.07, 12), arch === "krieger" ? trimM : pmat("fur", "#8a7a66"), { p: [0, -shinL * 0.32, 0] }));
      const foot = grp([0, -shinL, 0]);
      knee.add(foot);
      foot.add(mesh(box(0.15 * bulk, 0.1, 0.3), bm, { p: [0, -0.02, 0.06] }));
      foot.add(mesh(sph(0.08 * bulk, 10, 8), bm, { p: [0, -0.02, 0.2], s: [1, 0.7, 1] }));
      if (arch === "krieger") {
        knee.add(mesh(sph(0.075 * bulk, 10, 8), metalM, { p: [0, 0.0, 0.07], s: [1, 1, 0.8] }));
        leg.add(mesh(capsule(0.105 * bulk, thighL * 0.45), metalM, { p: [0, -thighL * 0.55, 0.02], s: [1.05, 1, 1.05] }));
      }
      body.add(leg);
      parts[side > 0 ? "legL" : "legR"] = leg;
      parts[side > 0 ? "kneeL" : "kneeR"] = knee;
    }

    /* Rumpf */
    const torso = grp([0, hipY, 0]);
    body.add(torso);
    parts.torso = torso;
    const chestY = 0.44 * h;
    const shY = 0.6 * h;
    const tw = w * (0.92 + 0.08 * bulk);
    const shirtC = arch === "krieger" ? "#5a4a3a" : arch === "magier" ? armorC || realmCloth : armor ? armor.tint || "#5a3d2a" : "#7a6a55";
    // Becken und Bauch
    torso.add(mesh(sph(0.2, 16, 12), pmat(arch === "magier" ? "cloth" : "leather", pantsC), { p: [0, 0.04, 0], s: [1.2 * tw, 0.75, 0.95] }));
    torso.add(mesh(cyl(0.21 * tw, 0.19 * tw, 0.3 * h, 16), pmat(arch === "magier" ? "cloth" : "leather", shirtC), { p: [0, 0.2 * h, 0], s: [1, 1, 0.82] }));
    // Brustkorb (heroisch breit)
    const chestM = plate ? metalM : arch === "magier" ? pmat("cloth", shirtC) : pmat("leather", shirtC);
    torso.add(mesh(sph(0.27, 20, 14), chestM, { p: [0, chestY, 0.0], s: [1.28 * tw, 0.92 * h, 0.82] }));
    if (fem && !plate) torso.add(mesh(sph(0.12, 12, 10), chestM, { p: [0, chestY - 0.02, 0.13], s: [1.6 * tw, 0.75, 0.75] }));
    // Guertel mit Schnalle
    torso.add(mesh(torus(0.215 * tw, 0.035, PI * 2, 6, 24), pmat("leather", "#3a281c"), { p: [0, 0.1, 0], r: [PI / 2, 0, 0], s: [1, 0.82, 1] }));
    torso.add(mesh(box(0.11, 0.08, 0.04), trimM, { p: [0, 0.1, 0.18] }));
    parts.chest = torso;

    if (arch === "krieger") {
      if (plate) {
        // Brustplatte, Bauchschienen, Waffenrock mit Wappen
        torso.add(mesh(sph(0.25, 18, 12, 0), metalM, { p: [0, chestY + 0.02, 0.06], s: [1.18 * tw, 0.86 * h, 0.7] }));
        for (let i = 0; i < 3; i++) torso.add(mesh(cyl(0.205 * tw - i * 0.005, 0.2 * tw - i * 0.005, 0.065, 16), metalM, { p: [0, 0.3 * h - i * 0.07, 0.01], s: [1, 1, 0.85] }));
        torso.add(mesh(box(0.06, 0.24 * h, 0.03), trimM, { p: [0, chestY + 0.02, 0.24] }));
        if (armor.style === 1) torso.add(mesh(octa(0.06), emis(RM.accent, 0.6), { p: [0, chestY + 0.08, 0.26], s: [1, 1.3, 0.5] }));
        if (armor.style === 2) for (const s of [-1, 1]) torso.add(mesh(cone(0.04, 0.16, 6), trimM, { p: [s * 0.16 * tw, chestY + 0.06, 0.18], r: [1.2, 0, 0] }));
      }
      const tab = new T.Mesh(new T.PlaneGeometry(0.3 * tw, 0.46 * h), crestMat(realmOf(realmArg), RM.color, RM.trim));
      tab.position.set(0, -0.14 * h, 0.2);
      tab.rotation.x = -0.08;
      tab.castShadow = true;
      torso.add(tab);
      parts.tabard = tab;
      // Plattenschurz
      for (const s of [-1, 1]) torso.add(mesh(box(0.18 * tw, 0.22 * h, 0.04), metalM, { p: [s * 0.16 * tw, -0.06, 0.1], r: [-0.12, 0, s * 0.14] }));
    } else if (arch === "schurke") {
      // Lederwams mit gekreuzten Riemen, Schaerpe
      const strapM = pmat("leather", "#2a1e18");
      for (const s of [-1, 1]) torso.add(mesh(box(0.05, 0.6 * h, 0.03), strapM, { p: [0, chestY - 0.02, 0.2], r: [0, 0, s * 0.62] }));
      torso.add(mesh(sph(0.04, 8, 6), trimM, { p: [0, chestY - 0.02, 0.23] }));
      torso.add(mesh(box(0.42 * tw, 0.1, 0.03), pmat("cloth", RM.color), { p: [0, 0.06, 0.16], r: [-0.1, 0, 0.1] }));
      torso.add(mesh(box(0.1, 0.42 * h, 0.02), pmat("cloth", RM.color), { p: [0.12, -0.16, 0.17], r: [-0.08, 0, -0.08] }));
      for (const s of [-1, 1]) torso.add(mesh(box(0.1, 0.1, 0.06), pmat("leather", "#4a3424"), { p: [s * 0.2 * tw, 0.06, 0.12] }));
    } else if (arch === "jaeger") {
      // Wams mit Fellkragen
      torso.add(mesh(torus(0.2 * tw, 0.07, PI * 2, 8, 20), pmat("fur", realm === "midgard" ? "#d9d2c5" : "#7a6248"), { p: [0, shY + 0.02, 0], r: [PI / 2, 0, 0], s: [1, 0.85, 1] }));
      torso.add(mesh(box(0.05, 0.6 * h, 0.03), pmat("leather", "#2a1e18"), { p: [0, chestY - 0.02, 0.2], r: [0, 0, 0.62] }));
      torso.add(mesh(cyl(0.22 * tw, 0.3 * tw, 0.32 * h, 16, true), pmat("leather", shade(shirtC, 0.85), { ds: true }), { p: [0, -0.12 * h, 0], s: [1, 1, 0.85] }));
    } else {
      // Robe: langer Rock bis zum Boden, hoher Kragen, Schaerpe
      const robeC = armorC || realmCloth;
      const robeM = pmat("cloth", robeC, { ds: true });
      torso.add(mesh(lathe("robe", [[0.2, 0.18], [0.24, 0], [0.3, -0.35], [0.36, -0.7], [0.4, -0.9]], 20), robeM, { s: [tw, h, 0.85] }));
      torso.add(mesh(torus(0.4 * tw, 0.02, PI * 2, 4, 30), trimM, { p: [0, -0.9 * h, 0], r: [PI / 2, 0, 0], s: [1, 0.85, 1] }));
      torso.add(mesh(box(0.12, 0.85 * h, 0.02), pmat("cloth", RM.accent === "#cfe3ff" ? "#2a3a5a" : shade(RM.color, 0.8)), { p: [0, -0.42 * h, 0.32], r: [-0.4, 0, 0] }));
      torso.add(mesh(cyl(0.2 * tw, 0.24 * tw, 0.16, 16, true), pmat("cloth", shade(robeC, 0.8), { ds: true }), { p: [0, shY + 0.1, -0.03], s: [1, 1, 0.9] }));
      if (armor && armor.style !== 0) for (let i = 0; i < 3; i++) torso.add(mesh(octa(0.03), emis(RM.accent, 0.8), { p: [0, chestY + 0.1 - i * 0.12, 0.23] }));
    }

    /* Umhang */
    if (gear.umhang) {
      const cc = gear.umhang.tint || RM.color;
      const cg = new T.PlaneGeometry(0.62 * tw, 1.12 * h, 5, 10);
      cg.translate(0, -0.56 * h, 0);
      const capeMesh = new T.Mesh(cg, pmat("cloth", cc, { ds: true }));
      capeMesh.position.set(0, shY + 0.02, -0.22);
      capeMesh.rotation.x = 0.1;
      capeMesh.castShadow = true;
      capeMesh.userData.cape = cg.attributes.position.array.slice(0);
      torso.add(capeMesh);
      parts.cape = capeMesh;
      torso.add(mesh(torus(0.22 * tw, 0.045, PI, 6, 14), pmat(gear.umhang.style === 1 ? "fur" : "cloth", gear.umhang.style === 1 ? "#8a7a66" : shade(cc, 0.75)), { p: [0, shY + 0.02, -0.06], r: [PI / 2 - 0.2, 0, 0] }));
      for (const s of [-1, 1]) torso.add(mesh(sph(0.04, 8, 6), trimM, { p: [s * 0.18 * tw, shY, 0.12] }));
    }

    /* Hals und Kopf */
    const HR = 0.2;
    const head = grp([0, shY + 0.21, 0.02]);
    torso.add(head);
    parts.head = head;
    torso.add(mesh(cyl(0.075 * bulk + 0.02, 0.09 * bulk + 0.02, 0.16, 10), skinM, { p: [0, shY + 0.06, 0.01] }));
    const jaw = raceId === "trollblut" ? 1.6 : raceId === "kreidezwerg" || raceId === "nordmann" ? 1.3 : raceId === "sidhe" ? 0.6 : raceId === "moorling" ? 1.4 : 1.0;
    const chin = fem ? 0.5 : raceId === "trollblut" ? 1.8 : 1.1;
    const long = raceId === "sidhe" ? 1.1 : raceId === "moorling" ? 0.95 : 1.04;
    const faceM = faceTex({ skin: look.skin, eyes: look.eyes, eyeGlow: !!eyeInfo.glow || undead, brow: shade(look.hair, 0.8), tattoo: look.tattoo, tc: tcol.c, tglow: !!tcol.glow, scar: look.scar, fem, undead, race: raceId });
    const headM = mesh(headGeo(jaw, chin, long), faceM, { s: [(raceId === "kreidezwerg" ? 1.08 : 1) * (raceId === "moorling" ? 1.08 : 1), 1, 1] });
    head.add(headM);
    // Nase, Brauenwulst
    const nose = raceId === "trollblut" ? [0.05, 0.1] : raceId === "moorling" ? [0.04, 0.06] : raceId === "sidhe" ? [0.025, 0.07] : [0.032, 0.08];
    head.add(mesh(cone(nose[0], nose[1], 6), skinM, { p: [0, -0.02, HR * 0.98], r: [1.35, 0, 0], s: [1, 1, 0.7] }));
    for (const s of [-1, 1]) head.add(mesh(sph(0.05, 10, 6), skinM, { p: [s * 0.06, 0.045, 0.165], s: [1.3, 0.35, 0.5], r: [0, 0, s * 0.18] }));
    if (glowEyes(eyeInfo, undead)) for (const s of [-1, 1]) head.add(haloSprite(look.eyes || "#9fe3ff", 0.16, 0.7, [s * 0.066, 0.012, HR * 1.0]));
    // Ohren
    for (const side of [1, -1]) {
      const ex = HR * 0.95 * side * (raceId === "kreidezwerg" ? 1.08 : 1);
      if (race.ears === "elf") head.add(mesh(cone(0.05, 0.34, 6), skinM, { p: [ex, 0.03, -0.02], r: [0.35, 0, -side * 1.15], s: [1, 1, 0.4] }));
      else if (race.ears === "long") head.add(mesh(cone(0.055, 0.22, 6), skinM, { p: [ex, 0.02, -0.01], r: [0.2, 0, -side * 1.35], s: [1, 1, 0.45] }));
      else if (race.ears === "leaf") head.add(mesh(ext("leaf", SH.leaf, 0.01, 0.004), skinM, { p: [ex + side * 0.07, 0.04, -0.02], r: [0.2, side * 0.4, -side * 1.1], s: 0.2 }));
      else head.add(mesh(sph(0.045, 8, 8), skinM, { p: [ex, 0, 0], s: [0.5, 1, 0.8] }));
    }
    // Hauer und Hoerner (Trollblut)
    if (race.tusks) for (const s of [-1, 1]) head.add(mesh(cone(0.022, 0.1, 6), pmat("bone", "#efe6d2"), { p: [s * 0.07, -0.12, HR * 0.78], r: [-0.25, 0, s * 0.25] }));
    if (race.horns) {
      const hm = pmat("bone", "#d9cdb4");
      const hv = look.horns | 0;
      for (const s of [-1, 1]) {
        const hp =
          hv === 1
            ? [[0, 0, 0], [0.03 * s, 0.1, -0.01], [0.04 * s, 0.22, -0.04], [0.02 * s, 0.32, -0.08]]
            : hv === 2
              ? [[0, 0, 0], [0.06 * s, 0.05, -0.08], [0.1 * s, 0.06, -0.2], [0.12 * s, 0.02, -0.3]]
              : [[0, 0, 0], [0.1 * s, 0.08, -0.04], [0.18 * s, 0.02, -0.04], [0.19 * s, -0.08, 0.03], [0.14 * s, -0.12, 0.08]];
        head.add(mesh(tube("horn" + hv + s, hp, 0.032, 14, 7), hm, { p: [s * 0.1, 0.14, 0] }));
      }
    }

    /* Haare und Bart */
    const hairM = pmat("hair", look.hair);
    const hs = look.hairStyle | 0;
    const helmOn = !!gear.helm;
    const hoodOn = helmOn && (gear.helm.base === "maske" || gear.helm.base === "kappe" || (gear.helm.base === "hut" && (gear.helm.style | 0) === 0));
    if (raceId === "moorling" && !helmOn) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        head.add(mesh(ico(0.07, 0), pmat("fur", look.hair), { p: [Math.cos(a) * 0.1, 0.16, Math.sin(a) * 0.1 - 0.03], s: [1, 0.8, 1] }));
      }
      head.add(mesh(ext("leaf", SH.leaf, 0.006, 0.003), pmat("plain", "#5f8a3a", { ds: true }), { p: [0.06, 0.24, 0], r: [0.3, 0, -0.5], s: 0.18 }));
    } else if (hs !== 4 && !helmOn) {
      head.add(mesh(cap(HR * 1.06, PI * 0.45), hairM, { p: [0, 0.01, -0.012], r: [-0.3, 0, 0] }));
      for (let i = 0; i < 4; i++) head.add(mesh(cone(0.045, 0.13, 5), hairM, { p: [(i - 1.5) * 0.06, 0.13, 0.13 - Math.abs(i - 1.5) * 0.015], r: [1.9, 0, (i - 1.5) * 0.35], s: [1.2, 1, 0.6] }));
      for (const s of [-1, 1]) head.add(mesh(box(0.03, 0.12, 0.06), hairM, { p: [s * 0.185, -0.02, 0.03] }));
      if (hs === 0) for (let i = 0; i < 5; i++) head.add(mesh(cone(0.045, 0.12, 5), hairM, { p: [(i - 2) * 0.05, 0.17, 0.06 - Math.abs(i - 2) * 0.02], r: [0.7, 0, (i - 2) * -0.3] }));
      if (hs === 3) for (let i = 0; i < 6; i++) head.add(mesh(cone(0.04, 0.2 - Math.abs(i - 2.5) * 0.02, 4), hairM, { p: [0, 0.2 - i * 0.018, 0.1 - i * 0.07], r: [-0.4 - i * 0.18, 0, 0], s: [0.5, 1, 1.3] }));
      if (hs === 5) {
        head.add(mesh(sph(0.07, 10, 8), hairM, { p: [0, 0.21, -0.07] }));
        head.add(mesh(torus(0.05, 0.012, PI * 2, 4, 12), trimM, { p: [0, 0.19, -0.06], r: [1.2, 0, 0] }));
      }
    }
    if (!hoodOn && (hs === 1 || hs === 2 || (fem && hs === 0)) && raceId !== "moorling") {
      // Langes Haar faellt auf die Schultern
      head.add(mesh(cyl(0.17, 0.2, 0.3, 14, true), pmat("hair", look.hair, { ds: true }), { p: [0, -0.12, -0.05], s: [1, 1, 0.9] }));
      if (hs === 2) head.add(mesh(box(0.34, 0.42, 0.08), hairM, { p: [0, -0.24, -0.14], r: [0.15, 0, 0] }));
    }
    if (hs === 1 && raceId !== "moorling") {
      for (const s of [-1, 1]) {
        for (let i = 0; i < 4; i++) head.add(mesh(sph(0.035 - i * 0.003, 8, 6), hairM, { p: [s * 0.17, -0.1 - i * 0.07, 0.04 - i * 0.01] }));
        head.add(mesh(cyl(0.022, 0.022, 0.03, 8), trimM, { p: [s * 0.17, -0.38, 0.0] }));
      }
    }
    const bd = fem ? 0 : look.beard | 0;
    if (bd === 1) head.add(mesh(cone(0.05, 0.16, 8), hairM, { p: [0, -0.24, 0.14], r: [PI - 0.35, 0, 0] }));
    if (bd === 2 || bd === 3) {
      head.add(mesh(sph(0.15, 14, 10, 0), hairM, { p: [0, -0.15, 0.08], s: [1.1, 1.0, 0.75] }));
      head.add(mesh(cone(0.12, 0.24, 10), hairM, { p: [0, -0.32, 0.1], r: [PI - 0.15, 0, 0], s: [1, 1, 0.7] }));
      if (bd === 3) {
        for (const s of [-1, 1]) {
          for (let i = 0; i < 3; i++) head.add(mesh(sph(0.03, 8, 6), hairM, { p: [s * 0.06, -0.42 - i * 0.06, 0.13] }));
          head.add(mesh(cyl(0.022, 0.022, 0.03, 8), trimM, { p: [s * 0.06, -0.6, 0.13] }));
        }
      }
    }
    if (bd === 4 || bd === 2 || bd === 3) for (const s of [-1, 1]) head.add(mesh(capsule(0.016, 0.09, 6), hairM, { p: [s * 0.05, -0.095, 0.19], r: [0, 0, s * 1.15] }));
    if (bd === 4) for (const s of [-1, 1]) head.add(mesh(capsule(0.018, 0.1, 6), hairM, { p: [s * 0.1, -0.18, 0.17], r: [0, 0, s * 0.2] }));

    /* Kopfbedeckung */
    if (gear.helm) buildHelm(head, gear.helm, realm, RM, raceId, parts);

    /* Arme: Schulter, Ellbogen, Hand */
    const bareArms = mat === "leder" && !(gear.helm && false);
    const armSkin = bareArms ? armTex(look.skin, look.tattoo, tcol.c, !!tcol.glow) : null;
    const sleeveM = arch === "krieger" ? pmat("cloth", pantsC) : arch === "magier" ? pmat("cloth", armorC || realmCloth) : pmat("leather", shirtC);
    const handM = gear.handschuhe ? (arch === "krieger" ? pmat("metal", shade(gear.handschuhe.tint || armorC || RM.metal, 1)) : pmat("leather", gear.handschuhe.tint || "#4a3424")) : skinM;
    const upL = 0.3 * h;
    const foL = 0.28 * h;
    for (const side of [1, -1]) {
      const arm = grp([(0.34 * tw + 0.02) * side, shY - 0.04, 0]);
      arm.add(mesh(capsule(0.075 * bulk, upL * 0.7), bareArms ? armSkin : sleeveM, { p: [0, -upL / 2, 0] }));
      const elbow = grp([0, -upL, 0]);
      arm.add(elbow);
      elbow.add(mesh(capsule(0.068 * bulk, foL * 0.7), bareArms || arch === "krieger" ? (bareArms ? skinM : sleeveM) : sleeveM, { p: [0, -foL / 2, 0] }));
      // Armschienen / Aermel
      if (arch === "krieger") {
        elbow.add(mesh(cyl(0.085 * bulk, 0.075 * bulk, foL * 0.7, 10), metalM, { p: [0, -foL * 0.5, 0] }));
        arm.add(mesh(capsule(0.082 * bulk, upL * 0.4), metalM, { p: [0, -upL * 0.6, 0] }));
        elbow.add(mesh(sph(0.06 * bulk, 8, 6), trimM, { p: [0, 0, -0.04] }));
      } else if (arch === "magier") {
        elbow.add(mesh(cyl(0.08 * bulk, 0.15 * bulk, foL * 0.8, 12, true), pmat("cloth", armorC || realmCloth, { ds: true }), { p: [0, -foL * 0.55, 0] }));
        elbow.add(mesh(torus(0.145 * bulk, 0.012, PI * 2, 4, 16), trimM, { p: [0, -foL * 0.95, 0], r: [PI / 2, 0, 0] }));
      } else {
        elbow.add(mesh(cyl(0.078 * bulk, 0.072 * bulk, foL * 0.6, 10), pmat("leather", gear.handschuhe ? gear.handschuhe.tint || "#3a281c" : "#3a281c"), { p: [0, -foL * 0.62, 0] }));
        for (let i = 0; i < 2; i++) elbow.add(mesh(torus(0.079 * bulk, 0.008, PI * 2, 4, 12), trimM, { p: [0, -foL * (0.45 + i * 0.3), 0], r: [PI / 2, 0, 0] }));
      }
      const hand = grp([0, -foL - 0.04, 0.01]);
      hand.add(mesh(sph(0.065 * bulk, 10, 8), handM, { s: [1, 1.15, 1.05] }));
      hand.add(mesh(box(0.06 * bulk, 0.05, 0.1), handM, { p: [0, -0.03, 0.03] }));
      elbow.add(hand);
      buildShoulder(arm, side, arch, realm, RM, armor, tw, bulk, metalM, trimM);
      torso.add(arm);
      parts[side > 0 ? "armL" : "armR"] = arm;
      parts[side > 0 ? "elbowL" : "elbowR"] = elbow;
      parts[side > 0 ? "handL" : "handR"] = hand;
    }

    /* Waffe und Nebenhand */
    const wpn = gear.waffe;
    const dual = wpn && (wpn.base === "dolch" || wpn.base === "sichel" || wpn.base === "kurzschwert");
    if (wpn) {
      const wg = buildWeapon(wpn, realmArg);
      if (wpn.base === "bogen") {
        wg.rotation.set(PI / 2, 0, 0);
        wg.position.set(0, -0.02, 0.02);
        parts.handL.add(wg);
      } else if (wpn.base === "armbrust") {
        wg.rotation.set(-0.1, 0, 0);
        wg.position.set(0, -0.02, 0);
        parts.handR.add(wg);
      } else if (wpn.base === "stab" || wpn.base === "runenstab" || wpn.base === "speer") {
        wg.rotation.set(0.9, 0, 0);
        wg.position.set(0, -0.02, 0.02);
        parts.handR.add(wg);
      } else {
        // Klinge nach vorn und leicht nach aussen, nicht vor das Gesicht
        wg.rotation.set(dual ? 2.75 : 2.15, 0, dual ? 0 : 0.25);
        wg.position.set(0, -0.03, 0.02);
        parts.handR.add(wg);
      }
      wg.scale.setScalar(0.82);
      parts.weapon = wg;
      if (dual) {
        const w2 = buildWeapon(wpn, realmArg);
        w2.rotation.set(2.75, 0, 0);
        w2.position.set(0, -0.03, 0.02);
        w2.scale.setScalar(0.82);
        parts.handL.add(w2);
        parts.weapon2 = w2;
      }
    }
    const off = gear.nebenhand;
    if (off) {
      const og = buildOffhand(off, realmArg);
      if (off.base === "schild") {
        og.position.set(0.06, -0.06, 0.02);
        og.rotation.set(PI / 2, 0, -0.2);
        og.scale.setScalar(0.92);
        parts.handL.add(og);
      } else if (off.base === "koecher") {
        og.position.set(0.12, chestY + 0.05, -0.24);
        og.rotation.set(-0.25, 0, -0.45);
        torso.add(og);
      } else if (off.base === "wurfmesser") {
        og.position.set(0, chestY - 0.03, 0.235);
        og.rotation.set(-0.12, 0, -0.62);
        torso.add(og);
      } else {
        og.position.set(0.32, 0.25, 0.32);
        og.userData.float = 1;
        torso.add(og);
      }
      parts.offhand = og;
    }

    const scale = 0.96 + 0.04 * h;
    root.scale.setScalar(scale);
    const model = makeModel(root, parts, "hero");
    model.cls = clsId;
    model.arch = arch;
    model.realm = desc.realmDef ? null : realm;
    model.dual = !!dual;
    model.ranged = !!(wpn && SB.data.BASES[wpn.base] && SB.data.BASES[wpn.base].ranged);
    model.weaponBase = wpn ? wpn.base : null;
    model.height = (hipY + shY + 0.45) * scale;
    model.headY = (hipY + shY + 0.21) * scale;
    model.projColor = arch === "magier" ? (realm === "albion" ? "#ffd27a" : realm === "midgard" ? "#9fd8ff" : "#7fffb0") : arch === "jaeger" ? "#e9d8a6" : "#ffd25a";
    return model;
  };
  const glowEyes = (eyeInfo, undead) => !!(eyeInfo && eyeInfo.glow) || undead;

  function buildShoulder(arm, side, arch, realm, RM, armor, tw, bulk, metalM, trimM) {
    const sc = bulk * (0.95 + tw * 0.05);
    if (arch === "krieger" && armor) {
      const p = grp([side * 0.03, 0.03, 0]);
      p.rotation.z = -side * 0.35;
      const st = armor.style | 0;
      if (realm === "hibernia") {
        // gefaecherte Blattplatten
        for (let i = 0; i < 3; i++) p.add(mesh(ext("leaf", SH.leaf, 0.02, 0.01), metalM, { p: [side * 0.04, 0.02 - i * 0.04, 0.0], r: [PI / 2, (i - 1) * 0.5, 0], s: [0.38 * sc, 0.38 * sc, 1] }));
        p.add(mesh(cap(0.13 * sc, PI * 0.5), metalM, { s: [1.1, 0.7, 1] }));
        p.add(mesh(octa(0.03), emis(RM.accent, 0.8), { p: [side * 0.06, 0.08, 0.05] }));
      } else {
        p.add(mesh(cap(0.17 * sc, PI * 0.55), metalM, { s: [1.15, 0.8, 1.1] }));
        p.add(mesh(cap(0.15 * sc, PI * 0.55), metalM, { p: [side * 0.03, -0.07, 0], s: [1.15, 0.75, 1.1] }));
        p.add(mesh(torus(0.17 * sc, 0.015, PI * 2, 5, 24), pmat("metal", RM.trim, { sh: 70 }), { p: [0, 0.01, 0], r: [PI / 2, 0, 0], s: [1.15, 1.1, 1] }));
        if (realm === "midgard") {
          p.add(mesh(torus(0.13 * sc, 0.05, PI * 2, 6, 16), pmat("fur", "#d9d2c5"), { p: [-side * 0.06, 0.02, 0], r: [PI / 2, 0, 0] }));
          for (let i = 0; i < (st === 2 ? 3 : 2); i++) p.add(mesh(cone(0.035, 0.2, 6), metalM, { p: [side * (0.02 + i * 0.05), 0.12, (i - 0.5) * 0.06], r: [0, 0, -side * 0.3] }));
        } else {
          for (let i = 0; i < 3; i++) p.add(mesh(sph(0.016, 6, 6), trimM, { p: [Math.cos(i * 1.2 - 1.2) * 0.17 * sc * 1.1, 0.04, Math.sin(i * 1.2 - 1.2) * 0.17 * sc] }));
          if (st === 1) p.add(mesh(cone(0.05, 0.16, 8), pmat("cloth", RM.color), { p: [0, 0.14, -0.02] }));
        }
      }
      arm.add(p);
    } else if (arch === "schurke") {
      if (side > 0) {
        const p = grp([side * 0.02, 0.02, 0], [0, 0, -side * 0.3]);
        p.add(mesh(cap(0.12 * sc, PI * 0.5), pmat("leather", "#2a1e18"), { s: [1.2, 0.75, 1.1] }));
        p.add(mesh(cap(0.1 * sc, PI * 0.5), pmat("leather", "#3a2a1e"), { p: [side * 0.02, -0.05, 0], s: [1.2, 0.7, 1.1] }));
        for (let i = 0; i < 2; i++) p.add(mesh(cone(0.016, 0.08, 4), pmat("metal", STEEL), { p: [side * 0.03 * i, 0.08, 0.02 * i], r: [0, 0, -side * 0.4] }));
        arm.add(p);
      }
    } else if (arch === "jaeger") {
      if (side < 0) {
        const p = grp([side * 0.02, 0.02, 0], [0, 0, -side * 0.3]);
        p.add(mesh(cap(0.13 * sc, PI * 0.55), pmat("leather", "#5a3d2a"), { s: [1.15, 0.8, 1.1] }));
        p.add(mesh(torus(0.12 * sc, 0.04, PI * 2, 6, 14), pmat("fur", realm === "midgard" ? "#d9d2c5" : "#7a6248"), { p: [0, -0.02, 0], r: [PI / 2, 0, 0] }));
        arm.add(p);
      }
    } else if (arch === "magier") {
      const p = grp([side * 0.01, 0.0, 0], [0, 0, -side * 0.25]);
      p.add(mesh(cap(0.12 * sc, PI * 0.5), pmat("cloth", armor ? armor.tint || RM.color : RM.color), { s: [1.15, 0.75, 1.1] }));
      p.add(mesh(torus(0.12 * sc, 0.012, PI * 2, 4, 18), pmat("metal", RM.trim, { sh: 70 }), { r: [PI / 2, 0, 0], s: [1.15, 1.1, 1] }));
      if (armor && armor.style === 2) p.add(mesh(octa(0.035), emis(RM.accent, 0.9), { p: [side * 0.04, 0.06, 0.05] }));
      arm.add(p);
    }
  }

  function buildHelm(head, hm, realm, RM, raceId, parts) {
    const gc = RAR_GLOW[hm.rarity];
    const st = hm.style | 0;
    const metalM = pmat("metal", hm.tint || RM.metal);
    const trimM = pmat("metal", RM.trim, { sh: 70 });
    const HR = 0.2;
    if (hm.base === "helm") {
      // Helmglocke mit Wangenschutz und Nasal, Reichszier
      head.add(mesh(cap(HR * 1.14, PI * 0.56), metalM, { p: [0, 0.015, -0.01] }));
      head.add(mesh(torus(HR * 1.1, 0.018, PI * 2, 5, 28), trimM, { p: [0, 0.035, -0.01], r: [PI / 2, 0, 0] }));
      head.add(mesh(box(0.035, 0.13, 0.03), metalM, { p: [0, -0.02, HR * 1.12] }));
      for (const s of [-1, 1]) head.add(mesh(box(0.035, 0.15, 0.13), metalM, { p: [s * HR * 1.02, -0.07, 0.05], r: [0, s * 0.25, 0] }));
      if (st === 2) {
        // geschlossenes Visier mit Sehschlitz
        head.add(mesh(sph(HR * 1.12, 18, 12, 0), metalM, { p: [0, -0.02, 0.02], s: [1, 0.95, 1.02] }));
        head.add(mesh(box(0.22, 0.02, 0.02), gc ? emis(gc, 1) : basic("#0b0a0e"), { p: [0, 0.01, HR * 1.12] }));
      }
      if (realm === "midgard") {
        for (const s of [-1, 1]) head.add(mesh(tube("hhorn" + s, [[0, 0, 0], [0.08 * s, 0.06, 0], [0.14 * s, 0.16, -0.02], [0.13 * s, 0.28, -0.05]], 0.03, 14, 7), pmat("bone", "#e8dcc0"), { p: [s * 0.17, 0.08, 0] }));
      } else if (realm === "hibernia") {
        for (const s of [-1, 1]) {
          const ant = grp([s * 0.12, 0.15, -0.02], [0, 0, -s * 0.4]);
          const am = pmat("wood", "#8a6a4a");
          ant.add(mesh(tube("antl", [[0, 0, 0], [0, 0.14, -0.02], [0.02, 0.28, -0.06], [0.0, 0.38, -0.1]], 0.016, 12, 5), am));
          ant.add(mesh(tube("antb", [[0, 0.12, -0.02], [0.08, 0.2, 0], [0.12, 0.24, 0]], 0.012, 8, 5), am, { r: [0, s > 0 ? 0 : PI, 0] }));
          ant.add(mesh(tube("antc", [[0, 0.24, -0.05], [-0.06, 0.32, -0.04], [-0.08, 0.36, -0.03]], 0.01, 8, 5), am, { r: [0, s > 0 ? 0 : PI, 0] }));
          head.add(ant);
        }
      } else {
        const plume = grp([0, HR * 1.12, -0.03]);
        for (let i = 0; i < 5; i++) plume.add(mesh(capsule(0.035, 0.1, 6), pmat("cloth", RM.color), { p: [0, 0.02 - i * 0.012, -0.06 - i * 0.05], r: [-0.7 - i * 0.25, 0, 0] }));
        head.add(plume);
        head.add(mesh(box(0.03, 0.06, 0.34), trimM, { p: [0, HR * 1.1, -0.01] }));
      }
      if (st === 1) head.add(mesh(octa(0.03), gc ? emis(gc, 1) : emis(RM.accent, 0.6), { p: [0, 0.12, HR * 1.06] }));
    } else if (hm.base === "maske") {
      // Kapuze und Gesichtstuch
      const hood = pmat("cloth", hm.tint || "#2a2630", { ds: true });
      head.add(mesh(cap(HR * 1.22, PI * 0.62), hood, { p: [0, 0.0, -0.03], r: [-0.35, 0, 0], s: [1, 1.08, 1.05] }));
      head.add(mesh(cone(0.08, 0.2, 8), hood, { p: [0, 0.09, -0.24], r: [-2.2, 0, 0] }));
      head.add(mesh(cyl(0.24, 0.27, 0.16, 16, true), hood, { p: [0, -0.18, -0.03] }));
      head.add(mesh(sph(HR * 1.04, 18, 10, 0), pmat("cloth", shade(hm.tint || "#2a2630", 0.75)), { p: [0, -0.06, 0.012], s: [1, 0.55, 1.02] }));
      if (st === 2) head.add(mesh(cone(0.05, 0.16, 6), pmat("leather", "#1a1418"), { p: [0, -0.05, HR * 1.12], r: [1.3, 0, 0] }));
      parts.hood = true;
    } else if (hm.base === "kappe") {
      if (st === 2) {
        // Wolfskopf ueber dem Kopf
        const fur = pmat("fur", hm.tint || "#7a7470");
        head.add(mesh(cap(HR * 1.2, PI * 0.6), fur, { p: [0, 0.02, -0.03], r: [-0.25, 0, 0] }));
        head.add(mesh(box(0.14, 0.09, 0.18), fur, { p: [0, 0.16, 0.16], r: [0.25, 0, 0] }));
        head.add(mesh(sph(0.025, 6, 6), basic("#0b0a0e"), { p: [0, 0.18, 0.26] }));
        for (const s of [-1, 1]) {
          head.add(mesh(cone(0.05, 0.12, 4), fur, { p: [s * 0.1, 0.27, -0.02], r: [0, 0, -s * 0.2] }));
          head.add(mesh(sph(0.016, 6, 6), emis("#ffcf5a", 1), { p: [s * 0.05, 0.21, 0.2] }));
        }
        head.add(mesh(cyl(0.25, 0.3, 0.3, 14, true), pmat("fur", hm.tint || "#7a7470", { ds: true }), { p: [0, -0.2, -0.05] }));
      } else {
        const hood = pmat("leather", hm.tint || "#4f5a3a", { ds: true });
        head.add(mesh(cap(HR * 1.2, PI * 0.6), hood, { p: [0, 0.0, -0.03], r: [-0.35, 0, 0], s: [1, 1.05, 1.05] }));
        head.add(mesh(cyl(0.24, 0.29, 0.16, 16, true), hood, { p: [0, -0.18, -0.03] }));
        if (st === 1) for (let i = 0; i < 2; i++) head.add(mesh(ext("feather", SH.feather, 0.004, 0), pmat("cloth", i ? RM.accent : "#efe6d2", { ds: true }), { p: [0.15, 0.12, -0.08], r: [0, 1.2, -0.6 - i * 0.3], s: 0.5 }));
        else head.add(mesh(cone(0.08, 0.24, 8), hood, { p: [0, 0.06, -0.26], r: [-2.0, 0, 0] }));
      }
      parts.hood = true;
    } else {
      // Magier: Kapuze mit Stirnreif, Runenkrone oder Sternenhaube
      const c = hm.tint || RM.color;
      const gem = gc || RM.accent;
      if (st === 1) {
        head.add(mesh(cyl(0.21, 0.2, 0.06, 18, true), trimM, { p: [0, 0.07, 0] }));
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * PI * 2 + PI / 2;
          head.add(mesh(cone(0.022, i === 0 ? 0.16 : 0.1, 5), trimM, { p: [Math.cos(a) * 0.205, 0.14 + (i === 0 ? 0.03 : 0), Math.sin(a) * 0.205] }));
        }
        head.add(mesh(octa(0.03), emis(gem, 1), { p: [0, 0.09, 0.215] }));
        head.add(haloSprite(gem, 0.18, 0.8, [0, 0.09, 0.23]));
      } else if (st === 2) {
        const hat = pmat("cloth", c, { ds: true });
        head.add(mesh(cyl(0.34, 0.34, 0.025, 24), hat, { p: [0, 0.12, 0] }));
        head.add(mesh(cyl(0.11, 0.18, 0.2, 14), hat, { p: [0, 0.22, -0.01] }));
        head.add(mesh(cyl(0.05, 0.11, 0.18, 12), hat, { p: [0, 0.38, -0.05], r: [-0.35, 0, 0] }));
        head.add(mesh(cone(0.05, 0.18, 10), hat, { p: [0, 0.5, -0.14], r: [-0.9, 0, 0] }));
        head.add(mesh(torus(0.17, 0.02, PI * 2, 5, 20), trimM, { p: [0, 0.15, 0], r: [PI / 2, 0, 0] }));
        head.add(mesh(octa(0.03), emis(gem, 1), { p: [0, 0.17, 0.17] }));
      } else {
        const hood = pmat("cloth", c, { ds: true });
        head.add(mesh(cap(HR * 1.22, PI * 0.62), hood, { p: [0, 0.01, -0.03], r: [-0.3, 0, 0], s: [1, 1.1, 1.05] }));
        head.add(mesh(cone(0.09, 0.26, 8), hood, { p: [0, 0.1, -0.25], r: [-2.1, 0, 0] }));
        head.add(mesh(cyl(0.25, 0.3, 0.16, 16, true), hood, { p: [0, -0.18, -0.03] }));
        head.add(mesh(torus(HR * 1.0, 0.012, PI, 4, 16), trimM, { p: [0, 0.08, 0.0], r: [0, 0, 0] }));
        head.add(mesh(octa(0.025), emis(gem, 1), { p: [0, 0.12, 0.2] }));
        parts.hood = true;
      }
    }
  }

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
          if (o.isMesh && !o.material.transparent) {
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
        else if (R.poseMonster) R.poseMonster(model, name, u, dt);
        if (model.inner) model.inner.update(dt);
        const t = model.t;
        root.traverse((o) => {
          const ud = o.userData;
          if (ud.spin) o.rotation.y += dt * ud.spin;
          if (ud.bob) o.position.y = Math.sin(t * 2.5) * 0.05;
          if (ud.float) o.position.y = 0.25 + Math.sin(t * 2) * 0.05;
          if (ud.dangle) o.rotation.z = Math.sin(t * 2 + ud.dangle) * 0.25;
          if (ud.pulse && o.isSprite) o.scale.setScalar(ud.s0 * (0.88 + Math.sin(t * 3 + ud.s0 * 7) * 0.12));
          if (ud.flick) o.scale.y = 1 + Math.sin(t * 13 + ud.flick) * 0.15;
        });
      },
    };
    return model;
  }
  R.makeModel = makeModel;
  R.headGeo = headGeo;
  const ease = (u) => u * u * (3 - 2 * u);
  const bell = (u) => Math.sin(PI * u);
  R.ease = ease;
  R.bell = bell;

  // Grundhaltung je Kampfstil
  function stance(m) {
    const A = m.arch;
    const s = { shL: [-0.25, 0.12], shR: [-0.3, -0.12], elL: -0.5, elR: -0.7, hipL: -0.12, hipR: 0.12, knL: 0.2, knR: 0.2, lean: 0.05, twist: 0, y: -0.02, head: 0 };
    if (A === "krieger") {
      s.shL = [-0.65, 0.25];
      s.elL = -1.0;
      s.shR = [-0.2, -0.2];
      s.elR = -0.9;
      s.hipL = -0.3;
      s.hipR = 0.2;
      s.knL = 0.35;
      s.knR = 0.25;
      s.twist = 0.12;
      s.y = -0.04;
    } else if (A === "schurke") {
      s.shL = [-0.55, 0.3];
      s.elL = -1.25;
      s.shR = [-0.5, -0.3];
      s.elR = -1.25;
      s.hipL = -0.45;
      s.hipR = 0.15;
      s.knL = 0.6;
      s.knR = 0.45;
      s.lean = 0.22;
      s.y = -0.1;
    } else if (A === "jaeger") {
      if (m.weaponBase === "bogen") {
        s.shL = [-0.35, 0.18];
        s.elL = -0.35;
        s.shR = [-0.15, -0.15];
        s.elR = -0.3;
      } else if (m.weaponBase === "armbrust") {
        s.shL = [-0.7, 0.35];
        s.elL = -0.8;
        s.shR = [-0.45, -0.1];
        s.elR = -1.0;
      } else {
        s.shR = [-0.35, -0.18];
        s.elR = -0.8;
        s.shL = [-0.45, 0.2];
        s.elL = -0.9;
      }
      s.hipL = -0.25;
      s.knL = 0.3;
    } else if (A === "magier") {
      s.shR = [-0.15, -0.18];
      s.elR = -0.75;
      s.shL = [-0.55, 0.3];
      s.elL = -1.0;
      s.knL = 0.1;
      s.knR = 0.1;
      s.hipL = -0.05;
      s.hipR = 0.05;
    }
    return s;
  }

  function poseHero(m, name, u) {
    const P = m.parts;
    const t = m.t;
    const s = stance(m);
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
    const A = m.arch;
    switch (name) {
      case "attack": {
        const up = u < 0.4 ? ease(u / 0.4) : 1 - ease((u - 0.4) / 0.6);
        const sw = u < 0.4 ? 0 : bell((u - 0.4) / 0.6);
        if (m.dual) {
          const k = u < 0.5 ? bell(u * 2) : 0;
          const k2 = u >= 0.5 ? bell((u - 0.5) * 2) : 0;
          shR = [-0.5 - 1.2 * k, -0.3 - 0.6 * k];
          elR = -1.25 + 1.0 * k;
          shL = [-0.55 - 1.2 * k2, 0.3 + 0.6 * k2];
          elL = -1.25 + 1.0 * k2;
          twist = 0.35 * k - 0.35 * k2;
          lean = 0.3;
        } else {
          shR = [-0.3 - 2.5 * up + 1.6 * sw, -0.15 - 0.3 * up];
          elR = -0.9 + 0.6 * up + 0.5 * sw;
          twist = s.twist - 0.4 * up + 0.5 * sw;
          lean = s.lean - 0.12 * up + 0.3 * sw;
          knL = s.knL + 0.25 * sw;
        }
        break;
      }
      case "cast": {
        const up = bell(u);
        shR = [-0.15 - 1.4 * up, -0.18];
        elR = -0.75 + 0.4 * up;
        shL = [-0.55 - 1.0 * up, 0.3 + 0.2 * up];
        elL = -1.0 + 0.8 * up;
        y += 0.06 * up;
        headX = -0.15 * up;
        lean = -0.08 * up;
        break;
      }
      case "shoot": {
        const raise = u < 0.25 ? ease(u / 0.25) : 1;
        const pull = u < 0.25 ? 0 : u < 0.7 ? ease((u - 0.25) / 0.45) : 1 - ease((u - 0.7) / 0.3);
        if (m.weaponBase === "bogen") {
          shL = [-1.55 * raise, 0.15];
          elL = -0.05;
          shR = [-1.55 * raise, -0.1 + 0.35 * pull];
          elR = -0.4 - 1.9 * pull;
          twist = 0.45 * raise;
        } else if (m.weaponBase === "speer") {
          shR = [-0.3 - 2.6 * pull + (u > 0.7 ? 2.2 * (u - 0.7) / 0.3 : 0), -0.2];
          elR = -0.5;
          lean = 0.2 * pull;
        } else {
          shL = [-1.3 * raise, 0.35];
          elL = -0.5;
          shR = [-1.3 * raise, -0.1];
          elR = -0.6;
          lean = -0.1 * pull;
        }
        break;
      }
      case "hit":
        lean = s.lean - 0.4 * bell(u);
        headX = -0.3 * bell(u);
        y += -0.04 * bell(u);
        break;
      case "block":
        shL = [-1.4 * bell(u) + s.shL[0] * (1 - bell(u)), 0.4];
        elL = -1.4;
        lean = s.lean - 0.1 * bell(u);
        knL = s.knL + 0.2 * bell(u);
        knR = s.knR + 0.2 * bell(u);
        y -= 0.06 * bell(u);
        break;
      case "evade":
        rootRZ = 0.35 * bell(u);
        y += 0.1 * bell(u);
        knL += 0.4 * bell(u);
        knR += 0.4 * bell(u);
        hipL -= 0.3 * bell(u);
        hipR -= 0.3 * bell(u);
        break;
      case "victory": {
        const j = Math.abs(Math.sin(u * PI * 2));
        rootY = 0.25 * j;
        shR = [-2.9, -0.25];
        elR = -0.2;
        shL = [-0.4, 0.5];
        elL = -0.6;
        headX = -0.25;
        break;
      }
      case "walk": {
        const sw = Math.sin(t * 9);
        hipL = -sw * 0.55;
        hipR = sw * 0.55;
        knL = 0.3 + Math.max(0, sw) * 0.7;
        knR = 0.3 + Math.max(0, -sw) * 0.7;
        if (A !== "krieger") {
          shL = [sw * 0.5 + s.shL[0] * 0.5, s.shL[1]];
          shR = [-sw * 0.5 + s.shR[0] * 0.5, s.shR[1]];
        }
        y = -0.03 + Math.abs(Math.cos(t * 9)) * 0.04;
        break;
      }
      case "defeat": {
        const e = ease(u);
        rootRX = -1.45 * e;
        rootY = -0.08 * e;
        knL = s.knL + 0.8 * e;
        knR = s.knR + 0.6 * e;
        hipL = -0.6 * e;
        shL = [-2.4 * e, 0.6];
        shR = [-2.2 * e, -0.6];
        elL = -0.3;
        elR = -0.3;
        break;
      }
      case "special": {
        const up = bell(u);
        const sp = u < 0.5 ? ease(u * 2) : 1;
        rootY = 0.45 * up;
        if (A === "magier") {
          shR = [-2.8 * up, -0.2];
          shL = [-2.8 * up, 0.2];
          elR = -0.2;
          elL = -0.2;
          headX = -0.3 * up;
        } else if (A === "jaeger" && m.weaponBase === "bogen") {
          shL = [-1.9 * up, 0.15];
          elL = 0;
          shR = [-1.9 * up, 0.2];
          elR = -2.0 * up;
          lean = -0.3 * up;
        } else {
          twist = PI * 2 * sp;
          shR = [-1.4 * up, -1.2 * up];
          elR = -0.3;
          shL = [-1.0 * up, 1.0 * up];
          elL = -0.4;
          knL = 0.6 * up + s.knL;
          knR = 0.6 * up + s.knR;
        }
        break;
      }
    }
    P.body.position.y = y + rootY;
    P.body.rotation.x = rootRX;
    P.body.rotation.z = rootRZ;
    P.torso.rotation.x = lean;
    P.torso.rotation.y = twist;
    if (P.armL) P.armL.rotation.set(shL[0], 0, shL[1]);
    if (P.armR) P.armR.rotation.set(shR[0], 0, shR[1]);
    if (P.elbowL) P.elbowL.rotation.x = elL;
    if (P.elbowR) P.elbowR.rotation.x = elR;
    if (P.head) P.head.rotation.x = headX - lean * 0.6;
    // Beine gleichen die Rumpfneigung aus, damit die Fuesse am Boden bleiben
    if (P.legL) P.legL.rotation.x = hipL;
    if (P.legR) P.legR.rotation.x = hipR;
    if (P.kneeL) P.kneeL.rotation.x = knL;
    if (P.kneeR) P.kneeR.rotation.x = knR;
    if (P.cape) {
      const arr = P.cape.geometry.attributes.position.array;
      const base = P.cape.userData.cape;
      for (let i = 0; i < arr.length; i += 3) {
        const yy = base[i + 1];
        const k = Math.max(0, -yy);
        arr[i + 2] = base[i + 2] - k * (0.18 + lean * 0.4) - Math.sin(t * 2.6 + yy * 4 + base[i] * 3) * 0.05 * k;
      }
      P.cape.geometry.attributes.position.needsUpdate = true;
    }
    if (P.tabard) P.tabard.rotation.x = -0.08 - Math.max(hipL, hipR) * -0.3 * 0 + Math.sin(t * 2.2) * 0.03 - Math.min(hipL, 0) * 0.4;
  }
})();
