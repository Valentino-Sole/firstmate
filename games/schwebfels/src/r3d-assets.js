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
        for (const k in g.beasts || {}) {
          const t = A.texture("beast." + k, g.beasts[k].tex, { srgb: true });
          if (t) waits.push(t.userData.ready);
        }
        await Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, 4000))]);
      }
      A.data = data;
    } catch (e) {
      A.error = e;
      console.warn("Modellpaket nicht verfuegbar, alte Figuren werden genutzt", e);
    }
    done(A.data);
    return A.data;
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
    tex.userData.ready = new Promise((res) => {
      img.onload = () => {
        tex.image = img;
        tex.needsUpdate = true;
        URL.revokeObjectURL(url);
        res();
      };
      img.onerror = () => res();
    });
    img.src = url;
    return (TEXC[key] = tex);
  };
})();
