/* Helden von Schwebfels - eigene Vektor-Symbole fuer Gegenstaende und Oberflaeche. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const I = (SB.icons = {});
  const O = "#1c1626"; // Umrissfarbe, passend zu den 3D-Umrissen

  function hexToRgb(h) {
    h = h.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, f) {
    const [r, g, b] = hexToRgb(hex || "#888888");
    const c = (v) => Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f)));
    return "#" + [c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  I.shade = shade;

  const st = 'stroke="' + O + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"';
  const svg = (body, vb) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (vb || "0 0 64 64") + '" aria-hidden="true">' + body + "</svg>";

  const METAL = "#c8ced6";
  const GOLD = "#e0b04a";
  const WOOD = "#8a5a35";

  const ITEM = {
    schwert: (c, g) =>
      `<path d="M44 8 L56 8 L56 20 L26 44 L20 38 Z" fill="${g || METAL}" ${st}/><path d="M50 14 L24 40" stroke="${shade(g || METAL, 0.7)}" stroke-width="2"/>` +
      `<path d="M14 34 L30 50 L26 54 L10 38 Z" fill="${GOLD}" ${st}/><path d="M18 46 L10 54" stroke="${c}" stroke-width="7" stroke-linecap="round"/><path d="M18 46 L10 54" stroke="${O}" stroke-width="1.6" fill="none"/><circle cx="8" cy="56" r="4.5" fill="${GOLD}" ${st}/>`,
    axt: (c, g) =>
      `<path d="M14 56 L42 14" stroke="${O}" stroke-width="8" stroke-linecap="round"/><path d="M14 56 L42 14" stroke="${WOOD}" stroke-width="4.5" stroke-linecap="round"/>` +
      `<path d="M35 23 L44 9 C53 9 61 16 58 26 C56 31 51 34 46 33 Z" fill="${g || METAL}" ${st}/><path d="M48 31 C54 29 57 24 56 18" stroke="${shade(g || METAL, 0.7)}" stroke-width="2" fill="none"/>`,
    hammer: (c, g) =>
      `<path d="M14 56 L38 22" stroke="${O}" stroke-width="8" stroke-linecap="round"/><path d="M14 56 L38 22" stroke="${WOOD}" stroke-width="4.5" stroke-linecap="round"/>` +
      `<rect x="28" y="6" width="18" height="30" rx="3" transform="rotate(35 37 21)" fill="${g || METAL}" ${st}/><rect x="34" y="12" width="6" height="18" transform="rotate(35 37 21)" fill="${GOLD}" ${st}/>`,
    bogen: (c) =>
      `<path d="M16 8 C44 14 50 40 18 56" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="M16 8 C44 14 50 40 18 56" fill="none" stroke="${c || WOOD}" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M16 8 L18 56" stroke="#efe6d2" stroke-width="1.6"/><path d="M8 34 L52 30" stroke="${O}" stroke-width="2.4"/><path d="M52 30 L44 26 L45 34 Z" fill="${METAL}" ${st}/><path d="M8 34 L13 30 M8 34 L13 38" stroke="#d0503a" stroke-width="3"/>`,
    dolch: (c, g) =>
      `<g transform="rotate(-35 32 32)"><path d="M29 6 L35 6 L36 34 L28 34 Z" fill="${g || METAL}" ${st}/><rect x="24" y="34" width="16" height="5" rx="2" fill="${GOLD}" ${st}/><rect x="29" y="39" width="6" height="12" fill="${c}" ${st}/></g>` +
      `<g transform="rotate(35 32 32)"><path d="M29 6 L35 6 L36 34 L28 34 Z" fill="${g || METAL}" ${st}/><rect x="24" y="34" width="16" height="5" rx="2" fill="${GOLD}" ${st}/><rect x="29" y="39" width="6" height="12" fill="${c}" ${st}/></g>`,
    armbrust: (c) =>
      `<path d="M10 22 C24 8 40 8 54 22" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="M10 22 C24 8 40 8 54 22" fill="none" stroke="${c || WOOD}" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M10 22 L54 22" stroke="#efe6d2" stroke-width="1.6"/><rect x="28" y="14" width="8" height="44" rx="3" fill="${WOOD}" ${st}/><path d="M32 6 L32 20" stroke="${O}" stroke-width="2.6"/><path d="M32 4 L28 10 L36 10 Z" fill="${METAL}" ${st}/>`,
    stab: (c, g) =>
      `<path d="M16 58 L42 18" stroke="${O}" stroke-width="7.5" stroke-linecap="round"/><path d="M16 58 L42 18" stroke="${c || WOOD}" stroke-width="4" stroke-linecap="round"/>` +
      `<circle cx="44" cy="16" r="9" fill="none" stroke="${GOLD}" stroke-width="3"/><path d="M46 2 L54 14 L46 26 L38 14 Z" fill="${g || "#7fe3ff"}" ${st}/><path d="M46 6 L50 14 L46 14 Z" fill="#ffffff" opacity="0.7"/>`,
    zepter: (c, g) =>
      `<path d="M18 58 L38 26" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="M18 58 L38 26" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>` +
      `<circle cx="42" cy="20" r="10" fill="${g || "#ff7a9a"}" ${st}/><circle cx="39" cy="17" r="3" fill="#ffffff" opacity="0.7"/><path d="M32 12 L34 4 L38 10 L42 2 L46 10 L50 4 L52 12" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linejoin="round"/>`,
    schild: (c, g, s) => {
      if (s === 1) return `<path d="M32 4 L54 12 C54 34 46 50 32 60 C18 50 10 34 10 12 Z" fill="${c}" ${st}/><path d="M32 8 L32 56 M14 22 L50 22" stroke="${g || GOLD}" stroke-width="5"/><path d="M32 4 L54 12 C54 34 46 50 32 60 C18 50 10 34 10 12 Z" fill="none" ${st}/>`;
      if (s === 2) return `<rect x="12" y="6" width="40" height="52" rx="4" fill="${c}" ${st}/><rect x="10" y="6" width="44" height="7" rx="2" fill="${g || GOLD}" ${st}/><rect x="10" y="51" width="44" height="7" rx="2" fill="${g || GOLD}" ${st}/><circle cx="32" cy="32" r="6" fill="${g || GOLD}" ${st}/>`;
      return `<circle cx="32" cy="32" r="25" fill="${c}" ${st}/><circle cx="32" cy="32" r="25" fill="none" stroke="${g || GOLD}" stroke-width="5"/><circle cx="32" cy="32" r="27.5" fill="none" stroke="${O}" stroke-width="2.4"/><circle cx="32" cy="32" r="7" fill="${g || GOLD}" ${st}/>`;
    },
    koecher: (c) =>
      `<path d="M20 22 L28 6 M28 22 L34 4 M36 22 L42 6" stroke="${O}" stroke-width="2.4"/><path d="M26 4 L30 10 M32 2 L36 8 M40 4 L44 10" stroke="#d0503a" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M16 20 L46 20 L42 58 L22 58 Z" fill="${c}" ${st}/><path d="M18 30 L44 30" stroke="${shade(c, 0.65)}" stroke-width="3"/><path d="M20 46 L44 46" stroke="${shade(c, 0.65)}" stroke-width="3"/>`,
    fokus: (c, g) =>
      `<ellipse cx="32" cy="36" rx="25" ry="9" fill="none" stroke="${g || c}" stroke-width="3" opacity="0.8"/><path d="M32 4 L46 30 L32 58 L18 30 Z" fill="${g || c}" ${st}/><path d="M32 4 L32 58 M18 30 L46 30" stroke="${O}" stroke-width="1.4" opacity="0.6"/><path d="M32 8 L40 28 L32 28 Z" fill="#ffffff" opacity="0.55"/>`,
    helm: (c, g, s) =>
      `<path d="M12 36 C12 14 52 14 52 36 L52 52 L12 52 Z" fill="${c}" ${st}/><path d="M18 34 L46 34" stroke="${O}" stroke-width="4"/><path d="M32 30 L32 52" stroke="${shade(c, 0.7)}" stroke-width="5"/><path d="M12 42 L52 42" stroke="${GOLD}" stroke-width="3"/>` +
      (s === 1 ? `<path d="M32 16 C30 6 40 2 48 6 C42 8 38 12 36 18 Z" fill="${g || "#c0392b"}" ${st}/>` : s === 2 ? `<path d="M14 26 C6 22 4 14 6 6 C10 14 16 18 20 20 Z M50 26 C58 22 60 14 58 6 C54 14 48 18 44 20 Z" fill="#efe6d2" ${st}/>` : ""),
    kappe: (c) =>
      `<path d="M10 56 C8 30 18 8 34 6 C50 8 58 30 54 56 Z" fill="${c}" ${st}/><path d="M20 52 C20 34 26 24 32 24 C40 24 46 34 44 52 Z" fill="#2a2633"/><circle cx="27" cy="38" r="2.4" fill="#ffe45a"/><circle cx="37" cy="38" r="2.4" fill="#ffe45a"/>`,
    hut: (c, g) =>
      `<ellipse cx="32" cy="50" rx="28" ry="8" fill="${c}" ${st}/><path d="M18 48 L30 8 C34 4 40 8 42 12 L46 48 Z" fill="${c}" ${st}/><path d="M19 42 C28 46 38 46 46 42" stroke="${GOLD}" stroke-width="4" fill="none"/>` +
      `<path d="M34 26 L36 31 L41 31 L37 34 L39 39 L34 36 L29 39 L31 34 L27 31 L32 31 Z" fill="${g || "#ffe27a"}" stroke="${O}" stroke-width="1.2"/>`,
    harnisch: (c, g) =>
      `<path d="M14 12 L24 8 C28 14 36 14 40 8 L50 12 L54 26 L48 30 L48 56 L16 56 L16 30 L10 26 Z" fill="${c}" ${st}/><path d="M32 16 L32 54" stroke="${shade(c, 0.7)}" stroke-width="2.4"/><path d="M18 36 C26 40 38 40 46 36" stroke="${shade(c, 0.7)}" stroke-width="2.4" fill="none"/><circle cx="32" cy="26" r="4" fill="${g || GOLD}" ${st}/>`,
    wams: (c) =>
      `<path d="M14 14 L26 8 L32 16 L38 8 L50 14 L52 56 L12 56 Z" fill="${c}" ${st}/><path d="M32 16 L32 56" stroke="${O}" stroke-width="2"/><path d="M28 24 L36 28 M28 32 L36 36 M28 40 L36 44" stroke="#efe6d2" stroke-width="2"/><rect x="12" y="46" width="40" height="5" fill="${shade(c, 0.6)}" ${st}/>`,
    robe: (c, g) =>
      `<path d="M22 6 L42 6 L46 22 L56 58 L8 58 L18 22 Z" fill="${c}" ${st}/><path d="M24 6 L32 18 L40 6" fill="none" stroke="${GOLD}" stroke-width="3"/><rect x="17" y="28" width="30" height="5" fill="${GOLD}" ${st}/><path d="M32 33 L32 58" stroke="${g || shade(c, 0.7)}" stroke-width="3"/>`,
    handschuhe: (c) =>
      `<path d="M20 58 L20 40 L14 28 C12 24 18 22 20 26 L22 30 L22 14 C22 10 28 10 28 14 L28 26 L30 10 C30 6 36 6 36 10 L36 26 L38 14 C38 10 44 10 44 14 L44 30 L46 22 C46 18 52 18 52 22 L50 42 L44 58 Z" fill="${c}" ${st}/><rect x="18" y="50" width="28" height="9" rx="2" fill="${shade(c, 0.7)}" ${st}/>`,
    stiefel: (c) =>
      `<path d="M20 6 L40 6 L40 38 C48 40 56 42 56 52 L56 58 L14 58 L16 40 Z" fill="${c}" ${st}/><rect x="18" y="6" width="24" height="8" fill="${shade(c, 0.7)}" ${st}/><path d="M14 52 L56 52" stroke="${O}" stroke-width="2.4"/>`,
    umhang: (c, g) =>
      `<path d="M20 8 L44 8 C46 24 54 44 58 58 C44 54 20 54 6 58 C10 44 18 24 20 8 Z" fill="${c}" ${st}/><path d="M28 14 C26 30 22 44 18 56 M36 14 C38 30 42 44 46 56" stroke="${shade(c, 0.7)}" stroke-width="2.4" fill="none"/><circle cx="32" cy="10" r="5" fill="${g || GOLD}" ${st}/>`,
    amulett: (c, g) =>
      `<path d="M14 6 C14 26 24 34 32 36 C40 34 50 26 50 6" fill="none" stroke="${O}" stroke-width="5"/><path d="M14 6 C14 26 24 34 32 36 C40 34 50 26 50 6" fill="none" stroke="${GOLD}" stroke-width="2.4" stroke-dasharray="3 2"/>` +
      `<path d="M32 32 L44 46 L32 60 L20 46 Z" fill="${GOLD}" ${st}/><path d="M32 38 L39 46 L32 54 L25 46 Z" fill="${g || c}" stroke="${O}" stroke-width="1.6"/>`,
    ring: (c, g) =>
      `<ellipse cx="32" cy="40" rx="18" ry="16" fill="none" stroke="${O}" stroke-width="10"/><ellipse cx="32" cy="40" rx="18" ry="16" fill="none" stroke="${c}" stroke-width="5.5"/>` +
      `<path d="M32 10 L42 20 L32 30 L22 20 Z" fill="${g || "#ff5a8a"}" ${st}/><path d="M32 14 L37 20 L32 20 Z" fill="#ffffff" opacity="0.7"/>`,
    talisman: (c, g) =>
      `<path d="M32 2 L32 12" stroke="${O}" stroke-width="2.4"/><path d="M14 14 L50 14 L54 34 L32 60 L10 34 Z" fill="${shade(c, 0.85)}" ${st}/><path d="M24 26 L32 22 L40 26 L32 48 Z M22 36 L42 36" fill="none" stroke="${g || "#7fe3ff"}" stroke-width="3.5"/>`,
    trank: (c) =>
      `<rect x="26" y="4" width="12" height="8" rx="2" fill="${WOOD}" ${st}/><path d="M27 12 L37 12 L37 22 C48 26 52 34 52 42 C52 54 42 60 32 60 C22 60 12 54 12 42 C12 34 16 26 27 22 Z" fill="#e9f6ff" ${st}/>` +
      `<path d="M14 42 C20 38 44 38 50 42 C50 52 42 58 32 58 C22 58 14 52 14 42 Z" fill="${c}"/><circle cx="24" cy="48" r="3" fill="#ffffff" opacity="0.6"/><circle cx="36" cy="46" r="2" fill="#ffffff" opacity="0.6"/>`,
  };

  const RAR_GLOW = { gewoehnlich: null, ungewoehnlich: null, selten: "#4fa9ff", episch: "#c47bff", legendaer: "#ffb13b" };

  I.item = function (item) {
    if (!item) return "";
    const fn = ITEM[item.base] || ITEM.talisman;
    const rar = RAR_GLOW[item.rarity];
    const c = item.tint || "#9aa4ad";
    let body = fn(c, rar, item.style || 0);
    if (item.rarity === "episch" || item.rarity === "legendaer") {
      body += `<path d="M54 4 L56 9 L61 11 L56 13 L54 18 L52 13 L47 11 L52 9 Z" fill="${rar}" stroke="${O}" stroke-width="1"/>`;
    }
    return svg(body);
  };
  I.potion = (color) => svg(ITEM.trank(color || "#e0644f"));

  /* ---------- Oberflaechen-Symbole (24er Raster) ---------- */
  const s2 = 'stroke="' + O + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"';
  const UI = {
    gold: `<circle cx="12" cy="12" r="9" fill="#ffd25a" ${s2}/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#c9902a" stroke-width="1.6"/><path d="M10 9.5 L12 8 L14 9.5 L14 14.5 L12 16 L10 14.5 Z" fill="#fff3c4" opacity="0.8"/>`,
    perle: `<circle cx="12" cy="13" r="8" fill="#e9f0ff" ${s2}/><circle cx="9.5" cy="10.5" r="2.6" fill="#ffffff"/><path d="M6 17 C9 20 15 20 18 17" stroke="#b9c6ff" stroke-width="1.6" fill="none"/><path d="M17 3 L18 5.5 L20.5 6.5 L18 7.5 L17 10 L16 7.5 L13.5 6.5 L16 5.5 Z" fill="#9fe3ff" stroke="${O}" stroke-width="0.8"/>`,
    tatendrang: `<path d="M13.5 2 L5 13.5 L11 13.5 L9.5 22 L19 9.5 L13 9.5 Z" fill="#ffb13b" ${s2}/>`,
    xp: `<path d="M12 2.5 L14.8 8.6 L21.5 9.3 L16.4 13.8 L17.9 20.4 L12 17 L6.1 20.4 L7.6 13.8 L2.5 9.3 L9.2 8.6 Z" fill="#9fe3ff" ${s2}/>`,
    kraft: `<path d="M6 11 C6 7 9 6 11 7 L11 5 C11 3 15 3 15 5 L15 7 C17 6 19 7 19 9 L19 15 C19 19 16 21 12 21 C8 21 6 18 6 15 Z" fill="#e0644f" ${s2}/><path d="M11 7 L11 12 M15 7 L15 12" stroke="${O}" stroke-width="1.4"/>`,
    geschick: `<path d="M20 3 C10 4 5 11 4 21 C8 14 12 11 16 10 C13 13 10 16 8 20 C15 17 19 11 20 3 Z" fill="#74d86f" ${s2}/>`,
    verstand: `<path d="M2.5 12 C6 6 18 6 21.5 12 C18 18 6 18 2.5 12 Z" fill="#e9e0ff" ${s2}/><circle cx="12" cy="12" r="4" fill="#8f7cff" ${s2}/><circle cx="13.3" cy="10.7" r="1.2" fill="#fff"/>`,
    konstitution: `<path d="M12 20.5 C4 15 2.5 11 3.5 7.5 C4.8 3.5 10 3.5 12 7.2 C14 3.5 19.2 3.5 20.5 7.5 C21.5 11 20 15 12 20.5 Z" fill="#ff6f91" ${s2}/>`,
    glueck: `<circle cx="8.5" cy="8.5" r="4.2" fill="#5fbf7a" ${s2}/><circle cx="15.5" cy="8.5" r="4.2" fill="#5fbf7a" ${s2}/><circle cx="8.5" cy="15" r="4.2" fill="#5fbf7a" ${s2}/><circle cx="15.5" cy="15" r="4.2" fill="#5fbf7a" ${s2}/><path d="M12 12 L15 22" stroke="${O}" stroke-width="1.8"/>`,
    ruestung: `<path d="M12 2.5 L20 5.5 C20 13 17 18 12 21.5 C7 18 4 13 4 5.5 Z" fill="#9aa4ad" ${s2}/><path d="M12 6 L12 18" stroke="${O}" stroke-width="1.2"/>`,
    schaden: `<path d="M4 4 L6.5 4 L17 14.5 L14.5 17 L4 6.5 Z M20 4 L17.5 4 L7 14.5 L9.5 17 L20 6.5 Z" fill="#c8ced6" ${s2}/><path d="M13 18 L18 13 M11 18 L6 13" stroke="${O}" stroke-width="2.6"/><circle cx="19.5" cy="19.5" r="2" fill="#e0b04a" ${s2}/><circle cx="4.5" cy="19.5" r="2" fill="#e0b04a" ${s2}/>`,
    ehre: `<path d="M7 3 L17 3 L17 9 C17 13 14.5 15 12 15 C9.5 15 7 13 7 9 Z" fill="#ffd25a" ${s2}/><path d="M7 5 C3 5 3 10 7.5 11 M17 5 C21 5 21 10 16.5 11" fill="none" stroke="${O}" stroke-width="1.6"/><path d="M10 15 L14 15 L14.5 18 L9.5 18 Z" fill="#c9902a" ${s2}/><rect x="7" y="18" width="10" height="3.5" rx="1" fill="#8a5a35" ${s2}/>`,
    uhr: `<path d="M6 3 L18 3 L18 5 C18 9 14 11 12 12 C14 13 18 15 18 19 L18 21 L6 21 L6 19 C6 15 10 13 12 12 C10 11 6 9 6 5 Z" fill="#e9f6ff" ${s2}/><path d="M8.5 19.5 C9 17 11 16 12 15.5 C13 16 15 17 15.5 19.5 Z" fill="#ffd25a"/>`,
    held: `<path d="M5 13 C5 6 19 6 19 13 L19 19 L5 19 Z" fill="#9aa4ad" ${s2}/><path d="M7.5 12.5 L16.5 12.5" stroke="${O}" stroke-width="2"/><path d="M12 11 L12 19" stroke="${O}" stroke-width="1.4"/><path d="M12 6 C12 3 16 2 18 3 C16 4 14 5 14 7" fill="#c0392b" ${s2}/>`,
    taverne: `<path d="M5 6 L16 6 L15 21 L6 21 Z" fill="#ffd25a" ${s2}/><path d="M5 6 C5 3 16 3 16 6" fill="#ffffff" ${s2}/><path d="M16 9 C21 9 21 16 15.5 16" fill="none" stroke="${O}" stroke-width="2.2"/>`,
    schmiede: `<path d="M3 8 L18 8 C18 11 15 12 13 12 L13 15 L17 19 L5 19 L9 15 L9 12 C6 12 4 10 3 8 Z" fill="#7f8a96" ${s2}/><path d="M18 3 L21 6" stroke="${O}" stroke-width="2.2"/>`,
    arkanum: `<path d="M9 3 L15 3 L15 8 C19 10 20 13 20 15 C20 19 16 21.5 12 21.5 C8 21.5 4 19 4 15 C4 13 5 10 9 8 Z" fill="#c47bff" ${s2}/><circle cx="10" cy="15" r="1.6" fill="#fff" opacity="0.8"/><circle cx="14" cy="17" r="1" fill="#fff" opacity="0.8"/>`,
    arena: `<path d="M4 4 L6.5 4 L17 14.5 L14.5 17 L4 6.5 Z M20 4 L17.5 4 L7 14.5 L9.5 17 L20 6.5 Z" fill="#ffd25a" ${s2}/><path d="M13 18 L18 13 M11 18 L6 13" stroke="${O}" stroke-width="2.6"/>`,
    leuchtturm: `<path d="M9 21 L10 9 L14 9 L15 21 Z" fill="#f4efe6" ${s2}/><path d="M9.6 13 L14.4 13 M9.3 17 L14.7 17" stroke="#c0392b" stroke-width="2.2"/><rect x="9" y="5" width="6" height="4" fill="#ffe27a" ${s2}/><path d="M8.5 5 L12 2 L15.5 5 Z" fill="#c0392b" ${s2}/><path d="M16 6 L22 4 M16 8 L22 9" stroke="#ffb13b" stroke-width="1.6"/>`,
    tiefen: `<path d="M4 21 L4 10 C4 4 20 4 20 10 L20 21 Z" fill="#6a6577" ${s2}/><ellipse cx="12" cy="14" rx="5" ry="6" fill="#c47bff" ${s2}/><path d="M12 10 C14.5 11 14.5 14 12 15 C10 15.5 10 13 12 13" fill="none" stroke="#fff" stroke-width="1.2"/>`,
    stall: `<path d="M5 3 C5 14 7.5 21 12 21 C16.5 21 19 14 19 3 L15.5 3 C15.5 12 14 17 12 17 C10 17 8.5 12 8.5 3 Z" fill="#c8ced6" ${s2}/><circle cx="7" cy="7" r="0.9" fill="${O}"/><circle cx="17" cy="7" r="0.9" fill="${O}"/><circle cx="7.6" cy="12" r="0.9" fill="${O}"/><circle cx="16.4" cy="12" r="0.9" fill="${O}"/>`,
    ruhm: `<path d="M7 3 L17 3 L17 9 C17 13 14.5 15 12 15 C9.5 15 7 13 7 9 Z" fill="#ffd25a" ${s2}/><path d="M7 5 C3 5 3 10 7.5 11 M17 5 C21 5 21 10 16.5 11" fill="none" stroke="${O}" stroke-width="1.6"/><rect x="7" y="18" width="10" height="3.5" rx="1" fill="#8a5a35" ${s2}/><path d="M11 15 L13 15 L13 18 L11 18 Z" fill="#c9902a" ${s2}/>`,
    brunnen: `<path d="M4 12 L20 12 L19 20 L5 20 Z" fill="#9aa0a6" ${s2}/><path d="M5.5 15 L18.5 15" stroke="#4fa9ff" stroke-width="2"/><path d="M3 8 L12 3 L21 8 Z" fill="#3f6fbf" ${s2}/><path d="M6 8 L6 12 M18 8 L18 12" stroke="${O}" stroke-width="1.6"/>`,
    einstellungen: `<path d="M12 2.5 L14 5 L17.2 4.2 L17.6 7.4 L20.6 8.8 L19.3 11.8 L21 14.6 L18 16 L17.6 19.4 L14.4 18.9 L12 21.5 L9.6 18.9 L6.4 19.4 L6 16 L3 14.6 L4.7 11.8 L3.4 8.8 L6.4 7.4 L6.8 4.2 L10 5 Z" fill="#c8ced6" ${s2}/><circle cx="12" cy="12" r="3.5" fill="#3a4a5a" ${s2}/>`,
    ton: `<path d="M3 9 L7 9 L12 4.5 L12 19.5 L7 15 L3 15 Z" fill="#e9f6ff" ${s2}/><path d="M15 8.5 C17 10 17 14 15 15.5 M17.5 6 C21 9 21 15 17.5 18" fill="none" stroke="${O}" stroke-width="1.6"/>`,
    stumm: `<path d="M3 9 L7 9 L12 4.5 L12 19.5 L7 15 L3 15 Z" fill="#e9f6ff" ${s2}/><path d="M15 9 L21 15 M21 9 L15 15" stroke="${O}" stroke-width="1.8"/>`,
    buch: `<path d="M3 5 C6 4 9.5 4 12 6 C14.5 4 18 4 21 5 L21 19 C18 18 14.5 18 12 20 C9.5 18 6 18 3 19 Z" fill="#e9e0c8" ${s2}/><path d="M12 6 L12 20" stroke="${O}" stroke-width="1.4"/>`,
    abzeichen: `<path d="M8 2 L16 2 L15 9 L9 9 Z" fill="#4fa9ff" ${s2}/><circle cx="12" cy="15" r="6.5" fill="#ffd25a" ${s2}/><path d="M12 11.5 L13.1 14 L15.6 14.2 L13.7 15.9 L14.3 18.4 L12 17 L9.7 18.4 L10.3 15.9 L8.4 14.2 L10.9 14 Z" fill="#fff3c4" stroke="${O}" stroke-width="0.8"/>`,
    zurueck: `<path d="M15 4 L7 12 L15 20" fill="none" stroke="${O}" stroke-width="2.6"/>`,
    schliessen: `<path d="M6 6 L18 18 M18 6 L6 18" stroke="${O}" stroke-width="2.6"/>`,
    pfeil: `<path d="M12 20 L12 5 M6 11 L12 5 L18 11" fill="none" stroke="#74d86f" stroke-width="3" stroke-linecap="round"/>`,
    sanduhr: `<path d="M6 3 L18 3 L18 5 C18 9 14 11 12 12 C14 13 18 15 18 19 L18 21 L6 21 L6 19 C6 15 10 13 12 12 C10 11 6 9 6 5 Z" fill="#e9f6ff" ${s2}/><path d="M8.5 19.5 C9 17 11 16 12 15.5 C13 16 15 17 15.5 19.5 Z" fill="#ffd25a"/>`,
    rucksack: `<path d="M6 8 C6 4 18 4 18 8 L19 20 C19 21 18 21.5 17 21.5 L7 21.5 C6 21.5 5 21 5 20 Z" fill="#a8743f" ${s2}/><rect x="8" y="12" width="8" height="5" rx="1.5" fill="#8a5a35" ${s2}/><path d="M9 4.5 C9 2.5 15 2.5 15 4.5" fill="none" stroke="${O}" stroke-width="1.6"/>`,
  };
  I.ui = function (name, cls) {
    const body = UI[name];
    if (!body) return "";
    return '<svg class="ic ' + (cls || "") + '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">' + body + "</svg>";
  };

  /* Klassenwappen fuer Ranglisten */
  I.classCrest = function (cls) {
    const C = SB.data.CLASSES[cls];
    const col = C ? C.color : "#888";
    const inner = cls === "klinge" ? UI.ruestung : cls === "wind" ? UI.geschick : UI.verstand;
    return '<svg class="ic crest" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="' + col + '" stroke="' + O + '" stroke-width="1.4"/><g transform="translate(4.8 4.8) scale(0.6)">' + inner + "</g></svg>";
  };

  /* Ersatzbild, falls kein 3D verfuegbar ist */
  I.silhouette = function (color, kind) {
    const c = color || "#7f8a96";
    if (kind === "monster")
      return svg(`<path d="M10 58 C6 34 16 12 32 12 C48 12 58 34 54 58 Z" fill="${c}" ${st}/><circle cx="24" cy="32" r="5" fill="#fff" ${st}/><circle cx="40" cy="32" r="5" fill="#fff" ${st}/><circle cx="24" cy="33" r="2" fill="${O}"/><circle cx="40" cy="33" r="2" fill="${O}"/><path d="M24 46 L28 42 L32 46 L36 42 L40 46" fill="none" stroke="${O}" stroke-width="2.4"/>`);
    return svg(`<circle cx="32" cy="22" r="13" fill="#f2cba8" ${st}/><path d="M12 62 C12 42 20 36 32 36 C44 36 52 42 52 62 Z" fill="${c}" ${st}/><circle cx="27" cy="22" r="2" fill="${O}"/><circle cx="37" cy="22" r="2" fill="${O}"/>`);
  };
})();
