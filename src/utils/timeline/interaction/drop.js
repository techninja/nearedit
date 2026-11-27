/**
 * Dropping media dragged from the bin: while it hovers, light up the lane
 * and the insert time; on drop, insert it there.
 * @module utils/timeline/interaction/drop
 */

import { insertMediaItem } from '#utils/commands/insert.js';
import { getDoc } from '#utils/editor/session.js';
import { MEDIA_DRAG_TYPE } from '#utils/media/library.js';
import { laneAt } from '#utils/timeline/layout.js';
import { xToTime } from '#utils/timeline/viewport.js';
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
  if (!carriesMedia(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  stage.overlay.drop = dropTarget(stage, event);
  stage.invalidate();
}

/**
 * The drag left without dropping.
 * @param {Stage} stage
 */
export function onDragLeave(stage) {
  stage.overlay.drop = null;
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
  if (!carriesMedia(event)) return;
  event.preventDefault();
  const target = dropTarget(stage, event);
  onDragLeave(stage);
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
