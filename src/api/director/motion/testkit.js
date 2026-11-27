/**
 * Test helpers for the motion builder: a brief with short and long lines,
 * the three frame shapes, a built and merged piece, and comparisons that
 * ignore generated ids. Not part of the runtime — import it from tests.
 * @module api/director/motion/testkit
 */

import { applyDirectorResult } from '#utils/edl/apply.js';
import { createEdl } from '#utils/edl/factory.js';
import { validateEdl } from '#utils/edl/validate.js';
import { briefScenes } from './brief.js';
import { buildMotion } from './build.js';
import { completePlan } from './complete.js';

/** A brief with a one-word title, subtitles, and lines long enough to wrap. */
export const BRIEF = `Made from nothing | no footage · no images · only layers
Generators
Keyframes, eased — every number can move
A much longer line that has to wrap onto several lines to fit the frame | and a subtitle that is itself rather long, to see how two wrapped blocks sit together
Thank you`;

/** The frame shapes every piece has to work in. */
export const FORMATS = [
  { name: '16:9', fps: 30, width: 1920, height: 1080 },
  { name: '9:16', fps: 30, width: 1080, height: 1920 },
  { name: '1:1', fps: 30, width: 1080, height: 1080 },
];

/**
 * A complete plan for the test brief.
 * @param {{ theme?: string, seed?: number|string, particles?: string, brief?: string,
 *   scene?: object }} [opts] - `scene`: choices forced on every scene
 * @returns {import('./complete.js').CompletePlan}
 */
export function planFor(opts = {}) {
  const words = briefScenes(opts.brief || BRIEF).scenes;
  const scenes = words.map((scene) => ({ ...scene, ...(opts.scene || {}) }));
  return completePlan({ scenes }, { seed: 1, ...opts }).plan;
}

/**
 * Build a piece and wrap it as a `replace` DirectorResult.
 * @param {import('./complete.js').CompletePlan} plan
 * @param {Partial<import('./build.js').BuildOptions>} [opts]
 * @returns {{ built: import('./build.js').Built, result: any, format: any }}
 */
export function buildPiece(plan, opts = {}) {
  const format = opts.format || FORMATS[0];
  const built = buildMotion(plan, { seed: 1, pacing: 'medium', ...opts, format });
  const result = {
    mode: 'replace',
    at: 0,
    range: null,
    tracks: built.tracks,
    markers: built.markers,
    duration: built.seconds,
    summary: 'A motion piece',
    notes: built.notes,
    plan,
  };
  return { built, result, format };
}

/**
 * Merge a result into an empty document of the format and validate it.
 * @param {any} result - DirectorResult
 * @param {{ fps: number, width: number, height: number }} format
 * @returns {{ edl: any, problems: { path: string, message: string }[] }}
 */
export function mergePiece(result, format) {
  const empty = createEdl({ fps: format.fps, resolution: `${format.width}x${format.height}` });
  const edl = applyDirectorResult(empty, result);
  return { edl, problems: validateEdl(edl).problems };
}

/**
 * The clips of a row, by its name.
 * @param {{ tracks: { name: string, clips: any[] }[] }} built
 * @param {string} name
 * @returns {any[]}
 */
export const row = (built, name) => built.tracks.find((track) => track.name === name).clips;

/**
 * Tracks and markers without the ids that differ from run to run.
 * @param {{ tracks: any[], markers: any[] }} built
 * @returns {object}
 */
export function withoutIds(built) {
  return JSON.parse(
    JSON.stringify({ tracks: built.tracks, markers: built.markers }, (key, value) =>
      key === 'clipId' || key === 'markerId' ? undefined : value,
    ),
  );
}
