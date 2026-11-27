/**
 * `remove_silence` — tighten the selected clips, or every speech clip, by
 * cutting out pauses. Uses word timestamps, or detected silences where a
 * file has no transcript. Linked picture and sound split together and
 * everything later closes up.
 * @module api/director/inplace/removeSilence
 */

import { ceilFrames, floorFrames, formatSeconds } from '#utils/director/snap.js';
import { keepRuns } from '#utils/director/tighten.js';
import { timelineDuration } from '#utils/edl/query.js';
import { fixCrossfades, mergeSpans, rippleClip, splitClip } from './collapse.js';
import { docTracks, inPlaceResult, mediaLookup, scopedClips } from './doc.js';

/**
 * The pauses to remove from one clip, as timeline frame spans. Cuts are
 * rounded inward so no speech is lost, kept off the clip's fades, and (in
 * range mode) inside the range.
 * @param {any} clip
 * @param {{ start: number, end: number }[]} runs - Source stretches to keep
 * @param {{ fps: number, range: { start: number, end: number } | null }} env
 * @returns {[number, number][]}
 */
export function pauseSpans(clip, runs, env) {
  const toTimeline = (/** @type {number} */ source) => clip.timelineStart + source - clip.sourceIn;
  const from = Math.max(clip.timelineStart + clip.fadeIn, env.range?.start ?? 0);
  const to = Math.min(clip.timelineEnd - clip.fadeOut, env.range?.end ?? Infinity);
  const spans = [];
  let cursor = clip.sourceIn;
  for (const run of [...runs, { start: clip.sourceOut, end: clip.sourceOut }]) {
    const startF = ceilFrames(Math.max(from, toTimeline(cursor)), env.fps);
    const endF = floorFrames(Math.min(to, toTimeline(run.start)), env.fps);
    if (endF - startF >= 2) spans.push(/** @type {[number, number]} */ ([startF, endF]));
    cursor = Math.max(cursor, run.end);
  }
  return spans;
}

/**
 * Link the pieces of two split clips that cover the same frames.
 * @param {{ clip: any, span: [number, number] }[]} a
 * @param {{ clip: any, span: [number, number] }[]} b
 */
function relink(a, b) {
  for (const piece of a) {
    const twin = b.find((p) => p.span[0] === piece.span[0] && p.span[1] === piece.span[1]);
    if (!twin) continue;
    piece.clip.linkedClipId = twin.clip.clipId;
    twin.clip.linkedClipId = piece.clip.clipId;
  }
}

/**
 * @param {import('../pipeline.js').ActionContext} ctx
 * @returns {import('../result.js').DirectorResult}
 */
export function removeSilence(ctx) {
  const { directive, format } = ctx;
  const { fps } = format;
  const range = directive.mode === 'range' ? directive.context.range : null;
  const tracks = docTracks(ctx.edl);
  const lookup = mediaLookup(ctx.media);
  const byId = new Map(
    tracks.flatMap((t) => t.clips.map((c) => [c.clipId, { clip: c, track: t }])),
  );
  const targets = new Set();
  const bases = new Set();
  const notes = [];
  /** @type {[number, number][]} */
  const removed = [];
  let tightened = 0;

  for (const { clip, track, chosen } of scopedClips(tracks, directive)) {
    const media = lookup(clip.sourceFile);
    const partner = byId.get(clip.linkedClipId);
    if (targets.has(clip.clipId) || !media || media.type === 'image') continue;
    if (!chosen && (media.kind === 'music' || clip.intent === 'music')) continue;
    if (!chosen && track.type === 'video' && !partner) continue;
    const data = media.words.length ? { words: media.words } : { silences: media.silences };
    const usable =
      media.words.length || (media.silences.length && (chosen || media.kind === 'speech'));
    const kept = usable ? keepRuns(data, clip.sourceIn, clip.sourceOut, directive.params) : null;
    if (!kept || kept.basis === 'none') {
      if (chosen && !usable)
        notes.push(
          `${media.filename} has no word timestamps or silence analysis — run analysis first.`,
        );
      continue;
    }
    const spans = pauseSpans(clip, kept.runs, { fps, range });
    if (!spans.length) continue;
    removed.push(...spans);
    bases.add(kept.basis);
    tightened++;
    targets.add(clip.clipId);
    if (partner && !partner.track.locked) targets.add(partner.clip.clipId);
  }

  if (!removed.length) {
    const pause = `${directive.params.threshold}s`;
    return inPlaceResult(
      ctx,
      tracks,
      `No pauses longer than ${pause} found — nothing changed`,
      notes,
    );
  }
  const merged = mergeSpans(removed);
  const pieces = new Map();
  for (const track of tracks) {
    if (track.locked) {
      if (track.clips.some((c) => c.timelineEnd * fps > merged[0][0]))
        notes.push(`Track “${track.name}” is locked: it was not closed up and may be out of sync.`);
      continue;
    }
    const next = [];
    for (const clip of track.clips) {
      if (!targets.has(clip.clipId)) {
        const moved = rippleClip(clip, merged, fps);
        if (moved) next.push(moved);
        else
          notes.push(
            `“${clip.label || clip.clipId}” lay entirely inside a removed pause and was dropped.`,
          );
        continue;
      }
      const split = splitClip(clip, merged, fps);
      pieces.set(clip.clipId, split);
      next.push(...split.map((p) => p.clip));
    }
    track.clips = fixCrossfades(next);
  }
  for (const [clipId, split] of pieces) {
    const partnerId = byId.get(clipId).clip.linkedClipId;
    if (pieces.has(partnerId)) relink(split, pieces.get(partnerId));
    else if (partnerId && split[0]) split[0].clip.linkedClipId = partnerId;
  }

  const seconds = merged.reduce((sum, [s, e]) => sum + (e - s), 0) / fps;
  const basis = [...bases].map((b) => (b === 'words' ? 'word timestamps' : 'detected silences'));
  notes.unshift(
    `Pauses found from ${basis.join(' and ')}; ${directive.params.padding}s kept either side.`,
  );
  const s = (/** @type {number} */ n) => (n === 1 ? '' : 's');
  const summary =
    `Removed ${removed.length} pause${s(removed.length)} (${formatSeconds(seconds)}) from ` +
    `${tightened} clip${s(tightened)} — the timeline is now ${formatSeconds(timelineDuration(tracks))}`;
  return inPlaceResult(ctx, tracks, summary, notes);
}
