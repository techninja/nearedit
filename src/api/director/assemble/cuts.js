/**
 * Pick → source cuts. A pick's rough range becomes one or more exact
 * stretches of its file: speech is snapped outward to word boundaries and
 * (optionally) has its pauses cut out; picture is snapped to shot
 * boundaries; a still simply gets a length.
 * @module api/director/assemble/cuts
 */

import { ceilFrames, floorFrames, toFrames } from '#utils/director/snap.js';
import { alignToWords } from '#utils/director/speech.js';
import { keepRuns } from '#utils/director/tighten.js';
import { alignPicture, usablePart } from './usable.js';

/**
 * @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo
 * @typedef {import('./options.js').AssembleOptions} AssembleOptions
 * @typedef {ReturnType<import('./options.js').createStats>} Stats
 * @typedef {Object} Cut
 * @property {MediaInfo} media
 * @property {number} inF - Source in, frames
 * @property {number} lenF - Length, frames
 * @property {boolean} speech - Timed from speech; never re-timed to a beat
 */

/**
 * A source range in whole frames, kept inside the file.
 * @param {MediaInfo} media
 * @param {number} start - Seconds
 * @param {number} end
 * @param {number} fps
 * @param {boolean} outward - Round the ends away from each other (speech) or to nearest
 * @param {number} [minInF=0] - Never start before this frame
 * @returns {Cut|null} null when less than a frame is left
 */
export function toCut(media, start, end, fps, outward, minInF = 0) {
  const lastF = media.duration ? floorFrames(media.duration, fps) : Infinity;
  const inF = Math.max(minInF, outward ? floorFrames(start, fps) : toFrames(start, fps));
  const outF = Math.min(lastF, outward ? ceilFrames(end, fps) : toFrames(end, fps));
  return outF - inF >= 1 ? { media, inF, lenF: outF - inF, speech: outward } : null;
}

/**
 * Cuts for a stretch of speech.
 * @param {MediaInfo} media
 * @param {number} start
 * @param {number} end
 * @param {AssembleOptions} opts
 * @param {Stats} stats
 * @returns {Cut[]}
 */
export function speechCuts(media, start, end, opts, stats) {
  const aligned = alignToWords(media.words, start, end, opts.padding);
  if (aligned.snapped) stats.wordAligned++;
  else if (!media.words.length) stats.segmentOnly++;
  let runs = [{ start: aligned.start, end: aligned.end }];
  if (opts.tighten) {
    const kept = keepRuns(media, start, end, opts);
    if (kept.basis !== 'none') runs = kept.runs;
    const keptSeconds = runs.reduce((sum, r) => sum + (r.end - r.start), 0);
    stats.pausesRemoved += Math.max(0, runs.length - 1);
    if (runs.length > 1) stats.secondsRemoved += aligned.end - aligned.start - keptSeconds;
  }
  const cuts = [];
  let minInF = 0;
  for (const run of runs) {
    const cut = toCut(media, run.start, run.end, opts.fps, true, minInF);
    if (!cut) continue;
    cuts.push(cut);
    minInF = cut.inF + cut.lenF;
  }
  return cuts;
}

/**
 * The cut for a stretch of picture.
 * @param {MediaInfo} media
 * @param {{ start: number|null, end: number|null, duration?: number|null }} part
 * @param {number} need - Seconds wanted when the part is open-ended
 * @param {AssembleOptions} opts
 * @param {Stats} stats
 * @returns {Cut|null}
 */
export function pictureCut(media, part, need, opts, stats) {
  const use = stats.uses.get(media.filePath) || 0;
  stats.uses.set(media.filePath, use + 1);
  let range;
  if (part.start === null) {
    range = usablePart(media, part.duration ?? need, { use });
  } else {
    const end = part.end ?? part.start + (part.duration ?? need);
    const aligned = alignPicture(media, part.start, end, opts.sceneTolerance);
    stats.sceneSnapped += aligned.snapped;
    range = aligned;
  }
  const cut = toCut(media, range.start, range.end, opts.fps, false);
  return cut && { ...cut, speech: false };
}

/**
 * Every cut of one resolved pick, in order.
 * @param {import('../plan/resolve.js').ResolvedPick} pick
 * @param {AssembleOptions} opts
 * @param {Stats} stats
 * @returns {Cut[]}
 */
export function cutsForPick(pick, opts, stats) {
  const { media } = pick;
  if (media.type === 'image') {
    const lenF = Math.max(1, toFrames(pick.duration ?? opts.stillDuration, opts.fps));
    return [{ media, inF: 0, lenF, speech: false }];
  }
  // Only speech-led files get word alignment and pause removal: tightening a
  // picture clip around someone's stray remark would throw the action away.
  const timed = media.words.length || media.segments.length || media.silences.length;
  if (pick.role === 'broll' || media.kind !== 'speech' || !timed) {
    const cut = pictureCut(media, pick, opts.shotDuration, opts, stats);
    return cut ? [cut] : [];
  }
  const start = pick.start ?? 0;
  const length = media.duration ?? Infinity;
  let end = pick.end ?? (pick.duration ? start + pick.duration : length);
  if (pick.end === null && end - start > opts.target) {
    end = start + opts.target;
    stats.notes.push(
      `No part of ${media.filename} was named — its first ${Math.round(opts.target)}s were used.`,
    );
  }
  return speechCuts(media, start, Math.min(end, length), opts, stats);
}
