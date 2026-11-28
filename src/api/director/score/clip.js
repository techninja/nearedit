/**
 * The music clip of a score, and where it goes: one clip on an audio track
 * called "Music" — an existing one when it is free over the span, a new one
 * at the bottom otherwise — carrying the song, pointing at its rendering,
 * with a fade at either end and the volume keyframes that duck it under
 * speech. Nothing else on the timeline is touched.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § The clip.
 * @module api/director/score/clip
 */

import { duckKeys, duckSpans } from '#utils/director/score/duck.js';
import { createClip } from '#utils/edl/factory.js';
import { isMusicClip } from '#utils/music/clip.js';
import { normalizeSong } from '#utils/music/normalize.js';
import { insertTrack, isFree } from '../inplace/doc.js';

/** @typedef {import('../inplace/doc.js').DocTrack} DocTrack */

/** Longest fade-in and fade-out, seconds. */
const FADES = [0.5, 3];

/**
 * @typedef {Object} ScoreParts
 * @property {import('../../music/index.js').Rendering} rendering
 * @property {any} song - As it was rendered
 * @property {import('./timeline.js').Span} span
 * @property {number} fps
 * @property {number} barSeconds
 * @property {number} rest - Seconds of the span after the last bar
 * @property {import('#utils/director/score/duck.js').Span[]} speech - From the start of the span
 * @property {number} volume
 * @property {number} duck - Decibels; 0 = no ducking
 * @property {string} label
 */

/**
 * @param {ScoreParts} parts
 * @returns {{ clip: any, ducked: import('#utils/director/score/duck.js').Span[], short: number }}
 *   `ducked`: the stretches the clip is turned down over; `short`: seconds
 *   of the span the song does not reach (0 as a rule)
 */
export function scoreClip(parts) {
  const { rendering, span, fps, volume } = parts;
  // Whole frames of the rendering: a clip never shows more than there is.
  const most = Math.floor(rendering.duration * fps + 1e-6) / fps;
  const length = Math.min(span.seconds, most);
  const end = Math.round((span.start + length) * fps) / fps;
  // The final chord rings through the rest of its bar, and the fade lets it go.
  const ring = parts.rest + parts.barSeconds * 0.4;
  const keys = duckKeys(parts.speech, { length, level: volume, depth: parts.duck });
  const clip = createClip({
    sourceFile: rendering.file,
    sourceIn: 0,
    sourceOut: end - span.start,
    timelineStart: span.start,
    timelineEnd: end,
    music: { song: normalizeSong(parts.song), key: rendering.key },
    intent: 'music',
    label: parts.label,
    volume,
    fadeIn: Math.min(FADES[0], parts.barSeconds / 4, length / 4),
    fadeOut: Math.min(FADES[1], Math.max(0.3, ring), length / 2),
    keyframes: keys.length ? { volume: keys } : {},
  });
  return {
    clip,
    ducked: keys.length ? duckSpans(parts.speech, length) : [],
    short: Math.max(0, span.seconds - length),
  };
}

/**
 * Put the clip on a "Music" track of the document.
 * @param {DocTrack[]} tracks - Document tracks (modified)
 * @param {any} clip
 * @returns {{ track: DocTrack, created: boolean, beside: number }} `beside`:
 *   music clips that already play in the clip's span, on any track
 */
export function placeScore(tracks, clip) {
  const [start, end] = [clip.timelineStart, clip.timelineEnd];
  const audio = tracks.filter((track) => track.type === 'audio');
  const beside = audio
    .flatMap((track) => track.clips)
    .filter((other) => other.timelineEnd > start && other.timelineStart < end)
    .filter((other) => isMusicClip(other) || other.intent === 'music').length;
  const free = audio.find(
    (track) => /music|score/i.test(track.name) && !track.locked && isFree(track, start, end),
  );
  const track = free || insertTrack(tracks, 'audio', audio.length, 'Music');
  track.clips.push(clip);
  return { track, created: !free, beside };
}
