/**
 * Clip factories for the assembler. Everything is placed in whole frames
 * so fragments stay on the frame grid and linked picture and sound stay in
 * sync; clips are complete v2 clips built with `createClip`.
 * @module api/director/assemble/clips
 */

import { createClip } from '#utils/edl/factory.js';
import { wordRange } from '#utils/director/speech.js';
import { kenBurnsFor } from './kenBurns.js';

/**
 * @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo
 * @typedef {Object} Placement
 * @property {number} atF - Timeline start, frames
 * @property {number} inF - Source in, frames (ignored for stills and titles)
 * @property {number} lenF - Length, frames
 */

/**
 * A clip of a video or audio file.
 * @param {MediaInfo} media
 * @param {Placement} place
 * @param {number} fps
 * @param {object} [extra] - Further clip fields (volume, intent, label, fades…)
 * @returns {any}
 */
export function mediaClip(media, place, fps, extra = {}) {
  return createClip({
    sourceFile: media.filePath,
    sourceIn: place.inF / fps,
    sourceOut: (place.inF + place.lenF) / fps,
    timelineStart: place.atF / fps,
    timelineEnd: (place.atF + place.lenF) / fps,
    label: media.filename,
    ...extra,
  });
}

/**
 * Link a picture clip and its sound so they move, trim and split together.
 * @param {any} a
 * @param {any} b
 */
export function linkClips(a, b) {
  a.linkedClipId = b.clipId;
  b.linkedClipId = a.clipId;
}

/**
 * A still with a gentle ken burns move suited to the frame.
 * @param {MediaInfo} media
 * @param {Placement} place
 * @param {{ fps: number, width: number, height: number }} format
 * @param {number} [index=0] - Alternates the move direction
 * @returns {any}
 */
export function imageClip(media, place, format, index = 0) {
  const seconds = place.lenF / format.fps;
  return createClip({
    sourceFile: media.filePath,
    sourceIn: 0,
    sourceOut: seconds,
    timelineStart: place.atF / format.fps,
    timelineEnd: (place.atF + place.lenF) / format.fps,
    label: media.filename,
    intent: 'broll',
    transform: { kenBurns: kenBurnsFor(media, format, seconds, index) },
  });
}

/**
 * A title clip (no source file, non-empty text).
 * @param {string} content
 * @param {{ atF: number, lenF: number }} place
 * @param {number} fps
 * @param {{ text?: object, transform?: object, fade?: number }} [style]
 * @returns {any}
 */
export function titleClip(content, place, fps, style = {}) {
  const seconds = place.lenF / fps;
  const fade = Math.min(style.fade ?? 0, seconds / 3);
  return createClip({
    timelineStart: place.atF / fps,
    timelineEnd: (place.atF + place.lenF) / fps,
    sourceOut: seconds,
    fadeIn: fade,
    fadeOut: fade,
    label: content.replace(/\s+/g, ' ').slice(0, 48),
    intent: 'title',
    text: { content, ...(style.text || {}) },
    transform: style.transform || {},
  });
}

/**
 * Clip label for a stretch of speech: the words spoken, else the filename.
 * @param {MediaInfo} media
 * @param {number} start - Source seconds
 * @param {number} end
 * @returns {string}
 */
export function speechLabel(media, start, end) {
  const range = wordRange(media.words, start, end);
  if (!range) return media.filename;
  const text = media.words
    .slice(range.first, range.last + 1)
    .map((w) => String(w.word ?? '').trim())
    .join(' ');
  return text.length > 48 ? `${text.slice(0, 47)}…` : text || media.filename;
}
