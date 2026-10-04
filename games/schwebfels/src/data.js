/* Helden von Schwebfels - statische Spieldaten.
   Alle Namen, Texte und Werte sind eigens fuer dieses Spiel geschrieben. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});

  const ATTRS = ["kraft", "geschick", "verstand", "konstitution", "glueck"];
  const ATTR_INFO = {
    kraft: { name: "Kraft", short: "KRA", desc: "Hauptwert der Klingenwache. Erhöht ihren Schaden und schwächt Kraftangriffe gegen dich." },
    geschick: { name: "Geschick", short: "GES", desc: "Hauptwert des Windläufers. Erhöht seinen Schaden und schwächt Geschick-Angriffe gegen dich." },
    verstand: { name: "Verstand", short: "VER", desc: "Hauptwert des Runenwirkers. Erhöht seinen Zauberschaden und schwächt Zauber gegen dich." },
    konstitution: { name: "Konstitution", short: "KON", desc: "Bestimmt deine Lebenspunkte." },
    glueck: { name: "Glück", short: "GLÜ", desc: "Erhöht die Chance auf kritische Treffer (doppelter Schaden)." },
  };

  const RACES = {
    wolkling: {
      name: "Wolkling",
      desc: "Insulaner mit Höhenluft im Blut. Ausgeglichen und unerschütterlich optimistisch.",
      mods: { kraft: 0, geschick: 1, verstand: 1, konstitution: 0, glueck: 1 },
      skins: ["#f2cba8", "#dba27a", "#a86f4c", "#6b4430"],
      hairs: ["#3b2a20", "#8a5a2b", "#e0b04a", "#c9532f", "#e8e2d6"],
      ears: "round", height: 1.0, width: 1.0,
    },
    steinbart: {
      name: "Steinbart",
      desc: "Kompakt, zäh und nachweislich schwerer, als sie aussehen.",
      mods: { kraft: 2, geschick: -1, verstand: -1, konstitution: 2, glueck: 0 },
      skins: ["#d8b597", "#b98f72", "#9a7a66", "#c4a582"],
      hairs: ["#5a3a22", "#9b3d24", "#2b2b2b", "#b8b0a2", "#d07a2d"],
      ears: "round", height: 0.84, width: 1.22,
    },
    moosling: {
      name: "Moosling",
      desc: "Kleine Waldwesen mit Moos auf dem Kopf und verdächtig viel Glück.",
      mods: { kraft: -2, geschick: 1, verstand: 0, konstitution: 0, glueck: 3 },
      skins: ["#a9c98f", "#86b07c", "#c4d39a", "#77a07a"],
      hairs: ["#4f8a3c", "#6aa84f", "#2f6b45", "#a3b83a", "#7a5c2e"],
      ears: "leaf", height: 0.78, width: 0.95,
    },
    hornvolk: {
      name: "Hornvolk",
      desc: "Gehörnt, laut und herzlich. Verstehen Ironie meist beim zweiten Mal.",
      mods: { kraft: 2, geschick: 0, verstand: -1, konstitution: 1, glueck: -1 },
      skins: ["#c96b5a", "#8f5c8c", "#5f7fa8", "#b5765a"],
      hairs: ["#1f1f24", "#4a2c2a", "#d9d2c5", "#6b3f8f", "#2f4f6f"],
      ears: "pointy", horns: true, height: 1.08, width: 1.1,
    },
    nebelalb: {
      name: "Nebelalb",
      desc: "Blasse Gestalten aus den Wolkenschluchten. Kluge Köpfe, kalte Hände.",
      mods: { kraft: -1, geschick: 1, verstand: 2, konstitution: -1, glueck: 0 },
      skins: ["#e3e9f1", "#cdd8e8", "#bfc6e0", "#e9e0f2"],
      hairs: ["#f2f2f2", "#9fb7d9", "#2a2f45", "#c7a6e0", "#7fd1c7"],
      ears: "long", height: 1.05, width: 0.92,
    },
  };

  const CLASSES = {
    klinge: {
      name: "Klingenwache",
      main: "kraft",
      desc: "Schwer gepanzert, trägt einen Schild und blockt jeden fünften Angriff. Viele Lebenspunkte.",
      hpMult: 4.5, armorCap: 45, block: 0.2, evade: 0, unblockable: false, dmgMult: 1.0,
      special: { id: "schildbrecher", name: "Schildbrecher", desc: "Wuchtiger Hieb (150 %), betäubt den Gegner für einen Zug." },
      material: "platte", weapons: ["schwert", "axt", "hammer"], offhand: "schild", helm: "helm", chest: "harnisch",
      color: "#d9a441",
    },
    wind: {
      name: "Windläufer",
      main: "geschick",
      desc: "Flink und schwer zu treffen: weicht fast jedem dritten Angriff aus.",
      hpMult: 3.8, armorCap: 30, block: 0, evade: 0.3, unblockable: false, dmgMult: 1.42,
      special: { id: "pfeilhagel", name: "Pfeilhagel", desc: "Drei schnelle Treffer mit je 60 % Schaden." },
      material: "leder", weapons: ["bogen", "dolch", "armbrust"], offhand: "koecher", helm: "kappe", chest: "wams",
      color: "#5fbf7a",
    },
    rune: {
      name: "Runenwirker",
      main: "verstand",
      desc: "Zaubern kann niemand ausweichen, und Schilde fangen sie nur selten ab. Hoher Schaden, wenig Lebenspunkte.",
      hpMult: 3.3, armorCap: 15, block: 0, evade: 0, unblockable: true, dmgMult: 1.8,
      special: { id: "sternenbruch", name: "Sternenbruch", desc: "Zauber mit 220 % Schaden, der Rüstung ignoriert." },
      material: "stoff", weapons: ["stab", "zepter"], offhand: "fokus", helm: "hut", chest: "robe",
      color: "#8f7cff",
    },
  };

  const SLOTS = ["helm", "amulett", "ruestung", "umhang", "handschuhe", "stiefel", "waffe", "nebenhand", "ring", "talisman"];
  const SLOT_INFO = {
    helm: { name: "Kopf", armor: 0.16, stat: 1.0, price: 1.0 },
    ruestung: { name: "Rüstung", armor: 0.34, stat: 1.0, price: 1.3 },
    umhang: { name: "Umhang", armor: 0.08, stat: 1.0, price: 1.0 },
    handschuhe: { name: "Hände", armor: 0.1, stat: 1.0, price: 0.9 },
    stiefel: { name: "Füße", armor: 0.12, stat: 1.0, price: 0.9 },
    waffe: { name: "Waffe", armor: 0, stat: 1.2, price: 1.5 },
    nebenhand: { name: "Nebenhand", armor: 0.2, stat: 1.0, price: 1.1 },
    amulett: { name: "Amulett", armor: 0, stat: 1.3, price: 1.2 },
    ring: { name: "Ring", armor: 0, stat: 1.3, price: 1.2 },
    talisman: { name: "Talisman", armor: 0, stat: 1.3, price: 1.2 },
  };

  // g = Genus fuer die Adjektivendung: m, f, n, pl
  const BASES = {
    schwert: { slot: "waffe", cls: "klinge", name: "Schwert", g: "n", speed: 1 },
    axt: { slot: "waffe", cls: "klinge", name: "Axt", g: "f", speed: 1 },
    hammer: { slot: "waffe", cls: "klinge", name: "Kriegshammer", g: "m", speed: 1 },
    bogen: { slot: "waffe", cls: "wind", name: "Langbogen", g: "m", ranged: true },
    dolch: { slot: "waffe", cls: "wind", name: "Dolchpaar", g: "n" },
    armbrust: { slot: "waffe", cls: "wind", name: "Armbrust", g: "f", ranged: true },
    stab: { slot: "waffe", cls: "rune", name: "Runenstab", g: "m", ranged: true },
    zepter: { slot: "waffe", cls: "rune", name: "Zepter", g: "n", ranged: true },
    schild: { slot: "nebenhand", cls: "klinge", name: "Schild", g: "m" },
    koecher: { slot: "nebenhand", cls: "wind", name: "Köcher", g: "m" },
    fokus: { slot: "nebenhand", cls: "rune", name: "Fokuskristall", g: "m" },
    helm: { slot: "helm", cls: "klinge", name: "Helm", g: "m" },
    kappe: { slot: "helm", cls: "wind", name: "Kapuze", g: "f" },
    hut: { slot: "helm", cls: "rune", name: "Spitzhut", g: "m" },
    harnisch: { slot: "ruestung", cls: "klinge", name: "Harnisch", g: "m" },
    wams: { slot: "ruestung", cls: "wind", name: "Lederwams", g: "n" },
    robe: { slot: "ruestung", cls: "rune", name: "Robe", g: "f" },
    handschuhe: { slot: "handschuhe", cls: null, names: { klinge: "Panzerhandschuhe", wind: "Lederhandschuhe", rune: "Zauberhandschuhe" }, g: "pl" },
    stiefel: { slot: "stiefel", cls: null, names: { klinge: "Eisenstiefel", wind: "Wanderstiefel", rune: "Sternensandalen" }, g: "pl" },
    umhang: { slot: "umhang", cls: null, name: "Umhang", g: "m" },
    amulett: { slot: "amulett", cls: null, name: "Amulett", g: "n" },
    ring: { slot: "ring", cls: null, name: "Ring", g: "m" },
    talisman: { slot: "talisman", cls: null, name: "Talisman", g: "m" },
  };

  const RARITIES = {
    gewoehnlich: { name: "Gewöhnlich", color: "#c9d2d8", mult: 1.0, price: 1.0, lines: 1, weight: 52 },
    ungewoehnlich: { name: "Ungewöhnlich", color: "#74d86f", mult: 1.15, price: 1.5, lines: 2, weight: 30 },
    selten: { name: "Selten", color: "#4fa9ff", mult: 1.35, price: 2.4, lines: 2, weight: 13.5 },
    episch: { name: "Episch", color: "#c47bff", mult: 1.6, price: 4.0, lines: 3, weight: 4 },
    legendaer: { name: "Legendär", color: "#ffb13b", mult: 1.9, price: 7.0, lines: 4, weight: 0.5 },
  };
  const RARITY_ORDER = ["gewoehnlich", "ungewoehnlich", "selten", "episch", "legendaer"];

  // Adjektivstaemme je Seltenheit (Endung kommt per Genus dazu)
  const ADJ = {
    gewoehnlich: ["rostig", "verbeult", "schlicht", "solide", "geflickt", "ordentlich", "robust", "abgewetzt"],
    ungewoehnlich: ["geschliffen", "gehärtet", "verstärkt", "glänzend", "fein gearbeitet", "zuverlässig"],
    selten: ["meisterlich", "runenverziert", "sturmgeschmiedet", "wolkenleicht", "funkelnd", "kupferbeschlagen"],
    episch: ["sternengeschmiedet", "uralt", "donnernd", "mondbeschienen", "flammend", "nebelgeboren"],
    legendaer: ["himmelsbrechend", "sagenhaft", "unvergänglich", "sternenfressend", "weltenweit"],
  };
  const SUFFIX = {
    kraft: ["des Bären", "des Ambosses", "der Brandung"],
    geschick: ["des Falken", "der Wildkatze", "des Windes"],
    verstand: ["der Eule", "der Sterne", "des Nordlichts"],
    konstitution: ["der Eiche", "des Felsens", "der Schildkröte"],
    glueck: ["des Kleeblatts", "der Sternschnuppe", "des Hufeisens"],
  };

  // Monster: arch bestimmt das 3D-Modell, type das Kampfverhalten
  const MONSTER_TYPES = {
    kraft: { profile: "Raufbold", hpMult: 4.5, armorCap: 40, block: 0.1, evade: 0, unblockable: false, dmgMult: 1.0, special: { id: "zermalmen", name: "Zermalmen" } },
    geschick: { profile: "Biest", hpMult: 3.6, armorCap: 22, block: 0, evade: 0.22, unblockable: false, dmgMult: 1.1, special: { id: "raserei", name: "Raserei" } },
    verstand: { profile: "Hexer", hpMult: 2.8, armorCap: 12, block: 0, evade: 0, unblockable: true, dmgMult: 1.45, special: { id: "fluch", name: "Fluch" } },
  };
  const ARCH_TYPE = {
    schleim: "kraft", kobold: "geschick", skelett: "kraft", wolf: "geschick", golem: "kraft", flatterer: "geschick",
    pilz: "verstand", spinne: "geschick", drache: "verstand", geist: "verstand", krabbe: "kraft", ritter: "kraft",
  };

  const MONSTERS = [
    // Band 1-7
    { id: "pfuetzenschleim", name: "Pfützenschleim", arch: "schleim", color: "#7fd68f", accent: "#2e7d50", lv: [1, 6] },
    { id: "taschenkobold", name: "Taschenkobold", arch: "kobold", color: "#9fbf5a", accent: "#5a3b2a", lv: [1, 7] },
    { id: "klappergerippe", name: "Klappergerippe", arch: "skelett", color: "#ece4cf", accent: "#6b5d48", lv: [2, 8] },
    { id: "zauselwolf", name: "Zauselwolf", arch: "wolf", color: "#9a8a7a", accent: "#5b4a3e", lv: [2, 8] },
    { id: "stachelpilzling", name: "Stachelpilzling", arch: "pilz", color: "#e0644f", accent: "#f6efe0", lv: [1, 7] },
    { id: "kieselkrabbe", name: "Kieselkrabbe", arch: "krabbe", color: "#d9915c", accent: "#7a4a2a", lv: [1, 6] },
    // Band 6-15
    { id: "moorschleim", name: "Moorschleim", arch: "schleim", color: "#6b8f3c", accent: "#3a4f22", lv: [6, 14] },
    { id: "russkobold", name: "Rußkobold", arch: "kobold", color: "#5d5d66", accent: "#e0b04a", lv: [6, 15] },
    { id: "nebelwolf", name: "Nebelwolf", arch: "wolf", color: "#b9c6d6", accent: "#5a6b84", lv: [7, 15] },
    { id: "glockenflatterer", name: "Glockenflatterer", arch: "flatterer", color: "#7a5c8f", accent: "#e8c35a", lv: [6, 14] },
    { id: "garnspinne", name: "Garnspinne", arch: "spinne", color: "#8a6a4e", accent: "#f0e2c8", lv: [8, 16] },
    { id: "lehmgolem", name: "Lehmgolem", arch: "golem", color: "#b07d55", accent: "#6f4a30", lv: [8, 16] },
    // Band 14-25
    { id: "glutschleim", name: "Glutschleim", arch: "schleim", color: "#ff7a3d", accent: "#ffd25a", lv: [14, 24] },
    { id: "grabesritter", name: "Grabesritter", arch: "ritter", color: "#6d7480", accent: "#9b2f2f", lv: [15, 25] },
    { id: "sporenhexer", name: "Sporenhexer", arch: "pilz", color: "#8f5fb8", accent: "#d9f27a", lv: [14, 24] },
    { id: "sturmflatterer", name: "Sturmflatterer", arch: "flatterer", color: "#4f6fa8", accent: "#9fe3ff", lv: [15, 25] },
    { id: "laternengeist", name: "Laternengeist", arch: "geist", color: "#cfe9ff", accent: "#ffcf5a", lv: [16, 26] },
    { id: "felsgolem", name: "Felsgolem", arch: "golem", color: "#8b8f96", accent: "#59d1ff", lv: [16, 26] },
    // Band 24-36
    { id: "frostwolf", name: "Frostwolf", arch: "wolf", color: "#e6f2ff", accent: "#7fb7ff", lv: [24, 35] },
    { id: "kristallweber", name: "Kristallweber", arch: "spinne", color: "#5fd0d6", accent: "#e9fbff", lv: [24, 36] },
    { id: "knochenfuerst", name: "Knochenfürst", arch: "skelett", color: "#f4ecd6", accent: "#b13a3a", lv: [25, 36] },
    { id: "rostritter", name: "Rostritter", arch: "ritter", color: "#a8643a", accent: "#4a3a2e", lv: [24, 35] },
    { id: "donnerkrabbe", name: "Donnerkrabbe", arch: "krabbe", color: "#3f6fd8", accent: "#ffe45a", lv: [26, 36] },
    { id: "irrlicht", name: "Irrlicht", arch: "geist", color: "#9effc8", accent: "#2a7a5a", lv: [25, 36] },
    // Band 34-48
    { id: "schwelwurm", name: "Schwelwurm", arch: "drache", color: "#c2502f", accent: "#ffcf5a", lv: [34, 48] },
    { id: "eisengolem", name: "Eisengolem", arch: "golem", color: "#5d6670", accent: "#ff7a3d", lv: [34, 47] },
    { id: "schattenwolf", name: "Schattenwolf", arch: "wolf", color: "#33334a", accent: "#c47bff", lv: [35, 48] },
    { id: "seelenflatterer", name: "Seelenflatterer", arch: "flatterer", color: "#2f3a5a", accent: "#8ff0ff", lv: [35, 48] },
    { id: "giftmorchel", name: "Giftmorchel", arch: "pilz", color: "#5c8f2f", accent: "#e6ff5a", lv: [34, 47] },
    { id: "panzerkrabbe", name: "Panzerkrabbe", arch: "krabbe", color: "#6f7a5a", accent: "#c9d2d8", lv: [36, 48] },
    // Band 46+
    { id: "sturmdrache", name: "Sturmdrache", arch: "drache", color: "#3f5fbf", accent: "#9fe3ff", lv: [46, 999] },
    { id: "sternengeist", name: "Sternengeist", arch: "geist", color: "#fff3c4", accent: "#8f7cff", lv: [46, 999] },
    { id: "obsidiangolem", name: "Obsidiangolem", arch: "golem", color: "#2a2633", accent: "#ff5a8a", lv: [46, 999] },
    { id: "leerenspinne", name: "Leerenspinne", arch: "spinne", color: "#1f1b2e", accent: "#c47bff", lv: [46, 999] },
    { id: "schwarzritter", name: "Schwarzritter", arch: "ritter", color: "#24262c", accent: "#ffb13b", lv: [46, 999] },
    { id: "urschleim", name: "Urschleim", arch: "schleim", color: "#c47bff", accent: "#4fa9ff", lv: [46, 999] },
  ];

  const DUNGEONS = [
    {
      id: "pilzgrotte", name: "Die Pilzgrotte", unlock: 10, base: 10, theme: "#7fbf6a",
      desc: "Unter der Mehlinsel wächst etwas. Es riecht nach Waldboden und schlechten Absichten.",
      bosses: [
        { name: "Sporenwächter Muff", arch: "pilz", color: "#c9a26b", accent: "#f6efe0" },
        { name: "Schleimkönigin Glibba", arch: "schleim", color: "#9fe07a", accent: "#2e7d50" },
        { name: "Hauptmann Zwick", arch: "kobold", color: "#a8c25a", accent: "#7a2f2f" },
        { name: "Grauzahn", arch: "wolf", color: "#7d7468", accent: "#c9b89a" },
        { name: "Spinnenmutter Fadenreich", arch: "spinne", color: "#6b4f3a", accent: "#e0d2b8" },
        { name: "Morchelmagier Duftwolke", arch: "pilz", color: "#8f6fb8", accent: "#f2e27a" },
        { name: "Steinfresser Brocken", arch: "golem", color: "#9a8b7a", accent: "#7fd68f" },
        { name: "Der Große Bovist", arch: "pilz", color: "#efe6d2", accent: "#b85f3a", final: true },
      ],
    },
    {
      id: "glockenstadt", name: "Versunkene Glockenstadt", unlock: 15, base: 16, theme: "#5f8fbf",
      desc: "Eine Stadt im Wolkenmeer. Jede Stunde läuten die Glocken, obwohl dort niemand mehr wohnt.",
      bosses: [
        { name: "Glöckner Bimbam", arch: "skelett", color: "#e9e0c8", accent: "#c9a441" },
        { name: "Turmflatterer Hallo", arch: "flatterer", color: "#5a4a6f", accent: "#e8c35a" },
        { name: "Kneifer", arch: "krabbe", color: "#b0643a", accent: "#4a2f22" },
        { name: "Geisterküster Amen", arch: "geist", color: "#d9ecff", accent: "#7fa8ff" },
        { name: "Glockengolem Dong", arch: "golem", color: "#c9a441", accent: "#6f4a1f" },
        { name: "Turmritter Eisenmut", arch: "ritter", color: "#8a93a0", accent: "#3f6fd8" },
        { name: "Schwarm der hundert Flügel", arch: "flatterer", color: "#2f2a3a", accent: "#ff7a3d" },
        { name: "Die Ertrunkene Glocke", arch: "geist", color: "#7fb7d6", accent: "#ffe7a3", final: true },
      ],
    },
    {
      id: "rostwerk", name: "Das Rostwerk", unlock: 22, base: 23, theme: "#bf7a3f",
      desc: "Eine Fabrik, die niemand gebaut hat und die trotzdem Tag und Nacht stampft.",
      bosses: [
        { name: "Zahnradkobold Ritzel", arch: "kobold", color: "#8a7a5a", accent: "#e0b04a" },
        { name: "Dampfkrabbe Zisch", arch: "krabbe", color: "#9aa3ad", accent: "#ff7a3d" },
        { name: "Kesselgolem Brodel", arch: "golem", color: "#7a4a2f", accent: "#ffcf5a" },
        { name: "Rostritter Quietsch", arch: "ritter", color: "#a8643a", accent: "#3a2e24" },
        { name: "Ölschleim Schmier", arch: "schleim", color: "#2f2a24", accent: "#c9a441" },
        { name: "Funkenflatterer", arch: "flatterer", color: "#5a3a2a", accent: "#ffd25a" },
        { name: "Werkmeister Knochenhand", arch: "skelett", color: "#d9cfb8", accent: "#c2502f" },
        { name: "Der Große Kolben", arch: "golem", color: "#5d6670", accent: "#ff5a3d", final: true },
      ],
    },
    {
      id: "frostspitzen", name: "Frostspitzen-Horst", unlock: 30, base: 31, theme: "#9fd7ff",
      desc: "Der kälteste Gipfel über den Wolken. Selbst die Echos frieren hier fest.",
      bosses: [
        { name: "Weißfell", arch: "wolf", color: "#f2f7ff", accent: "#7fb7ff" },
        { name: "Eisspinne Klirr", arch: "spinne", color: "#a8e6ff", accent: "#ffffff" },
        { name: "Frostgeist Hauch", arch: "geist", color: "#e6f5ff", accent: "#4fa9ff" },
        { name: "Gletscherkrabbe", arch: "krabbe", color: "#7fc9e6", accent: "#e9fbff" },
        { name: "Firnriese Grummel", arch: "golem", color: "#dfe9f2", accent: "#5f8fbf" },
        { name: "Frostritter Kaltblut", arch: "ritter", color: "#9fb7d9", accent: "#e9fbff" },
        { name: "Hagelschwinge", arch: "flatterer", color: "#c9e2ff", accent: "#3f6fd8" },
        { name: "Eisdrachin Kristalla", arch: "drache", color: "#bfe8ff", accent: "#5fd0d6", final: true },
      ],
    },
    {
      id: "laternengruft", name: "Gruft der Laternen", unlock: 38, base: 40, theme: "#c9a441",
      desc: "Tausend Laternen brennen hier unten. Niemand weiß, wer sie jeden Abend anzündet.",
      bosses: [
        { name: "Laternenträger Docht", arch: "skelett", color: "#efe6cf", accent: "#ffcf5a" },
        { name: "Irrlichtschwarm", arch: "geist", color: "#ffe9a3", accent: "#ff9a3d" },
        { name: "Grabspinne Schleier", arch: "spinne", color: "#3a3346", accent: "#ffcf5a" },
        { name: "Gruftritter Ohnehaupt", arch: "ritter", color: "#4a4f5a", accent: "#ffb13b" },
        { name: "Knochenwolf Rasselzahn", arch: "wolf", color: "#e9e0c8", accent: "#6b5d48" },
        { name: "Schattenmorchel", arch: "pilz", color: "#3a2f4a", accent: "#ffcf5a" },
        { name: "Wachsgolem Tropf", arch: "golem", color: "#f2e6c4", accent: "#ff7a3d" },
        { name: "Laternenkönig Ewiglicht", arch: "geist", color: "#fff3c4", accent: "#ffb13b", final: true },
      ],
    },
    {
      id: "sturmkern", name: "Der Sturmkern", unlock: 46, base: 50, theme: "#8f7cff",
      desc: "Das Auge des ewigen Sturms. Hier entstehen die Blitze, die Schwebfels in der Luft halten.",
      bosses: [
        { name: "Blitzflatterer Zack", arch: "flatterer", color: "#3f4f8f", accent: "#fff35a" },
        { name: "Sturmgolem Böe", arch: "golem", color: "#5a6a8f", accent: "#9fe3ff" },
        { name: "Donnerkrabbe Krachbumm", arch: "krabbe", color: "#2f4fbf", accent: "#ffe45a" },
        { name: "Wirbelgeist Hui", arch: "geist", color: "#cfe0ff", accent: "#8f7cff" },
        { name: "Sturmritter Orkan", arch: "ritter", color: "#3a4a6f", accent: "#9fe3ff" },
        { name: "Orkanwolf Heulsturm", arch: "wolf", color: "#5a6a8f", accent: "#e9fbff" },
        { name: "Himmelsschleim", arch: "schleim", color: "#9fd7ff", accent: "#ffffff" },
        { name: "Sturmdrache Tempestas", arch: "drache", color: "#2f3f9f", accent: "#9fe3ff", final: true },
      ],
    },
  ];

  const PLACES = ["Mehlinsel", "Nebelkamm", "Rostbucht", "Glockenriff", "Pilzwacht", "Sturmzahn", "Kupferkessel", "Möwenfels",
    "Laternenhain", "Bernsteinklippe", "Wolkenmoor", "Ankerhöh", "Sternenhafen", "Flusenfeld", "Kesselgrund", "Seilbahnhügel"];
  const PERSONS = ["Bürgermeister Kniebel", "Oma Grützbart", "Leutnant Pfefferminz", "Professorin Brassel", "Fischer Ole",
    "Bäckerin Krümel", "Postmeister Stempelmann", "Leuchtturmwärter Funzel", "Gräfin von Wolkenstein", "Schmied Brumm",
    "Madame Zinnober", "die Zwillinge Wim und Wum"];

  // {m} = Monstername, {o} = Ort, {p} = Person
  const QUESTS = [
    { t: "Ärger in {o}", x: "{p} schwört, dass jede Nacht etwas die Wäscheleinen in {o} anknabbert. Die Socken sind alle weg. Hauptverdächtig: {m}." },
    { t: "Die Zimtschnecken-Krise", x: "Die Bäckerei in {o} wird belagert, angeblich wegen der Zimtschnecken. Der Belagerer heißt {m} und teilt nicht." },
    { t: "Eine Perücke im Wind", x: "Die Perücke von Bürgermeister Kniebel wurde zuletzt über {o} gesichtet. Getragen von {m}. Bitte frag nicht weiter." },
    { t: "Leuchtfeuer in Gefahr", x: "Auf {o} geht nachts ständig das Leuchtfeuer aus. {p} vermutet Sabotage durch {m}. Oder Wind. Eher {m}." },
    { t: "Zerbrechliche Fracht", x: "Eine Kiste mit der Aufschrift „Nicht schütteln“ muss nach {o}. Unterwegs wartet {m}. Die Kiste tickt übrigens leise." },
    { t: "Der Kuchenkompass", x: "{p} hat den Familienkompass verloren. Er zeigt nicht nach Norden, sondern zum nächsten Kuchen. Zuletzt gesehen bei {m} in {o}." },
    { t: "Nachtruhe für {o}", x: "Seit Tagen singt {m} in {o} schief und sehr laut. Die Anwohner wünschen ein Ende des Konzerts." },
    { t: "Pilze mit Leibwache", x: "{p} braucht Pilze aus {o}. Die Pilze haben allerdings einen Leibwächter: {m}." },
    { t: "Die Steuerprüfung", x: "Das Steueramt von Schwebfels bittet um Mithilfe. {m} wohnt seit drei Jahren in {o} und hat noch nie Steuern gezahlt." },
    { t: "Ein Brief nach {o}", x: "Ein Liebesbrief muss sicher nach {o}. Der letzte Postbote hat gekündigt, nachdem er {m} begegnet ist." },
    { t: "Das entlaufene Wolkenschaf", x: "Das preisgekrönte Wolkenschaf von {p} ist nach {o} ausgebüxt. Dort grast jetzt auch {m}. Das Schaf ist nicht die Gefahr." },
    { t: "Wegezoll", x: "Auf der Hängebrücke nach {o} verlangt {m} plötzlich Zoll. Niemand weiß, wer das genehmigt hat." },
    { t: "Geräusche im Keller", x: "{p} hört Geräusche im Keller. Der Keller liegt dummerweise in {o}. Und dort unten wohnt jetzt {m}." },
    { t: "Die verlorene Wette", x: "{p} hat gewettet, dass du {m} in {o} besiegst. Es geht um sehr viel Gold. Und um einen Hut." },
    { t: "Feuerholz für den Winter", x: "{o} braucht Feuerholz. Im einzigen Wäldchen hat sich {m} breitgemacht und verteidigt jeden Ast." },
    { t: "Kunstraub", x: "Das Gemälde „Wolke mit Wolke“ wurde aus dem Museum gestohlen. Die Spur führt nach {o}. Und zu {m}." },
    { t: "Die geheime Zutat", x: "Die Wirtin braucht eine geheime Zutat aus {o}. Sie verrät nicht, welche. {m} weiß es leider schon." },
    { t: "Notlandung", x: "Ein Postluftschiff musste über {o} notlanden. Die Passagiere sitzen fest, umzingelt von {m}." },
    { t: "Das große Schnarchen", x: "Ganz {o} kann nicht schlafen, weil {m} so laut schnarcht. Ein höfliches Wecken genügt. Vermutlich." },
    { t: "Forschungsreise", x: "Professorin Brassel will {m} in {o} vermessen. Lebend wäre schön, aber sie ist nicht wählerisch." },
    { t: "Verirrte Reisegruppe", x: "Eine Reisegruppe aus Sternenhafen hat sich in {o} verlaufen. Ihr Reiseführer wurde inzwischen von {m} adoptiert." },
    { t: "Die Mutprobe", x: "Die Kinder von {o} behaupten, du traust dich nicht, {m} an die Nase zu stupsen. Das kannst du so nicht stehen lassen." },
    { t: "Der Geburtstagskuchen", x: "{p} hat Geburtstag, und der Kuchen steht in {o}. Daneben sitzt {m} und hält bereits eine Gabel." },
    { t: "Ruhestörung im Archiv", x: "Im Archiv von {o} blättert nachts jemand in alten Seekarten. {p} tippt auf {m}. Mit Lesebrille." },
    { t: "Die Seilbahn klemmt", x: "Die Seilbahn nach {o} hängt fest. Im Getriebe sitzt {m} und findet das sehr gemütlich." },
    { t: "Wettbewerb der Kürbisse", x: "Der Riesenkürbis von {p} ist der Favorit beim Wettbewerb in {o}. {m} hat bereits zweimal hineingebissen." },
  ];

  const NPC_FIRST = ["Brakus", "Mira", "Tjark", "Ilva", "Gorm", "Senna", "Fenja", "Okko", "Rurik", "Wenzel", "Lotta", "Bodo",
    "Hilde", "Quirin", "Yara", "Zeno", "Pim", "Runa", "Tamo", "Edda", "Knut", "Fiete", "Smilla", "Hauke", "Ida", "Jorin",
    "Malte", "Nele", "Rasmus", "Svea", "Ole", "Greta", "Hinnerk", "Wiebke", "Arvid", "Talea", "Kalle", "Frieda", "Bjarne", "Insa"];
  const NPC_LAST = ["Wolkenfuß", "Eisenhand", "Sturmauge", "Kesselbauch", "Möwenschreck", "Bartfuchs", "Donnerstimme",
    "Schiefnase", "Ohnefurcht", "Glückspilz", "Flusenbart", "Krummhorn", "Rostzahn", "Silberblick", "Funkenschlag",
    "Nebelherz", "Ankerwurf", "Kupferlocke", "Laternenträger", "Wellenreiter", "Hagelfaust", "Zwiebelmut", "Seemannsgarn", "Kielholer"];

  const POTIONS = [
    { id: "baerenkraft", name: "Bärenkraft-Elixier", desc: "+15 % auf deinen Hauptwert für 30 Minuten.", eff: { main: 0.15 }, mins: 30, cost: { goldMult: 2.2 } },
    { id: "eisenhaut", name: "Eisenhaut-Tinktur", desc: "+20 % Konstitution für 30 Minuten.", eff: { konstitution: 0.2 }, mins: 30, cost: { goldMult: 1.8 } },
    { id: "glueckspilztee", name: "Glückspilz-Tee", desc: "+30 % Glück für 30 Minuten.", eff: { glueck: 0.3 }, mins: 30, cost: { goldMult: 1.2 } },
    { id: "sternenstaub", name: "Sternenstaub-Trunk", desc: "+20 % auf alle Werte für 60 Minuten.", eff: { all: 0.2 }, mins: 60, cost: { perlen: 3 } },
  ];

  const MOUNTS = [
    { id: "esel", name: "Wolkenesel", desc: "Gemütlich, aber zuverlässig. Frisst ausschließlich Wolken.", cut: 0.1, cost: { gold: 300 } },
    { id: "ziege", name: "Flugziege", desc: "Springt von Insel zu Insel. Meckert dabei ununterbrochen.", cut: 0.2, cost: { gold: 3000 } },
    { id: "greif", name: "Bernsteingreif", desc: "Stolz, schnell und eitel. Will täglich gelobt werden.", cut: 0.3, cost: { perlen: 20 } },
    { id: "wal", name: "Himmelswal-Kalb", desc: "Ein junger Himmelswal. Gleitet lautlos durch jede Wolkenbank.", cut: 0.45, cost: { perlen: 50 } },
  ];

  const ACHIEVEMENTS = [
    { id: "ersterSieg", name: "Erste Schramme", desc: "Gewinne deinen ersten Kampf.", perlen: 1 },
    { id: "quest10", name: "Fleißige Hände", desc: "Schließe 10 Aufträge ab.", perlen: 2 },
    { id: "quest50", name: "Die halbe Insel kennt dich", desc: "Schließe 50 Aufträge ab.", perlen: 4 },
    { id: "quest150", name: "Auftragslegende", desc: "Schließe 150 Aufträge ab.", perlen: 8 },
    { id: "stufe10", name: "Zweistellig", desc: "Erreiche Stufe 10.", perlen: 3 },
    { id: "stufe25", name: "Wolkenveteran", desc: "Erreiche Stufe 25.", perlen: 6 },
    { id: "stufe40", name: "Lebende Legende", desc: "Erreiche Stufe 40.", perlen: 10 },
    { id: "arena10", name: "Publikumsliebling", desc: "Gewinne 10 Arenakämpfe.", perlen: 3 },
    { id: "arenaTop10", name: "Ganz oben", desc: "Erreiche Platz 10 in der Ruhmeshalle.", perlen: 8 },
    { id: "boss1", name: "Ab in die Tiefe", desc: "Besiege deinen ersten Dungeon-Boss.", perlen: 2 },
    { id: "dungeon1", name: "Grottenolm", desc: "Schließe einen ganzen Dungeon ab.", perlen: 5 },
    { id: "episch", name: "Lila Leuchten", desc: "Finde einen epischen Gegenstand.", perlen: 2 },
    { id: "legendaer", name: "Goldener Schimmer", desc: "Finde einen legendären Gegenstand.", perlen: 5 },
    { id: "bestiarium12", name: "Naturkundler", desc: "Entdecke 12 Wesen im Bestiarium.", perlen: 4 },
    { id: "wache8", name: "Nachtschicht", desc: "Leiste 8 Schichten am Stück am Leuchtturm.", perlen: 2 },
    { id: "reittier", name: "Eigene Flügel", desc: "Kaufe dein erstes Reittier.", perlen: 1 },
  ];

  const WELL_PRIZES = [
    { id: "gold", w: 34, label: "Ein Beutel Gold" },
    { id: "goldGross", w: 10, label: "Ein großer Goldschatz" },
    { id: "perle", w: 14, label: "Eine Wolkenperle" },
    { id: "perlen3", w: 3, label: "Drei Wolkenperlen" },
    { id: "tatendrang", w: 15, label: "Ein Krug Wolkenbräu (+30 Tatendrang)" },
    { id: "xp", w: 14, label: "Ein Geistesblitz (Erfahrung)" },
    { id: "item", w: 8, label: "Ein Gegenstand aus der Tiefe" },
    { id: "trank", w: 2, label: "Ein Sternenstaub-Trunk" },
  ];

  const NPCS = {
    ottilie: { name: "Käpt'n Ottilie", role: "Hafenmeisterin" },
    hulda: { name: "Hulda Humpenhold", role: "Wirtin der Schiefen Möwe" },
    brumm: { name: "Brumm Eisenbart", role: "Schmied" },
    zinnober: { name: "Madame Zinnober", role: "Händlerin für Kuriositäten" },
    funzel: { name: "Funzel", role: "Leuchtturmwärter" },
    krawall: { name: "Baronin Krawall", role: "Arenameisterin" },
    hufnagel: { name: "Henrietta Hufnagel", role: "Stallmeisterin" },
  };

  const BUILDINGS = [
    { id: "taverne", name: "Zur Schiefen Möwe", short: "Taverne", npc: "hulda" },
    { id: "schmiede", name: "Brumms Amboss", short: "Schmiede", npc: "brumm" },
    { id: "arkanum", name: "Zinnobers Kuriositäten", short: "Kuriositäten", npc: "zinnober" },
    { id: "arena", name: "Wolkenarena", short: "Arena", npc: "krawall" },
    { id: "leuchtturm", name: "Der Leuchtturm", short: "Wache", npc: "funzel" },
    { id: "tiefen", name: "Das Tor zur Tiefe", short: "Dungeons" },
    { id: "stall", name: "Greifenstall", short: "Stall", npc: "hufnagel" },
    { id: "ruhmeshalle", name: "Ruhmeshalle", short: "Ruhm" },
    { id: "brunnen", name: "Wunschbrunnen", short: "Brunnen" },
    { id: "heim", name: "Dein Quartier", short: "Held" },
  ];

  SB.data = {
    ATTRS, ATTR_INFO, RACES, CLASSES, SLOTS, SLOT_INFO, BASES, RARITIES, RARITY_ORDER, ADJ, SUFFIX,
    MONSTER_TYPES, ARCH_TYPE, MONSTERS, DUNGEONS, PLACES, PERSONS, QUESTS, NPC_FIRST, NPC_LAST,
    POTIONS, MOUNTS, ACHIEVEMENTS, WELL_PRIZES, NPCS, BUILDINGS,
  };
})();
