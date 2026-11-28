/**
 * What the Create tab does to the open document: add a generator or a
 * text style at the edit cursor (as one undo step, with the new clip
 * selected) and apply an effect to the selected clips. Each returns a
 * short sentence for the tab's status line.
 * @module utils/create/panelActions
 */

import { clipKind } from '#utils/edl/factory.js';
import { findClip } from '#utils/edl/query.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { getSelection, getView, setSelection } from '#utils/editor/view.js';
import { applyEffectAction } from '#utils/inspector/effectActions.js';
import { formatTimecode } from '#utils/playback/timecode.js';
import { addTextPreset } from './addText.js';
import { addGenerator } from './placement.js';
import { textPreset } from './textPresets.js';

/** @typedef {import('./catalogView.js').CatalogItem} CatalogItem */

/** @type {CatalogItem|null} */
let lastGenerator = null;

/** @returns {CatalogItem|null} The generator added most recently in this session */
export const lastGeneratorItem = () => lastGenerator;

/**
 * Store a document with a new clip in it and select that clip.
 * @param {any} next - The document with the clip
 * @param {string} clipId
 * @param {string} label
 * @returns {string} Status line
 */
function place(next, clipId, label) {
  edit(() => next);
  setSelection([clipId], { expand: false });
  const found = findClip(next, clipId);
  const at = formatTimecode(found.clip.timelineStart, next.fps);
  return `Added ${label} on ${found.track.name || 'a new track'} at ${at}`;
}

/**
 * Add a generator at the edit cursor, or where it was dropped.
 * @param {CatalogItem} item
 * @param {{ time?: number, trackId?: string }} [at] - A drop position on
 *   the timeline; default: the edit cursor, on the track its kind belongs on
 * @returns {string} Status line
 */
export function addGeneratorItem(item, at = {}) {
  const view = getView();
  const result = addGenerator(getDoc(), item, {
    time: at.time ?? (view.cursorPosition || 0),
    trackId: at.trackId,
    autoCrossfade: view.autoCrossfade,
  });
  if (!result.clipId) return `${item.label} could not be added`;
  lastGenerator = item;
  return place(result.edl, result.clipId, item.label);
}

/**
 * Add a title in a ready-made style at the edit cursor, or where it was dropped.
 * @param {string} presetId
 * @param {{ time?: number, trackId?: string }} [at]
 * @returns {string} Status line
 */
export function addTextItem(presetId, at = {}) {
  const view = getView();
  const result = addTextPreset(getDoc(), presetId, {
    time: at.time ?? (view.cursorPosition || 0),
    trackId: at.trackId,
    autoCrossfade: view.autoCrossfade,
  });
  const label = textPreset(presetId)?.label || 'Text';
  return result.clipId ? place(result.edl, result.clipId, label) : `${label} could not be added`;
}

/**
 * The selected clips an effect can go on: those that draw in the frame —
 * footage, stills, titles, generators, brand elements — on tracks that are
 * not locked.
 * @param {string[]} [selection]
 * @returns {{ clipId: string, label: string }[]}
 */
export function effectTargets(selection = getSelection()) {
  const doc = getDoc();
  return selection.flatMap((clipId) => {
    const found = findClip(doc, clipId);
    if (!found || found.track.type !== 'video' || found.track.locked) return [];
    const kind = clipKind(found.clip, found.track);
    if (kind === 'placeholder' || kind === 'audio') return [];
    const named = kind === 'element' ? 'brand element' : kind;
    return [{ clipId, label: found.clip.label || named }];
  });
}

/**
 * Apply an effect (or a chain) to the selected clips, or to given clips.
 * @param {import('#utils/inspector/effectActions.js').EffectAction & { label?: string }} action
 * @param {string[]} [clipIds] - Default: the selection
 * @returns {string} Status line
 */
export function applyEffectItem(action, clipIds) {
  const targets = effectTargets(clipIds);
  const name = action.label || 'The effect';
  if (!targets.length) return 'Select a clip in the timeline or the preview first';
  const changed = edit((doc) =>
    applyEffectAction(doc, { clipIds: targets.map((target) => target.clipId) }, action),
  );
  if (!changed) return `${name} could not be added`;
  const where = targets.length === 1 ? targets[0].label : `${targets.length} clips`;
  return `${name} added to ${where}`;
}
