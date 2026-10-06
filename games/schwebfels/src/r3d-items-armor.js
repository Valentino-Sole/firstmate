/* Helden von Schwebfels - feste Ruestungsteile und Schmuck (Version 5) nach den Tafeln 10 bis 18:
   Schilde, Wurfmesser am Guertel, Koecher, Magierfokus, feste Kopfteile (Helme, Masken, Kappen, Krone,
   Sternenspange) und Schmuck (Amulett, Ring, Talisman). Seltenheitsstufen wie bei den Waffen.
   Schild: Flaeche nach +z, oben +y, Ursprung in der Mitte. Koecher: Achse +y, Oeffnung oben.
   Kopfteile: am Grundkopf gebaut (Schaedelmitte 0, 1.885, 0.068), im Spiel je Volk verschoben und skaliert. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const R = (SB.R3D = SB.R3D || {});
  const IT = R.items;
  if (!IT || !IT.wk) return;
  const { lathe, tube, slab, gem, ring, box, sphere, at } = IT.kit;
  const W = IT.wk;
  const motif = IT.motif;
  const F = IT.forms;
  const PI = Math.PI;
  let T = null;
  const form = (fn) =>
    function (kit, v, r, c, vis) {
      T = R.T();
      return fn(kit, v | 0, r | 0, c || "midgard", vis || {});
    };
  const cl = (x, a, b) => Math.max(a == null ? 0 : a, Math.min(b == null ? 1 : b, x));

  /* ---------- Bausteine ---------- */
  // Gewoelbte Platte aus einem sternfoermigen Umriss: Vorderseite bei bend(x, y), Rueckseite thick dahinter
  function plate(out0, thick, bend, rings) {
    let area = 0;
    for (let i = 0; i < out0.length; i++) {
      const a = out0[i];
      const b = out0[(i + 1) % out0.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    const out = area < 0 ? out0.slice().reverse() : out0;
    const n = out.length;
    const K = rings || 6;
    let cx = 0;
    let cy = 0;
    for (const p of out) {
      cx += p[0] / n;
      cy += p[1] / n;
    }
    const pos = [];
    const uv = [];
    const idx = [];
    const V = (x, y, z) => {
      pos.push(x, y, z);
      uv.push(x * 1.2 + 0.5, y * 1.2 + 0.5);
      return pos.length / 3 - 1;
    };
    const rimF = [];
    const rimB = [];
    for (const side of [1, -1]) {
      const off = side < 0 ? -thick : 0;
      const base = pos.length / 3;
      const c0 = V(cx, cy, bend(cx, cy) + off);
      for (let k = 1; k <= K; k++)
        for (let i = 0; i < n; i++) {
          const t = k / K;
          const x = cx + (out[i][0] - cx) * t;
          const y = cy + (out[i][1] - cy) * t;
          V(x, y, bend(x, y) + off);
        }
      const id = (k, i) => (k === 0 ? c0 : base + 1 + (k - 1) * n + (i % n));
      for (let k = 0; k < K; k++)
        for (let i = 0; i < n; i++) {
          const a = id(k, i);
          const b = id(k, i + 1);
          const c = id(k + 1, i);
          const d = id(k + 1, i + 1);
          if (k === 0) {
            if (side > 0) idx.push(a, c, d);
            else idx.push(a, d, c);
          } else if (side > 0) idx.push(a, c, d, a, d, b);
          else idx.push(a, d, c, a, b, d);
        }
      for (let i = 0; i < n; i++) (side > 0 ? rimF : rimB).push([out[i][0], out[i][1], bend(out[i][0], out[i][1]) + off]);
    }
    // Randflaeche mit eigenen Ecken (harte Kante)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const f0 = V(...rimF[i]);
      const b0 = V(...rimB[i]);
      const f1 = V(...rimF[j]);
      const b1 = V(...rimB[j]);
      idx.push(f0, b0, f1, f1, b0, b1);
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return { geo: g, out, cx, cy };
  }
  // Geschlossener Ring entlang eines Umrisses (Schildrand, Rahmen)
  function loop(kit, cls, pts, rad, zf) {
    const p3 = pts.map((p) => [p[0], p[1], zf(p[0], p[1])]);
    const curve = new T.CatmullRomCurve3(p3.map((p) => new T.Vector3(p[0], p[1], p[2])), true);
    kit.add(cls, new T.TubeGeometry(curve, pts.length * 2, rad, 6, true));
  }
  function resample(pts, n) {
    // gleichmaessig verteilte Punkte entlang eines geschlossenen Umrisses
    const L = [0];
    for (let i = 1; i <= pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i % pts.length];
      L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const tot = L[L.length - 1];
    const o = [];
    let j = 0;
    for (let k = 0; k < n; k++) {
      const s = (k / n) * tot;
      while (L[j + 1] < s) j++;
      const a = pts[j];
      const b = pts[(j + 1) % pts.length];
      const t = (s - L[j]) / (L[j + 1] - L[j] || 1);
      o.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return o;
  }
  // Schale um einen Ellipsoid-Mittelpunkt: az um y (0 = vorn), phi von oben; von phiA(az) bis phiB(az).
  // flare(phi) weitet den unteren Rand (Wangen, Kinnschutz)
  function shell(C, Rr, phiA, phiB, thick, nA, nP, flare, azR) {
    const a0 = azR ? azR[0] : -PI;
    const a1 = azR ? azR[1] : PI;
    const pos = [];
    const uv = [];
    const idx = [];
    const P = (az, ph, k) => {
      const f = (flare ? flare(ph, az) : 1) * k;
      return [C[0] + Rr[0] * f * Math.sin(ph) * Math.sin(az), C[1] + Rr[1] * k * Math.cos(ph), C[2] + Rr[2] * f * Math.sin(ph) * Math.cos(az)];
    };
    const rows = nP + 1;
    for (const side of [0, 1]) {
      const k = side ? 1 - thick : 1;
      for (let i = 0; i <= nA; i++) {
        const az = a0 + ((a1 - a0) * i) / nA;
        const pa = phiA(az);
        const pb = phiB(az);
        for (let j = 0; j <= nP; j++) {
          const ph = pa + ((pb - pa) * j) / nP;
          pos.push(...P(az, ph, k));
          uv.push(i / nA * 3, j / nP);
        }
      }
    }
    const off = (nA + 1) * rows;
    for (let i = 0; i < nA; i++)
      for (let j = 0; j < nP; j++) {
        const a = i * rows + j;
        const b = (i + 1) * rows + j;
        const c = a + 1;
        const d = b + 1;
        idx.push(a, c, b, b, c, d);
        idx.push(off + a, off + b, off + c, off + b, off + d, off + c);
      }
    // Raender (unten und, falls offen, oben) beidseitig schliessen
    const ringIdx = (j) => {
      for (let i = 0; i < nA; i++) {
        const a = i * rows + j;
        const b = (i + 1) * rows + j;
        idx.push(a, b, off + a, b, off + b, off + a, a, off + a, b, b, off + a, off + b);
      }
    };
    ringIdx(nP);
    ringIdx(0);
    if (azR)
      for (const i of [0, nA])
        for (let j = 0; j < nP; j++) {
          const a = i * rows + j;
          idx.push(a, a + 1, off + a, a + 1, off + a + 1, off + a, a, off + a, a + 1, a + 1, off + a, off + a + 1);
        }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const HC = [0, 1.885, 0.068];
  const HR = [0.1047, 0.115, 0.112];
  // Punkt auf der Kopfschale (fuer Zierteile)
  function headPt(az, ph, k) {
    return [HC[0] + HR[0] * k * Math.sin(ph) * Math.sin(az), HC[1] + HR[1] * k * Math.cos(ph), HC[2] + HR[2] * k * Math.sin(ph) * Math.cos(az)];
  }
  // Matrix: Zierteil auf der Schale, Flaeche nach aussen
  function onShell(az, ph, k, s) {
    const p = headPt(az, ph, k);
    const nrm = new T.Vector3(Math.sin(ph) * Math.sin(az) / HR[0], Math.cos(ph) / HR[1], Math.sin(ph) * Math.cos(az) / HR[2]).normalize();
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), nrm);
    return new T.Matrix4().compose(new T.Vector3(p[0], p[1], p[2]), q, new T.Vector3(s, s, s));
  }

  /* ===== Krieger: Schilde (Turmschild, Rundschild, Wappenschild, Drachenschild) ===== */
  function shieldOutline(v) {
    if (v === 0) {
      const o = [];
      for (const p of W.arc(0, 0.3, 0.24, 0, PI, 10)) o.push([p[0], p[1] + 0.06]);
      o.push([-0.24, -0.3], ...W.bez([-0.24, -0.36], [-0.12, -0.46], [0, -0.46], 4).slice(1), ...W.bez([0, -0.46], [0.12, -0.46], [0.24, -0.36], 4).slice(1), [0.24, -0.3]);
      return o;
    }
    if (v === 1) return W.arc(0, 0, 0.29, 0, PI * 2, 40).slice(0, 40);
    if (v === 2) return [...W.bez([0.25, 0.28], [0, 0.34], [-0.25, 0.28], 8), ...W.bez([-0.25, 0.28], [-0.27, -0.12], [0, -0.38], 10).slice(1), ...W.bez([0, -0.38], [0.27, -0.12], [0.25, 0.28], 10).slice(1, -1)];
    return [...W.arc(0, 0.2, 0.22, 0.15, PI - 0.15, 12), ...W.bez([-0.218, 0.233], [-0.22, -0.15], [0, -0.52], 12).slice(1), ...W.bez([0, -0.52], [0.22, -0.15], [0.218, 0.233], 12).slice(1, -1)];
  }
  F.schild = form(function (kit, v, r, c) {
    const m = W.mats(r);
    const out = shieldOutline(v);
    const bend = v === 1 ? (x, y) => -0.9 * (x * x + y * y) : (x) => -1.1 * x * x;
    const TH = 0.022;
    const face = ["wood", "cloth3", "blued", "blued", "ivory"][r];
    const P = plate(out, TH, bend, 7);
    kit.add(face, P.geo);
    // Rueckseite: Holz mit Riemen
    kit.add("leather", box(0.18, 0.03, 0.012, 0.003), at(0, 0.09, -TH - 0.006));
    kit.add("leather", box(0.18, 0.03, 0.012, 0.003), at(0, -0.09, -TH - 0.006));
    const zf = (x, y) => bend(x, y) - TH * 0.5;
    const rimCls = ["metal", "metal", "silver", "gold", "gold"][r];
    loop(kit, rimCls, out, 0.012 + r * 0.002, zf);
    // Nieten am Rand
    const rv = W.shrink(resample(out, 18 + r * 4), P.cx, P.cy, 0.94);
    for (const p of rv) kit.add(rimCls, sphere(0.0075, 6, 5), at(p[0], p[1], bend(p[0], p[1]) + 0.002));
    if (r === 0) {
      // Planken
      const ys = out.map((p) => p[1]);
      for (const x of [-0.12, -0.04, 0.04, 0.12]) kit.add("leather2", box(0.004, (Math.max(...ys) - Math.min(...ys)) * (v === 1 ? 0.7 : 0.82), 0.003), at(x, P.cy, bend(x, 0) + 0.001, 0, Math.atan(2.2 * x), 0));
    }
    if (r === 1) {
      // Kulturzeichen als Beschlagbaender: Albion Kreuz, Midgard Schraegkreuz, Hibernia Mittelband mit Blatt
      const band = (x0, y0, x1, y1) => {
        const pts = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          const x = x0 + (x1 - x0) * t;
          const y = y0 + (y1 - y0) * t;
          pts.push([x, y, bend(x, y) + 0.004]);
        }
        kit.add("metal", tube(pts, 0.009, 20, 4), at(0, 0, 0, 0, 0, 0, [1, 1, 0.4]));
      };
      const ys = out.map((p) => p[1]);
      const yt = Math.max(...ys) * 0.9;
      const yb = Math.min(...ys) * 0.88;
      if (c === "midgard") {
        band(-0.2, yt * 0.85, 0.2, yb * 0.6);
        band(0.2, yt * 0.85, -0.2, yb * 0.6);
      } else {
        band(0, yt, 0, yb);
        if (c === "albion") band(-0.22, 0.06, 0.22, 0.06);
        else for (const sx of [-1, 1]) W.leaf(kit, "bronze", at(sx * 0.07, 0.12, bend(sx * 0.07, 0.12) + 0.004, 0, 0, sx * 0.7), 0.12, 0.04);
      }
    }
    if (r >= 2) {
      // innerer Rahmen und Kulturzeichen
      const inn = W.shrink(resample(out, 48), P.cx, P.cy, 0.8);
      loop(kit, r >= 3 ? "gold" : "silver", inn, 0.006, (x, y) => bend(x, y) + 0.003);
    }
    if (r === 2) {
      W.rune(kit, "gem", at(0, -0.12, bend(0, -0.12) + 0.004), v + 1, 0.05);
      W.rune(kit, "gem", at(0, 0.16, bend(0, 0.16) + 0.004), v + 3, 0.035);
    }
    if (r >= 3) {
      // Sonnen- bzw. Kulturzeichen gross ueber der Flaeche mit Strahlen
      motif(kit, "gold", c, 0, 0.02, 0.02, 0.07);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2 + PI / 8;
        const L = i % 2 ? 0.12 : 0.2;
        const p0 = [Math.cos(a) * 0.09, 0.02 + Math.sin(a) * 0.09];
        const p1 = [Math.cos(a) * (0.09 + L), 0.02 + Math.sin(a) * (0.09 + L)];
        kit.add("gold", tube([[p0[0], p0[1], bend(p0[0], p0[1]) + 0.004], [p1[0], p1[1], bend(p1[0], p1[1]) + 0.004]], 0.006, 4, 4, (t) => 1 - t * 0.9));
      }
    }
    // Buckel
    const bossCls = r >= 3 ? "gold" : m.fit === "bronze" ? "metal" : r >= 2 ? "silver" : "metal";
    const bs = 1 + r * 0.12;
    kit.add(bossCls, lathe([[0.06 * bs, 0], [0.058 * bs, 0.012], [0.045 * bs, 0.03], [0.02 * bs, 0.042], [0.001, 0.045 * bs]], 16), at(0, 0.02, -0.004, PI / 2, 0, 0));
    if (r >= 2) kit.add("gem", gem(0.02 * bs, 0.03, 8), at(0, 0.02, 0.045 * bs, PI / 2, 0, 0, [1, 0.6, 1]));
    if (v === 3)
      // Drachenschild: Zackenkamm oben und Drachenschwingen am Rand
      for (const sx of [-1, 1])
        for (let i = 0; i < 3; i++) {
          const p = [sx * (0.2 - i * 0.03), 0.3 - i * 0.18];
          W.spike(kit, rimCls, [p[0], p[1], bend(p[0], p[1]) - 0.01], [sx, 0.4, -0.1], 0.06 + r * 0.008, 0.012, 4);
        }
    if (r >= 4) {
      W.legend(kit, c, 0, 0.02, 0.06, 0.12);
      const inn2 = W.shrink(resample(out, 48), P.cx, P.cy, 0.62);
      loop(kit, "gold", inn2, 0.004, (x, y) => bend(x, y) + 0.003);
    }
  });

  /* ===== Schurke: Wurfmesser, Wurfsterne, Giftphiolen am Guertel ===== */
  F.wurfmesser = form(function (kit, v, r, c) {
    const m = W.mats(r);
    const n = [2, 2, 3, 3, 4][r];
    // Guertelstueck
    kit.add("leather2", box(0.06 + n * 0.045, 0.045, 0.012, 0.003), at(0, 0, 0));
    if (r >= 1) for (const sx of [-1, 1]) kit.add(m.fit, sphere(0.005, 6, 5), at(sx * (0.025 + n * 0.022), 0, 0.008));
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * 0.045;
      // Lasche
      kit.add("leather", box(0.03, 0.05, 0.008, 0.002), at(x, -0.005, 0.01));
      if (v === 0) {
        const L = 0.12 + r * 0.008;
        const path = [];
        for (let i = 0; i <= 10; i++) path.push([0, (L * i) / 10]);
        const blade = W.sweep(path, (t) => ({ wa: (0.014 + (r === 1 ? 0.006 * Math.sin(t * PI) : 0)) * (t > 0.6 ? Math.pow((1 - t) / 0.4, 0.8) : 1), th: 0.0045 }));
        kit.add(m.blade, blade, at(x, -0.02, 0.018, 0, 0, PI));
        if (r >= 2) W.rune(kit, "gem", at(x, -0.07, 0.023, 0, 0, PI), k, 0.008);
        kit.add(m.grip, lathe([[0.007, 0], [0.008, 0.035]], 8), at(x, -0.02, 0.018));
        kit.add(m.fit, ring(0.009, 0.003, 12, 5), at(x, 0.026, 0.018));
        if (r >= 2) kit.add("gem", gem(0.005, 0.009, 5), at(x, 0.026, 0.018, PI / 2, 0, 0, [1, 0.5, 1]));
        if (r >= 3) for (const sx of [-1, 1]) W.spike(kit, m.fit, [x, -0.02, 0.018], [sx, 0.6, 0], 0.016, 0.004, 4);
      } else if (v === 1) {
        // Wurfsterne
        const pts = [];
        const np = 4 + Math.min(2, r);
        for (let i = 0; i < np * 2; i++) {
          const a = (i / (np * 2)) * PI * 2;
          const rr = i % 2 ? 0.01 : 0.03 + r * 0.002;
          pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
        }
        kit.add(m.blade, W.wedge(pts, 0.004, (x, y) => 1 - 0.7 * cl(Math.hypot(x, y) / 0.03), 0.001), at(x, -0.035, 0.02, 0, 0, k * 0.4));
        kit.add(r >= 2 ? "gem" : m.fit, new T.CylinderGeometry(0.006, 0.006, 0.006, 10).rotateX(PI / 2), at(x, -0.035, 0.02));
      } else {
        // Giftphiolen
        kit.add("glass", lathe([[0.004, -0.04], [0.012, -0.034], [0.013, -0.01], [0.006, 0.0], [0.005, 0.012]], 10), at(x, -0.01, 0.02));
        kit.add(k % 2 ? "venom" : "gem", lathe([[0.003, -0.037], [0.0105, -0.032], [0.011, -0.016]], 10), at(x, -0.01, 0.02));
        kit.add(m.fit, lathe([[0.006, 0.012], [0.0065, 0.02]], 8), at(x, -0.01, 0.02));
        if (r >= 3) kit.add(m.fit, ring(0.0135, 0.0018, 14, 4), at(x, -0.03, 0.02, PI / 2));
      }
    }
    if (r >= 4) {
      for (const sz of [0.02]) kit.add("gold", tube([[-0.1, 0.01, sz], [-0.03, -0.015, sz + 0.01], [0.03, 0.012, sz + 0.01], [0.1, -0.012, sz]], 0.0025, 20, 4));
      W.leaf(kit, "gold", at(0.11, -0.02, 0.012, 0, 0, PI + 0.3), 0.04, 0.013);
    }
  });

  /* ===== Jaeger: Koecher, Pfeilkoecher, Federkoecher (Ruecken) ===== */
  F.koecher = form(function (kit, v, r, c) {
    const m = W.mats(r);
    const R0 = v === 1 ? 0.072 : 0.06;
    const y0 = -0.27;
    const y1 = 0.25;
    const body = r >= 3 ? "blued" : "leather";
    kit.add(body, lathe([[R0 * 0.85, y0 - 0.01], [R0, y0 + 0.02], [R0 * 1.02, y1 - 0.03], [R0 * 1.08, y1]], 14), at(0, 0, 0, 0, 0, 0, [1, 1, v === 1 ? 0.7 : 0.85]));
    kit.add("leather2", new T.CircleGeometry(R0 * 0.85, 14).rotateX(PI / 2), at(0, y0 - 0.01, 0, 0, 0, 0, [1, 1, v === 1 ? 0.7 : 0.85]));
    if (v === 1) kit.add(body, box(0.07, 0.16, 0.035, 0.008), at(0, -0.08, R0 * 0.75));
    // Riemenbaender und Trageriemen
    for (const y of [y0 + 0.06, y1 - 0.06]) kit.add("leather2", ring(R0 * 1.04, 0.006, 16, 4), at(0, y, 0, PI / 2, 0, 0, [1, v === 1 ? 0.72 : 0.86, 1]));
    kit.add("leather2", tube([[R0, y0 + 0.06, 0], [R0 + 0.035, 0, -0.01], [R0, y1 - 0.06, 0]], 0.007, 10, 4));
    if (r >= 1) for (const y of [y0 + 0.06, y1 - 0.06]) kit.add(m.fit, box(0.022, 0.018, 0.008, 0.002), at(0, y, R0 * (v === 1 ? 0.74 : 0.88)));
    // Pfeile
    const na = 6 + r;
    for (let k = 0; k < na; k++) {
      const a = (k / na) * PI * 2;
      const rr = R0 * 0.55 * (k % 2 ? 1 : 0.5);
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr * 0.8;
      const top = y1 + 0.11 + (k % 3) * 0.015;
      kit.add("wood", tube([[x, y1 - 0.05, z], [x * 1.3, top, z * 1.3]], 0.0035, 2, 4));
      const fl = r >= 2 ? "cloth3" : "string";
      for (let f = 0; f < 3; f++) kit.add(fl, slab([[0, 0], [0.012, -0.012], [0.012, -0.06], [0, -0.05]], 0.0015, 0), at(x * 1.3, top, z * 1.3, 0, (f * PI * 2) / 3 + a, 0));
    }
    if (r >= 2) {
      kit.add("fur", ring(R0 * 1.1, 0.018, 18, 6), at(0, y1 - 0.005, 0, PI / 2, 0, 0, [1, v === 1 ? 0.72 : 0.86, 1]));
      for (let i = 0; i < 3; i++) W.rune(kit, "gem", at(0, -0.12 + i * 0.07, R0 * (v === 1 ? 0.72 : 0.87) + 0.002), i + v, 0.015);
    }
    if (r >= 3) {
      for (const a of [-0.6, 0.6]) kit.add("silver", box(0.008, y1 - y0 - 0.06, 0.006, 0.002), at(Math.sin(a) * R0, (y0 + y1) / 2, Math.cos(a) * R0 * (v === 1 ? 0.72 : 0.86), 0, a, 0));
      kit.add("silver", tube([[R0 * 0.9, y1 - 0.08, 0.02], [R0 * 1.15, y1 - 0.14, 0.03], [R0 * 1.1, y1 - 0.2, 0.03]], 0.0022, 10, 4));
      kit.add("gem", gem(0.008, 0.026, 4), at(R0 * 1.1, y1 - 0.22, 0.03));
    }
    if (v === 2)
      // Federkoecher: Federbuendel am Riemen
      for (let i = 0; i < 3 + r; i++) kit.add(i % 2 ? "cloth3" : "fur", slab([[0, 0], [0.012, -0.02], [0.01, -0.09], [0, -0.1], [-0.008, -0.05]], 0.002, 0), at(R0 * 0.95, y1 - 0.08 - i * 0.01, 0.01 * i, 0, 0, 0.25 - i * 0.12));
    if (r >= 4) {
      if (c === "hibernia") for (const s of [-1, 1]) W.antler(kit, "ivory", [s * R0 * 0.8, y1, 0], [s * 0.6, 1], 0.16, -s, 0.007);
      else W.legend(kit, c, 0, 0.0, R0 * 0.92, 0.04);
      kit.add("fur", lathe([[R0 * 0.9, y0 - 0.06], [R0 * 1.05, y0 - 0.02], [R0 * 0.8, y0 + 0.02]], 12));
    }
  });

  /* ===== Magier-Nebenhand: Fokuskristall, Seelenstein, Zauberfolianten ===== */
  F.fokus = form(function (kit, v, r, c) {
    if (v === 2) {
      // Foliant
      const cover = r >= 4 ? "ivory" : r >= 2 ? "blued" : "leather";
      kit.add(cover, box(0.17, 0.21, 0.012, 0.003), at(0, 0, -0.03));
      kit.add(cover, box(0.17, 0.21, 0.012, 0.003), at(0, 0, 0.03));
      kit.add(cover, box(0.018, 0.21, 0.072, 0.006), at(-0.083, 0, 0));
      kit.add("bone", box(0.16, 0.2, 0.05, 0.002), at(0.004, 0, 0));
      if (r >= 1) for (const sx of [-1, 1]) for (const sy of [-1, 1]) kit.add(W.mats(r).fit, box(0.026, 0.026, 0.074, 0.003), at(0.074 + 0 * sx, sy * 0.095, 0));
      if (r >= 2) {
        W.rune(kit, "gem", at(0, 0, 0.037), 4 + r, 0.04);
        kit.add("gem", gem(0.01, 0.016, 6), at(0.088, 0, 0, 0, 0, PI / 2, [1, 0.6, 1]));
      }
      if (r >= 3) {
        motif(kit, "gold", c, 0, 0.0, 0.04, 0.05);
        kit.add("glow", box(0.004, 0.19, 0.046), at(0.086, 0, 0));
      }
      if (r >= 4) W.legend(kit, c, 0, 0, 0.045, 0.06);
      return;
    }
    if (v === 1) {
      // Seelenstein: glatter Stein, ab Blau leuchtende Kugel im Kaefig
      if (r <= 1) kit.add("stone", sphere(0.055, 16, 12), at(0, 0, 0, 0, 0, 0, [1, 1.15, 0.85]));
      else kit.add("gem", sphere(0.05, 18, 12));
      if (r >= 1) kit.add(W.mats(r).fit, ring(0.058, 0.005, 24, 5), at(0, 0, 0, 0, PI / 2));
      if (r >= 2) for (let i = 0; i < 3; i++) kit.add(r >= 3 ? "gold" : "silver", ring(0.062 + i * 0.006, 0.0035, 28, 4), at(0, 0, 0, PI / 2 + i * 0.8, i * 1.1, 0));
      if (r >= 4) W.legend(kit, c, 0, 0, 0, 0.1);
      return;
    }
    // Fokuskristall nach Tafel 17
    if (r <= 1) {
      kit.add("stone", W.rock(0.065, 0.8, 1.15, 0.6));
      if (r === 1) {
        W.rune(kit, "blued", at(0, 0.01, 0.042), 1, 0.03);
        for (const a of [0.5, -0.4]) kit.add("leather", ring(0.06, 0.006, 20, 4), at(0, 0, 0, 0, PI / 2, a, [1, 1.2, 0.75]));
      }
      return;
    }
    kit.add("gem", gem(0.06, 0.22, 6, 0.4), at(0, 0, 0, 0, 0, 0, [1, 1, 0.7]));
    if (r === 2) for (let i = 0; i < 3; i++) W.rune(kit, "rune", at(0, -0.04 + i * 0.04, 0.045), i, 0.012);
    if (r >= 3) {
      // kantiger Silberrahmen
      const fr = [[0, -0.15], [0.1, -0.02], [0.08, 0.06], [0, 0.14], [-0.08, 0.06], [-0.1, -0.02]];
      const sh = new T.Shape(fr.map((p) => new T.Vector2(p[0], p[1])));
      sh.holes.push(new T.Path(fr.map((p) => new T.Vector2(p[0] * 0.78, p[1] * 0.8)).reverse()));
      const g = new T.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1 });
      g.translate(0, 0, -0.009);
      kit.add(r >= 4 ? "gold" : "silver", g);
      for (let i = 0; i < 4; i++) W.rune(kit, "rune", at(-0.06 + i * 0.04, -0.06 + Math.abs(i - 1.5) * 0.02, 0.016), i, 0.009);
    }
    if (r >= 4) {
      for (const sx of [-1, 1]) kit.add("silver", W.sweep(W.arc(0, 0, 0.13, sx > 0 ? -1.2 : PI + 1.2, sx > 0 ? 1.2 : PI - 1.2, 16), (t) => ({ wa: 0.012 + 0.012 * Math.sin(t * PI), wb: 0.006, th: 0.008 }), true));
      kit.add("glow", gem(0.035, 0.12, 6, 0.4), at(0, 0, 0.02));
    }
  });

  /* ===== Feste Kopfteile ===== */
  // Helme: Plattenhelm, Hoernerhelm, Fluegelhelm, Visierhelm (Tafel 10)
  F.helm = form(function (kit, v, r, c) {
    const m = W.mats(r);
    const mat = r >= 4 ? "pale" : r >= 2 ? "steel" : "metal";
    const K = [1.12, 1.14, 1.1];
    const Rr = [HR[0] * K[0], HR[1] * K[1], HR[2] * K[2]];
    // Schale: vorn bis zur Stirn, seitlich ueber die Ohren, hinten bis in den Nacken; Wangenklappen beim Plattenhelm
    const lim = (az) => {
      const a = Math.abs(az);
      let p = 1.36 + (2.05 - 1.36) * (1 - Math.cos(a)) / 2;
      if (v === 0 && a > 0.45 && a < 1.5) p = Math.max(p, 1.36 + 0.85 * Math.sin(((a - 0.45) / 1.05) * PI));
      return p;
    };
    if (v === 3) {
      // Visierhelm: Glocke bis zum Sehschlitz, Gesichtsplatte darunter bis zum Kinn
      kit.add(mat, shell(HC, Rr, () => 0, (az) => (Math.abs(az) < 1.1 ? 1.6 : 2.35), 0.06, 40, 12, (ph) => 1 + Math.max(0, ph - 1.9) * 0.45));
      // Gesichtsplatte als gewoelbtes Band vor Nase und Kinn
      const vp = new T.CylinderGeometry(0.142, 0.128, 0.15, 28, 3, true, -1.35, 2.7);
      vp.scale(0.92, 1, 1);
      const vpi = vp.clone();
      vpi.scale(0.96, 1, 0.96);
      vpi.setIndex(Array.from(vpi.index.array).reverse());
      kit.add(mat, vp, at(0, 1.79, HC[2] - 0.004));
      kit.add(mat, vpi, at(0, 1.79, HC[2] - 0.004));
      kit.add(m.fit, new T.CylinderGeometry(0.145, 0.145, 0.012, 28, 1, true, -1.35, 2.7).scale(0.92, 1, 1), at(0, 1.862, HC[2] - 0.004));
      for (let i = 0; i < 6; i++) {
        const az = 0.35 + (i % 3) * 0.13;
        const y = 1.8 - Math.floor(i / 3) * 0.022;
        kit.add("leather2", sphere(0.0042, 6, 5), at(0.92 * 0.137 * Math.sin(az), y, HC[2] - 0.004 + 0.137 * Math.cos(az)));
      }
      // Grat ueber das Visier
      kit.add(mat, tube([[0, HC[1] + Rr[1] * 1.02, HC[2] - 0.02], [0, HC[1] + Rr[1] * 0.75, HC[2] + Rr[2] * 0.75], [0, HC[1] - 0.04, HC[2] + Rr[2] * 1.12], [0, HC[1] - 0.1, HC[2] + Rr[2] * 1.05]], 0.006, 20, 5));
    } else {
      kit.add(mat, shell(HC, Rr, () => 0, lim, 0.06, 44, 14, (ph) => 1 + Math.max(0, ph - 1.7) * 0.25));
      // Stirnband und Nasal
      kit.add(m.fit, shell(HC, [Rr[0] * 1.03, Rr[1] * 1.0, Rr[2] * 1.03], (az) => lim(az) - 0.16, (az) => lim(az) - 0.02, 0.05, 44, 2));
      if (v !== 2 || r >= 1) kit.add(mat, slab([[-0.012, 0], [0.012, 0], [0.008, -0.07], [0, -0.08], [-0.008, -0.07]], 0.006, 0.002), at(0, 1.914, 0.195, -0.24, 0, 0));
    }
    // Kamm
    if (r >= 1) kit.add(m.fit, tube(W.arc(0, 0, 1, 0.35, PI - 0.6, 14).map((p) => [0, HC[1] + p[1] * Rr[1] * 1.04, HC[2] + p[0] * Rr[2] * 1.04]), 0.006, 20, 5));
    // Nieten
    for (let i = 0; i < 10; i++) {
      const az = -PI + (i / 10) * PI * 2 + 0.3;
      kit.add(m.fit, sphere(0.0045, 6, 5), onShell(az, (v === 3 ? 1.5 : lim(az)) - 0.09, K[0] * 1.04, 1));
    }
    if (v === 1)
      for (const s of [-1, 1]) {
        const b = headPt(s * 1.45, 1.05, 1.1);
        W.horn(kit, r >= 4 ? "ivory" : "bone", [b, [b[0] + s * 0.07, b[1] + 0.02, b[2]], [b[0] + s * 0.12, b[1] + 0.09, b[2] - 0.01], [b[0] + s * 0.11, b[1] + 0.17 + r * 0.01, b[2] - 0.03]], 0.024, 16);
      }
    if (v === 2)
      for (const s of [-1, 1])
        for (let k = 0; k < 4 + Math.min(2, r); k++) {
          const b = headPt(s * 1.5, 1.15, 1.08);
          const fe = [[0, -0.01], [0.09 - k * 0.008, -0.004], [0.1 - k * 0.01, 0.012], [0, 0.014]];
          kit.add(r >= 3 ? "gold" : r >= 1 ? "silver" : "metal", slab(s > 0 ? fe : W.mirrorX(fe), 0.004, 0.0015), at(b[0], b[1] + k * 0.012, b[2] - k * 0.012, 0, s * 0.35, s * (0.55 + k * 0.17)));
        }
    if (r >= 2) {
      W.rune(kit, "gem", onShell(0, (v === 3 ? 1.45 : lim(0)) - 0.3, K[2] * 1.03, 1), v + 1, 0.014);
      kit.add("gem", gem(0.008, 0.016, 6), onShell(0, (v === 3 ? 1.45 : lim(0)) - 0.09, K[2] * 1.06, 1).multiply(new T.Matrix4().makeRotationX(PI / 2)));
    }
    if (r >= 3) {
      for (const s of [-1, 1]) motif(kit, "gold", c, ...headPt(s * 1.5, 1.4, 1.14), 0.02, 0, s * 1.5, 0);
    }
    if (r >= 4) {
      // Kronenzacken (Tafel 10, legendaer)
      for (let i = -2; i <= 2; i++) {
        const az = i * 0.32;
        const p = headPt(az, lim(az) - 0.32, K[0] * 1.03);
        W.spike(kit, "gold", p, [Math.sin(az) * 0.15, 1, Math.cos(az) * 0.15], i ? 0.06 : 0.1, 0.012, 4);
      }
      W.legend(kit, c, 0, HC[1] + 0.06, HC[2] + Rr[2] * 1.02, 0.025);
    }
    return { hidesHair: true };
  });

  // Schurke: Schattenmaske (Tuchmaske), Kapuzenmaske, Rabenmaske; dazu die Kapuze aus dem Modellpaket
  // Tuchmaske vor Nase, Mund und Kinn (unterhalb der Augen); Mittelpunkt des Maskenbogens
  const MZ = 0.09;
  function lowerMask(kit, cls, r, k) {
    const g = new T.CylinderGeometry(0.118 * k, 0.11 * k, 0.11, 28, 4, true, -1.4, 2.8);
    g.scale(0.8, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // ueber dem Nasenruecken hochgezogen, unten zur Mitte spitz, leichte Falten
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const c = Math.max(0, 1 - Math.abs(x) / 0.1);
      const t = (y + 0.055) / 0.11;
      p.setXYZ(i, x, y + c * (t * 0.012 - (1 - t) * 0.035), z + 0.003 * Math.sin(x * 110) * (1 - t));
    }
    g.computeVertexNormals();
    const gi = g.clone();
    gi.scale(0.97, 1, 0.97);
    gi.setIndex(Array.from(gi.index.array).reverse());
    kit.add(cls, g, at(0, 1.795, MZ));
    kit.add(cls, gi, at(0, 1.795, MZ));
  }
  F["maske.0"] = form(function (kit, v, r, c) {
    lowerMask(kit, r >= 3 ? "blued" : "cloth3", r, 1);
    if (r >= 1) kit.add(W.mats(r).fit, new T.CylinderGeometry(0.12, 0.12, 0.006, 28, 1, true, -1.4, 2.8).scale(0.8, 1, 1), at(0, 1.846, MZ));
    if (r >= 2) W.rune(kit, "gem", at(0.8 * 0.116 * Math.sin(0.5), 1.8, MZ + 0.116 * Math.cos(0.5) + 0.002, 0, 0.5, 0), 4, 0.011);
    if (r >= 3) W.legend(kit, c, -0.8 * 0.117 * Math.sin(0.55), 1.81, MZ + 0.117 * Math.cos(0.55), 0.011);
  });
  F["maske.1"] = form(function (kit, v, r, c) {
    lowerMask(kit, r >= 3 ? "blued" : "leather", r, 1);
    for (let i = 0; i < 2 + Math.min(1, r); i++) kit.add(W.mats(r).fit, new T.CylinderGeometry(0.119 - i * 0.003, 0.119 - i * 0.003, 0.005, 28, 1, true, -1.4, 2.8).scale(0.8, 1, 1), at(0, 1.835 - i * 0.03, MZ));
    if (r >= 2) for (const s of [-1, 1]) kit.add("gem", sphere(0.0045, 6, 5), at(s * 0.8 * 0.12 * Math.sin(1.1), 1.835, MZ + 0.12 * Math.cos(1.1)));
  });
  F["maske.2"] = form(function (kit, v, r, c) {
    // Rabenmaske: Stirn- und Wangenteil mit Augenausschnitt und langem Schnabel
    const mc = r >= 4 ? "ivory" : r >= 2 ? "blued" : "leather2";
    kit.add(mc, shell(HC, [HR[0] * 1.08, HR[1] * 1.04, HR[2] * 1.16], () => 1.32, () => 1.62, 0.05, 30, 4, null, [-1.5, 1.5]));
    kit.add(mc, shell(HC, [HR[0] * 1.08, HR[1] * 1.04, HR[2] * 1.18], () => 1.78, () => 2.05, 0.05, 30, 4, null, [-1.5, 1.5]));
    kit.add(mc, shell(HC, [HR[0] * 1.08, HR[1] * 1.04, HR[2] * 1.18], () => 1.6, () => 1.8, 0.05, 6, 2, null, [-0.18, 0.18]));
    const b = headPt(0, 1.82, 1.2);
    kit.add(r >= 3 ? "gold" : "bone", tube([b, [b[0], b[1] - 0.03, b[2] + 0.07], [b[0], b[1] - 0.075, b[2] + 0.12]], 0.03, 14, 8, (t) => Math.max(0.06, 1 - t * 0.95)), at(0, 0, 0, 0, 0, 0, [0.7, 1, 1]));
    if (r >= 1) for (const s of [-1, 1]) kit.add(W.mats(r).fit, ring(0.024, 0.0025, 16, 4), onShell(s * 0.38, 1.7, 1.16, 1));
    if (r >= 2) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) kit.add("cloth3", slab([[0, 0], [0.012, -0.02], [0.006, -0.08], [-0.004, -0.03]], 0.002, 0), onShell(s * (1.3 + i * 0.12), 1.35, 1.14, 1));
    if (r >= 4) W.legend(kit, c, ...headPt(0, 1.3, 1.16), 0.018);
  });
  // Jaeger: Federkappe und Wolfskopfhaube
  F["kappe.1"] = form(function (kit, v, r, c) {
    const lc = r >= 3 ? "blued" : "leather";
    kit.add(lc, shell(HC, [HR[0] * 1.12, HR[1] * 1.1, HR[2] * 1.12], () => 0, (az) => 1.45 + 0.4 * (1 - Math.cos(az)) / 2, 0.08, 36, 10));
    kit.add("leather2", shell(HC, [HR[0] * 1.16, HR[1] * 1.12, HR[2] * 1.16], (az) => 1.36 + 0.4 * (1 - Math.cos(az)) / 2, (az) => 1.47 + 0.4 * (1 - Math.cos(az)) / 2, 0.08, 36, 2, (ph) => 1.06));
    const b = headPt(-1.2, 1.25, 1.12);
    const n = 1 + Math.min(3, r);
    for (let i = 0; i < n; i++) kit.add(i ? "cloth3" : r >= 4 ? "gold" : "string", slab([[0, 0], [0.012, 0.03], [0.012, 0.16 - i * 0.02], [0, 0.18 - i * 0.02], [-0.008, 0.08]], 0.002, 0), at(b[0], b[1], b[2], -0.5, -0.4 + i * 0.15, 0.55 - i * 0.18));
    if (r >= 1) kit.add(W.mats(r).fit, sphere(0.008, 8, 6), at(b[0], b[1], b[2]));
    if (r >= 2) kit.add("gem", gem(0.007, 0.014, 6), at(b[0] - 0.004, b[1] + 0.004, b[2] + 0.006, PI / 2, 0, 0));
    if (r >= 4) W.legend(kit, c, ...headPt(0, 1.2, 1.14), 0.02);
    return { hidesHair: true };
  });
  F["kappe.2"] = form(function (kit, v, r, c) {
    // Wolfskopf: Fellkappe mit Schnauze ueber der Stirn, Ohren und Zaehnen
    kit.add("fur", shell(HC, [HR[0] * 1.18, HR[1] * 1.14, HR[2] * 1.15], () => 0, (az) => 1.5 + 0.7 * (1 - Math.cos(az)) / 2, 0.1, 36, 10));
    const s0 = headPt(0, 1.0, 1.15);
    kit.add("fur", tube([[s0[0], s0[1] - 0.01, s0[2] - 0.04], [s0[0], s0[1] - 0.02, s0[2] + 0.02], [s0[0], s0[1] - 0.05, s0[2] + 0.07]], 0.045, 10, 8, (t) => 1 - t * 0.45), at(0, 0, 0, 0, 0, 0, [0.9, 0.8, 1]));
    kit.add("leather2", sphere(0.012, 8, 6), at(s0[0], s0[1] - 0.05, s0[2] + 0.09));
    for (const sx of [-1, 1]) {
      const e = headPt(sx * 0.95, 0.55, 1.15);
      kit.add("fur", new T.ConeGeometry(0.028, 0.07, 4), at(e[0], e[1] + 0.02, e[2], -0.2, 0, -sx * 0.35));
      for (let i = 0; i < 2; i++) W.spike(kit, r >= 3 ? "gold" : "bone", [s0[0] + sx * (0.02 + i * 0.012), s0[1] - 0.08, s0[2] + 0.06 - i * 0.02], [0, -1, 0.2], 0.026, 0.005, 4);
      if (r >= 2) kit.add("gem", sphere(0.007, 8, 6), at(s0[0] + sx * 0.03, s0[1] - 0.005, s0[2] + 0.035));
    }
    // Fell faellt in den Nacken
    kit.add("fur", shell(HC, [HR[0] * 1.2, HR[1] * 1.14, HR[2] * 1.15], () => 1.9, () => 2.7, 0.1, 18, 4, (ph) => 1 + (ph - 1.9) * 0.4, [PI * 0.55, PI * 1.45]));
    if (r >= 1) kit.add(W.mats(r).fit, ring(0.02, 0.004, 16, 4), onShell(1.2, 1.6, 1.18, 1));
    if (r >= 4 && c === "hibernia") for (const sx of [-1, 1]) W.antler(kit, "ivory", headPt(sx * 0.7, 0.5, 1.1), [sx * 0.5, 1], 0.14, -sx, 0.007);
    else if (r >= 4) W.legend(kit, c, ...headPt(0, 0.7, 1.16), 0.025);
    return { hidesHair: true };
  });
  // Magier: Sternenspange an der Kapuze (Sternenhaube) und Stirnstein der Zauberkapuze
  F["hut.2"] = form(function (kit, v, r, c) {
    const p = headPt(0, 1.18, 1.3);
    const s = 0.024 + r * 0.004;
    const star = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2;
      const rr = i % 2 ? s * 0.42 : s;
      star.push([Math.sin(a) * rr, Math.cos(a) * rr]);
    }
    kit.add(r >= 4 ? "gold" : r >= 1 ? "silver" : "metal", slab(star, 0.004, 0.0015), at(p[0], p[1], p[2], -0.35, 0, 0));
    if (r >= 2) kit.add("gem", gem(0.007, 0.012, 6), at(p[0], p[1], p[2] + 0.004, PI / 2 - 0.35, 0, 0));
    if (r >= 3) for (const sx of [-1, 1]) kit.add("silver", slab(star.map((q) => [q[0] * 0.45, q[1] * 0.45]), 0.003, 0.001), at(p[0] + sx * 0.05, p[1] - 0.012, p[2] - 0.016, -0.35, sx * 0.4, 0));
    if (r >= 4) W.legend(kit, c, p[0], p[1] + 0.035, p[2] - 0.01, 0.018);
  });
  F["hut.0"] = form(function (kit, v, r, c) {
    if (r < 2) return;
    const p = headPt(0, 1.22, 1.3);
    kit.add(r >= 3 ? "gold" : "silver", lathe([[0.012, -0.002], [0.014, 0.002]], 12).rotateX(PI / 2), at(p[0], p[1], p[2], -0.35, 0, 0));
    kit.add("gem", gem(0.009, 0.014, 6), at(p[0], p[1], p[2] + 0.003, PI / 2 - 0.35, 0, 0));
    if (r >= 4) W.legend(kit, c, p[0], p[1] + 0.03, p[2] - 0.01, 0.02);
  });

  // Runenkrone: offener Reif bzw. Diadem (Tafel 13)
  const HEAD = IT.HEAD;
  F.krone = form(function (kit, v, r, c) {
    const metal = r >= 4 ? "gold" : r >= 1 ? "silver" : "metal";
    const g = ring(1, 0.07 + r * 0.008, 48, 6);
    g.scale(HEAD.rx * 1.02, HEAD.rz * 1.02, 0.12 + r * 0.02);
    g.rotateX(PI / 2);
    kit.add(metal, g, at(0, HEAD.cy, HEAD.cz, -0.12, 0, 0));
    const fz = HEAD.cz + HEAD.rz * 1.02;
    const fy = HEAD.cy - 0.012;
    const n = r >= 3 ? 5 : r >= 1 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 0.32;
      const x = Math.sin(a) * HEAD.rx * 1.03;
      const z = HEAD.cz + Math.cos(a) * HEAD.rz * 1.03;
      const h = i === (n - 1) / 2 ? 0.05 + r * 0.008 : 0.028;
      kit.add(metal, slab([[0, 0], [0.012, 0.012], [0, h], [-0.012, 0.012]], 0.005, 0.002), at(x, fy, z, -0.15, a, 0));
    }
    if (r >= 2) kit.add("gem", gem(0.011 + r * 0.001, 0.03, 4), at(0, fy + 0.018, fz + 0.006, 0, 0, 0, [1, 1, 0.45]));
    if (r >= 2) for (const s of [-1, 1]) W.rune(kit, "rune", at(s * HEAD.rx * 0.75, fy - 0.004, HEAD.cz + HEAD.rz * 0.72, -0.12, s * 0.75, 0), 2 + s, 0.008);
    if (r >= 4) kit.add("gold", ring(0.13, 0.005, 32, 5, PI), at(0, HEAD.cy + 0.02, HEAD.cz - 0.03, -0.25, 0, 0));
  });

  /* ===== Schmuck nach Tafel 18 ===== */
  // Amulett, Medaillon, Runenanhaenger, Totem: Grundform je Variante, Rahmenbau je Seltenheit
  F.amulett = form(function (kit, v, r, c) {
    const metal = r >= 4 ? "gold" : r >= 1 ? "silver" : "bronze";
    const S = 0.034;
    if (r <= 1) {
      if (v === 0 || v === 1) {
        kit.add(metal, new T.CylinderGeometry(S, S, 0.008, 28).rotateX(PI / 2));
        kit.add(metal, ring(S, 0.003, 28, 4));
        if (v === 1) kit.add(metal, new T.CylinderGeometry(0.006, 0.006, 0.012, 10), at(S * 0.95, 0, 0, 0, 0, 0));
        if (r === 1 && c === "hibernia") for (let i = 0; i < 5; i++) kit.add(metal, box(0.0025, 0.022, 0.003), at(Math.sin(i - 2) * 0.008, 0.002 + Math.abs(i - 2) * 0.002, 0.006, 0, 0, (i - 2) * 0.35));
        else motif(kit, metal, c, 0, 0, 0.006, 0.02);
      } else if (v === 2) {
        kit.add(r ? "stone" : metal, slab([[0, -0.045], [0.028, 0], [0, 0.045], [-0.028, 0]], 0.006, 0.002));
        W.rune(kit, "blued", at(0, 0, 0.005), 3, 0.016);
      } else {
        kit.add("wood", box(0.024, 0.055, 0.016, 0.005));
        kit.add("bone", box(0.032, 0.01, 0.018, 0.003), at(0, 0.014, 0));
        kit.add("leather2", sphere(0.004, 6, 5), at(-0.006, 0.0, 0.008));
        kit.add("leather2", sphere(0.004, 6, 5), at(0.006, 0.0, 0.008));
      }
    } else if (r === 2) {
      // Kristall im Rautenkaefig
      kit.add("gem", gem(0.02, 0.07, 6, 0.4), at(0, -0.004, 0, 0, 0, 0, [1, 1, 0.6]));
      const cage = [[0, -0.06], [0.034, 0], [0, 0.05], [-0.034, 0]];
      loop(kit, metal, cage, 0.0028, () => 0.006);
      loop(kit, metal, cage, 0.0028, () => -0.006);
      if (v === 1) kit.add(metal, ring(0.04, 0.0025, 28, 4));
      if (v === 3) kit.add("wood", box(0.016, 0.024, 0.01, 0.003), at(0, 0.058, 0));
      if (v === 2) W.rune(kit, "rune", at(0, -0.004, 0.012), 3, 0.012);
    } else if (r === 3) {
      // Mondsichelrahmen mit Mondstein und haengendem Mond
      kit.add(metal, W.sweep(W.arc(0, 0, 0.042, PI * 0.15 - PI, PI * 0.15 + 0.0, 24).map((p) => p), (t) => ({ wa: 0.004 + 0.008 * Math.sin(t * PI), wb: 0.004, th: 0.004 }), true), at(0, 0, 0, 0, 0, -PI * 0.65));
      kit.add("gem", sphere(0.015, 14, 10), at(0, 0.008, 0, 0, 0, 0, [1, 1, 0.6]));
      kit.add(metal, ring(0.016, 0.002, 20, 4), at(0, 0.008, 0.002));
      kit.add(metal, W.sweep(W.arc(0, 0, 0.012, 0.5, PI * 2 - 0.5, 14), (t) => ({ wa: 0.001 + 0.004 * Math.sin(t * PI), wb: 0.001, th: 0.002 }), true), at(0, -0.05, 0));
      if (v === 2) W.rune(kit, "rune", at(0, -0.03, 0.004), 1, 0.008);
      if (v === 3) for (const s of [-1, 1]) W.spike(kit, "bone", [s * 0.03, -0.03, 0], [s * 0.3, -1, 0], 0.025, 0.004, 4);
    } else {
      // Sonnenrad mit Zacken und Bernstein (legendaer)
      kit.add("gold", ring(0.038, 0.0045, 32, 5));
      kit.add("gold", ring(0.026, 0.003, 28, 4), at(0, 0, 0, 0, PI / 2, 0));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2;
        W.spike(kit, "gold", [Math.cos(a) * 0.038, Math.sin(a) * 0.038, 0], [Math.cos(a), Math.sin(a), 0], i % 2 ? 0.014 : 0.026, 0.005, 4);
      }
      kit.add("gem", gem(0.013, 0.04, 6, 0.4), at(0, 0, 0, 0, 0, 0, [1, 1, 0.6]));
      if (v === 3) kit.add("wood", box(0.012, 0.02, 0.008, 0.003), at(0, -0.072, 0));
      if (v === 2) W.rune(kit, "rune", at(0, 0, 0.012), 2, 0.01);
    }
    // Oese
    kit.add(metal, ring(0.006, 0.002, 12, 4), at(0, r >= 2 ? 0.062 : 0.04, 0, 0, PI / 2, 0));
  });
  // Ring, Siegelring, Runenring, Knochenring (Ringebene xy, Fingerachse z)
  F.ring = form(function (kit, v, r, c) {
    const metal = r >= 4 ? "gold" : r >= 1 ? "silver" : "bronze";
    const band = v === 3 ? "bone" : metal;
    kit.add(band, ring(0.0105, v === 1 || r >= 1 ? 0.0032 : 0.0024, 22, 6), at(0, 0, 0, 0, 0, 0, [1, 1, r === 0 ? 2 : 1.4]));
    const top = (y) => at(0, 0.0125 + y, 0);
    if (v === 1 || r === 1) kit.add(metal, new T.CylinderGeometry(0.0065, 0.0075, 0.004, 14), top(0));
    if (v === 2 || r >= 2) kit.add("gem", gem(0.0048, 0.01, r >= 2 ? 4 : 6), top(0.004));
    if (r >= 2) for (const s of [-1, 1]) W.spike(kit, metal, [s * 0.006, 0.01, 0], [s * 0.4, 1, 0], 0.008, 0.0016, 4);
    if (r >= 3) kit.add(metal, W.sweep(W.arc(0, 0, 0.0085, 0.4, PI - 0.4, 12), (t) => ({ wa: 0.0012 + 0.002 * Math.sin(t * PI), wb: 0.001, th: 0.0015 }), true), at(0, 0.012, 0));
    if (r >= 4) for (const s of [-1, 1]) kit.add("gold", ring(0.0045, 0.0012, 10, 4, PI * 1.5), at(s * 0.009, 0.006, 0, 0, 0, s * 0.8));
  });
  // Talisman, Gluecksbringer, Runenstein, Goetzenbild am Guertel
  F.talisman = form(function (kit, v, r, c) {
    const metal = r >= 4 ? "gold" : r >= 2 ? "silver" : "metal";
    kit.add("leather", box(0.02, 0.05, 0.007, 0.002), at(0, 0.03, 0));
    if (r >= 1) kit.add(metal, sphere(0.004, 6, 5), at(0, 0.035, 0.005));
    const y = -0.025;
    if (v === 0) kit.add(r >= 2 ? "blued" : "stone", W.rock(0.026, 0.9, 1.3, 0.65), at(0, y, 0));
    else if (v === 1) {
      // Hufeisen
      kit.add(r >= 1 ? metal : "metal", W.sweep(W.arc(0, 0, 0.018, -0.4, PI + 0.4, 16), () => ({ wa: 0.004, wb: 0.004, th: 0.003 })), at(0, y + 0.006, 0, 0, 0, PI));
    } else if (v === 2) kit.add("stone", box(0.03, 0.042, 0.012, 0.006), at(0, y, 0));
    else {
      // Goetzenbild: kleine geschnitzte Figur
      kit.add("wood", lathe([[0.006, -0.03], [0.012, -0.022], [0.01, -0.008], [0.007, 0.0], [0.009, 0.006], [0.008, 0.014], [0.002, 0.018]], 8), at(0, y + 0.002, 0));
      for (const s of [-1, 1]) kit.add("leather2", sphere(0.0018, 5, 4), at(s * 0.003, y + 0.012, 0.008));
    }
    if (r <= 1 && v !== 1) for (const a of [0.6, -0.5]) kit.add("leather", ring(0.024, 0.0028, 16, 4), at(0, y, 0, 0, PI / 2, a, [1, 1.3, 0.7]));
    if (r >= 2) W.rune(kit, "rune", at(0, y, v === 2 ? 0.0075 : 0.018), v + 2, 0.011);
    if (r === 2) {
      const cage = [[0, -0.032], [0.022, 0], [0, 0.03], [-0.022, 0]].map((p) => [p[0], p[1] + y]);
      loop(kit, metal, cage, 0.0022, () => 0.014);
      loop(kit, metal, cage, 0.0022, () => -0.014);
    }
    if (r === 3) {
      // Laterne mit Flamme
      kit.add("glass", new T.CylinderGeometry(0.02, 0.02, 0.05, 8), at(0, y, 0));
      kit.add("glow", new T.ConeGeometry(0.008, 0.022, 8), at(0, y - 0.005, 0));
      for (const yy of [y + 0.027, y - 0.027]) kit.add(metal, new T.CylinderGeometry(0.023, 0.023, 0.006, 8), at(0, yy, 0));
      for (let i = 0; i < 4; i++) kit.add(metal, box(0.003, 0.05, 0.003), at(Math.cos((i * PI) / 2 + PI / 4) * 0.021, y, Math.sin((i * PI) / 2 + PI / 4) * 0.021));
      W.spike(kit, metal, [0, y - 0.03, 0], [0, -1, 0], 0.015, 0.006, 6);
    }
    if (r >= 4) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI;
        kit.add("gold", ring(0.027, 0.0022, 20, 4), at(0, y, 0, 0, a, 0, [1, 1.3, 1]));
      }
      kit.add("glow", gem(0.01, 0.028, 6), at(0, y, 0));
      W.spike(kit, "gold", [0, y - 0.035, 0], [0, -1, 0], 0.02, 0.005, 4);
    }
  });
})();
