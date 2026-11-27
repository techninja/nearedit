/**
 * `add_captions` — title clips generated from the transcript of clips on
 * the timeline, timed to the words and placed on the front-most video
 * track (a new one when the front track is busy at those moments).
 * @module api/director/inplace/addCaptions
 */

import { wrapLines } from '#utils/director/phrases.js';
import { titleClip } from '../assemble/clips.js';
import { captionStyle, clipCues, timeCues } from './captions.js';
import { docTracks, inPlaceResult, insertTrack, isFree, mediaLookup } from './doc.js';
import { scopedClips } from './scope.js';

/**
 * The track captions go on: the front-most video track when it is free at
 * every caption, else a new track in front of everything.
 * @param {import('./doc.js').DocTrack[]} tracks
 * @param {{ startF: number, endF: number }[]} cues
 * @param {number} fps
 * @returns {import('./doc.js').DocTrack}
 */
export function captionTrack(tracks, cues, fps) {
  const front = tracks.find((t) => t.type === 'video' && t.index === 0);
  const free = front && cues.every((c) => isFree(front, c.startF / fps, c.endF / fps));
  if (front && !front.locked && free) return front;
  return insertTrack(tracks, 'video', 0, 'Captions');
}

/**
 * @param {import('../pipeline.js').ActionContext} ctx
 * @returns {import('../result.js').DirectorResult}
 */
export function addCaptions(ctx) {
  const { directive, format } = ctx;
  const { fps } = format;
  const { params } = directive;
  const tracks = docTracks(ctx.edl);
  const lookup = mediaLookup(ctx.media);
  const style = captionStyle(params, format);
  const limits = {
    maxChars: Math.min(params.maxChars, style.lineChars * 2),
    maxDuration: params.maxDuration,
  };
  const byId = new Map(
    tracks.flatMap((t) => t.clips.map((c) => [c.clipId, { clip: c, track: t }])),
  );
  const range = directive.mode === 'range' ? directive.context.range : null;
  const done = new Set();
  const notes = [];
  const cues = [];
  let clips = 0;

  for (const { clip, track, chosen } of scopedClips(tracks, directive)) {
    const media = lookup(clip.sourceFile);
    if (done.has(clip.clipId) || !media || media.type === 'image') continue;
    done.add(clip.linkedClipId);
    const partner = byId.get(clip.linkedClipId);
    // Unless asked for, caption only what is heard: sound that is not music or muted.
    const heard = track.type === 'audio' ? !track.muted : partner && !partner.track.muted;
    if (!chosen && (!heard || media.kind === 'music' || clip.intent === 'music')) continue;
    const found = clipCues(clip, media, limits);
    if (!found.length) {
      if (chosen || media.kind === 'speech')
        notes.push(`${media.filename} has no transcript for this part — run transcription first.`);
      continue;
    }
    cues.push(...found.filter((c) => !range || (c.start < range.end && c.end > range.start)));
    clips++;
  }

  const timed = timeCues(cues, fps);
  if (!timed.length)
    return inPlaceResult(
      ctx,
      tracks,
      'No transcript found on the timeline — no captions added',
      notes,
    );
  const target = captionTrack(tracks, timed, fps);
  for (const cue of timed) {
    const place = { atF: cue.startF, lenF: cue.endF - cue.startF };
    target.clips.push(titleClip(wrapLines(cue.text, style.lineChars), place, fps, style));
  }
  const s = (/** @type {number} */ n) => (n === 1 ? '' : 's');
  const summary = `Added ${timed.length} caption${s(timed.length)} from ${clips} clip${s(clips)} on “${target.name}”`;
  if (target.name === 'Captions' && !target.trackId)
    notes.push('A new “Captions” track was added in front, because the front track was in use.');
  return inPlaceResult(ctx, tracks, summary, notes);
}
