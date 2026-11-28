/**
 * Zoom keyframes for a recording, made from its track. Zooming is not
 * recorded: it is ordinary transform keyframes on the clip — scale up about
 * a step's target, hold, ease back — that can afterwards be moved, re-eased
 * or deleted like any others. The maths is the compositor's placement
 * (EDL.md § transform): the recording is fitted `cover` into the frame,
 * scaled about the centre, then offset by `x`, `y` in output pixels. It
 * assumes the clip is not cropped or rotated. Isomorphic and pure.
 * @module utils/web/zoom
 */

import { DEFAULT_EASE } from './limits.js';
import { stepKind } from './stepKinds.js';
import { zoomState, zoomView } from './zoomMath.js';

/** @typedef {import('./types.js').Track} Track */
/** @typedef {import('./zoomMath.js').ZoomState} ZoomState */
/** @typedef {{ t: number, v: number, ease: string }} Key */
/** @typedef {{ t: number, state: ZoomState, ease: string }} Point */

/**
 * @typedef {Object} ZoomOptions
 * @property {boolean} [clicks=false] - Zoom on every click and typed-into field too
 * @property {number} [margin=0.35] - Room kept around the target on every
 *   side, as a share of its size
 * @property {number} [fill=0.6] - The most of the frame the target with its
 *   margin may fill, in either direction
 * @property {number} [maxZoom=2.2] - Never closer than this
 * @property {number} [release=0.6] - Seconds to ease back to the whole page
 * @property {number} [join=1.5] - When the next zoom starts within this many
 *   seconds, stay close and glide straight to it
 * @property {string} [ease='ease-in-out'] - Easing of the moves
 * @property {string} [fit='cover'] - The clip's `transform.fit`
 * @property {{ steps?: any[] }} [recipe] - The recipe of the recording: a
 *   `focus` step's own `zoom` is read from it when the track does not note it
 */

/** The four animated paths, with how each reads a state. */
export const ZOOM_PATHS = Object.freeze({
  'transform.scaleX': 'scale',
  'transform.scaleY': 'scale',
  'transform.x': 'x',
  'transform.y': 'y',
});

const REST = Object.freeze({ scale: 1, x: 0, y: 0 });
const SAME_T = 1e-6;
const same = (a, b) => a.scale === b.scale && a.x === b.x && a.y === b.y;

/**
 * Add a moment to the path. Two different states at one instant are a cut:
 * the earlier state is held up to that instant.
 * @param {Point[]} points - In time order; changed in place
 * @param {number} t
 * @param {ZoomState} state
 * @param {string} ease - Easing of the move that leaves this moment
 */
function addPoint(points, t, state, ease) {
  const last = points[points.length - 1];
  if (!last || t - last.t > SAME_T) return void points.push({ t, state, ease });
  if (!same(last.state, state)) {
    const before = points[points.length - 2];
    if (before) before.ease = 'hold';
    else if (last.t > SAME_T) points.unshift({ t: 0, state: last.state, ease: 'hold' });
  }
  last.state = state;
  last.ease = ease;
}

/**
 * The steps of a track that are zoom cues, each with the state it zooms to.
 * @param {Track} track
 * @param {import('./zoomMath.js').ZoomView} view
 * @param {ZoomOptions} options
 * @returns {{ start: number, actionEnd: number, end: number, state: ZoomState }[]}
 */
function zoomCues(track, view, options) {
  const steps = Array.isArray(track?.steps) ? track.steps : [];
  const cues = [];
  for (const step of steps) {
    const camera = stepKind(step?.do)?.camera;
    if (!camera || (camera === 'clicks' && !options.clicks) || step.missing) continue;
    const written = options.recipe?.steps?.[step.index];
    const own = step.zoom ?? (written?.do === step.do ? written.zoom : undefined);
    const state = zoomState(step.rect, own, view, options);
    const times = [step.start, step.actionEnd, step.end];
    if (!state || !times.every(Number.isFinite)) continue;
    cues.push({ start: step.start, actionEnd: step.actionEnd, end: step.end, state });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/**
 * Keyframes that zoom a recording in on its `focus` steps — and, with
 * `options.clicks`, on what is clicked and typed into. For each cue the
 * picture scales up about the target during the step's `duration`, stays
 * through its `hold`, and eases back to the whole page over
 * `options.release` — unless the next cue starts within `options.join`,
 * in which case it stays close and glides straight to that one.
 * @param {Track} track - The track of a recording
 * @param {{ width: number, height: number }} frame - The output frame
 * @param {ZoomOptions} [options]
 * @returns {Record<string, Key[]>} Keys for `transform.scaleX`, `scaleY`,
 *   `x` and `y`, `t` in seconds of the recording (the clip's source time).
 *   Every list is empty when nothing is to be zoomed
 */
export function zoomKeyframes(track, frame, options = {}) {
  const view = zoomView(track, frame, options.fit);
  const cues = view ? zoomCues(track, view, options) : [];
  const ease = typeof options.ease === 'string' ? options.ease : DEFAULT_EASE;
  const join = Number.isFinite(options.join) ? Math.max(0, options.join) : 1.5;
  const release = Number.isFinite(options.release) ? Math.max(0, options.release) : 0.6;
  const fps = track?.fps > 0 ? track.fps : 0;
  const onGrid = (t) => (fps ? Math.round(t * fps) / fps : t);
  /** @type {Point[]} */
  const points = [];
  cues.forEach((cue, i) => {
    const previous = cues[i - 1];
    const next = cues[i + 1];
    const joined = previous && cue.start - previous.end <= join;
    addPoint(points, cue.start, joined ? previous.state : REST, ease);
    addPoint(points, cue.actionEnd, cue.state, 'linear');
    addPoint(points, cue.end, cue.state, ease);
    if (next && next.start - cue.end <= join) return;
    const back = Math.max(cue.end, onGrid(cue.end + release));
    addPoint(points, next ? Math.min(back, next.start) : back, REST, 'linear');
  });
  /** @type {Record<string, Key[]>} */
  const keyframes = {};
  for (const [path, field] of Object.entries(ZOOM_PATHS)) {
    keyframes[path] = points.map(({ t, state, ease: leaving }) => ({
      t,
      v: state[field],
      ease: leaving,
    }));
  }
  return keyframes;
}
