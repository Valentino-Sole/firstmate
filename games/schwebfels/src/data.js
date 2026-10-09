/* Helden von Schwebfels - Spieldaten (Version 2: drei Reiche).
   Alle Namen, Texte und Werte sind eigens fuer dieses Spiel geschrieben.
   Albion, Midgard und Hibernia sind historische bzw. mythologische Namen. */
(function () {
  "use strict";
  const SB = (globalThis.SB = globalThis.SB || {});

  const ATTRS = ["kraft", "geschick", "verstand", "konstitution", "glueck"];
  const ATTR_INFO = {
    kraft: { name: "Kraft", short: "KRA", desc: "Hauptwert der Krieger. Erhöht ihren Schaden und schwächt Kraftangriffe gegen dich." },
    geschick: { name: "Geschick", short: "GES", desc: "Hauptwert von Schurken und Jägern. Erhöht ihren Schaden und schwächt Geschick-Angriffe gegen dich." },
    verstand: { name: "Verstand", short: "VER", desc: "Hauptwert der Magier. Erhöht ihren Zauberschaden und schwächt Zauber gegen dich." },
    konstitution: { name: "Konstitution", short: "KON", desc: "Bestimmt deine Lebenspunkte." },
    glueck: { name: "Glück", short: "GLÜ", desc: "Erhöht die Chance auf kritische Treffer und verbessert die Beute." },
  };

  const LORE =
    "Vor tausend Jahren zerbrach der Weltstein. Seine Splitter tragen bis heute drei Reiche durch das Nebelmeer, und die Welt der schwebenden Inseln heißt seitdem Schwebfels. Jedes Reich hat seine Heimatinsel: das ritterliche Albion die Burginsel Kreidenfels, das frostige Midgard das Schneeland Hrimholm, das verwunschene Hibernia den Feenhain Glenfeyn. Nur im Ring der Reiche treffen sie offen aufeinander. Doch die Splitter werden schwächer, und aus der Tiefe darunter kriecht etwas herauf.";

  const REALMS = {
    albion: {
      name: "Albion", color: "#b8322e", dark: "#5a1414", accent: "#e8c35a", metal: "#c9ccd2", trim: "#d9a441",
      motto: "Durch Eid und Eisen", isle: "Kreidenfels",
      desc: "Das Königreich der Kreideklippen. Ritterorden, Klöster und alte Steinkreise, unter denen ein König schläft.",
    },
    midgard: {
      name: "Midgard", color: "#2f5fa8", dark: "#14284a", accent: "#cfe3ff", metal: "#aab6c4", trim: "#9fc3e8",
      motto: "Kälte formt Helden", isle: "Hrimholm",
      desc: "Die Frostlande des Nordens. Langhäuser, Runensteine und Götter, die seit drei Wintern schweigen.",
    },
    hibernia: {
      name: "Hibernia", color: "#2f8f4f", dark: "#123a22", accent: "#9fffc8", metal: "#b9c4a8", trim: "#c9b066",
      motto: "Der Hain vergisst nicht", isle: "Glenfeyn",
      desc: "Das Nebelland im Westen. Uralte Wälder, Feenhügel und Hügelgräber, in denen das Alte Volk schläft.",
    },
  };

  const RACES = {
    albier: {
      name: "Albier", realm: "albion",
      desc: "Die Menschen der Kreideklippen. Zäh, stur und erstaunlich gut im Schlangestehen.",
      mods: { kraft: 1, geschick: 1, verstand: 1, konstitution: 0, glueck: 0 },
      skins: ["#e8b896", "#c99470", "#9a6646", "#6a4430"], hairs: ["#2b1d16", "#6b4423", "#c9a25a", "#a8432a", "#d8d2c4"],
      ears: "human", height: 1.0, width: 1.0, bulk: 1.0,
    },
    kreidezwerg: {
      name: "Kreidezwerg", realm: "albion",
      desc: "Klein, breit und aus demselben Stein wie die Klippen. Sie behaupten, die Klippen seien aus ihnen.",
      mods: { kraft: 2, geschick: -1, verstand: -1, konstitution: 3, glueck: 0 },
      skins: ["#d9ad8c", "#b98b6c", "#9a7a66", "#c4a582"], hairs: ["#5a3a22", "#9b3d24", "#2b2b2b", "#b8b0a2", "#d07a2d"],
      ears: "human", height: 0.8, width: 1.28, bulk: 1.25,
    },
    nordmann: {
      name: "Nordmann", realm: "midgard",
      desc: "Groß gewachsen im ewigen Winter. Lachen laut, kämpfen lauter und frieren nie zu.",
      mods: { kraft: 2, geschick: 0, verstand: -1, konstitution: 2, glueck: -1 },
      skins: ["#f0c8a8", "#dcae8c", "#c49272", "#e8d0bc"], hairs: ["#e3c27a", "#c9822f", "#8a3a1e", "#efe6d2", "#3a2a1e"],
      ears: "human", height: 1.06, width: 1.12, bulk: 1.1,
    },
    trollblut: {
      name: "Trollblut", realm: "midgard",
      desc: "Gehörnte Riesen mit Hauern und Trollblut in den Adern. Höflicher, als sie aussehen. Meistens.",
      mods: { kraft: 3, geschick: -1, verstand: -2, konstitution: 2, glueck: 0 },
      skins: ["#7a8a9a", "#5f7a6a", "#8a6a8a", "#6a7f9a"], hairs: ["#1f1f24", "#3a2a2a", "#d9d2c5", "#2f4f6f", "#5a3a2a"],
      ears: "long", horns: true, tusks: true, height: 1.12, width: 1.25, bulk: 1.3,
    },
    frostwicht: {
      name: "Frostwicht", realm: "midgard",
      desc: "Flinke Wichte aus dem ewigen Eis, mit Reif an den Ohrspitzen. Kalte Hände, noch kältere Witze.",
      mods: { kraft: -1, geschick: 3, verstand: 1, konstitution: -1, glueck: 0 },
      skins: ["#dfe9f2", "#c8dbea", "#b9cfe3", "#e8eef4"], hairs: ["#f4f7fa", "#cfe3f2", "#a9c4dc", "#e6e6ef", "#7f9ab5"],
      ears: "elf", height: 0.88, width: 0.9, bulk: 0.85,
    },
    glutzwerg: {
      name: "Glutzwerg", realm: "midgard",
      desc: "Breite Zwerge aus den Glutschmieden unter dem Gletscher. Ihre Runen glimmen, manchmal raucht auch der Bart.",
      mods: { kraft: 2, geschick: -2, verstand: 1, konstitution: 2, glueck: -1 },
      skins: ["#6b4430", "#5a3626", "#7a5038", "#4e2f22"], hairs: ["#c2461e", "#d9662a", "#9b3418", "#e08a3a", "#3a2a22"],
      ears: "human", height: 0.76, width: 1.3, bulk: 1.3,
    },
    sidhe: {
      name: "Sidhe", realm: "hibernia",
      desc: "Das Alte Volk der Feenhügel. Schlank, alterslos und mit Augen, die zu viel gesehen haben.",
      mods: { kraft: -1, geschick: 2, verstand: 2, konstitution: -1, glueck: 0 },
      skins: ["#eadfd6", "#d6cfe6", "#c8d8e0", "#e6dccc"], hairs: ["#f2f2f2", "#1a1a2a", "#9fb7d9", "#c7a6e0", "#2a5a3a"],
      ears: "elf", height: 1.06, width: 0.88, bulk: 0.85,
    },
    moorling: {
      name: "Moorling", realm: "hibernia",
      desc: "Kleines Waldvolk aus den Mooren. Moos im Haar, Glück im Blut, Frösche in den Taschen.",
      mods: { kraft: -2, geschick: 1, verstand: 1, konstitution: 0, glueck: 3 },
      skins: ["#a9b98f", "#8aa07a", "#b5a88a", "#7f9a7a"], hairs: ["#4f6a3c", "#6a7a3a", "#2f4b35", "#8a6a3a", "#3a3a2a"],
      ears: "leaf", height: 0.76, width: 0.95, bulk: 0.9,
    },
  };

  const TATTOOS = [
    { id: "keine", name: "Keine" },
    { id: "runen", name: "Runen" },
    { id: "knoten", name: "Knotenwerk" },
    { id: "kriegsbemalung", name: "Kriegsbemalung" },
    { id: "linien", name: "Stammeslinien" },
    { id: "mond", name: "Mondsichel" },
    { id: "dornen", name: "Dornenranken" },
  ];
  const TATTOO_COLORS = [
    { c: "#2f5fd0", name: "Waidblau" },
    { c: "#a82424", name: "Blutrot" },
    { c: "#16141c", name: "Ruß" },
    { c: "#e8e2d6", name: "Kreide" },
    { c: "#4fffb0", name: "Feenlicht", glow: true },
    { c: "#ffcf5a", name: "Sonnengold", glow: true },
    { c: "#b48cff", name: "Nebelviolett", glow: true },
  ];
  const SCARS = [
    { id: "keine", name: "Keine" },
    { id: "auge", name: "Über dem Auge" },
    { id: "wange", name: "Wange" },
    { id: "kreuz", name: "Gekreuzt" },
  ];
  const EYES = [
    { c: "#3a2a1e", name: "Braun" },
    { c: "#3f6fa8", name: "Blau" },
    { c: "#4f7a3a", name: "Grün" },
    { c: "#7a7f86", name: "Grau" },
    { c: "#9fe3ff", name: "Frostglühen", glow: true },
    { c: "#ffb13b", name: "Glutglühen", glow: true },
    { c: "#7fffb0", name: "Feenglühen", glow: true },
  ];
  const HAIR_STYLES = ["Kurz", "Zöpfe", "Lang", "Kamm", "Glatze", "Knoten"];
  const BEARDS = ["Keiner", "Kinnbart", "Vollbart", "Geflochten", "Schnauzer"];

  /* Vier Grundarten. Gegenstaende gelten fuer die Grundart, nicht fuer das Reich. */
  const ARCHETYPES = {
    krieger: {
      name: "Krieger", main: "kraft",
      hpMult: 4.5, armorCap: 45, block: 0.2, evade: 0, unblockable: false, dmgMult: 1.0,
      material: "platte", weapons: ["schwert", "axt", "hammer"], offhand: "schild", helm: "helm", chest: "harnisch",
      role: "Schwer gepanzert, blockt mit dem Schild jeden fünften Angriff, viele Lebenspunkte.",
    },
    schurke: {
      name: "Schurke", main: "geschick",
      hpMult: 3.75, armorCap: 30, block: 0, evade: 0.2, unblockable: false, dmgMult: 1.3,
      firstStrike: true, critBonus: 0.08, critMult: 2.3,
      material: "leder", weapons: ["dolch", "sichel", "kurzschwert"], offhand: "wurfmesser", helm: "maske", chest: "schattenwams",
      role: "Schlägt immer zuerst zu, trifft öfter kritisch und härter, weicht jedem fünften Angriff aus.",
    },
    jaeger: {
      name: "Jäger", main: "geschick",
      hpMult: 3.8, armorCap: 30, block: 0, evade: 0.3, unblockable: false, dmgMult: 1.42,
      material: "leder", weapons: ["bogen", "armbrust", "speer"], offhand: "koecher", helm: "kappe", chest: "wams",
      role: "Kämpft aus der Distanz und weicht fast jedem dritten Angriff aus.",
    },
    magier: {
      name: "Magier", main: "verstand",
      hpMult: 3.3, armorCap: 15, block: 0, evade: 0, unblockable: true, dmgMult: 1.8,
      material: "stoff", weapons: ["stab", "zepter", "runenstab"], offhand: "fokus", helm: "hut", chest: "robe",
      role: "Zaubern kann niemand ausweichen, Schilde fangen sie nur selten ab. Hoher Schaden, wenig Lebenspunkte.",
    },
  };

  /* Zwoelf Klassen: je Reich vier, aehnliche Grundart, eigene Faehigkeit und eigene Geschichte. */
  const CLASS_DEFS = {
    schildritter: {
      realm: "albion", arch: "krieger", name: "Schildritter",
      special: { id: "schildbrecher", name: "Schildbrecher", desc: "Wuchtiger Schildstoß (150 %), der nicht abgewehrt werden kann und den Gegner einen Zug betäubt." },
      prolog: "Du hast deinen Eid vor dem Kreidekreis geleistet: Niemand, der hinter deinem Schild steht, fällt, solange du stehst. Bisher hat das niemand überprüft. Auf Schwebfels wird sich das ändern.",
      story: [
        { lv: 8, t: "Die Prüfung des Schildes", x: "Der Ordensmeister schickt dir seinen besten Prüfer. Leider ist der Prüfer seit zweihundert Jahren tot und steckt noch in seiner Rüstung.", foes: [{ name: "Die Leere Rüstung", arch: "todesritter", color: "#7f8a96", accent: "#9fe3ff" }] },
        { lv: 15, t: "Der gebrochene Eid", x: "Ein Bruder deines Ordens hat seinen Eid gebrochen und dient nun der Tiefe. Auf seinem Schild prangt noch immer dein Wappen.", foes: [{ name: "Knappe der Tiefe", arch: "ghul", color: "#d9cfb8", accent: "#c0392b" }, { name: "Ser Galvan der Gefallene", arch: "todesritter", color: "#3a2a2a", accent: "#ff5a3d", boss: true }] },
        { lv: 30, t: "Der Schild des Reiches", x: "Man nennt dich jetzt den Schild Albions. Das ist eine große Ehre und eine noch größere Zielscheibe. Unter den Klippen erwacht etwas, das es persönlich nimmt.", foes: [{ name: "Der Wurm unter den Klippen", arch: "drache", color: "#e8e2d6", accent: "#c0392b", boss: true, final: true }] },
      ],
    },
    meuchler: {
      realm: "albion", arch: "schurke", name: "Meuchler",
      special: { id: "kehlschnitt", name: "Kehlschnitt", desc: "Ein sicherer Stich mit 160 % Schaden und stark erhöhter Chance auf einen kritischen Treffer." },
      prolog: "Offiziell gibt es in Albion keine Meuchler. Inoffiziell bist du der Grund, warum sich einige Barone nachts zweimal umdrehen. Die Krone hat einen Auftrag auf Schwebfels, über den niemand spricht.",
      story: [
        { lv: 8, t: "Der Schattenmarkt", x: "Unter Kreidefurt handelt jemand mit gestohlenen Namen. Du sollst herausfinden, wer, und ihm seinen eigenen abnehmen.", foes: [{ name: "Der Namenlose Händler", arch: "kultist", color: "#3a3346", accent: "#ffcf5a" }] },
        { lv: 15, t: "Der Dolch der Königin", x: "Ein Dolch, der einst eine Königin tötete, ist wieder aufgetaucht. Er sucht sich seinen Träger selbst aus, und zwar ohne zu fragen.", foes: [{ name: "Klingengeist", arch: "schemen", color: "#9fb7d9", accent: "#c8ced6" }, { name: "Der Dolchträger", arch: "kultist", color: "#5a1414", accent: "#ff5a3d", boss: true }] },
        { lv: 30, t: "Niemandes Held", x: "Wenn du alles richtig machst, wird nie jemand erfahren, dass du Albion gerettet hast. Der Schattenkanzler weiß es. Noch.", foes: [{ name: "Der Schattenkanzler", arch: "kultist", color: "#1a1622", accent: "#c47bff", boss: true, final: true }] },
      ],
    },
    langbogner: {
      realm: "albion", arch: "jaeger", name: "Langbogner",
      special: { id: "pfeilhagel", name: "Pfeilhagel", desc: "Drei Pfeile in schneller Folge mit je 70 % Schaden." },
      prolog: "In deinem Dorf lernt man zuerst den Bogen und dann das Laufen. Du hast beides gut gelernt, das Laufen fast noch besser. Jetzt sollst du für Albion treffen.",
      story: [
        { lv: 8, t: "Der weiße Hirsch", x: "Ein weißer Hirsch erscheint nur Schützen, die ihn verdienen. Er führt dich zu der Bestie, die ihn seit Wochen jagt.", foes: [{ name: "Blasszahn", arch: "wolf", color: "#e9e0c8", accent: "#c0392b" }] },
        { lv: 15, t: "Der Pfeil, der nicht zurückkam", x: "Dein Lehrmeister verschwand mit seinem letzten Pfeil im Nebel. Den Pfeil hast du wiedergefunden. Er steckt in etwas sehr Großem.", foes: [{ name: "Moorschleicher", arch: "schlund", color: "#4a5a2a", accent: "#d9f27a" }, { name: "Der Pfeilfresser", arch: "troll", color: "#5f7a6a", accent: "#ffcf5a", boss: true }] },
        { lv: 30, t: "Ein Schuss für das Reich", x: "Man sagt, ein einziger Pfeil könne eine Schlacht entscheiden. Heute wirst du es herausfinden.", foes: [{ name: "Die Himmelsbestie", arch: "fledermaus", color: "#2f2a3a", accent: "#ff7a3d", boss: true, final: true }] },
      ],
    },
    lichtweber: {
      realm: "albion", arch: "magier", name: "Lichtweber",
      special: { id: "sonnenlanze", name: "Sonnenlanze", desc: "Lanze aus Licht (180 %), die Rüstung durchdringt und dich um 8 % deiner Lebenspunkte heilt." },
      prolog: "Im Kloster von Kreidefurt hast du gelernt, Sonnenlicht zu Fäden zu spinnen. Die Äbtissin meinte, du übertreibst. Die Tiefe wird das bald auch finden.",
      story: [
        { lv: 8, t: "Die dunkle Bibliothek", x: "In der Klosterbibliothek ist ein Buch erwacht. Es liest jetzt die Mönche, nicht umgekehrt.", foes: [{ name: "Das Lesende Buch", arch: "schemen", color: "#c9b89a", accent: "#ffcf5a" }] },
        { lv: 15, t: "Licht gegen Licht", x: "Ein Bruder hat entdeckt, dass Licht auch brennen kann, und hat Gefallen daran gefunden.", foes: [{ name: "Glutkultist", arch: "kultist", color: "#5a1414", accent: "#ff7a3d" }, { name: "Bruder Glutauge", arch: "kultist", color: "#c9a441", accent: "#ff5a1a", boss: true }] },
        { lv: 30, t: "Die zweite Sonne", x: "Um den Riss im Splitter zu schließen, brauchst du mehr Licht, als ein Mensch tragen kann. Etwas aus der Leere will genau das verhindern.", foes: [{ name: "Der Leerenschemen", arch: "schemen", color: "#1f1b2e", accent: "#c47bff", boss: true, final: true }] },
      ],
    },
    sturmhuene: {
      realm: "midgard", arch: "krieger", name: "Sturmhüne",
      special: { id: "blutrausch", name: "Blutrausch", desc: "Unaufhaltsamer Hieb (240 %), der unter halben Lebenspunkten sogar 360 % erreicht." },
      prolog: "Du bist größer als die Tür deines Langhauses, und die Tür ist schon groß. In Midgard sagt man: Wer im Sturm geboren wird, fürchtet keinen Wind. Du fürchtest höchstens leere Metfässer.",
      story: [
        { lv: 8, t: "Der Bär, der keiner war", x: "Der Brauch verlangt, dass ein Hüne einmal im Leben einen Bären niederringt. Dein Bär stellte sich als verfluchter Troll heraus. Brauch ist Brauch.", foes: [{ name: "Der Fluchbär", arch: "troll", color: "#5a4a3a", accent: "#9fe3ff" }] },
        { lv: 15, t: "Der Hammer im Eis", x: "Im Gletscher steckt seit Jahrhunderten ein Hammer. Wer ihn herauszieht, muss es mit dem aufnehmen, der ihn hineingesteckt hat.", foes: [{ name: "Eiswächter", arch: "golem", color: "#bfe8ff", accent: "#4fa9ff" }, { name: "Frostriese Hrimkald", arch: "golem", color: "#dfe9f2", accent: "#2f5fa8", boss: true }] },
        { lv: 30, t: "Gegen den Sturm", x: "Die Skalden sagen, irgendwann kämpft jeder Sturmhüne gegen den Sturm selbst. Heute ist irgendwann.", foes: [{ name: "Der Sturmwurm", arch: "drache", color: "#2f3f9f", accent: "#9fe3ff", boss: true, final: true }] },
      ],
    },
    nebelschleicher: {
      realm: "midgard", arch: "schurke", name: "Nebelschleicher",
      special: { id: "giftklinge", name: "Giftklinge", desc: "Zwei schnelle Schnitte mit je 85 % Schaden, die den Gegner drei Züge lang vergiften." },
      prolog: "Im Norden gibt es keinen Nebel, sagen die Jarle. Du lässt sie gern in dem Glauben. Es ist praktischer so.",
      story: [
        { lv: 8, t: "Das gestohlene Horn", x: "Jemand hat das Trinkhorn eines Jarls gestohlen. Der Jarl will es zurück, du willst wissen, wer es gewagt hat, ohne dich zu fragen.", foes: [{ name: "Hehlerkönig Skarn", arch: "goblin", color: "#5d5d66", accent: "#e0b04a" }] },
        { lv: 15, t: "Gift für einen Gott", x: "Jemand will einen der schweigenden Götter vergiften. Du findest, das ist dein Fachgebiet und keiner sollte dir dabei reinpfuschen.", foes: [{ name: "Runenfresser", arch: "kultist", color: "#2f4f6f", accent: "#7fffb0" }, { name: "Der Giftmischer", arch: "kultist", color: "#1a2a1a", accent: "#4fffb0", boss: true }] },
        { lv: 30, t: "Der unsichtbare Krieg", x: "Den größten Krieg Midgards führt niemand mit Schwertern. Er findet in der Dunkelheit statt, und du bist das Dunkelste darin.", foes: [{ name: "Nachtschlund", arch: "wolf", color: "#1f1b2e", accent: "#c47bff", boss: true, final: true }] },
      ],
    },
    wolfsjaeger: {
      realm: "midgard", arch: "jaeger", name: "Wolfsjäger",
      special: { id: "frostpfeil", name: "Frostpfeil", desc: "Eisiger Pfeil mit 170 % Schaden, der den Gegner mit 50 % Chance einfriert." },
      prolog: "Dein Rudel besteht aus dir, einem Bogen und einem Wolf, der dich irgendwann adoptiert hat. Der Wolf ist der klügere von euch beiden, aber du kannst Feuer machen.",
      story: [
        { lv: 8, t: "Die Fährte im Schnee", x: "Ein Rudel Grauwölfe reißt die Herden von Frostfurt. Dein Wolf weigert sich mitzukommen. Das ist ein schlechtes Zeichen.", foes: [{ name: "Grauwolf", arch: "wolf", color: "#8a8a8a", accent: "#ffcf5a" }, { name: "Grauwolf-Alpha", arch: "wolf", color: "#5a5a5a", accent: "#ff5a3d", boss: true }] },
        { lv: 15, t: "Der Jäger wird gejagt", x: "Etwas folgt deiner Spur. Es hat acht Beine, und es ist schneller als dein Wolf.", foes: [{ name: "Die Eisspinne", arch: "spinne", color: "#a8e6ff", accent: "#ffffff", boss: true }] },
        { lv: 30, t: "Der Wolf am Ende der Welt", x: "In den Liedern frisst ein Wolf am Ende der Welt die Sonne. Die Lieder hatten recht, nur das Datum stimmte nicht.", foes: [{ name: "Fenrak, der Weltwolf", arch: "wolf", color: "#2a2633", accent: "#9fe3ff", boss: true, final: true }] },
      ],
    },
    runenwirker: {
      realm: "midgard", arch: "magier", name: "Runenwirker",
      special: { id: "runensturm", name: "Runensturm", desc: "Drei Runen schlagen nacheinander ein, je 90 % Schaden, und keine lässt sich abwehren." },
      prolog: "Runen sind keine Buchstaben, sondern Versprechen. Du hast schon viele davon gegeben und manche sogar gehalten.",
      story: [
        { lv: 8, t: "Die fressende Rune", x: "Ein Runenstein bei Frostfurt hat angefangen, andere Runen zu fressen. Er wird dabei größer und hungriger.", foes: [{ name: "Der Runenfresser", arch: "golem", color: "#5a6a8f", accent: "#9fe3ff" }] },
        { lv: 15, t: "Das Gedicht der Seherin", x: "Die Seherin Ylva spricht nur noch in Versen, und jeder Vers ist ein Fluch. Irgendetwas spricht durch sie.", foes: [{ name: "Versgespenst", arch: "schemen", color: "#cfe0ff", accent: "#8f7cff" }, { name: "Seherin Ylva, besessen", arch: "kultist", color: "#2f5fa8", accent: "#cfe3ff", boss: true }] },
        { lv: 30, t: "Die letzte Rune", x: "Es gibt eine Rune, die nie geschrieben wurde. Wer sie schreibt, kann den Splitter heilen. Wer sie liest, verschwindet.", foes: [{ name: "Der Ungeschriebene", arch: "schemen", color: "#14121c", accent: "#9fe3ff", boss: true, final: true }] },
      ],
    },
    hainwaechter: {
      realm: "hibernia", arch: "krieger", name: "Hainwächter",
      special: { id: "lebenssaft", name: "Lebenssaft", desc: "Ein unaufhaltsamer Hieb mit 170 % Schaden, während dich der Hain um 10 % deiner Lebenspunkte heilt." },
      prolog: "Die Bäume des Hains haben dich großgezogen, nachdem dich der Fluss vor ihre Wurzeln gespült hat. Du sprichst ihre Sprache. Sie reden erstaunlich viel über das Wetter.",
      story: [
        { lv: 8, t: "Wurzelfäule", x: "Ein junger Hirte des Hains ist krank geworden. Er erkennt dich nicht mehr, und er schlägt um sich.", foes: [{ name: "Faulender Hirte", arch: "baum", color: "#5a4a2a", accent: "#d9f27a" }] },
        { lv: 15, t: "Das Silbergeweih", x: "Der Hirschkönig des Hains wurde von der Tiefe berührt. Seine Krone aus Silber ist schwarz geworden.", foes: [{ name: "Moderwolf", arch: "wolf", color: "#3a4a2a", accent: "#d9f27a" }, { name: "Der Schwarzgeweihte", arch: "baum", color: "#2a2a2a", accent: "#c0c8d0", boss: true }] },
        { lv: 30, t: "Der Hain steht", x: "Alles, was wächst, schaut heute auf dich. Der Moderkönig kommt, um den ältesten Baum zu fällen.", foes: [{ name: "Der Moderkönig", arch: "baum", color: "#2f2a1f", accent: "#7fffb0", boss: true, final: true }] },
      ],
    },
    schattentaenzer: {
      realm: "hibernia", arch: "schurke", name: "Schattentänzer",
      special: { id: "schattentanz", name: "Schattentanz", desc: "Ein Wirbel mit 160 % Schaden, danach weichst du dem nächsten Angriff sicher aus." },
      prolog: "Das Alte Volk tanzt im Mondlicht. Du tanzt dazwischen, dort, wo kein Licht hinfällt. Auf Festen hat dir das wenig Freunde gemacht.",
      story: [
        { lv: 8, t: "Der Tanz der Irrlichter", x: "Im Irrlichtsumpf tanzen Lichter, die Wanderer in den Schlamm locken. Du findest, sie tanzen schlecht.", foes: [{ name: "Irrlichtschwarm", arch: "schemen", color: "#9effc8", accent: "#2a7a5a" }] },
        { lv: 15, t: "Die Klinge aus Mondsilber", x: "Ein Feenritter fordert dich zum Duell um eine Klinge aus Mondsilber. Er kämpft fair. Du eher nicht.", foes: [{ name: "Feenknappe", arch: "goblin", color: "#9fb7d9", accent: "#ffffff" }, { name: "Feenritter Aodh", arch: "todesritter", color: "#c8d8e0", accent: "#7fffb0", boss: true }] },
        { lv: 30, t: "Der letzte Tanz", x: "Die Nachtkönigin hat Hibernias Schatten gestohlen. Ohne Schatten kein Tanz, und ohne Tanz bist du nur jemand in dunkler Kleidung.", foes: [{ name: "Die Nachtkönigin", arch: "schemen", color: "#1a1622", accent: "#b48cff", boss: true, final: true }] },
      ],
    },
    mondschuetze: {
      realm: "hibernia", arch: "jaeger", name: "Mondschütze",
      special: { id: "mondpfeil", name: "Mondpfeil", desc: "Ein silberner Pfeil mit 200 % Schaden, der jede Rüstung durchschlägt." },
      prolog: "Du hast nachts schießen gelernt, weil tagsüber die Druiden zusahen. Inzwischen triffst du sogar Dinge, die sich hinter dem Mond verstecken.",
      story: [
        { lv: 8, t: "Pfeile aus Mondlicht", x: "Eine Riesenfledermaus jagt die Mondfalter des Hains. Ohne Falter keine Mondpfeile, ohne Mondpfeile keine Mondschützen.", foes: [{ name: "Die Falterfresserin", arch: "fledermaus", color: "#2f3a5a", accent: "#8ff0ff" }] },
        { lv: 15, t: "Der rote Mond", x: "Seit sieben Nächten ist der Mond rot. Die Priesterinnen sagen, jemand trinke ihn. Klingt absurd, bis du den Schemen am Mondsee siehst.", foes: [{ name: "Mondtrinker", arch: "schemen", color: "#ff9a8a", accent: "#ff5a5a" }, { name: "Der Blutmondschemen", arch: "schemen", color: "#5a1414", accent: "#ff3a3a", boss: true }] },
        { lv: 30, t: "Den Mond zurückholen", x: "Der Mondfresser hat den halben Mond verschlungen. Du hast einen Bogen, einen Pfeil und eine sehr schlechte Idee.", foes: [{ name: "Der Mondfresser", arch: "drache", color: "#1f1b2e", accent: "#e9f6ff", boss: true, final: true }] },
      ],
    },
    dornenrufer: {
      realm: "hibernia", arch: "magier", name: "Dornenrufer",
      special: { id: "wurzelgriff", name: "Wurzelgriff", desc: "Dornige Wurzeln (150 %) brechen aus dem Boden, lassen sich nicht abwehren und halten den Gegner einen Zug fest." },
      prolog: "Wo du gehst, wächst etwas. Meistens Blumen. Wenn du schlechte Laune hast, Dornen. Die Druiden haben dir dringend zu guter Laune geraten.",
      story: [
        { lv: 8, t: "Der Garten der Stille", x: "Im Garten der Druiden wächst ein Pilz, der jedes Geräusch frisst. Die Druiden können nicht einmal mehr um Hilfe rufen.", foes: [{ name: "Stillsporling", arch: "pilz", color: "#8f5fb8", accent: "#d9f27a" }] },
        { lv: 15, t: "Der Dorn im Herzen", x: "Ein Dornenhirte hat sich gegen die Druiden gewandt. Seine Dornen wachsen durch Stein und durch Erinnerungen.", foes: [{ name: "Dornensaat", arch: "pilz", color: "#5c8f2f", accent: "#e6ff5a" }, { name: "Der Dornenhirte", arch: "baum", color: "#3a2f1f", accent: "#c0392b", boss: true }] },
        { lv: 30, t: "Neues Wachstum", x: "Um den letzten Hain zu retten, musst du etwas Uraltes zu Kompost verarbeiten. Es ist nicht einverstanden.", foes: [{ name: "Uralter Moderhirte", arch: "baum", color: "#2a2416", accent: "#9fffc8", boss: true, final: true }] },
      ],
    },
  };
  const CLASSES = {};
  for (const id in CLASS_DEFS) {
    const c = CLASS_DEFS[id];
    CLASSES[id] = Object.assign({ id }, ARCHETYPES[c.arch], c, { archName: ARCHETYPES[c.arch].name, desc: ARCHETYPES[c.arch].role });
  }

  /* Reichsgeschichte: fuenf Hauptkapitel je Reich */
  const REALM_STORY = {
    albion: [
      { lv: 1, t: "Der Eid am Kreidekreis", x: "Albion schickt dich nach Kreidenfels, um die Pilgerwege zu bewachen. Kaum betrittst du die Insel, kriechen Grabkriecher aus dem Nebel und fallen über die Pilger her. Zeig der Insel, was ein Eid Albions wert ist.", foes: [{ mon: "grabkriecher" }, { mon: "grabkriecher" }] },
      { lv: 6, t: "Die Glocke ohne Kirche", x: "Nachts läutet über Kreidefurt eine Glocke, die es nicht mehr gibt. Wer ihr folgt, kehrt nicht zurück. Der Abt bittet dich, dem Geläut zu folgen, bevor er es selbst tut.", foes: [{ mon: "hohlkultist" }, { mon: "knochenlaeufer" }, { name: "Der Glöckner ohne Gesicht", arch: "schemen", color: "#cfd8e6", accent: "#ffcf5a", boss: true }] },
      { lv: 12, t: "Das Schwert im Moor", x: "Ein Bauer fand im Eschenmoor ein Schwert, das leuchtet, sobald Midgarder in der Nähe sind. Jetzt wollen es alle haben. Leider will es auch das Moor zurück.", foes: [{ mon: "faulschlund" }, { mon: "sumpftroll" }, { name: "Moorkönig Gramwasser", arch: "troll", color: "#3a4a2a", accent: "#d9f27a", boss: true }] },
      { lv: 18, t: "Der schlafende König", x: "Unter dem Steinkreis schläft ein König, der wiederkehren soll, wenn Albion ihn braucht. Jemand versucht, ihn vor der Zeit zu wecken, mit sehr verbotenen Mitteln.", foes: [{ mon: "blutkultist" }, { mon: "blutkultist" }, { name: "Morgauth die Weckerin", arch: "kultist", color: "#3a1422", accent: "#ff3a5a", boss: true }] },
      { lv: 25, t: "Wenn der Splitter bricht", x: "Der Splitter, der Albion trägt, bekommt Risse. Aus ihnen steigt die Tiefe selbst empor, hungrig und alt. Du stehst an der Kante, und hinter dir liegt alles, was du geschworen hast zu schützen.", foes: [{ mon: "grabritter" }, { mon: "knochenfuerst" }, { name: "Der Erste Riss", arch: "drache", color: "#1a1622", accent: "#ff5a3d", boss: true, final: true }] },
    ],
    midgard: [
      { lv: 1, t: "Kälte formt Helden", x: "Die Jarle schicken dich nach Schwebfels. Nicht als Wächter, sondern als Beweis, dass der Norden noch Zähne hat. Am Hafen warten bereits hungrige Wölfe auf diesen Beweis.", foes: [{ mon: "grauwolf" }, { mon: "grauwolf" }] },
      { lv: 6, t: "Das Schweigen der Götter", x: "Seit drei Wintern antworten die Götter nicht mehr. Die Seherin von Frostfurt glaubt, jemand habe ihre Runensteine gestohlen. Die Spur führt zu Kultisten, die Runen fressen. Wörtlich.", foes: [{ mon: "hohlkultist" }, { mon: "aasflatterer" }, { name: "Der Steinkauer", arch: "kultist", color: "#2f4f6f", accent: "#9fe3ff", boss: true }] },
      { lv: 12, t: "Die Trolle der Wolfsklamm", x: "In der Wolfsklamm haben Trolle eine Brücke gebaut und verlangen Zoll: einen Helden pro Woche. Die Klamm hat beschlossen, dass du diese Woche dran bist.", foes: [{ mon: "sumpftroll" }, { mon: "netzlauerer" }, { name: "Brückenvogt Knorr", arch: "troll", color: "#6a7f9a", accent: "#ffcf5a", boss: true }] },
      { lv: 18, t: "Das Horn der Letzten Wacht", x: "Wer das Horn der Letzten Wacht bläst, ruft alle Gefallenen Midgards zu einer letzten Schlacht. Es liegt im Eis des Sturmkaps, bewacht von etwas, das nicht friert.", foes: [{ mon: "frostwolf" }, { mon: "kristallweberin" }, { name: "Die Eiswache", arch: "golem", color: "#cfe8ff", accent: "#4fa9ff", boss: true }] },
      { lv: 25, t: "Ragnafrost", x: "Der Splitter Midgards vereist von innen. In seinem Herzen erwacht ein Wurm aus der Tiefe, älter als die Götter. Die Skalden werden davon singen, so oder so.", foes: [{ mon: "bergtroll" }, { mon: "eisengolem" }, { name: "Der Wurm im Eis", arch: "drache", color: "#bfe8ff", accent: "#2f5fa8", boss: true, final: true }] },
    ],
    hibernia: [
      { lv: 1, t: "Der Hain vergisst nicht", x: "Die Druiden schicken dich nach Schwebfels, weil die Bäume unruhig sind. Bäume sind nie ohne Grund unruhig. Im Nebelhain wachsen Sporlinge, und sie wachsen viel zu schnell.", foes: [{ mon: "sporling" }, { mon: "sporling" }] },
      { lv: 6, t: "Der Ruf aus dem Hügelgrab", x: "Im Hügelgrab am Schwarzsee singt jemand Lieder, die seit tausend Jahren niemand mehr kennt. Das Alte Volk erwacht, und nicht alle davon sind freundlich.", foes: [{ mon: "knochenlaeufer" }, { mon: "netzlauerer" }, { name: "Die Sängerin im Hügel", arch: "schemen", color: "#cfe9ff", accent: "#7fffb0", boss: true }] },
      { lv: 12, t: "Dornenzeit", x: "Ein Hirte, einst Hüter des Dornentals, ist verderbt. Wo er geht, wachsen Dornen durch Stein. Die Druiden wollen ihn heilen. Du sollst ihn nur lange genug festhalten.", foes: [{ mon: "sporenschrecken" }, { mon: "knochenlaeufer" }, { name: "Hirte Dubhán", arch: "baum", color: "#3a2f1f", accent: "#ff7a3d", boss: true }] },
      { lv: 18, t: "Mondfinsternis", x: "Der Mond über Hibernia ist seit sieben Nächten rot. Die Mondpriesterinnen behaupten, jemand trinke ihn. Klingt absurd, bis du den Schemen am Mondsee siehst.", foes: [{ mon: "irrlichtschemen" }, { mon: "blutkultist" }, { name: "Der Rote Trinker", arch: "schemen", color: "#5a1414", accent: "#ff3a3a", boss: true }] },
      { lv: 25, t: "Der letzte Hain", x: "Der Splitter Hibernias verdorrt. Unter den Wurzeln des ältesten Baumes kriecht die Tiefe herauf. Wenn der letzte Hain fällt, vergisst Hibernia alles, auch dich.", foes: [{ mon: "moderhirte" }, { mon: "giftmorchel" }, { name: "Die Wurzel der Tiefe", arch: "baum", color: "#14121c", accent: "#c47bff", boss: true, final: true }] },
    ],
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

  // g = Genus fuer die Adjektivendung (m, f, n, pl); names = Varianten
  const BASES = {
    schwert: { slot: "waffe", arch: "krieger", g: "n", names: ["Langschwert", "Breitschwert", "Bastardschwert", "Runenschwert"] },
    axt: { slot: "waffe", arch: "krieger", g: "f", names: ["Streitaxt", "Bartaxt", "Doppelaxt", "Kriegsaxt"] },
    hammer: { slot: "waffe", arch: "krieger", g: "m", names: ["Streitkolben", "Kriegshammer", "Morgenstern", "Donnerhammer"] },
    dolch: { slot: "waffe", arch: "schurke", g: "n", names: ["Dolchpaar", "Klingenpaar", "Stilettpaar", "Giftzahnpaar"] },
    sichel: { slot: "waffe", arch: "schurke", g: "n", names: ["Sichelpaar", "Krummklingenpaar", "Mondsichelpaar"] },
    kurzschwert: { slot: "waffe", arch: "schurke", g: "n", names: ["Kurzschwertpaar", "Schattenklingenpaar", "Rabenklingenpaar"] },
    bogen: { slot: "waffe", arch: "jaeger", g: "m", ranged: true, names: ["Langbogen", "Kompositbogen", "Eibenbogen", "Hornbogen"] },
    armbrust: { slot: "waffe", arch: "jaeger", g: "f", ranged: true, names: ["Armbrust", "Windenarmbrust", "Repetierarmbrust"] },
    speer: { slot: "waffe", arch: "jaeger", g: "m", ranged: true, names: ["Wurfspeer", "Jagdspeer", "Runenspeer"] },
    stab: { slot: "waffe", arch: "magier", g: "m", ranged: true, names: ["Eichenstab", "Kristallstab", "Druidenstab", "Sternenstab"] },
    zepter: { slot: "waffe", arch: "magier", g: "n", ranged: true, names: ["Zepter", "Machtzepter", "Seelenzepter"] },
    runenstab: { slot: "waffe", arch: "magier", g: "m", ranged: true, names: ["Runenstab", "Knochenstab", "Weltenstab"] },
    schild: { slot: "nebenhand", arch: "krieger", g: "m", names: ["Turmschild", "Rundschild", "Wappenschild", "Drachenschild"] },
    wurfmesser: { slot: "nebenhand", arch: "schurke", g: "pl", names: ["Wurfmesser", "Wurfsterne", "Giftphiolen"] },
    koecher: { slot: "nebenhand", arch: "jaeger", g: "m", names: ["Köcher", "Pfeilköcher", "Federköcher"] },
    fokus: { slot: "nebenhand", arch: "magier", g: "m", names: ["Fokuskristall", "Seelenstein", "Zauberfolianten"] },
    helm: { slot: "helm", arch: "krieger", g: "m", names: ["Plattenhelm", "Hörnerhelm", "Flügelhelm", "Visierhelm"] },
    maske: { slot: "helm", arch: "schurke", g: "f", names: ["Schattenmaske", "Kapuzenmaske", "Rabenmaske"] },
    kappe: { slot: "helm", arch: "jaeger", g: "f", names: ["Jägerkapuze", "Federkappe", "Wolfskopfhaube"] },
    hut: { slot: "helm", arch: "magier", g: "f", names: ["Zauberkapuze", "Runenkrone", "Sternenhaube"] },
    harnisch: { slot: "ruestung", arch: "krieger", g: "m", names: ["Brustharnisch", "Plattenpanzer", "Schuppenpanzer", "Kriegsharnisch"] },
    schattenwams: { slot: "ruestung", arch: "schurke", g: "n", names: ["Schattenwams", "Nachtgewand", "Diebesleder"] },
    wams: { slot: "ruestung", arch: "jaeger", g: "n", names: ["Jägerwams", "Schuppenleder", "Fellwams"] },
    robe: { slot: "ruestung", arch: "magier", g: "f", names: ["Robe", "Runenrobe", "Sternengewand", "Druidenmantel"] },
    handschuhe: { slot: "handschuhe", arch: null, g: "pl", byArch: { krieger: ["Panzerhandschuhe", "Stachelhandschuhe"], schurke: ["Diebeshandschuhe", "Krallenhandschuhe"], jaeger: ["Schützenhandschuhe", "Lederstulpen"], magier: ["Runenhandschuhe", "Seidenhandschuhe"] } },
    stiefel: { slot: "stiefel", arch: null, g: "pl", byArch: { krieger: ["Eisenstiefel", "Plattenschuhe"], schurke: ["Schleicherstiefel", "Filzstiefel"], jaeger: ["Wanderstiefel", "Fellstiefel"], magier: ["Sternensandalen", "Runenschuhe"] } },
    umhang: { slot: "umhang", arch: null, g: "m", names: ["Umhang", "Wolfsfellmantel", "Reisemantel", "Nebelschleier"] },
    amulett: { slot: "amulett", arch: null, g: "n", names: ["Amulett", "Medaillon", "Runenanhänger", "Totem"] },
    ring: { slot: "ring", arch: null, g: "m", names: ["Ring", "Siegelring", "Runenring", "Knochenring"] },
    talisman: { slot: "talisman", arch: null, g: "m", names: ["Talisman", "Glücksbringer", "Runenstein", "Götzenbild"] },
  };

  /* Talentbaeume: je Klasse drei Zweige (Angriff, Verteidigung, Klassenpfad), angelehnt an die Spezialisierungen
     und Reichsfaehigkeiten von Dark Age of Camelot. Werte gelten je Rang. Stufe 1 bis 4 eines Zweiges
     werden mit 0, 3, 6 und 8 ausgegebenen Punkten in diesem Zweig frei. */
  const TALENT_TIER_REQ = [0, 0, 3, 6, 8];
  const TALENT_EFFECTS = {
    dmg: (v) => "+" + pct(v) + " Schaden",
    hp: (v) => "+" + pct(v) + " Lebenspunkte",
    armor: (v) => "+" + pct(v) + " Rüstung",
    crit: (v) => "+" + pct(v) + " Chance auf kritische Treffer",
    critMult: (v) => "kritische Treffer +" + pct(v) + " stärker",
    block: (v) => "+" + pct(v) + " Blockchance (mit Schild)",
    evade: (v) => "+" + pct(v) + " Ausweichchance",
    spDmg: (v) => "Spezialangriff +" + pct(v) + " Schaden",
    spCrit: (v) => "Spezialangriff +" + pct(v) + " Kritchance",
    spCritMult: (v) => "kritische Spezialangriffe +" + pct(v) + " stärker",
    spPierce: (v) => "Spezialangriff durchdringt " + pct(v) + " der Rüstung",
    execute: (v) => "+" + pct(v) + " Schaden gegen Gegner unter 35 % Lebenspunkten",
    double: (v) => pct(v) + " Chance auf einen zweiten Schlag (60 %)",
    pierce: (v) => "durchdringt " + pct(v) + " der gegnerischen Rüstung",
    riposte: (v) => pct(v) + " Chance auf einen Gegenschlag nach Block oder Ausweichen",
    ward: (v) => "Kampfbeginn mit einer Barriere aus " + pct(v) + " deiner Lebenspunkte",
    secondWind: (v) => "einmal je Kampf unter 30 % Lebenspunkten: heilt " + pct(v),
    purge: (v) => "wehrt " + v + (v === 1 ? " Betäubung oder Vergiftung" : " Betäubungen oder Vergiftungen") + " ab",
    magicRes: (v) => "-" + pct(v) + " Schaden durch Zauber",
    toughness: (v) => "-" + pct(v) + " erlittener Schaden",
    lifesteal: (v) => pct(v) + " des verursachten Schadens heilt dich",
    healPow: (v) => "Heilung des Spezialangriffs +" + pct(v),
    poisonPow: (v) => "Gift +" + pct(v) + " stärker",
    stunChance: (v) => "+" + pct(v) + " Chance zu betäuben",
    afterStun: (v) => "+" + pct(v) + " Schaden gegen gerade betäubte Gegner",
    rageBonus: (v) => "Blutrausch unter halben Lebenspunkten +" + pct(v) + " stärker",
    opener: (v) => "schlägt immer zuerst zu, erster Angriff +" + pct(v) + " Schaden",
    assassinate: () => "der erste Treffer ist immer kritisch",
    spHits: (v) => "Spezialangriff mit " + v + " zusätzlichen Treffern (je 50 %)",
    spEvery: () => "Spezialangriff schon bei jeder dritten statt vierten Aktion",
    vanish: () => "unter 40 % Lebenspunkten einmal je Kampf: den nächsten zwei Angriffen ausweichen",
    firstStrike: () => "",
  };
  function pct(v) {
    return Math.round(v * 1000) / 10 + " %";
  }
  // Grundformen je Grundart: [Schluessel, Name, Stufe, Raenge, Wirkung je Rang, Beschreibung]
  const TALENT_ARCH = {
    krieger: {
      o: [["dmg", "Waffenmeister", 1, 3, { dmg: 0.04 }], ["crit", "Schwachstellen", 2, 3, { crit: 0.02 }], ["exe", "Gnadenstoß", 2, 2, { execute: 0.1 }], ["dbl", "Doppelschlag", 3, 2, { double: 0.11 }], ["cap", "Sturmangriff", 4, 1, { opener: 1.2, firstStrike: 1 }, "Aktive Fähigkeit: Du stürmst los und triffst mit voller Wucht."]],
      d: [["hp", "Zähigkeit", 1, 3, { hp: 0.04 }], ["blk", "Schildmeister", 2, 3, { block: 0.03 }], ["tgh", "Eiserner Wille", 2, 2, { toughness: 0.03 }], ["rip", "Parade", 3, 2, { riposte: 0.08 }], ["cap", "Schmerz ignorieren", 4, 1, { secondWind: 0.22 }, "Aktive Fähigkeit: Kurz vor dem Fall beißt du die Zähne zusammen und kommst wieder zu Kräften."]],
    },
    schurke: {
      o: [["crit", "Tödliche Präzision", 1, 3, { crit: 0.03 }], ["cm", "Grausame Klinge", 2, 3, { critMult: 0.2 }], ["prc", "Rüstungsritzer", 2, 2, { pierce: 0.12 }], ["exe", "Gnadenstoß", 3, 2, { execute: 0.12 }], ["cap", "Meucheln", 4, 1, { assassinate: 1 }, "Aktive Fähigkeit: Aus dem Verborgenen sitzt der erste Stich immer."]],
      d: [["eva", "Flinke Füße", 1, 3, { evade: 0.02 }], ["hp", "Zähigkeit", 2, 3, { hp: 0.04 }], ["pur", "Reinigung", 2, 2, { purge: 1 }], ["rip", "Konter", 3, 2, { riposte: 0.09 }], ["cap", "Verschwinden", 4, 1, { vanish: 1 }, "Aktive Fähigkeit: In höchster Not tauchst du in die Schatten ab."]],
    },
    jaeger: {
      o: [["dmg", "Scharfes Auge", 1, 3, { dmg: 0.03 }], ["prc", "Durchschlag", 2, 3, { pierce: 0.1 }], ["crit", "Blattschuss", 2, 2, { crit: 0.02 }], ["dbl", "Schnellschuss", 3, 2, { double: 0.07 }], ["cap", "Pfeilsalve", 4, 1, { spHits: 2 }, "Aktive Fähigkeit: Ein Regen aus Pfeilen begleitet deinen Spezialangriff."]],
      d: [["hp", "Zähigkeit", 1, 3, { hp: 0.04 }], ["eva", "Ausweichen", 2, 3, { evade: 0.02 }], ["mag", "Magie meiden", 2, 2, { magicRes: 0.08 }], ["ls", "Jagdinstinkt", 3, 2, { lifesteal: 0.04 }], ["cap", "Zweiter Atem", 4, 1, { secondWind: 0.2 }, "Aktive Fähigkeit: Wenn es eng wird, findest du neue Kraft."]],
    },
    magier: {
      o: [["dmg", "Zerstörung", 1, 3, { dmg: 0.04 }], ["crit", "Fokussierte Macht", 2, 3, { crit: 0.02 }], ["cm", "Entfesselung", 2, 2, { critMult: 0.2 }], ["exe", "Vernichtung", 3, 2, { execute: 0.1 }], ["cap", "Wilde Macht", 4, 1, { critMult: 0.5, crit: 0.04 }, "Aktive Fähigkeit: Rohe Magie macht kritische Zauber verheerend."]],
      d: [["hp", "Lebenskraft", 1, 3, { hp: 0.05 }], ["ward", "Barriere", 2, 3, { ward: 0.03 }], ["mag", "Magie meiden", 2, 2, { magicRes: 0.08 }], ["tgh", "Standhaftigkeit", 3, 2, { toughness: 0.04 }], ["cap", "Bannkreis", 4, 1, { ward: 0.08, purge: 1 }, "Aktive Fähigkeit: Ein Kreis aus Runen schützt dich zu Kampfbeginn."]],
    },
  };
  // Klassenpfad: Name des Zweiges und die Besonderheit, die zur Spezialfaehigkeit passt
  const TALENT_CLASS = {
    schildritter: { names: ["Schwertkunst", "Schildwall", "Eid des Ritters"], sig: ["Nachsetzen", { afterStun: 0.3 }] },
    meuchler: { names: ["Klingenkunst", "Schattenpfad", "Kehlschnitt"], sig: ["Blutige Ernte", { spCritMult: 0.2 }] },
    langbogner: { names: ["Bogenkunst", "Waldläufer", "Pfeilhagel"], sig: ["Breitkopfspitzen", { spPierce: 0.3, spDmg: 0.05 }] },
    lichtweber: { names: ["Lichtmagie", "Bannkunst", "Sonnenlanze"], sig: ["Heilendes Licht", { healPow: 0.3 }] },
    sturmhuene: { names: ["Axtkunst", "Trollhaut", "Blutrausch"], sig: ["Wilder Zorn", { rageBonus: 0.12 }] },
    nebelschleicher: { names: ["Klingenkunst", "Nebelpfad", "Giftklinge"], sig: ["Tödliches Gift", { poisonPow: 0.3 }] },
    wolfsjaeger: { names: ["Jagdkunst", "Wildnis", "Frostpfeil"], sig: ["Klirrender Frost", { stunChance: 0.25, spDmg: 0.05 }] },
    runenwirker: { names: ["Runenmagie", "Runenschild", "Runensturm"], sig: ["Runenkraft", { spDmg: 0.06 }] },
    hainwaechter: { names: ["Klingentanz", "Rindenhaut", "Lebenssaft"], sig: ["Saft des Hains", { healPow: 0.3 }] },
    schattentaenzer: { names: ["Klingenkunst", "Schattentanz", "Tanz der Schatten"], sig: ["Tanz der Klingen", { riposte: 0.1 }] },
    mondschuetze: { names: ["Bogenkunst", "Feenpfad", "Mondpfeil"], sig: ["Silberspitze", { spCritMult: 0.2 }] },
    dornenrufer: { names: ["Dornmagie", "Hainschutz", "Wurzelgriff"], sig: ["Dornenumklammerung", { afterStun: 0.3 }] },
  };

  const RARITIES = {
    gewoehnlich: { name: "Gewöhnlich", color: "#c9d2d8", mult: 1.0, price: 1.0, lines: 1, weight: 52 },
    ungewoehnlich: { name: "Ungewöhnlich", color: "#74d86f", mult: 1.15, price: 1.5, lines: 2, weight: 30 },
    selten: { name: "Selten", color: "#4fa9ff", mult: 1.35, price: 2.4, lines: 2, weight: 13.5 },
    episch: { name: "Episch", color: "#c47bff", mult: 1.6, price: 4.0, lines: 3, weight: 4 },
    legendaer: { name: "Legendär", color: "#ffb13b", mult: 1.9, price: 7.0, lines: 4, weight: 0.5 },
  };
  const RARITY_ORDER = ["gewoehnlich", "ungewoehnlich", "selten", "episch", "legendaer"];

  const ADJ = {
    gewoehnlich: ["rostig", "verbeult", "schlicht", "solide", "geflickt", "abgewetzt", "schartig"],
    ungewoehnlich: ["geschliffen", "gehärtet", "verstärkt", "fein gearbeitet", "zuverlässig", "geweiht"],
    selten: ["meisterlich", "runenverziert", "sturmgeschmiedet", "nebelgehärtet", "verzaubert", "silberbeschlagen"],
    episch: ["sternengeschmiedet", "uralt", "donnernd", "mondbeschienen", "flammend", "seelengebunden", "frostgeboren"],
    legendaer: ["himmelsbrechend", "sagenumwoben", "unvergänglich", "sternenfressend", "weltenweit"],
  };
  const SUFFIX = {
    kraft: ["des Bären", "des Ambosses", "der Brandung", "des Riesen"],
    geschick: ["des Falken", "der Wildkatze", "des Windes", "des Schattens"],
    verstand: ["der Eule", "der Sterne", "des Nordlichts", "der Seher"],
    konstitution: ["der Eiche", "des Felsens", "der Wacht", "des Ahnen"],
    glueck: ["des Kleeblatts", "der Sternschnuppe", "des Raben", "der Feen"],
  };
  // Legendaere Gegenstaende tragen Eigennamen
  const LEGEND_NAMES = ["Morgenbrecher", "Frostbiss", "Nachtsang", "Eidhüter", "Sternenfall", "Wolfsherz", "Dornenkrone", "Mondsplitter", "Weltenast", "Grabesruh", "Sturmzunge", "Feenkuss", "Ahnenruf", "Splitterlicht"];

  /* Monster: arch bestimmt das 3D-Modell, type das Kampfverhalten */
  const MONSTER_TYPES = {
    kraft: { profile: "Bestie", hpMult: 4.5, armorCap: 40, block: 0.1, evade: 0, unblockable: false, dmgMult: 1.0, special: { id: "zermalmen", name: "Zermalmen" } },
    geschick: { profile: "Jäger der Tiefe", hpMult: 3.6, armorCap: 22, block: 0, evade: 0.22, unblockable: false, dmgMult: 1.1, special: { id: "raserei", name: "Raserei" } },
    verstand: { profile: "Hexenwesen", hpMult: 2.8, armorCap: 12, block: 0, evade: 0, unblockable: true, dmgMult: 1.45, special: { id: "fluch", name: "Fluch" } },
  };
  const ARCH_TYPE = {
    ghul: "kraft", schlund: "kraft", goblin: "geschick", wolf: "geschick", golem: "kraft", fledermaus: "geschick",
    pilz: "verstand", spinne: "geschick", drache: "verstand", schemen: "verstand", krebs: "kraft", todesritter: "kraft",
    troll: "kraft", baum: "kraft", kultist: "verstand",
  };
  const ARCH_NAMES = {
    ghul: "Untoter", schlund: "Schlund", goblin: "Nachtgoblin", wolf: "Bestie", golem: "Golem", fledermaus: "Flugbestie",
    pilz: "Sporenwesen", spinne: "Riesenspinne", drache: "Drache", schemen: "Schemen", krebs: "Panzerkrebs", todesritter: "Todesritter",
    troll: "Troll", baum: "Baumhirte", kultist: "Kultist",
  };

  const MONSTERS = [
    { id: "grabkriecher", name: "Grabkriecher", arch: "ghul", color: "#9a9a7a", accent: "#7fffb0", lv: [1, 7], realms: ["albion"] },
    { id: "moorschlund", name: "Moorschlund", arch: "schlund", color: "#5a6a3a", accent: "#d9f27a", lv: [1, 6], realms: ["albion", "hibernia"] },
    { id: "nachtgoblin", name: "Nachtgoblin", arch: "goblin", color: "#6a8a4a", accent: "#ffcf5a", lv: [1, 7], realms: ["albion", "hibernia"] },
    { id: "grauwolf", name: "Grauwolf", arch: "wolf", color: "#7a7470", accent: "#ffcf5a", lv: [1, 8], realms: ["albion", "midgard"] },
    { id: "sporling", name: "Sporling", arch: "pilz", color: "#a8643a", accent: "#e6ff5a", lv: [1, 7], realms: ["hibernia"] },
    { id: "klippenkrebs", name: "Klippenkrebs", arch: "krebs", color: "#8a5a3a", accent: "#ff7a3d", lv: [1, 6], realms: ["albion"] },
    { id: "hohlkultist", name: "Hohlkultist", arch: "kultist", color: "#3a3346", accent: "#c47bff", lv: [6, 15], realms: ["albion"] },
    { id: "aasflatterer", name: "Aasflatterer", arch: "fledermaus", color: "#3a2f3a", accent: "#ff5a3d", lv: [6, 14], realms: ["albion", "hibernia"] },
    { id: "netzlauerer", name: "Netzlauerer", arch: "spinne", color: "#4a3a2a", accent: "#ff3a3a", lv: [7, 15], realms: ["hibernia", "midgard"] },
    { id: "lehmgolem", name: "Lehmgolem", arch: "golem", color: "#8a6a4a", accent: "#ffb13b", lv: [8, 16], realms: ["albion"] },
    { id: "knochenlaeufer", name: "Knochenläufer", arch: "ghul", color: "#d9cfb8", accent: "#4fa9ff", lv: [6, 15], realms: ["albion"] },
    { id: "faulschlund", name: "Faulschlund", arch: "schlund", color: "#4a3a4a", accent: "#c47bff", lv: [7, 16], realms: ["hibernia"] },
    { id: "sumpftroll", name: "Sumpftroll", arch: "troll", color: "#4f6a4a", accent: "#ffcf5a", lv: [14, 25], realms: ["hibernia", "midgard"] },
    { id: "grabritter", name: "Grabritter", arch: "todesritter", color: "#4a4f5a", accent: "#7fffb0", lv: [15, 25], realms: ["albion"] },
    { id: "sporenschrecken", name: "Sporenschrecken", arch: "pilz", color: "#6a3f8a", accent: "#d9f27a", lv: [14, 24], realms: ["hibernia"] },
    { id: "fahlerschemen", name: "Fahler Schemen", arch: "schemen", color: "#a8b8c8", accent: "#9fe3ff", lv: [15, 26], realms: ["albion", "midgard"] },
    { id: "felsgolem", name: "Felsgolem", arch: "golem", color: "#6a6e76", accent: "#59d1ff", lv: [16, 26], realms: ["albion", "midgard"] },
    { id: "dornenhirte", name: "Dornenhirte", arch: "baum", color: "#4a3a2a", accent: "#c0392b", lv: [15, 25], realms: ["hibernia"] },
    { id: "frostwolf", name: "Frostwolf", arch: "wolf", color: "#c8dcef", accent: "#4fa9ff", lv: [24, 35], realms: ["midgard"] },
    { id: "kristallweberin", name: "Kristallweberin", arch: "spinne", color: "#3f8a96", accent: "#e9fbff", lv: [24, 36], realms: ["midgard", "hibernia"] },
    { id: "knochenfuerst", name: "Knochenfürst", arch: "ghul", color: "#e9e0c8", accent: "#ff3a3a", lv: [25, 36], realms: ["albion"] },
    { id: "blutkultist", name: "Blutkultist", arch: "kultist", color: "#5a1414", accent: "#ff3a5a", lv: [24, 35], realms: ["albion"] },
    { id: "donnerkrebs", name: "Donnerkrebs", arch: "krebs", color: "#2f4f8f", accent: "#ffe45a", lv: [26, 36], realms: ["midgard", "albion"] },
    { id: "irrlichtschemen", name: "Irrlichtschemen", arch: "schemen", color: "#6fdfa8", accent: "#2a7a5a", lv: [25, 36], realms: ["hibernia"] },
    { id: "schwelwurm", name: "Schwelwurm", arch: "drache", color: "#8a2f1f", accent: "#ffcf5a", lv: [34, 48], realms: ["albion"] },
    { id: "eisengolem", name: "Eisengolem", arch: "golem", color: "#4d5660", accent: "#ff7a3d", lv: [34, 47], realms: ["albion"] },
    { id: "schattenwolf", name: "Schattenwolf", arch: "wolf", color: "#2a2633", accent: "#c47bff", lv: [35, 48], realms: ["midgard", "hibernia", "albion"] },
    { id: "bergtroll", name: "Bergtroll", arch: "troll", color: "#6a7a8a", accent: "#9fe3ff", lv: [34, 48], realms: ["midgard"] },
    { id: "giftmorchel", name: "Giftmorchel", arch: "pilz", color: "#3f6a2a", accent: "#e6ff5a", lv: [34, 47], realms: ["hibernia"] },
    { id: "moderhirte", name: "Moderhirte", arch: "baum", color: "#2f2a1f", accent: "#7fffb0", lv: [36, 48], realms: ["hibernia"] },
    { id: "sturmdrache", name: "Sturmdrache", arch: "drache", color: "#2f3f8f", accent: "#9fe3ff", lv: [46, 999], realms: ["midgard", "albion"] },
    { id: "leerenschemen", name: "Leerenschemen", arch: "schemen", color: "#1f1b2e", accent: "#c47bff", lv: [46, 999], realms: ["albion", "midgard", "hibernia"] },
    { id: "obsidiangolem", name: "Obsidiangolem", arch: "golem", color: "#1f1c26", accent: "#ff5a8a", lv: [46, 999], realms: ["albion", "midgard"] },
    { id: "leerenspinne", name: "Leerenspinne", arch: "spinne", color: "#1a1626", accent: "#c47bff", lv: [46, 999], realms: ["hibernia"] },
    { id: "todesritter", name: "Todesritter", arch: "todesritter", color: "#1f2026", accent: "#ff3a3a", lv: [46, 999], realms: ["albion", "midgard"] },
    { id: "urschlund", name: "Urschlund", arch: "schlund", color: "#2a1f3a", accent: "#ff5a3d", lv: [46, 999], realms: ["hibernia"] },
    // Reichstypische Gegner: Midgard (Frost, Trolle, Wiedergaenger), Hibernia (Feenwesen, Moore, Haine)
    { id: "eiskobold", name: "Eiskobold", arch: "goblin", color: "#8aa8c8", accent: "#9fe3ff", lv: [1, 7], realms: ["midgard"] },
    { id: "draugling", name: "Draugling", arch: "ghul", color: "#7a8a9a", accent: "#9fe3ff", lv: [1, 7], realms: ["midgard"] },
    { id: "feenwolf", name: "Feenwolf", arch: "wolf", color: "#4f7a5a", accent: "#9fffc8", lv: [2, 8], realms: ["hibernia"] },
    { id: "runenhexe", name: "Runenhexe", arch: "kultist", color: "#3a4a6a", accent: "#9fd8ff", lv: [6, 15], realms: ["midgard"] },
    { id: "reifgolem", name: "Reifgolem", arch: "golem", color: "#a8bcd0", accent: "#9fe3ff", lv: [8, 16], realms: ["midgard"] },
    { id: "draugrfuerst", name: "Draugrfürst", arch: "ghul", color: "#5a6a7a", accent: "#9fe3ff", lv: [15, 25], realms: ["midgard"] },
    { id: "nebeldruide", name: "Nebeldruide", arch: "kultist", color: "#2f5a3a", accent: "#9fffc8", lv: [24, 35], realms: ["hibernia"] },
    { id: "eiswyrm", name: "Eiswyrm", arch: "drache", color: "#dfeaf4", accent: "#4fa9ff", lv: [34, 48], realms: ["midgard"] },
    { id: "smaragdwyrm", name: "Smaragdwyrm", arch: "drache", color: "#2f8a5a", accent: "#9fffc8", lv: [46, 999], realms: ["hibernia"] },
  ];

  // Nachtwesen fuer das Mondtor: nur bei Nacht, je Reich eigene Geschoepfe
  const NIGHT_FOES = {
    albion: [
      { id: "nacht-weissefrau", name: "Die Weiße Frau", arch: "schemen", color: "#e6ecff", accent: "#9fd8ff" },
      { id: "nacht-grabwaechter", name: "Grabwächter", arch: "ghul", color: "#8a8a9a", accent: "#e6ecff" },
      { id: "nacht-mahr", name: "Nachtmahr", arch: "wolf", color: "#1f1c2a", accent: "#e6ecff" },
      { id: "nacht-hexer", name: "Mondhexer", arch: "kultist", color: "#2a2a4a", accent: "#bfd0ff" },
    ],
    midgard: [
      { id: "nacht-wiedergaenger", name: "Wiedergänger", arch: "ghul", color: "#6a7a8a", accent: "#bfe8ff" },
      { id: "nacht-mondwolf", name: "Mondwolf", arch: "wolf", color: "#c8d4e4", accent: "#e6ecff" },
      { id: "nacht-alb", name: "Nachtalb", arch: "goblin", color: "#3a4256", accent: "#bfe8ff" },
      { id: "nacht-nordlicht", name: "Nordlichtschemen", arch: "schemen", color: "#5fdfb0", accent: "#b48cff" },
    ],
    hibernia: [
      { id: "nacht-irrlicht", name: "Irrlicht", arch: "schemen", color: "#7fffb0", accent: "#e6ff8a" },
      { id: "nacht-moorhexe", name: "Moorhexe", arch: "kultist", color: "#2a3a2a", accent: "#9fffc8" },
      { id: "nacht-sternspinne", name: "Sternspinne", arch: "spinne", color: "#2a2a4a", accent: "#e6ecff" },
      { id: "nacht-mondpilz", name: "Mondmorchel", arch: "pilz", color: "#4a4a8a", accent: "#bfd0ff" },
    ],
  };

  const DUNGEONS = [
    {
      id: "pilzgrotte", name: "Die Sporengrotte", unlock: 10, base: 10, theme: "#5f9f4a",
      desc: "Unter deiner Heimatinsel wächst etwas. Es riecht nach Waldboden und nach Absicht.",
      bosses: [
        { name: "Sporenwächter Muff", arch: "pilz", color: "#8a6a4a", accent: "#e6ff5a" },
        { name: "Glibbmutter", arch: "schlund", color: "#4a6a3a", accent: "#d9f27a" },
        { name: "Hauptmann Zwick", arch: "goblin", color: "#5a7a3a", accent: "#ff5a3d" },
        { name: "Grauzahn", arch: "wolf", color: "#5d5650", accent: "#ffcf5a" },
        { name: "Spinnenmutter Fadenreich", arch: "spinne", color: "#3a2a1f", accent: "#ff3a3a" },
        { name: "Morchelmagier Duftwolke", arch: "pilz", color: "#6a3f8a", accent: "#f2e27a" },
        { name: "Steinfresser Brocken", arch: "golem", color: "#7a6a5a", accent: "#7fffb0" },
        { name: "Der Große Bovist", arch: "pilz", color: "#cfc4a8", accent: "#ff7a3d", final: true },
      ],
    },
    {
      id: "glockenstadt", name: "Die Versunkene Abtei", unlock: 15, base: 16, theme: "#4f7fbf",
      desc: "Eine Abtei im Nebelmeer. Jede Stunde läuten die Glocken, obwohl dort seit Jahrhunderten niemand mehr wohnt.",
      bosses: [
        { name: "Glöckner Bimbam", arch: "ghul", color: "#d9cfb8", accent: "#ffcf5a" },
        { name: "Turmflatterer", arch: "fledermaus", color: "#3a2f4a", accent: "#ffcf5a" },
        { name: "Kneifer", arch: "krebs", color: "#7a4a2a", accent: "#ff7a3d" },
        { name: "Geisterküster Amen", arch: "schemen", color: "#cfe0f0", accent: "#7fa8ff" },
        { name: "Abt Grabeskalt", arch: "kultist", color: "#2a2a3a", accent: "#9fe3ff" },
        { name: "Turmritter Eisenmut", arch: "todesritter", color: "#6a727e", accent: "#4fa9ff" },
        { name: "Schwarm der hundert Flügel", arch: "fledermaus", color: "#1f1a26", accent: "#ff7a3d" },
        { name: "Die Ertrunkene Glocke", arch: "schemen", color: "#5f8fa6", accent: "#ffe7a3", final: true },
      ],
    },
    {
      id: "rostwerk", name: "Die Erzschmiede", unlock: 22, base: 23, theme: "#bf6a2f",
      desc: "Eine Schmiede, die niemand gebaut hat und die trotzdem Tag und Nacht hämmert.",
      bosses: [
        { name: "Ritzel der Schlackengoblin", arch: "goblin", color: "#5a4a3a", accent: "#ffb13b" },
        { name: "Dampfkrebs Zisch", arch: "krebs", color: "#6a6e76", accent: "#ff7a3d" },
        { name: "Kesselgolem Brodel", arch: "golem", color: "#5a3a26", accent: "#ffcf5a" },
        { name: "Schlackenritter", arch: "todesritter", color: "#6a3a26", accent: "#ff5a1a" },
        { name: "Ölschlund Schmier", arch: "schlund", color: "#1f1a16", accent: "#c9a441" },
        { name: "Schmiedetroll Amboss", arch: "troll", color: "#5a4a4a", accent: "#ffb13b" },
        { name: "Werkmeister Knochenhand", arch: "ghul", color: "#cfc4a8", accent: "#c2502f" },
        { name: "Der Große Kolben", arch: "golem", color: "#3a3f46", accent: "#ff5a3d", final: true },
      ],
    },
    {
      id: "frostspitzen", name: "Frostspitzen-Horst", unlock: 30, base: 31, theme: "#8fc7ef",
      desc: "Der kälteste Gipfel über dem Nebelmeer. Selbst die Echos frieren hier fest.",
      bosses: [
        { name: "Weißfell", arch: "wolf", color: "#e2ecf6", accent: "#4fa9ff" },
        { name: "Eisspinne Klirr", arch: "spinne", color: "#8fd6f0", accent: "#ffffff" },
        { name: "Frostgeist Hauch", arch: "schemen", color: "#dcefff", accent: "#4fa9ff" },
        { name: "Gletscherkrebs", arch: "krebs", color: "#6fb9d6", accent: "#e9fbff" },
        { name: "Firnriese Grummel", arch: "troll", color: "#cfdbe6", accent: "#2f5fa8" },
        { name: "Frostritter Kaltblut", arch: "todesritter", color: "#8fa7c9", accent: "#e9fbff" },
        { name: "Eisgolem Gletscherherz", arch: "golem", color: "#bfe0ff", accent: "#2f5fa8" },
        { name: "Eisdrachin Kristalla", arch: "drache", color: "#afdcf6", accent: "#2fb0c6", final: true },
      ],
    },
    {
      id: "laternengruft", name: "Gruft der Laternen", unlock: 38, base: 40, theme: "#c9a441",
      desc: "Tausend Laternen brennen hier unten. Niemand weiß, wer sie jeden Abend anzündet.",
      bosses: [
        { name: "Laternenträger Docht", arch: "ghul", color: "#e2d8bf", accent: "#ffcf5a" },
        { name: "Irrlichtschwarm", arch: "schemen", color: "#ffe9a3", accent: "#ff9a3d" },
        { name: "Grabspinne Schleier", arch: "spinne", color: "#2a2433", accent: "#ffcf5a" },
        { name: "Gruftritter Ohnehaupt", arch: "todesritter", color: "#3a3f4a", accent: "#ffb13b" },
        { name: "Kerzenkultist", arch: "kultist", color: "#3a2a1a", accent: "#ffcf5a" },
        { name: "Schattenmorchel", arch: "pilz", color: "#2a2433", accent: "#ffcf5a" },
        { name: "Wachsgolem Tropf", arch: "golem", color: "#e2d6b4", accent: "#ff7a3d" },
        { name: "Laternenkönig Ewiglicht", arch: "schemen", color: "#fff0c0", accent: "#ffb13b", final: true },
      ],
    },
    {
      id: "sturmkern", name: "Das Auge des Sturms", unlock: 46, base: 50, theme: "#8f7cff",
      desc: "Das Herz des ewigen Sturms. Hier entstehen die Blitze, die die Splitter in der Luft halten.",
      bosses: [
        { name: "Blitzflatterer Zack", arch: "fledermaus", color: "#2f3f7f", accent: "#fff35a" },
        { name: "Sturmgolem Böe", arch: "golem", color: "#4a5a7f", accent: "#9fe3ff" },
        { name: "Donnerkrebs Krachbumm", arch: "krebs", color: "#2f4fbf", accent: "#ffe45a" },
        { name: "Wirbelschemen", arch: "schemen", color: "#cfdcff", accent: "#8f7cff" },
        { name: "Sturmritter Orkan", arch: "todesritter", color: "#2f3a5f", accent: "#9fe3ff" },
        { name: "Orkantroll", arch: "troll", color: "#4a5a7f", accent: "#e9fbff" },
        { name: "Himmelsschlund", arch: "schlund", color: "#5f8fbf", accent: "#ffffff" },
        { name: "Sturmdrache Tempestas", arch: "drache", color: "#1f2f8f", accent: "#9fe3ff", final: true },
      ],
    },
  ];

  const PLACES = ["Kreidefurt", "Eschenmoor", "Rabenstein", "Nebelhain", "Frostfurt", "Schwarzsee", "Druidenfels", "Wolfsklamm",
    "Mondsee", "Irrlichtsumpf", "Runenfeld", "Krähenwacht", "Sturmkap", "Dornental", "Seufzerbrücke", "Graumark"];
  const PERSONS = ["Bürgermeister Kniebel", "Oma Grützbart", "Bruder Pfefferminz", "Professorin Brassel", "Fischer Ole",
    "Bäckerin Krümel", "Postmeister Stempelmann", "Turmwächter Funzel", "Gräfin von Nebelstein", "Schmied Brumm",
    "Madame Zinnober", "die Zwillinge Wim und Wum", "Skalde Halvar", "Druidin Fiadh"];

  // {m} = Gegnername, {o} = Ort, {p} = Person
  const QUESTS = [
    { t: "Ärger in {o}", x: "{p} schwört, dass jede Nacht etwas die Wäscheleinen in {o} anknabbert. Die Socken sind alle weg. Hauptverdächtig: {m}." },
    { t: "Die Zimtschnecken-Krise", x: "Die Bäckerei in {o} wird belagert, angeblich wegen der Zimtschnecken. Der Belagerer heißt {m} und teilt nicht." },
    { t: "Ein Leuchtfeuer erlischt", x: "Auf {o} erlischt nachts ständig das Leuchtfeuer. {p} vermutet Sabotage durch {m}. Oder Wind. Eher {m}." },
    { t: "Zerbrechliche Fracht", x: "Eine Kiste mit der Aufschrift „Nicht öffnen, flüstert“ muss nach {o}. Unterwegs wartet {m}. Die Kiste flüstert übrigens wirklich." },
    { t: "Nachtruhe für {o}", x: "Seit Tagen heult {m} in {o} schief und sehr laut den Mond an. Die Anwohner wünschen ein Ende des Konzerts." },
    { t: "Pilze mit Leibwache", x: "{p} braucht Pilze aus {o}. Die Pilze haben allerdings einen Leibwächter: {m}." },
    { t: "Die Steuerprüfung", x: "Das Steueramt der Insel bittet um Mithilfe. {m} haust seit drei Jahren in {o} und hat noch nie Steuern gezahlt." },
    { t: "Ein Brief nach {o}", x: "Ein Liebesbrief muss sicher nach {o}. Der letzte Bote hat gekündigt, nachdem er {m} begegnet ist." },
    { t: "Wegezoll", x: "Auf der Hängebrücke nach {o} verlangt {m} plötzlich Zoll. Niemand weiß, wer das genehmigt hat." },
    { t: "Geräusche im Keller", x: "{p} hört Geräusche im Keller. Der Keller liegt dummerweise in {o}. Und dort unten wohnt jetzt {m}." },
    { t: "Die verlorene Wette", x: "{p} hat gewettet, dass du {m} in {o} besiegst. Es geht um viel Gold. Und um einen Hut." },
    { t: "Grabesruhe", x: "Auf dem Friedhof von {o} gräbt sich jede Nacht {m} wieder nach oben. Die Toten beschweren sich über die Unruhe." },
    { t: "Das Hügelgrab", x: "{p} hat in {o} ein Hügelgrab geöffnet, um nur ganz kurz reinzuschauen. Herausgeschaut hat {m}." },
    { t: "Die geheime Zutat", x: "Die Wirtin braucht eine geheime Zutat aus {o}. Sie verrät nicht welche. {m} weiß es leider schon." },
    { t: "Der Runenstein", x: "In {o} ist ein Runenstein umgefallen. Seitdem schleicht {m} durch die Gegend. Zusammenhang? Unbedingt." },
    { t: "Forschungsreise", x: "Professorin Brassel will {m} in {o} vermessen. Lebend wäre schön, aber sie ist nicht wählerisch." },
    { t: "Verirrte Pilger", x: "Eine Pilgergruppe hat sich in {o} verlaufen. Ihr Führer wurde inzwischen von {m} adoptiert." },
    { t: "Die Mutprobe", x: "Die Kinder von {o} behaupten, du traust dich nicht, {m} an die Nase zu stupsen. Das kannst du so nicht stehen lassen." },
    { t: "Der Geburtstagskuchen", x: "{p} hat Geburtstag, und der Kuchen steht in {o}. Daneben sitzt {m} und hält bereits eine Gabel." },
    { t: "Ruhestörung im Archiv", x: "Im Archiv von {o} blättert nachts jemand in verbotenen Büchern. {p} tippt auf {m}. Mit Lesebrille." },
    { t: "Nebelfeuer", x: "In {o} brennt ein grünes Feuer, das nicht wärmt. {m} sitzt davor und röstet etwas, das du nicht sehen willst." },
    { t: "Der Fluch des Brunnens", x: "Wer in {o} aus dem Brunnen trinkt, spricht danach rückwärts. {p} glaubt, {m} habe hineingespuckt." },
    { t: "Ein Grenzstein wandert", x: "Der Grenzstein zwischen zwei Reichen ist über Nacht nach {o} gewandert. {m} hat ihn getragen und will ihn behalten." },
    { t: "Die Krähenwette", x: "Die Krähen von {o} haben {p} gestohlen. Nicht etwas von {p}, sondern {p} selbst. {m} soll ihr Anführer sein." },
  ];
  const RARE_QUESTS = [
    { t: "Die Horde von {o}", x: "Seltener Auftrag: Eine ganze Horde fällt über {o} her. Erst die Späher, dann die Brut, am Ende der Anführer {m}. Du kämpfst sie alle nacheinander, ohne Pause." },
    { t: "Nacht der langen Schatten", x: "Seltener Auftrag: Wenn in {o} die Sonne untergeht, kommen sie aus dem Boden. Drei Wellen, eine Nacht. Am Ende wartet {m}." },
    { t: "Das Nest in {o}", x: "Seltener Auftrag: {p} hat in {o} ein Nest gefunden, und es ist nicht leer. Räum es aus, bevor {m} zurückkehrt. Er kehrt zurück." },
  ];

  const NPC_FIRST = ["Brakus", "Mira", "Tjark", "Ilva", "Gorm", "Senna", "Fenja", "Okko", "Rurik", "Wenzel", "Lotta", "Bodo",
    "Hilde", "Quirin", "Yara", "Zeno", "Pim", "Runa", "Tamo", "Edda", "Knut", "Fiete", "Smilla", "Hauke", "Ida", "Jorin",
    "Malte", "Nele", "Rasmus", "Svea", "Ole", "Greta", "Hinnerk", "Wiebke", "Arvid", "Talea", "Kalle", "Frieda", "Bjarne", "Insa",
    "Aoife", "Cian", "Bran", "Sigrun", "Halvar", "Gwen", "Percival", "Isolde", "Eamon", "Torvi"];
  const NPC_LAST = ["Wolfsfuß", "Eisenhand", "Sturmauge", "Kesselbauch", "Rabenschreck", "Bartfuchs", "Donnerstimme",
    "Schiefnase", "Ohnefurcht", "Glückspilz", "Frostbart", "Krummhorn", "Rostzahn", "Silberblick", "Funkenschlag",
    "Nebelherz", "Eschenspeer", "Kupferlocke", "Laternenträger", "Mondwanderer", "Hagelfaust", "Zwiebelmut", "Runenritzer", "Eidbrecher"];

  const GUILD_NAMES = {
    albion: [["Orden der Kreidewacht", "KW"], ["Die Roten Lanzen", "LANZ"], ["Bund vom Steinkreis", "BSK"], ["Graue Federn", "FED"]],
    midgard: [["Die Eisbärte", "EIS"], ["Sturmrudel", "RUDL"], ["Haus Hrafn", "HRFN"], ["Die Methalle", "MET"]],
    hibernia: [["Hüter des Hains", "HAIN"], ["Mondschleier", "MOND"], ["Die Dornenkrone", "DORN"], ["Kinder des Nebels", "NBL"]],
  };

  const POTIONS = [
    { id: "baerenkraft", name: "Bärenkraft-Elixier", desc: "+15 % auf deinen Hauptwert für 30 Minuten.", eff: { main: 0.15 }, mins: 30, cost: { goldMult: 2.2 }, color: "#e0644f" },
    { id: "eisenhaut", name: "Eisenhaut-Tinktur", desc: "+20 % Konstitution für 30 Minuten.", eff: { konstitution: 0.2 }, mins: 30, cost: { goldMult: 1.8 }, color: "#9aa4ad" },
    { id: "glueckspilztee", name: "Glückspilz-Tee", desc: "+30 % Glück für 30 Minuten.", eff: { glueck: 0.3 }, mins: 30, cost: { goldMult: 1.2 }, color: "#74d86f" },
    { id: "sternenstaub", name: "Sternenstaub-Trunk", desc: "+20 % auf alle Werte für 60 Minuten.", eff: { all: 0.2 }, mins: 60, cost: { perlen: 3 }, color: "#c47bff" },
  ];

  const MOUNTS = [
    { id: "esel", name: "Packpony", desc: "Klein, stur und zuverlässig. Frisst alles, auch Karten.", cut: 0.1, cost: { gold: 300 }, color: "#8a6a4a" },
    { id: "ziege", name: "Nebelhirsch", desc: "Findet jeden Pfad durch den Nebel und verliert nie die Fassung.", cut: 0.2, cost: { gold: 3000 }, color: "#c9d2d8" },
    { id: "greif", name: "Sturmgreif", desc: "Stolz, schnell und eitel. Will täglich gelobt werden.", cut: 0.3, cost: { perlen: 20 }, color: "#e0b04a" },
    { id: "wal", name: "Himmelswal-Kalb", desc: "Gleitet lautlos durch jede Wolkenbank und singt dabei.", cut: 0.45, cost: { perlen: 50 }, color: "#4f8fd8" },
  ];

  /* Housing: Hausstufen und Einrichtung mit dauerhaften Boni */
  const HOUSE_TIERS = [
    { name: "Zeltlager", cost: 0, lv: 1, desc: "Eine Plane, ein Feuer, ein Stein als Kissen." },
    { name: "Steinkate", cost: 1500, lv: 5, desc: "Vier Wände und ein Dach, das meistens dicht ist." },
    { name: "Langhaus", cost: 12000, lv: 12, desc: "Platz für eine Tafel, Trophäen und Gäste, die zu lange bleiben." },
    { name: "Turmfeste", cost: 40000, perlen: 15, lv: 25, desc: "Ein eigener Turm mit Blick über das Nebelmeer." },
  ];
  const FURNITURE = [
    { id: "lager", name: "Schlafstatt", levels: ["Strohlager", "Fellbett", "Himmelbett"], cost: [400, 3000, 15000], tier: [0, 1, 2], bonus: "Tatendrang", per: 10, unit: "", desc: "Mehr maximaler Tatendrang." },
    { id: "herd", name: "Herdfeuer", levels: ["Feuerstelle", "Steinkamin", "Runenkamin"], cost: [600, 4000, 20000], tier: [0, 1, 2], bonus: "Erfahrung aus Aufträgen", per: 3, unit: "%", desc: "Mehr Erfahrung aus Aufträgen." },
    { id: "truhe", name: "Schatztruhe", levels: ["Holzkiste", "Eisentruhe", "Drachenhort"], cost: [500, 3500, 18000], tier: [0, 1, 2], bonus: "Rucksackplätze", per: 2, unit: "", desc: "Mehr Platz im Rucksack." },
    { id: "staender", name: "Rüstungsständer", levels: ["Holzgestell", "Waffenwand", "Ahnenrüstung"], cost: [800, 5000, 25000], tier: [1, 2, 3], bonus: "Rüstung", per: 4, unit: "%", desc: "Mehr Rüstung." },
    { id: "altar", name: "Reichsschrein", levels: ["Kerzenschrein", "Runenaltar", "Sternenaltar"], cost: [1500, 9000, 40000], tier: [1, 2, 3], bonus: "Hauptwert", per: 2, unit: "%", desc: "Mehr Hauptwert." },
    { id: "kessel", name: "Alchemiekessel", levels: ["Kupferkessel", "Brodelkessel", "Seelenkessel"], cost: [700, 4500, 20000], tier: [1, 2, 3], bonus: "Trankdauer", per: 25, unit: "%", desc: "Tränke wirken länger." },
    { id: "trophaeen", name: "Trophäenwand", levels: ["Trophäenwand"], cost: [2000], tier: [1], bonus: "Gold je besiegtem Dungeon-Boss", per: 1, unit: "%", desc: "Zeigt deine Dungeon-Siege, jeder Boss bringt +1 % Gold aus Aufträgen." },
  ];

  const ACHIEVEMENTS = [
    { id: "ersterSieg", name: "Erste Schramme", desc: "Gewinne deinen ersten Kampf.", perlen: 1 },
    { id: "quest10", name: "Fleißige Hände", desc: "Schließe 10 Aufträge ab.", perlen: 2 },
    { id: "quest50", name: "Die halbe Insel kennt dich", desc: "Schließe 50 Aufträge ab.", perlen: 4 },
    { id: "quest150", name: "Auftragslegende", desc: "Schließe 150 Aufträge ab.", perlen: 8 },
    { id: "horde", name: "Hordenbrecher", desc: "Gewinne einen seltenen Hordenauftrag.", perlen: 2 },
    { id: "stufe10", name: "Zweistellig", desc: "Erreiche Stufe 10.", perlen: 3 },
    { id: "stufe25", name: "Veteran der Splitter", desc: "Erreiche Stufe 25.", perlen: 6 },
    { id: "stufe40", name: "Lebende Legende", desc: "Erreiche Stufe 40.", perlen: 10 },
    { id: "arena10", name: "Publikumsliebling", desc: "Gewinne 10 Kämpfe im Ring der Reiche.", perlen: 3 },
    { id: "arenaTop10", name: "Ganz oben", desc: "Erreiche Platz 10 in der globalen Rangliste.", perlen: 8 },
    { id: "boss1", name: "Ab in die Tiefe", desc: "Besiege deinen ersten Dungeon-Boss.", perlen: 2 },
    { id: "dungeon1", name: "Grottenolm", desc: "Schließe einen ganzen Dungeon ab.", perlen: 5 },
    { id: "episch", name: "Lila Leuchten", desc: "Finde einen epischen Gegenstand.", perlen: 2 },
    { id: "legendaer", name: "Goldener Schimmer", desc: "Finde einen legendären Gegenstand.", perlen: 5 },
    { id: "bestiarium12", name: "Naturkundler", desc: "Entdecke 12 Wesen im Bestiarium.", perlen: 4 },
    { id: "wache8", name: "Nachtschicht", desc: "Leiste 8 Schichten am Stück.", perlen: 2 },
    { id: "reittier", name: "Eigene Hufe", desc: "Kaufe dein erstes Reittier.", perlen: 1 },
    { id: "kapitel3", name: "Chronist", desc: "Schließe drei Kapitel der Chronik ab.", perlen: 4 },
    { id: "gilde", name: "Gemeinsam stark", desc: "Tritt einer Gilde bei oder gründe eine.", perlen: 2 },
    { id: "heim", name: "Eigene vier Wände", desc: "Baue dein Heim zur Steinkate aus.", perlen: 3 },
    { id: "mondjaeger", name: "Kind der Nacht", desc: "Gewinne 5 Nachtjagden am Mondtor.", perlen: 4 },
    // schwere Abzeichen (0.72, Wunsch des Kapitaens)
    { id: "halsbrecher25", name: "Halsbrecher", desc: "Gewinne 25 halsbrecherische Aufträge.", perlen: 6, hard: true },
    { id: "horde10", name: "Hordenschreck", desc: "Gewinne 10 seltene Hordenaufträge.", perlen: 6, hard: true },
    { id: "unbesiegt20", name: "Unbesiegt", desc: "Gewinne 20 Aufträge hintereinander ohne Niederlage.", perlen: 6, hard: true },
    { id: "knapp", name: "Mit letzter Kraft", desc: "Gewinne einen Auftrag mit höchstens 5 % deiner Lebenspunkte.", perlen: 3, hard: true },
    { id: "quest300", name: "Unermüdlich", desc: "Schließe 300 Aufträge ab.", perlen: 12, hard: true },
    { id: "stufe50", name: "Wolkenfürst", desc: "Erreiche Stufe 50.", perlen: 15, hard: true },
    { id: "chronik", name: "Die ganze Geschichte", desc: "Schließe alle Kapitel deiner Chronik ab.", perlen: 8, hard: true },
    { id: "dungeonAll", name: "Bezwinger der Tiefen", desc: "Schließe alle sechs Verliese vollständig ab.", perlen: 15, hard: true },
    { id: "arena100", name: "Herr des Rings", desc: "Gewinne 100 Kämpfe im Ring der Reiche.", perlen: 8, hard: true },
    { id: "mondjaeger25", name: "Schrecken der Nacht", desc: "Gewinne 25 Nachtjagden am Mondtor.", perlen: 6, hard: true },
    { id: "legendaer5", name: "Schatzhüter", desc: "Finde 5 legendäre Gegenstände.", perlen: 8, hard: true },
    { id: "bestiarium30", name: "Weltenkundler", desc: "Entdecke 30 Wesen im Bestiarium.", perlen: 6, hard: true },
  ];

  const WELL_PRIZES = [
    { id: "gold", w: 34, label: "Ein Beutel Gold" },
    { id: "goldGross", w: 10, label: "Ein großer Goldschatz" },
    { id: "perle", w: 14, label: "Eine Wolkenperle" },
    { id: "perlen3", w: 3, label: "Drei Wolkenperlen" },
    { id: "tatendrang", w: 15, label: "Ein Krug Nebelmet (+30 Tatendrang)" },
    { id: "xp", w: 14, label: "Ein Geistesblitz (Erfahrung)" },
    { id: "item", w: 8, label: "Ein Gegenstand aus der Tiefe" },
    { id: "trank", w: 2, label: "Ein Sternenstaub-Trunk" },
  ];

  const NPCS = {
    ottilie: { name: "Hüterin Ottilie", role: "Wächterin deiner Heimatinsel" },
    hulda: { name: "Hulda Humpenhold", role: "Wirtin der Schiefen Krähe" },
    brumm: { name: "Brumm Eisenbart", role: "Schmied" },
    zinnober: { name: "Madame Zinnober", role: "Händlerin für Kuriositäten" },
    funzel: { name: "Funzel", role: "Turmwächter" },
    krawall: { name: "Baronin Krawall", role: "Herrin des Rings der Reiche" },
    hufnagel: { name: "Henrietta Hufnagel", role: "Stallmeisterin" },
    seherin: { name: "Die Seherin Maeve", role: "Hüterin der Chronik" },
    mondhaendler: { name: "Selene Silberblick", role: "Händlerin, die nur nachts kommt" },
  };

  const BUILDINGS = [
    { id: "taverne", name: "Zur Schiefen Krähe", short: "Taverne", npc: "hulda" },
    { id: "steinkreis", name: "Der Steinkreis", short: "Chronik", npc: "seherin" },
    { id: "schmiede", name: "Brumms Amboss", short: "Schmiede", npc: "brumm" },
    { id: "arkanum", name: "Zinnobers Kuriositäten", short: "Kuriositäten", npc: "zinnober" },
    { id: "arena", name: "Ring der Reiche", short: "Arena", npc: "krawall" },
    { id: "leuchtturm", name: "Der Wachturm", short: "Wache", npc: "funzel" },
    { id: "tiefen", name: "Das Tor zur Tiefe", short: "Dungeons" },
    { id: "stall", name: "Greifenstall", short: "Stall", npc: "hufnagel" },
    { id: "ruhmeshalle", name: "Halle der Helden", short: "Rangliste" },
    { id: "gildenhalle", name: "Gildenhalle", short: "Gilde" },
    { id: "brunnen", name: "Wunschbrunnen", short: "Brunnen" },
    { id: "heim", name: "Dein Heim", short: "Heim" },
    { id: "mondtor", name: "Das Mondtor", short: "Mondtor", npc: "mondhaendler", night: true },
  ];

  SB.data = {
    ATTRS, ATTR_INFO, LORE, REALMS, RACES, TATTOOS, TATTOO_COLORS, SCARS, EYES, HAIR_STYLES, BEARDS,
    ARCHETYPES, CLASSES, REALM_STORY, SLOTS, SLOT_INFO, BASES, RARITIES, RARITY_ORDER, ADJ, SUFFIX, LEGEND_NAMES,
    MONSTER_TYPES, ARCH_TYPE, ARCH_NAMES, MONSTERS, NIGHT_FOES, DUNGEONS, PLACES, PERSONS, QUESTS, RARE_QUESTS, NPC_FIRST, NPC_LAST, GUILD_NAMES,
    POTIONS, MOUNTS, HOUSE_TIERS, FURNITURE, ACHIEVEMENTS, WELL_PRIZES, NPCS, BUILDINGS, TALENT_TIER_REQ, TALENT_EFFECTS, TALENT_ARCH, TALENT_CLASS,
  };
})();
