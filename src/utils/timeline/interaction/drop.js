/**
 * Dropping what is dragged onto the timeline. Media from the bin, and a
 * generator or text style from the Create tab: while it hovers, the lane
 * and the insert time light up; on drop it is inserted there. An effect
 * from the Create tab: the clip under the pointer lights up and gets it.
 * @module utils/timeline/interaction/drop
 */

import { insertMediaItem } from '#utils/commands/insert.js';
import { CREATE_DRAG_TYPE, EFFECT_DRAG_TYPE, carries } from '#utils/create/dragTypes.js';
import { getDoc } from '#utils/editor/session.js';
import { MEDIA_DRAG_TYPE } from '#utils/media/library.js';
import { laneAt } from '#utils/timeline/layout.js';
import { xToTime } from '#utils/timeline/viewport.js';
import { dropCreated, dropEffect, effectTarget } from './dropCreate.js';
import { canvasPoint } from './pointer.js';
import { snapPoint } from './press.js';

/** @typedef {import('#utils/timeline/stage.js').Stage} Stage */

/**
 * Where a drag at this position would land.
 * @param {Stage} stage
 * @param {DragEvent} event
 * @returns {{ time: number, trackId: string }}
 */
function dropTarget(stage, event) {
  const { x, y } = canvasPoint(stage, event);
  const { vp, lanes } = stage.geometry();
  const { time } = snapPoint(xToTime(vp, x), vp.pps, event.shiftKey);
  return { time, trackId: laneAt(lanes, y, vp.scrollY)?.trackId || '' };
}

/**
 * @param {DragEvent} event
 * @returns {boolean} True when the drag carries a media item from the bin
 */
const carriesMedia = (event) => !!event.dataTransfer?.types.includes(MEDIA_DRAG_TYPE);

/**
 * A drag is over the timeline: accept media and show where it would go.
 * @param {Stage} stage
 * @param {DragEvent} event
 */
export function onDragOver(stage, event) {
  const effect = carries(event.dataTransfer, EFFECT_DRAG_TYPE);
  if (!effect && !carriesMedia(event) && !carries(event.dataTransfer, CREATE_DRAG_TYPE)) return;
  const clipId = effect ? effectTarget(stage, canvasPoint(stage, event)) : '';
  if (effect && !clipId) return onDragLeave(stage); // nothing here takes an effect: no drop
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  stage.overlay.dropClipId = clipId;
  stage.overlay.drop = effect ? null : dropTarget(stage, event);
  stage.invalidate();
}

/**
 * The drag left without dropping.
 * @param {Stage} stage
 */
export function onDragLeave(stage) {
  stage.overlay.drop = null;
  stage.overlay.dropClipId = '';
  stage.invalidate();
}

/**
 * Drop: insert the media item at the drop time on the track under the
 * pointer (when it suits the item — picture on video tracks, sound on
 * audio tracks; otherwise the default track for that kind).
 * @param {Stage} stage
 * @param {DragEvent} event
 */
export function onDrop(stage, event) {
  if (carries(event.dataTransfer, EFFECT_DRAG_TYPE)) {
    event.preventDefault();
    dropEffect(event.dataTransfer, effectTarget(stage, canvasPoint(stage, event)));
    return onDragLeave(stage);
  }
  const created = carries(event.dataTransfer, CREATE_DRAG_TYPE);
  if (!created && !carriesMedia(event)) return;
  event.preventDefault();
  const target = dropTarget(stage, event);
  onDragLeave(stage);
  if (created) return dropCreated(event.dataTransfer, target);
  let item;
  try {
    item = JSON.parse(event.dataTransfer.getData(MEDIA_DRAG_TYPE));
  } catch (err) {
    console.warn('[timeline] dropped media could not be read:', err.message);
    return;
  }
  const track = getDoc().tracks.find((candidate) => candidate.trackId === target.trackId);
  const wanted = item?.type === 'audio' ? 'audio' : 'video';
  const trackId = track && track.type === wanted && !track.locked ? track.trackId : undefined;
  insertMediaItem(item, { time: target.time, trackId });
}
