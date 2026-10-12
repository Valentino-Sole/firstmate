// Eingabe: Maus/Tastatur und Controller (ui-spezifikation.json "input_rules").
// Kampf: WASD/Pfeile bewegen, Leertaste/Shift ausweichen, ESC Pause.
// UI: Tab/Shift+Tab und Pfeile navigieren, Enter bestätigt, ESC zurück.
// Controller: Stick/D-Pad folgt visueller Reihenfolge, A bestätigt, B zurück.

export const input = {
  keys: new Set(),
  moveX: 0,
  moveY: 0,
  dodgePressed: false,
  pausePressed: false,
  usingGamepad: false,
  bindings: {
    move: 'WASD / Pfeiltasten',
    dodge: 'Leertaste',
  },
};

const uiHandlers = [];
let gamepadPrev = {};

export function onUiAction(fn) {
  uiHandlers.push(fn);
}

function emitUi(action) {
  for (const fn of uiHandlers) fn(action);
}

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) e.preventDefault();
      return;
    }
    input.usingGamepad = false;
    input.keys.add(e.code);
    switch (e.key) {
      case 'Escape': input.pausePressed = true; emitUi('back'); e.preventDefault(); break;
      case 'Enter': emitUi('confirm'); break;
      case ' ': input.dodgePressed = true; if (uiActive()) { emitUi('confirm'); e.preventDefault(); } break;
      case 'Shift': input.dodgePressed = true; break;
      case 'Tab': emitUi(e.shiftKey ? 'prev' : 'next'); e.preventDefault(); break;
      case 'ArrowUp': emitUi('up'); if (uiActive()) e.preventDefault(); break;
      case 'ArrowDown': emitUi('down'); if (uiActive()) e.preventDefault(); break;
      case 'ArrowLeft': emitUi('left'); if (uiActive()) e.preventDefault(); break;
      case 'ArrowRight': emitUi('right'); if (uiActive()) e.preventDefault(); break;
      default: break;
    }
  });
  window.addEventListener('keydown', (e) => {
    // Kampfeingaben dürfen nie in Dialoge durchreichen (UI21-Regel);
    // der Fokus-Manager entscheidet über uiActive().
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
  });
  window.addEventListener('blur', () => input.keys.clear());
}

let uiActiveFn = () => false;
export function setUiActiveCheck(fn) {
  uiActiveFn = fn;
}
function uiActive() {
  return uiActiveFn();
}

export function pollMovement() {
  let x = 0;
  let y = 0;
  const k = input.keys;
  if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
  if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) y += 1;

  // Controller: linker Stick oder D-Pad.
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p || !p.connected) continue;
    const ax = p.axes[0] || 0;
    const ay = p.axes[1] || 0;
    if (Math.abs(ax) > 0.25) { x += ax; input.usingGamepad = true; }
    if (Math.abs(ay) > 0.25) { y += ay; input.usingGamepad = true; }
    if (btn(p, 14)) x -= 1;
    if (btn(p, 15)) x += 1;
    if (btn(p, 12)) y -= 1;
    if (btn(p, 13)) y += 1;
  }

  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  input.moveX = x;
  input.moveY = y;
}

function btn(pad, i) {
  return pad.buttons[i] && pad.buttons[i].pressed;
}

// Controller-Tasten als UI-Ereignisse; einmal pro Druck.
export function pollGamepadUi() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p || !p.connected) continue;
    const now = {};
    const map = { 0: 'confirm', 1: 'back', 12: 'up', 13: 'down', 14: 'left', 15: 'right', 9: 'pause' };
    for (const [idx, action] of Object.entries(map)) {
      const pressed = btn(p, Number(idx));
      now[idx] = pressed;
      if (pressed && !gamepadPrev[p.index + ':' + idx]) {
        input.usingGamepad = true;
        if (action === 'pause') { input.pausePressed = true; emitUi('back'); }
        else emitUi(action);
      }
      gamepadPrev[p.index + ':' + idx] = pressed;
    }
    // Stick-Navigation im UI (mit Totzone und Flankenerkennung)
    const ax = p.axes[0] || 0;
    const ay = p.axes[1] || 0;
    stickEdge(p.index + ':sx', ax, 'left', 'right');
    stickEdge(p.index + ':sy', ay, 'up', 'down');
    // A als Ausweichen im Kampf
    if (btn(p, 0) && !uiActive()) input.dodgePressed = true;
  }
}

function stickEdge(key, value, negAction, posAction) {
  const prev = gamepadPrev[key] || 0;
  const zone = (v) => (v < -0.6 ? -1 : v > 0.6 ? 1 : 0);
  const z = zone(value);
  if (z !== 0 && z !== zone(prev)) emitUi(z < 0 ? negAction : posAction);
  gamepadPrev[key] = value;
}

export function consumeDodge() {
  const v = input.dodgePressed;
  input.dodgePressed = false;
  return v;
}

export function consumePause() {
  const v = input.pausePressed;
  input.pausePressed = false;
  return v;
}
