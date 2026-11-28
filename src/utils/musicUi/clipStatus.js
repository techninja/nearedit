/**
 * Where a music clip stands, in words: rendered, being rendered, failed
 * (with the server's sentence), or waiting on a locked track. Pure.
 * @module utils/musicUi/clipStatus
 */

import { isMusicClip, isStaleMusic } from '#utils/music/clip.js';
import { songSeconds } from '#utils/music/timing.js';

/** @typedef {'rendered'|'rendering'|'failed'|'stale'} MusicState */

/**
 * @param {number} seconds
 * @returns {string} `0:08`
 */
function clock(seconds) {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The status of a music clip for the inspector and the music editor.
 * @param {any} clip
 * @param {import('./renderState.js').RenderStatus|null} [status] - Of its rendering
 * @param {boolean} [locked] - Its track is locked
 * @returns {{ state: MusicState|'', text: string, message: string }} `message`
 *   is why it failed; '' otherwise
 */
export function musicClipStatus(clip, status, locked = false) {
  if (!isMusicClip(clip)) return { state: '', text: '', message: '' };
  const length = clock(songSeconds(clip.music.song));
  if (!isStaleMusic(clip)) return { state: 'rendered', text: `Rendered · ${length}`, message: '' };
  if (status?.status === 'failed') {
    return { state: 'failed', text: 'Could not be rendered', message: status.message };
  }
  if (locked) return { state: 'stale', text: 'Not rendered: its track is locked', message: '' };
  const before = clip.sourceFile ? ' — the last rendering plays meanwhile' : '';
  return { state: 'rendering', text: `Rendering…${before}`, message: '' };
}
