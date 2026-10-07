/* Gemalte Heimatinsel (Probeentwurf): Das Inselbild des Reiches ist die Insel, die Orte sind darauf anklickbar, dazu
   bewegte Details je Reich (ziehende Wolken, Rauch, flackerndes Licht, Mondtor, Wasserfaelle, Schnee und Nordlicht in
   Midgard, Gluehwuermchen in Hibernia, goldener Staub in Albion). Gleiche Schnittstelle wie die 3D-Insel
   (SB.R3D.createHub), die Oberflaeche merkt keinen Unterschied. Die Bilder bettet build.mjs aus assets/inseln/<reich>.webp
   als globalThis.SB_INSELN ein; ohne Bild bleibt es bei der 3D-Insel. Braucht kein WebGL. */
(function () {
  const SB = (globalThis.SB = globalThis.SB || {});
  const IW = 1536;
  const IH = 1024;

  // Orte auf den Bildern (Pixel des Bildes): Mitte x, y, Oberkante fuer die Beschriftung, Klickradius
  const SPOTS = {
    midgard: {
      leuchtturm: [305, 105, 30, 60], taverne: [455, 270, 195, 80], heim: [640, 285, 255, 45], schmiede: [250, 365, 300, 60],
      arena: [330, 495, 435, 95], mondtor: [130, 720, 650, 65], tiefen: [525, 765, 700, 55], steinkreis: [795, 145, 90, 60],
      gildenhalle: [1175, 160, 75, 110], arkanum: [1000, 320, 205, 60], ruhmeshalle: [1340, 320, 225, 75],
      brunnen: [1055, 515, 475, 45], stall: [1335, 640, 560, 90],
    },
    albion: {
      steinkreis: [530, 180, 115, 75], ruhmeshalle: [585, 330, 255, 110], gildenhalle: [985, 175, 80, 85], arkanum: [1145, 160, 30, 50],
      leuchtturm: [1315, 75, 15, 40], mondtor: [1440, 285, 205, 55], brunnen: [155, 425, 365, 45], taverne: [400, 450, 390, 95],
      heim: [610, 480, 450, 45], schmiede: [965, 445, 375, 85], stall: [290, 630, 540, 110], tiefen: [810, 750, 650, 70],
      arena: [1290, 665, 570, 140],
    },
    hibernia: {
      leuchtturm: [195, 110, 30, 55], gildenhalle: [455, 205, 110, 110], tiefen: [160, 345, 285, 50], steinkreis: [700, 235, 170, 80],
      mondtor: [950, 85, 35, 55], ruhmeshalle: [1190, 260, 185, 70], arkanum: [1445, 335, 250, 50], stall: [1300, 420, 335, 80],
      taverne: [420, 525, 425, 95], heim: [235, 525, 470, 55], brunnen: [590, 585, 535, 40], schmiede: [760, 560, 490, 65],
      arena: [690, 760, 680, 100],
    },
  };

  // Bewegte Details: Lichter [x, y, Radius, Farbe], Rauch [x, y], Mondtor [x, y, Radius, Farbe], Runen [x, y, Radius, Farbe],
  // Wasserfaelle [x, y0, y1, Breite]; dazu je Reich Wolkenfarbe und besondere Teilchen
  const FX = {
    midgard: {
      lights: [[305, 40, 34, "#ffb347"], [245, 385, 44, "#ff8a30"], [420, 285, 24, "#ffc070"], [470, 290, 24, "#ffc070"], [520, 300, 20, "#ffc070"],
        [1150, 195, 24, "#ffc070"], [1200, 190, 24, "#ffc070"], [1100, 200, 20, "#ffc070"], [175, 415, 16, "#ffb347"], [240, 490, 16, "#ffb347"],
        [465, 470, 16, "#ffb347"], [470, 525, 16, "#ffb347"], [1440, 685, 18, "#ffb347"], [1330, 700, 16, "#ffb347"], [1110, 600, 14, "#ffb347"],
        [540, 815, 16, "#ffb347"], [525, 760, 64, "#8a5cff"]],
      smoke: [[272, 205], [600, 190], [385, 368]],
      portal: [130, 720, 58, "#c8d8ff"],
      runes: [[1055, 515, 44, "#7fc8ff"], [1000, 300, 50, "#7fc8ff"], [795, 140, 42, "#7fc8ff"], [1110, 515, 26, "#7fc8ff"], [1140, 498, 22, "#7fc8ff"]],
      falls: [[668, 690, 1000, 18], [828, 450, 650, 14], [880, 690, 950, 14], [990, 640, 900, 12], [1380, 790, 1000, 16], [310, 640, 800, 14], [150, 800, 1000, 10]],
      clouds: "232,240,255", snow: true, aurora: true, nightDim: 0.8,
    },
    albion: {
      lights: [[330, 470, 22, "#ffc070"], [395, 480, 22, "#ffc070"], [450, 470, 18, "#ffc070"], [500, 475, 18, "#ffc070"], [185, 645, 20, "#ffc070"],
        [440, 640, 20, "#ffc070"], [155, 435, 32, "#ffd27a"], [970, 485, 44, "#ff8a30"], [727, 790, 16, "#ffb347"], [855, 790, 16, "#ffb347"],
        [810, 770, 44, "#ff6040"], [1130, 200, 22, "#ffb070"], [945, 205, 18, "#ffb070"], [1312, 32, 28, "#fff0b0"], [275, 470, 14, "#ffb347"],
        [410, 535, 14, "#ffb347"], [770, 425, 14, "#ffb347"]],
      smoke: [[1018, 328]],
      portal: [1442, 282, 48, "#b48cff"],
      runes: [[745, 72, 32, "#ffd27a"]],
      falls: [[1330, 880, 1000, 14], [1272, 150, 230, 8]],
      clouds: "255,242,224", dust: true, rays: true, nightDim: 1,
    },
    hibernia: {
      lights: [[330, 240, 24, "#ffcf7a"], [420, 235, 20, "#ffcf7a"], [480, 240, 20, "#ffcf7a"], [560, 250, 18, "#ffcf7a"], [250, 520, 22, "#ffcf7a"],
        [320, 540, 22, "#ffcf7a"], [400, 530, 22, "#ffcf7a"], [450, 545, 18, "#ffcf7a"], [760, 575, 44, "#ff8a30"], [530, 745, 18, "#ffb347"],
        [680, 785, 18, "#ffb347"], [870, 760, 18, "#ffb347"], [465, 690, 16, "#ffb347"], [820, 665, 16, "#ffb347"], [197, 65, 44, "#cfe2ff"],
        [1442, 315, 44, "#ffd27a"], [160, 350, 48, "#ff5030"], [650, 240, 14, "#ffe3a0"], [715, 230, 14, "#ffe3a0"]],
      smoke: [[465, 392], [830, 428]],
      portal: [950, 90, 48, "#a88cff"],
      runes: [[1172, 300, 32, "#9fd8ff"], [590, 585, 32, "#9fe8ff"], [1235, 240, 26, "#9fd8ff"], [1180, 45, 44, "#e8eeff"]],
      falls: [[90, 620, 1000, 14], [210, 700, 1000, 12], [662, 900, 1000, 10], [722, 360, 420, 10], [972, 420, 500, 10], [1060, 730, 1000, 14],
        [1255, 560, 1000, 18], [1452, 600, 1000, 12], [1412, 130, 200, 8], [935, 180, 250, 6]],
      clouds: "223,228,255", fireflies: true, nightDim: 0.5,
    },
  };

  const imgOf = (realm) => globalThis.SB_INSELN && globalThis.SB_INSELN[realm];
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a.toFixed(3) + ")";
  };

  function create(el, opts) {
    opts = opts || {};
    let realm = opts.realm;
    // Heimat des Helden; realm ist die gerade gezeigte Insel (beim Besuch eine andere)
    let home = opts.realm;
    let dayMode = opts.dayCycle || "zyklus";
    const low = opts.quality === "niedrig";
    const E = SB.engine;
    const root = document.createElement("div");
    root.className = "painted-hub";
    const world = document.createElement("div");
    world.className = "ph-world";
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    const shade = document.createElement("div");
    shade.className = "ph-shade";
    const cv = document.createElement("canvas");
    cv.width = IW;
    cv.height = IH;
    world.append(img, shade, cv);
    root.appendChild(world);
    const labelLayer = document.createElement("div");
    labelLayer.className = "hub-labels";
    root.appendChild(labelLayer);
    // Besuch auf einer anderen Heimatinsel: Hinweis oben mit dem Weg zurueck
    const visitBar = document.createElement("div");
    visitBar.className = "ph-visit";
    visitBar.hidden = true;
    visitBar.innerHTML = '<span class="ph-visit-text"></span><button type="button" class="btn small">Zurück</button>';
    visitBar.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    visitBar.querySelector("button").addEventListener("click", (ev) => {
      ev.stopPropagation();
      visit(home);
    });
    root.appendChild(visitBar);
    el.appendChild(root);
    const ctx = cv.getContext("2d");

    const labels = {};
    for (const b of SB.data.BUILDINGS) {
      const d = document.createElement("button");
      d.type = "button";
      d.className = "hub-label";
      d.dataset.bid = b.id;
      d.innerHTML = '<span class="hl-name"></span><span class="hl-badge" hidden></span>';
      d.querySelector(".hl-name").textContent = b.short;
      d.addEventListener("click", (e) => {
        e.stopPropagation();
        if (opts.onPick) opts.onPick(b.id);
      });
      d.addEventListener("pointerenter", () => setHover(b.id));
      d.addEventListener("pointerleave", () => setHover(null));
      labelLayer.appendChild(d);
      labels[b.id] = d;
    }

    // Ansicht: Das Bild fuellt den freien Bereich der Buehne (ohne Menueleiste und Kopfleiste), verschiebbar und zoombar;
    // inset haelt rechts Platz fuer ein offenes Fenster frei
    let cw = 1, ch = 1, inset = 0;
    let safe = { l: 0, t: 0, r: 1, b: 1 };
    function measureSafe() {
      const r = el.getBoundingClientRect();
      safe = { l: 0, t: 0, r: r.width, b: r.height };
      const tb = document.getElementById("topbar");
      const dk = document.getElementById("dock");
      if (tb && tb.offsetParent !== null) {
        const t = tb.getBoundingClientRect();
        if (t.top <= r.top + 8 && t.bottom > r.top) safe.t = Math.min(r.height * 0.4, t.bottom - r.top);
      }
      if (dk && dk.offsetParent !== null) {
        const d = dk.getBoundingClientRect();
        if (d.height > d.width && d.left <= r.left + 8) safe.l = Math.min(r.width * 0.4, d.right - r.left);
        else if (d.width >= d.height && d.top > r.top + r.height / 2) safe.b = Math.max(r.height * 0.6, d.top - r.top);
      }
    }
    const view = { s: 1, x: 0, y: 0 };
    const goal = { s: 1, x: 0, y: 0, zoom: 1, fx: IW / 2, fy: IH / 2 };
    let spots = SPOTS[realm] || {};
    let fx = FX[realm] || FX.midgard;
    function clampGoal() {
      const l = safe.l, t = safe.t, r = Math.max(l + 1, safe.r - inset), b = safe.b;
      const vw = r - l, vh = b - t;
      goal.s = Math.max(vw / IW, vh / IH) * goal.zoom;
      const sw = IW * goal.s, sh = IH * goal.s;
      goal.x = Math.min(l, Math.max(r - sw, l + vw / 2 - goal.fx * goal.s));
      goal.y = Math.min(t, Math.max(b - sh, t + vh / 2 - goal.fy * goal.s));
      // Brennpunkt an die tatsaechlich moegliche Lage anpassen, sonst laeuft das Ziehen am Rand weiter ins Leere
      goal.fx = (l + vw / 2 - goal.x) / goal.s;
      goal.fy = (t + vh / 2 - goal.y) / goal.s;
    }
    function resize() {
      cw = Math.max(1, el.clientWidth);
      ch = Math.max(1, el.clientHeight);
      measureSafe();
      clampGoal();
    }
    window.addEventListener("resize", resize);
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    function load() {
      spots = SPOTS[realm] || {};
      fx = FX[realm] || FX.midgard;
      img.src = imgOf(realm) || "";
      root.dataset.realm = realm;
      for (const id in labels) labels[id].hidden = !spots[id];
      initParticles();
      const R = SB.data.REALMS;
      visitBar.hidden = realm === home || !R[realm] || !R[home];
      if (!visitBar.hidden) {
        visitBar.querySelector(".ph-visit-text").textContent = "Zu Besuch auf " + R[realm].isle + " (" + R[realm].name + ")";
        visitBar.querySelector("button").textContent = "Zurück nach " + R[home].isle;
      }
    }
    function visit(r) {
      if (!imgOf(r)) return false;
      if (r !== realm) {
        realm = r;
        goal.zoom = 1;
        goal.fx = IW / 2;
        goal.fy = IH / 2;
        load();
        clampGoal();
        applyDay();
      }
      if (opts.onVisit) opts.onVisit(realm);
      return true;
    }

    // Tageszeit: Nacht dunkelt das Bild ab und laesst Fenster, Fackeln und Runen staerker leuchten
    let info = { day: 1, night: 0, dusk: 0 };
    function applyDay() {
      info = E.dayInfo(E.dayTime(dayMode));
      const n = info.night * (fx.nightDim || 1);
      img.style.filter = "brightness(" + (1 - 0.22 * n + 0.04 * info.day).toFixed(3) + ") saturate(" + (1 - 0.1 * n).toFixed(3) + ")";
      shade.style.opacity = (0.75 * n).toFixed(3);
      if (labels.mondtor) {
        labels.mondtor.classList.toggle("asleep", info.night < 0.5);
        labels.mondtor.classList.toggle("moonlit", info.night >= 0.5);
      }
    }

    // Teilchen
    let flakes = [], flies = [], motes = [], puffs = [], clouds = [];
    function initParticles() {
      const k = low ? 0.4 : 1;
      const rnd = Math.random;
      flakes = fx.snow ? Array.from({ length: Math.round(170 * k) }, () => ({ x: rnd() * IW, y: rnd() * IH, r: 0.8 + rnd() * 2.2, v: 18 + rnd() * 40, p: rnd() * 6 })) : [];
      flies = fx.fireflies ? Array.from({ length: Math.round(70 * k) }, () => ({ x: 80 + rnd() * (IW - 160), y: 120 + rnd() * 760, a: rnd() * 6, v: 6 + rnd() * 12, p: rnd() * 6 })) : [];
      motes = fx.dust ? Array.from({ length: Math.round(90 * k) }, () => ({ x: rnd() * IW, y: rnd() * IH, r: 0.8 + rnd() * 1.8, v: 4 + rnd() * 10, p: rnd() * 6 })) : [];
      clouds = Array.from({ length: low ? 3 : 6 }, (_, i) => ({ x: rnd() * IW, y: 560 + (i % 3) * 160 + rnd() * 60, w: 260 + rnd() * 320, h: 40 + rnd() * 50, v: 6 + rnd() * 10 }));
      puffs = [];
    }

    let hover = null;
    function setHover(id) {
      if (hover === id) return;
      if (hover && labels[hover]) labels[hover].classList.remove("hover");
      hover = id;
      if (id && labels[id]) labels[id].classList.add("hover");
      root.style.cursor = id ? "pointer" : "grab";
      if (opts.onHover) opts.onHover(id);
    }

    function glow(x, y, r, color, a) {
      if (a <= 0.003) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(color, Math.min(1, a)));
      g.addColorStop(0.35, rgba(color, Math.min(1, a) * 0.45));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    let smokeT = 0;
    function draw(t, dt) {
      ctx.clearRect(0, 0, IW, IH);
      const n = info.night;
      // ziehende Wolkenschleier unter und zwischen den Felsen
      for (const c of clouds) {
        c.x += c.v * dt;
        if (c.x - c.w > IW) c.x = -c.w;
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.w / 2);
        g.addColorStop(0, "rgba(" + fx.clouds + "," + (0.22 - 0.1 * n).toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + fx.clouds + ",0)");
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.scale(1, c.h / (c.w / 2));
        ctx.translate(-c.x, -c.y);
        ctx.fillStyle = g;
        ctx.fillRect(c.x - c.w / 2, c.y - c.w / 2, c.w, c.w);
        ctx.restore();
      }
      ctx.globalCompositeOperation = "lighter";
      // Nordlicht (Midgard): wogende, farbige Baender am Himmel
      if (fx.aurora) {
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          for (let x = 0; x <= IW; x += 24) {
            const y = 28 + i * 20 + Math.sin(x / 140 + t * (0.35 + i * 0.1) + i) * 16 + Math.sin(x / 47 + t * 0.9) * 4;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.lineWidth = 26 - i * 6;
          ctx.strokeStyle = i === 1 ? "rgba(140,120,255," + (0.07 + 0.08 * n).toFixed(3) + ")" : "rgba(90,255,190," + (0.08 + 0.1 * n).toFixed(3) + ")";
          ctx.stroke();
        }
      }
      // Sonnenstrahlen (Albion) von rechts oben
      if (fx.rays) {
        const a = (0.05 + 0.03 * Math.sin(t * 0.4)) * (1 - n);
        for (let i = 0; i < 4; i++) {
          const ang = 2.25 + i * 0.12 + Math.sin(t * 0.07 + i) * 0.03;
          ctx.beginPath();
          ctx.moveTo(1500, -40);
          ctx.lineTo(1500 + Math.cos(ang - 0.03) * 1700, -40 + Math.sin(ang - 0.03) * 1700);
          ctx.lineTo(1500 + Math.cos(ang + 0.03) * 1700, -40 + Math.sin(ang + 0.03) * 1700);
          ctx.closePath();
          ctx.fillStyle = "rgba(255,214,150," + a.toFixed(3) + ")";
          ctx.fill();
        }
      }
      // Wasserfaelle: herabgleitende Lichtstreifen
      for (const [x, y0, y1, w] of fx.falls) {
        for (let i = 0; i < 4; i++) {
          const len = (y1 - y0) * 0.22;
          const y = y0 + ((t * 120 + i * (y1 - y0) / 4) % (y1 - y0 + len)) - len;
          const g = ctx.createLinearGradient(0, y, 0, y + len);
          g.addColorStop(0, "rgba(220,240,255,0)");
          g.addColorStop(0.5, "rgba(220,240,255,0.22)");
          g.addColorStop(1, "rgba(220,240,255,0)");
          ctx.fillStyle = g;
          ctx.fillRect(x - w / 2 + ((i * 7) % w) * 0.5 - w * 0.2, Math.max(y0, y), w * 0.45, Math.min(len, y1 - Math.max(y0, y)));
        }
      }
      // Fenster, Feuer und Fackeln flackern; nachts staerker
      const lightK = 0.35 + 0.8 * n;
      fx.lights.forEach(([x, y, r, c], i) => {
        const fl = 0.75 + 0.15 * Math.sin(t * 7.3 + i * 1.7) + 0.1 * Math.sin(t * 13.1 + i);
        glow(x, y, r * (1.5 + 0.5 * n), c, 0.55 * fl * lightK);
      });
      // Runen und Kristalle pulsieren
      fx.runes.forEach(([x, y, r, c], i) => glow(x, y, r * 1.6, c, (0.25 + 0.2 * Math.sin(t * 1.6 + i * 2)) * (0.6 + 0.6 * n)));
      // Mondtor: kreisender Wirbel, bei Tag schlafend
      if (fx.portal) {
        const [x, y, r, c] = fx.portal;
        const awake = 0.35 + 0.65 * n;
        glow(x, y, r * 1.9, c, 0.45 * awake);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * (0.6 + 0.8 * n));
        for (let k = 0; k < 3; k++) {
          ctx.rotate((Math.PI * 2) / 3);
          ctx.beginPath();
          ctx.arc(0, 0, r * (0.35 + 0.18 * k), 0, Math.PI * 0.9);
          ctx.strokeStyle = rgba(c, 0.35 * awake);
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.restore();
      }
      // Hervorhebung des Ortes unter dem Zeiger
      if (hover && spots[hover]) {
        const [x, y, , r] = spots[hover];
        glow(x, y, r * 1.6, "#ffd98a", 0.3 + 0.08 * Math.sin(t * 5));
      }
      // Gluehwuermchen (Hibernia)
      for (const f of flies) {
        f.a += (Math.sin(t * 0.7 + f.p) * 0.8) * dt;
        f.x += Math.cos(f.a) * f.v * dt;
        f.y += Math.sin(f.a) * f.v * dt * 0.6;
        if (f.x < 40 || f.x > IW - 40 || f.y < 80 || f.y > 900) f.a += Math.PI;
        glow(f.x, f.y, 9, "#d8ff8a", (0.35 + 0.4 * Math.max(0, Math.sin(t * 2.3 + f.p))) * (0.5 + 0.6 * n));
      }
      // goldener Staub im Abendlicht (Albion)
      for (const m of motes) {
        m.y -= m.v * dt;
        m.x += Math.sin(t * 0.5 + m.p) * 6 * dt;
        if (m.y < -5) {
          m.y = IH + 5;
          m.x = Math.random() * IW;
        }
        ctx.fillStyle = "rgba(255,226,160," + ((0.25 + 0.25 * Math.sin(t * 1.7 + m.p)) * (1 - 0.6 * n)).toFixed(3) + ")";
        ctx.fillRect(m.x, m.y, m.r, m.r);
      }
      ctx.globalCompositeOperation = "source-over";
      // Rauch aus den Schornsteinen
      smokeT += dt;
      if (smokeT > (low ? 0.6 : 0.3)) {
        smokeT = 0;
        for (const [x, y] of fx.smoke) puffs.push({ x: x + (Math.random() - 0.5) * 6, y, r: 6, a: 0.32, v: 18 + Math.random() * 10 });
      }
      for (const p of puffs) {
        p.y -= p.v * dt;
        p.x += (8 + Math.sin(t + p.y * 0.05) * 6) * dt;
        p.r += 9 * dt;
        p.a -= 0.07 * dt;
      }
      puffs = puffs.filter((p) => p.a > 0);
      for (const p of puffs) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, "rgba(200,200,205," + p.a.toFixed(3) + ")");
        g.addColorStop(1, "rgba(200,200,205,0)");
        ctx.fillStyle = g;
        ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      // Schnee (Midgard)
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (const f of flakes) {
        f.y += f.v * dt;
        f.x += Math.sin(t * 0.8 + f.p) * 10 * dt;
        if (f.y > IH) {
          f.y = -4;
          f.x = Math.random() * IW;
        }
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Der eigene Held steht gross im Vordergrund (rechts unten, neben einem offenen Fenster), als 3D-Figur mit den
    // neuen Koerpern; ziehen dreht ihn, ein Klick oeffnet den Charakterbogen
    let heroBox = null, heroView = null;
    function setHero(desc) {
      const R = SB.R3D;
      if (!desc || !R || !R.ready || !R.ready() || !(SB.ui && SB.ui.use3d)) return;
      try {
        if (!heroBox) {
          heroBox = document.createElement("div");
          heroBox.className = "ph-hero";
          heroBox.title = "Dein Held";
          let down = null;
          heroBox.addEventListener("pointerdown", (ev) => {
            ev.stopPropagation();
            down = [ev.clientX, ev.clientY];
          });
          heroBox.addEventListener("pointerup", (ev) => {
            if (down && Math.abs(ev.clientX - down[0]) + Math.abs(ev.clientY - down[1]) < 6 && opts.onPick) opts.onPick("held");
            down = null;
          });
          root.appendChild(heroBox);
          heroView = R.createHeroView(heroBox, { distance: 7.6, lookY: 1.1 });
        }
        heroView.set(desc);
      } catch (e) {
        console.warn("Held auf der gemalten Insel nicht verfuegbar", e);
      }
    }
    function placeHero() {
      if (!heroBox) return;
      const hw = Math.round(Math.max(120, Math.min(230, (safe.b - safe.t) * 0.32)));
      const hh = Math.round(hw * 1.45);
      heroBox.style.width = hw + "px";
      heroBox.style.height = hh + "px";
      heroBox.style.transform = "translate(" + Math.round(safe.r - inset - hw - 10) + "px," + Math.round(safe.b - hh - 4) + "px)";
    }

    function place() {
      placeHero();
      if (!visitBar.hidden) visitBar.style.transform = "translate(" + Math.round((safe.l + safe.r - inset) / 2) + "px," + Math.round(safe.t + 8) + "px) translateX(-50%)";
      world.style.transform = "translate(" + view.x.toFixed(1) + "px," + view.y.toFixed(1) + "px) scale(" + view.s.toFixed(4) + ")";
      for (const id in labels) {
        const s = spots[id];
        if (!s) continue;
        const x = view.x + s[0] * view.s;
        // Beschriftungen hoher Gebaeude bleiben knapp unter der Kopfleiste sichtbar
        const y = Math.max(view.y + s[2] * view.s, Math.min(view.y + s[1] * view.s, safe.t + 30));
        labels[id].style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) translate(-50%,-100%)";
        labels[id].style.opacity = x < safe.l || x > safe.r - inset || y < safe.t + 10 || y > safe.b ? "0" : "";
      }
    }

    let running = true;
    let raf = 0;
    let last = performance.now();
    let dayTimer = 0;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const k = Math.min(1, dt * 7);
      view.s += (goal.s - view.s) * k;
      view.x += (goal.x - view.x) * k;
      view.y += (goal.y - view.y) * k;
      place();
      if (!running || document.hidden) return;
      dayTimer += dt;
      if (dayTimer > 5) {
        dayTimer = 0;
        applyDay();
      }
      draw(now / 1000, dt);
    }

    // Eingabe: ziehen verschiebt, Rad zoomt, Klick waehlt den naechsten Ort im Klickradius
    let drag = null;
    function toImage(ev) {
      const r = root.getBoundingClientRect();
      return [(ev.clientX - r.left - view.x) / view.s, (ev.clientY - r.top - view.y) / view.s];
    }
    function spotAt(ev) {
      const [x, y] = toImage(ev);
      let best = null, bd = Infinity;
      for (const id in spots) {
        const s = spots[id];
        const d = Math.hypot(x - s[0], y - s[1]);
        if (d < s[3] && d < bd) {
          bd = d;
          best = id;
        }
      }
      return best;
    }
    root.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest(".hub-label") || ev.target.closest(".ph-hero") || ev.target.closest(".ph-visit")) return;
      root.setPointerCapture(ev.pointerId);
      drag = { x: ev.clientX, y: ev.clientY, fx: goal.fx, fy: goal.fy, moved: 0 };
    });
    root.addEventListener("pointermove", (ev) => {
      if (drag) {
        const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
        goal.fx = drag.fx - dx / goal.s;
        goal.fy = drag.fy - dy / goal.s;
        clampGoal();
        return;
      }
      setHover(spotAt(ev));
    });
    root.addEventListener("pointerup", (ev) => {
      const d = drag;
      drag = null;
      if (d && d.moved < 8) {
        const id = spotAt(ev);
        if (id && opts.onPick) opts.onPick(id);
      }
    });
    root.addEventListener("pointerleave", () => setHover(null));
    root.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      goal.zoom = Math.max(1, Math.min(2.2, goal.zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
      clampGoal();
    }, { passive: false });

    load();
    resize();
    Object.assign(view, { s: goal.s, x: goal.x, y: goal.y });
    applyDay();
    raf = requestAnimationFrame(frame);

    return {
      painted: true,
      setHero,
      realm: () => realm,
      home: () => home,
      visit,
      setHome(tier, realmId) {
        // neue Heimat (Reichswechsel): dorthin wechseln, ausser waehrend eines Besuchs
        if (realmId && realmId !== home && imgOf(realmId)) {
          const atHome = realm === home;
          home = realmId;
          if (atHome) {
            realm = realmId;
            applyDay();
          }
          load();
        }
      },
      setGuildColors() {},
      setDayCycle(mode) {
        dayMode = mode || "zyklus";
        applyDay();
      },
      dayInfo: () => info,
      cheer() {
        if (heroView) heroView.play("victory", 1.2);
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
        const s = id && spots[id];
        goal.zoom = s ? 1.35 : 1;
        goal.fx = s ? s[0] : IW / 2;
        goal.fy = s ? s[1] : IH / 2;
        clampGoal();
      },
      setInset(px) {
        inset = Math.max(0, Math.round(px || 0));
        clampGoal();
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
        window.removeEventListener("resize", resize);
        if (heroView) heroView.dispose();
        root.remove();
      },
    };
  }

  SB.hubPainted = { has: (realm) => !!imgOf(realm), create, SPOTS };
})();
