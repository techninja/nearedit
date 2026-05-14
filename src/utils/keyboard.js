/**
 * Keyboard shortcut handler — configurable NLE-style keybindings.
 * SPACE: play/pause with return to cursor on stop.
 * ENTER: play/pause with cursor reset on stop.
 * @module utils/keyboard
 */

import { store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { pushState, undo, redo } from '#utils/undoHistory.js';
import { totalDuration } from '#utils/timelineMath.js';

/** @type {number} */
let rafId = 0;
let lastTime = 0;

/** Default keymap — key → action name */
const DEFAULT_KEYMAP = {
  ' ': 'playPauseReturn',
  Enter: 'playPauseReset',
  j: 'rewind',
  k: 'stop',
  l: 'forward',
  Home: 'goStart',
  End: 'goEnd',
  ArrowLeft: 'framePrev',
  ArrowRight: 'frameNext',
  'ctrl+z': 'undo',
  'ctrl+shift+z': 'redo',
  'meta+z': 'undo',
  'meta+shift+z': 'redo',
};

/** @type {Record<string, string>} */
let keymap = { ...DEFAULT_KEYMAP };

/** Load custom keymap from localStorage if present */
function loadKeymap() {
  const raw = localStorage.getItem('nearedit_keymap');
  if (raw) keymap = { ...DEFAULT_KEYMAP, ...JSON.parse(raw) };
}

/** Save current keymap */
export function saveKeymap(map) {
  keymap = { ...DEFAULT_KEYMAP, ...map };
  localStorage.setItem('nearedit_keymap', JSON.stringify(map));
}

/** @returns {Record<string, string>} */
export function getKeymap() { return { ...keymap }; }

function startPlayback() {
  const state = store.get(TimelineState);
  if (!state) return;
  const dur = totalDuration(state.tracks || []);
  lastTime = performance.now();
  let lastStoreUpdate = 0;

  const tick = (now) => {
    const s = store.get(TimelineState);
    if (!s || !s.playing) return;
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    const pos = s.playheadPosition + dt;

    if (pos >= dur) {
      store.set(TimelineState, { ...s, playing: false, playheadPosition: dur });
      return;
    }

    // Throttle store updates to ~20fps for timeline UI — compositor runs independently
    if (now - lastStoreUpdate > 50) {
      store.set(TimelineState, { ...s, playheadPosition: pos });
      lastStoreUpdate = now;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function stopPlayback() {
  cancelAnimationFrame(rafId);
  rafId = 0;
}

/** Action handlers */
const actions = {
  /** SPACE — play/pause, returns to cursor position on stop */
  playPauseReturn() {
    const s = store.get(TimelineState);
    if (!s) return;
    if (s.playing) {
      stopPlayback();
      store.set(TimelineState, { ...s, playing: false, playheadPosition: s.cursorPosition });
    } else {
      store.set(TimelineState, { ...s, playing: true, cursorPosition: s.playheadPosition });
      startPlayback();
    }
  },

  /** ENTER — play/pause, cursor follows playhead on stop */
  playPauseReset() {
    const s = store.get(TimelineState);
    if (!s) return;
    if (s.playing) {
      stopPlayback();
      store.set(TimelineState, { ...s, playing: false, cursorPosition: s.playheadPosition });
    } else {
      store.set(TimelineState, { ...s, playing: true });
      startPlayback();
    }
  },

  stop() {
    const s = store.get(TimelineState);
    if (!s) return;
    stopPlayback();
    store.set(TimelineState, { ...s, playing: false, playheadPosition: s.cursorPosition });
  },

  rewind() {
    const s = store.get(TimelineState);
    if (!s) return;
    store.set(TimelineState, { ...s, playheadPosition: Math.max(0, s.playheadPosition - 2) });
  },

  forward() {
    const s = store.get(TimelineState);
    if (!s) return;
    const dur = totalDuration(s.tracks || []);
    store.set(TimelineState, { ...s, playheadPosition: Math.min(dur, s.playheadPosition + 2) });
  },

  goStart() {
    const s = store.get(TimelineState);
    if (s) store.set(TimelineState, { ...s, playheadPosition: 0, cursorPosition: 0 });
  },

  goEnd() {
    const s = store.get(TimelineState);
    if (!s) return;
    const dur = totalDuration(s.tracks || []);
    store.set(TimelineState, { ...s, playheadPosition: dur, cursorPosition: dur });
  },

  framePrev() {
    const s = store.get(TimelineState);
    if (!s) return;
    const frame = 1 / s.fps;
    store.set(TimelineState, { ...s, playheadPosition: Math.max(0, s.playheadPosition - frame) });
  },

  frameNext() {
    const s = store.get(TimelineState);
    if (!s) return;
    const frame = 1 / s.fps;
    const dur = totalDuration(s.tracks || []);
    store.set(TimelineState, { ...s, playheadPosition: Math.min(dur, s.playheadPosition + frame) });
  },

  undo() {
    const s = store.get(TimelineState);
    if (!s) return;
    const prev = undo(s);
    if (prev) store.set(TimelineState, prev);
  },

  redo() {
    const s = store.get(TimelineState);
    if (!s) return;
    const next = redo(s);
    if (next) store.set(TimelineState, next);
  },
};

/**
 * Build a normalized key string from a KeyboardEvent.
 * @param {KeyboardEvent} e
 * @returns {string}
 */
function keyString(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.metaKey) parts.push('meta');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  const key = e.key === ' ' ? ' ' : e.key;
  if (!['Control', 'Meta', 'Shift', 'Alt'].includes(key)) parts.push(key);
  return parts.join('+');
}

/** @param {KeyboardEvent} e */
function handleKeydown(e) {
  // Don't capture when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

  const key = keyString(e);
  const action = keymap[key];
  if (action && actions[action]) {
    e.preventDefault();
    actions[action]();
  }
}

/** Start listening for keyboard shortcuts. Call once on app init. */
export function initKeyboard() {
  loadKeymap();
  document.addEventListener('keydown', handleKeydown);
}

/** Stop listening. */
export function destroyKeyboard() {
  document.removeEventListener('keydown', handleKeydown);
  stopPlayback();
}
