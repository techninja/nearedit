/**
 * Finishing passes of the assembler: the music bed, titles and markers.
 * @module api/director/assemble/finish
 */

import { MUSIC_LEVEL_ALONE, MUSIC_LEVEL_UNDER_SPEECH } from '#utils/director/layout.js';
import { wrapLines } from '#utils/director/phrases.js';
import { floorFrames, formatSeconds, toFrames } from '#utils/director/snap.js';
import { newId } from '#utils/edl/factory.js';
import { mediaClip, titleClip } from './clips.js';

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
 * Text style for a title, sized to the output frame.
 * @param {'opening'|'lower'} kind
 * @param {{ width: number, height: number }} format
 * @returns {{ text: object, transform: object, fade: number, lineChars: number }}
 */
export function titleStyle(kind, format) {
  const base = Math.min(format.height, format.width * 1.2);
  const fontSize = Math.round(base * (kind === 'opening' ? 0.09 : 0.05));
  const outlineWidth = Math.max(2, Math.round(fontSize / 14));
  return {
    text: { fontSize, bold: true, outlineColor: '#000000', outlineWidth },
    transform: kind === 'opening' ? {} : { y: Math.round(format.height * 0.33) },
    fade: kind === 'opening' ? 0.5 : 0.3,
    lineChars: Math.max(8, Math.floor((format.width * 0.9) / (fontSize * 0.55))),
  };
}

/**
 * Put the opening title and the per-pick titles on the Titles track.
 * @param {Fragment} fragment
 * @param {string} opening - Opening title text, '' for none
 * @param {SpineItem[]} items
 * @param {AssembleOptions} opts
 * @param {string[]} notes
 */
export function addTitles(fragment, opening, items, opts, notes) {
  const { fps } = opts;
  const totalF = fragment.endF();
  const place = (/** @type {string} */ text, /** @type {'opening'|'lower'} */ kind, atF, lenF) => {
    const style = titleStyle(kind, opts);
    fragment.add('titles', titleClip(wrapLines(text, style.lineChars), { atF, lenF }, fps, style));
  };
  if (opening && totalF >= 2) place(opening, 'opening', 0, Math.min(toFrames(4, fps), totalF));
  const minF = toFrames(1, fps);
  for (const item of items) {
    if (!item.pick.title) continue;
    // Start after any title already showing, as long as a second of the pick is left.
    const busy = fragment.spans('titles').filter(([s, e]) => e > item.startF && s < item.endF);
    const atF = Math.max(item.startF, ...busy.map(([, e]) => e));
    const lenF = Math.min(toFrames(3.5, fps), item.endF - atF);
    if (lenF >= minF) place(item.pick.title, 'lower', atF, lenF);
    else notes.push(`The title “${item.pick.title}” did not fit beside another title — left out.`);
  }
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
