/**
 * Finishing passes of the assembler: the music bed and the markers. What a
 * plan puts on screen is `elements.js`.
 * @module api/director/assemble/finish
 */

import { MUSIC_LEVEL_ALONE, MUSIC_LEVEL_UNDER_SPEECH } from '#utils/director/layout.js';
import { floorFrames, formatSeconds, toFrames } from '#utils/director/snap.js';
import { newId } from '#utils/edl/factory.js';
import { mediaClip } from './clips.js';

/**
 * @typedef {import('./fragment.js').Fragment} Fragment
 * @typedef {import('./options.js').AssembleOptions} AssembleOptions
 * @typedef {import('./spine.js').SpineItem} SpineItem
 */

/**
 * Lay the music bed under the whole fragment at a reduced level, with a
 * fade-out (and a short fade-in when it starts mid-track).
 * @param {Fragment} fragment
 * @param {import('../plan/resolve.js').ResolvedPlan['music']} music
 * @param {AssembleOptions} opts
 * @param {string[]} notes
 */
export function addMusic(fragment, music, opts, notes) {
  if (!music) return;
  const { fps } = opts;
  const totalF = fragment.endF();
  const inF = toFrames(music.start, fps);
  const availableF = music.media.duration ? floorFrames(music.media.duration, fps) - inF : totalF;
  const lenF = Math.min(totalF, availableF);
  if (lenF < 2) return;
  const underSpeech = fragment.slots.dialogue.length > 0;
  const seconds = lenF / fps;
  fragment.add(
    'music',
    mediaClip(music.media, { atF: 0, inF, lenF }, fps, {
      volume: music.volume ?? (underSpeech ? MUSIC_LEVEL_UNDER_SPEECH : MUSIC_LEVEL_ALONE),
      fadeIn: inF > 0 ? Math.min(0.5, seconds / 4) : 0,
      fadeOut: Math.min(2, seconds / 4),
      intent: 'music',
    }),
  );
  if (lenF < totalF)
    notes.push(
      `${music.media.filename} is shorter than the edit — the music ends at ${formatSeconds(seconds)}.`,
    );
}

/**
 * Markers for the picks that carry a note, so the plan's sections show on
 * the timeline. Times are relative to the fragment start.
 * @param {SpineItem[]} items
 * @param {number} fps
 * @returns {{ markerId: string, time: number, label: string, color: string }[]}
 */
export function pickMarkers(items, fps) {
  return items
    .filter((item) => item.pick.note)
    .map((item) => ({
      markerId: newId('m'),
      time: item.startF / fps,
      label: item.pick.note.slice(0, 80),
      color: '',
    }));
}
