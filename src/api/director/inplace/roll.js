/**
 * Edge moves — the primitive behind `beat_sync`. A cut is moved by rolling
 * it: the outgoing clip's end and the incoming clip's start shift by the
 * same amount, so nothing else on the timeline moves and linked sound
 * stays in sync. A move is only made when every edge involved can take it.
 * @module api/director/inplace/roll
 */

import { wordRange } from '#utils/director/speech.js';
import { clipKind } from '#utils/edl/factory.js';
import { fitFades } from './collapse.js';

/**
 * @typedef {import('./doc.js').DocTrack} DocTrack
 * @typedef {{ clip: any, track: DocTrack, edge: 'start'|'end' }} EdgeMove
 * @typedef {Object} RollEnv
 * @property {number} fps
 * @property {number} minF - Shortest clip a move may leave, frames
 * @property {boolean} protectSpeech
 * @property {(filePath: string) => import('../context/mediaInfo.js').MediaInfo|null} lookup
 */

const frame = (/** @type {number} */ t, /** @type {number} */ fps) => Math.round(t * fps);

/**
 * Why a set of edges cannot move by `deltaF` frames — '' when it can.
 * @param {EdgeMove[]} moves
 * @param {number} deltaF - Positive = later
 * @param {RollEnv} env
 * @returns {string}
 */
export function blocked(moves, deltaF, env) {
  const { fps } = env;
  const seconds = deltaF / fps;
  for (const { clip, track, edge } of moves) {
    const startF = frame(clip.timelineStart, fps);
    const endF = frame(clip.timelineEnd, fps);
    const grows = edge === 'end' ? deltaF > 0 : deltaF < 0;
    const lengthF = endF - startF + (edge === 'end' ? deltaF : -deltaF);
    if (lengthF < env.minF) return 'it would leave a clip too short';
    const kind = clipKind(clip, track);
    const media = kind === 'video' || kind === 'audio' ? env.lookup(clip.sourceFile) : null;
    if (grows && (kind === 'video' || kind === 'audio')) {
      if (edge === 'start' && clip.sourceIn + seconds < -1e-6)
        return 'there is no footage before the cut';
      if (edge === 'end' && media?.duration && clip.sourceOut + seconds > media.duration + 1e-6)
        return 'there is no footage after the cut';
    }
    if (!grows && env.protectSpeech && media?.words.length) {
      const lost =
        edge === 'end'
          ? wordRange(media.words, clip.sourceOut + seconds, clip.sourceOut)
          : wordRange(media.words, clip.sourceIn, clip.sourceIn + seconds);
      if (lost) return 'it would cut into a word';
    }
    if (!grows) continue;
    // A growing edge must not run into a neighbour that is not moving with it.
    for (const other of track.clips) {
      if (other === clip) continue;
      const moving = moves.some((m) => m.clip === other && m.edge !== edge);
      if (moving) continue;
      const otherStartF = frame(other.timelineStart, fps);
      const otherEndF = frame(other.timelineEnd, fps);
      if (edge === 'end' && otherStartF >= endF && otherStartF < endF + deltaF)
        return 'it would run into the next clip';
      if (edge === 'start' && otherEndF <= startF && otherEndF > startF + deltaF)
        return 'it would run into the previous clip';
    }
  }
  return '';
}

/**
 * Move the edges. Source times follow so picture and sound keep their place.
 * @param {EdgeMove[]} moves
 * @param {number} deltaF
 * @param {number} fps
 */
export function applyMoves(moves, deltaF, fps) {
  for (const { clip, track, edge } of moves) {
    const timed = ['video', 'audio'].includes(clipKind(clip, track));
    if (edge === 'end') clip.timelineEnd = (frame(clip.timelineEnd, fps) + deltaF) / fps;
    else clip.timelineStart = (frame(clip.timelineStart, fps) + deltaF) / fps;
    // Stills and titles have no source timing: just keep their span tidy.
    if (!timed) clip.sourceOut = clip.sourceIn + clip.timelineEnd - clip.timelineStart;
    else if (edge === 'end') clip.sourceOut += deltaF / fps;
    else clip.sourceIn += deltaF / fps;
    fitFades(clip);
  }
}

/**
 * The edges that make up each cut of a track, in timeline order: a shared
 * cut rolls both neighbours; a clip edge beside a gap moves alone. Linked
 * partners come along. The start of the track's first clip is left alone.
 * @param {DocTrack} track
 * @param {Map<string, { clip: any, track: DocTrack }>} byId
 * @param {number} fps
 * @returns {{ atF: number, moves: EdgeMove[] }[]}
 */
export function trackCuts(track, byId, fps) {
  const clips = [...track.clips].sort((a, b) => a.timelineStart - b.timelineStart);
  const withPartner = (/** @type {any} */ clip, /** @type {'start'|'end'} */ edge) => {
    const partner = byId.get(clip.linkedClipId);
    const own = { clip, track, edge };
    return partner && !partner.track.locked ? [own, { ...partner, edge }] : [own];
  };
  const cuts = [];
  clips.forEach((clip, i) => {
    const next = clips[i + 1];
    const endF = frame(clip.timelineEnd, fps);
    if (next && frame(next.timelineStart, fps) <= endF) {
      const moves = [...withPartner(clip, 'end'), ...withPartner(next, 'start')];
      cuts.push({ atF: frame(next.timelineStart, fps), moves });
      return;
    }
    cuts.push({ atF: endF, moves: withPartner(clip, 'end') });
    if (next) cuts.push({ atF: frame(next.timelineStart, fps), moves: withPartner(next, 'start') });
  });
  return cuts;
}
