// Speichern/Laden mit sicheren Punkten (systeme/spielablauf.json "save").
// Drei getrennte lokale Profile (UI02). Dauerhaft bleiben: freigeschaltete
// Arenen, erste Siege, entdeckte Monster, gesehene Dialoge, Erinnerungen,
// Werkstattboni, Optionen. Lauf-Daten liegen in einem eigenen Schnappschuss.
// Ein Speicherfehler wird nie verschluckt: Aufrufer erhalten false und
// zeigen UI26 (Speicherfehler) mit erneutem Versuch.

const KEY_PREFIX = 'fabelbruch.v1.';
const OPTIONS_KEY = KEY_PREFIX + 'options';

export const save = {
  profileNumber: null,
  data: null,        // persistenter Teil des aktiven Profils
  lastError: null,
};

function freshProfile(number) {
  return {
    number,
    createdAt: Date.now(),
    unlockedArenas: ['AR01'],
    firstVictories: [],          // Boss-IDs mit Erstsieg
    discoveredMonsters: [],      // Monster-IDs
    discoveredBosses: [],        // Boss-IDs
    seenScenes: [],              // Szenen-IDs (once_per_profile)
    seenTutorials: [],           // tutorial.*-IDs
    memories: 0,                 // Erinnerungen (Werkstattwährung)
    workshop: {},                // P01..P03 -> Rang
    startingWeapon: 'W001',
    lastArena: 'AR01',
    run: null,                   // Lauf-Schnappschuss oder null
  };
}

export function defaultOptions() {
  return {
    language: 'de',
    uiScale: 100,          // 80–140 %
    reducedMotion: false,
    highContrast: false,
    noFlash: false,
    textSpeed: 1,
    audioVolume: 0.6,
    criticalPulse: true,   // Randpuls bei kritischem Leben (abschaltbar)
  };
}

export function loadOptions() {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (!raw) return defaultOptions();
    return { ...defaultOptions(), ...JSON.parse(raw) };
  } catch {
    return defaultOptions();
  }
}

export function saveOptions(options) {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
    return true;
  } catch (e) {
    save.lastError = String(e);
    return false;
  }
}

export function listProfiles() {
  const out = [];
  for (const n of [1, 2, 3]) {
    try {
      const raw = localStorage.getItem(KEY_PREFIX + 'profil' + n);
      out.push(raw ? JSON.parse(raw) : null);
    } catch {
      out.push(null);
    }
  }
  return out;
}

export function createProfile(number) {
  save.profileNumber = number;
  save.data = freshProfile(number);
  return persist();
}

export function openProfile(number) {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + 'profil' + number);
    if (!raw) return false;
    save.profileNumber = number;
    save.data = JSON.parse(raw);
    return true;
  } catch (e) {
    save.lastError = String(e);
    return false;
  }
}

export function deleteProfile(number) {
  try {
    localStorage.removeItem(KEY_PREFIX + 'profil' + number);
    return true;
  } catch (e) {
    save.lastError = String(e);
    return false;
  }
}

// Sicherer Punkt: schreibt das aktive Profil vollständig und meldet Erfolg.
export function persist() {
  if (!save.data) return true;
  try {
    localStorage.setItem(KEY_PREFIX + 'profil' + save.profileNumber, JSON.stringify(save.data));
    save.lastError = null;
    return true;
  } catch (e) {
    save.lastError = String(e);
    return false;
  }
}

export function markSceneSeen(sceneId) {
  if (!save.data.seenScenes.includes(sceneId)) {
    save.data.seenScenes.push(sceneId);
  }
  return persist();
}

export function discoverMonster(id) {
  const list = id.startsWith('B') ? save.data.discoveredBosses : save.data.discoveredMonsters;
  if (!list.includes(id)) {
    list.push(id);
    return { isNew: true, ok: persist() };
  }
  return { isNew: false, ok: true };
}

export function addMemories(n) {
  save.data.memories += n;
  return persist();
}
