/**
 * `beat_sync` — move the cuts of the picture track onto the beats of a
 * music clip on the timeline. Cuts are rolled, never rippled, so the
 * length of the edit and everything on other tracks stay put.
 * @module api/director/inplace/beatSync
 */

import { nearestIndex, toFrames } from '#utils/director/snap.js';
import { clipKind } from '#utils/edl/factory.js';
import { DirectorError } from '../errors.js';
import { docTracks, inPlaceResult, mediaLookup } from './doc.js';
import { applyMoves, blocked, trackCuts } from './roll.js';

/**
 * The music clip to sync to: the selected one, else the longest clip on an
 * audio track whose file has beat analysis (music before anything else).
 * @param {import('./doc.js').DocTrack[]} tracks
 * @param {string[]} selection
 * @param {ReturnType<typeof mediaLookup>} lookup
 * @returns {{ clip: any, media: import('../context/mediaInfo.js').MediaInfo }}
 */
export function findMusicClip(tracks, selection, lookup) {
  const audio = tracks
    .filter((t) => t.type === 'audio')
    .flatMap((t) => t.clips)
    .map((clip) => ({ clip, media: lookup(clip.sourceFile) }))
    .filter((c) => c.media);
  const chosen = audio.filter((c) => selection.includes(c.clip.clipId));
  const unanalysed = chosen.find((c) => c.media.beats.length < 2);
  if (unanalysed)
    throw new DirectorError(`${unanalysed.media.filename} has no beat analysis`, {
      status: 422,
      detail: 'Run beat analysis on the music file, then try again.',
    });
  const rank = (/** @type {any} */ c) =>
    (c.media.kind === 'music' || c.clip.intent === 'music' ? 1e6 : 0) +
    (c.clip.timelineEnd - c.clip.timelineStart);
  const candidates = (chosen.length ? chosen : audio.filter((c) => c.media.beats.length >= 2)).sort(
    (a, b) => rank(b) - rank(a),
  );
  if (!candidates.length)
    throw new DirectorError('There is no music clip with beat analysis on the timeline', {
      status: 422,
      detail: 'Put a music file on an audio track and run beat analysis on it.',
    });
  return candidates[0];
}

/**
 * The picture track to re-cut: the one holding a selected picture clip,
 * else the unlocked video track with the most picture clips.
 * @param {import('./doc.js').DocTrack[]} tracks
 * @param {string[]} selection
 * @returns {import('./doc.js').DocTrack|null}
 */
export function findPictureTrack(tracks, selection) {
  const video = tracks.filter((t) => t.type === 'video' && !t.locked);
  const pictures = (/** @type {import('./doc.js').DocTrack} */ t) =>
    t.clips.filter((c) => ['video', 'image'].includes(clipKind(c, t))).length;
  const selected = video.find((t) => t.clips.some((c) => selection.includes(c.clipId)));
  if (selected) return selected;
  const best = [...video].sort((a, b) => pictures(b) - pictures(a) || b.index - a.index)[0];
  return best && pictures(best) ? best : null;
}

/**
 * @param {import('../pipeline.js').ActionContext} ctx
 * @returns {import('../result.js').DirectorResult}
 */
export function beatSync(ctx) {
  const { directive, format } = ctx;
  const { fps } = format;
  const { params, context } = directive;
  const tracks = docTracks(ctx.edl);
  const lookup = mediaLookup(ctx.media);
  const music = findMusicClip(tracks, context.selection, lookup);
  const picture = findPictureTrack(tracks, context.selection);
  if (!picture) throw new DirectorError('There are no picture clips to sync', { status: 422 });

  const every = Number(params.every) || 1;
  const { clip } = music;
  const beatsF = music.media.beats
    .filter((b) => b >= clip.sourceIn - 1e-6 && b <= clip.sourceOut + 1e-6)
    .filter((_, i) => i % every === 0)
    .map((b) => toFrames(clip.timelineStart + b - clip.sourceIn, fps));
  const byId = new Map(
    tracks.flatMap((t) => t.clips.map((c) => [c.clipId, { clip: c, track: t }])),
  );
  const env = {
    fps,
    minF: Math.max(2, toFrames(0.3, fps)),
    protectSpeech: params.protectSpeech,
    lookup,
  };
  const maxF = toFrames(params.maxShift, fps);
  const range = directive.mode === 'range' ? context.range : null;
  const count = { moved: 0, already: 0, left: 0 };
  const notes = [];

  for (const cut of trackCuts(picture, byId, fps)) {
    if (range && (cut.atF < range.start * fps || cut.atF > range.end * fps)) continue;
    const near = nearestIndex(beatsF, cut.atF);
    const options = [beatsF[near], beatsF[near - 1], beatsF[near + 1]]
      .filter((b) => b !== undefined && Math.abs(b - cut.atF) <= maxF)
      .sort((a, b) => Math.abs(a - cut.atF) - Math.abs(b - cut.atF));
    if (options[0] === cut.atF) {
      count.already++;
      continue;
    }
    let why = cut.held || `no beat within ${params.maxShift}s`;
    let beat;
    for (const option of cut.held ? [] : options) {
      why = blocked(cut.moves, option - cut.atF, env);
      if (why) continue;
      beat = option;
      break;
    }
    if (beat === undefined) {
      count.left++;
      if (notes.length < 6)
        notes.push(`The cut at ${(cut.atF / fps).toFixed(2)}s was left alone: ${why}.`);
      continue;
    }
    applyMoves(cut.moves, beat - cut.atF, fps);
    count.moved++;
  }

  const total = count.moved + count.already + count.left;
  const bpm = music.media.bpm ? `${Math.round(music.media.bpm)} BPM` : 'the beat';
  const grid = every > 1 ? `, every ${every}${every === 2 ? 'nd' : 'th'} beat` : '';
  notes.unshift(`Synced “${picture.name}” to ${music.media.filename} (${bpm}${grid}).`);
  if (count.already)
    notes.push(`${count.already} cut${count.already === 1 ? ' was' : 's were'} already on a beat.`);
  const summary = `Moved ${count.moved} of ${total} cuts onto the beat (${bpm})`;
  return inPlaceResult(ctx, tracks, summary, notes);
}
