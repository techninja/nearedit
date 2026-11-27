/**
 * Fixtures for the plan builder unit tests: fake probes and short-hands for
 * building EDLs and picking chains out of a filter graph.
 * @module api/render/planKit
 */

import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import { buildRenderPlan } from './plan.js';

const HD = {
  ...{ hasVideo: true, hasAudio: true, width: 1920, height: 1080 },
  ...{ channels: 2, pixFmt: 'yuv420p' },
};

/** Probe results for the files the tests refer to. */
export const probes = {
  '/m/a.mp4': HD,
  '/m/b.mp4': HD,
  '/m/phone.mp4': { ...HD, rotation: -90 },
  '/m/photo 100%.jpg': {
    hasVideo: true,
    hasAudio: false,
    width: 4000,
    height: 3000,
    codec: 'mjpeg',
  },
  '/m/voice.wav': { hasVideo: false, hasAudio: true, channels: 1 },
  '/m/music.mp3': { hasVideo: false, hasAudio: true, channels: 2 },
};

/**
 * A clip of a file whose id says what it is ("a.mp4@2").
 * @param {string} file
 * @param {number} start
 * @param {number} end
 * @param {object} [more]
 * @returns {any}
 */
export function clip(file, start, end, more = {}) {
  return createClip({
    ...{ clipId: `${file.split('/').pop()}@${start}`, sourceFile: file, sourceIn: 0 },
    ...{ sourceOut: end - start, timelineStart: start, timelineEnd: end, ...more },
  });
}

/** @param {any[]} clips @param {object} [more] @returns {any} */
export const video = (clips, more = {}) => createTrack('video', { clips, ...more });

/** @param {any[]} clips @param {object} [more] @returns {any} */
export const audio = (clips, more = {}) => createTrack('audio', { clips, ...more });

/**
 * Build a plan for tracks with the fixture probes.
 * @param {any[]} tracks
 * @param {object} [options] - Plan options
 * @param {object} [more] - EDL fields (resolution, fps)
 * @returns {import('./plan.js').RenderPlan}
 */
export function plan(tracks, options = {}, more = {}) {
  return buildRenderPlan(createEdl({ tracks, ...more }), { probes, ...options });
}

/** @param {{ filterComplex: string }} p @returns {string[]} */
export const chains = (p) => p.filterComplex.split(';\n');

/**
 * The chain that ends in a label.
 * @param {{ filterComplex: string }} p
 * @param {string} label
 * @returns {string|undefined}
 */
export const chainOf = (p, label) => chains(p).find((chain) => chain.endsWith(`[${label}]`));

/** @param {string} text @param {string} needle @returns {number} */
export const count = (text, needle) => text.split(needle).length - 1;
