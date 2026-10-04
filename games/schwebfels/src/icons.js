/* Helden von Schwebfels - eigene Vektor-Symbole im Fantasy-Stil.
   Metall- und Holzverlaeufe, Edelsteine, Runengravuren und ein Leuchten je Seltenheit. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});
  const I = (SB.icons = {});
  const O = "#14101a";

  function hexToRgb(h) {
    h = String(h || "#888888").replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, f) {
    const [r, g, b] = hexToRgb(hex);
    const c = (v) => Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f)));
    return "#" + [c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  I.shade = shade;

  let uid = 0;
  const svg = (body, vb) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (vb || "0 0 64 64") + '" aria-hidden="true">' + body + "</svg>";
  const st = (w) => 'stroke="' + O + '" stroke-width="' + (w || 1.6) + '" stroke-linejoin="round" stroke-linecap="round"';

  // Verlaeufe je Symbol (eindeutige IDs, da mehrere Symbole auf einer Seite stehen)
  function defs(id, c, glowC) {
    const lin = (n, a, b, cc, x2, y2) =>
      `<linearGradient id="${n}${id}" x1="0" y1="0" x2="${x2 == null ? 1 : x2}" y2="${y2 == null ? 1 : y2}"><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${cc}"/></linearGradient>`;
    return (
      "<defs>" +
      lin("m", "#f6f8fb", "#a9b3be", "#4e5864") +
      lin("d", "#9aa4b0", "#5a6470", "#2a3038") +
      lin("g", "#fff3b8", "#d9a441", "#6e4e14") +
      lin("w", "#a87a4a", "#6a4628", "#3a2412", 0, 1) +
      lin("l", "#9a6a42", "#5e3e24", "#2e1c10", 0, 1) +
      lin("t", shade(c, 1.45), c, shade(c, 0.5)) +
      lin("b", "#f4ecd8", "#cfc2a2", "#8a7a5a") +
      `<radialGradient id="j${id}" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="${glowC}"/><stop offset="1" stop-color="${shade(glowC, 0.35)}"/></radialGradient>` +
      `<radialGradient id="h${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${glowC}" stop-opacity=".75"/><stop offset=".6" stop-color="${glowC}" stop-opacity=".18"/><stop offset="1" stop-color="${glowC}" stop-opacity="0"/></radialGradient>` +
      "</defs>"
    );
  }
  const gem = (id, cx, cy, r) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#j${id})" ${st(1.2)}/><circle cx="${cx - r * 0.35}" cy="${cy - r * 0.35}" r="${r * 0.28}" fill="#fff" opacity=".85"/>`;
  const rune = (x, y, k, col) => {
    const p = [`M${x} ${y - 3} L${x} ${y + 3} M${x} ${y - 3} L${x + 2.5} ${y - 0.5} L${x} ${y + 1}`, `M${x} ${y - 3} L${x} ${y + 3} M${x - 2} ${y - 2} L${x + 2} ${y + 1}`, `M${x} ${y - 3} L${x} ${y + 3} M${x} ${y} L${x + 2.5} ${y - 2.5} M${x} ${y} L${x - 2.5} ${y - 2.5}`][k % 3];
    return `<path d="${p}" stroke="${col}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  };

  /* Gegenstaende: (id, Farbe, Leuchtfarbe, Stil) -> SVG-Koerper */
  const ITEM = {
    schwert: (id, c, g, s) => {
      const blade = s === 1 ? "M43 6 L57 4 L55 18 L27 45 L19 37 Z" : s === 2 ? "M45 5 L58 3 L56 16 L50 18 L46 26 L40 26 L27 44 L20 37 L36 22 L38 16 L44 14 Z" : "M46 6 L57 4 L55 15 L26 44 L20 38 Z";
      return (
        `<path d="${blade}" fill="url(#m${id})" ${st()}/><path d="M53 8 L24 41" stroke="#5a6470" stroke-width="1.6" opacity=".7"/>` +
        (g ? rune(42, 21, 0, g) + rune(36, 27, 1, g) + rune(30, 33, 2, g) : "") +
        `<path d="M10 33 C14 31 18 34 22 37 C26 41 30 45 31 51 C26 49 22 46 18 42 C14 39 11 37 10 33 Z" fill="url(#g${id})" ${st()}/>` +
        `<path d="M19 45 L9 55" stroke="${O}" stroke-width="7.5" stroke-linecap="round"/><path d="M19 45 L9 55" stroke="url(#l${id})" stroke-width="5" stroke-linecap="round"/><path d="M17 47 L15 49 M14 50 L12 52" stroke="#c9a441" stroke-width="1.4"/>` +
        gem(id, 7, 57, 4)
      );
    },
    axt: (id, c, g, s) =>
      `<path d="M12 58 L42 12" stroke="${O}" stroke-width="7.5" stroke-linecap="round"/><path d="M12 58 L42 12" stroke="url(#w${id})" stroke-width="4.5" stroke-linecap="round"/>` +
      `<path d="M18 49 L22 52 M21 45 L25 48" stroke="url(#g${id})" stroke-width="3"/>` +
      `<path d="M36 21 L42 11 C50 4 60 8 61 18 C62 28 56 35 48 34 C46 30 41 26 36 21 Z" fill="url(#m${id})" ${st()}/><path d="M57 14 C59 20 57 28 50 31" stroke="#fff" stroke-width="1.6" fill="none" opacity=".7"/>` +
      (s === 1 ? `<path d="M37 18 C30 12 24 14 22 20 C21 26 26 30 32 28 Z" fill="url(#m${id})" ${st()}/>` : `<path d="M38 17 L28 12 L31 22 Z" fill="url(#d${id})" ${st()}/>`) +
      gem(id, 41, 18, 3.5) +
      (g ? rune(52, 20, 1, g) + rune(48, 26, 2, g) : ""),
    hammer: (id, c, g, s) =>
      `<path d="M12 58 L38 20" stroke="${O}" stroke-width="7.5" stroke-linecap="round"/><path d="M12 58 L38 20" stroke="url(#w${id})" stroke-width="4.5" stroke-linecap="round"/>` +
      (s === 1
        ? `<circle cx="42" cy="16" r="12" fill="url(#m${id})" ${st()}/>` + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (i / 8) * Math.PI * 2; return `<path d="M${42 + Math.cos(a) * 11} ${16 + Math.sin(a) * 11} L${42 + Math.cos(a) * 17} ${16 + Math.sin(a) * 17} L${42 + Math.cos(a + 0.25) * 11} ${16 + Math.sin(a + 0.25) * 11} Z" fill="url(#d${id})" ${st(1.2)}/>`; }).join("")
        : `<g transform="rotate(35 40 18)"><rect x="24" y="8" width="32" height="20" rx="3" fill="url(#m${id})" ${st()}/><rect x="36" y="6" width="8" height="24" rx="1.5" fill="url(#g${id})" ${st()}/>${g ? rune(30, 18, 0, g) + rune(50, 18, 2, g) : ""}</g>`) +
      gem(id, 33, 28, 3),
    dolch: (id, c, g) => {
      const one = (rot) => `<g transform="rotate(${rot} 32 34)"><path d="M32 4 C36 12 36 22 35 32 L29 32 C28 22 28 12 32 4 Z" fill="url(#m${id})" ${st()}/><path d="M32 8 L32 30" stroke="#5a6470" stroke-width="1.2"/><path d="M23 32 C27 30 37 30 41 32 L40 36 L24 36 Z" fill="url(#g${id})" ${st()}/><rect x="29.5" y="36" width="5" height="12" rx="1.5" fill="url(#l${id})" ${st()}/>${gem(id, 32, 51, 3)}</g>`;
      return one(-32) + one(32);
    },
    sichel: (id, c, g) => {
      const one = (rot, fl) => `<g transform="rotate(${rot} 32 34) ${fl ? "translate(64 0) scale(-1 1)" : ""}"><path d="M30 34 C30 22 34 10 46 6 C40 12 36 22 36 34 Z" fill="url(#m${id})" ${st()}/><rect x="28.5" y="34" width="6" height="16" rx="2" fill="url(#l${id})" ${st()}/><path d="M26 34 L38 34" stroke="url(#g${id})" stroke-width="3.5" stroke-linecap="round"/>${gem(id, 31.5, 53, 2.6)}</g>`;
      return one(-20) + one(20, true);
    },
    kurzschwert: (id, c, g) => {
      const one = (rot) => `<g transform="rotate(${rot} 32 36)"><path d="M32 4 C37 12 37 22 35 34 L29 34 C27 22 27 12 32 4 Z" fill="url(#m${id})" ${st()}/><path d="M32 10 L32 32" stroke="#5a6470" stroke-width="1.2"/><path d="M22 34 C26 32 38 32 42 34 C38 37 26 37 22 34 Z" fill="url(#d${id})" ${st()}/><rect x="29.5" y="36" width="5" height="12" rx="1.5" fill="url(#l${id})" ${st()}/>${gem(id, 32, 51, 2.8)}</g>`;
      return one(-30) + one(30);
    },
    bogen: (id, c, g, s) =>
      `<path d="M18 4 C30 6 34 14 30 20 C44 26 44 38 30 44 C34 50 30 58 18 60" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="M18 4 C30 6 34 14 30 20 C44 26 44 38 30 44 C34 50 30 58 18 60" fill="none" stroke="url(#w${id})" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M18 4 L18 60" stroke="#efe6d2" stroke-width="1.2"/><rect x="34" y="28" width="6" height="8" rx="1.5" fill="url(#l${id})" ${st(1.2)}/>` +
      `<path d="M8 32 L56 32" stroke="${O}" stroke-width="2.2"/><path d="M56 32 L48 28 L49 36 Z" fill="url(#m${id})" ${st(1.2)}/><path d="M8 32 L13 27 L16 32 L13 37 Z" fill="${g || "#b8322e"}" ${st(1)}/>` +
      (s === 2 ? `<path d="M30 10 C34 12 36 14 36 16 M30 54 C34 52 36 50 36 48" stroke="url(#g${id})" stroke-width="2.4" fill="none"/>` : "") +
      (g ? gem(id, 37, 32, 2.6) : ""),
    armbrust: (id, c, g) =>
      `<path d="M8 24 C22 10 42 10 56 24" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="M8 24 C22 10 42 10 56 24" fill="none" stroke="url(#d${id})" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M8 24 L56 24" stroke="#efe6d2" stroke-width="1.2"/><path d="M28 12 L36 12 L37 56 C37 59 27 59 27 56 Z" fill="url(#w${id})" ${st()}/><path d="M29 40 L35 40 M29 46 L35 46" stroke="url(#g${id})" stroke-width="2"/>` +
      `<path d="M32 4 L32 22" stroke="${O}" stroke-width="2.4"/><path d="M32 2 L28 9 L36 9 Z" fill="url(#m${id})" ${st(1.2)}/>` +
      gem(id, 32, 30, 3),
    speer: (id, c, g) =>
      `<path d="M10 58 L46 14" stroke="${O}" stroke-width="6" stroke-linecap="round"/><path d="M10 58 L46 14" stroke="url(#w${id})" stroke-width="3.4" stroke-linecap="round"/>` +
      `<path d="M44 16 C46 8 52 4 60 3 C59 11 55 17 48 20 Z" fill="url(#m${id})" ${st()}/><path d="M57 6 L47 17" stroke="#5a6470" stroke-width="1.2"/>` +
      `<path d="M41 22 L47 26" stroke="url(#g${id})" stroke-width="4" stroke-linecap="round"/><path d="M38 22 C32 22 30 28 34 30 M40 26 C36 30 38 34 42 32" stroke="${g || "#b8322e"}" stroke-width="2.4" fill="none"/>` +
      (g ? rune(53, 10, 0, "#fff") : ""),
    stab: (id, c, g, s) => {
      const gc = g || "#7fe3ff";
      return (
        `<circle cx="46" cy="14" r="13" fill="url(#h${id})"/>` +
        `<path d="M14 60 C18 50 22 46 24 40 C27 32 32 30 36 24" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="M14 60 C18 50 22 46 24 40 C27 32 32 30 36 24" fill="none" stroke="url(#w${id})" stroke-width="4" stroke-linecap="round"/>` +
        `<path d="M36 24 C34 16 38 10 42 8 M36 24 C42 24 48 22 50 16 M36 24 C40 18 46 18 48 22" fill="none" stroke="url(#w${id})" stroke-width="2.6"/>` +
        `<path d="M46 3 L53 13 L46 24 L39 13 Z" fill="url(#j${id})" ${st()}/><path d="M46 6 L49 13 L46 13 Z" fill="#fff" opacity=".7"/>` +
        (s === 2 ? `<path d="M24 40 C20 36 16 36 14 38 C16 42 20 42 24 40 Z" fill="#4f8a3a" ${st(1)}/>` : "") +
        rune(26, 46, 0, gc)
      );
    },
    zepter: (id, c, g) =>
      `<circle cx="42" cy="20" r="14" fill="url(#h${id})"/>` +
      `<path d="M16 60 L36 28" stroke="${O}" stroke-width="6.5" stroke-linecap="round"/><path d="M16 60 L36 28" stroke="url(#g${id})" stroke-width="3.6" stroke-linecap="round"/>` +
      `<path d="M30 28 C24 22 22 14 26 8 C28 16 32 20 36 22 Z M48 32 C54 30 60 26 60 18 C54 22 48 24 44 26 Z" fill="url(#g${id})" ${st()}/>` +
      `<circle cx="40" cy="22" r="9" fill="url(#j${id})" ${st()}/><circle cx="37" cy="19" r="2.6" fill="#fff" opacity=".8"/>` +
      `<path d="M20 52 L24 54 M23 47 L27 49" stroke="${O}" stroke-width="1.4"/>`,
    runenstab: (id, c, g) => {
      const gc = g || "#9fd8ff";
      return (
        `<circle cx="44" cy="12" r="12" fill="url(#h${id})"/>` +
        `<path d="M14 60 L40 16" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="M14 60 L40 16" stroke="url(#b${id})" stroke-width="4" stroke-linecap="round"/>` +
        `<path d="M40 16 C38 8 34 6 30 6 M40 16 C46 12 50 6 50 2 M40 16 C46 16 52 14 56 10" fill="none" stroke="url(#b${id})" stroke-width="2.6" stroke-linecap="round"/>` +
        `<path d="M44 8 L50 14 L44 20 L38 14 Z" fill="url(#j${id})" ${st()}/>` +
        `<path d="M22 46 L26 49 M26 40 L30 43 M30 34 L34 37" stroke="#3a281c" stroke-width="2.4"/>` +
        rune(20, 52, 1, gc) + rune(28, 38, 2, gc) +
        `<path d="M34 26 L32 34 L30 30" stroke="#3a281c" stroke-width="1" fill="none"/><path d="M30 30 L28 36 L32 36 Z" fill="url(#b${id})" ${st(1)}/>`
      );
    },
    schild: (id, c, g, s) => {
      const face = c || "#8d2a2a";
      if (s === 1)
        return `<path d="M32 3 C42 6 52 6 56 6 C56 34 48 50 32 61 C16 50 8 34 8 6 C12 6 22 6 32 3 Z" fill="url(#t${id})" ${st(2)}/><path d="M32 3 C42 6 52 6 56 6 C56 34 48 50 32 61 C16 50 8 34 8 6 C12 6 22 6 32 3 Z" fill="none" stroke="url(#g${id})" stroke-width="3.2"/><path d="M32 10 L32 54 M14 24 L50 24" stroke="url(#g${id})" stroke-width="4.5"/>${gem(id, 32, 24, 4.5)}`;
      if (s === 2)
        return `<path d="M32 3 C46 14 56 26 52 42 C48 54 38 60 32 62 C26 60 16 54 12 42 C8 26 18 14 32 3 Z" fill="url(#t${id})" ${st(2)}/><path d="M32 8 C30 24 30 44 32 58 M32 22 C26 18 20 18 16 22 M32 30 C38 26 44 26 48 30 M32 40 C26 36 20 38 18 42" stroke="url(#g${id})" stroke-width="2.6" fill="none"/>${gem(id, 32, 32, 4)}`;
      return `<circle cx="32" cy="32" r="27" fill="url(#t${id})" ${st(2)}/><circle cx="32" cy="32" r="25" fill="none" stroke="url(#m${id})" stroke-width="4"/>` +
        [0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (i / 8) * Math.PI * 2; return `<circle cx="${32 + Math.cos(a) * 21}" cy="${32 + Math.sin(a) * 21}" r="1.8" fill="url(#m${id})" ${st(0.8)}/>`; }).join("") +
        `<path d="M32 14 L32 50 M14 32 L50 32 M19 19 L45 45 M45 19 L19 45" stroke="${shade(face, 0.6)}" stroke-width="1.6" opacity=".7"/><circle cx="32" cy="32" r="8" fill="url(#m${id})" ${st()}/>${gem(id, 32, 32, 3.6)}`;
    },
    wurfmesser: (id, c, g) =>
      `<path d="M8 50 C20 40 40 30 58 26" stroke="${O}" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M8 50 C20 40 40 30 58 26" stroke="url(#l${id})" stroke-width="4.5" stroke-linecap="round" fill="none"/>` +
      [0, 1, 2, 3].map((i) => {
        const x = 14 + i * 11;
        const y = 44 - i * 5;
        return `<path d="M${x} ${y} L${x + 3} ${y - 20} L${x + 6} ${y} Z" fill="url(#m${id})" ${st(1.2)}/><rect x="${x + 0.5}" y="${y}" width="5" height="6" rx="1" fill="url(#l${id})" ${st(1)}/>`;
      }).join("") +
      (g ? gem(id, 52, 30, 3) : `<circle cx="52" cy="30" r="2.6" fill="url(#g${id})" ${st(1)}/>`),
    koecher: (id, c, g) =>
      `<path d="M22 22 L26 4 M30 22 L32 2 M38 22 L40 4" stroke="${O}" stroke-width="2.2"/>` +
      `<path d="M24 4 L26 -1 L30 6 Z M30 2 L32 -3 L35 4 Z M38 4 L40 -1 L43 6 Z" fill="${g || "#e8e2d6"}" ${st(1)}/>` +
      `<path d="M16 20 L48 20 L44 58 C38 62 26 62 20 58 Z" fill="url(#t${id})" ${st()}/><path d="M15 20 C20 17 44 17 49 20 L48 25 C42 22 22 22 16 25 Z" fill="url(#g${id})" ${st(1.2)}/>` +
      `<path d="M18 36 L46 36 M19 48 L45 48" stroke="url(#g${id})" stroke-width="2.4"/><path d="M26 28 L38 28 L32 34 Z" fill="${shade(c, 0.6)}"/>`,
    fokus: (id, c, g, s) => {
      const gc = g || c || "#5fd0d6";
      if (s === 2)
        return `<circle cx="32" cy="30" r="24" fill="url(#h${id})"/><path d="M10 44 L32 50 L54 44 L54 18 L32 24 L10 18 Z" fill="url(#l${id})" ${st()}/><path d="M13 20 L32 25 L51 20 L51 42 L32 47 L13 42 Z" fill="#efe6d2" ${st(1)}/><path d="M32 25 L32 47" stroke="${O}" stroke-width="1.4"/>${rune(22, 34, 0, gc)}${rune(42, 34, 2, gc)}<circle cx="32" cy="12" r="4" fill="url(#j${id})" ${st(1)}/>`;
      return `<circle cx="32" cy="32" r="26" fill="url(#h${id})"/><ellipse cx="32" cy="38" rx="25" ry="8" fill="none" stroke="${gc}" stroke-width="2.4" opacity=".8"/><path d="M32 4 L46 30 L32 58 L18 30 Z" fill="url(#j${id})" ${st()}/><path d="M32 4 L32 58 M18 30 L46 30" stroke="${O}" stroke-width="1" opacity=".5"/><path d="M32 8 L40 28 L32 28 Z" fill="#fff" opacity=".55"/>`;
    },
    helm: (id, c, g, s) =>
      `<path d="M12 40 C10 18 22 8 32 8 C42 8 54 18 52 40 L50 54 L40 56 L40 42 L24 42 L24 56 L14 54 Z" fill="url(#m${id})" ${st()}/>` +
      `<path d="M30 10 L34 10 L34 46 L30 46 Z" fill="url(#g${id})" ${st(1.2)}/><path d="M14 30 C22 27 42 27 50 30" stroke="url(#g${id})" stroke-width="3" fill="none"/>` +
      `<path d="M20 36 L28 36 M36 36 L44 36" stroke="${O}" stroke-width="3"/>` +
      (s === 1
        ? `<path d="M32 9 C28 0 40 -2 50 4 C42 4 38 8 36 12 Z" fill="${g || "#b8322e"}" ${st(1.2)}/>`
        : s === 2
          ? `<path d="M14 24 C4 22 2 12 6 4 C10 12 14 16 20 18 Z M50 24 C60 22 62 12 58 4 C54 12 50 16 44 18 Z" fill="url(#b${id})" ${st(1.2)}/>`
          : "") +
      (g ? gem(id, 32, 20, 3.2) : ""),
    maske: (id, c, g) =>
      `<path d="M8 58 C6 30 16 6 32 6 C48 6 58 30 56 58 C48 52 16 52 8 58 Z" fill="url(#t${id})" ${st()}/>` +
      `<path d="M18 52 C18 34 24 22 32 22 C40 22 46 34 46 52 Z" fill="#0c0a10"/>` +
      `<path d="M18 40 C24 36 40 36 46 40 L46 52 L18 52 Z" fill="${shade(c, 0.6)}" ${st(1)}/>` +
      `<path d="M23 33 L29 35 M35 35 L41 33" stroke="${g || "#ffcf5a"}" stroke-width="2.6" stroke-linecap="round"/>` +
      `<path d="M18 46 L46 46" stroke="${shade(c, 0.4)}" stroke-width="1.2"/>`,
    kappe: (id, c, g, s) =>
      s === 2
        ? `<path d="M10 58 C6 34 14 14 32 12 C50 14 58 34 54 58 Z" fill="url(#t${id})" ${st()}/><path d="M18 18 L14 4 L26 12 Z M46 18 L50 4 L38 12 Z" fill="url(#t${id})" ${st()}/><path d="M24 26 C28 22 36 22 40 26 L36 34 L28 34 Z" fill="${shade(c, 1.3)}" ${st(1)}/><circle cx="26" cy="22" r="2" fill="${g || "#ffcf5a"}"/><circle cx="38" cy="22" r="2" fill="${g || "#ffcf5a"}"/><path d="M20 52 C20 40 26 34 32 34 C38 34 44 40 44 52 Z" fill="#120e14"/>`
        : `<path d="M10 58 C8 32 18 8 34 6 C50 8 58 32 54 58 Z" fill="url(#t${id})" ${st()}/><path d="M20 54 C20 36 26 26 32 26 C40 26 46 36 44 54 Z" fill="#120e14"/><path d="M34 6 C40 2 48 4 50 10" stroke="${O}" stroke-width="1.6" fill="none"/>` +
          (s === 1 ? `<path d="M46 16 C52 6 58 6 62 8 C56 10 52 14 50 20 Z" fill="${g || "#e8e2d6"}" ${st(1.2)}/>` : "") +
          `<circle cx="27" cy="40" r="2" fill="${g || "#ffe45a"}"/><circle cx="37" cy="40" r="2" fill="${g || "#ffe45a"}"/>`,
    hut: (id, c, g, s) => {
      const gc = g || "#ffe27a";
      if (s === 1)
        return `<path d="M10 46 L14 22 L22 32 L26 14 L32 28 L38 14 L42 32 L50 22 L54 46 Z" fill="url(#g${id})" ${st()}/><path d="M10 46 C20 52 44 52 54 46 L54 52 C44 58 20 58 10 52 Z" fill="url(#g${id})" ${st()}/>${gem(id, 32, 42, 5)}<circle cx="18" cy="46" r="2.4" fill="${gc}" ${st(1)}/><circle cx="46" cy="46" r="2.4" fill="${gc}" ${st(1)}/>`;
      if (s === 2)
        return `<ellipse cx="32" cy="52" rx="28" ry="7" fill="url(#t${id})" ${st()}/><path d="M18 50 L26 22 C28 12 36 6 46 6 C40 12 40 18 42 24 L46 50 Z" fill="url(#t${id})" ${st()}/><path d="M19 44 C28 48 38 48 46 44" stroke="url(#g${id})" stroke-width="3.6" fill="none"/><path d="M36 28 L38 33 L43 33 L39 36 L41 41 L36 38 L31 41 L33 36 L29 33 L34 33 Z" fill="${gc}" stroke="${O}" stroke-width="1"/>`;
      return `<path d="M8 58 C6 30 16 6 32 6 C48 6 58 30 56 58 C48 52 16 52 8 58 Z" fill="url(#t${id})" ${st()}/><path d="M18 54 C18 36 24 26 32 26 C40 26 46 36 46 54 Z" fill="#100c14"/><path d="M16 30 C24 24 40 24 48 30" stroke="url(#g${id})" stroke-width="2.6" fill="none"/>${gem(id, 32, 24, 3)}<circle cx="27" cy="40" r="1.8" fill="${gc}"/><circle cx="37" cy="40" r="1.8" fill="${gc}"/>`;
    },
    harnisch: (id, c, g, s) =>
      `<path d="M8 14 C14 6 22 6 24 8 C28 14 36 14 40 8 C42 6 50 6 56 14 L54 28 L48 30 L48 56 C40 60 24 60 16 56 L16 30 L10 28 Z" fill="url(#t${id})" ${st()}/>` +
      `<path d="M8 14 C12 10 18 10 22 14 L18 26 L10 28 Z M56 14 C52 10 46 10 42 14 L46 26 L54 28 Z" fill="url(#m${id})" ${st(1.2)}/>` +
      `<path d="M32 14 L32 56" stroke="${shade(c, 0.5)}" stroke-width="1.6"/><path d="M18 40 C26 44 38 44 46 40 M18 48 C26 52 38 52 46 48" stroke="${shade(c, 0.5)}" stroke-width="1.6" fill="none"/>` +
      `<path d="M24 18 C28 22 36 22 40 18 L38 30 L26 30 Z" fill="url(#g${id})" ${st(1.2)}/>` +
      (s === 2 ? `<path d="M14 10 L12 2 L18 8 M50 10 L52 2 L46 8" stroke="${O}" stroke-width="1.4" fill="url(#m${id})"/>` : "") +
      gem(id, 32, 25, 3.2),
    schattenwams: (id, c, g) =>
      `<path d="M14 12 L26 6 L32 14 L38 6 L50 12 L54 56 C44 60 20 60 10 56 Z" fill="url(#t${id})" ${st()}/>` +
      `<path d="M16 14 L46 50 M48 14 L18 50" stroke="#1a1418" stroke-width="3.4"/><circle cx="32" cy="32" r="3.4" fill="url(#m${id})" ${st(1)}/>` +
      `<path d="M10 46 C22 42 42 42 54 46 L54 52 C42 48 22 48 10 52 Z" fill="${g ? shade(g, 0.6) : "#5a1414"}" ${st(1)}/>` +
      `<path d="M50 12 C56 16 58 22 56 28 L50 24 Z" fill="url(#d${id})" ${st(1)}/>`,
    wams: (id, c, g) =>
      `<path d="M14 14 L26 8 L32 16 L38 8 L50 14 L52 56 C42 60 22 60 12 56 Z" fill="url(#t${id})" ${st()}/>` +
      `<path d="M14 14 C20 8 26 8 26 8 L32 16 L38 8 C38 8 44 8 50 14 C46 20 40 18 32 20 C24 18 18 20 14 14 Z" fill="#cfc4a8" ${st(1.2)}/>` +
      `<path d="M32 20 L32 56" stroke="${O}" stroke-width="1.4"/><path d="M28 26 L36 30 M28 34 L36 38 M28 42 L36 46" stroke="#e8dcc0" stroke-width="1.6"/>` +
      `<rect x="12" y="44" width="40" height="5" fill="url(#l${id})" ${st(1)}/><rect x="29" y="43" width="6" height="7" fill="url(#g${id})" ${st(1)}/>`,
    robe: (id, c, g) =>
      `<path d="M22 6 L42 6 L46 22 L58 60 C40 62 24 62 6 60 L18 22 Z" fill="url(#t${id})" ${st()}/>` +
      `<path d="M22 6 L32 20 L42 6" fill="none" stroke="url(#g${id})" stroke-width="3"/><rect x="17" y="26" width="30" height="5" fill="url(#g${id})" ${st(1.2)}/>` +
      `<path d="M32 31 L32 60" stroke="${g || shade(c, 0.6)}" stroke-width="3.2"/><path d="M8 58 C24 56 40 56 56 58" stroke="url(#g${id})" stroke-width="2.4" fill="none"/>` +
      rune(24, 44, 0, g || "#e8c35a") + rune(40, 44, 2, g || "#e8c35a"),
    handschuhe: (id, c, g) =>
      `<path d="M18 58 L18 40 L12 28 C10 24 16 22 18 26 L20 30 L20 14 C20 10 26 10 26 14 L26 26 L28 10 C28 6 34 6 34 10 L34 26 L36 14 C36 10 42 10 42 14 L42 30 L44 22 C44 18 50 18 50 22 L48 42 L42 58 Z" fill="url(#t${id})" ${st()}/>` +
      `<rect x="16" y="48" width="28" height="11" rx="2" fill="url(#m${id})" ${st(1.2)}/><path d="M22 52 L38 52" stroke="url(#g${id})" stroke-width="2"/>` +
      (g ? gem(id, 30, 54, 2.6) : ""),
    stiefel: (id, c, g) =>
      `<path d="M18 6 L40 6 L40 36 C48 38 58 42 58 52 L58 58 L12 58 L14 40 Z" fill="url(#t${id})" ${st()}/>` +
      `<path d="M16 6 C20 2 38 2 42 6 L42 14 L16 14 Z" fill="${g ? shade(g, 0.5) : "#cfc4a8"}" ${st(1.2)}/>` +
      `<path d="M12 52 L58 52" stroke="${O}" stroke-width="2"/><path d="M20 24 L36 24 M20 30 L36 30" stroke="url(#g${id})" stroke-width="2"/>`,
    umhang: (id, c, g, s) =>
      `<path d="M20 8 L44 8 C46 24 54 44 58 58 C52 56 50 60 44 56 C38 60 34 56 28 60 C22 56 18 60 12 56 C10 58 8 58 6 58 C10 44 18 24 20 8 Z" fill="url(#t${id})" ${st()}/>` +
      `<path d="M28 14 C26 30 22 44 18 56 M36 14 C38 30 42 44 46 56" stroke="${shade(c, 0.55)}" stroke-width="2" fill="none"/>` +
      (s === 1 ? `<path d="M16 10 C22 4 42 4 48 10 C42 14 22 14 16 10 Z" fill="#cfc4a8" ${st(1.2)}/>` : "") +
      `<circle cx="22" cy="10" r="4" fill="url(#g${id})" ${st(1.2)}/><circle cx="42" cy="10" r="4" fill="url(#g${id})" ${st(1.2)}/>`,
    amulett: (id, c, g) =>
      `<path d="M14 4 C14 24 24 32 32 34" fill="none" stroke="${O}" stroke-width="4.5"/><path d="M50 4 C50 24 40 32 32 34" fill="none" stroke="${O}" stroke-width="4.5"/><path d="M14 4 C14 24 24 32 32 34 C40 32 50 24 50 4" fill="none" stroke="url(#g${id})" stroke-width="2.2" stroke-dasharray="3 1.5"/>` +
      `<circle cx="32" cy="46" r="15" fill="url(#h${id})"/><path d="M32 30 C40 34 46 40 44 48 C42 56 36 60 32 62 C28 60 22 56 20 48 C18 40 24 34 32 30 Z" fill="url(#g${id})" ${st()}/>` +
      gem(id, 32, 46, 6.5),
    ring: (id, c, g) =>
      `<circle cx="32" cy="22" r="14" fill="url(#h${id})"/><ellipse cx="32" cy="42" rx="18" ry="15" fill="none" stroke="${O}" stroke-width="9"/><ellipse cx="32" cy="42" rx="18" ry="15" fill="none" stroke="url(#g${id})" stroke-width="5.5"/>` +
      `<path d="M22 26 L26 18 L38 18 L42 26 L32 32 Z" fill="url(#g${id})" ${st(1.2)}/>` +
      gem(id, 32, 20, 7),
    talisman: (id, c, g) =>
      `<path d="M32 2 L32 10" stroke="${O}" stroke-width="2.2"/><circle cx="32" cy="36" r="24" fill="url(#h${id})"/>` +
      `<path d="M32 10 C46 12 54 22 54 34 C54 48 44 58 32 60 C20 58 10 48 10 34 C10 22 18 12 32 10 Z" fill="url(#b${id})" ${st()}/>` +
      `<path d="M32 18 C40 20 46 28 44 36 C42 44 36 48 32 50 C28 48 22 44 20 36 C18 28 24 20 32 18 Z" fill="none" stroke="${shade(c, 0.6)}" stroke-width="1.6"/>` +
      rune(32, 34, 0, g || "#7fe3ff") + rune(24, 30, 2, g || "#7fe3ff") + rune(40, 30, 1, g || "#7fe3ff"),
    trank: (id, c) =>
      `<rect x="26" y="3" width="12" height="8" rx="2" fill="url(#l${id})" ${st()}/><path d="M27 11 L37 11 L37 20 C48 24 54 32 54 42 C54 54 44 61 32 61 C20 61 10 54 10 42 C10 32 16 24 27 20 Z" fill="#dfeef7" fill-opacity=".85" ${st()}/>` +
      `<path d="M12 42 C20 37 44 37 52 42 C52 53 43 59 32 59 C21 59 12 53 12 42 Z" fill="url(#t${id})"/><circle cx="24" cy="48" r="3" fill="#fff" opacity=".6"/><circle cx="36" cy="46" r="2" fill="#fff" opacity=".6"/><path d="M18 28 C16 32 15 36 16 40" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/>`,
  };

  const RAR_GLOW = { gewoehnlich: null, ungewoehnlich: "#74d86f", selten: "#4fa9ff", episch: "#c47bff", legendaer: "#ffb13b" };

  I.item = function (item) {
    if (!item) return "";
    const id = "i" + uid++;
    const fn = ITEM[item.base] || ITEM.talisman;
    const rar = RAR_GLOW[item.rarity];
    const glowC = item.rarity === "ungewoehnlich" ? null : rar;
    const c = item.tint || "#9aa4ad";
    let body = defs(id, c, rar || "#9fd8ff");
    if (glowC) body += `<circle cx="32" cy="32" r="31" fill="url(#h${id})" opacity="${item.rarity === "selten" ? 0.5 : 0.8}"/>`;
    if (item.rarity === "legendaer")
      body += `<g opacity=".55">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<path d="M32 32 L${32 + Math.cos((i / 8) * Math.PI * 2) * 32} ${32 + Math.sin((i / 8) * Math.PI * 2) * 32}" stroke="${rar}" stroke-width="2.4"/>`).join("")}</g>`;
    body += fn(id, c, glowC, item.style || 0);
    if (item.rarity === "episch" || item.rarity === "legendaer") body += `<path d="M55 3 L57 8 L62 10 L57 12 L55 17 L53 12 L48 10 L53 8 Z" fill="${rar}" stroke="${O}" stroke-width=".8"/>`;
    return svg(body);
  };
  I.potion = (color) => {
    const id = "p" + uid++;
    return svg(defs(id, color || "#e0644f", color || "#e0644f") + ITEM.trank(id, color || "#e0644f"));
  };

  /* ---------- Oberflaechen-Symbole (24er Raster) ---------- */
  const s2 = 'stroke="' + O + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"';
  const UI = {
    gold: `<circle cx="12" cy="12" r="9" fill="#e8b84a" ${s2}/><circle cx="12" cy="12" r="6" fill="none" stroke="#a8781a" stroke-width="1.4"/><path d="M12 7.5 L13 10.5 L16 11 L13.6 13 L14.4 16 L12 14.3 L9.6 16 L10.4 13 L8 11 L11 10.5 Z" fill="#fff0b8" opacity=".85"/>`,
    perle: `<circle cx="12" cy="13" r="8" fill="#dfe8ff" ${s2}/><circle cx="9.5" cy="10.5" r="2.6" fill="#ffffff"/><path d="M6 17 C9 20 15 20 18 17" stroke="#9fb0f0" stroke-width="1.6" fill="none"/><path d="M17 3 L18 5.5 L20.5 6.5 L18 7.5 L17 10 L16 7.5 L13.5 6.5 L16 5.5 Z" fill="#9fe3ff" stroke="${O}" stroke-width="0.8"/>`,
    tatendrang: `<path d="M13.5 2 L5 13.5 L11 13.5 L9.5 22 L19 9.5 L13 9.5 Z" fill="#ffb13b" ${s2}/>`,
    xp: `<path d="M12 2.5 L14.8 8.6 L21.5 9.3 L16.4 13.8 L17.9 20.4 L12 17 L6.1 20.4 L7.6 13.8 L2.5 9.3 L9.2 8.6 Z" fill="#9fe3ff" ${s2}/>`,
    kraft: `<path d="M6 11 C6 7 9 6 11 7 L11 5 C11 3 15 3 15 5 L15 7 C17 6 19 7 19 9 L19 15 C19 19 16 21 12 21 C8 21 6 18 6 15 Z" fill="#d0503a" ${s2}/><path d="M11 7 L11 12 M15 7 L15 12" stroke="${O}" stroke-width="1.4"/>`,
    geschick: `<path d="M20 3 C10 4 5 11 4 21 C8 14 12 11 16 10 C13 13 10 16 8 20 C15 17 19 11 20 3 Z" fill="#6ac46a" ${s2}/>`,
    verstand: `<path d="M2.5 12 C6 6 18 6 21.5 12 C18 18 6 18 2.5 12 Z" fill="#e9e0ff" ${s2}/><circle cx="12" cy="12" r="4" fill="#8f7cff" ${s2}/><circle cx="13.3" cy="10.7" r="1.2" fill="#fff"/>`,
    konstitution: `<path d="M12 20.5 C4 15 2.5 11 3.5 7.5 C4.8 3.5 10 3.5 12 7.2 C14 3.5 19.2 3.5 20.5 7.5 C21.5 11 20 15 12 20.5 Z" fill="#e05a7a" ${s2}/>`,
    glueck: `<circle cx="8.5" cy="8.5" r="4.2" fill="#4faf6a" ${s2}/><circle cx="15.5" cy="8.5" r="4.2" fill="#4faf6a" ${s2}/><circle cx="8.5" cy="15" r="4.2" fill="#4faf6a" ${s2}/><circle cx="15.5" cy="15" r="4.2" fill="#4faf6a" ${s2}/><path d="M12 12 L15 22" stroke="${O}" stroke-width="1.8"/>`,
    ruestung: `<path d="M12 2.5 L20 5.5 C20 13 17 18 12 21.5 C7 18 4 13 4 5.5 Z" fill="#9aa4ad" ${s2}/><path d="M12 6 L12 18" stroke="${O}" stroke-width="1.2"/>`,
    schaden: `<path d="M4 4 L6.5 4 L17 14.5 L14.5 17 L4 6.5 Z M20 4 L17.5 4 L7 14.5 L9.5 17 L20 6.5 Z" fill="#c8ced6" ${s2}/><path d="M13 18 L18 13 M11 18 L6 13" stroke="${O}" stroke-width="2.6"/><circle cx="19.5" cy="19.5" r="2" fill="#d9a441" ${s2}/><circle cx="4.5" cy="19.5" r="2" fill="#d9a441" ${s2}/>`,
    ehre: `<path d="M7 3 L17 3 L17 9 C17 13 14.5 15 12 15 C9.5 15 7 13 7 9 Z" fill="#e8b84a" ${s2}/><path d="M7 5 C3 5 3 10 7.5 11 M17 5 C21 5 21 10 16.5 11" fill="none" stroke="${O}" stroke-width="1.5"/><path d="M10 15 L14 15 L14.5 18 L9.5 18 Z" fill="#a8781a" ${s2}/><rect x="7" y="18" width="10" height="3.5" rx="1" fill="#6a4628" ${s2}/>`,
    uhr: `<path d="M6 3 L18 3 L18 5 C18 9 14 11 12 12 C14 13 18 15 18 19 L18 21 L6 21 L6 19 C6 15 10 13 12 12 C10 11 6 9 6 5 Z" fill="#e9f6ff" ${s2}/><path d="M8.5 19.5 C9 17 11 16 12 15.5 C13 16 15 17 15.5 19.5 Z" fill="#e8b84a"/>`,
    held: `<path d="M5 13 C5 6 19 6 19 13 L19 19 L5 19 Z" fill="#9aa4ad" ${s2}/><path d="M7.5 12.5 L16.5 12.5" stroke="${O}" stroke-width="2"/><path d="M12 11 L12 19" stroke="${O}" stroke-width="1.4"/><path d="M5 9 C2 6 2 3 3 1 C5 4 6 6 7 7 M19 9 C22 6 22 3 21 1 C19 4 18 6 17 7" fill="#e8dcc0" ${s2}/>`,
    taverne: `<path d="M5 6 L16 6 L15 21 L6 21 Z" fill="#d9a441" ${s2}/><path d="M5 6 C5 3 16 3 16 6" fill="#f4ecd8" ${s2}/><path d="M16 9 C21 9 21 16 15.5 16" fill="none" stroke="${O}" stroke-width="2.2"/>`,
    steinkreis: `<path d="M3 21 L4 9 L7 8 L8 21 Z M10 21 L10.5 5 L13.5 5 L14 21 Z M16 21 L17 8 L20 9 L21 21 Z" fill="#8a8680" ${s2}/><path d="M3 7 L21 7" stroke="${O}" stroke-width="2.2"/><circle cx="12" cy="13" r="1.6" fill="#9fd8ff"/>`,
    schmiede: `<path d="M3 8 L18 8 C18 11 15 12 13 12 L13 15 L17 19 L5 19 L9 15 L9 12 C6 12 4 10 3 8 Z" fill="#7f8a96" ${s2}/><path d="M18 3 L21 6" stroke="${O}" stroke-width="2.2"/>`,
    arkanum: `<path d="M9 3 L15 3 L15 8 C19 10 20 13 20 15 C20 19 16 21.5 12 21.5 C8 21.5 4 19 4 15 C4 13 5 10 9 8 Z" fill="#9a6ae0" ${s2}/><circle cx="10" cy="15" r="1.6" fill="#fff" opacity="0.8"/><circle cx="14" cy="17" r="1" fill="#fff" opacity="0.8"/>`,
    arena: `<path d="M4 4 L6.5 4 L17 14.5 L14.5 17 L4 6.5 Z M20 4 L17.5 4 L7 14.5 L9.5 17 L20 6.5 Z" fill="#d9a441" ${s2}/><path d="M13 18 L18 13 M11 18 L6 13" stroke="${O}" stroke-width="2.6"/>`,
    leuchtturm: `<path d="M8 21 L9.5 8 L14.5 8 L16 21 Z" fill="#8a8680" ${s2}/><path d="M6 8 L18 8 L18 6 L6 6 Z" fill="#6a4628" ${s2}/><path d="M9 6 C9 3 11 2 12 0.5 C13 2 15 3 15 6 Z" fill="#ff9a3d" ${s2}/>`,
    tiefen: `<path d="M4 21 L4 10 C4 4 20 4 20 10 L20 21 Z" fill="#4a4558" ${s2}/><ellipse cx="12" cy="14" rx="5" ry="6" fill="#9a6ae0" ${s2}/><path d="M12 10 C14.5 11 14.5 14 12 15 C10 15.5 10 13 12 13" fill="none" stroke="#fff" stroke-width="1.2"/>`,
    stall: `<path d="M4 14 C4 9 8 6 12 6 L16 3 L17 7 C19 8 20 10 20 13 L18 14 L17 21 L14 21 L14 16 L9 16 L9 21 L6 21 L6 15 Z" fill="#c9a86a" ${s2}/><path d="M10 9 C6 6 3 7 2 10 C5 9 8 10 10 12" fill="#f4ecd8" ${s2}/>`,
    ruhm: `<path d="M7 3 L17 3 L17 9 C17 13 14.5 15 12 15 C9.5 15 7 13 7 9 Z" fill="#e8b84a" ${s2}/><path d="M7 5 C3 5 3 10 7.5 11 M17 5 C21 5 21 10 16.5 11" fill="none" stroke="${O}" stroke-width="1.5"/><rect x="7" y="18" width="10" height="3.5" rx="1" fill="#6a4628" ${s2}/><path d="M11 15 L13 15 L13 18 L11 18 Z" fill="#a8781a" ${s2}/>`,
    gilde: `<path d="M5 3 L19 3 L19 15 L12 21 L5 15 Z" fill="#6a2a2a" ${s2}/><path d="M12 6 L14 10 L18 10.5 L15 13 L16 17 L12 15 L8 17 L9 13 L6 10.5 L10 10 Z" fill="#e8b84a" stroke="${O}" stroke-width="0.8"/>`,
    heim: `<path d="M3 11 L12 3 L21 11 L19 11 L19 21 L5 21 L5 11 Z" fill="#8a6a4a" ${s2}/><path d="M10 21 L10 15 L14 15 L14 21" fill="#3a2a1e" ${s2}/><rect x="15" y="12" width="3" height="3" fill="#ffb050" stroke="${O}" stroke-width="0.8"/>`,
    brunnen: `<path d="M4 12 L20 12 L19 20 L5 20 Z" fill="#8a8680" ${s2}/><path d="M5.5 15 L18.5 15" stroke="#4fa9ff" stroke-width="2"/><path d="M3 8 L12 3 L21 8 Z" fill="#3a4250" ${s2}/><path d="M6 8 L6 12 M18 8 L18 12" stroke="${O}" stroke-width="1.5"/>`,
    einstellungen: `<path d="M12 2.5 L14 5 L17.2 4.2 L17.6 7.4 L20.6 8.8 L19.3 11.8 L21 14.6 L18 16 L17.6 19.4 L14.4 18.9 L12 21.5 L9.6 18.9 L6.4 19.4 L6 16 L3 14.6 L4.7 11.8 L3.4 8.8 L6.4 7.4 L6.8 4.2 L10 5 Z" fill="#a9b3be" ${s2}/><circle cx="12" cy="12" r="3.5" fill="#3a4a5a" ${s2}/>`,
    ton: `<path d="M3 9 L7 9 L12 4.5 L12 19.5 L7 15 L3 15 Z" fill="#e9f6ff" ${s2}/><path d="M15 8.5 C17 10 17 14 15 15.5 M17.5 6 C21 9 21 15 17.5 18" fill="none" stroke="${O}" stroke-width="1.5"/>`,
    stumm: `<path d="M3 9 L7 9 L12 4.5 L12 19.5 L7 15 L3 15 Z" fill="#e9f6ff" ${s2}/><path d="M15 9 L21 15 M21 9 L15 15" stroke="${O}" stroke-width="1.8"/>`,
    musik: `<path d="M9 18 L9 5 L19 3 L19 16" fill="none" stroke="${O}" stroke-width="2"/><ellipse cx="7" cy="18" rx="2.8" ry="2.2" fill="#e8b84a" ${s2}/><ellipse cx="17" cy="16" rx="2.8" ry="2.2" fill="#e8b84a" ${s2}/>`,
    sonne: `<circle cx="12" cy="12" r="5" fill="#ffcf5a" ${s2}/>` + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (i / 8) * Math.PI * 2; return `<path d="M${12 + Math.cos(a) * 7.5} ${12 + Math.sin(a) * 7.5} L${12 + Math.cos(a) * 10} ${12 + Math.sin(a) * 10}" stroke="${O}" stroke-width="1.6"/>`; }).join(""),
    mond: `<path d="M15 3 C9 4 5 8 5 13 C5 18 9 21 14 21 C17 21 19 20 21 18 C15 18 11 14 11 9 C11 7 12 5 15 3 Z" fill="#cfe0ff" ${s2}/>`,
    buch: `<path d="M3 5 C6 4 9.5 4 12 6 C14.5 4 18 4 21 5 L21 19 C18 18 14.5 18 12 20 C9.5 18 6 18 3 19 Z" fill="#e9e0c8" ${s2}/><path d="M12 6 L12 20" stroke="${O}" stroke-width="1.4"/>`,
    abzeichen: `<path d="M8 2 L16 2 L15 9 L9 9 Z" fill="#4f7fbf" ${s2}/><circle cx="12" cy="15" r="6.5" fill="#e8b84a" ${s2}/><path d="M12 11.5 L13.1 14 L15.6 14.2 L13.7 15.9 L14.3 18.4 L12 17 L9.7 18.4 L10.3 15.9 L8.4 14.2 L10.9 14 Z" fill="#fff0b8" stroke="${O}" stroke-width="0.8"/>`,
    zurueck: `<path d="M15 4 L7 12 L15 20" fill="none" stroke="currentColor" stroke-width="2.6"/>`,
    schliessen: `<path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="2.6"/>`,
    pfeil: `<path d="M12 20 L12 5 M6 11 L12 5 L18 11" fill="none" stroke="#74d86f" stroke-width="3" stroke-linecap="round"/>`,
    pfeilab: `<path d="M12 4 L12 19 M6 13 L12 19 L18 13" fill="none" stroke="#e0644f" stroke-width="3" stroke-linecap="round"/>`,
    sanduhr: `<path d="M6 3 L18 3 L18 5 C18 9 14 11 12 12 C14 13 18 15 18 19 L18 21 L6 21 L6 19 C6 15 10 13 12 12 C10 11 6 9 6 5 Z" fill="#e9f6ff" ${s2}/><path d="M8.5 19.5 C9 17 11 16 12 15.5 C13 16 15 17 15.5 19.5 Z" fill="#e8b84a"/>`,
    rucksack: `<path d="M6 8 C6 4 18 4 18 8 L19 20 C19 21 18 21.5 17 21.5 L7 21.5 C6 21.5 5 21 5 20 Z" fill="#8a5a35" ${s2}/><rect x="8" y="12" width="8" height="5" rx="1.5" fill="#6a4628" ${s2}/><path d="M9 4.5 C9 2.5 15 2.5 15 4.5" fill="none" stroke="${O}" stroke-width="1.5"/>`,
    schaedel: `<path d="M5 11 C5 5 19 5 19 11 C19 14 17 15 17 17 L15 17 L15 20 L9 20 L9 17 L7 17 C7 15 5 14 5 11 Z" fill="#e8dcc0" ${s2}/><circle cx="9" cy="11.5" r="2" fill="${O}"/><circle cx="15" cy="11.5" r="2" fill="${O}"/>`,
    horde: `<path d="M3 20 L8 6 L10 12 L12 4 L14 12 L16 6 L21 20 Z" fill="#b8322e" ${s2}/>`,
  };
  I.ui = function (name, cls) {
    const body = UI[name];
    if (!body) return "";
    return '<svg class="ic ' + (cls || "") + '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">' + body + "</svg>";
  };

  /* Reichswappen */
  const REALM_SIGIL = {
    albion: `<path d="M10.5 5 L13.5 5 L13.5 9 L18 9 L18 12 L13.5 12 L13.5 20 L10.5 20 L10.5 12 L6 12 L6 9 L10.5 9 Z" fill="#e8c35a" stroke="${O}" stroke-width="0.8"/>`,
    midgard: [0, 1, 2, 3, 4, 5].map((i) => `<path d="M12 12 L12 4.5 M12 7 L10 5 M12 7 L14 5" stroke="#cfe3ff" stroke-width="1.5" stroke-linecap="round" fill="none" transform="rotate(${i * 60} 12 12)"/>`).join(""),
    hibernia: `<path d="M12 12 C12 8 16 7 16 10 C16 12 13 12 13 10 M12 12 C8.5 14 7 10.5 9.5 9.5 C11 9 12 11 10.5 11.8 M12 12 C12 16 8 17 8.5 14.5 C9 13 11 13.5 11 14.5" fill="none" stroke="#9fffc8" stroke-width="1.4" stroke-linecap="round"/>`,
  };
  I.realm = function (realm, cls) {
    const R0 = SB.data.REALMS[realm] || SB.data.REALMS.albion;
    return '<svg class="ic realm ' + (cls || "") + '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2.5 L21 2.5 L21 13 C21 18 16.5 21 12 22.5 C7.5 21 3 18 3 13 Z" fill="' + R0.color + '" stroke="' + O + '" stroke-width="1.3"/><path d="M4.5 4 L19.5 4 L19.5 13 C19.5 17 16 19.5 12 21 C8 19.5 4.5 17 4.5 13 Z" fill="none" stroke="' + R0.trim + '" stroke-width="0.9"/>' + (REALM_SIGIL[realm] || REALM_SIGIL.albion) + "</svg>";
  };

  /* Klassenwappen fuer Ranglisten: Reichsfarbe und Grundart */
  const ARCH_GLYPH = {
    krieger: UI.ruestung,
    schurke: `<path d="M6 3 L9 3 L18 15 L16 17 Z M18 3 L15 3 L6 15 L8 17 Z" fill="#c8ced6" ${s2}/><path d="M5 20 L8 16 M19 20 L16 16" stroke="${O}" stroke-width="2.4"/>`,
    jaeger: `<path d="M6 3 C16 5 18 15 6 21" fill="none" stroke="#8a5a35" stroke-width="2.6"/><path d="M6 3 L6 21" stroke="#efe6d2" stroke-width="1"/><path d="M4 12 L21 12 M21 12 L17 10 M21 12 L17 14" stroke="${O}" stroke-width="1.5" fill="none"/>`,
    magier: UI.verstand,
  };
  I.classCrest = function (cls) {
    const C = SB.data.CLASSES[cls];
    const R0 = C ? SB.data.REALMS[C.realm] : null;
    const col = R0 ? R0.color : "#666";
    const inner = ARCH_GLYPH[C ? C.arch : "krieger"] || UI.ruestung;
    return '<svg class="ic crest" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="' + col + '" stroke="' + O + '" stroke-width="1.3"/><circle cx="12" cy="12" r="9.6" fill="none" stroke="' + (R0 ? R0.trim : "#c9a441") + '" stroke-width="0.8"/><g transform="translate(4.8 4.8) scale(0.6)">' + inner + "</g></svg>";
  };

  /* Ersatzbild, falls kein 3D verfuegbar ist */
  I.silhouette = function (color, kind) {
    const c = color || "#7f8a96";
    if (kind === "monster")
      return svg(`<path d="M10 58 C6 34 16 12 32 12 C48 12 58 34 54 58 Z" fill="${c}" ${st()}/><path d="M22 30 L28 34 M42 30 L36 34" stroke="#ffcf5a" stroke-width="3" stroke-linecap="round"/><path d="M22 46 L26 42 L30 46 L34 42 L38 46 L42 42" fill="none" stroke="#e8dcc0" stroke-width="2.4"/>`);
    return svg(`<circle cx="32" cy="20" r="11" fill="#d9b494" ${st()}/><path d="M10 62 C10 40 20 32 32 32 C44 32 54 40 54 62 Z" fill="${c}" ${st()}/><path d="M14 36 C10 34 8 30 10 26 C16 30 20 32 22 34 Z M50 36 C54 34 56 30 54 26 C48 30 44 32 42 34 Z" fill="${shade(c, 1.3)}" ${st(1.2)}/>`);
  };
})();
