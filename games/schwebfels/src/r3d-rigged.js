/* Helden von Schwebfels - Figuren mit eigenem Skelett und abgespielten Bewegungen (Meshy-Strecke).
   Die Figuren kommen aus assets-src/gen/meshy_import.py ueber assets/gen.pack (Art "rig"). Jeder Knochen hat keine eigene
   Ruhedrehung, deshalb passen die gemeinsamen Bewegungen ("clips") auf jede Figur mit gleichen Knochennamen; der
   Hueftweg wird auf die Huefthoehe der Figur umgerechnet.
   Die Spielbewegungen (idle, walk, attack, cast, shoot, hit, block, evade, victory, defeat, special, sit, drink,
   hammer) waehlen je Kampfstil und Waffe einen Clip. Bei Schlaegen trifft der schnellste Moment der Hand genau dann,
   wenn das Spiel die Bewegung beendet; danach klingt der Clip in die Ruhe aus. Spiellogik und Takt bleiben gleich. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const R = (SB.R3D = SB.R3D || {});
  const RG = (R.rigged = R.rigged || {});
  let T = null;

  const GEN = () => (SB.assets && SB.assets.data && SB.assets.data.gen) || {};
  const CLIPS = () => (SB.assets && SB.assets.data && SB.assets.data.clips) || {};
  RG.is = (key) => !!(GEN()[key] && GEN()[key].kind === "rig");
  // Figur, die im Spiel automatisch fuer dieses Volk und Geschlecht steht (gen_pack.py ohne --no-auto). Gibt es
  // mehrere, waehlt die Frisur aus dem Aussehen zwischen ihnen (so sehen auch Inselbewohner verschieden aus).
  RG.variants = function (race, gender) {
    const g = gender === "w" ? "f" : "m";
    const G0 = GEN();
    return Object.keys(G0)
      .filter((k) => G0[k].use && G0[k].kind === "rig" && G0[k].use.race === race && G0[k].use.gender === g)
      .sort();
  };
  RG.auto = function (race, gender, variant) {
    const all = RG.variants(race, gender);
    return all.length ? all[Math.abs(variant | 0) % all.length] : null;
  };

  /* ---------- Bewegungswahl ---------- */
  // Kandidaten je Spielbewegung, der erste vorhandene Clip gewinnt (Namen aus der Meshy-Bibliothek, danach allgemeine)
  const W1 = {
    schwert: ["Right_Hand_Sword_Slash", "Left_Slash", "Attack"],
    axt: ["Charged_Axe_Chop", "Heavy_Hammer_Swing", "Attack"],
    hammer: ["Heavy_Hammer_Swing", "Charged_Axe_Chop", "Attack"],
    speer: ["Thrust_Slash", "Attack"],
    stab: ["Left_Slash", "Attack"],
    // Waffe fest im Modell in der linken Hand (Monster aus dem Monsterkonzept, etwa der Eiskobold)
    links: ["Left_Slash", "Attack"],
  };
  const MELEE = ["Right_Hand_Sword_Slash", "Attack", "Punch"];
  RG.candidates = function (m, action, gender) {
    const w = m.weaponBase;
    const A = m.arch;
    switch (action) {
      case "idle":
        // Monster stehen ruhig (der Kampfstand der Helden ist ein Schwertstand und verdreht grosse Koerper)
        return A === "magier" || m.monArch ? ["Idle", "Combat_Stance", "Idle_02"] : ["Combat_Stance", "Idle", "Idle_02"];
      case "walk":
        return ["Walk_Fight_Forward", "Casual_Walk", "Walking_Woman", "Walk", "Walking"];
      case "attack":
        // Doppelklingen: Kombination statt Wirbel (der Wirbel traegt die Figur weit aus ihrem Platz)
        return (m.dual ? ["Double_Combo_Attack", "Thrust_Slash", "Double_Blade_Spin"] : W1[w] || []).concat(MELEE);
      case "special":
        return (A === "magier" ? ["Charged_Spell_Cast_1", "Charged_Spell_Cast", "Charged_Ground_Slam"] : A === "jaeger" ? ["Draw_and_Shoot_from_Back", "Archery_Shot"] : A === "schurke" ? ["Triple_Combo_Attack", "Double_Combo_Attack", "Double_Blade_Spin"] : ["Sword_Judgment", "Triple_Combo_Attack", "Charged_Slash"]).concat(MELEE);
      case "shoot":
        return (w === "speer" ? ["Thrust_Slash"] : ["Archery_Shot", "Draw_and_Shoot_from_Back"]).concat(["Charged_Spell_Cast"], MELEE);
      case "cast":
        return ["Charged_Spell_Cast", "mage_soell_cast", "Charged_Spell_Cast_1", "ThumbsUp"].concat(MELEE);
      case "hit":
        return ["Hit_Reaction", "Hit_Reaction_1", "Face_Punch_Reaction", "No"];
      case "block":
        return m.shield ? ["Block1", "Sword_Parry", "Two_Handed_Parry", "No"] : ["Sword_Parry", "Two_Handed_Parry", "Block1", "No"];
      case "evade":
        return ["Stand_Dodge", "Stand_Dodge_1", "Roll_Dodge", "Jump"];
      case "victory":
        return ["Cheer_with_Both_Hands_Up", "Victory_Cheer", "Motivational_Cheer", "ThumbsUp", "Wave", "Yes"];
      case "defeat":
        return ["Dead", "Knock_Down", "dying_backwards", "Death"];
      case "sit":
        return gender === "w" ? ["Chair_Sit_Idle_F", "Chair_Sit_Idle_M", "Sitting"] : ["Chair_Sit_Idle_M", "Chair_Sit_Idle_F", "Sitting"];
      case "drink":
        return ["Sit_and_Drink"].concat(RG.candidates(m, "sit", gender));
      case "hammer":
        return ["Heavy_Hammer_Swing", "Charged_Axe_Chop"].concat(MELEE);
    }
    return RG.candidates(m, "idle", gender);
  };
  const KIND = { idle: "loop", walk: "loop", sit: "loop", drink: "loop", hammer: "loop", victory: "free", defeat: "hold" };
  const BODY_HIT = { hit: 1, evade: 1 };
  // Feinabstimmung einzelner Clips, falls die automatische Schlagmarke nicht passt: { Name: { hit: Sekunden } }
  RG.MARKS = {};
  // Waffenlage in der Hand: Drehung um den Griff (twist) und Neigung (tilt) in Bogenmass
  RG.GRIP = { twist: 0, tilt: 0 };
  // Dolche im Rueckhandgriff (Klinge an der Kleinfingerseite): im Kampfstand von Meshy zeigten die Klingen sonst zum
  // eigenen Gesicht. Etwas vom Unterarm weg geneigt und groesser, damit man sie auch an grossen Figuren (Trollblut) sieht.
  RG.REVERSE = { dolch: { tilt: 0.6, scale: 1.4 } };
  // Hueftweg der Bewegungen zur Seite und nach vorn nur zum Teil uebernehmen: die Spielbewegung fuehrt die Figur selbst,
  // ganze Wege (Wirbel, Taumeln, Fallen) truegen sie sonst weit aus ihrem Platz. Gehen und Laufen bleiben auf der Stelle.
  RG.ROOT_XZ = 0.3;
  // Lange Staebe bleiben weitgehend aufrecht in der Hand (wie ein Wanderstab); die Bewegungen der Bibliothek sind ohne
  // Stab aufgenommen, die locker gedrehte Hand liesse ihn sonst waagerecht durch den Koerper schwingen
  RG.STAFF = { stab: 0.8, runenstab: 0.8 };

  /* ---------- Geometrie, Material, Skelett ---------- */
  const GGEO = {};
  function geo(key, E, hide, ck, FG) {
    ck = ck || key;
    if (GGEO[ck]) return GGEO[ck];
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(E.pos, 3));
    g.setAttribute("normal", new T.BufferAttribute(R.human.smoothNormals(E.pos, E.idx), 3));
    g.setAttribute("uv", new T.BufferAttribute(E.uv, 2));
    const fs = fingerSkin(FG, E.pos, E.skinI, E.skinW, 255);
    g.setAttribute("skinIndex", new T.BufferAttribute(fs ? fs.si : E.skinI, 4));
    g.setAttribute("skinWeight", fs ? new T.BufferAttribute(fs.sw, 4) : new T.BufferAttribute(E.skinW, 4, true));
    let idx = E.idx;
    if (hide) {
      const out = [];
      for (let t = 0; t < idx.length / 3; t++) if (!hide(t)) out.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
      idx = new Uint32Array(out);
    }
    g.setIndex(new T.BufferAttribute(idx, 1));
    return (GGEO[ck] = g);
  }
  const GMAT = {};
  // nref: Normalenkarte aus Meshy (enable_pbr), bringt Falten, Naehte und Verzierungen ohne mehr Dreiecke
  function mat(key, ref, color, texKey, nref) {
    if (GMAT[key]) return GMAT[key];
    const tk = texKey || "rig." + key;
    const m = new T.MeshStandardMaterial({ color: new T.Color(color || "#ffffff"), roughness: 0.75, metalness: 0, map: ref ? SB.assets.texture(tk, ref, { srgb: true }) : null });
    if (nref) m.normalMap = SB.assets.texture(tk + ".n", nref, { srgb: false });
    return (GMAT[key] = m);
  }
  function makeBones(E) {
    const S = E.skel;
    const r = S.rest;
    const bones = S.names.map((nm) => {
      const b = new T.Bone();
      b.name = nm;
      return b;
    });
    S.parents.forEach((p, i) => {
      if (p < 0) bones[i].position.set(r[i * 3], r[i * 3 + 1], r[i * 3 + 2]);
      else {
        bones[i].position.set(r[i * 3] - r[p * 3], r[i * 3 + 1] - r[p * 3 + 1], r[i * 3 + 2] - r[p * 3 + 2]);
        bones[p].add(bones[i]);
      }
      bones[i].userData.p0 = bones[i].position.clone();
    });
    return bones;
  }

  /* ---------- Finger ----------
     Meshy-Skelette haben keine Fingerknochen: die Haende bleiben in jeder Bewegung so offen wie im Modell, ein Griff
     steckte mitten in der Hand. Je Hand entstehen hier zwei Fingerglieder aus der Lage der Ecken (Knoechel und
     Mittelgelenk entlang der Hand). Mit Waffe schliessen sie sich um den Griff, und der Griff sitzt in der Faust.
     RG.FIST: Beugung beider Glieder im festen Griff (Bogenmass, schon gebeugte Finger werden nur nachgebeugt) und Lage
     von Knoechel und Mittelgelenk als Anteil der Handlaenge. */
  RG.FIST = { a1: 1.35, a2: 1.45, k1: 0.5, k2: 0.73 };
  const FING = {};
  function fingers(key, E) {
    if (FING[key] !== undefined) return FING[key];
    const V = (a) => new T.Vector3(a[0], a[1], a[2]);
    const S = E.skel;
    const r = S.rest;
    const pos = E.pos;
    const out = {};
    let next = S.names.length;
    for (const sd of ["R", "L"]) {
      const hb = E.map["hand." + sd];
      const g = E.sockets && E.sockets["grip" + sd];
      const arm = E.sockets && E.sockets["arm" + sd];
      if (hb == null || !g || !arm || !arm.dorsal || E.map["fing1." + sd] !== hb) continue;
      const H = new T.Vector3(r[hb * 3], r[hb * 3 + 1], r[hb * 3 + 2]);
      const ax = V(g.axis).normalize();
      const fa = V(g.along);
      fa.addScaledVector(ax, -fa.dot(ax)).normalize();
      const d0 = V(arm.dorsal);
      d0.addScaledVector(ax, -d0.dot(ax)).normalize();
      // Ecken der Hand (ueberwiegend am Handknochen)
      const vs = [];
      for (let i = 0; i < pos.length / 3; i++) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (E.skinI[i * 4 + k] === hb) w += E.skinW[i * 4 + k];
        if (w >= 128) vs.push(new T.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).sub(H));
      }
      if (vs.length < 30) continue;
      let tmax = 0;
      for (const q of vs) tmax = Math.max(tmax, q.dot(fa));
      // Handrichtung: vom Handgelenk zur Mitte der Knoechel (haengende Haende zeigen schraeg nach unten)
      const c = new T.Vector3();
      let n = 0;
      for (const q of vs) {
        const t = q.dot(fa);
        if (t > 0.38 * tmax && t < 0.56 * tmax) {
          c.add(q);
          n++;
        }
      }
      const h = n ? c.divideScalar(n) : fa.clone();
      h.addScaledVector(ax, -h.dot(ax)).normalize();
      if (h.dot(fa) < 0.6) h.copy(fa);
      const d = new T.Vector3().crossVectors(ax, h).normalize();
      if (d.dot(d0) < 0) d.negate();
      const ts = vs.map((q) => q.dot(h)).sort((a, b) => a - b);
      const L = ts[Math.floor(ts.length * 0.98)];
      const F = RG.FIST;
      // Gelenk in der Mitte der Handdicke an dieser Stelle
      const joint = (k) => {
        let lo = 1e9;
        let hi = -1e9;
        for (const q of vs) {
          if (Math.abs(q.dot(h) - k * L) > 0.05 * L) continue;
          const nn = q.dot(d);
          lo = Math.min(lo, nn);
          hi = Math.max(hi, nn);
        }
        const p = H.clone().addScaledVector(h, k * L);
        return hi > lo ? { p: p.addScaledVector(d, (lo + hi) / 2), th: hi - lo } : { p, th: 0.1 * L };
      };
      const j1 = joint(F.k1);
      const j2 = joint(F.k2);
      // vorhandene Beugung (zur Handflaeche positiv): Glied 1 gegen die Hand, Glied 2 gegen Glied 1
      const ang = (v) => Math.atan2(-v.dot(d), v.dot(h));
      const tip = new T.Vector3();
      n = 0;
      for (const q of vs) {
        if (q.dot(h) > (F.k2 + 0.12) * L) {
          tip.add(q);
          n++;
        }
      }
      const b1 = ang(j2.p.clone().sub(j1.p));
      const b2 = n ? ang(tip.divideScalar(n).add(H).sub(j2.p)) - b1 : 0;
      // Drehsinn: Fingerspitzen zur Handflaeche (weg vom Handruecken)
      const sgn = new T.Vector3().crossVectors(ax, h).dot(d) > 0 ? -1 : 1;
      out[sd] = {
        hb,
        i1: next,
        i2: next + 1,
        H,
        h,
        d,
        ax,
        sgn,
        L,
        k1: F.k1 * L,
        k2: F.k2 * L,
        b: 0.06 * L,
        p1: j1.p,
        p2: j2.p,
        th: j1.th,
        a1: Math.max(0.15, F.a1 - Math.max(0, b1)),
        a2: Math.max(0.15, F.a2 - Math.max(0, b2)),
      };
      next += 2;
    }
    for (const sd in out) {
      // Mitte der Faust bei vollem Griff: Gelenkpunkte und Spitze der gebeugten Finger umschliessen sie
      const f = out[sd];
      const q1 = new T.Quaternion().setFromAxisAngle(f.ax, f.sgn * f.a1);
      const q2 = new T.Quaternion().setFromAxisAngle(f.ax, f.sgn * f.a2);
      const p2 = f.p2.clone().sub(f.p1).applyQuaternion(q1).add(f.p1);
      const tipD = f.h.clone().applyQuaternion(q2).applyQuaternion(q1);
      const tip = p2.clone().addScaledVector(tipD, f.L - f.k2);
      // Handflaeche unter dem Knoechel
      const palm = f.p1.clone().addScaledVector(f.d, -f.th * 0.5).addScaledVector(f.h, -0.12 * f.L);
      f.fist = palm.add(p2).add(tip).divideScalar(3);
    }
    return (FING[key] = Object.keys(out).length ? out : null);
  }
  // Gewichte der Handecken auf die Fingerglieder verteilen (Knochen wie in fingers, Gewichte als 0..1 oder 0..255)
  function fingerSkin(FG, pos, si, sw, full) {
    if (!FG) return null;
    const n = pos.length / 3;
    const SI = new Uint16Array(si.length);
    const SW = new Float32Array(sw.length);
    const q = new T.Vector3();
    const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    const hands = new Set(Object.keys(FG).map((sd) => FG[sd].hb));
    for (let i = 0; i < n; i++) {
      let any = false;
      for (let k = 0; k < 4; k++) if (sw[i * 4 + k] > 0 && hands.has(si[i * 4 + k])) any = true;
      if (!any) {
        // Ecke ohne Hand: Gewichte unveraendert uebernehmen
        for (let k = 0; k < 4; k++) {
          SI[i * 4 + k] = si[i * 4 + k];
          SW[i * 4 + k] = sw[i * 4 + k] / full;
        }
        continue;
      }
      const acc = {};
      for (let k = 0; k < 4; k++) {
        const w = sw[i * 4 + k] / full;
        if (w > 0) acc[si[i * 4 + k]] = (acc[si[i * 4 + k]] || 0) + w;
      }
      for (const sd in FG) {
        const f = FG[sd];
        const wh = acc[f.hb];
        if (!wh) continue;
        q.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).sub(f.H);
        const t = q.dot(f.h);
        const a1 = sm((t - f.k1 + f.b) / (2 * f.b));
        if (!a1) continue;
        const a2 = sm((t - f.k2 + f.b) / (2 * f.b));
        acc[f.hb] = wh * (1 - a1);
        acc[f.i1] = wh * a1 * (1 - a2);
        acc[f.i2] = wh * a1 * a2;
      }
      const top = Object.keys(acc)
        .map((b) => [+b, acc[b]])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);
      const sum = top.reduce((s, x) => s + x[1], 0) || 1;
      top.forEach(([b, w], k) => {
        SI[i * 4 + k] = b;
        SW[i * 4 + k] = w / sum;
      });
    }
    return { si: SI, sw: SW };
  }
  // zwei Fingerglieder je Hand an das Skelett haengen (Reihenfolge wie in fingers)
  function addFingers(FG, bones) {
    for (const sd of ["R", "L"]) {
      const f = FG && FG[sd];
      if (!f) continue;
      const b1 = new T.Bone();
      const b2 = new T.Bone();
      b1.name = "fingers1." + sd;
      b2.name = "fingers2." + sd;
      b1.position.copy(f.p1).sub(f.H);
      b2.position.copy(f.p2).sub(f.p1);
      bones[f.hb].add(b1);
      b1.add(b2);
      bones[f.i1] = b1;
      bones[f.i2] = b2;
    }
  }

  // Kopfmass fuer feste Kopfteile (Helme): wie R.gear.fitOf, aber aus dem Netz der Figur
  const HFIT = {};
  function headFit(E) {
    const H = SB.assets.data.humans;
    const ji = (n) => H.bones.findIndex((b) => b[0] === n);
    const hi = ji("head");
    const a = [E.j[hi * 3], E.j[hi * 3 + 1], E.j[hi * 3 + 2]];
    const a0 = [H.joints[hi * 3], H.joints[hi * 3 + 1], H.joints[hi * 3 + 2]];
    const armRx = /^(clavicle|upperarm|forearm|hand|thumb|fing)/;
    const armRig = new Set(Object.keys(E.map).filter((k) => armRx.test(k) && E.map[k] !== E.map.chest).map((k) => E.map[k]));
    const armBase = H.bones.map((b) => armRx.test(b[0]));
    function span(pos, skinI, isArm, y, band) {
      let x0 = 1e9;
      let x1 = -1e9;
      let z0 = 1e9;
      let z1 = -1e9;
      for (let i = 0; i < pos.length / 3; i++) {
        if (Math.abs(pos[i * 3 + 1] - y) > band || isArm(skinI[i * 4])) continue;
        x0 = Math.min(x0, pos[i * 3]);
        x1 = Math.max(x1, pos[i * 3]);
        z0 = Math.min(z0, pos[i * 3 + 2]);
        z1 = Math.max(z1, pos[i * 3 + 2]);
      }
      return x1 > x0 ? [x1 - x0, z1 - z0] : null;
    }
    const ky = (E.top - a[1]) / (2.0 - a0[1]);
    const s0 = span(H.pos, H.skinI, (b) => armBase[b], a0[1] + 0.09, 0.015);
    const s = span(E.pos, E.skinI, (b) => armRig.has(b), a[1] + 0.09 * ky, 0.015 * ky + 0.005) || s0;
    return { head: { o: a, o0: a0, s: [s[0] / s0[0], ky, s[1] / s0[1]] } };
  }

  /* ---------- Ruestungsteile (assets-src/gen/fit_piece.py) ----------
     Jedes Teil ist knochenbezogen gespeichert: je Ecke zwei Knochen mit Lage entlang des Knochens (t), Winkel um ihn
     und Abstand zur Koerperoberflaeche. Hier wird es ueber Querschnittsprofile auf den jeweiligen Koerper gelegt, so
     passt ein Teil auf schlanke und breite Figuren mit gleichen Knochennamen. Gleiches Verfahren wie fit_piece.py. */
  const PIECES = () => (SB.assets && SB.assets.data && SB.assets.data.rigPieces) || {};
  const SLOT = { ruestung: "brust", handschuhe: "handschuhe", stiefel: "stiefel", helm: "helm", hose: "hose" };
  // Knochenrahmen: Gelenk, Achse zum fortsetzenden Kind, Laenge, Querachsen
  function frames(E) {
    const S = E.skel;
    const r = S.rest;
    const n = S.names.length;
    const P = (i) => new T.Vector3(r[i * 3], r[i * 3 + 1], r[i * 3 + 2]);
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = P(i);
      const par = S.parents[i];
      let pd = par >= 0 ? p.clone().sub(P(par)) : new T.Vector3(0, 1, 0);
      const pl = pd.length();
      pd = pl > 1e-6 ? pd.divideScalar(pl) : new T.Vector3(0, 1, 0);
      let best = -2;
      let e = null;
      for (let c = 0; c < n; c++) {
        if (S.parents[c] !== i) continue;
        // Endknochen ohne eigene Kinder ("HeadTop_End") zaehlen nicht als Fortsetzung (wie fit_piece.frames)
        if (/end$/i.test(S.names[c]) && S.parents.indexOf(c) < 0) continue;
        const d = P(c).sub(p);
        const ln = d.length();
        if (ln < 1e-4) continue;
        const s = d.divideScalar(ln).dot(pd);
        if (s > best) {
          best = s;
          e = P(c);
        }
      }
      if (!e) e = p.clone().addScaledVector(pd, Math.max(0.05, 0.5 * pl));
      const a = e.clone().sub(p);
      const L = Math.max(a.length(), 1e-4);
      a.divideScalar(L);
      const ref = Math.abs(a.z) < 0.9 ? new T.Vector3(0, 0, 1) : new T.Vector3(0, 1, 0);
      const u = ref.clone().addScaledVector(a, -ref.dot(a)).normalize();
      const v = new T.Vector3().crossVectors(a, u);
      out.push({ p, a, L, u, v });
    }
    return out;
  }
  function tad(F, x, y, z) {
    const rx = x - F.p.x;
    const ry = y - F.p.y;
    const rz = z - F.p.z;
    const along = rx * F.a.x + ry * F.a.y + rz * F.a.z;
    const qx = rx - F.a.x * along;
    const qy = ry - F.a.y * along;
    const qz = rz - F.a.z * along;
    return [along / F.L, Math.atan2(qx * F.v.x + qy * F.v.y + qz * F.v.z, qx * F.u.x + qy * F.u.y + qz * F.u.z), Math.hypot(qx, qy, qz)];
  }
  const binT = (t, g) => Math.min(g[0] - 1, Math.max(0, Math.floor(((t - g[2]) / (g[3] - g[2])) * g[0])));
  const binA = (th, g) => ((Math.floor(((th + Math.PI) / (2 * Math.PI)) * g[1]) % g[1]) + g[1]) % g[1];
  const PROF = {};
  function profiles(key, E, g) {
    const ck = key + "|" + g.join(",");
    if (PROF[ck]) return PROF[ck];
    const Fr = frames(E);
    const nb = Fr.length;
    const [NT, NA] = g;
    const n = E.pos.length / 3;
    const PR = [];
    for (let b = 0; b < nb; b++) PR.push(new Float32Array(NT * NA));
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) {
        if (E.skinW[i * 4 + k] < 0.35 * 255) continue;
        const b = E.skinI[i * 4 + k];
        const [t, th, d] = tad(Fr[b], E.pos[i * 3], E.pos[i * 3 + 1], E.pos[i * 3 + 2]);
        const j = binT(t, g) * NA + binA(th, g);
        if (d > PR[b][j]) PR[b][j] = d;
      }
    }
    for (let b = 0; b < nb; b++) PR[b] = fill(PR[b], NT, NA);
    return (PROF[ck] = { Fr, R: PR });
  }
  // leere Felder aus den Nachbarn auffuellen, dann um die Achse leicht glaetten (wie fit_piece.fill)
  function fill(Q, NT, NA) {
    for (let it = 0; it < NT + NA; it++) {
      let empty = 0;
      const c = Q.slice();
      for (let t = 0; t < NT; t++) {
        for (let a = 0; a < NA; a++) {
          if (c[t * NA + a] > 0) continue;
          empty++;
          let s = 0;
          let m = 0;
          for (const [tt, aa] of [[t, (a + NA - 1) % NA], [t, (a + 1) % NA], [Math.max(0, t - 1), a], [Math.min(NT - 1, t + 1), a]]) {
            const x = c[tt * NA + aa];
            if (x > 0) {
              s += x;
              m++;
            }
          }
          if (m) Q[t * NA + a] = s / m;
        }
      }
      if (!empty) break;
    }
    const c = Q.slice();
    for (let t = 0; t < NT; t++) {
      for (let a = 0; a < NA; a++) {
        const x = c[t * NA + a];
        const sm = (c[t * NA + ((a + NA - 1) % NA)] + 2 * x + c[t * NA + ((a + 1) % NA)]) / 4;
        Q[t * NA + a] = Math.max(sm, x * 0.97);
      }
    }
    return Q;
  }
  function sampleR(R, t, th, g) {
    const [NT, NA, T0, T1] = g;
    const ft = Math.min(NT - 1, Math.max(0, ((t - T0) / (T1 - T0)) * NT - 0.5));
    const fa = ((((th + Math.PI) / (2 * Math.PI)) * NA - 0.5) % NA + NA) % NA;
    const t0 = Math.floor(ft);
    const t1 = Math.min(t0 + 1, NT - 1);
    const a0 = Math.floor(fa) % NA;
    const a1 = (a0 + 1) % NA;
    const wt = ft - t0;
    const wa = fa - Math.floor(fa);
    return (R[t0 * NA + a0] * (1 - wa) + R[t0 * NA + a1] * wa) * (1 - wt) + (R[t1 * NA + a0] * (1 - wa) + R[t1 * NA + a1] * wa) * wt;
  }
  // Geometrie eines Teils auf diesem Koerper
  const PGEO = {};
  function pieceGeo(name, key, E) {
    const ck = name + "|" + key;
    if (PGEO[ck]) return PGEO[ck];
    const Pc = PIECES()[name];
    const g = Pc.grid;
    const { Fr, R: PR } = profiles(key, E, g);
    const bi = Pc.bones.map((b) => E.skel.names.indexOf(b));
    const n = Pc.uv.length / 2;
    const pos = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const w0 = Pc.w[i] / 255;
      let acc = 0;
      for (let k = 0; k < 2; k++) {
        const b = bi[Pc.bone[i * 2 + k]];
        const w = k ? 1 - w0 : w0;
        if (b < 0 || w <= 0) continue;
        const F = Fr[b];
        const t = Pc.tto[(i * 2 + k) * 3];
        const th = Pc.tto[(i * 2 + k) * 3 + 1];
        const rad = Math.max(0.002, sampleR(PR[b], t, th, g) + Pc.tto[(i * 2 + k) * 3 + 2]);
        const c = Math.cos(th);
        const s = Math.sin(th);
        for (const [j, ax] of [[0, "x"], [1, "y"], [2, "z"]]) pos[i * 3 + j] += w * (F.p[ax] + F.a[ax] * t * F.L + (F.u[ax] * c + F.v[ax] * s) * rad);
        si[i * 4 + k] = b;
        sw[i * 4 + k] = w;
        acc += w;
      }
      if (acc > 0 && acc < 1) {
        for (let j = 0; j < 3; j++) pos[i * 3 + j] /= acc;
        sw[i * 4] /= acc;
        sw[i * 4 + 1] /= acc;
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new T.BufferAttribute(R.human.smoothNormals(pos, Pc.idx), 3));
    geo.setAttribute("uv", new T.BufferAttribute(Pc.uv, 2));
    // Handschuhe beugen sich mit den Fingern
    const fs = fingerSkin(fingers(key, E), pos, si, sw, 1);
    geo.setAttribute("skinIndex", new T.BufferAttribute(fs ? fs.si : si, 4));
    geo.setAttribute("skinWeight", new T.BufferAttribute(fs ? fs.sw : sw, 4));
    geo.setIndex(new T.BufferAttribute(Pc.idx, 1));
    return (PGEO[ck] = geo);
  }
  // Haut unter einem Teil: Dreiecke, deren Ecken alle in belegten Feldern ihres Hauptknochens liegen
  function pieceHide(names, key, E) {
    const D = [];
    for (const nm of names) {
      const Pc = PIECES()[nm];
      const { Fr } = profiles(key, E, Pc.grid);
      const occ = {};
      for (const b in Pc.occ) {
        const i = E.skel.names.indexOf(b);
        if (i >= 0) occ[i] = Pc.occ[b];
      }
      D.push({ Fr, occ, g: Pc.grid });
    }
    const n = E.pos.length / 3;
    const cov = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const b = E.skinI[i * 4];
      for (const d of D) {
        const bits = d.occ[b];
        if (!bits) continue;
        const [t, th] = tad(d.Fr[b], E.pos[i * 3], E.pos[i * 3 + 1], E.pos[i * 3 + 2]);
        const j = binT(t, d.g) * d.g[1] + binA(th, d.g);
        if ((bits[j >> 3] >> (j & 7)) & 1) {
          cov[i] = 1;
          break;
        }
      }
    }
    const idx = E.idx;
    return (t) => cov[idx[t * 3]] && cov[idx[t * 3 + 1]] && cov[idx[t * 3 + 2]];
  }
  // Teile, die zur getragenen Ausruestung passen (Form oder Grundart, sonst jedes Teil des Platzes ohne Formliste)
  // genaue Form vor Grundart vor Teil ohne Formliste; ein Teil mit Seltenheiten gilt nur fuer diese und geht dann vor
  RG.piecesFor = function (gear, culture) {
    const out = [];
    const L = PIECES();
    for (const slot in SLOT) {
      const it = gear && gear[slot];
      if (!it) continue;
      const V = R.gear && R.gear.visOf ? R.gear.visOf(it, culture) : { form: it.base, base: it.base };
      let pick = null;
      let best = -1;
      for (const nm of Object.keys(L).sort()) {
        const Pc = L[nm];
        if (Pc.slot !== SLOT[slot]) continue;
        const f = Pc.forms.indexOf(V.form) >= 0 ? 4 : Pc.forms.indexOf(V.base) >= 0 ? 2 : !Pc.forms.length ? 0 : -1;
        if (f < 0) continue;
        const rar = Pc.rarity && Pc.rarity.length ? Pc.rarity : null;
        if (rar && rar.indexOf(it.rarity) < 0) continue;
        const sc = f + (rar ? 1 : 0);
        if (sc > best) {
          best = sc;
          pick = nm;
        }
      }
      if (pick) out.push(pick);
    }
    return out;
  };

  /* ---------- Erzeugte Waffen und Schilde (assets-src/gen/weapon.py) ----------
     Feste Form mit Griffpunkt im Ursprung in der Lage der gebauten Waffen; ersetzt die gebaute Waffe bei jedem Helden,
     wenn Grundart und (falls angegeben) Form oder Seltenheit passen. */
  const WEAPONS = () => (SB.assets && SB.assets.data && SB.assets.data.genWeapons) || {};
  RG.weaponName = function (it, culture) {
    const L = WEAPONS();
    if (!it || !Object.keys(L).length) return null;
    if (it.gen && L[it.gen]) return it.gen; // ausdruecklich gewaehlt (Werkstattbilder)
    const V = R.gear && R.gear.visOf ? R.gear.visOf(it, culture) : { form: it.base, base: it.base };
    let best = null;
    let score = -1;
    for (const nm of Object.keys(L).sort()) {
      const W = L[nm];
      if (W.base !== V.base) continue;
      if (W.forms.length && W.forms.indexOf(V.form) < 0 && W.forms.indexOf(V.base) < 0) continue;
      if (W.rarity.length && W.rarity.indexOf(it.rarity) < 0) continue;
      const sc = (W.forms.indexOf(V.form) >= 0 ? 2 : 0) + (W.rarity.length ? 1 : 0);
      if (sc > score) {
        best = nm;
        score = sc;
      }
    }
    return best;
  };
  const WGEO = {};
  function weaponMesh(name) {
    T = R.T();
    const W = WEAPONS()[name];
    if (!WGEO[name]) {
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.BufferAttribute(W.pos, 3));
      g.setAttribute("normal", new T.BufferAttribute(R.human.smoothNormals(W.pos, W.idx), 3));
      g.setAttribute("uv", new T.BufferAttribute(W.uv, 2));
      g.setIndex(new T.BufferAttribute(W.idx, 1));
      WGEO[name] = g;
    }
    const m = new T.Mesh(WGEO[name], mat("weapon." + name, W.tex, null, "weapon." + name, W.ntex));
    m.castShadow = true;
    return m;
  }
  RG.weaponFor = function (it, culture) {
    const nm = RG.weaponName(it, culture);
    if (!nm || !R.ready()) return null;
    T = R.T();
    const g = new T.Group();
    g.add(weaponMesh(nm));
    g.userData.genWeapon = nm;
    return g;
  };

  /* ---------- Requisiten der Kampfumgebung (assets-src/gen/prop.py) ----------
     Je Reich Baeume, Dekorationen und ein Wahrzeichen; die Kampfbuehne nimmt sie statt der gebauten. */
  const PROPS = () => (SB.assets && SB.assets.data && SB.assets.data.genProps) || {};
  RG.propsFor = function (realm) {
    const L = PROPS();
    const out = { baum: [], deko: [], wahrzeichen: [] };
    for (const nm of Object.keys(L).sort()) if (L[nm].realm === realm && out[L[nm].role]) out[L[nm].role].push(nm);
    return out.baum.length || out.deko.length || out.wahrzeichen.length ? out : null;
  };
  const PGEOM = {};
  RG.prop = function (name) {
    T = R.T();
    const E = PROPS()[name];
    if (!PGEOM[name]) {
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.BufferAttribute(E.pos, 3));
      g.setAttribute("normal", new T.BufferAttribute(R.human.smoothNormals(E.pos, E.idx), 3));
      g.setAttribute("uv", new T.BufferAttribute(E.uv, 2));
      g.setIndex(new T.BufferAttribute(E.idx, 1));
      PGEOM[name] = g;
    }
    const m = new T.Mesh(PGEOM[name], mat("prop." + name, E.tex, null, "prop." + name, E.ntex));
    m.material.roughness = 0.85;
    m.castShadow = true;
    m.receiveShadow = true;
    const g = new T.Group();
    g.add(m);
    g.userData.genProp = name;
    return g;
  };

  /* Gegenstandsbild aus dem 3D-Modell selbst (passt so genau zum angelegten Modell). Ruestungsteile liegen dafuer in
     Ruhelage auf der ersten Figur mit eigenem Skelett, Waffen schraeg im Bild; jedes Bild wird einmal erzeugt. */
  const ICON = {};
  let iconR = null;
  let iconScene = null;
  let iconCam = null;
  function renderIcon(ck, size, make) {
    if (ICON[ck] !== undefined) return ICON[ck];
    if (!R.ready()) return (ICON[ck] = null);
    T = R.T();
    try {
      if (!iconR) {
        iconR = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        iconR.outputColorSpace = T.SRGBColorSpace;
        iconR.toneMapping = T.ACESFilmicToneMapping;
        iconR.toneMappingExposure = 1.15;
        iconScene = new T.Scene();
        if (R.envMap) iconScene.environment = R.envMap(iconR);
        iconScene.add(new T.HemisphereLight("#e6ecff", "#3a3028", 1.3));
        const k = new T.DirectionalLight("#fff0d8", 2.4);
        k.position.set(3, 5, 5);
        iconScene.add(k);
        iconCam = new T.PerspectiveCamera(30, 1, 0.01, 50);
      }
      const obj = make();
      if (!obj) return (ICON[ck] = null);
      iconR.setSize(size, size, false);
      iconScene.add(obj);
      obj.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(obj);
      const c = box.getCenter(new T.Vector3());
      const sz = box.getSize(new T.Vector3());
      const span = Math.max(sz.x, sz.y, sz.z * 0.8) * 1.12;
      iconCam.position.set(c.x, c.y + span * 0.08, c.z + span / (2 * Math.tan((30 * Math.PI) / 360)) + sz.z * 0.5);
      iconCam.lookAt(c);
      iconR.setClearColor(0x000000, 0);
      iconR.render(iconScene, iconCam);
      const url = iconR.domElement.toDataURL("image/png");
      iconScene.remove(obj);
      return (ICON[ck] = url);
    } catch (e) {
      console.warn("Gegenstandsbild fehlgeschlagen", e);
      return (ICON[ck] = null);
    }
  }
  RG.pieceIcon = function (name, size) {
    size = size || 128;
    return renderIcon(name + "|" + size, size, () => {
      const Pc = PIECES()[name];
      const key = Pc && GEN()[Pc.ref] && GEN()[Pc.ref].kind === "rig" ? Pc.ref : Object.keys(GEN()).find((k) => GEN()[k].kind === "rig");
      if (!Pc || !key) return null;
      let g = pieceGeo(name, key, GEN()[key]);
      if (Pc.slot === "handschuhe") {
        // nur der linke Handschuh, Finger nach unten
        const p = g.attributes.position.array;
        const idx = g.index.array;
        const keep = [];
        for (let t = 0; t < idx.length; t += 3) if (p[idx[t] * 3] > 0) keep.push(idx[t], idx[t + 1], idx[t + 2]);
        g = g.clone();
        g.setIndex(keep);
        g = g.toNonIndexed();
      }
      const mesh = new T.Mesh(g, mat("piece." + name, Pc.tex, null, "rigpiece." + name, Pc.ntex));
      if (Pc.slot === "handschuhe") mesh.rotation.z = -Math.PI / 2;
      mesh.rotation.y = 0.3;
      return mesh;
    });
  };
  RG.weaponIcon = function (name, size) {
    size = size || 128;
    return renderIcon("w|" + name + "|" + size, size, () => {
      const W = WEAPONS()[name];
      if (!W) return null;
      const m = weaponMesh(name);
      const g = new T.Group();
      g.add(m);
      // Schild von vorn, Waffen schraeg mit der Spitze nach rechts oben
      if (W.base === "schild") g.rotation.y = 0.3;
      else {
        m.rotation.y = 0.35;
        g.rotation.z = -Math.PI / 4;
      }
      return g;
    });
  };
  // Bild fuer einen Gegenstand, wenn ein passendes Ruestungsteil oder eine erzeugte Waffe existiert
  RG.iconFor = function (item) {
    const B = SB.data && SB.data.BASES && item && SB.data.BASES[item.base];
    if (!B) return null;
    const culture = (item.vis && item.vis.c) || "midgard";
    if (B.slot === "waffe" || B.slot === "nebenhand") {
      const w = RG.weaponName(item, culture);
      return w ? RG.weaponIcon(w) : null;
    }
    if (!SLOT[B.slot] || !Object.keys(PIECES()).length) return null;
    const names = RG.piecesFor({ [B.slot]: item }, culture);
    return names.length ? RG.pieceIcon(names[0]) : null;
  };

  /* ---------- Abspielen ---------- */
  const CC = {};
  // Clipname ohne Gross- und Sonderzeichen vergleichen ("Right Hand Sword Slash" = "Right_Hand_Sword_Slash")
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  let NSRC = null;
  let NIDX = null;
  function clipData(name) {
    const all = CLIPS();
    if (all[name]) return all[name];
    if (NSRC !== all) {
      NSRC = all;
      NIDX = {};
      for (const k in all) if (!NIDX[norm(k)]) NIDX[norm(k)] = k;
    }
    const k = NIDX[norm(name)];
    return k ? all[k] : null;
  }
  RG.hasClip = (name) => !!clipData(name);
  function clipFor(key, E, name, boneSet) {
    const ck = key + "|" + name;
    if (CC[ck] !== undefined) return CC[ck];
    const C = clipData(name);
    if (!C || !C.bones.some((b) => boneSet.has(b))) return (CC[ck] = null);
    const n = C.n;
    const nb = C.bones.length;
    const times = new Float32Array(n);
    for (let f = 0; f < n; f++) times[f] = f / C.fps;
    const tracks = [];
    for (let b = 0; b < nb; b++) {
      if (!boneSet.has(C.bones[b])) continue;
      const v = new Float32Array(n * 4);
      for (let f = 0; f < n; f++) for (let k = 0; k < 4; k++) v[f * 4 + k] = C.q[(f * nb + b) * 4 + k];
      tracks.push(new T.QuaternionKeyframeTrack(C.bones[b] + ".quaternion", times, v));
    }
    const hips = E.skel.names[E.map.hips];
    const ratio = E.hipsY / (C.hipsY || E.hipsY);
    const hv = new Float32Array(n * 3);
    let low = 1e9;
    for (let i = 0; i < n * 3; i++) hv[i] = C.hips[i] * ratio;
    if (!/walk|run/i.test(name))
      for (let f = 0; f < n; f++)
        for (const k of [0, 2]) hv[f * 3 + k] = hv[k] + (hv[f * 3 + k] - hv[k]) * RG.ROOT_XZ;
    for (let f = 0; f < n; f++) low = Math.min(low, hv[f * 3 + 1]);
    tracks.push(new T.VectorKeyframeTrack(hips + ".position", times, hv));
    const clip = new T.AnimationClip(name, C.d, tracks);
    const mk = RG.MARKS[name] || {};
    return (CC[ck] = { clip, name, hit: [mk.hit != null ? mk.hit : C.hit[0], mk.hit != null ? mk.hit : C.hit[1]], hipsLow: low, hipsAvg: hv.reduce((s, x, i) => (i % 3 === 1 ? s + x : s), 0) / n });
  }

  let QH = null, QW = null, QU = null, QI = null;
  function Player(model, mesh, key, E, gender) {
    if (!QH) {
      QI = new T.Quaternion();
      QH = new T.Quaternion();
      QW = new T.Quaternion();
      QU = new T.Quaternion();
    }
    this.m = model;
    this.key = key;
    this.E = E;
    this.gender = gender;
    this.mixer = new T.AnimationMixer(mesh);
    this.bones = new Set(E.skel.names);
    this.cur = null;
    this.ref = null;
    this.pending = null;
    this.clock = 0;
  }
  Player.prototype.pick = function (action) {
    for (const nm of RG.candidates(this.m, action, this.gender)) {
      const c = clipFor(this.key, this.E, nm, this.bones);
      if (c) return c;
    }
    return null;
  };
  Player.prototype.fade = function (act, t) {
    if (this.cur && this.cur.act !== act) this.cur.act.fadeOut(t);
    act.fadeIn(t).play();
  };
  // neue Spielbewegung mit Dauer: bei Schlaegen trifft der Schlag genau am Ende der Spieldauer
  Player.prototype.start = function (action, dur) {
    const c = this.pick(action);
    if (!c) return this.settle(this.m.hold || "idle");
    const kind = KIND[action] || "impact";
    let rate = this.m.speed || 1;
    let t0 = 0;
    let wait = 0;
    if (kind === "impact") {
      // Ausholen beschleunigen oder kuerzen, bei sehr kurzem Ausholen spaeter beginnen
      const hit = c.hit[BODY_HIT[action] ? 1 : 0];
      rate = Math.min(1.7, Math.max(0.6, hit / Math.max(dur, 0.05)));
      t0 = Math.max(0, hit - rate * dur);
      wait = Math.max(0, dur - (hit - t0) / rate);
    } else if (action === "walk") rate *= 1.15;
    const p = { action, kind, c, rate, t0 };
    // bis zum Start laeuft die bisherige Bewegung weiter (ein gleicher Schlag haelt so seine Endhaltung)
    this.pending = wait > 0.02 ? Object.assign(p, { at: this.clock + wait }) : null;
    if (!this.pending) this.go(p);
  };
  Player.prototype.go = function (p) {
    let act = this.mixer.clipAction(p.c.clip);
    // derselbe Clip noch einmal (zwei Schlaege nacheinander): zweite Spur, damit die Ueberblendung nicht durch die
    // Grundhaltung des Skeletts laeuft
    if (this.cur && this.cur.act === act) act = this.mixer.clipAction(p.c.alt || (p.c.alt = p.c.clip.clone()));
    act.reset();
    act.setLoop(p.kind === "loop" ? T.LoopRepeat : T.LoopOnce, Infinity);
    act.clampWhenFinished = p.kind !== "loop";
    act.timeScale = p.rate;
    act.time = p.t0;
    this.fade(act, p.kind === "impact" ? 0.1 : 0.2);
    this.cur = { action: p.action, act, kind: p.kind, c: p.c };
  };
  // Ruhe, Halten oder Dauerzustand (Sitzen, Gehen, Schmieden): laufende Bewegung natuerlich ausklingen lassen
  Player.prototype.settle = function (action) {
    this.pending = null;
    const cur = this.cur;
    if (cur && cur.action === action && cur.kind !== "impact" && cur.kind !== "free") return;
    if (cur && action === "defeat") return;
    if (cur) cur.act.timeScale = this.m.speed || 1;
    // Schlag, Treffer oder Ausweichen schwingen nach dem Spielmoment noch kurz aus (hoechstens 0,6 s), dann Ruhe
    if (cur && (cur.kind === "impact" || cur.kind === "free") && cur.action !== action) {
      if (cur.endAt == null) cur.endAt = this.clock;
      const left = (cur.c.clip.duration - cur.act.time) / Math.max(cur.act.timeScale, 0.01);
      if (cur.act.isRunning() && left > 0.3 && this.clock - cur.endAt < 0.6) return;
    }
    const c = this.pick(action);
    if (!c) {
      if (cur) cur.act.fadeOut(0.3);
      this.cur = null;
      return;
    }
    let act = this.mixer.clipAction(c.clip);
    // gleicher Clip als neuer Zustand (etwa Ersatzclip): zweite Spur, sonst blendet er aus der Grundhaltung ein
    if (cur && cur.act === act) act = this.mixer.clipAction(c.alt || (c.alt = c.clip.clone()));
    act.reset();
    act.setLoop(T.LoopRepeat, Infinity);
    act.clampWhenFinished = false;
    act.timeScale = this.m.speed || 1;
    this.fade(act, 0.3);
    this.cur = { action, act, kind: "loop", c };
  };
  // sofort in Ruhehaltung (ohne Einblenden), damit auch Portraits aus dem ersten Bild stimmen
  Player.prototype.init = function () {
    const c = this.pick("idle");
    if (!c) return;
    const act = this.mixer.clipAction(c.clip);
    act.setLoop(T.LoopRepeat, Infinity);
    act.play();
    act.time = Math.random() * c.clip.duration;
    this.cur = { action: "idle", act, kind: "loop", c };
    this.mixer.update(0);
  };
  // Stab aufrichten: Weltlage zwischen Handdrehung und senkrecht (Richtung der Figur) mischen. In der Faust dreht
  // das Handgelenk den groessten Teil mit (RG.STAFF_WRIST), sonst liefe der Stab neben der Faust statt durch sie.
  RG.STAFF_WRIST = 0.75;
  let QP = null, QC = null;
  Player.prototype.fixStaff = function () {
    const W = this.m.parts.weapon;
    const k = W && RG.STAFF[this.m.weaponBase];
    if (!k || !W.parent) return;
    if (!QP) {
      QP = new T.Quaternion();
      QC = new T.Quaternion();
    }
    if (!W.userData.q0) W.userData.q0 = W.quaternion.clone();
    const hb = W.parent;
    hb.updateWorldMatrix(true, false);
    const qh = hb.getWorldQuaternion(QH);
    const qw = QW.copy(qh).multiply(W.userData.q0);
    this.m.obj.getWorldQuaternion(QU);
    const target = QU.slerp(qw, 1 - k);
    if (this.m.parts.fistR && hb.parent) {
      // Drehung in Weltlage von der jetzigen Stablage zur Ziellage, ein Teil davon ins Handgelenk
      const c = QC.copy(target).multiply(qw.invert());
      c.slerp(QP.identity(), 1 - RG.STAFF_WRIST);
      qh.premultiply(c);
      hb.quaternion.copy(hb.parent.getWorldQuaternion(QP).invert().multiply(qh));
    }
    W.quaternion.copy(qh.invert().multiply(target));
  };
  Player.prototype.tick = function (dt) {
    const m = this.m;
    const a = m.anim;
    this.clock += dt;
    if (a && a !== this.ref) {
      this.ref = a;
      this.start(a.name, a.dur);
    } else if (!a) {
      this.ref = null;
      this.settle(m.hold || "idle");
    }
    if (this.pending && this.clock >= this.pending.at) {
      this.go(this.pending);
      this.pending = null;
    }
    this.mixer.update(dt);
    // steife Knochen (Kopf und Hals grosser Monster): Bewegung der Heldenbewegungen nur zum kleinen Teil uebernehmen
    if (this.stiff) for (const b of this.stiff) b.quaternion.slerp(QI, 0.85);
    this.fixStaff();
    // Sitzen: Huefte auf Bankhoehe wie bei den alten Figuren (Huefte 0,5 ueber dem Boden)
    const P = m.parts;
    const sit = this.cur && (this.cur.action === "sit" || this.cur.action === "drink");
    P.body.position.y = sit ? 0.5 - this.cur.c.hipsAvg : 0;
    if (P.focus) {
      P.focus.position.copy(P.focus.userData.hover);
      P.focus.position.y += 0.11 + Math.sin(m.t * 2.2) * 0.012;
      P.focus.rotation.y = m.t * 0.8;
    }
  };

  /* ---------- Held ---------- */
  RG.build = function (desc, key) {
    T = R.T();
    const D = SB.data;
    const E = GEN()[key];
    const clsId = D.CLASSES[desc.cls] ? desc.cls : "schildritter";
    const C = D.CLASSES[clsId];
    const gear = desc.gear || {};
    const root = R.grp();
    const body = R.grp();
    root.add(body);
    const bones = makeBones(E);
    const FG = fingers(key, E);
    addFingers(FG, bones);
    const worn = (desc.genGear || []).filter((p) => E.pieces && E.pieces[p]);
    const masks = worn.map((p) => E.pieces[p].mask).filter(Boolean);
    // Ruestungsteile aus dem gemeinsamen Teil: ausdruecklich genannt oder passend zur getragenen Ausruestung
    const culture = desc.realm || C.realm;
    const rp = [...new Set((desc.genGear || []).filter((p) => PIECES()[p]).concat(desc.noRigPieces ? [] : RG.piecesFor(gear, culture)))];
    // Koerpernetz ohne verdeckte Haut, je Kombination einmal berechnet
    const gk = key + "|" + worn.concat(rp).join(",");
    const rpHide = rp.length && !GGEO[gk] ? pieceHide(rp, key, E) : null;
    const hide = masks.length || rpHide ? (t) => masks.some((mk) => (mk[t >> 3] >> (t & 7)) & 1) || (rpHide && rpHide(t)) : null;
    const mesh = new T.SkinnedMesh(geo(key, E, hide, gk, FG), mat(key, E.tex, null, null, E.ntex));
    E.skel.parents.forEach((p, i) => p < 0 && mesh.add(bones[i]));
    mesh.updateMatrixWorld(true);
    mesh.bind(new T.Skeleton(bones));
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    body.add(mesh);
    for (const p of worn) {
      const src = E.pieces[p];
      const pg = geo(key + "." + p, src, null, null, src.skinI ? FG : null);
      const pm = new T.SkinnedMesh(pg, mat(key + "." + p, src.tex, src.tex ? null : src.color || "#6b4a32"));
      pm.bind(mesh.skeleton, mesh.bindMatrix);
      pm.frustumCulled = false;
      pm.castShadow = true;
      body.add(pm);
    }
    for (const nm of rp) {
      const Pc = PIECES()[nm];
      const pm = new T.SkinnedMesh(pieceGeo(nm, key, E), mat("piece." + nm, Pc.tex, null, "rigpiece." + nm, Pc.ntex));
      pm.bind(mesh.skeleton, mesh.bindMatrix);
      pm.frustumCulled = false;
      pm.castShadow = true;
      body.add(pm);
    }
    // Spielgelenke (Huefte, Haende, Kopf ...) zeigen auf Knochen der Figur; fehlende Finger auf die Hand
    const B = {};
    for (const k in E.map) B[k] = bones[E.map[k]];
    const rig = { J: E.j, by: B };
    const pk = "rig:" + key;
    const parts = { root, body, mesh, rig, B, prof: { j: E.j, top: E.top, sockets: E.sockets }, pk, gen: true };
    if (R.gear && R.gear.setFit) R.gear.setFit(pk, HFIT[key] || (HFIT[key] = headFit(E)));
    // ein getragener Helm als Ruestungsteil ersetzt den gebauten Helm
    const rigid = rp.some((nm) => PIECES()[nm].slot === "helm") ? Object.assign({}, gear, { helm: null }) : gear;
    if (R.gear && R.gear.attachRigid) R.gear.attachRigid(parts, rigid, culture);
    // Stellschraube fuer die Waffenlage in der Hand (nach den ersten echten Meshy-Schlaegen abstimmen)
    const rev = gear.waffe && RG.REVERSE[gear.waffe.base];
    for (const w of [parts.weapon, parts.weapon2]) {
      if (!w) continue;
      if (RG.GRIP.twist) w.rotateY(RG.GRIP.twist);
      if (RG.GRIP.tilt) w.rotateZ(RG.GRIP.tilt);
      if (rev) {
        w.rotateZ(Math.PI);
        w.rotateX(rev.tilt || 0);
        // kleinere Figuren (Glutzwerg) etwas kleinere Klingen
        w.scale.multiplyScalar(1 + ((rev.scale || 1) - 1) * Math.max(0.5, Math.min(1, (E.top - 1.3) / 0.8)));
      }
    }
    // Faust um den Griff: Finger beugen sich (die Bewegungen bewegen keine Finger, die Lage bleibt), die Waffe
    // wandert aus der Handmitte in die Faust
    for (const sd in FG || {}) {
      const f = FG[sd];
      if (!parts["grip" + sd]) continue;
      bones[f.i1].quaternion.setFromAxisAngle(f.ax, f.sgn * f.a1);
      bones[f.i2].quaternion.setFromAxisAngle(f.ax, f.sgn * f.a2);
      const sp = E.sockets["grip" + sd].p;
      const dp = f.fist.clone().sub(new T.Vector3(sp[0], sp[1], sp[2]));
      for (const w of [parts.weapon, parts.weapon2]) if (w && w.parent === bones[f.hb]) w.position.add(dp);
      parts["fist" + sd] = 1;
    }
    parts.rigPieces = rp;
    const model = R.makeModel(root, parts, "hero");
    model.cls = clsId;
    model.arch = C.arch;
    model.monArch = desc.monArch || null;
    model.realm = desc.realmDef ? null : desc.realm || C.realm;
    const wpn = gear.waffe;
    model.dual = !!(wpn && ["dolch", "sichel", "kurzschwert"].indexOf(wpn.base) >= 0);
    model.ranged = !!(wpn && D.BASES[wpn.base] && D.BASES[wpn.base].ranged);
    model.weaponBase = wpn ? wpn.base : null;
    model.shield = !!(gear.nebenhand && gear.nebenhand.base === "schild");
    model.hipH = E.hipsY;
    model.height = E.top;
    model.headY = R.human.jointOf(rig, "head").y + 0.12;
    model.projColor = C.arch === "magier" ? (model.realm === "albion" ? "#ffd27a" : model.realm === "midgard" ? "#9fd8ff" : "#7fffb0") : C.arch === "jaeger" ? "#e9d8a6" : "#ffd25a";
    parts.clips = new Player(model, mesh, key, E, desc.gender);
    parts.clips.init();
    return model;
  };

  /* ---------- Monster mit eigener Figur (Monsterkonzept v06) ----------
     Steht die Monster-ID im Figurenpaket (meshy_import.py, gen_pack.py --no-auto), nimmt das Monster diese Figur statt
     der gebauten: Meshy-Skelett und dieselben aufgenommenen Bewegungen wie die Helden. Die Waffe ist Teil des Modells;
     RG.MONSTER legt je Monster Kampfstil (Klasse) und Waffenart fuer die Bewegungswahl fest. */
  // cls: Kampfstil der Bewegungswahl (Idle, Spezialangriff), weapon: Waffenart des Angriffs (links = Waffe in der
  // linken Hand), dual: Krallen oder zwei Klingen (Kombination statt Einzelschlag)
  RG.MONSTER = {
    eiskobold: { cls: "nebelschleicher", weapon: "links" },
    nachtgoblin: { cls: "nebelschleicher", weapon: "schwert" },
    knochenlaeufer: { cls: "nebelschleicher", dual: true },
    knochenfuerst: { cls: "runenwirker", weapon: "hammer" },
    draugling: { cls: "sturmhuene", weapon: "axt", gear: "axt" },
    draugrfuerst: { cls: "sturmhuene", weapon: "schwert", gear: "schwert" },
    hohlkultist: { cls: "runenwirker", weapon: "hammer" },
    blutkultist: { cls: "sturmhuene", weapon: "schwert", gear: "schwert" },
    runenhexe: { cls: "runenwirker", weapon: "hammer", gender: "w" },
    nebeldruide: { cls: "runenwirker", weapon: "hammer" },
    lehmgolem: { cls: "sturmhuene", dual: true },
    felsgolem: { cls: "sturmhuene", dual: true },
    eisengolem: { cls: "sturmhuene", dual: true },
    obsidiangolem: { cls: "sturmhuene", weapon: "axt" },
    reifgolem: { cls: "sturmhuene", dual: true },
    sumpftroll: { cls: "sturmhuene", weapon: "hammer" },
    bergtroll: { cls: "sturmhuene", weapon: "hammer", gear: "hammer", wscale: 1.6 },
    grabritter: { cls: "sturmhuene", weapon: "schwert", shield: true, gear: "schwert" },
    todesritter: { cls: "sturmhuene", weapon: "schwert", gear: "schwert" },
    dornenhirte: { cls: "sturmhuene", weapon: "hammer" },
    moderhirte: { cls: "sturmhuene", weapon: "hammer" },
    sporling: { cls: "nebelschleicher", dual: true },
    sporenschrecken: { cls: "nebelschleicher", dual: true },
    giftmorchel: { cls: "sturmhuene", weapon: "hammer" },
    fahlerschemen: { cls: "runenwirker", dual: true },
    irrlichtschemen: { cls: "runenwirker", dual: true },
    leerenschemen: { cls: "runenwirker", dual: true },
  };
  RG.buildMonster = function (m, key) {
    const st = RG.MONSTER[key] || {};
    // gear: Waffe aus dem Spiel in die Faust, wenn das Modell ohne Waffe kam (Meshy laesst sie in der A-Haltung oft weg)
    const it = (b) => ({ base: b, variant: 0, rarity: m.boss ? "episch" : "selten", vis: { f: b + ".0", c: m.realm || "midgard", o: 0, v: 1 } });
    const gear = st.gear ? { waffe: it(st.gear) } : {};
    const model = RG.build({ cls: st.cls || "sturmhuene", gender: st.gender || "m", gear, genGear: [], noRigPieces: true, realm: m.realm, monArch: m.arch }, key);
    // Bewegungswahl wie mit dieser Waffe, ohne sichtbare angehaengte Waffe
    model.weaponBase = st.dual ? null : st.weapon || "axt";
    model.dual = !!st.dual;
    model.shield = !!st.shield;
    model.monArch = m.arch;
    // Waffe aus dem Spiel an grossen Monstern (Troll, Ritter) im Verhaeltnis zur Groesse
    const big = Math.max(1, model.height / 2.05);
    // grosse Monster tragen groessere Waffen; wscale vergroessert eine Waffe, die zum Konzept zu klein wirkt (Steinhammer)
    for (const w of [model.parts.weapon, model.parts.weapon2]) if (w && (big > 1.05 || st.wscale)) w.scale.multiplyScalar(big * (st.wscale || 1));
    // grosse Koerper mit kleinem Kopf (Golem, Troll, Baumhirte): Kopf und Hals ruhig halten
    if (st.stiff || { golem: 1, troll: 1, baum: 1 }[m.arch]) {
      const sk = model.parts.mesh.skeleton.bones;
      model.parts.clips.stiff = ["neck", "Head", "head_end", "headfront"].map((n) => sk.find((b) => b.name === n)).filter(Boolean);
    }
    model.ranged = SB.data.ARCH_TYPE[m.arch] === "verstand";
    model.projColor = m.accent || model.projColor;
    if (m.boss) {
      const s = m.final ? 1.35 : 1.18;
      model.parts.body.scale.setScalar(s);
      model.height *= s;
      model.headY *= s;
    }
    return model;
  };
})();
