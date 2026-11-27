/**
 * One-click Ken Burns moves. Each preset is a complete `transform.kenBurns`
 * block: pans start a little zoomed in, so the picture never shows its
 * edge while it travels. Semantics: docs/app-spec/EDL.md § kenBurns. Pure.
 * @module utils/inspector/kenBurns
 */

import { defaultKenBurns, parseResolution } from '#utils/edl/factory.js';

/** Zoom used while panning; leaves room to travel `PAN` of the frame each way. */
const PAN_ZOOM = 1.15;
const PAN = 0.06;

/** @type {{ id: string, label: string, icon: string }[]} */
export const KEN_BURNS_PRESETS = [
  { id: 'zoom-in', label: 'Slow zoom in', icon: 'zoom-in' },
  { id: 'zoom-out', label: 'Slow zoom out', icon: 'zoom-out' },
  { id: 'pan-left', label: 'Pan left', icon: 'chevron-left' },
  { id: 'pan-right', label: 'Pan right', icon: 'chevron' },
  { id: 'pan-up', label: 'Pan up', icon: 'chevron-up' },
  { id: 'pan-down', label: 'Pan down', icon: 'chevron-down' },
];

/**
 * The kenBurns block of a preset for an output frame size.
 * @param {string} id - One of `KEN_BURNS_PRESETS`
 * @param {string} resolution - Document resolution, e.g. `1920x1080`
 * @returns {Record<string, number|boolean>|null} null for an unknown preset
 */
export function kenBurnsPreset(id, resolution) {
  const { width, height } = parseResolution(resolution);
  const dx = Math.round(width * PAN);
  const dy = Math.round(height * PAN);
  const pan = { startScale: PAN_ZOOM, endScale: PAN_ZOOM };
  /** @type {Record<string, Record<string, number>>} */
  const moves = {
    'zoom-in': { startScale: 1, endScale: 1.2 },
    'zoom-out': { startScale: 1.2, endScale: 1 },
    'pan-left': { ...pan, startX: dx, endX: -dx },
    'pan-right': { ...pan, startX: -dx, endX: dx },
    'pan-up': { ...pan, startY: dy, endY: -dy },
    'pan-down': { ...pan, startY: -dy, endY: dy },
  };
  return moves[id] ? { ...defaultKenBurns(), ...moves[id], enabled: true } : null;
}

/**
 * Which preset a kenBurns block is, so its button can show as active.
 * @param {Record<string, any>} kenBurns
 * @param {string} resolution
 * @returns {string} Preset id, or '' when it matches none (or is disabled)
 */
export function matchingPreset(kenBurns, resolution) {
  if (!kenBurns?.enabled) return '';
  const same = (/** @type {Record<string, any>} */ preset) =>
    Object.keys(preset).every(
      (key) => Math.abs(Number(preset[key]) - Number(kenBurns[key])) < 1e-6,
    );
  return KEN_BURNS_PRESETS.find(({ id }) => same(kenBurnsPreset(id, resolution)))?.id || '';
}
