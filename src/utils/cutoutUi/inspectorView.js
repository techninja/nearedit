/**
 * What the inspector's "Cut out person" group shows for a selection, as
 * data: which of the selected clips can be cut out, whether the cutout is
 * on (for all, some or none of them), the settings they share, where each
 * media file's cutout stands, which placement they are in, and which looks
 * they have. The component only draws this. Pure and isomorphic.
 * @module utils/cutoutUi/inspectorView
 */

import { CUTOUT_FIELDS, normalizeCutout } from '#utils/cutout/index.js';
import { parseResolution } from '#utils/edl/factory.js';
import { cutoutState } from '#utils/edl/index.js';
import { paramControls } from '#utils/inspector/paramControls.js';
import { isSubject, statusOf } from './clipStatus.js';
import { availableLooks, hasLook } from './looks.js';
import { placementOf } from './placements.js';
import { fileName } from './state.js';

/** @typedef {import('#utils/inspector/model.js').InspectorModel} InspectorModel */
/** @typedef {import('./state.js').CutoutJobs} CutoutJobs */

/**
 * @typedef {Object} FileRow - The cutout of one media file of the selection
 * @property {string} path
 * @property {string} name
 * @property {import('./clipStatus.js').CutoutStatus} status
 * @property {string} reason - unavailable: what the server is missing
 */

/**
 * @typedef {Object} CutoutView
 * @property {string[]} clipIds - The selected clips that can be cut out
 * @property {boolean} on - Every one of them has cutout on
 * @property {boolean} mixed - Some have, some have not
 * @property {'remove'|'blur'|''} mode - '' when they differ
 * @property {import('#utils/inspector/paramControls.js').ParamControl[]} controls - The
 *   number settings to show, with the values of the first clip
 * @property {FileRow[]} files
 * @property {string} placement - A placement id, '' when placed by hand or differing
 * @property {{ id: import('./looks.js').Look, label: string, hint: string,
 *   pressed: boolean }[]} looks
 */

/**
 * @param {InspectorModel} model
 * @returns {import('#utils/inspector/targets.js').SelectedClip[]} The
 *   selected clips the group is about
 */
export const subjectsOf = (model) =>
  (model?.refs || []).filter((ref) => isSubject(ref.clip, ref.track));

/**
 * One row for each media file whose clips have cutout on: the state of the
 * clip that is furthest from ready speaks for the file.
 * @param {import('#utils/inspector/targets.js').SelectedClip[]} subjects
 * @param {number} fps
 * @param {CutoutJobs} jobs
 * @returns {FileRow[]}
 */
function fileRows(subjects, fps, jobs) {
  /** @type {Map<string, any>} */
  const byFile = new Map();
  for (const { clip } of subjects) {
    const state = cutoutState(clip, fps);
    if (state === 'off') continue;
    const held = byFile.get(clip.sourceFile);
    if (!held || (state !== 'ready' && cutoutState(held, fps) === 'ready'))
      byFile.set(clip.sourceFile, clip);
  }
  return [...byFile].map(([path, clip]) => {
    const job = jobs?.byPath?.[path];
    const status = statusOf(clip, fps, job);
    const reason = status.stage === 'unavailable' ? job?.message || '' : '';
    return { path, name: fileName(path), status, reason };
  });
}

/**
 * The cutout's lengths are in units — hundredths of the frame's shorter
 * side: a person reads that as per cent.
 * @param {import('#utils/inspector/paramControls.js').ParamControl} control
 * @returns {import('#utils/inspector/paramControls.js').ParamControl}
 */
const inPercent = (control) =>
  control.spec?.unit === 'u' ? { ...control, spec: { ...control.spec, unit: '%' } } : control;

/**
 * @param {InspectorModel} model
 * @param {CutoutJobs} jobs
 * @param {(clip: any) => { width: number, height: number }|null} [sizeOf] - The
 *   picture of a clip as shown, when known
 * @returns {CutoutView|null} null when no selected clip can be cut out
 */
export function cutoutView(model, jobs, sizeOf = () => null) {
  const subjects = subjectsOf(model);
  if (!subjects.length) return null;
  const blocks = subjects.map((ref) => normalizeCutout(ref.clip.cutout));
  const count = blocks.filter((block) => block.on).length;
  const [first] = blocks;
  const frame = parseResolution(model.resolution);
  const places = new Set(
    subjects.map((ref) => placementOf(ref.clip, frame, sizeOf(ref.clip) || frame)),
  );
  // The switch and the mode have controls of their own; `blur` shows in blur mode only.
  const controls = paramControls(CUTOUT_FIELDS, first, 'cutout');
  return {
    clipIds: subjects.map((ref) => ref.clip.clipId),
    on: count === blocks.length,
    mixed: count > 0 && count < blocks.length,
    mode: blocks.every((block) => block.mode === first.mode) ? first.mode : '',
    controls: controls.filter((control) => control.type === 'number').map(inPercent),
    files: fileRows(subjects, model.fps, jobs),
    placement: places.size === 1 ? [...places][0] : '',
    looks: availableLooks().map((look) => ({
      ...look,
      pressed: subjects.every((ref) => hasLook(ref.clip, look.id)),
    })),
  };
}
