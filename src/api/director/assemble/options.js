/**
 * Assembly options — the knobs of plan → fragment, derived from the
 * adaptation's format and the directive's params.
 * @module api/director/assemble/options
 */

import { SCENE_TOLERANCE } from './usable.js';

/**
 * @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo
 * @typedef {{ fps: number, width: number, height: number }} Format
 * @typedef {Object} AssembleOptions
 * @property {number} fps
 * @property {number} width - Output resolution
 * @property {number} height
 * @property {number} target - Target length in seconds (caps open-ended speech picks)
 * @property {boolean} tighten - Cut pauses out of speech picks
 * @property {number} threshold - Pause length that gets cut, seconds
 * @property {number} padding - Breathing room kept around speech, seconds
 * @property {boolean} beatSync - Land picture cuts on the beats of the music bed
 * @property {number} beatEvery - Use every Nth beat
 * @property {'low'|'full'|'off'} naturalSound - What to do with b-roll sound
 * @property {boolean} autoBroll - Cover pictureless speech and jump cuts
 * @property {number} shotDuration - Length of an open-ended picture pick, seconds
 * @property {number} stillDuration - Length of a still, seconds
 * @property {number} sceneTolerance - A picture cut this close to a shot boundary moves onto it
 * @property {MediaInfo[]} pool - Picture material auto b-roll may draw on
 */

/** Shot lengths per pacing, in seconds. */
export const PACING = {
  slow: { shot: 5.5, still: 6 },
  medium: { shot: 3.5, still: 4.5 },
  fast: { shot: 2, still: 2.5 },
};

/**
 * @param {Format} format
 * @param {Record<string, any>} [params] - Directive params (see the action schemas)
 * @param {Partial<AssembleOptions>} [extra]
 * @returns {AssembleOptions}
 */
export function assembleOptions(format, params = {}, extra = {}) {
  const pace = PACING[params.pacing] || PACING.medium;
  return {
    fps: format.fps,
    width: format.width,
    height: format.height,
    target: Number(params.duration) || 60,
    tighten: params.tighten !== false,
    threshold: Number(params.threshold) || 0.8,
    padding: Number.isFinite(params.padding) ? params.padding : 0.1,
    beatSync: params.beatSync !== false,
    beatEvery: 1,
    naturalSound: ['low', 'full', 'off'].includes(params.naturalSound)
      ? params.naturalSound
      : 'low',
    autoBroll: params.autoBroll !== false,
    shotDuration: pace.shot,
    stillDuration: pace.still,
    sceneTolerance: SCENE_TOLERANCE,
    pool: [],
    ...extra,
  };
}

/**
 * Counters the assembler keeps so the result can say what it did.
 * @returns {{ wordAligned: number, segmentOnly: number, sceneSnapped: number,
 *   pausesRemoved: number, secondsRemoved: number, beatCuts: number, autoBroll: number,
 *   uses: Map<string, number>, notes: string[] }}
 */
export function createStats() {
  return {
    wordAligned: 0,
    segmentOnly: 0,
    sceneSnapped: 0,
    pausesRemoved: 0,
    secondsRemoved: 0,
    beatCuts: 0,
    autoBroll: 0,
    uses: new Map(),
    notes: [],
  };
}
