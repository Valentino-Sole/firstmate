// Gemeinsame App-Fassade: main.js füllt sie, UI-Module greifen darauf zu.
// Vermeidet Kreisimporte zwischen Spiel-Schleife und Bildschirmen.

export const App = {
  options: null,
  run: null,            // aktiver Lauf (Run-Instanz) oder null
  startingWeapon: 'W001',
  selectedArena: null,
  // von main.js gesetzte Funktionen:
  startRun: null,
  resumeRun: null,
  backToMenu: null,
  applyOptions: null,
  playScene: null,
  showTutorial: null,
  quitGame: null,
  saveRetry: null,
};
