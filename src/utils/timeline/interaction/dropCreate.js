/**
 * Drops from the Create tab: a generator, a text style or a brand element
 * lands on the video track under the pointer at the drop time (an element
 * where its kind belongs from there); an effect lands on the clip under
 * the pointer.
 * @module utils/timeline/interaction/dropCreate
 */

import { addElementItem } from '#utils/brandUi/addElement.js';
import { CREATE_DRAG_TYPE, EFFECT_DRAG_TYPE, readPayload } from '#utils/create/dragTypes.js';
import {
  addGeneratorItem,
  addTextItem,
  applyEffectItem,
  effectTargets,
} from '#utils/create/panelActions.js';
import { getDoc } from '#utils/editor/session.js';
import { hitTest } from '#utils/timeline/hitTest.js';

/** @typedef {import('#utils/timeline/stage.js').Stage} Stage */

/**
 * The clip under a point that can take an effect.
 * @param {Stage} stage
 * @param {{ x: number, y: number }} point - Canvas pixels
 * @returns {string} Clip id, or '' when there is none there
 */
export function effectTarget(stage, { x, y }) {
  const hit = hitTest(stage.geometry(), x, y);
  if (!hit.clipId || hit.locked) return '';
  return effectTargets([hit.clipId]).length ? hit.clipId : '';
}

/**
 * Insert the generator, text style or brand element a drop carries.
 * @param {DataTransfer} dataTransfer
 * @param {{ time: number, trackId: string }} target - Where it was dropped
 */
export function dropCreated(dataTransfer, target) {
  const payload = readPayload(dataTransfer, CREATE_DRAG_TYPE);
  if (!payload) return;
  // On a video track that is not locked it goes there; anywhere else, where its kind belongs.
  const track = getDoc().tracks.find((candidate) => candidate.trackId === target.trackId);
  const trackId = track && track.type === 'video' && !track.locked ? track.trackId : undefined;
  const at = { time: Math.max(0, target.time), trackId };
  if (payload.kind === 'element') addElementItem(payload.element, at);
  else if (payload.kind === 'text') addTextItem(payload.preset, at);
  else addGeneratorItem(payload, at);
}

/**
 * Add the effect a drop carries to a clip.
 * @param {DataTransfer} dataTransfer
 * @param {string} clipId - '' when the drop was not on a clip
 */
export function dropEffect(dataTransfer, clipId) {
  const action = readPayload(dataTransfer, EFFECT_DRAG_TYPE);
  if (action && clipId) applyEffectItem(action, [clipId]);
}
