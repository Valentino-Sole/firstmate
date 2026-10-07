/* Helden von Schwebfels - 3D-Schauplaetze: Heimatinsel des Reiches im Nebelmeer (Formen je Reich in r3d-realms.js), Heldenansicht, Heim, Kampfbuehne, Portraits.
   Mystische Stimmung: gedaempfte Farben, Nebel, Gluehwuermchen, Polarlicht bei Nacht, automatischer Tag-Nacht-Wechsel. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const R = (SB.R3D = SB.R3D || {});
  const PI = Math.PI;
  let T = null;
  let mesh, grp, G, M, pm, emis, glow, basic;

  function init() {
    T = R.T();
    mesh = R.mesh;
    grp = R.grp;
    G = R.geo;
    M = R.mat;
    pm = M.pmat;
    emis = M.emis;
    glow = M.glow;
    basic = M.basic;
  }

  function makeRenderer(el, opts) {
    opts = opts || {};
    const r = new T.WebGLRenderer({ antialias: true, alpha: !!opts.alpha, preserveDrawingBuffer: !!opts.preserve, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2));
    r.outputColorSpace = T.SRGBColorSpace;
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = opts.exposure || 1.15;
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
  /* Umgebungslicht fuer modellierte Figuren (Metall braucht eine Spiegelung): weicher Himmel, warmer Boden.
     Je Renderer einmal erzeugt, da Texturen nicht zwischen WebGL-Kontexten geteilt werden. */
  function envMap(r) {
    if (r.userData && r.userData.env) return r.userData.env;
    const sc = new T.Scene();
    const geo = new T.SphereGeometry(10, 32, 16);
    const cols = [];
    const p = geo.attributes.position;
    const top = new T.Color("#dfe8f4");
    const hor = new T.Color("#b8a88e");
    const bot = new T.Color("#2c241c");
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 10;
      const c = y > 0 ? hor.clone().lerp(top, Math.pow(y, 0.6)) : hor.clone().lerp(bot, Math.pow(-y, 0.5));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new T.Float32BufferAttribute(cols, 3));
    sc.add(new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    // zwei helle Flaechen als Lichtquellen in der Spiegelung
    const lm = new T.MeshBasicMaterial({ color: new T.Color(6, 5.6, 5) });
    const l1 = new T.Mesh(new T.PlaneGeometry(5, 3), lm);
    l1.position.set(4, 6, 5);
    l1.lookAt(0, 0, 0);
    sc.add(l1);
    const l2 = new T.Mesh(new T.PlaneGeometry(4, 2), new T.MeshBasicMaterial({ color: new T.Color(2, 2.4, 3.2) }));
    l2.position.set(-6, 3, -4);
    l2.lookAt(0, 0, 0);
    sc.add(l2);
    const pm = new T.PMREMGenerator(r);
    const env = pm.fromScene(sc, 0.02).texture;
    pm.dispose();
    geo.dispose();
    r.userData = r.userData || {};
    r.userData.env = env;
    return env;
  }
  R.envMap = envMap;
  function killRenderer(r) {
    try {
      r.dispose();
      r.forceContextLoss();
      if (r.domElement && r.domElement.parentNode) r.domElement.parentNode.removeChild(r.domElement);
    } catch (e) {
      /* bereits entsorgt */
    }
  }
  const col = (c) => new T.Color(c);
  const lerpC = (a, b, t) => col(a).lerp(col(b), Math.max(0, Math.min(1, t)));
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  /* ---------- Tageszeit (Rechnung liegt im Spielkern, damit Nachtinhalte auch ohne 3D funktionieren) ---------- */
  R.dayTime = (mode, now) => SB.engine.dayTime(mode, now);
  R.dayInfo = (t) => SB.engine.dayInfo(t);
  R.dayLabel = function (t) {
    const i = R.dayInfo(t);
    if (i.dusk > 0.45) return t < 0.5 ? "Morgengrauen" : "Abenddämmerung";
    return i.day > 0.5 ? "Tag" : "Nacht";
  };
  // Mystische Farbpalette je Tageszeit; jedes Reich bringt seinen eigenen Himmel mit
  const DEF_SKY = { dayTop: "#36557f", dayBot: "#8fa2ad", duskTop: "#2b2c5a", duskBot: "#c27556", nightTop: "#04060f", nightBot: "#141f38", fogDay: "#6e8290", fogNight: "#18223a", sunDay: "#ffe9c8", hemiGround: "#4a3e30" };
  function palette(info, sky) {
    sky = sky || DEF_SKY;
    const top = lerpC(sky.nightTop, sky.dayTop, info.day).lerp(col(sky.duskTop), info.dusk * 0.6);
    const bot = lerpC(sky.nightBot, sky.dayBot, info.day).lerp(col(sky.duskBot), info.dusk * 0.75);
    const fog = bot.clone().lerp(col(info.day > 0.5 ? sky.fogDay : sky.fogNight), 0.35);
    return {
      top,
      bot,
      fog,
      sun: lerpC("#8fa6ff", sky.sunDay, info.day).lerp(col("#ff9a62"), info.dusk * 0.7),
      sunI: 1.3 + 1.2 * info.day,
      hemiSky: lerpC("#6a7ac8", "#d8e2ee", info.day),
      hemiGround: lerpC("#2a2438", sky.hemiGround, info.day),
      hemiI: 1.0 + 0.3 * info.day,
    };
  }

  /* ---------- Gemeinsame Texturen ---------- */
  let dotTex = null;
  function dot() {
    if (dotTex) return dotTex;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.3, "rgba(255,255,255,0.5)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return (dotTex = new T.CanvasTexture(c));
  }
  let mistTex = null;
  function mist() {
    if (mistTex) return mistTex;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const r = R.rng(77);
    for (let i = 0; i < 70; i++) {
      const x = r() * 256;
      const y = r() * 256;
      const rad = 20 + r() * 60;
      for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        gr.addColorStop(0, "rgba(255,255,255,0.22)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, 256, 256);
      }
    }
    mistTex = new T.CanvasTexture(c);
    mistTex.wrapS = mistTex.wrapT = T.RepeatWrapping;
    return mistTex;
  }
  const TILED = {};
  function tiled(kind, color, rx, ry, o) {
    const k = kind + color + rx + "|" + ry;
    if (TILED[k]) return TILED[k];
    const t = R.paintTex(kind).clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rx, ry);
    const m = new T.MeshLambertMaterial(Object.assign({ map: t, color: col(color).multiplyScalar(1.12) }, o || {}));
    return (TILED[k] = m);
  }

  /* ---------- Himmel, Sterne, Mond, Polarlicht, Nebelmeer ---------- */
  function skyDome() {
    const geo = new T.SphereGeometry(260, 32, 20);
    const cols = new Float32Array(geo.attributes.position.count * 3);
    geo.setAttribute("color", new T.BufferAttribute(cols, 3));
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
    m.userData.recolor = (top, bot, under) => {
      const pos = geo.attributes.position;
      const a = geo.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 260;
        let c;
        if (y >= 0) c = bot.clone().lerp(top, Math.pow(Math.min(1, y / 0.75), 0.7));
        else c = bot.clone().lerp(under, Math.min(1, -y / 0.25));
        a.setXYZ(i, c.r, c.g, c.b);
      }
      a.needsUpdate = true;
    };
    m.renderOrder = -10;
    return m;
  }
  function starField(rng, n) {
    const geo = new T.BufferGeometry();
    const sp = [];
    for (let i = 0; i < n; i++) {
      const u = rng() * PI * 2;
      const v = Math.acos(1 - rng() * 0.95);
      sp.push(Math.cos(u) * Math.sin(v) * 230, Math.cos(v) * 230, Math.sin(u) * Math.sin(v) * 230);
    }
    geo.setAttribute("position", new T.Float32BufferAttribute(sp, 3));
    const mat = new T.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const p = new T.Points(geo, mat);
    p.renderOrder = -9;
    return p;
  }
  function moonSprite() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(235,240,255,1)");
    gr.addColorStop(0.42, "rgba(220,228,250,1)");
    gr.addColorStop(0.46, "rgba(160,180,255,0.35)");
    gr.addColorStop(1, "rgba(120,140,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "rgba(150,160,190,0.35)";
    for (const [x, y, r] of [[52, 54, 8], [74, 70, 6], [60, 78, 4], [78, 50, 5]]) {
      g.beginPath();
      g.arc(x, y, r, 0, PI * 2);
      g.fill();
    }
    const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, fog: false, depthWrite: false }));
    s.scale.setScalar(26);
    s.renderOrder = -8;
    return s;
  }
  function aurora() {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 128;
    const g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, "rgba(80,255,170,0)");
    gr.addColorStop(0.15, "rgba(80,255,170,0.9)");
    gr.addColorStop(0.55, "rgba(90,200,255,0.45)");
    gr.addColorStop(1, "rgba(170,110,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 128);
    const tex = new T.CanvasTexture(c);
    const group = grp();
    const bands = [];
    for (let k = 0; k < 3; k++) {
      const geo = new T.PlaneGeometry(1, 1, 80, 1);
      const pos = geo.attributes.position;
      const base = [];
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i) + 0.5;
        const top = pos.getY(i) > 0;
        const a = -1.5 + u * 3.0 + k * 0.4;
        const rr = 200 - k * 15;
        base.push([a, top, rr]);
      }
      const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false, opacity: 0 });
      const m = new T.Mesh(geo, mat);
      m.frustumCulled = false;
      m.renderOrder = -7;
      group.add(m);
      bands.push({ m, base, k });
    }
    group.userData.update = (t, op) => {
      for (const b of bands) {
        b.m.material.opacity = op * (0.7 - b.k * 0.15);
        if (op <= 0.01) continue;
        const pos = b.m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const [a, top, rr] = b.base[i];
          const wob = Math.sin(a * 5 + t * 0.4 + b.k) * 8 + Math.sin(a * 11 - t * 0.7) * 3;
          const y = 22 + b.k * 8 + Math.sin(a * 3 + t * 0.25) * 8 + (top ? 34 + Math.sin(a * 7 + t) * 8 : 0);
          pos.setXYZ(i, Math.sin(a) * (rr + wob), y, -Math.cos(a) * (rr + wob));
        }
        pos.needsUpdate = true;
      }
    };
    return group;
  }
  function cloudSea(y, size) {
    const t = mist().clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(6, 6);
    const mat = new T.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.9, depthWrite: false, color: 0xffffff });
    const m = new T.Mesh(new T.CircleGeometry(size, 48), mat);
    m.rotation.x = -PI / 2;
    m.position.y = y;
    m.userData.tex = t;
    return m;
  }
  function fireflies(rng, n, radius, yMin, yMax, color) {
    const geo = new T.BufferGeometry();
    const p = new Float32Array(n * 3);
    const base = [];
    for (let i = 0; i < n; i++) {
      const a = rng() * PI * 2;
      const r = Math.sqrt(rng()) * radius;
      base.push([Math.cos(a) * r, yMin + rng() * (yMax - yMin), Math.sin(a) * r, rng() * 10]);
    }
    geo.setAttribute("position", new T.BufferAttribute(p, 3));
    const mat = new T.PointsMaterial({ color: col(color || "#d9ff8a"), size: 0.32, map: dot(), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.8 });
    const pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    pts.userData.update = (t, op) => {
      mat.opacity = op;
      for (let i = 0; i < n; i++) {
        const b = base[i];
        p[i * 3] = b[0] + Math.sin(t * 0.5 + b[3]) * 0.8;
        p[i * 3 + 1] = b[1] + Math.sin(t * 0.9 + b[3] * 2) * 0.3;
        p[i * 3 + 2] = b[2] + Math.cos(t * 0.4 + b[3]) * 0.8;
      }
      geo.attributes.position.needsUpdate = true;
    };
    return pts;
  }
  function mistWisps(rng, n, radius, y) {
    const group = grp();
    const list = [];
    for (let i = 0; i < n; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: dot(), color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }));
      const a = rng() * PI * 2;
      const r = radius * (0.6 + rng() * 0.5);
      s.scale.set(7 + rng() * 6, 2 + rng() * 1.5, 1);
      group.add(s);
      list.push({ s, a, r, y: y + rng() * 1.2, sp: (rng() - 0.5) * 0.04 });
    }
    group.userData.update = (dt, color, op) => {
      for (const w of list) {
        w.a += w.sp * dt;
        w.s.position.set(Math.cos(w.a) * w.r, w.y, Math.sin(w.a) * w.r);
        w.s.material.color.copy(color);
        w.s.material.opacity = op;
      }
    };
    return group;
  }

  /* ---------- Gelaende ---------- */
  function noise2(x, z, s) {
    return Math.sin(x * 0.37 + s) * Math.cos(z * 0.41 - s) * 0.5 + Math.sin(x * 0.11 + z * 0.13 + s * 2) * 0.5 + Math.sin(x * 1.3 - z * 0.9) * 0.15;
  }
  // Schwebende Insel: huegelige Grasflaeche mit Wegen, Felskante, zerkluftete Unterseite mit Wurzeln
  function island(radius, depth, rng, o) {
    o = o || {};
    const isl = grp();
    const seed = rng() * 10;
    const paths = o.paths || [];
    const top = new T.RingGeometry(0.001, radius, 72, 28);
    top.rotateX(-PI / 2);
    const pos = top.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const g1 = col(o.grass || "#3f5a3c");
    const g2 = col(o.grass2 || "#5a6a3e");
    const dirt = col(o.dirt || "#6a5a44");
    const distSeg = (px, pz, ax, az, bx, bz) => {
      const vx = bx - ax;
      const vz = bz - az;
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)));
      return Math.hypot(px - ax - vx * t, pz - az - vz * t);
    };
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const rr = Math.hypot(x, z);
      const k = 1 + 0.05 * Math.sin(3 * a + seed) + 0.03 * Math.sin(7 * a + seed * 2);
      x *= k;
      z *= k;
      const edge = rr / radius;
      let flat = 1;
      let pathD = 99;
      for (const p of paths) pathD = Math.min(pathD, p.r ? Math.abs(Math.hypot(x - p.x, z - p.z) - 0) - p.r : distSeg(x, z, p[0], p[1], p[2], p[3]) - 0.5);
      if (o.plaza) pathD = Math.min(pathD, Math.hypot(x - o.plaza[0], z - o.plaza[1]) - o.plaza[2]);
      flat = smooth(0, 2.5, pathD);
      const hill = (noise2(x, z, seed) * 0.35 + 0.1) * flat * (1 - smooth(0.85, 1, edge)) * (o.hills || 1);
      pos.setXYZ(i, x, hill, z);
      const n = (noise2(x * 3, z * 3, seed * 3) + 1) / 2;
      const c = g1.clone().lerp(g2, n);
      c.lerp(dirt, 1 - smooth(-0.2, 0.6, pathD));
      c.multiplyScalar(0.85 + 0.15 * (1 - edge * 0.5));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    top.setAttribute("color", new T.BufferAttribute(colors, 3));
    top.computeVertexNormals();
    const tm = new T.Mesh(top, new T.MeshLambertMaterial({ vertexColors: true }));
    tm.receiveShadow = true;
    isl.add(tm);
    // Felskante
    const cliffG = new T.CylinderGeometry(radius * 1.02, radius * 0.94, 2.2, 72, 4, true);
    const cp = cliffG.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i);
      const z = cp.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.05 * Math.sin(3 * a + seed) + 0.03 * Math.sin(7 * a + seed * 2) + (rng() - 0.5) * 0.03;
      cp.setX(i, x * k);
      cp.setZ(i, z * k);
    }
    cliffG.computeVertexNormals();
    const cliff = new T.Mesh(cliffG, tiled("stone", o.rock || "#5a5650", 10, 1, { side: T.DoubleSide }));
    cliff.position.y = -1.1;
    isl.add(cliff);
    const under = new T.ConeGeometry(radius * 0.95, depth, 40, 8);
    const up = under.attributes.position;
    for (let i = 0; i < up.count; i++) {
      const y = up.getY(i);
      const f = 1 + (rng() - 0.5) * 0.3 * (1 - Math.abs(y / depth));
      up.setX(i, up.getX(i) * f);
      up.setZ(i, up.getZ(i) * f);
    }
    under.computeVertexNormals();
    const um = new T.Mesh(under, tiled("stone", R.shade(o.rock || "#5a5650", 0.7), 6, 3, { flatShading: true }));
    um.rotation.x = PI;
    um.position.y = -2.2 - depth / 2;
    isl.add(um);
    // Wurzeln und Ranken haengen herab
    const rootM = pm("bark", "#3a2e24");
    for (let i = 0; i < (o.roots || 14); i++) {
      const a = rng() * PI * 2;
      const r0 = radius * (0.9 + rng() * 0.08);
      const len = 1.5 + rng() * 3.5;
      const pts = [[0, 0, 0], [(rng() - 0.5) * 0.4, -len * 0.4, (rng() - 0.5) * 0.4], [(rng() - 0.5) * 0.8, -len, (rng() - 0.5) * 0.6]];
      const root = mesh(G.tube("root" + i + "|" + len.toFixed(1), pts, 0.06 + rng() * 0.05, 10, 5), rootM, { p: [Math.cos(a) * r0, -1.6, Math.sin(a) * r0] });
      isl.add(root);
      if (i % 3 === 0) isl.add(mesh(G.sph(0.08, 6, 6), emis(o.vineGlow || "#7fffc8", 1.2), { p: [Math.cos(a) * r0 + pts[2][0], -1.6 - len, Math.sin(a) * r0 + pts[2][2]] }));
    }
    for (let i = 0; i < 10; i++) {
      const a = rng() * PI * 2;
      const r0 = radius * 0.6 * rng();
      isl.add(mesh(G.cone(0.4 + rng() * 0.5, 2 + rng() * 3, 6), um.material, { p: [Math.cos(a) * r0, -2.2 - depth * (0.3 + rng() * 0.5), Math.sin(a) * r0], r: [PI, 0, 0] }));
    }
    isl.userData.top = tm;
    return isl;
  }
  // Hoehe der Insel an einer Stelle (fuer das Aufstellen von Dingen)
  function heightAt(isl, x, z) {
    const geo = isl.userData.top.geometry;
    const pos = geo.attributes.position;
    let best = 0;
    let bd = 1e9;
    for (let i = 0; i < pos.count; i += 3) {
      const d = (pos.getX(i) - x) ** 2 + (pos.getZ(i) - z) ** 2;
      if (d < bd) {
        bd = d;
        best = pos.getY(i);
      }
    }
    return best;
  }

  /* ---------- Pflanzen und Kleinkram ---------- */
  function gnarledTree(rng, o) {
    o = o || {};
    const t = grp();
    const bark = pm("bark", o.bark || "#4a3a2e");
    const h = 2.2 + rng() * 1.4;
    const pts = [[0, 0, 0], [(rng() - 0.5) * 0.4, h * 0.35, (rng() - 0.5) * 0.4], [(rng() - 0.5) * 0.7, h * 0.7, (rng() - 0.5) * 0.5], [(rng() - 0.5) * 0.6, h, (rng() - 0.5) * 0.4]];
    t.add(mesh(G.tube("tr" + h.toFixed(2) + pts[1][0].toFixed(2), pts, 0.17, 12, 7), bark));
    t.add(mesh(G.cone(0.32, 0.5, 7), bark, { p: [0, 0.2, 0] }));
    const leafC = o.leaf || ["#2c4436", "#33503c", "#28403a", "#3b4a2e"][Math.floor(rng() * 4)];
    const leafM = pm("plain", leafC, { flat: true });
    const top = pts[3];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2 + rng();
      const r = i === 0 ? 0 : 0.6 + rng() * 0.3;
      t.add(mesh(G.ico(0.75 + rng() * 0.35, 1), leafM, { p: [top[0] + Math.cos(a) * r, top[1] + (i === 0 ? 0.35 : -0.1 + rng() * 0.3), top[2] + Math.sin(a) * r], s: [1, 0.75, 1] }));
    }
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      t.add(mesh(G.tube("br" + i, [[0, 0, 0], [0.35 * s, 0.25, 0.05], [0.7 * s, 0.35, 0.1]], 0.06, 6, 5), bark, { p: [pts[2][0], pts[2][1] - 0.2, pts[2][2]] }));
    }
    if (o.moss !== false && rng() < 0.5)
      for (let i = 0; i < 3; i++) t.add(mesh(G.cone(0.04, 0.5 + rng() * 0.4, 4), pm("fur", "#5f7a4a"), { p: [top[0] + (rng() - 0.5) * 1.2, top[1] - 0.6, top[2] + (rng() - 0.5) * 1.2], r: [PI, 0, 0] }));
    t.scale.setScalar(0.85 + rng() * 0.4);
    return t;
  }
  function pine(rng) {
    const t = grp();
    t.add(mesh(G.cyl(0.1, 0.16, 1.0, 6), pm("bark", "#3a2e24"), { p: [0, 0.5, 0] }));
    const m = pm("plain", ["#1f3530", "#243a2f", "#2a3f36"][Math.floor(rng() * 3)], { flat: true });
    for (let i = 0; i < 4; i++) t.add(mesh(G.cone(1.0 - i * 0.2, 1.2, 7), m, { p: [0, 1.1 + i * 0.6, 0], r: [0, rng(), 0] }));
    t.scale.setScalar(0.9 + rng() * 0.6);
    return t;
  }
  function deadTree(rng) {
    const t = grp();
    const bark = pm("bark", "#5a5048");
    t.add(mesh(G.tube("dead", [[0, 0, 0], [0.1, 1, 0], [-0.1, 2, 0.1], [0.2, 2.8, 0]], 0.12, 10, 6), bark));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + rng();
      t.add(mesh(G.tube("dbr", [[0, 0, 0], [0.4, 0.3, 0], [0.7, 0.7, 0.1]], 0.04, 6, 4), bark, { p: [0, 1.4 + i * 0.35, 0], r: [0, a, 0] }));
    }
    return t;
  }
  function shrooms(rng, color) {
    const g = grp();
    const c = color || ["#6fe3ff", "#b48cff", "#7fffb0"][Math.floor(rng() * 3)];
    for (let i = 0; i < 4; i++) {
      const s = grp([(rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.6]);
      const h = 0.15 + rng() * 0.25;
      s.add(mesh(G.cyl(0.025, 0.035, h, 6), pm("plain", "#d9d2c0"), { p: [0, h / 2, 0] }));
      s.add(mesh(G.cap(0.1 + rng() * 0.06, PI * 0.5), emis(c, 0.9), { p: [0, h, 0], s: [1, 0.6, 1] }));
      g.add(s);
    }
    g.add(R.haloSprite(c, 0.9, 0.35, [0, 0.3, 0]));
    return g;
  }
  function crystals(rng, color) {
    const g = grp();
    const m = emis(color || "#8fd8ff", 0.7);
    for (let i = 0; i < 5; i++) g.add(mesh(G.octa(0.15 + rng() * 0.15), m, { p: [(rng() - 0.5) * 0.5, 0.15, (rng() - 0.5) * 0.5], s: [0.6, 1.8 + rng(), 0.6], r: [(rng() - 0.5) * 0.6, rng(), (rng() - 0.5) * 0.6] }));
    g.add(R.haloSprite(color || "#8fd8ff", 1.4, 0.4, [0, 0.4, 0]));
    return g;
  }
  function rock(rng, color) {
    return mesh(G.dodeca(0.3 + rng() * 0.35), pm("stone", color || "#6a6660", { flat: true }), { r: [rng(), rng(), rng()], s: [1, 0.6 + rng() * 0.4, 1] });
  }
  function standingStone(rng, h, runeC) {
    const g = grp();
    const st = pm("stone", "#6e6b66", { flat: true });
    g.add(mesh(G.box(0.7, h, 0.45), st, { p: [0, h / 2 - 0.1, 0], r: [(rng() - 0.5) * 0.08, rng() * 0.3, (rng() - 0.5) * 0.08] }));
    g.add(mesh(G.dodeca(0.38), st, { p: [0, h - 0.1, 0], s: [0.95, 0.5, 0.6] }));
    if (runeC) {
      const rm = emis(runeC, 1);
      for (let i = 0; i < 3; i++) g.add(mesh(G.box(0.08, 0.22, 0.02), rm, { p: [0, h * 0.35 + i * 0.32, 0.235], r: [0, 0, (i % 2 ? 0.4 : -0.3)] }));
      g.userData.rune = rm;
    }
    return g;
  }
  function lantern(night) {
    const g = grp();
    const iron = pm("metal", "#2a2a30");
    g.add(mesh(G.cyl(0.05, 0.07, 2.0, 6), iron, { p: [0, 1.0, 0] }));
    g.add(mesh(G.box(0.5, 0.05, 0.05), iron, { p: [0.2, 1.95, 0] }));
    const cage = grp([0.4, 1.7, 0]);
    cage.add(mesh(G.cyl(0.13, 0.1, 0.3, 6, true), pm("metal", "#2a2a30", { ds: true })));
    cage.add(mesh(G.cone(0.16, 0.14, 6), iron, { p: [0, 0.2, 0] }));
    cage.add(mesh(G.sph(0.08, 8, 6), night.flame));
    const halo = R.haloSprite("#ffb35a", 1.4, 0.7);
    cage.add(halo);
    night.halos.push(halo);
    g.add(cage);
    return g;
  }
  // Gemeinsames Nachtlicht-Material fuer Fenster und Flammen
  function nightMats() {
    const win = new T.MeshLambertMaterial({ color: col("#2a1e14"), emissive: col("#ffa64a"), emissiveIntensity: 0.6 });
    const flame = new T.MeshBasicMaterial({ color: col("#ffcf7a") });
    return { win, flame, halos: [] };
  }

  /* ---------- Dachformen ---------- */
  let prismGeo = null;
  function gableRoof(w, d, h, mat) {
    if (!prismGeo) {
      prismGeo = new T.CylinderGeometry(1, 1, 1, 3, 1);
      prismGeo.rotateZ(-PI / 2);
      prismGeo.rotateX(-PI / 2);
    }
    const sy = h / 1.5;
    const m = mesh(prismGeo, mat, { p: [0, 0.5 * sy, 0], s: [w, sy, d / 1.732] });
    m.userData.roof = "gable";
    return m;
  }
  function roofCone(m) {
    m.userData.roof = "cone";
    return m;
  }
  function fire(night, size) {
    const g = grp();
    const fm = new T.MeshBasicMaterial({ color: col("#ff8a2a"), transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const f = mesh(G.cone(0.18 * size, 0.6 * size, 6), fm, { p: [(i - 1) * 0.08 * size, 0.25 * size, (i % 2) * 0.06 * size] });
      f.userData.flick = i + 1;
      g.add(f);
    }
    g.add(mesh(G.cone(0.1 * size, 0.4 * size, 6), new T.MeshBasicMaterial({ color: col("#ffe9a0") }), { p: [0, 0.18 * size, 0] }));
    const h = R.haloSprite("#ff9a3d", 2.2 * size, 0.7, [0, 0.35 * size, 0]);
    g.add(h);
    night.halos.push(h);
    g.userData.fire = true;
    return g;
  }

  /* ---------- Grundformen der Gebaeude (Albion; andere Reiche in r3d-realms.js) ---------- */
  const B = {};
  const mats = () => ({
    plaster: pm("plain", "#a89c84"),
    beam: pm("wood", "#33261c"),
    wood: pm("wood", "#5a4130"),
    stone: pm("stone", "#76726b"),
    dstone: pm("stone", "#4c4a52"),
    slate: pm("stone", "#323a48", { flat: true }),
    thatch: pm("fur", "#6e5f42"),
    iron: pm("metal", "#3a3a42"),
    gold: pm("metal", "#c9a441", { sh: 70 }),
  });
  B.taverne = function (rng, N) {
    const m = mats();
    const b = grp();
    b.add(mesh(G.box(3.6, 0.9, 3.0), m.stone, { p: [0, 0.45, 0] }));
    const up = grp([0, 0.9, 0], [0, 0, 0.025]);
    b.add(up);
    up.add(mesh(G.box(3.8, 2.4, 3.2), m.plaster, { p: [0, 1.2, 0] }));
    for (const x of [-1.85, -0.6, 0.6, 1.85]) up.add(mesh(G.box(0.16, 2.4, 0.16), m.beam, { p: [x, 1.2, 1.62] }));
    for (const y of [0.05, 1.2, 2.35]) up.add(mesh(G.box(3.9, 0.16, 0.16), m.beam, { p: [0, y, 1.63] }));
    for (const s of [-1, 1]) up.add(mesh(G.box(0.12, 1.4, 0.12), m.beam, { p: [s * 1.2, 0.6, 1.64], r: [0, 0, s * 0.7] }));
    const roof = gableRoof(4.3, 3.9, 2.0, m.slate);
    roof.position.set(0, 2.4, 0);
    up.add(roof);
    up.add(mesh(G.box(0.6, 1.6, 0.6), m.stone, { p: [1.2, 3.6, -0.6] }));
    for (const x of [-1.2, 1.2]) up.add(mesh(G.box(0.6, 0.55, 0.08), N.win, { p: [x, 1.7, 1.62] }));
    up.add(mesh(G.box(0.6, 0.5, 0.08), N.win, { p: [0, 3.0, 1.15] }));
    b.add(mesh(G.box(0.9, 1.5, 0.1), m.wood, { p: [0, 0.75, 1.52] }));
    b.add(mesh(G.box(0.5, 0.4, 0.08), N.win, { p: [-1.2, 0.5, 1.52] }));
    // Schild mit Kraehe
    const sign = grp([2.1, 2.5, 1.4]);
    sign.add(mesh(G.box(1.0, 0.07, 0.07), m.iron, { p: [-0.35, 0.3, 0] }));
    const board = grp([0, 0, 0]);
    board.add(mesh(G.box(0.6, 0.5, 0.06), m.wood, { p: [0, 0, 0] }));
    board.add(mesh(G.sph(0.11, 8, 6), basic("#121016"), { p: [0, 0.02, 0.05], s: [1.3, 0.8, 0.4] }));
    board.add(mesh(G.cone(0.05, 0.12, 4), basic("#121016"), { p: [0.15, 0.04, 0.05], r: [0, 0, -1.6] }));
    sign.add(board);
    b.add(sign);
    b.userData.swing = board;
    for (let i = 0; i < 3; i++) b.add(mesh(G.cyl(0.28, 0.3, 0.6, 10), m.wood, { p: [-2.3, 0.3, 0.9 - i * 0.65] }));
    b.add(lantern(N).translateX(1.7).translateZ(1.9));
    b.userData.smoke = [1.2, 4.6, -0.6];
    return b;
  };
  B.steinkreis = function (rng, N) {
    const b = grp();
    const runeColors = ["#e8c35a", "#9fd8ff", "#7fffb0"];
    const stones = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2;
      const s = standingStone(rng, 2.1 + rng() * 0.7, runeColors[i % 3]);
      s.position.set(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2);
      s.rotation.y = -a + PI / 2;
      b.add(s);
      stones.push(s);
    }
    // Deckstein ueber zwei Steinen
    b.add(mesh(G.box(2.0, 0.35, 0.5), pm("stone", "#6e6b66", { flat: true }), { p: [Math.cos(0.45) * 2.2, 2.5, Math.sin(0.45) * 2.2], r: [0, -0.45 + PI / 2, 0] }));
    b.add(mesh(G.cyl(0.7, 0.85, 0.5, 8), pm("stone", "#5a5752", { flat: true }), { p: [0, 0.25, 0] }));
    const orb = mesh(G.sph(0.28, 16, 12), emis("#cfe3ff", 1.1), { p: [0, 1.4, 0] });
    b.add(orb);
    b.add(R.haloSprite("#bfd8ff", 2.4, 0.6, [0, 1.4, 0]));
    const ring = mesh(G.torus(2.6, 0.03, PI * 2, 4, 64), glow("#bfd8ff", 0.5), { p: [0, 0.06, 0], r: [PI / 2, 0, 0] });
    b.add(ring);
    b.userData.orb = orb;
    b.userData.stones = stones;
    return b;
  };
  B.schmiede = function (rng, N) {
    const m = mats();
    const b = grp();
    b.add(mesh(G.box(3.2, 2.0, 2.4), m.stone, { p: [0, 1.0, -0.4] }));
    const roof = mesh(G.box(3.8, 0.2, 3.6), m.wood, { p: [0, 2.3, 0.2], r: [0.25, 0, 0] });
    b.add(roof);
    for (const x of [-1.7, 1.7]) b.add(mesh(G.cyl(0.12, 0.14, 2.2, 8), m.beam, { p: [x, 1.1, 1.75] }));
    b.add(mesh(G.cyl(0.45, 0.6, 4.4, 6), m.dstone, { p: [-1.1, 2.2, -1.1] }));
    const forge = mesh(G.box(1.2, 0.6, 0.3), emis("#ff6a1a", 1.4), { p: [0.4, 0.7, 0.85] });
    b.add(forge);
    b.add(R.haloSprite("#ff7a2a", 2.6, 0.8, [0.4, 0.9, 1.1]));
    const anvil = grp([0.7, 0, 1.9]);
    anvil.add(mesh(G.box(0.3, 0.4, 0.3), m.iron, { p: [0, 0.2, 0] }));
    anvil.add(mesh(G.box(0.75, 0.2, 0.32), pm("metal", "#4a4f58"), { p: [0, 0.5, 0] }));
    anvil.add(mesh(G.cone(0.1, 0.32, 4), pm("metal", "#4a4f58"), { p: [0.5, 0.5, 0], r: [0, 0, -PI / 2] }));
    b.add(anvil);
    // Waffenstaender
    const rack = grp([-1.4, 0, 1.5]);
    rack.add(mesh(G.box(1.0, 0.08, 0.1), m.wood, { p: [0, 1.1, 0] }));
    for (const [i, base] of [[0, "schwert"], [1, "axt"], [2, "hammer"]]) {
      const w = R.buildWeapon({ base, rarity: "gewoehnlich", style: 0 }, "albion");
      w.position.set(-0.35 + i * 0.35, 0.05, 0.05);
      w.scale.setScalar(0.8);
      rack.add(w);
    }
    b.add(rack);
    b.userData.smoke = [-1.1, 4.6, -1.1];
    b.userData.sparks = [0.7, 0.6, 1.9];
    return b;
  };
  B.arkanum = function (rng, N) {
    const m = mats();
    const b = grp();
    b.add(mesh(G.cyl(1.1, 1.35, 4.6, 10), pm("stone", "#5e5868", { flat: true }), { p: [0, 2.3, 0], r: [0, 0, 0.04] }));
    b.add(mesh(G.cyl(1.25, 1.1, 0.6, 10), pm("stone", "#4a4552", { flat: true }), { p: [0.1, 4.8, 0] }));
    const roofM = pm("stone", "#3a2f5a", { flat: true });
    b.add(roofCone(mesh(G.cone(1.7, 2.2, 10), roofM, { p: [0.15, 6.2, 0] })));
    b.add(mesh(G.cone(0.6, 1.2, 8), roofM, { p: [0.45, 7.6, -0.1], r: [-0.3, 0, 0.45] }));
    for (let i = 0; i < 4; i++) {
      const a = -0.8 + i * 0.55;
      b.add(mesh(G.box(0.35, 0.6, 0.1), N.win, { p: [Math.sin(a) * 1.2, 1.4 + i * 0.9, Math.cos(a) * 1.2], r: [0, a, 0] }));
    }
    b.add(mesh(G.box(0.8, 1.3, 0.1), m.wood, { p: [0, 0.65, 1.32] }));
    const crystal = mesh(G.octa(0.38), emis("#b48cff", 1.1), { p: [0.6, 8.6, 0], s: [1, 1.6, 1] });
    b.add(crystal);
    b.add(R.haloSprite("#b48cff", 2.4, 0.7, [0.6, 8.6, 0]));
    const books = grp([0, 3.0, 0]);
    for (let i = 0; i < 4; i++) {
      const bk = mesh(G.box(0.3, 0.07, 0.22), pm("leather", ["#6a2a3a", "#2a4a6a", "#4a6a2a", "#6a5a2a"][i]), { p: [Math.cos((i / 4) * PI * 2) * 1.8, Math.sin(i) * 0.4, Math.sin((i / 4) * PI * 2) * 1.8] });
      books.add(bk);
    }
    b.add(books);
    b.userData.float = crystal;
    b.userData.orbit = books;
    return b;
  };
  B.arena = function (rng, N) {
    const m = mats();
    const b = grp();
    const wall = new T.CylinderGeometry(3.3, 3.5, 1.6, 24, 1, true);
    b.add(mesh(wall, tiled("stone", "#7a746a", 6, 1, { side: T.DoubleSide, flatShading: true }), { p: [0, 0.8, 0] }));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      b.add(mesh(G.box(0.5, 0.5, 0.5), pm("stone", "#6a645a", { flat: true }), { p: [Math.cos(a) * 3.4, 1.8, Math.sin(a) * 3.4], r: [0, -a, 0] }));
    }
    b.add(mesh(G.cyl(3.2, 3.2, 0.08, 24), pm("plain", "#8a7a5a"), { p: [0, 0.04, 0] }));
    const flags = [];
    const realms = ["albion", "midgard", "hibernia"];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2 + 0.5;
      const p = grp([Math.cos(a) * 3.5, 0, Math.sin(a) * 3.5]);
      p.add(mesh(G.cyl(0.06, 0.07, 4.0, 6), m.iron, { p: [0, 2.0, 0] }));
      const RM = SB.data.REALMS[realms[i]];
      const banner = new T.Mesh(G.geo("banner", () => new T.PlaneGeometry(0.9, 1.6, 1, 6)), R.crestMat(realms[i], RM.color, RM.trim));
      banner.position.set(0.5, 3.0, 0);
      banner.castShadow = true;
      p.add(banner);
      flags.push(banner);
      p.rotation.y = -a;
      b.add(p);
    }
    for (let i = 0; i < 2; i++) {
      const a = i * PI + 1.2;
      const br = grp([Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6]);
      br.add(mesh(G.cyl(0.08, 0.1, 1.2, 6), m.iron, { p: [0, 0.6, 0] }));
      br.add(mesh(G.cyl(0.35, 0.18, 0.3, 8), m.iron, { p: [0, 1.3, 0] }));
      const f = fire(N, 1);
      f.position.y = 1.4;
      br.add(f);
      b.add(br);
    }
    b.userData.flags = flags;
    return b;
  };
  B.leuchtturm = function (rng, N) {
    const m = mats();
    const b = grp();
    b.add(mesh(G.cyl(0.9, 1.2, 5.5, 8), pm("stone", "#6a665e", { flat: true }), { p: [0, 2.75, 0] }));
    for (let i = 0; i < 3; i++) b.add(mesh(G.box(0.2, 0.45, 0.1), N.win, { p: [0, 1.5 + i * 1.4, 1.02 - i * 0.07] }));
    b.add(mesh(G.cyl(1.4, 1.1, 0.4, 8), m.wood, { p: [0, 5.7, 0] }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      b.add(mesh(G.box(0.12, 0.8, 0.12), m.beam, { p: [Math.cos(a) * 1.3, 6.3, Math.sin(a) * 1.3] }));
    }
    b.add(roofCone(mesh(G.cone(1.7, 1.4, 8), m.slate, { p: [0, 7.4, 0] })));
    b.add(mesh(G.cyl(0.5, 0.35, 0.3, 8), m.iron, { p: [0, 6.05, 0] }));
    const f = fire(N, 1.6);
    f.position.set(0, 6.2, 0);
    b.add(f);
    const beam = new T.Mesh(new T.ConeGeometry(1.8, 12, 16, 1, true), new T.MeshBasicMaterial({ color: col("#ffd9a0"), transparent: true, opacity: 0.1, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    beam.rotation.z = PI / 2;
    beam.position.set(6, 0, 0);
    const pivot = grp([0, 6.4, 0]);
    pivot.add(beam);
    b.add(pivot);
    b.userData.beam = pivot;
    b.add(mesh(G.box(0.7, 1.2, 0.1), m.wood, { p: [0, 0.6, 1.18] }));
    return b;
  };
  B.tiefen = function (rng, N) {
    const b = grp();
    const st = pm("stone", "#3e3a48", { flat: true });
    for (const x of [-1.5, 1.5]) {
      b.add(mesh(G.box(0.9, 3.6, 0.9), st, { p: [x, 1.8, 0], r: [0, 0, x * -0.02] }));
      b.add(mesh(G.cone(0.6, 0.9, 4), st, { p: [x, 4.0, 0], r: [0, PI / 4, 0] }));
    }
    b.add(mesh(G.torus(1.5, 0.42, PI, 6, 14), st, { p: [0, 3.4, 0] }));
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const cx = cv.getContext("2d");
    const grd = cx.createRadialGradient(64, 64, 2, 64, 64, 64);
    grd.addColorStop(0, "#ffffff");
    grd.addColorStop(0.25, "#c47bff");
    grd.addColorStop(0.7, "#3a1a66");
    grd.addColorStop(1, "#0a0614");
    cx.fillStyle = grd;
    cx.fillRect(0, 0, 128, 128);
    cx.strokeStyle = "rgba(255,255,255,0.5)";
    cx.lineWidth = 4;
    for (let k = 0; k < 3; k++) {
      cx.beginPath();
      for (let i = 0; i < 80; i++) {
        const a = i * 0.18 + (k * PI * 2) / 3;
        const r = i * 0.75;
        const x = 64 + Math.cos(a) * r;
        const y = 64 + Math.sin(a) * r;
        i ? cx.lineTo(x, y) : cx.moveTo(x, y);
      }
      cx.stroke();
    }
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    const portal = new T.Mesh(new T.CircleGeometry(1.1, 32), new T.MeshBasicMaterial({ map: tex }));
    portal.position.set(0, 2.2, 0.05);
    portal.scale.set(0.95, 1.4, 1);
    b.add(portal);
    b.add(R.haloSprite("#a070ff", 4, 0.5, [0, 2.2, 0.4]));
    b.userData.portal = portal;
    const runes = [];
    for (let i = 0; i < 4; i++) {
      const r = grp();
      r.add(mesh(G.box(0.3, 0.42, 0.12), pm("stone", "#4a4558", { flat: true })));
      r.add(mesh(G.box(0.12, 0.22, 0.02), emis("#c47bff", 1.2), { p: [0, 0, 0.07] }));
      b.add(r);
      runes.push(r);
    }
    b.userData.runes = runes;
    for (let i = 0; i < 3; i++) b.add(mesh(G.box(2.4 - i * 0.3, 0.15, 0.5), st, { p: [0, 0.07 + i * 0.15, 1.2 - i * 0.4] }));
    for (const x of [-1.5, 1.5]) b.add(mesh(G.tube("chain" + x, [[0, 0, 0], [x * -0.2, -0.6, 0.2], [x * -0.5, -1.0, 0.25]], 0.035, 10, 4), pm("metal", "#2a2a30"), { p: [x, 3.2, 0.46] }));
    return b;
  };
  function griffin() {
    const g = grp();
    const fur = pm("fur", "#a08a62");
    const feath = pm("fur", "#e8e0d0");
    g.add(mesh(G.capsule(0.35, 0.8, 10), fur, { p: [0, 0.7, -0.1], r: [PI / 2, 0, 0] }));
    g.add(mesh(G.sph(0.36, 12, 10), feath, { p: [0, 1.0, 0.45] }));
    const head = grp([0, 1.45, 0.65]);
    head.add(mesh(G.sph(0.22, 12, 10), feath));
    head.add(mesh(G.cone(0.09, 0.3, 6), pm("bone", "#d9a441"), { p: [0, -0.05, 0.25], r: [1.9, 0, 0] }));
    for (const s of [-1, 1]) head.add(mesh(G.sph(0.03, 6, 6), emis("#ffcf5a", 1), { p: [s * 0.1, 0.05, 0.17] }));
    for (const s of [-1, 1]) head.add(mesh(G.cone(0.04, 0.2, 4), feath, { p: [s * 0.1, 0.22, -0.1], r: [-0.8, 0, -s * 0.3] }));
    g.add(head);
    for (const s of [-1, 1]) {
      const w = grp([s * 0.3, 1.05, 0.1], [0.3, 0, -s * 0.9]);
      w.add(mesh(G.box(0.12, 1.1, 0.5), feath, { p: [0, 0.5, -0.1], r: [0.3, 0, 0] }));
      g.add(w);
      for (const z of [0.35, -0.5]) g.add(mesh(G.capsule(0.08, 0.4, 6), fur, { p: [s * 0.22, 0.3, z] }));
    }
    g.add(mesh(G.tube("gtail", [[0, 0, 0], [0, -0.2, -0.3], [0, 0.1, -0.6]], 0.04, 8, 4), fur, { p: [0, 0.7, -0.6] }));
    g.userData.head = head;
    return g;
  }
  B.stall = function (rng, N) {
    const m = mats();
    const b = grp();
    b.add(mesh(G.box(3.4, 1.9, 2.4), m.wood, { p: [0, 0.95, -0.3] }));
    for (const x of [-1.7, 1.7]) b.add(mesh(G.box(0.18, 1.9, 0.18), m.beam, { p: [x, 0.95, 0.9] }));
    const roof = gableRoof(3.9, 3.0, 1.4, m.thatch);
    roof.position.set(0, 1.9, -0.3);
    b.add(roof);
    b.add(mesh(G.box(1.3, 1.4, 0.1), pm("wood", "#2a1e16"), { p: [0, 0.7, 0.92] }));
    for (const s of [-1, 1]) b.add(mesh(G.box(0.1, 1.7, 0.05), m.beam, { p: [0, 0.7, 0.98], r: [0, 0, s * 0.72] }));
    for (let i = 0; i < 5; i++) b.add(mesh(G.box(0.1, 0.7, 0.1), m.beam, { p: [-1.6 + i * 0.5, 0.35, 2.0] }));
    b.add(mesh(G.box(2.3, 0.08, 0.06), m.wood, { p: [-0.6, 0.55, 2.0] }));
    b.add(mesh(G.cyl(0.4, 0.4, 0.6, 10), m.thatch, { p: [-2.0, 0.3, 0.8], r: [PI / 2, 0, 0.4] }));
    const gr = griffin();
    gr.position.set(1.2, 0, 1.6);
    gr.rotation.y = -0.6;
    gr.scale.setScalar(0.9);
    b.add(gr);
    b.userData.griffin = gr;
    return b;
  };
  B.ruhmeshalle = function (rng, N) {
    const b = grp();
    const marble = pm("stone", "#9a968c");
    for (let i = 0; i < 3; i++) b.add(mesh(G.box(4.0 - i * 0.4, 0.2, 3.0 - i * 0.3), marble, { p: [0, 0.1 + i * 0.2, 0] }));
    for (let i = 0; i < 4; i++) for (const z of [-1.0, 1.0]) b.add(mesh(G.cyl(0.18, 0.22, 2.4, 10), marble, { p: [-1.35 + i * 0.9, 1.8, z] }));
    b.add(mesh(G.box(3.8, 0.3, 2.6), marble, { p: [0, 3.15, 0] }));
    const roof = gableRoof(4.0, 2.9, 0.9, pm("stone", "#5a4a3a", { flat: true }));
    roof.position.set(0, 3.3, 0);
    b.add(roof);
    b.add(mesh(G.box(3.0, 2.3, 0.15), pm("stone", "#5e5a54"), { p: [0, 1.75, -0.95] }));
    // Drei Reichsstatuen aus Stein
    const stoneM = pm("stone", "#b8b2a4");
    const statues = [["albion", "schildritter", "albier", "schwert"], ["midgard", "runenwirker", "nordmann", "runenstab"], ["hibernia", "mondschuetze", "sidhe", "bogen"]];
    statues.forEach(([realm, cls, race, wpn], i) => {
      const s = R.buildHero({ race, cls, realm, gender: i === 1 ? "m" : "w", look: { hairStyle: 2, beard: i === 1 ? 2 : 0 }, gear: { waffe: { base: wpn, rarity: "gewoehnlich" }, umhang: { base: "umhang" } } });
      s.update(0.01);
      s.obj.traverse((o) => {
        if (o.isMesh) o.material = stoneM;
        if (o.isSprite) o.visible = false;
      });
      s.obj.position.set(-1.1 + i * 1.1, 0.6, -0.5);
      s.obj.scale.multiplyScalar(0.62);
      b.add(s.obj);
      b.add(mesh(G.box(0.6, 0.3, 0.6), marble, { p: [-1.1 + i * 1.1, 0.45, -0.5] }));
    });
    b.add(mesh(G.box(0.18, 0.18, 0.18), emis("#e8c35a", 0.9), { p: [0, 3.15, 1.32], r: [0, PI / 4, 0] }));
    return b;
  };
  B.gildenhalle = function (rng, N) {
    const m = mats();
    const b = grp();
    b.add(mesh(G.box(4.4, 0.5, 2.8), m.stone, { p: [0, 0.25, 0] }));
    b.add(mesh(G.box(4.2, 1.7, 2.6), pm("wood", "#4a3424"), { p: [0, 1.35, 0] }));
    const roof = gableRoof(4.8, 3.4, 2.2, pm("wood", "#2e241c", { flat: true }));
    roof.position.set(0, 2.2, 0);
    roof.rotation.y = PI / 2;
    roof.scale.set(3.4, roof.scale.y, 4.8 / 1.732);
    b.add(roof);
    // Drachenkoepfe an den Giebeln
    for (const s of [-1, 1]) {
      const d = grp([s * 0.1, 4.3, s * 1.75], [0, s > 0 ? 0 : PI, 0]);
      d.add(mesh(G.tube("dragonbeam", [[0, 0, 0], [0, 0.3, 0.25], [0, 0.45, 0.6]], 0.07, 8, 5), pm("wood", "#2e241c")));
      d.add(mesh(G.cone(0.1, 0.3, 5), pm("wood", "#2e241c"), { p: [0, 0.5, 0.75], r: [1.6, 0, 0] }));
      d.add(mesh(G.sph(0.03, 6, 6), emis("#ff7a3d", 1), { p: [0.06, 0.53, 0.68] }));
      b.add(d);
    }
    b.add(mesh(G.box(1.0, 1.5, 0.1), pm("wood", "#2a1e16"), { p: [0, 1.25, 1.32] }));
    for (const x of [-1.4, 1.4]) b.add(mesh(G.box(0.5, 0.4, 0.08), N.win, { p: [x, 1.6, 1.32] }));
    // Schildwand und Banner
    const realms = ["albion", "midgard", "hibernia"];
    for (let i = 0; i < 3; i++) {
      const sh = R.buildOffhand({ base: "schild", style: 0 }, realms[i]);
      sh.position.set(-1.6 + i * 1.6, 2.35, 1.38);
      sh.scale.setScalar(0.55);
      b.add(sh);
    }
    const banners = [];
    for (const x of [-2.25, 2.25]) {
      const p = grp([x, 0, 1.6]);
      p.add(mesh(G.cyl(0.05, 0.06, 3.2, 6), m.iron, { p: [0, 1.6, 0] }));
      const bn = mesh(G.box(0.7, 1.2, 0.03), pm("cloth", x < 0 ? "#6a2a2a" : "#2a3a6a", { ds: true }), { p: [0.38, 2.5, 0] });
      p.add(bn);
      banners.push(bn);
      b.add(p);
    }
    b.userData.flags = banners;
    b.userData.guildBanners = banners;
    b.add(lantern(N).translateX(-2.0).translateZ(1.0));
    return b;
  };
  B.brunnen = function (rng, N) {
    const b = grp();
    const st = pm("stone", "#6e6a64", { flat: true });
    const ring = new T.CylinderGeometry(0.95, 1.0, 0.8, 12, 1, true);
    b.add(mesh(ring, pm("stone", "#6e6a64", { flat: true, ds: true }), { p: [0, 0.4, 0] }));
    b.add(mesh(G.torus(0.98, 0.14, PI * 2, 6, 12), st, { p: [0, 0.8, 0], r: [PI / 2, 0, 0] }));
    const water = new T.MeshLambertMaterial({ color: col("#2a5a7a"), emissive: col("#3fa0ff"), emissiveIntensity: 0.6 });
    b.add(mesh(G.cyl(0.9, 0.9, 0.05, 18), water, { p: [0, 0.6, 0] }));
    b.add(R.haloSprite("#6fc0ff", 2.2, 0.45, [0, 0.9, 0]));
    b.userData.water = water;
    for (const x of [-0.85, 0.85]) b.add(mesh(G.cyl(0.08, 0.09, 1.9, 6), pm("wood", "#3a2a1e"), { p: [x, 1.4, 0] }));
    b.add(roofCone(mesh(G.cone(1.4, 0.9, 4), pm("stone", "#2f3644", { flat: true }), { p: [0, 2.7, 0], r: [0, PI / 4, 0] })));
    b.add(mesh(G.cyl(0.04, 0.04, 1.7, 6), pm("wood", "#3a2a1e"), { p: [0, 2.15, 0], r: [0, 0, PI / 2] }));
    b.add(mesh(G.cyl(0.18, 0.15, 0.25, 10), pm("wood", "#5a4130"), { p: [0.3, 1.6, 0] }));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      b.add(mesh(G.cyl(0.06, 0.06, 0.02, 8), pm("metal", "#d9a441", { sh: 80 }), { p: [Math.cos(a) * 0.45, 0.64, Math.sin(a) * 0.45] }));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + 0.3;
      b.add(mesh(G.box(0.08, 0.16, 0.02), emis("#9fd8ff", 1), { p: [Math.cos(a) * 1.01, 0.45, Math.sin(a) * 1.01], r: [0, -a + PI / 2, 0] }));
    }
    return b;
  };
  // Heim: Aussehen haengt von der Ausbaustufe ab
  function homeExterior(tier, N, realm) {
    const m = mats();
    const b = grp();
    const RM = SB.data.REALMS[realm] || SB.data.REALMS.albion;
    if (tier <= 0) {
      const tent = mesh(G.cone(1.4, 1.8, 4), pm("cloth", "#7a6a50", { ds: true }), { p: [0, 0.9, 0], r: [0, PI / 4, 0] });
      b.add(tent);
      b.add(mesh(G.box(0.6, 0.9, 0.05), basic("#1a1410"), { p: [0, 0.45, 0.98], r: [-0.55, 0, 0] }));
      const f = fire(N, 0.8);
      f.position.set(1.4, 0, 1.2);
      b.add(f);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        b.add(mesh(G.dodeca(0.12), pm("stone", "#5a5650", { flat: true }), { p: [1.4 + Math.cos(a) * 0.4, 0.05, 1.2 + Math.sin(a) * 0.4] }));
      }
    } else if (tier === 1) {
      b.add(mesh(G.box(2.4, 1.6, 2.0), m.stone, { p: [0, 0.8, 0] }));
      const roof = gableRoof(2.8, 2.5, 1.3, m.thatch);
      roof.position.set(0, 1.6, 0);
      b.add(roof);
      b.add(mesh(G.box(0.7, 1.1, 0.1), m.wood, { p: [-0.4, 0.55, 1.02] }));
      b.add(mesh(G.box(0.45, 0.4, 0.08), N.win, { p: [0.6, 1.0, 1.02] }));
      b.add(mesh(G.box(0.4, 0.9, 0.4), m.stone, { p: [0.8, 2.4, -0.4] }));
      b.userData.smoke = [0.8, 2.9, -0.4];
    } else if (tier === 2) {
      b.add(mesh(G.box(3.6, 1.6, 2.2), pm("wood", "#4a3424"), { p: [0, 0.8, 0] }));
      const roof = gableRoof(3.6, 3.0, 1.8, pm("fur", "#5e5038"));
      roof.position.set(0, 1.6, 0);
      roof.rotation.y = PI / 2;
      roof.scale.set(2.9, roof.scale.y, 3.9 / 1.732);
      b.add(roof);
      b.add(mesh(G.box(0.9, 1.2, 0.1), pm("wood", "#2a1e16"), { p: [0, 0.6, 1.12] }));
      for (const x of [-1.2, 1.2]) b.add(mesh(G.box(0.45, 0.4, 0.08), N.win, { p: [x, 1.0, 1.12] }));
      b.userData.smoke = [1.2, 3.2, 0];
    } else {
      b.add(mesh(G.cyl(1.2, 1.4, 4.8, 10), pm("stone", "#66625c", { flat: true }), { p: [0, 2.4, 0] }));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * PI * 2;
        b.add(mesh(G.box(0.4, 0.5, 0.4), pm("stone", "#5a5650", { flat: true }), { p: [Math.cos(a) * 1.25, 5.05, Math.sin(a) * 1.25], r: [0, -a, 0] }));
      }
      for (let i = 0; i < 3; i++) b.add(mesh(G.box(0.3, 0.55, 0.08), N.win, { p: [0, 1.2 + i * 1.3, 1.36 - i * 0.04] }));
      b.add(mesh(G.box(0.8, 1.3, 0.1), pm("wood", "#2a1e16"), { p: [0, 0.65, 1.4] }));
    }
    // Reichsfahne
    const pole = grp([-1.5, 0, 1.0]);
    pole.add(mesh(G.cyl(0.04, 0.05, 2.8, 6), m.iron, { p: [0, 1.4, 0] }));
    const flag = new T.Mesh(G.geo("homeflag", () => new T.PlaneGeometry(0.8, 0.55, 4, 1)), R.crestMat(realm in SB.data.REALMS ? realm : "albion", RM.color, RM.trim));
    flag.position.set(0.42, 2.5, 0);
    pole.add(flag);
    b.add(pole);
    b.userData.flag = flag;
    return b;
  }
  B.heim = function (rng, N, ctx) {
    return homeExterior(ctx.homeTier || 0, N, ctx.realm || "albion");
  };
  // Bausteine fuer r3d-realms.js
  R._sc = { gableRoof, fire, lantern, standingStone, gnarledTree, pine, deadTree, shrooms, crystals, rock, island, heightAt, tiled, dot, griffin: () => griffin(), B, nightMats };

  function skyWhale(rng) {
    const w = grp();
    const skin = pm("skin", "#4a5a78");
    const belly = pm("skin", "#a8b4c4");
    w.add(mesh(G.sph(1, 20, 14), skin, { s: [4.2, 1.5, 1.7] }));
    w.add(mesh(G.sph(1, 16, 10), belly, { p: [0.3, -0.5, 0], s: [3.4, 1.0, 1.3] }));
    const tail = grp([-4.0, 0, 0]);
    tail.add(mesh(G.cone(0.7, 2.2, 8), skin, { p: [-1.0, 0, 0], r: [0, 0, PI / 2] }));
    tail.add(mesh(G.box(0.5, 0.12, 2.8), skin, { p: [-2.0, 0, 0] }));
    w.add(tail);
    for (const s of [-1, 1]) w.add(mesh(G.box(1.4, 0.1, 0.6), skin, { p: [1.2, -0.6, s * 1.6], r: [0, s * 0.4, s * 0.3] }));
    for (const s of [-1, 1]) w.add(mesh(G.sph(0.12, 8, 6), emis("#9fe3ff", 1), { p: [3.4, 0.25, s * 0.9] }));
    for (let i = 0; i < 6; i++) w.add(mesh(G.sph(0.09, 6, 6), emis("#9fe3ff", 1.2), { p: [2 - i * 0.9, 1.25 - Math.abs(i - 2.5) * 0.05, 0] }));
    w.userData.tail = tail;
    return w;
  }
  function raven() {
    const b = grp();
    const m = basic("#0e0c12");
    b.add(mesh(G.sph(0.15, 8, 6), m, { s: [1, 0.8, 2] }));
    const wings = [];
    for (const s of [1, -1]) {
      const w = grp([0.1 * s, 0, 0]);
      w.add(mesh(G.box(0.6, 0.03, 0.22), m, { p: [0.3 * s, 0, 0] }));
      b.add(w);
      wings.push({ w, s });
    }
    b.userData.wings = wings;
    return b;
  }

  /* ---------- Insel-Hub ---------- */
  const LAYOUT = {
    brunnen: [0.5, 0.8],
    taverne: [-5.6, 1.8],
    heim: [-3.2, 6.6],
    stall: [4.6, 5.8],
    leuchtturm: [10.0, 3.2],
    arena: [7.6, -2.2],
    gildenhalle: [8.8, -7.2],
    ruhmeshalle: [3.6, -8.6],
    arkanum: [-2.4, -9.2],
    steinkreis: [-8.4, -6.6],
    schmiede: [-9.8, -1.6],
    tiefen: [-10.8, 3.8],
  };
  const LABEL_H = { mondtor: 5.4, brunnen: 3.6, taverne: 4.5, heim: 3.8, stall: 3.8, leuchtturm: 9.0, arena: 4.6, gildenhalle: 5.0, ruhmeshalle: 4.3, arkanum: 9.6, steinkreis: 3.4, schmiede: 4.8, tiefen: 4.8 };

  R.createHub = function (el, opts) {
    init();
    opts = opts || {};
    const E = SB.engine;
    const quality = opts.quality || "hoch";
    const hi = quality === "hoch";
    const D = SB.data;
    const renderer = makeRenderer(el, { shadows: hi, maxDpr: hi ? 1.75 : 1.25 });
    const scene = new T.Scene();
    scene.environment = envMap(renderer);
    const camera = new T.PerspectiveCamera(40, 1, 0.5, 700);
    let dayMode = opts.dayCycle || "zyklus";
    const sky = skyDome();
    scene.add(sky);
    scene.fog = new T.Fog("#9fb0b4", 45, 170);
    const hemi = new T.HemisphereLight("#d8e2ee", "#4a3e30", 1.0);
    scene.add(hemi);
    const sun = new T.DirectionalLight("#ffe9c8", 2.0);
    sun.position.set(14, 24, 10);
    if (hi) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera;
      sc.left = -18;
      sc.right = 18;
      sc.top = 18;
      sc.bottom = -18;
      sc.near = 1;
      sc.far = 80;
      sun.shadow.bias = -0.0008;
      sun.shadow.normalBias = 0.03;
    }
    scene.add(sun);
    scene.add(sun.target);
    const skyRng = R.rng(42);
    const stars = starField(skyRng, 900);
    scene.add(stars);
    const moon = moonSprite();
    scene.add(moon);
    const sunGlow = new T.Sprite(new T.SpriteMaterial({ map: dot(), color: col("#fff1d0"), transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
    sunGlow.scale.setScalar(60);
    scene.add(sunGlow);
    const aur = aurora();
    scene.add(aur);
    const sea = cloudSea(-26, 420);
    scene.add(sea);
    const sea2 = cloudSea(-18, 300);
    sea2.material.opacity = 0.35;
    sea2.userData.tex.repeat.set(4, 4);
    scene.add(sea2);
    const whale = skyWhale(skyRng);
    scene.add(whale);
    const ravens = [];
    for (let i = 0; i < 5; i++) {
      const b = raven();
      b.scale.setScalar(0.7);
      ravens.push({ b, ph: skyRng() * 6, r: 16 + skyRng() * 10, h: 17 + skyRng() * 5, sp: 0.1 + skyRng() * 0.1 });
      scene.add(b);
    }
    // Wasserfaelle (Textur geteilt)
    const fallTex = (() => {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 128;
      const g = c.getContext("2d");
      for (let i = 0; i < 40; i++) {
        g.fillStyle = "rgba(220,240,255," + (0.2 + Math.random() * 0.5) + ")";
        g.fillRect(Math.random() * 32, Math.random() * 128, 2 + Math.random() * 3, 10 + Math.random() * 30);
      }
      const t = new T.CanvasTexture(c);
      t.wrapS = t.wrapT = T.RepeatWrapping;
      return t;
    })();

    /* ---- Heimatinsel des Reiches: wird bei einem Reichswechsel neu gebaut ---- */
    let realm = D.REALMS[opts.realm] ? opts.realm : "albion";
    let homeTier = opts.homeTier || 0;
    let TH = R.realmTheme(realm);
    let N = null;
    let world = null;
    let isl = null;
    let buildings = {};
    const pickables = [];
    let anim = null;
    let islets = [];
    let villagers = [];
    let life = [];
    let flyList = [];
    let wisps = null;
    let weather = null;
    let gate = null;
    let paths = [];
    let rng = null;
    const placeAt = (obj, x, z) => {
      obj.position.set(x, heightAt(isl, x, z) - 0.05, z);
      world.add(obj);
    };
    function placeBuilding(id) {
      const [x, z] = LAYOUT[id];
      if (buildings[id]) world.remove(buildings[id]);
      const bg = R.realmBuilding(realm, id)(rng, N, { homeTier, realm });
      R.realmFinish(realm, bg);
      bg.position.set(x, 0, z);
      bg.rotation.y = Math.atan2(0.5 - x, 10 - z);
      bg.userData.bid = id;
      world.add(bg);
      buildings[id] = bg;
      const u = bg.userData;
      if (u.smoke) {
        const parts = [];
        for (let i = 0; i < 7; i++) {
          const pm2 = new T.SpriteMaterial({ map: dot(), color: col("#8a8a92"), transparent: true, opacity: 0.5, depthWrite: false });
          const puff = new T.Sprite(pm2);
          puff.userData.t = i / 7;
          bg.add(puff);
          parts.push(puff);
        }
        anim.smoke = anim.smoke.filter((s) => s.id !== id);
        anim.smoke.push({ id, p: u.smoke, parts });
      }
      if (u.flags) anim.flags.push(...u.flags);
      if (u.beam) anim.beam = u.beam;
      if (u.portal) anim.portal = u.portal;
      if (u.runes) anim.runes = u.runes;
      if (u.float) anim.float = u.float;
      if (u.orbit) anim.orbit = u.orbit;
      if (u.water) anim.water = u.water;
      if (u.swing) anim.swing = u.swing;
      if (u.orb) anim.orb = u.orb;
      if (u.stones) anim.stones = u.stones;
      if (u.griffin) anim.griffin = u.griffin;
      if (u.flag) anim.homeFlag = u.flag;
      if (u.guildBanners) anim.guildBanners = u.guildBanners;
      if (u.sparks) {
        anim.sparks = anim.sparks.filter((s) => s.id !== id);
        anim.sparks.push({ id, b: bg, p: u.sparks });
      }
      return bg;
    }
    function rebuildPickables() {
      for (const p of pickables) scene.remove(p);
      pickables.length = 0;
      for (const id in buildings) {
        const bg = buildings[id];
        const bb = new T.Box3().setFromObject(bg);
        const size = bb.getSize(new T.Vector3());
        const center = bb.getCenter(new T.Vector3());
        const hit = new T.Mesh(new T.BoxGeometry(Math.min(size.x, 7) + 0.4, Math.min(size.y, 9) + 0.4, Math.min(size.z, 7) + 0.4), new T.MeshBasicMaterial({ visible: false }));
        hit.position.copy(center);
        hit.userData.bid = id;
        scene.add(hit);
        pickables.push(hit);
      }
    }
    // Bewohner: Leute des eigenen Reiches in Alltagskleidung
    function citizen(rr, rk, o) {
      o = o || {};
      const races = Object.keys(D.RACES).filter((r) => D.RACES[r].realm === rk);
      const race = o.race || races[Math.floor(rr() * races.length)];
      const R0 = D.RACES[race];
      const clsList = Object.keys(D.CLASSES).filter((c) => D.CLASSES[c].realm === rk);
      const cls = o.cls || clsList[Math.floor(rr() * clsList.length)];
      const look = {
        skin: R0.skins[Math.floor(rr() * 4)], hair: R0.hairs[Math.floor(rr() * 5)], hairStyle: Math.floor(rr() * 6), beard: Math.floor(rr() * 5),
        tattoo: rr() < 0.35 ? D.TATTOOS[1 + Math.floor(rr() * 6)].id : "keine", tattooColor: D.TATTOO_COLORS[Math.floor(rr() * 7)].c, eyes: D.EYES[Math.floor(rr() * 4)].c,
      };
      const v = R.buildHero({ race, cls, realm: rk, gender: o.gender || (rr() < 0.5 ? "m" : "w"), look, gear: o.gear || {} });
      v.obj.scale.multiplyScalar(o.scale || 0.72);
      return v;
    }
    const mugMat = () => pm("wood", "#7a5232");
    function mug() {
      const g = grp();
      g.add(mesh(G.cyl(0.075, 0.065, 0.16, 10), mugMat()));
      g.add(mesh(G.cyl(0.07, 0.07, 0.03, 10), pm("plain", "#f2ead8"), { p: [0, 0.08, 0] }));
      g.add(mesh(G.torus(0.045, 0.012, PI, 4, 8), mugMat(), { p: [0.08, 0, 0], r: [0, 0, -PI / 2] }));
      return g;
    }
    function frameOf(bg, lx, lz) {
      // Weltposition und Drehung eines Punktes vor einem Gebaeude
      const c = Math.cos(bg.rotation.y);
      const s = Math.sin(bg.rotation.y);
      return [bg.position.x + lx * c + lz * s, bg.position.z - lx * s + lz * c];
    }
    function buildLife() {
      const rr = R.rng(99 + realm.length);
      const others = Object.keys(D.REALMS).filter((r) => r !== realm);
      // Biergarten vor der Taverne: Tische, Baenke, Leute mit Krug
      const tav = buildings.taverne;
      const [px, pz] = frameOf(tav, 1.3, 2.7);
      const patio = grp([tav.position.x, heightAt(isl, px, pz) - 0.03, tav.position.z], [0, tav.rotation.y, 0]);
      world.add(patio);
      const wood = pm("wood", "#5a4130");
      let seat = 0;
      for (const [tx, tz] of [[0.4, 2.6], [2.2, 2.5]]) {
        const tb = grp([tx, 0, tz]);
        tb.add(mesh(G.box(1.4, 0.07, 0.62), wood, { p: [0, 0.72, 0] }));
        for (const [lx, lz] of [[-0.6, -0.24], [0.6, -0.24], [-0.6, 0.24], [0.6, 0.24]]) tb.add(mesh(G.box(0.07, 0.7, 0.07), wood, { p: [lx, 0.35, lz] }));
        for (const s of [-1, 1]) {
          tb.add(mesh(G.box(1.4, 0.06, 0.28), wood, { p: [0, 0.42, s * 0.62] }));
          for (const lx of [-0.6, 0.6]) tb.add(mesh(G.box(0.06, 0.4, 0.06), wood, { p: [lx, 0.2, s * 0.62] }));
        }
        const m1 = mug();
        m1.position.set(0.3, 0.84, 0.05);
        tb.add(m1);
        patio.add(tb);
        for (const s of [-1, 1]) {
          if (seat >= 4) continue;
          const v = citizen(rr, rr() < 0.85 ? realm : others[0], { gear: rr() < 0.4 ? { umhang: { base: "umhang", tint: D.REALMS[realm].color } } : {} });
          v.obj.position.set(tx + (seat % 2 ? 0.35 : -0.3), 0, tz + s * 0.66);
          v.obj.rotation.y = s > 0 ? PI : 0;
          v.hold = "drink";
          v.drinkPh = rr() * 7;
          const mm = mug();
          // modellierte Figuren greifen den Krug in der Faust (Achse entlang der Griffachse), alte halten ihn darunter
          if (!(v.parts.handR && v.parts.handR.userData.grip)) {
            mm.position.set(0, -0.06, 0.07);
            mm.rotation.x = -0.4;
          }
          if (v.parts.handR) v.parts.handR.add(mm);
          patio.add(v.obj);
          life.push({ update: (dt) => v.update(dt) });
          seat++;
        }
      }
      // Ein Spielmann am Tisch, der aufsteht und jubelt
      const bard = citizen(rr, realm, { gear: { umhang: { base: "umhang", tint: "#6a2a5a" } } });
      bard.obj.position.set(1.3, 0, 3.7);
      bard.obj.rotation.y = PI;
      patio.add(bard.obj);
      let bardT = 3;
      life.push({
        update: (dt) => {
          bardT -= dt;
          if (bardT <= 0) {
            bard.play("victory", 1.4);
            bardT = 5 + rr() * 6;
          }
          bard.update(dt);
        },
      });
      blocked.push([px, pz, 2.6]);

      // Zwei Kaempfer im Ring der Reiche, Zuschauer am Rand
      const ar = buildings.arena;
      const ring = grp([ar.position.x, heightAt(isl, ar.position.x, ar.position.z) + 0.08, ar.position.z], [0, ar.rotation.y, 0]);
      world.add(ring);
      const duo = grp();
      ring.add(duo);
      const fA = citizen(rr, realm, { gear: { waffe: { base: "schwert", rarity: "selten", style: 1 }, nebenhand: { base: "schild", style: 0 }, ruestung: { base: "platte", style: 1 }, helm: { base: "helm", style: 0 } }, cls: E.CLASS_FOR[realm].krieger, scale: 0.78 });
      const or = others[Math.floor(rr() * 2)];
      const fB = citizen(rr, or, { gear: { waffe: { base: "axt", rarity: "episch", style: 2 }, ruestung: { base: "leder", style: 2 }, umhang: { base: "umhang", tint: D.REALMS[or].color } }, cls: E.CLASS_FOR[or].schurke, scale: 0.78 });
      fA.obj.position.set(-0.8, 0, 0);
      fA.obj.rotation.y = PI / 2;
      fB.obj.position.set(0.8, 0, 0);
      fB.obj.rotation.y = -PI / 2;
      duo.add(fA.obj, fB.obj);
      const sparkM = new T.SpriteMaterial({ map: dot(), color: col("#ffd9a0"), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0 });
      const spark = new T.Sprite(sparkM);
      spark.position.set(0, 1.05, 0);
      spark.scale.setScalar(0.9);
      duo.add(spark);
      let duelT = 1;
      let turn = 0;
      let flashT = 0;
      let rounds = 0;
      life.push({
        update: (dt) => {
          duo.rotation.y += dt * 0.12;
          duelT -= dt;
          if (duelT <= 0) {
            const a = turn ? fB : fA;
            const d = turn ? fA : fB;
            rounds++;
            const special = rounds % 6 === 0;
            a.play(special ? "special" : "attack", special ? 0.9 : 0.55);
            const reaction = rr();
            setTimeout(() => {
              d.play(reaction < 0.35 ? "block" : reaction < 0.6 ? "evade" : "hit", 0.45);
              flashT = 0.25;
            }, special ? 420 : 280);
            turn = 1 - turn;
            duelT = special ? 1.6 : 1.0 + rr() * 0.5;
          }
          if (flashT > 0) flashT -= dt;
          sparkM.opacity = Math.max(0, flashT * 3.2);
          fA.update(dt);
          fB.update(dt);
        },
      });
      const fans = [];
      for (let i = 0; i < (hi ? 4 : 2); i++) {
        const a = PI / 2 + (i - 1.5) * 0.32;
        const v = citizen(rr, i === 3 ? or : realm, { gear: rr() < 0.5 ? { umhang: { base: "umhang", tint: D.REALMS[i === 3 ? or : realm].color } } : {} });
        v.obj.position.set(Math.cos(a) * 4.2, 0, Math.sin(a) * 4.2);
        v.obj.rotation.y = -a - PI / 2;
        ring.add(v.obj);
        fans.push({ v, t: rr() * 5 });
      }
      life.push({
        update: (dt) => {
          for (const f of fans) {
            f.t -= dt;
            if (f.t <= 0) {
              f.v.play("victory", 1.2);
              f.t = 3 + rr() * 6;
            }
            f.v.update(dt);
          }
        },
      });
      // Schmied am Amboss
      const sm = buildings.schmiede;
      const an = sm.userData.anvil || [0.7, 1.9];
      const smithG = grp([sm.position.x, heightAt(isl, sm.position.x, sm.position.z), sm.position.z], [0, sm.rotation.y, 0]);
      world.add(smithG);
      const smith = citizen(rr, realm, { gear: { waffe: { base: "hammer", rarity: "gewoehnlich", style: 0 }, ruestung: { base: "leder", tint: "#4a3424", style: 0 } }, cls: E.CLASS_FOR[realm].krieger, gender: "m" });
      smith.obj.position.set(an[0] - 0.62, 0, an[1] + 0.05);
      smith.obj.rotation.y = PI / 2;
      smith.hold = "hammer";
      smithG.add(smith.obj);
      life.push({ update: (dt) => smith.update(dt) });
      // Passanten auf den Wegen
      for (const [to, ph] of (hi ? [["steinkreis", 0], ["stall", 3], ["gildenhalle", 6]] : [["stall", 3]])) {
        const v = citizen(rr, rr() < 0.8 ? realm : others[1], { gear: rr() < 0.5 ? { umhang: { base: "umhang" } } : {} });
        const tp = LAYOUT[to];
        const a0 = [0.5 + tp[0] * 0.12, 0.8 + tp[1] * 0.12];
        const a1 = [tp[0] * 0.72, tp[1] * 0.72];
        world.add(v.obj);
        const st = { u: (ph / 10) % 1, dir: 1, wait: 0 };
        const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
        life.push({
          update: (dt) => {
            if (st.wait > 0) {
              st.wait -= dt;
              v.hold = null;
              if (st.wait <= 0) st.dir *= -1;
            } else {
              v.hold = "walk";
              st.u += (dt * 0.75 * st.dir) / len;
              if (st.u >= 1 || st.u <= 0) {
                st.u = Math.max(0, Math.min(1, st.u));
                st.wait = 1.5 + rr() * 2.5;
              }
            }
            const x = a0[0] + (a1[0] - a0[0]) * st.u;
            const z = a0[1] + (a1[1] - a0[1]) * st.u;
            v.obj.position.set(x, heightAt(isl, x, z) - 0.03, z);
            v.obj.rotation.y = Math.atan2((a1[0] - a0[0]) * st.dir, (a1[1] - a0[1]) * st.dir);
            v.update(dt);
          },
        });
      }
    }
    let blocked = [];
    // Mondtor: kleine Felsinsel hinten links, nur bei Nacht offen
    const MOON = [-16.8, 0.8, -12.6];
    function buildGate() {
      const g = grp(MOON);
      g.rotation.y = Math.atan2(0.5 - MOON[0], 10 - MOON[2]);
      const small = island(3.4, 5, rng, { grass: TH.ground.grass, grass2: TH.ground.grass2, dirt: TH.ground.dirt, rock: TH.ground.rock, roots: 6, hills: 0.3, vineGlow: "#cfe0ff" });
      g.add(small);
      const st = pm("stone", "#5c5c6c", { flat: true });
      for (const s of [-1, 1]) {
        g.add(mesh(G.box(0.55, 3.3, 0.55), st, { p: [s * 1.25, 1.65, 0] }));
        g.add(mesh(G.box(0.75, 0.3, 0.75), st, { p: [s * 1.25, 0.15, 0] }));
      }
      g.add(mesh(G.torus(1.25, 0.28, PI, 6, 18), st, { p: [0, 3.3, 0] }));
      const runeM = new T.MeshLambertMaterial({ color: col("#3a3a4a"), emissive: col("#cfe0ff"), emissiveIntensity: 0.1 });
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) g.add(mesh(G.box(0.1, 0.32, 0.02), runeM, { p: [s * 1.25, 0.9 + i * 0.75, 0.29], r: [0, 0, i % 2 ? 0.4 : -0.3] }));
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const cx = c.getContext("2d");
      const gr = cx.createRadialGradient(64, 64, 4, 64, 64, 64);
      gr.addColorStop(0, "#ffffff");
      gr.addColorStop(0.35, "#cfe0ff");
      gr.addColorStop(0.8, "#3a4a8a");
      gr.addColorStop(1, "#0a0c1a");
      cx.fillStyle = gr;
      cx.fillRect(0, 0, 128, 128);
      cx.fillStyle = "rgba(10,12,26,0.85)";
      cx.beginPath();
      cx.arc(76, 52, 26, 0, PI * 2);
      cx.fill();
      cx.fillStyle = "#f2f6ff";
      cx.beginPath();
      cx.arc(60, 56, 24, 0, PI * 2);
      cx.fill();
      cx.fillStyle = "#3a4a8a";
      cx.beginPath();
      cx.arc(70, 50, 22, 0, PI * 2);
      cx.fill();
      const tex = new T.CanvasTexture(c);
      tex.colorSpace = T.SRGBColorSpace;
      const portalM = new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide });
      const portal = new T.Mesh(new T.CircleGeometry(1.0, 32), portalM);
      portal.position.set(0, 1.95, 0);
      portal.scale.set(0.98, 1.45, 1);
      g.add(portal);
      const halo = R.haloSprite("#cfe0ff", 5, 0.0, [0, 2.0, 0.3]);
      g.add(halo);
      // Haendlerin Selene, nur bei Nacht
      const selene = R.buildHero({ race: "sidhe", cls: "lichtweber", realm: "hibernia", gender: "w", look: { skin: "#dfe6f2", hair: "#e8eef8", hairStyle: 2, eyes: "#cfe0ff", tattoo: "mond", tattooColor: "#ffcf5a" }, gear: { ruestung: { base: "robe", tint: "#2a3260", style: 1 }, helm: { base: "kappe", tint: "#1e2448", style: 0 }, umhang: { base: "umhang", tint: "#1e2448" } } });
      selene.obj.scale.multiplyScalar(0.75);
      selene.obj.position.set(2.1, 0, 0.9);
      selene.obj.rotation.y = -0.5;
      const lantern2 = grp([0, 0, 0]);
      lantern2.add(mesh(G.sph(0.09, 8, 6), emis("#cfe0ff", 1.4)));
      lantern2.add(R.haloSprite("#cfe0ff", 0.9, 0.7));
      if (!(selene.parts.handL && selene.parts.handL.userData.grip)) lantern2.position.set(0, -0.12, 0.08);
      if (selene.parts.handL) selene.parts.handL.add(lantern2);
      g.add(selene.obj);
      // Lichtbruecke aus schwebenden Steinen
      const bridge = grp();
      const stepM = new T.MeshLambertMaterial({ color: col("#6a6a7a"), emissive: col("#cfe0ff"), emissiveIntensity: 0, transparent: true, opacity: 0 });
      const from = new T.Vector3(-9.6, 0, -9.0);
      const to = new T.Vector3(MOON[0] + 2.6, MOON[1], MOON[2] + 2.4);
      const steps = [];
      for (let i = 0; i < 7; i++) {
        const u = (i + 0.5) / 7;
        const p = from.clone().lerp(to, u);
        p.y += Math.sin(u * PI) * 0.8;
        const s = mesh(G.cyl(0.42, 0.3, 0.14, 8), stepM, { p: [p.x, p.y, p.z] });
        s.userData.y0 = p.y;
        bridge.add(s);
        steps.push(s);
      }
      world.add(bridge);
      g.userData.update = (t, dt, night) => {
        const on = smooth(0.35, 0.65, night);
        portalM.opacity = on * 0.95;
        portal.rotation.z += dt * 0.3;
        halo.material.opacity = on * 0.55;
        runeM.emissiveIntensity = 0.1 + on * 1.4;
        stepM.opacity = on;
        stepM.emissiveIntensity = on * 0.9;
        bridge.visible = on > 0.02;
        steps.forEach((s, i) => (s.position.y = s.userData.y0 + Math.sin(t * 1.3 + i) * 0.08));
        selene.obj.visible = on > 0.5;
        if (selene.obj.visible) selene.update(dt);
      };
      g.userData.bid = "mondtor";
      world.add(g);
      return g;
    }
    function buildWorld() {
      TH = R.realmTheme(realm);
      N = nightMats();
      rng = R.rng(42 + realm.length * 7);
      anim = { smoke: [], flags: [], beam: null, portal: null, runes: null, float: null, orbit: null, water: null, swing: null, orb: null, stones: null, griffin: null, homeFlag: null, sparks: [], sparkList: [] };
      islets = [];
      villagers = [];
      life = [];
      flyList = [];
      buildings = {};
      world = grp();
      scene.add(world);
      paths = Object.values(LAYOUT).map(([x, z]) => [0.5, 0.8, x * 0.92, z * 0.92]);
      const gd = TH.ground;
      isl = island(14, 12, rng, { paths, plaza: [0.5, 0.8, 3.0], grass: gd.grass, grass2: gd.grass2, dirt: gd.dirt, rock: gd.rock, roots: TH.roots + 8, vineGlow: gd.vineGlow });
      world.add(isl);
      const cob = pm("stone", gd.cob, { flat: true });
      for (let i = 0; i < 26; i++) {
        const a = rng() * PI * 2;
        const r = Math.sqrt(rng()) * 2.8;
        world.add(mesh(G.cyl(0.25 + rng() * 0.15, 0.3, 0.06, 6), cob, { p: [0.5 + Math.cos(a) * r, 0.03, 0.8 + Math.sin(a) * r], r: [0, rng(), 0], shadow: false }));
      }
      for (const a of [2.4, 4.0]) {
        const frozen = realm === "midgard";
        const fm = new T.MeshBasicMaterial({ map: fallTex, color: col(frozen ? "#e8f4ff" : "#bfe0ff"), transparent: true, opacity: frozen ? 0.7 : 0.55, depthWrite: false, side: T.DoubleSide });
        const f = new T.Mesh(new T.PlaneGeometry(1.4, 16), fm);
        f.position.set(Math.cos(a) * 14.3, -8, Math.sin(a) * 14.3);
        f.rotation.y = -a + PI / 2;
        world.add(f);
        world.add(R.haloSprite("#cfe8ff", 5, 0.25, [Math.cos(a) * 14.3, -15, Math.sin(a) * 14.3]));
      }
      for (const id in LAYOUT) placeBuilding(id);
      gate = buildGate();
      buildings.mondtor = gate;
      rebuildPickables();
      blocked = Object.values(LAYOUT).map(([x, z]) => [x, z, 3.2]).concat([[0.5, 0.8, 3.4], [2.6, 3.4, 1.2]]);
      buildLife();
      const free = (x, z, r) => !blocked.some(([bx, bz, br]) => Math.hypot(bx - x, bz - z) < br + r) && !paths.some((p) => {
        const vx = p[2] - p[0];
        const vz = p[3] - p[1];
        const t = Math.max(0, Math.min(1, ((x - p[0]) * vx + (z - p[1]) * vz) / (vx * vx + vz * vz)));
        return Math.hypot(x - p[0] - vx * t, z - p[1] - vz * t) < 1.1 + r;
      });
      let placed = 0;
      for (let tries = 0; tries < 700 && placed < 36; tries++) {
        const a = rng() * PI * 2;
        const r = 3.5 + rng() * 9.8;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (!free(x, z, 0.8)) continue;
        if (z > 6 && Math.abs(x) < 6) continue;
        const tr = R.realmTree(realm, rng);
        tr.rotation.y = rng() * PI * 2;
        placeAt(tr, x, z);
        blocked.push([x, z, 1.0]);
        placed++;
      }
      const decoN = realm === "hibernia" ? 60 : 44;
      for (let i = 0; i < decoN; i++) {
        const a = rng() * PI * 2;
        const r = 3.6 + rng() * 9.8;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (!free(x, z, 0.3)) continue;
        const o = R.realmDeco(realm, rng, i);
        o.rotation.y = rng() * PI * 2;
        placeAt(o, x, z);
      }
      for (let i = 0; i < 5; i++) {
        const a = rng() * PI * 2;
        const r = 6 + rng() * 6;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (!free(x, z, 0.5)) continue;
        const s = standingStone(rng, 1.2 + rng(), ["#9fd8ff", "#7fffb0", "#e8c35a"][i % 3]);
        s.scale.setScalar(0.7);
        s.rotation.y = rng() * PI;
        placeAt(s, x, z);
      }
      for (const id of ["taverne", "arena", "heim", "stall", "arkanum", "ruhmeshalle", "gildenhalle", "steinkreis"]) {
        const [x, z] = LAYOUT[id];
        const l = lantern(N);
        l.rotation.y = rng() * PI * 2;
        placeAt(l, x * 0.55 + 0.9, z * 0.55 + 0.5);
      }
      // Kleine schwebende Felsen ringsum
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * PI * 2 + 0.4;
        const d = 24 + i * 3;
        const isg = grp([Math.cos(a) * d, -4 + (i % 3) * 3, Math.sin(a) * d]);
        isg.add(island(2.4 + rng() * 1.4, 4 + rng() * 3, rng, { grass: gd.grass, grass2: gd.grass2, rock: gd.rock, roots: 5, hills: 0.4, vineGlow: gd.vineGlow }));
        if (i % 2) isg.add(R.realmTree(realm, rng));
        else
          for (let k = 0; k < 3; k++) {
            const s = standingStone(rng, 1.4 + rng(), k === 1 ? gd.vineGlow : null);
            s.position.set((k - 1) * 0.9, 0, (rng() - 0.5) * 0.5);
            s.scale.setScalar(0.7);
            isg.add(s);
          }
        islets.push({ g: isg, ph: rng() * 6, y: isg.position.y });
        world.add(isg);
      }
      // Wahrzeichen des Reiches hinter der Insel, die anderen Reiche fern im Dunst
      const lm = R.realmLandmark(realm, N, rng);
      lm.position.set(4, -7, -46);
      world.add(lm);
      anim.flags.push(...lm.userData.flags);
      islets.push({ g: lm, ph: 1.3, y: lm.position.y, amp: 0.25 });
      const far = hi ? Object.keys(D.REALMS).filter((r) => r !== realm) : [];
      far.forEach((r2, i) => {
        const g = R.realmLandmark(r2, N, rng, { radius: 9 });
        const x = i ? 52 : -54;
        g.position.set(x, -2 + i * 3, -66 - i * 6);
        g.scale.setScalar(0.5);
        g.rotation.y = Math.atan2(-x, 36);
        world.add(g);
        islets.push({ g, ph: 2 + i, y: g.position.y, amp: 0.6 });
      });
      // Gluehwuermchen und Feenlichter, Nebelschwaden, Wetter
      const fc = TH.flies;
      fc.forEach((c, i) => {
        const f = fireflies(rng, Math.round((hi ? 140 : 70) / fc.length) + (realm === "hibernia" ? 20 : 0), 13, 0.4, 3.0, c);
        world.add(f);
        flyList.push(f);
      });
      wisps = mistWisps(rng, hi ? 16 : 8, 13, 0.3);
      world.add(wisps);
      weather = R.realmWeather(TH.weather, rng, hi);
      world.add(weather);
      // Bewohner
      const vr = R.rng(7 + realm.length);
      const spots = [[5.2, 1.4, -1.2], [-1.8, -3.4, 0.4], [3.0, -4.6, 2.2]];
      for (const [x, z, ry] of spots) {
        const v = citizen(vr, realm, { gear: { umhang: { base: "umhang", tint: D.REALMS[realm].color } } });
        v.obj.position.set(x, heightAt(isl, x, z), z);
        v.obj.rotation.y = ry;
        world.add(v.obj);
        villagers.push(v);
      }
      const seer = R.buildHero({ race: "sidhe", cls: "dornenrufer", realm: "hibernia", gender: "w", look: { skin: "#d6cfe6", hair: "#f2f2f2", hairStyle: 2, eyes: "#7fffb0", tattoo: "mond", tattooColor: "#4fffb0" }, gear: { ruestung: { base: "robe", tint: "#3a3a5a", style: 1 }, helm: { base: "hut", tint: "#2a2a44", style: 0 }, waffe: { base: "stab", rarity: "episch", style: 1 } } });
      seer.obj.position.set(-6.2, heightAt(isl, -6.2, -4.4), -4.4);
      seer.obj.rotation.y = 2.6;
      seer.obj.scale.multiplyScalar(0.72);
      world.add(seer.obj);
      villagers.push(seer);
    }
    function rebuildWorld() {
      if (world) scene.remove(world);
      buildWorld();
      if (heroModel) world.add(heroModel.obj);
      applyDaytime(R.dayTime(dayMode));
    }
    let heroModel = null;
    buildWorld();

    // Kamera
    const cam = { az: 0.05, pol: 1.04, rad: 40, target: new T.Vector3(0, 0.2, 0) };
    const goal = { az: 0.05, pol: 1.04, rad: 40, target: new T.Vector3(0, 0.2, 0) };
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
        if (pinchStart) goal.rad = Math.max(18, Math.min(48, goal.rad * (pinchStart / d)));
        pinchStart = d;
        return;
      }
      if (drag) {
        const dx = ev.clientX - drag.x;
        const dy = ev.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
        goal.az = drag.az - dx * 0.006;
        goal.pol = Math.max(0.55, Math.min(1.3, drag.pol - dy * 0.004));
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
        goal.rad = Math.max(18, Math.min(48, goal.rad * (1 + Math.sign(ev.deltaY) * 0.08)));
      },
      { passive: false }
    );

    // Tageszeit anwenden
    let info = R.dayInfo(R.dayTime(dayMode));
    const sunDir = new T.Vector3();
    const under = col("#0a0d18");
    function applyDaytime(t) {
      info = R.dayInfo(t);
      const P = palette(info, TH.sky);
      const a = t * 2 * PI;
      sunDir.set(Math.sin(a) * 0.55, -Math.cos(a), 0.45).normalize();
      const lightDir = info.sunH > -0.05 ? sunDir : sunDir.clone().negate();
      sun.position.copy(lightDir).multiplyScalar(40);
      sun.color.copy(P.sun);
      sun.intensity = P.sunI * (info.sunH > -0.05 ? 1 : 0.75);
      hemi.color.copy(P.hemiSky);
      hemi.groundColor.copy(P.hemiGround);
      hemi.intensity = P.hemiI;
      sky.userData.recolor(P.top, P.bot, under.clone().lerp(P.fog, 0.4));
      scene.fog.color.copy(P.fog);
      stars.material.opacity = Math.max(0, info.night - 0.15);
      moon.position.copy(sunDir).multiplyScalar(-200);
      moon.material.opacity = smooth(0.1, 0.6, info.night);
      sunGlow.position.copy(sunDir).multiplyScalar(200);
      sunGlow.material.opacity = smooth(-0.1, 0.2, info.sunH) * 0.8;
      sunGlow.material.color.copy(P.sun);
      N.win.emissiveIntensity = 0.25 + 1.6 * info.night;
      for (const h of N.halos) h.material.opacity = 0.35 + 0.55 * info.night;
      sea.material.color.copy(P.bot).multiplyScalar(0.9);
      sea2.material.color.copy(P.fog);
      renderer.toneMappingExposure = 1.05 + 0.25 * info.night;
      if (labels.mondtor) {
        labels.mondtor.classList.toggle("asleep", info.night < 0.5);
        labels.mondtor.classList.toggle("moonlit", info.night >= 0.5);
      }
    }
    applyDaytime(R.dayTime(dayMode));

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
      goal.rad = Math.max(goal.rad, w < 640 ? 48 : 34);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let dayTimer = 0;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!running || document.hidden) {
        last = now;
        return;
      }
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      const t = now / 1000;
      const k = 1 - Math.pow(0.0015, dt);
      cam.az += (goal.az - cam.az) * k;
      cam.pol += (goal.pol - cam.pol) * k;
      cam.rad += (goal.rad - cam.rad) * k;
      cam.target.lerp(goal.target, k);
      updateCamera();
      dayTimer += dt;
      if (dayTimer > 0.5) {
        dayTimer = 0;
        applyDaytime(R.dayTime(dayMode));
      }
      for (const s of anim.smoke) {
        for (const p of s.parts) {
          p.userData.t = (p.userData.t + dt * 0.16) % 1;
          const u = p.userData.t;
          p.position.set(s.p[0] + Math.sin(u * 6 + t) * 0.25, s.p[1] + u * 3, s.p[2]);
          p.scale.setScalar(0.5 + u * 2);
          p.material.opacity = 0.45 * (1 - u);
        }
      }
      for (const f of anim.flags) f.rotation.y = Math.sin(t * 2.2 + f.position.x * 3) * 0.3;
      if (anim.beam) {
        anim.beam.rotation.y += dt * 0.6;
        anim.beam.children[0].material.opacity = 0.01 + 0.025 * info.night;
      }
      if (anim.portal) anim.portal.rotation.z -= dt * 1.2;
      if (anim.runes)
        anim.runes.forEach((r, i) => {
          const a = t * 0.7 + (i * PI) / 2;
          r.position.set(Math.cos(a) * 2.1, 2.2 + Math.sin(t * 2 + i) * 0.3, Math.sin(a) * 0.8 + 0.5);
          r.rotation.y = -a;
        });
      if (anim.float) {
        anim.float.position.y = 8.6 + Math.sin(t * 1.3) * 0.25;
        anim.float.rotation.y += dt;
      }
      if (anim.orbit) anim.orbit.rotation.y += dt * 0.5;
      if (anim.orb) {
        anim.orb.position.y = 1.4 + Math.sin(t * 1.2) * 0.12;
        anim.orb.material.emissiveIntensity = 0.9 + Math.sin(t * 2) * 0.3;
      }
      if (anim.water) anim.water.emissiveIntensity = 0.45 + Math.sin(t * 1.6) * 0.15 + info.night * 0.4;
      if (anim.swing) anim.swing.rotation.x = Math.sin(t * 1.5) * 0.15;
      if (anim.griffin) {
        anim.griffin.userData.head.rotation.y = Math.sin(t * 0.5) * 0.6;
        anim.griffin.position.y = Math.max(0, Math.sin(t * 0.8)) * 0.03;
      }
      if (anim.homeFlag) anim.homeFlag.rotation.y = Math.sin(t * 2.6) * 0.25;
      if (anim.sparks.length && Math.random() < dt * 6) {
        const s = anim.sparks[0];
        const sp = new T.Sprite(new T.SpriteMaterial({ map: dot(), color: col("#ffb050"), transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
        sp.scale.setScalar(0.12);
        sp.position.set(s.p[0] + (Math.random() - 0.5) * 0.3, s.p[1], s.p[2]);
        sp.userData.v = new T.Vector3((Math.random() - 0.5) * 1.5, 1.5 + Math.random(), (Math.random() - 0.5) * 1.5);
        sp.userData.life = 0.7;
        s.b.add(sp);
        anim.sparkList = anim.sparkList || [];
        anim.sparkList.push(sp);
      }
      if (anim.sparkList)
        for (let i = anim.sparkList.length - 1; i >= 0; i--) {
          const sp = anim.sparkList[i];
          sp.userData.life -= dt;
          sp.userData.v.y -= dt * 4;
          sp.position.addScaledVector(sp.userData.v, dt);
          if (sp.userData.life <= 0) {
            sp.parent.remove(sp);
            anim.sparkList.splice(i, 1);
          }
        }
      for (const is of islets) is.g.position.y = is.y + Math.sin(t * 0.4 + is.ph) * (is.amp || 0.5);
      const wa = t * 0.025;
      whale.position.set(Math.cos(wa) * 48, 10 + Math.sin(t * 0.3) * 2, Math.sin(wa) * 48);
      whale.rotation.y = -wa + PI;
      whale.userData.tail.rotation.y = Math.sin(t * 0.9) * 0.25;
      for (const rv of ravens) {
        const a = t * rv.sp + rv.ph;
        rv.b.position.set(Math.cos(a) * rv.r, rv.h + Math.sin(t + rv.ph) * 0.6, Math.sin(a) * rv.r);
        rv.b.rotation.y = -a;
        for (const wg of rv.b.userData.wings) wg.w.rotation.z = wg.s * (0.2 + Math.sin(t * 7 + rv.ph) * 0.45);
      }
      sea.userData.tex.offset.x += dt * 0.004;
      sea2.userData.tex.offset.y += dt * 0.006;
      fallTex.offset.y += dt * 0.8;
      for (const f of flyList) f.userData.update(t, 0.15 + 0.85 * info.night);
      wisps.userData.update(dt, scene.fog.color, 0.08 + 0.1 * info.day + 0.06 * info.dusk);
      if (weather) weather.userData.update(dt, t, info);
      aur.userData.update(t, smooth(0.5, 0.95, info.night) * (0.3 + 0.7 * TH.aurora));
      if (gate) gate.userData.update(t, dt, info.night);
      for (const l of life) l.update(dt);
      for (const id in buildings) {
        if (id === "mondtor") continue;
        const b = buildings[id];
        const target = id === hover ? 1.05 : 1;
        const s = b.scale.x + (target - b.scale.x) * Math.min(1, dt * 10);
        b.scale.setScalar(s);
      }
      if (heroModel) heroModel.update(dt);
      for (const v of villagers) v.update(dt);
      renderer.render(scene, camera);
      updateLabels(w, h);
    }
    raf = requestAnimationFrame(frame);

    return {
      setHero(desc) {
        if (heroModel) world.remove(heroModel.obj);
        heroModel = R.buildHero(desc);
        heroModel.obj.position.set(2.6, heightAt(isl, 2.6, 3.4), 3.4);
        heroModel.obj.rotation.y = 0.15;
        heroModel.obj.scale.multiplyScalar(0.82);
        world.add(heroModel.obj);
        if (desc.realm && desc.realm !== realm && D.REALMS[desc.realm]) {
          realm = desc.realm;
          rebuildWorld();
        }
      },
      realm: () => realm,
      setHome(tier, realmId) {
        if (tier === homeTier && (!realmId || realmId === realm)) return;
        homeTier = tier;
        if (realmId && realmId !== realm && D.REALMS[realmId]) {
          realm = realmId;
          rebuildWorld();
          return;
        }
        placeBuilding("heim");
        rebuildPickables();
      },
      setGuildColors(c1, c2) {
        if (!anim.guildBanners) return;
        anim.guildBanners[0].material = pm("cloth", c1 || "#6a2a2a", { ds: true });
        anim.guildBanners[1].material = pm("cloth", c2 || c1 || "#2a3a6a", { ds: true });
      },
      setDayCycle(mode) {
        dayMode = mode || "zyklus";
        applyDaytime(R.dayTime(dayMode));
      },
      dayInfo: () => info,
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
          goal.target.set(p.x * 0.85, 1.4, p.z * 0.85);
          goal.rad = 20;
          goal.az = Math.atan2(p.x, p.z + 12) * 0.6;
          goal.pol = 1.0;
        } else {
          goal.target.set(0, 0.2, 0);
          goal.rad = w < 640 ? 48 : 40;
          goal.pol = 1.04;
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
  function runePedestal(color) {
    const ped = grp();
    ped.add(mesh(G.cyl(1.1, 1.25, 0.3, 10), pm("stone", "#3a3a44", { flat: true }), { p: [0, -0.15, 0] }));
    ped.add(mesh(G.torus(1.0, 0.025, PI * 2, 4, 48), glow(color, 0.8), { p: [0, 0.01, 0], r: [PI / 2, 0, 0] }));
    const runes = grp([0, 0.012, 0]);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2;
      runes.add(mesh(G.box(0.05, 0.003, 0.14), glow(color, 0.9), { p: [Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85], r: [0, -a, (i % 2 ? 0.4 : -0.4)] }));
    }
    ped.add(runes);
    ped.add(R.haloSprite(color, 2.6, 0.25, [0, 0.1, 0]));
    ped.userData.runes = runes;
    return ped;
  }
  R.createHeroView = function (el, opts) {
    init();
    opts = opts || {};
    const renderer = makeRenderer(el, { alpha: true, maxDpr: 2, exposure: 1.1 });
    const scene = new T.Scene();
    scene.environment = envMap(renderer);
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 100);
    const dist = opts.distance || 7.2;
    camera.position.set(0, 1.5 + (dist - 7.2) * 0.08, dist);
    camera.lookAt(0, opts.lookY || 1.15, 0);
    scene.add(new T.HemisphereLight("#dfe6ff", "#3a3028", 1.2));
    const key = new T.DirectionalLight("#fff0d8", 2.4);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new T.DirectionalLight("#8fb8ff", 1.8);
    rim.position.set(-4, 3, -3);
    scene.add(rim);
    let ped = runePedestal(opts.color || "#bfd8ff");
    scene.add(ped);
    const motes = fireflies(R.rng(3), 26, 1.6, 0.2, 2.6, opts.color || "#bfd8ff");
    motes.material.size = 0.12;
    scene.add(motes);
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
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      rotY += (goalY - rotY) * Math.min(1, dt * 8);
      if (model) {
        model.obj.rotation.y = rotY;
        model.update(dt);
      }
      ped.userData.runes.rotation.y += dt * 0.3;
      motes.userData.update(now / 1000, 0.8);
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
        if (desc.realm && SB.data.REALMS[desc.realm]) {
          const c = SB.data.REALMS[desc.realm].accent;
          scene.remove(ped);
          ped = runePedestal(c);
          scene.add(ped);
          motes.material.color.set(c);
        }
        if (celebrate) model.play("victory", 1.1);
      },
      play(name, dur) {
        if (model) model.play(name, dur);
      },
      get model() {
        return model;
      },
      camera,
      dispose() {
        cancelAnimationFrame(raf);
        ro.disconnect();
        killRenderer(renderer);
      },
    };
  };

  /* ---------- Heim (Innenansicht mit Einrichtung) ---------- */
  function furniture(id, lvl, realm, hero) {
    const g = grp();
    const wood = pm("wood", lvl >= 2 ? "#3a2a1e" : "#6a4a30");
    const RM = SB.data.REALMS[realm] || SB.data.REALMS.albion;
    if (id === "lager") {
      if (lvl === 0) {
        g.add(mesh(G.box(1.0, 0.15, 1.8), pm("fur", "#a08a5a"), { p: [0, 0.08, 0] }));
      } else {
        g.add(mesh(G.box(1.1, 0.35, 2.0), wood, { p: [0, 0.18, 0] }));
        g.add(mesh(G.box(1.0, 0.15, 1.9), pm("fur", lvl === 1 ? "#8a7a66" : "#e8e0d0"), { p: [0, 0.42, 0] }));
        g.add(mesh(G.box(0.7, 0.12, 0.3), pm("cloth", "#efe6d2"), { p: [0, 0.54, -0.75] }));
        g.add(mesh(G.box(1.0, 0.04, 1.2), pm("cloth", RM.color), { p: [0, 0.52, 0.3] }));
        if (lvl === 2) {
          for (const [x, z] of [[-0.5, -0.95], [0.5, -0.95], [-0.5, 0.95], [0.5, 0.95]]) g.add(mesh(G.cyl(0.05, 0.05, 2.0, 6), wood, { p: [x, 1.0, z] }));
          g.add(mesh(G.box(1.15, 0.05, 2.05), pm("cloth", RM.color, { ds: true }), { p: [0, 2.0, 0] }));
        }
      }
    } else if (id === "herd") {
      if (lvl === 0) {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * PI * 2;
          g.add(mesh(G.dodeca(0.13), pm("stone", "#5a5650", { flat: true }), { p: [Math.cos(a) * 0.4, 0.06, Math.sin(a) * 0.4] }));
        }
        g.add(fire({ halos: [] }, 0.7));
      } else {
        g.add(mesh(G.box(1.6, 1.6, 0.6), pm("stone", "#6a645c", { flat: true }), { p: [0, 0.8, 0] }));
        g.add(mesh(G.box(0.9, 0.8, 0.3), basic("#120c08"), { p: [0, 0.5, 0.18] }));
        g.add(mesh(G.box(1.8, 0.15, 0.7), pm("stone", "#5a5650", { flat: true }), { p: [0, 1.65, 0.05] }));
        g.add(mesh(G.box(0.8, 1.8, 0.5), pm("stone", "#6a645c", { flat: true }), { p: [0, 2.5, -0.05] }));
        const f = fire({ halos: [] }, 0.7);
        f.position.set(0, 0.15, 0.25);
        g.add(f);
        if (lvl === 2) for (let i = 0; i < 4; i++) g.add(mesh(G.box(0.08, 0.2, 0.02), emis("#9fd8ff", 1.2), { p: [-0.6 + i * 0.4, 1.3, 0.31] }));
      }
    } else if (id === "truhe") {
      const c = lvl === 0 ? "#6a4a30" : lvl === 1 ? "#4a4f58" : "#3a2a1e";
      g.add(mesh(G.box(0.9, 0.5, 0.55), lvl === 1 ? pm("metal", c) : pm("wood", c), { p: [0, 0.25, 0] }));
      g.add(mesh(G.cyl(0.275, 0.275, 0.9, 12, false), lvl === 1 ? pm("metal", c) : pm("wood", c), { p: [0, 0.5, 0], r: [0, 0, PI / 2], s: [1, 1, 1] }));
      g.add(mesh(G.box(0.12, 0.16, 0.05), pm("metal", "#c9a441"), { p: [0, 0.48, 0.29] }));
      if (lvl === 2) {
        for (let i = 0; i < 12; i++) g.add(mesh(G.cyl(0.06, 0.06, 0.02, 8), pm("metal", "#e0b04a", { sh: 80 }), { p: [(Math.random() - 0.5) * 1.4, 0.02, 0.4 + Math.random() * 0.4], r: [Math.random(), 0, Math.random()] }));
        g.add(R.haloSprite("#ffcf5a", 1.2, 0.4, [0, 0.6, 0.2]));
      }
    } else if (id === "staender") {
      g.add(mesh(G.cyl(0.04, 0.05, 1.7, 6), wood, { p: [0, 0.85, 0] }));
      g.add(mesh(G.box(0.7, 0.05, 0.05), wood, { p: [0, 1.5, 0] }));
      g.add(mesh(G.cyl(0.3, 0.35, 0.08, 10), wood, { p: [0, 0.04, 0] }));
      if (lvl >= 1) {
        g.add(mesh(G.sph(0.25, 12, 10), pm("metal", "#9aa4ad"), { p: [0, 1.25, 0], s: [1.2, 1, 0.8] }));
        g.add(mesh(G.cap(0.17, PI * 0.55), pm("metal", "#9aa4ad"), { p: [0, 1.6, 0] }));
        for (const s of [-1, 1]) g.add(mesh(G.cap(0.15, PI * 0.5), pm("metal", "#9aa4ad"), { p: [s * 0.33, 1.45, 0], r: [0, 0, -s * 0.4] }));
      }
      if (lvl === 2) {
        g.add(R.haloSprite(RM.accent, 1.6, 0.4, [0, 1.3, 0]));
        const sh = R.buildOffhand({ base: "schild", rarity: "episch", style: 0 }, realm);
        sh.position.set(0.55, 0.6, 0.1);
        sh.scale.setScalar(0.6);
        sh.rotation.z = 0.2;
        g.add(sh);
      }
    } else if (id === "altar") {
      g.add(mesh(G.box(1.0, 0.8, 0.5), pm("stone", "#7a766e"), { p: [0, 0.4, 0] }));
      g.add(mesh(G.box(1.1, 0.08, 0.6), pm("cloth", RM.color), { p: [0, 0.82, 0] }));
      const crest = new T.Mesh(new T.PlaneGeometry(0.6, 0.6), R.crestMat(realm, RM.color, RM.trim));
      crest.position.set(0, 1.3, -0.2);
      g.add(crest);
      for (const x of [-0.35, 0.35]) {
        g.add(mesh(G.cyl(0.04, 0.04, 0.2, 6), pm("plain", "#efe6d2"), { p: [x, 0.95, 0.1] }));
        g.add(mesh(G.sph(0.03, 6, 6), new T.MeshBasicMaterial({ color: col("#ffcf7a") }), { p: [x, 1.08, 0.1] }));
        g.add(R.haloSprite("#ffb050", 0.4, 0.8, [x, 1.08, 0.1]));
      }
      if (lvl >= 1) g.add(mesh(G.octa(0.12), emis(RM.accent, 1.2), { p: [0, 1.05, 0.05] }));
      if (lvl === 2) g.add(R.haloSprite(RM.accent, 2, 0.5, [0, 1.1, 0]));
    } else if (id === "kessel") {
      g.add(mesh(G.sph(0.4, 14, 10), pm("metal", lvl === 0 ? "#b87333" : "#2a2a30"), { p: [0, 0.45, 0], s: [1, 0.85, 1] }));
      const brew = lvl === 2 ? "#c47bff" : "#7fff5a";
      g.add(mesh(G.cyl(0.34, 0.34, 0.03, 16), emis(brew, 1), { p: [0, 0.72, 0] }));
      g.add(R.haloSprite(brew, 1.2, 0.5, [0, 0.85, 0]));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2;
        g.add(mesh(G.cyl(0.03, 0.03, 0.3, 5), pm("metal", "#2a2a30"), { p: [Math.cos(a) * 0.3, 0.12, Math.sin(a) * 0.3] }));
      }
      const f = fire({ halos: [] }, 0.4);
      f.position.y = 0.0;
      g.add(f);
    } else if (id === "trophaeen") {
      g.add(mesh(G.box(1.6, 1.1, 0.08), pm("wood", "#3a2a1e"), { p: [0, 1.6, 0] }));
      const heads = [["wolf", "#7a7470", "#ffcf5a"], ["drache", "#8a2f1f", "#ffcf5a"], ["troll", "#4f6a4a", "#ffcf5a"]];
      heads.forEach(([arch, c, a], i) => {
        const m = R.buildMonster({ arch, color: c, accent: a });
        m.update(0.01);
        const box = new T.Box3().setFromObject(m.obj);
        const s = 0.45 / Math.max(0.1, box.max.y - box.min.y);
        m.obj.scale.multiplyScalar(s);
        m.obj.position.set(-0.5 + i * 0.5, 1.35, 0.1);
        g.add(m.obj);
      });
    }
    g.userData.fid = id;
    return g;
  }
  const HOME_SPOTS = { lager: [-2.0, -1.4, 0], herd: [0.2, -2.3, 0], truhe: [-2.3, 0.9, PI / 2], staender: [2.3, -1.6, -0.4], altar: [2.4, 0.6, -PI / 2], kessel: [1.4, 1.4, 0], trophaeen: [-2.8, 0.5, PI / 2] };
  R.createHome = function (el, opts) {
    init();
    opts = opts || {};
    const renderer = makeRenderer(el, { shadows: opts.quality !== "niedrig", maxDpr: 2, exposure: 1.1 });
    const scene = new T.Scene();
    scene.environment = envMap(renderer);
    scene.background = col("#120f16");
    scene.fog = new T.Fog("#120f16", 14, 30);
    const camera = new T.PerspectiveCamera(38, 1, 0.1, 100);
    scene.add(new T.HemisphereLight("#b8c4e8", "#2a2018", 0.75));
    const key = new T.PointLight("#ffb060", 30, 14, 1.6);
    key.position.set(0.2, 2.2, -1.2);
    key.castShadow = opts.quality !== "niedrig";
    scene.add(key);
    const fill = new T.DirectionalLight("#9fb8ff", 0.9);
    fill.position.set(-4, 6, 6);
    scene.add(fill);
    let room = null;
    let hero = null;
    let state = { tier: 0, furn: {}, realm: "albion" };
    const pickables = [];
    function build() {
      if (room) scene.remove(room);
      pickables.length = 0;
      room = grp();
      const tier = state.tier;
      // Boden und Waende als aufgeschnittener Raum
      const floorM = tier === 0 ? pm("fur", "#4a5a3a") : tier === 3 ? pm("stone", "#5a564e") : pm("wood", "#5a4130");
      room.add(mesh(G.cyl(4.2, 4.4, 0.3, tier === 3 ? 12 : 4), floorM, { p: [0, -0.15, 0], r: [0, tier === 3 ? 0 : PI / 4, 0], s: tier === 3 ? 1 : [1.0, 1, 0.8] }));
      room.children[0].receiveShadow = true;
      if (tier === 0) {
        const tent = new T.Mesh(new T.ConeGeometry(4.2, 4.2, 4, 1, true, PI * 0.5, PI * 1.0), pm("cloth", "#6a5a42", { ds: true }));
        tent.position.set(0, 2.1, 0);
        tent.rotation.y = PI / 4 + PI;
        room.add(tent);
      } else if (tier === 3) {
        const wall = new T.Mesh(new T.CylinderGeometry(4.2, 4.2, 4.2, 18, 1, true, PI * 0.5, PI), tiled("stone", "#5e5a54", 6, 2, { side: T.DoubleSide }));
        wall.position.y = 2.1;
        room.add(wall);
        const win = new T.Mesh(new T.PlaneGeometry(1.0, 1.8), new T.MeshBasicMaterial({ color: col("#3a5a9a") }));
        win.position.set(0, 2.5, -4.1);
        room.add(win);
        room.add(R.haloSprite("#8fb8ff", 2.5, 0.4, [0, 2.5, -3.9]));
      } else {
        const wm = tier === 1 ? tiled("stone", "#6a665e", 3, 2) : tiled("wood", "#4a3424", 4, 2);
        room.add(mesh(G.box(6.0, 3.6, 0.3), wm, { p: [0, 1.8, -2.9] }));
        room.add(mesh(G.box(0.3, 3.6, 5.2), wm, { p: [-3.0, 1.8, -0.4] }));
        if (tier === 2) for (const x of [-2.0, 0, 2.0]) room.add(mesh(G.box(0.25, 3.6, 0.3), pm("wood", "#2a1e16"), { p: [x, 1.8, -2.7] }));
        const win = mesh(G.box(0.9, 0.8, 0.1), new T.MeshLambertMaterial({ color: col("#1a2a4a"), emissive: col("#3a5a9a"), emissiveIntensity: 0.6 }), { p: [1.6, 2.2, -2.72] });
        room.add(win);
      }
      // Teppich
      if (tier >= 1) {
        const RM = SB.data.REALMS[state.realm] || SB.data.REALMS.albion;
        room.add(mesh(G.box(2.4, 0.02, 1.6), pm("cloth", RM.dark), { p: [0, 0.01, 0.2] }));
      }
      for (const f of SB.data.FURNITURE) {
        const lvl = state.furn[f.id];
        if (lvl == null || lvl < 0) continue;
        const sp = HOME_SPOTS[f.id];
        const obj = furniture(f.id, Math.min(lvl, f.levels.length - 1), state.realm, state.hero);
        obj.position.set(sp[0], 0, sp[1]);
        obj.rotation.y = sp[2];
        room.add(obj);
        const bb = new T.Box3().setFromObject(obj);
        const hit = new T.Mesh(new T.BoxGeometry(...bb.getSize(new T.Vector3()).toArray().map((v) => v + 0.2)), new T.MeshBasicMaterial({ visible: false }));
        hit.position.copy(bb.getCenter(new T.Vector3()));
        hit.userData.fid = f.id;
        room.add(hit);
        pickables.push(hit);
      }
      room.traverse((o) => {
        if (o.isMesh) o.receiveShadow = true;
      });
      scene.add(room);
    }
    const ray = new T.Raycaster();
    const ndc = new T.Vector2();
    const canvas = renderer.domElement;
    let rot = 0;
    let goalRot = 0;
    let dragX = null;
    let moved = 0;
    canvas.addEventListener("pointerdown", (e) => {
      dragX = e.clientX;
      moved = 0;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (dragX == null) return;
      moved += Math.abs(e.clientX - dragX);
      goalRot = Math.max(-0.7, Math.min(0.7, goalRot + (e.clientX - dragX) * 0.006));
      dragX = e.clientX;
    });
    canvas.addEventListener("pointerup", (e) => {
      dragX = null;
      if (moved > 6 || !opts.onPick) return;
      const rect = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(pickables, false);
      if (hits.length) opts.onPick(hits[0].object.userData.fid);
    });
    let raf = 0;
    let last = performance.now();
    function resize() {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = w + "px";
      renderer.domElement.style.height = h + "px";
      camera.aspect = w / h;
      camera.fov = w / h < 1 ? 55 : 38;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      const t = now / 1000;
      rot += (goalRot - rot) * Math.min(1, dt * 6);
      const d = 9.5;
      camera.position.set(Math.sin(rot + 0.35) * d, 4.6, Math.cos(rot + 0.35) * d);
      camera.lookAt(0, 0.9, -0.3);
      key.intensity = 26 + Math.sin(t * 9) * 2 + Math.random() * 2;
      if (room)
        room.traverse((o) => {
          if (o.userData.flick) o.scale.y = 1 + Math.sin(t * 13 + o.userData.flick) * 0.15;
        });
      if (hero) hero.update(dt);
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);
    return {
      update(s) {
        state = Object.assign({}, state, s);
        build();
        if (s.hero) {
          if (hero) scene.remove(hero.obj);
          hero = R.buildHero(s.hero);
          hero.obj.position.set(0.2, 0, 0.6);
          hero.obj.rotation.y = 0.3;
          scene.add(hero.obj);
        }
      },
      cheer() {
        if (hero) hero.play("victory", 1.2);
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
        snapR = makeRenderer(null, { alpha: true, preserve: true, maxDpr: 1, exposure: 1.15 });
        snapScene = new T.Scene();
        snapScene.environment = envMap(snapR);
        snapScene.add(new T.HemisphereLight("#e6ecff", "#3a3028", 1.3));
        const k = new T.DirectionalLight("#fff0d8", 2.4);
        k.position.set(3, 5, 5);
        snapScene.add(k);
        const r2 = new T.DirectionalLight("#8fb8ff", 1.5);
        r2.position.set(-4, 3, -3);
        snapScene.add(r2);
        snapCam = new T.PerspectiveCamera(30, 1, 0.1, 100);
      }
      snapR.setSize(size, size, false);
      const model = R.buildFighter(desc);
      model.update(0.016);
      model.obj.rotation.y = desc.kind === "monster" ? 0.5 : 0.3;
      snapScene.add(model.obj);
      const box3 = new T.Box3().setFromObject(model.obj);
      const c = box3.getCenter(new T.Vector3());
      const sz = box3.getSize(new T.Vector3());
      let span = Math.max(sz.y, sz.x * 0.9);
      if (bust) {
        span = Math.max(sz.y * 0.42, 0.9);
        c.y = (model.headY || box3.max.y - span * 0.5) - span * 0.12;
      }
      const dist = (span / (2 * Math.tan((30 * PI) / 360))) * 1.1;
      snapCam.position.set(c.x, c.y + span * 0.06, c.z + dist + sz.z * 0.3);
      snapCam.lookAt(c.x, c.y, c.z);
      snapR.setClearColor(0x000000, 0);
      snapR.render(snapScene, snapCam);
      const url = snapR.domElement.toDataURL("image/png");
      snapScene.remove(model.obj);
      snapCache.set(key, url);
      if (snapCache.size > 400) snapCache.delete(snapCache.keys().next().value);
      return url;
    } catch (e) {
      console.warn("Portrait fehlgeschlagen", e);
      return null;
    }
  };

  /* ---------- Kampfbuehne ---------- */
  const SPECIAL_FX = {
    schildbrecher: { color: "#ffd27a", kind: "shock" },
    kehlschnitt: { color: "#ff3a3a", kind: "slash" },
    pfeilhagel: { color: "#ffe9b0", kind: "arrows" },
    sonnenlanze: { color: "#ffd27a", kind: "beam" },
    blutrausch: { color: "#ff3a2a", kind: "aura" },
    giftklinge: { color: "#7fff5a", kind: "slash" },
    frostpfeil: { color: "#9fe3ff", kind: "arrow" },
    runensturm: { color: "#9fd8ff", kind: "orbs" },
    lebenssaft: { color: "#7fffb0", kind: "roots" },
    schattentanz: { color: "#b48cff", kind: "smoke" },
    mondpfeil: { color: "#e6ecff", kind: "arrow" },
    wurzelgriff: { color: "#7fffb0", kind: "roots" },
    zermalmen: { color: "#ffb050", kind: "shock" },
    raserei: { color: "#ff5a3d", kind: "aura" },
    fluch: { color: "#c47bff", kind: "orbs" },
  };
  const SETTINGS = {
    quest: { t: 0.71, grass: "#3a5038", grass2: "#4e5a36", dirt: "#5a4c3c", rock: "#5a5650", props: "forest" },
    arena: { t: 0.6, grass: "#6a5e48", grass2: "#7a6a50", dirt: "#7a6a50", rock: "#6a645a", props: "arena" },
    dungeon: { t: 0.0, grass: "#2e2a36", grass2: "#3a3444", dirt: "#2a2630", rock: "#2a2633", props: "cave" },
    story: { t: 0.92, grass: "#34483a", grass2: "#44503a", dirt: "#4a4438", rock: "#55524c", props: "stones" },
  };
  R.createBattle = function (el, opts) {
    init();
    opts = opts || {};
    const renderer = makeRenderer(el, { maxDpr: 2, exposure: 1.15 });
    const scene = new T.Scene();
    scene.environment = envMap(renderer);
    const camera = new T.PerspectiveCamera(36, 1, 0.1, 500);
    const setting = SETTINGS[opts.setting] ? opts.setting : "quest";
    const S = SETTINGS[setting];
    const rng = R.rng(setting.length * 17 + 3);
    const sky = skyDome();
    scene.add(sky);
    scene.fog = new T.Fog("#22283a", 22, 90);
    const hemi = new T.HemisphereLight("#d8e2ee", "#3a3028", 1);
    scene.add(hemi);
    const sun = new T.DirectionalLight("#ffe9c8", 2);
    sun.position.set(4, 9, 6);
    scene.add(sun);
    const front = new T.DirectionalLight("#fff4e6", setting === "dungeon" ? 0.9 : 1.1);
    front.position.set(0, 4, 12);
    scene.add(front);
    const N = nightMats();
    const info = R.dayInfo(setting === "dungeon" ? 0.02 : opts.dayTime != null ? opts.dayTime : S.t);
    // Auftraege und Chronik spielen in der Landschaft der eigenen Heimatinsel
    const TH = opts.realm && (setting === "quest" || setting === "story") ? R.realmTheme(opts.realm) : null;
    const P = palette(info, TH ? TH.sky : null);
    if (setting === "dungeon") {
      const tint = col(opts.tint || "#8f7cff");
      sky.userData.recolor(col("#05040a"), tint.clone().multiplyScalar(0.18), col("#020205"));
      scene.fog.color.copy(tint.clone().multiplyScalar(0.12));
      hemi.color.copy(tint.clone().lerp(col("#ffffff"), 0.5));
      hemi.groundColor.set("#0a0810");
      hemi.intensity = 0.55;
      sun.color.copy(tint.clone().lerp(col("#ffffff"), 0.4));
      sun.intensity = 0.9;
    } else {
      sky.userData.recolor(P.top, P.bot, col("#0a0d18").lerp(P.fog, 0.4));
      scene.fog.color.copy(P.fog);
      hemi.color.copy(P.hemiSky);
      hemi.groundColor.copy(P.hemiGround);
      hemi.intensity = P.hemiI + 0.25;
      sun.color.copy(P.sun);
      sun.intensity = P.sunI + 0.3;
    }
    N.win.emissiveIntensity = 0.3 + info.night;
    const stars = starField(rng, 500);
    stars.material.opacity = setting === "dungeon" ? 0 : Math.max(0, info.night - 0.2);
    scene.add(stars);
    const aur = aurora();
    scene.add(aur);
    if (setting !== "dungeon") {
      const sea = cloudSea(-16, 260);
      sea.material.color.copy(P.bot);
      scene.add(sea);
    }
    const GD = TH ? TH.ground : S;
    const stage = island(8, 7, rng, { grass: GD.grass, grass2: GD.grass2, dirt: GD.dirt, rock: GD.rock, plaza: [0, 0.4, 6], hills: 0.6, vineGlow: setting === "dungeon" ? opts.tint || "#8f7cff" : TH ? TH.ground.vineGlow : "#7fffc8" });
    scene.add(stage);
    const flickers = [];
    const extras = [];
    if (S.props === "arena") {
      const wall = new T.CylinderGeometry(9, 9.4, 2.6, 40, 1, true, PI * 0.42, PI * 1.16);
      scene.add(mesh(wall, tiled("stone", "#6a645a", 8, 1, { side: T.DoubleSide, flatShading: true }), { p: [0, 1.3, 0] }));
      const realms = ["albion", "midgard", "hibernia"];
      for (let i = 0; i < 3; i++) {
        const x = -6 + i * 6;
        const RM = SB.data.REALMS[realms[i]];
        const p = grp([x, 0, -6.5]);
        p.add(mesh(G.cyl(0.1, 0.12, 6, 6), pm("metal", "#2a2a30"), { p: [0, 3, 0] }));
        const bn = new T.Mesh(new T.PlaneGeometry(1.4, 2.4, 1, 6), R.crestMat(realms[i], RM.color, RM.trim));
        bn.position.set(0.75, 4.6, 0);
        p.add(bn);
        extras.push(bn);
        scene.add(p);
      }
      for (const x of [-7, 7]) {
        const br = grp([x, 0, -2]);
        br.add(mesh(G.cyl(0.1, 0.14, 1.6, 6), pm("metal", "#2a2a30"), { p: [0, 0.8, 0] }));
        br.add(mesh(G.cyl(0.45, 0.22, 0.4, 8), pm("metal", "#2a2a30"), { p: [0, 1.7, 0] }));
        const f = fire(N, 1.3);
        f.position.y = 1.85;
        br.add(f);
        const pl = new T.PointLight("#ff9a3d", 14, 12, 1.6);
        pl.position.set(0, 2.4, 0.5);
        br.add(pl);
        flickers.push(pl);
        scene.add(br);
      }
    } else if (S.props === "cave") {
      const tint = opts.tint || "#8f7cff";
      for (const x of [-6, 6]) {
        const p = grp([x, 0, -3.5]);
        p.add(mesh(G.box(1.0, 5.5, 1.0), pm("stone", "#2e2a38", { flat: true }), { p: [0, 2.75, 0] }));
        p.add(mesh(G.cyl(0.3, 0.2, 0.3, 6), pm("metal", "#2a2a30"), { p: [0, 4.2, 0.6] }));
        const f = fire(N, 0.9);
        f.position.set(0, 4.35, 0.6);
        p.add(f);
        const pl = new T.PointLight("#ff9a3d", 14, 14, 1.5);
        pl.position.set(0, 4.6, 1);
        p.add(pl);
        flickers.push(pl);
        scene.add(p);
      }
      for (let i = 0; i < 8; i++) {
        const c = crystals(rng, tint);
        c.position.set(-7 + rng() * 14, 0, -2.5 - rng() * 3.5);
        c.scale.setScalar(1 + rng());
        scene.add(c);
      }
      for (let i = 0; i < 10; i++) scene.add(mesh(G.cone(0.5 + rng() * 0.6, 3 + rng() * 4, 6), pm("stone", "#26222e", { flat: true }), { p: [-10 + rng() * 20, 10 + rng() * 2, -5 - rng() * 6], r: [PI, 0, 0] }));
    } else if (S.props === "stones") {
      for (let i = 0; i < 7; i++) {
        const a = PI * 0.15 + (i / 6) * PI * 0.7;
        const s = standingStone(rng, 2.4 + rng(), ["#e8c35a", "#9fd8ff", "#7fffb0"][i % 3]);
        s.position.set(-Math.cos(a) * 7.2, 0, -Math.sin(a) * 5.5);
        s.rotation.y = a;
        scene.add(s);
      }
    } else {
      // erzeugte Requisiten des Reiches (Meshy-Strecke, src/r3d-rigged.js) statt der gebauten, ein Wahrzeichen hinten in
      // der Mitte zwischen den Kaempfern; je Dekomodell hoechstens zwei Stueck, damit sich nichts sichtbar wiederholt
      const GP = TH && R.rigged && R.rigged.propsFor ? R.rigged.propsFor(TH.id) : null;
      const gen = (list, s) => {
        const o = R.rigged.prop(list[Math.floor(rng() * list.length) % list.length]);
        o.scale.setScalar(s);
        o.rotation.y = rng() * PI * 2;
        return o;
      };
      if (GP && GP.wahrzeichen.length) {
        const w = R.rigged.prop(GP.wahrzeichen[0]);
        w.position.set(0, 0, -5.6);
        w.rotation.y = 0.2;
        scene.add(w);
      }
      for (let i = 0; i < 7; i++) {
        if (GP && GP.wahrzeichen.length && i === 3) continue;
        const tr = GP && GP.baum.length ? gen(GP.baum, 0.8 + rng() * 0.3) : TH ? R.realmTree(TH.id, rng) : i % 3 === 0 ? pine(rng) : gnarledTree(rng);
        tr.position.set(-7 + i * 2.3 + rng(), 0, -4 - rng() * 2);
        scene.add(tr);
      }
      for (let i = 0; i < (GP && GP.deko.length ? Math.min(6, 2 * GP.deko.length) : 6); i++) {
        const s = GP && GP.deko.length ? gen(GP.deko, 0.8 + rng() * 0.4) : TH ? R.realmDeco(TH.id, rng, i) : i % 2 ? shrooms(rng) : rock(rng);
        s.position.set(-6 + rng() * 12, 0.05, -1.5 - rng() * 2.5);
        scene.add(s);
      }
    }
    const weather = TH ? R.realmWeather(TH.weather, rng, false) : null;
    if (weather) {
      weather.scale.setScalar(0.6);
      scene.add(weather);
    }
    const flies = fireflies(rng, 50, 8, 0.4, 3.5, setting === "dungeon" ? opts.tint || "#c47bff" : "#d9ff8a");
    scene.add(flies);
    const wisps = mistWisps(rng, 8, 9, 0.2);
    scene.add(wisps);

    // Kaempfer
    const overlay = document.createElement("div");
    overlay.className = "battle-fx";
    el.appendChild(overlay);
    const portrait = el.clientWidth < el.clientHeight;
    const sep = portrait ? 2.5 : 2.8;
    function makeFighter(desc, i) {
      const m = R.buildFighter(desc);
      const side = i === 0 ? -1 : 1;
      const home = new T.Vector3(side * sep, 0, 0.4);
      m.obj.position.copy(home);
      m.obj.rotation.y = side < 0 ? PI / 2 - 0.5 : -PI / 2 + 0.5;
      const box3 = new T.Box3().setFromObject(m.obj);
      const hgt = box3.max.y - box3.min.y;
      if (hgt > 3.8) {
        const s = 3.8 / hgt;
        m.obj.scale.multiplyScalar(s);
        m.headY *= s;
      }
      const sh = new T.Mesh(new T.CircleGeometry(1, 24), basic("#000000", 0.3));
      sh.rotation.x = -PI / 2;
      sh.position.set(home.x, 0.03, home.z);
      sh.scale.setScalar(desc.kind === "monster" && (desc.arch === "drache" || desc.arch === "golem" || desc.arch === "troll" || desc.arch === "spinne") ? 1.5 : 0.9);
      scene.add(sh);
      scene.add(m.obj);
      return { m, home, side, shadow: sh, desc };
    }
    const F = [makeFighter(opts.left, 0), makeFighter(opts.right, 1)];

    let speed = 1;
    let w = 1;
    let h = 1;
    let shake = 0;
    let zoom = 0;
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
      const halfW = sep + (portrait ? 1.2 : 1.7);
      const tanH = Math.tan((camera.fov * PI) / 360) * camera.aspect;
      camBase.z = Math.max(9.0, halfW / tanH);
      camBase.y = 2.7 + (camBase.z - 9) * 0.1;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let raf = 0;
    let last = performance.now();
    const fx = [];
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      const t = now / 1000;
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        tw.t += dt * speed;
        const u = Math.max(0, Math.min(1, tw.t / tw.dur));
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
        if (f.aura) f.aura.position.copy(f.m.obj.position);
        if (f.bubble) {
          f.bubble.position.x = f.m.obj.position.x;
          f.bubble.position.z = f.m.obj.position.z;
          f.bubble.visible = f.m.obj.visible;
        }
        if (f.poisonFx) {
          f.poisonFx.position.set(f.m.obj.position.x, (f.m.headY || 1.8) + 0.2, f.m.obj.position.z);
          f.poisonFx.rotation.y += dt * 2;
        }
      }
      for (const c of flickers) c.intensity = 12 + Math.sin(t * 13 + c.position.x) * 2 + Math.random() * 2;
      for (const e of extras) e.rotation.y = Math.sin(t * 2 + e.position.x) * 0.2;
      scene.traverse((o) => {
        if (o.userData.flick) o.scale.y = 1 + Math.sin(t * 13 + o.userData.flick) * 0.15;
      });
      flies.userData.update(t, setting === "dungeon" ? 0.9 : 0.3 + 0.6 * info.night);
      if (weather) weather.userData.update(dt, t, info);
      wisps.userData.update(dt, scene.fog.color, 0.12);
      aur.userData.update(t, setting === "dungeon" ? 0 : smooth(0.5, 0.95, info.night) * 0.7);
      camera.position.copy(camBase);
      camera.position.z -= zoom * 1.6;
      camera.position.y -= zoom * 0.3;
      zoom = Math.max(0, zoom - dt * 1.2);
      if (shake > 0) {
        shake -= dt;
        camera.position.x += (Math.random() - 0.5) * 0.28;
        camera.position.y += (Math.random() - 0.5) * 0.28;
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
    function spark(color, size) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: dot(), color: col(color), transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      s.scale.setScalar(size || 0.3);
      return s;
    }
    function burst(pos, color, n, spread, up) {
      const parts = [];
      for (let i = 0; i < n; i++) {
        const p = spark(color, 0.2 + Math.random() * 0.25);
        p.position.copy(pos);
        p.userData.v = new T.Vector3((Math.random() - 0.5) * spread, (up || 0) + Math.random() * spread, (Math.random() - 0.5) * spread);
        scene.add(p);
        parts.push(p);
      }
      tween(0.55, (u) => {
        for (const p of parts) {
          p.position.addScaledVector(p.userData.v, 0.03);
          p.userData.v.y -= up ? 0 : 0.08;
          p.material.opacity = 1 - u;
        }
        if (u >= 1) parts.forEach((p) => scene.remove(p));
      });
    }
    function rising(f, color, n) {
      const parts = [];
      for (let i = 0; i < n; i++) {
        const p = spark(color, 0.18 + Math.random() * 0.2);
        p.position.set(f.m.obj.position.x + (Math.random() - 0.5) * 1.0, Math.random() * 0.6, f.m.obj.position.z + (Math.random() - 0.5) * 1.0);
        p.userData.v = 1.5 + Math.random() * 1.5;
        scene.add(p);
        parts.push(p);
      }
      return tween(0.9, (u) => {
        for (const p of parts) {
          p.position.y += p.userData.v * 0.02;
          p.material.opacity = Math.sin(u * PI);
        }
        if (u >= 1) parts.forEach((p) => scene.remove(p));
      });
    }
    function ring(f, color, big) {
      const r = new T.Mesh(G.torus(0.6, 0.06, PI * 2, 6, 40), glow(color, 0.85).clone());
      r.rotation.x = PI / 2;
      r.position.set(f.m.obj.position.x, 0.12, f.m.obj.position.z);
      scene.add(r);
      return tween(big ? 0.6 : 0.45, (u) => {
        r.scale.setScalar(1 + u * (big ? 5 : 3));
        r.material.opacity = 0.85 * (1 - u);
        if (u >= 1) scene.remove(r);
      });
    }
    function slash(f, color, flip) {
      const arc = new T.Mesh(G.torus(0.9, 0.05, PI * 0.9, 4, 24), new T.MeshBasicMaterial({ color: col(color), transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      arc.position.set(f.m.obj.position.x, (f.m.headY || 1.8) * 0.6, f.m.obj.position.z + 0.6);
      arc.rotation.set(0, 0, flip ? 2.4 : -0.6);
      scene.add(arc);
      return tween(0.25, (u) => {
        arc.rotation.z += (flip ? -1 : 1) * 0.12;
        arc.material.opacity = 1 - u;
        arc.scale.setScalar(0.8 + u * 0.5);
        if (u >= 1) scene.remove(arc);
      });
    }
    function roots(f, color) {
      const g = grp([f.m.obj.position.x, 0, f.m.obj.position.z]);
      const rm = pm("bark", "#4a3a2a");
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * PI * 2;
        const r = mesh(G.cone(0.1, 1.4, 5), rm, { p: [Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] });
        g.add(r);
      }
      g.add(R.haloSprite(color, 2.5, 0.6, [0, 0.4, 0]));
      g.scale.set(1, 0.01, 1);
      scene.add(g);
      return tween(0.9, (u) => {
        g.scale.y = u < 0.3 ? u / 0.3 : u > 0.75 ? (1 - u) / 0.25 : 1;
        if (u >= 1) scene.remove(g);
      });
    }
    function beam(A, Bf, color) {
      const from = new T.Vector3(A.m.obj.position.x, (A.m.headY || 1.8) * 0.75, A.m.obj.position.z);
      const to = new T.Vector3(Bf.m.obj.position.x, (Bf.m.headY || 1.8) * 0.6, Bf.m.obj.position.z);
      const len = from.distanceTo(to);
      const bm = new T.Mesh(G.cyl(0.12, 0.12, 1, 10, true), new T.MeshBasicMaterial({ color: col(color), transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      bm.position.copy(from).lerp(to, 0.5);
      bm.scale.set(1, len, 1);
      bm.lookAt(to);
      bm.rotateX(PI / 2);
      scene.add(bm);
      return tween(0.4, (u) => {
        bm.scale.x = bm.scale.z = 1 + Math.sin(u * PI) * 1.5;
        bm.material.opacity = Math.sin(u * PI);
        if (u >= 1) scene.remove(bm);
      });
    }
    function setAura(f, color) {
      if (f.aura) scene.remove(f.aura);
      f.aura = null;
      if (!color) return;
      const a = grp();
      a.add(R.haloSprite(color, 3.4, 0.35, [0, 1.2, 0]));
      a.add(mesh(G.torus(0.8, 0.03, PI * 2, 4, 40), glow(color, 0.6), { p: [0, 0.08, 0], r: [PI / 2, 0, 0] }));
      scene.add(a);
      f.aura = a;
    }
    function setPoison(f, on) {
      if (f.poisonFx) scene.remove(f.poisonFx);
      f.poisonFx = null;
      if (!on) return;
      const g = grp();
      for (let i = 0; i < 4; i++) {
        const s = spark("#7fff5a", 0.18);
        const a = (i / 4) * PI * 2;
        s.position.set(Math.cos(a) * 0.35, Math.sin(i) * 0.1, Math.sin(a) * 0.35);
        g.add(s);
      }
      scene.add(g);
      f.poisonFx = g;
    }
    function stunStars(f) {
      const s = grp();
      for (let i = 0; i < 3; i++) s.add(mesh(G.octa(0.1), emis("#ffe45a", 1.3), { p: [Math.cos((i * PI * 2) / 3) * 0.45, 0, Math.sin((i * PI * 2) / 3) * 0.45] }));
      s.add(R.haloSprite("#ffe45a", 0.8, 0.4));
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
      const start = new T.Vector3(A.m.obj.position.x + A.side * -0.6, (A.m.headY || 1.8) * 0.68, A.m.obj.position.z);
      const end = new T.Vector3(Bf.m.obj.position.x, (Bf.m.headY || 1.8) * 0.6, Bf.m.obj.position.z);
      let obj;
      if (kind === "arrow" || kind === "spear") {
        obj = grp();
        const L = kind === "spear" ? 1.6 : 1.0;
        obj.add(mesh(G.cyl(0.022, 0.022, L, 5), pm("wood", "#c9b89a"), { r: [0, 0, PI / 2] }));
        obj.add(mesh(G.cone(0.06, 0.2, 5), pm("metal", "#c8ced6"), { p: [L / 2 + 0.08, 0, 0], r: [0, 0, -PI / 2] }));
        obj.add(spark(color, 0.6));
        if (A.side > 0) obj.rotation.y = PI;
      } else {
        obj = grp();
        obj.add(mesh(G.sph(kind === "star" ? 0.3 : 0.18, 12, 10), new T.MeshBasicMaterial({ color: col("#ffffff") })));
        obj.add(spark(color, kind === "star" ? 1.6 : 1.0));
      }
      obj.position.copy(start);
      scene.add(obj);
      const trail = [];
      await tween(kind === "arrow" ? 0.26 : 0.36, (u) => {
        obj.position.lerpVectors(start, end, u);
        obj.position.y += Math.sin(u * PI) * (kind === "arrow" || kind === "spear" ? 0.5 : 0.3);
        if (Math.random() < 0.7) {
          const p = spark(color, kind === "arrow" ? 0.15 : 0.35);
          p.position.copy(obj.position);
          scene.add(p);
          trail.push(p);
        }
        trail.forEach((p) => (p.material.opacity *= 0.88));
      });
      scene.remove(obj);
      trail.forEach((p) => scene.remove(p));
      burst(end, color, kind === "star" ? 18 : 9, kind === "star" ? 3 : 1.6);
    }
    const hp = [opts.hp ? opts.hp[0] : 1, opts.hp ? opts.hp[1] : 1];
    const report = (side, ev, idx) => {
      if (opts.onImpact) opts.onImpact(side, hp[side], ev, idx);
    };
    // Talente im Kampf: Schutzkugel, Beschriftungen fuer Treffer mit Talentwirkung
    const TAL_COLOR = { ward: "#9fd8ff", secondWind: "#7fffb0", vanish: "#b48cff", purge: "#fff6c8" };
    const TAG_TEXT = { double: "Doppelschlag!", opener: "Sturmangriff!", assassinate: "Meucheln!", execute: "Gnadenstoß!", afterStun: "Nachsetzen!" };
    function setBubble(f, on) {
      if (f.bubble) scene.remove(f.bubble);
      f.bubble = null;
      if (!on) return;
      const hgt = (f.m.headY || 1.8) + 0.4;
      const g = grp([f.m.obj.position.x, hgt / 2, f.m.obj.position.z]);
      const sm = new T.MeshBasicMaterial({ color: col("#9fd8ff"), transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
      g.add(new T.Mesh(G.sph(1, 24, 16), sm));
      g.add(mesh(G.torus(0.98, 0.02, PI * 2, 4, 48), glow("#cfeaff", 0.7), { r: [PI / 2, 0, 0] }));
      g.scale.set(0.95, hgt / 2, 0.95);
      g.userData.mat = sm;
      scene.add(g);
      f.bubble = g;
    }
    function bubbleHit(f, left) {
      if (!f.bubble) return;
      const m = f.bubble.userData.mat;
      tween(0.3, (u) => (m.opacity = 0.18 + 0.4 * Math.sin(u * PI)));
      if (left <= 0) {
        const b = f.bubble;
        f.bubble = null;
        burst(b.position.clone(), "#cfeaff", 18, 2.2);
        tween(0.3, (u) => {
          b.scale.multiplyScalar(1.04);
          m.opacity = 0.3 * (1 - u);
          if (u >= 1) scene.remove(b);
        });
      }
    }
    function lightColumn(f, color) {
      const c = new T.Mesh(G.cyl(0.7, 0.7, 4, 16, true), new T.MeshBasicMaterial({ color: col(color), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      c.position.set(f.m.obj.position.x, 2, f.m.obj.position.z);
      scene.add(c);
      return tween(0.9, (u) => {
        c.material.opacity = 0.2 * Math.sin(u * PI);
        c.scale.set(1 - u * 0.4, 1, 1 - u * 0.4);
        if (u >= 1) scene.remove(c);
      });
    }
    async function playTalent(ev) {
      const A = F[ev.a];
      const color = TAL_COLOR[ev.id] || "#ffd27a";
      banner(ev.name, A.side);
      ring(A, color, true);
      rising(A, color, 14);
      if (opts.sfx) opts.sfx(ev.id === "secondWind" ? "heal" : "chime");
      if (ev.id === "ward") {
        A.wardLeft = ev.ward;
        setBubble(A, true);
        floatText(A, "Barriere " + SB.util.fmt(ev.ward), "talent");
      } else if (ev.id === "secondWind") {
        lightColumn(A, color);
        hp[ev.a] = ev.hp[ev.a];
        floatText(A, "+" + SB.util.fmt(ev.heal), "heal");
        report(ev.a, ev, -1);
      } else if (ev.id === "vanish") {
        burst(A.m.obj.position.clone().setY(1), color, 22, 1.8, 0.4);
        A.m.obj.visible = false;
        await wait(0.35);
        A.m.obj.visible = true;
        A.m.play("evade", 0.4);
        floatText(A, "Verschwunden!", "evade");
      } else if (ev.id === "purge") {
        lightColumn(A, color);
        clearStars(A);
        floatText(A, "Gereinigt!", "talent");
      }
      await wait(0.75);
    }

    async function impact(ev, A, Bf, hit, idx) {
      const def = 1 - ev.a;
      if (hit.tags) for (const t of hit.tags) if (TAG_TEXT[t]) floatText(t === "double" || t === "opener" || t === "assassinate" ? A : Bf, t === "execute" && A.m.arch === "magier" ? "Vernichtung!" : TAG_TEXT[t], "talent");
      if (hit.absorbed) {
        Bf.wardLeft = (Bf.wardLeft || 0) - hit.absorbed;
        floatText(Bf, "Absorbiert " + SB.util.fmt(hit.absorbed), "block");
        bubbleHit(Bf, Bf.wardLeft);
      }
      if (hit.res === "evade") {
        const dx = Bf.side * 0.7;
        Bf.m.play("evade", 0.4);
        tween(0.4, (u) => (Bf.m.obj.position.x = Bf.home.x + Math.sin(u * PI) * dx));
        floatText(Bf, "Ausgewichen!", "evade");
        if (opts.sfx) opts.sfx("evade");
      } else if (hit.res === "block") {
        Bf.m.play("block", 0.4);
        burst(new T.Vector3(Bf.m.obj.position.x - Bf.side * 0.6, 1.4, Bf.m.obj.position.z), "#ffe27a", 12, 2);
        floatText(Bf, "Geblockt!", "block");
        if (opts.sfx) opts.sfx("block");
      } else {
        hp[def] = Math.max(0, hp[def] - hit.dmg);
        Bf.m.play("hit", 0.35);
        Bf.m.flash(0.08);
        tween(0.3, (u) => (Bf.m.obj.position.x = Bf.home.x + Bf.side * Math.sin(u * PI) * (hit.res === "crit" ? 0.6 : 0.3)));
        floatText(Bf, SB.util.fmt(hit.dmg), hit.res === "crit" ? "crit" : "dmg");
        if (hit.res === "crit") {
          shake = 0.25;
          zoom = Math.max(zoom, 0.6);
          floatText(Bf, "Kritisch!", "critlabel");
        }
        burst(new T.Vector3(Bf.m.obj.position.x, (Bf.m.headY || 1.8) * 0.6, Bf.m.obj.position.z), hit.res === "crit" ? "#ffb13b" : "#ffe8d0", hit.res === "crit" ? 16 : 8, 1.8);
        if (opts.sfx) opts.sfx(hit.res === "crit" ? "crit" : "hit");
      }
      report(def, ev, idx);
    }

    async function play(ev) {
      const A = F[ev.a];
      const Bf = F[1 - ev.a];
      if (ev.kind === "talent") {
        await playTalent(ev);
        if (ev.hp) {
          hp[0] = ev.hp[0];
          hp[1] = ev.hp[1];
        }
        return;
      }
      if (ev.kind === "counter") {
        floatText(A, ev.name + "!", "talent");
        ring(A, "#ffe27a", false);
      }
      if (ev.kind === "dot") {
        hp[ev.a] = ev.hp ? ev.hp[ev.a] : Math.max(0, hp[ev.a] - ev.dmg);
        A.m.play("hit", 0.35);
        rising(A, "#7fff5a", 8);
        floatText(A, "-" + SB.util.fmt(ev.dmg), "poison");
        if (opts.sfx) opts.sfx("poison");
        report(ev.a, ev, 0);
        if (ev.hp && ev.hp[ev.a] <= 0) setPoison(A, false);
        await wait(0.55);
        return;
      }
      if (ev.kind === "stun") {
        floatText(A, "Betäubt!", "stun");
        A.m.play("hit", 0.4);
        await wait(0.7);
        clearStars(A);
        return;
      }
      const special = ev.kind === "special";
      const SFX = special ? SPECIAL_FX[ev.sp] || { color: A.m.projColor || "#ffd25a", kind: "shock" } : null;
      if (special) {
        banner(ev.spName || "Spezialangriff", A.side);
        ring(A, SFX.color, true);
        rising(A, SFX.color, 14);
        zoom = 0.5;
        if (opts.sfx) opts.sfx("special");
        if (SFX.kind === "aura") setAura(A, SFX.color);
        await wait(0.4);
      }
      const isHero = A.desc.kind !== "monster";
      const wb = A.m.weaponBase;
      const bowLike = isHero && (wb === "bogen" || wb === "armbrust" || wb === "speer");
      const spell = (isHero && A.m.arch === "magier") || (!isHero && A.m.ranged);
      if (bowLike || spell) {
        for (let i = 0; i < ev.hits.length; i++) {
          A.m.play(bowLike ? "shoot" : "cast", 0.5);
          await wait(bowLike ? 0.3 : 0.3);
          if (opts.sfx) opts.sfx(bowLike ? "bow" : "spell");
          if (special && SFX.kind === "beam") {
            await beam(A, Bf, SFX.color);
          } else if (special && SFX.kind === "roots") {
            roots(Bf, SFX.color);
            await wait(0.35);
          } else {
            const kind = bowLike ? (wb === "speer" ? "spear" : "arrow") : special && SFX.kind === "orbs" ? "star" : "orb";
            await projectile(A, Bf, kind, special ? SFX.color : A.m.projColor || "#c47bff");
          }
          await impact(ev, A, Bf, ev.hits[i], i);
          await wait(ev.hits.length > 1 ? 0.1 : 0.28);
        }
      } else {
        const target = Bf.home.x - Bf.side * (Bf.desc.kind === "monster" ? 1.9 : 1.5);
        const from = A.home.x;
        if (special && SFX.kind === "smoke") {
          burst(A.m.obj.position.clone().setY(1), SFX.color, 16, 1.5, 0.5);
          A.m.obj.visible = false;
          await wait(0.15);
          A.m.obj.position.x = target;
          A.m.obj.visible = true;
          burst(A.m.obj.position.clone().setY(1), SFX.color, 16, 1.5, 0.5);
        } else {
          A.m.play(special && ev.sp === "zermalmen" ? "special" : "walk", 0.3);
          await tween(0.26, (u) => (A.m.obj.position.x = from + (target - from) * u));
        }
        for (let i = 0; i < ev.hits.length; i++) {
          A.m.play(special && i === 0 ? "special" : "attack", special ? 0.5 : 0.42);
          if (opts.sfx) opts.sfx("swing");
          await wait(0.22);
          if (special && (SFX.kind === "slash" || SFX.kind === "aura")) slash(Bf, SFX.color, i % 2);
          else if (special && SFX.kind === "shock") {
            ring(Bf, SFX.color, true);
            shake = 0.3;
          } else if (special && SFX.kind === "roots") roots(Bf, SFX.color);
          else slash(Bf, "#ffffff", i % 2);
          await impact(ev, A, Bf, ev.hits[i], i);
          await wait(0.16);
        }
        await tween(0.26, (u) => (A.m.obj.position.x = target + (from - target) * u));
      }
      if (ev.heal) {
        hp[ev.a] = ev.hp ? ev.hp[ev.a] : hp[ev.a] + ev.heal;
        rising(A, "#7fffb0", 16);
        floatText(A, "+" + SB.util.fmt(ev.heal), "heal");
        if (opts.sfx) opts.sfx("heal");
        report(ev.a, ev, -1);
      }
      if (ev.lifesteal) {
        hp[ev.a] = ev.hp ? ev.hp[ev.a] : hp[ev.a] + ev.lifesteal;
        rising(A, "#ff7a8a", 8);
        floatText(A, "+" + SB.util.fmt(ev.lifesteal), "heal");
        report(ev.a, ev, -1);
      }
      if (ev.poison) {
        floatText(Bf, "Vergiftet!", "poison");
        setPoison(Bf, true);
      }
      if (ev.dodge) floatText(A, "Im Schatten", "evade");
      if (ev.stun) {
        floatText(Bf, "Betäubt!", "stun");
        stunStars(Bf);
      }
      if (ev.hp) {
        hp[0] = ev.hp[0];
        hp[1] = ev.hp[1];
      }
      await wait(0.15);
    }

    const api = {
      _F: F,
      _scene: scene,
      play,
      setSpeed(s) {
        speed = s;
      },
      // Naechster Gegner einer Mehrfach-Begegnung
      async nextFoe(desc, foeHp, heroHp) {
        const old = F[1];
        clearStars(old);
        setBubble(old, false);
        setBubble(F[0], false);
        F[0].wardLeft = 0;
        setAura(old, null);
        setPoison(old, false);
        setPoison(F[0], false);
        setAura(F[0], null);
        await tween(0.35, (u) => {
          old.m.obj.position.y = -u * 0.6;
          old.m.obj.scale.setScalar(Math.max(0.01, 1 - u));
        });
        scene.remove(old.m.obj);
        scene.remove(old.shadow);
        const nf = makeFighter(desc, 1);
        F[1] = nf;
        hp[1] = foeHp || 1;
        const tx = nf.home.x;
        nf.m.obj.position.x = tx + 6;
        nf.m.play("walk", 0.7);
        await tween(0.7, (u) => (nf.m.obj.position.x = tx + 6 * (1 - u)));
        nf.m.play("idle");
        F[0].m.play("idle");
        ring(nf, "#ffffff");
        if (heroHp != null && heroHp > hp[0]) {
          floatText(F[0], "+" + SB.util.fmt(Math.round(heroHp - hp[0])), "heal");
          rising(F[0], "#7fffb0", 10);
        }
        if (heroHp != null) hp[0] = heroHp;
      },
      async finish(winner) {
        const W = F[winner];
        const L = F[1 - winner];
        clearStars(L);
        setPoison(L, false);
        setAura(L, null);
        L.m.play("defeat", 0.9);
        if (opts.sfx) opts.sfx("ko");
        await wait(0.6);
        W.m.play("victory", 1.4);
        burst(new T.Vector3(W.m.obj.position.x, 2.2, W.m.obj.position.z), "#ffd25a", 24, 3);
        await wait(1.2);
      },
      dispose() {
        cancelAnimationFrame(raf);
        ro.disconnect();
        overlay.remove();
        killRenderer(renderer);
      },
    };
    R._lastBattle = api;
    return api;
  };
})();
