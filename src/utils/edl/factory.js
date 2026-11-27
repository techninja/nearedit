/**
 * EDL factories — the single source of default shapes for tracks and clips.
 * Isomorphic: runs in the browser and in Node. No DOM, no hybrids.
 * Schema reference: docs/app-spec/EDL.md.
 * @module utils/edl/factory
 */

import {
  EDL_VERSION,
  defaultGenerator,
  defaultKenBurns,
  defaultText,
  defaultTextAnimation,
  defaultTransform,
} from './defaults.js';

export * from './defaults.js';
export { clipKind } from './clipKind.js';

let counter = 0;

/**
 * Generate a short unique id.
 * @param {string} [prefix='clip']
 * @returns {string}
 */
export function newId(prefix = 'clip') {
  counter = (counter + 1) % 1e6;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

/**
 * Create a fully populated clip. Nested text / transform / generator
 * overrides are merged into their defaults. Without a `sourceOut` the clip
 * gets the source window its timeline span asks for
 * (`sourceIn + timelineEnd − timelineStart`, invariant 1).
 * @param {object} [overrides]
 * @returns {object}
 */
export function createClip(overrides = {}) {
  const { text, transform, generator, ...rest } = overrides;
  const kenBurns = { ...defaultKenBurns(), ...(transform?.kenBurns || {}) };
  const animateIn = { ...defaultTextAnimation(), ...(text?.animateIn || {}) };
  const animateOut = { ...defaultTextAnimation(), ...(text?.animateOut || {}) };
  const clip = {
    clipId: newId('clip'),
    sourceFile: '',
    sourceIn: 0,
    sourceOut: 0,
    timelineStart: 0,
    timelineEnd: 0,
    fadeIn: 0,
    fadeOut: 0,
    volume: 1,
    linkedClipId: '',
    groupId: '',
    placeholder: false,
    label: '',
    prompt: '',
    intent: '',
    color: '',
    blendMode: 'normal',
    fadeInCurve: 'linear',
    fadeOutCurve: 'linear',
    effects: [],
    keyframes: {},
    ...rest,
    generator: { ...defaultGenerator(), ...(generator || {}) },
    text: { ...defaultText(), ...(text || {}), animateIn, animateOut },
    transform: { ...defaultTransform(), ...(transform || {}), kenBurns },
  };
  if (rest.sourceOut === undefined) {
    clip.sourceOut = clip.sourceIn + (clip.timelineEnd - clip.timelineStart);
  }
  return clip;
}

/**
 * Create a track.
 * @param {'video'|'audio'} type
 * @param {object} [overrides]
 * @returns {object}
 */
export function createTrack(type, overrides = {}) {
  return {
    trackId: newId(type === 'audio' ? 'a' : 'v'),
    type,
    name: type === 'audio' ? 'Audio' : 'Video',
    muted: false,
    solo: false,
    locked: false,
    volume: 1,
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    clips: [],
    ...overrides,
  };
}

/** @returns {object[]} The default track set of an empty timeline. */
export function DEFAULT_TRACKS() {
  return [
    createTrack('video', { trackId: 'v1', name: 'Video 1' }),
    createTrack('audio', { trackId: 'a1', name: 'Audio 1' }),
  ];
}

/**
 * Create an empty EDL document.
 * @param {object} [overrides]
 * @returns {object}
 */
export function createEdl(overrides = {}) {
  return {
    version: EDL_VERSION,
    fps: 30,
    resolution: '1920x1080',
    background: '#000000',
    tracks: DEFAULT_TRACKS(),
    markers: [],
    regions: [],
    ...overrides,
  };
}

/**
 * Parse a "WxH" resolution string.
 * @param {string} resolution
 * @returns {{ width: number, height: number }}
 */
export function parseResolution(resolution) {
  const [w, h] = String(resolution || '1920x1080')
    .split('x')
    .map(Number);
  return { width: w || 1920, height: h || 1080 };
}
