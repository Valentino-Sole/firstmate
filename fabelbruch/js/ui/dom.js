// UI-Grundgerüst: Elementbau, Bildschirm-Router mit Verlauf (Route "previous"
// stellt vorheriges UI einschließlich Fokus wieder her), Fokusführung für
// Tastatur und Controller, Tooltips und Kurzmeldungen.

import { onUiAction, setUiActiveCheck, input } from '../input.js';
import { sfx } from '../audio.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.append(c);
  }
  return node;
}

export const screenRoot = () => document.getElementById('screen-root');

const router = {
  stack: [],          // {id, render, params, focusIndex}
  current: null,
  focusables: [],
  focusIndex: 0,
  inputLockUntil: 0,
};

export function uiIsActive() {
  return router.current !== null;
}
setUiActiveCheck(uiIsActive);

export function lockInput(ms) {
  router.inputLockUntil = performance.now() + ms;
}

// Einen Bildschirm anzeigen. render(container, params) baut den DOM und gibt
// optional Aufräum-/Fokusinfos zurück. keepStack=false ersetzt den Verlauf.
export function showScreen(id, render, params = {}, opts = {}) {
  if (router.current && !opts.replace) {
    router.current.focusIndex = router.focusIndex;
    router.stack.push(router.current);
  }
  if (opts.clearStack) router.stack = [];
  mount({ id, render, params, focusIndex: 0 });
}

export function replaceScreen(id, render, params = {}) {
  mount({ id, render, params, focusIndex: 0 });
}

export function goBack() {
  const prev = router.stack.pop();
  if (prev) {
    mount(prev, prev.focusIndex);
    return true;
  }
  return false;
}

export function closeAllScreens() {
  router.stack = [];
  router.current = null;
  screenRoot().replaceChildren();
}

export function currentScreenId() {
  return router.current ? router.current.id : null;
}

function mount(entry, restoreFocus = 0) {
  router.current = entry;
  const root = screenRoot();
  root.replaceChildren();
  entry.render(root, entry.params);
  collectFocusables();
  setFocus(Math.min(restoreFocus, Math.max(0, router.focusables.length - 1)));
}

export function refreshScreen() {
  if (router.current) mount(router.current, router.focusIndex);
}

function collectFocusables() {
  const root = screenRoot();
  router.focusables = [...root.querySelectorAll('[data-focus]')]
    .filter((n) => !n.disabled && n.offsetParent !== null);
  // Standardfokus: erstes Element mit data-default-focus, sonst erstes.
  const def = router.focusables.findIndex((n) => n.hasAttribute('data-default-focus'));
  router.focusIndex = def >= 0 ? def : 0;
}

function setFocus(i) {
  if (!router.focusables.length) return;
  router.focusIndex = (i + router.focusables.length) % router.focusables.length;
  for (const n of router.focusables) n.classList.remove('focused');
  const node = router.focusables[router.focusIndex];
  node.classList.add('focused');
  node.focus({ preventScroll: false });
  node.scrollIntoView({ block: 'nearest' });
  sfx.uiFocus();
  showFocusTooltip(node);
}

function spatialMove(dx, dy) {
  const cur = router.focusables[router.focusIndex];
  if (!cur) return;
  const cr = cur.getBoundingClientRect();
  let best = -1;
  let bestScore = Infinity;
  router.focusables.forEach((n, i) => {
    if (i === router.focusIndex) return;
    const r = n.getBoundingClientRect();
    const ox = (r.left + r.right) / 2 - (cr.left + cr.right) / 2;
    const oy = (r.top + r.bottom) / 2 - (cr.top + cr.bottom) / 2;
    const dot = ox * dx + oy * dy;
    if (dot <= 4) return;
    const ortho = Math.abs(ox * dy) + Math.abs(oy * dx);
    const score = dot + ortho * 2.2;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  if (best >= 0) setFocus(best);
}

onUiAction((action) => {
  if (!router.current) return;
  if (performance.now() < router.inputLockUntil) return;
  switch (action) {
    case 'next': setFocus(router.focusIndex + 1); break;
    case 'prev': setFocus(router.focusIndex - 1); break;
    case 'up': spatialMove(0, -1); break;
    case 'down': spatialMove(0, 1); break;
    case 'left': spatialMove(-1, 0); break;
    case 'right': spatialMove(1, 0); break;
    case 'confirm': {
      const node = router.focusables[router.focusIndex];
      if (node) {
        sfx.uiConfirm();
        node.click();
      }
      break;
    }
    case 'back': {
      const root = screenRoot();
      const backTarget = root.querySelector('[data-back-action]');
      if (backTarget) backTarget.click();
      break;
    }
    default: break;
  }
});

// Tooltip: nach 350 ms Hover oder sofort bei Fokus, 24 px Sicherheitsabstand.
let tipNode = null;
let tipTimer = null;

export function attachTooltip(node, contentFn) {
  node.addEventListener('mouseenter', () => {
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => showTip(node, contentFn()), 350);
  });
  node.addEventListener('mouseleave', hideTip);
  node.dataset.hasTooltip = '1';
  node._tooltipContent = contentFn;
}

function showFocusTooltip(node) {
  hideTip();
  if (node._tooltipContent) showTip(node, node._tooltipContent());
}

function showTip(node, content) {
  hideTip();
  if (!content) return;
  tipNode = el('div', { class: 'tooltip' });
  if (typeof content === 'string') tipNode.textContent = content;
  else tipNode.append(content);
  screenRoot().append(tipNode);
  const nr = node.getBoundingClientRect();
  const sr = screenRoot().getBoundingClientRect();
  const tr = tipNode.getBoundingClientRect();
  let x = nr.right - sr.left + 12;
  let y = nr.top - sr.top;
  if (x + tr.width > sr.width - 24) x = Math.max(24, nr.left - sr.left - tr.width - 12);
  if (y + tr.height > sr.height - 24) y = sr.height - tr.height - 24;
  tipNode.style.left = `${x}px`;
  tipNode.style.top = `${Math.max(24, y)}px`;
}

export function hideTip() {
  clearTimeout(tipTimer);
  if (tipNode) { tipNode.remove(); tipNode = null; }
}

export function toast(text) {
  const root = document.getElementById('toast-root');
  const node = el('div', { class: 'toast', text });
  root.append(node);
  setTimeout(() => node.remove(), 2600);
}

export function svgIcon(path, cls = 'icon') {
  return el('img', { src: path, class: cls, alt: '' });
}
