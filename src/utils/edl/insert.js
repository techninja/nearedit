/**
 * Inserting media from the bin and title clips. Isomorphic and pure.
 * @module utils/edl/insert
 */

import { intersects } from './clipMath.js';
import { createClip, defaultText, newId } from './factory.js';
import { timelineDuration } from './query.js';
import { tracksOfType } from './immutable.js';
import { addClips, pairedAudioTracks, pickTrack } from './placement.js';
import { rippleInsert } from './ripple.js';
import { mergeShape } from './sanitize.js';
import { addTrack } from './trackOps.js';
import { EPS, clamp, finite, floorToFrame, frameDuration, snap } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * @typedef {Object} InsertMediaOptions
 * @property {number} [time] - Where the clip starts. Default: the end of the
 *   target track(s)
 * @property {string} [trackId] - Target track (video track for video/image,
 *   audio track for audio). Default: the bottom video track / top audio
 *   track — the pair next to the divider. A locked target is skipped
 * @property {string} [audioTrackId] - Track for a video's linked audio.
 *   Default: the audio track paired with the video track
 * @property {boolean} [withAudio=true] - Add the linked audio clip of a
 *   video that has sound
 * @property {number} [sourceIn=0] - Use only part of the source
 * @property {number} [sourceOut] - Default: the source duration
 * @property {number} [duration=5] - Length of an image, or of media whose
 *   duration is unknown
 * @property {boolean} [ripple=false] - Open a gap instead of overlapping
 * @property {boolean} [autoCrossfade=true] - See crossfade.js
 */

/**
 * Put a media item on the timeline. A video with sound becomes a video clip
 * plus a linked audio clip; an audio file goes to an audio track; an image
 * gets a free duration (5 s by default).
 * @param {Edl} edl
 * @param {{ filePath: string, type: string, duration?: number, hasAudio?: boolean,
 *   filename?: string }} item - A MediaItem (API.md)
 * @param {InsertMediaOptions} [opts]
 * @returns {Edl} Unchanged for items that cannot be placed (e.g. text files)
 */
export function insertMedia(edl, item, opts = {}) {
  if (!item?.filePath || !['video', 'audio', 'image'].includes(item.type)) return edl;
  const isAudio = item.type === 'audio';
  const lane = tracksOfType(edl, isAudio ? 'audio' : 'video');
  const main = pickTrack(
    edl,
    isAudio ? 'audio' : 'video',
    opts.trackId,
    isAudio ? lane : [...lane].reverse(),
  );
  let doc = main.edl;
  const targets = [main.track];
  if (item.type === 'video' && item.hasAudio && opts.withAudio !== false) {
    const sound = pickTrack(doc, 'audio', opts.audioTrackId, pairedAudioTracks(doc, main.track));
    doc = sound.edl;
    targets.push(sound.track);
  }

  const known = item.duration > 0 ? item.duration : Infinity;
  const fallback = finite(opts.duration, 0) > 0 ? opts.duration : 5;
  let sourceIn = 0;
  let length = snap(doc, fallback);
  if (item.type !== 'image') {
    sourceIn = clamp(finite(opts.sourceIn, 0), 0, known);
    const sourceOut = Math.min(finite(opts.sourceOut, known), known);
    length = floorToFrame(doc, Number.isFinite(sourceOut) ? sourceOut - sourceIn : fallback);
  }
  if (length < frameDuration(doc) - EPS) return edl;

  const start = Number.isFinite(opts.time)
    ? Math.max(0, snap(doc, opts.time))
    : snap(doc, timelineDuration(targets));
  if (opts.ripple) doc = rippleInsert(doc, start, length);
  const ids = targets.map(() => newId('clip'));
  const items = targets.map((track, i) => ({
    trackId: track.trackId,
    clip: createClip({
      clipId: ids[i],
      linkedClipId: targets.length > 1 ? ids[1 - i] : '',
      sourceFile: item.filePath,
      sourceIn,
      sourceOut: sourceIn + length,
      timelineStart: start,
      timelineEnd: snap(doc, start + length),
      label: item.filename || '',
    }),
  }));
  return addClips(doc, items, { autoCrossfade: opts.autoCrossfade });
}

/**
 * Add a title clip. Titles belong on the front-most video track; when that
 * track is locked or already has something in the title's time span, a new
 * video track is created on top so the title overlays the picture instead
 * of replacing it. With an explicit `trackId` the title goes there under
 * the normal overlap rules.
 * @param {Edl} edl
 * @param {{ text: string | Record<string, any>, time?: number, duration?: number,
 *   trackId?: string, autoCrossfade?: boolean }} title - `text` is the
 *   content, or a partial text block (`{ content, fontSize, color… }`)
 * @returns {Edl} Unchanged when there is no text
 */
export function insertTitle(edl, title) {
  const patch = typeof title?.text === 'string' ? { content: title.text } : title?.text;
  const text = mergeShape(defaultText(), patch);
  if (!text.content) return edl;
  const start = Math.max(0, snap(edl, finite(title.time, 0)));
  const wanted = finite(title.duration, 0) > 0 ? title.duration : 5;
  const length = Math.max(frameDuration(edl), snap(edl, wanted));
  const span = { timelineStart: start, timelineEnd: snap(edl, start + length) };

  const lane = tracksOfType(edl, 'video');
  let doc = edl;
  let track = lane.find((t) => t.trackId === title.trackId && !t.locked);
  if (!track) {
    const front = lane[0];
    const free = front && !front.locked && !front.clips.some((clip) => intersects(clip, span));
    if (!free) doc = addTrack(edl, 'video', { position: 'top' });
    track = free ? front : doc.tracks[0];
  }
  const clip = createClip({
    ...span,
    sourceOut: length,
    text,
    intent: 'title',
    label: text.content.split('\n')[0].slice(0, 40),
  });
  return addClips(doc, [{ trackId: track.trackId, clip }], { autoCrossfade: title.autoCrossfade });
}
