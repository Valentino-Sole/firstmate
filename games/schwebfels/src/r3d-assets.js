/* Helden von Schwebfels - Lader fuer das Modellpaket (assets/schwebfels.pack).
   Das Paket entsteht mit den Blender-Skripten in assets-src/ und wird beim Bauen als Base64 eingebettet
   (globalThis.SB_PACK). Ohne Einbettung (Entwicklung mit index.html) wird die Datei geladen. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const A = (SB.assets = SB.assets || {});
  let done;
  A.ready = new Promise((r) => (done = r));
  A.data = null;
  A.error = null;

  function b64(s) {
    const bin = atob(s);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function parse(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(0, true) !== 0x31504253) throw new Error("Modellpaket: falsche Kennung");
    const hl = dv.getUint32(4, true);
    const header = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + hl)));
    let base = 8 + hl;
    base += (4 - (base % 4)) % 4;
    // eigene Kopie, damit alle Felder sauber ausgerichtet sind
    const blob = u8.slice(base);
    const buf = blob.buffer;
    function view(d) {
      const kind = d[0];
      const off = d[1];
      const n = d[2];
      switch (kind) {
        case "f32":
          return new Float32Array(buf, off, n);
        case "u8":
          return new Uint8Array(buf, off, n);
        case "i8":
          return new Int8Array(buf, off, n);
        case "u16":
          return new Uint16Array(buf, off, n);
        case "i16":
          return new Int16Array(buf, off, n);
        case "u32":
          return new Uint32Array(buf, off, n);
        case "q16": {
          const q = new Int16Array(buf, off, n);
          const f = new Float32Array(n);
          const s = d[3];
          for (let i = 0; i < n; i++) f[i] = q[i] * s;
          return f;
        }
        case "uv16": {
          const q = new Uint16Array(buf, off, n);
          const f = new Float32Array(n);
          for (let i = 0; i < n; i++) f[i] = q[i] / 65535;
          return f;
        }
        case "img":
          return { img: true, bytes: new Uint8Array(buf, off, n), mime: d[3] };
      }
      throw new Error("Modellpaket: unbekannte Art " + kind);
    }
    function res(o) {
      if (Array.isArray(o)) return o.map(res);
      if (o && typeof o === "object") {
        if (o.$) return view(o.$);
        const r = {};
        for (const k in o) r[k] = res(o[k]);
        return r;
      }
      return o;
    }
    return res(header);
  }

  // build.mjs bettet die Pakete mit gzip verkleinert ein; der Browser entpackt sie selbst
  async function unzip(u8) {
    if (u8[0] !== 0x1f || u8[1] !== 0x8b) return u8;
    const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }

  A.load = async function () {
    try {
      let u8;
      if (globalThis.SB_PACK) {
        u8 = await unzip(b64(globalThis.SB_PACK));
        globalThis.SB_PACK = null;
      } else {
        const r = await fetch("assets/schwebfels.pack");
        if (!r.ok) throw new Error("Modellpaket nicht gefunden");
        u8 = await unzip(new Uint8Array(await r.arrayBuffer()));
      }
      const data = parse(u8);
      // erzeugte Figuren (eigenes Paket, optional): Koerper, Skelette und gemeinsame Bewegungen
      if (globalThis.SB_GENPACK) {
        const g = parse(await unzip(b64(globalThis.SB_GENPACK)));
        data.gen = g.gen || {};
        data.clips = g.clips || {};
        data.rigPieces = g.pieces || {};
        data.genWeapons = g.weapons || {};
        data.genProps = g.props || {};
        // erzeugte Bestien (beasts/from_glb.py) neben die gebauten; gleiche Familie ersetzt die gebaute
        data.beasts = Object.assign({}, data.beasts || {}, g.beasts || {});
        globalThis.SB_GENPACK = null;
        // Texturen der Figuren mit eigenem Skelett und ihrer Ruestungsteile vorab laden (Portraits gleich farbig)
        const waits = [];
        for (const k in data.gen) {
          const e = data.gen[k];
          const t = e.kind === "rig" && e.tex ? A.texture("rig." + k, e.tex, { srgb: true }) : null;
          if (t) waits.push(t.userData.ready);
        }
        for (const k in data.rigPieces) {
          const t = A.texture("rigpiece." + k, data.rigPieces[k].tex, { srgb: true });
          if (t) waits.push(t.userData.ready);
        }
        for (const k in data.genProps) {
          const t = A.texture("prop." + k, data.genProps[k].tex, { srgb: true });
          if (t) waits.push(t.userData.ready);
        }
        for (const k in data.genWeapons) {
          const t = A.texture("weapon." + k, data.genWeapons[k].tex, { srgb: true });
          if (t) waits.push(t.userData.ready);
        }
        for (const k in g.beasts || {}) {
          const t = A.texture("beast." + k, g.beasts[k].tex, { srgb: true });
          if (t) waits.push(t.userData.ready);
        }
        // Normalenkarten (Meshy mit enable_pbr) unter dem Schluessel der Farbtextur mit ".n"
        const nmap = (key, e) => {
          const t = e && e.ntex ? A.texture(key + ".n", e.ntex, { srgb: false }) : null;
          if (t) waits.push(t.userData.ready);
        };
        for (const k in data.gen) if (data.gen[k].kind === "rig") nmap("rig." + k, data.gen[k]);
        for (const k in data.rigPieces) nmap("rigpiece." + k, data.rigPieces[k]);
        for (const k in data.genWeapons) nmap("weapon." + k, data.genWeapons[k]);
        for (const k in data.genProps) nmap("prop." + k, data.genProps[k]);
        for (const k in g.beasts || {}) nmap("beast." + k, g.beasts[k]);
        await Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, 4000))]);
      }
      data.gen = data.gen || {};
      A.data = data;
    } catch (e) {
      A.error = e;
      console.warn("Modellpaket nicht verfuegbar, alte Figuren werden genutzt", e);
    }
    done(A.data);
    return A.data;
  };

  /* Erzeugte Figuren je Reich: eigene Datei gen-<reich>.js neben der Seite (setzt globalThis.SB_GEN_<REICH> als
     Base64), erst bei Bedarf geladen, damit die Spielseite klein bleibt. Ein Skript-Tag funktioniert auch bei
     file:// (Vorschau und Tests), wo fetch nicht erlaubt ist. */
  const GEN_LOAD = {};
  A.loadGen = function (realm) {
    if (GEN_LOAD[realm]) return GEN_LOAD[realm];
    const key = "SB_GEN_" + realm.toUpperCase();
    // Handy-Fassung: die Ausruestung der drei Reiche steckt in einem Paket, die anderen Namen verweisen darauf
    // ("@ausrmidgardkrieger", assets-src/handy.py)
    const al = globalThis[key];
    if (typeof al === "string" && al.charAt(0) === "@") return (GEN_LOAD[realm] = A.loadGen(al.slice(1)));
    // Base64 roh oder (Handy-Fassung, eine einzige Datei) mit gzip verkleinert
    const take = async () => {
      const s = globalThis[key];
      if (!s) return false;
      globalThis[key] = null;
      // schon eingebettete Koerper behalten (gleiche Daten, Materialien und Geometrie sind dafuer schon gebaut)
      const p = parse(await unzip(b64(s)));
      const g = p.gen || {};
      for (const k in g) if (!A.data.gen[k]) A.data.gen[k] = g[k];
      // Ausruestung (gen-ausr<reich><art>.js): Ruestungsteile und Waffen kommen zu den vorhandenen, Texturen gleich laden
      const waits = [];
      const addAll = (into, from, pre) => {
        for (const k in from || {}) {
          if (A.data[into][k]) continue;
          A.data[into][k] = from[k];
          for (const t of [A.texture(pre + k, from[k].tex, { srgb: true }), from[k].ntex && A.texture(pre + k + ".n", from[k].ntex, { srgb: false })])
            if (t) waits.push(t.userData.ready);
        }
      };
      A.data.rigPieces = A.data.rigPieces || {};
      A.data.genWeapons = A.data.genWeapons || {};
      addAll("rigPieces", p.pieces, "rigpiece.");
      addAll("genWeapons", p.weapons, "weapon.");
      if (waits.length) await Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, 4000))]);
      // Monster (gen-monster.js): erzeugte Bestien kommen zu den vorhandenen Familien; Texturen gleich laden, sonst
      // stuende die Bestie im ersten Kampfbild schwarz da
      for (const k in p.beasts || {}) {
        if (A.data.beasts && A.data.beasts[k] && A.data.beasts[k].tex) continue;
        A.data.beasts = Object.assign({}, A.data.beasts, { [k]: p.beasts[k] });
        A.texture("beast." + k, p.beasts[k].tex, { srgb: true });
        if (p.beasts[k].ntex) A.texture("beast." + k + ".n", p.beasts[k].ntex, { srgb: false });
      }
      return true;
    };
    GEN_LOAD[realm] = A.ready.then(async () => {
      if (!A.data) throw new Error("Modellpaket fehlt");
      if (await take()) return A.data.gen;
      await new Promise((ok, fail) => {
        const el = document.createElement("script");
        el.src = "gen-" + realm + ".js";
        el.onload = ok;
        el.onerror = () => {
          // keine Figurendatei neben der Seite (etwa beim Entwickeln ohne Paket): erwartbar, kein Fehler im Paket
          const e = new Error("Figurendaten nicht gefunden");
          e.missing = true;
          fail(e);
        };
        document.head.appendChild(el);
      });
      if (await take()) return A.data.gen;
      throw new Error("Figurendaten leer");
    });
    GEN_LOAD[realm].catch(() => (GEN_LOAD[realm] = null));
    return GEN_LOAD[realm];
  };

  /* Bilder aus dem Paket als Textur (laedt im Hintergrund nach) */
  const TEXC = {};
  A.texture = function (key, ref, opts) {
    const T = globalThis.THREE;
    if (!T || !ref) return null;
    if (TEXC[key]) return TEXC[key];
    const tex = new T.Texture();
    opts = opts || {};
    tex.colorSpace = opts.srgb === false ? T.NoColorSpace : T.SRGBColorSpace;
    tex.wrapS = tex.wrapT = opts.repeat ? T.RepeatWrapping : T.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([ref.bytes], { type: ref.mime }));
    // ready: erfuellt, sobald das Bild dekodiert ist (Standbilder wie Portraets warten darauf)
    tex.userData.ready = new Promise((done) => {
      img.onload = () => {
        tex.image = img;
        tex.needsUpdate = true;
        URL.revokeObjectURL(url);
        done(tex);
      };
      img.onerror = () => done(tex);
    });
    img.src = url;
    return (TEXC[key] = tex);
  };
  /* Metallkarte (Glanz 0.81) aus einer Farbtextur: Meshys umgefaerbte Ruestungen und Waffen kommen ohne Metall- und
     Rauheitskarte, alles wirkte darum gleich matt. Graue bis weisse, kaum gesaettigte Stellen gelten als Stahl, warme
     helle Gelb- und Orangetoene als Gold oder Bronze, alles andere (Stoff, Leder, Holz, Farbe) bleibt matt. Kanal G ist
     die Rauheit, B das Metall (so liest three.js roughnessMap und metalnessMap). Erzeugt einmal je Textur, 256 Pixel. */
  const METC = {};
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  A.metalPixel = function (r, g, b) {
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const v = mx / 255;
    const s = mx > 0 ? (mx - mn) / mx : 0;
    let h = 0;
    if (mx > mn) {
      if (mx === r) h = ((g - b) / (mx - mn) + 6) % 6;
      else if (mx === g) h = (b - r) / (mx - mn) + 2;
      else h = (r - g) / (mx - mn) + 4;
      h *= 60;
    }
    // Stahl: wenig Farbe, nicht zu dunkel; sehr helle Flaechen kaum (Fell und Leinen sind ebenfalls hell und grau)
    const steel = (1 - smooth(0.12, 0.24, s)) * smooth(0.3, 0.5, v) * (1 - 0.75 * smooth(0.84, 0.95, v));
    // Gold und Bronze: Farbton 30 bis 55 Grad, kraeftig und hell
    const gold = smooth(22, 32, h) * (1 - smooth(52, 62, h)) * smooth(0.3, 0.45, s) * smooth(0.5, 0.68, v);
    const metal = Math.min(1, Math.max(steel * 0.9, gold));
    return { metal, rough: 0.82 - 0.5 * metal };
  };
  A.metalMap = function (key, src) {
    const T = globalThis.THREE;
    if (!T || !src) return null;
    if (METC[key]) return METC[key];
    // bis das Bild da ist: matt, wie bisher
    const c0 = document.createElement("canvas");
    c0.width = c0.height = 1;
    const x0 = c0.getContext("2d");
    x0.fillStyle = "rgb(0,209,0)";
    x0.fillRect(0, 0, 1, 1);
    const tex = new T.CanvasTexture(c0);
    tex.colorSpace = T.NoColorSpace;
    tex.wrapS = tex.wrapT = src.wrapS;
    const build = () => {
      const img = src.image;
      if (!img || !img.width) return;
      const N = Math.min(256, img.width);
      const c = document.createElement("canvas");
      c.width = c.height = N;
      const cx = c.getContext("2d", { willReadFrequently: true });
      cx.drawImage(img, 0, 0, N, N);
      const d = cx.getImageData(0, 0, N, N);
      const p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        const m = A.metalPixel(p[i], p[i + 1], p[i + 2]);
        p[i] = 0;
        p[i + 1] = Math.round(m.rough * 255);
        p[i + 2] = Math.round(m.metal * 255);
        p[i + 3] = 255;
      }
      cx.putImageData(d, 0, 0);
      tex.image = c;
      tex.needsUpdate = true;
    };
    if (src.image && src.image.width) build();
    else if (src.userData && src.userData.ready) src.userData.ready.then(build);
    return (METC[key] = tex);
  };
})();
