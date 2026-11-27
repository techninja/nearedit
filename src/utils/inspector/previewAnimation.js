/**
 * "Preview animation": play just the entrance (or the exit) of a title,
 * then put the playhead back where it was. The span is worked out from the
 * text animation's settings; the playing is the ordinary transport.
 * @module utils/inspector/previewAnimation
 */

import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { findClip } from '#utils/edl/query.js';
import { getDoc } from '#utils/editor/session.js';
import { isPlaying, onFrame, pause, play, seek } from '#utils/playback/transport.js';
import { animationSpan } from './animationSpan.js';

/** @type {(() => void)|null} Ends the preview that is running */
let finish = null;

/**
 * Play a title's entrance or exit once, then return the playhead.
 * @param {string} clipId
 * @param {'in'|'out'} edge
 * @returns {boolean} False when there is no such clip
 */
export function previewAnimation(clipId, edge) {
  const clip = findClip(getDoc(), clipId)?.clip;
  if (!clip) return false;
  finish?.();
  if (isPlaying()) pause();
  const back = store.get(ViewState).cursorPosition;
  const { from, to } = animationSpan(clip, edge);
  seek(from);
  if (!play()) return false;
  /** @type {(() => void)[]} */
  const stops = [];
  const end = (/** @type {boolean} */ reached) => {
    for (const stop of stops) stop();
    finish = null;
    if (!reached) return; // stopped by hand: leave the playhead where it was put
    pause();
    seek(back);
  };
  // One frame short of the end: the frame at `to` itself is past the clip.
  const last = to - 1 / (getDoc().fps || 30) - 1e-6;
  stops.push(onFrame((time) => time >= last && end(true)));
  // Only a real stop counts: the store still says "not playing" for a moment.
  stops.push(
    store.observe(ViewState, (_id, view, was) => {
      if (was?.playing && !view.playing && finish) end(false);
    }),
  );
  finish = () => end(false);
  return true;
}
