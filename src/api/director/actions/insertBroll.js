/**
 * `insert_broll` — find footage or stills matching the prompt and place
 * them at the playhead: as a ripple insert (default), appended, prepended,
 * over a range, or laid over the picture as a cutaway.
 * Matching is keyword scoring; the LLM can rank instead when asked.
 * @module api/director/actions/insertBroll
 */

import { formatSeconds, round3 } from '#utils/director/snap.js';
import { snapToFrame, timelineDuration } from '#utils/edl/query.js';
import { usablePart } from '../assemble/usable.js';
import { DirectorError } from '../errors.js';
import { docTracks, inPlaceResult } from '../inplace/doc.js';
import { insertTargets, overlayFragment } from '../inplace/placement.js';
import { assembleFragment } from '../pipeline.js';
import { directorResult } from '../result.js';
import { searchBroll } from '../search.js';
import { askLlm } from './brollLlm.js';

/** @typedef {import('../pipeline.js').ActionContext} ActionContext */

/**
 * @param {ActionContext} ctx
 * @returns {Promise<import('../result.js').DirectorResult>}
 */
export async function insertBroll(ctx) {
  const { directive, media, format, edl } = ctx;
  const { params, context, mode } = directive;
  const notes = [];
  const rangeLength = mode === 'range' ? context.range.end - context.range.start : 0;
  const seconds =
    rangeLength && !directive.given.includes('duration')
      ? rangeLength / params.count
      : params.duration;
  const used = new Set((edl?.tracks || []).flatMap((t) => t.clips.map((c) => c.sourceFile)));

  let hits = params.useLlm ? await askLlm(ctx, seconds, notes) : null;
  if (!hits?.length) {
    const found = searchBroll(media, directive.prompt, { used });
    hits = found.hits;
    if (!found.matched && directive.prompt)
      notes.push(`Nothing matched “${directive.prompt}” — unused footage was offered instead.`);
  }
  if (!hits.length)
    throw new DirectorError('The project has no footage or stills to use as b-roll', {
      status: 422,
    });

  const chosen = hits.slice(0, params.count);
  if (chosen.length < params.count)
    notes.push(`Only ${chosen.length} of the ${params.count} clips asked for could be found.`);
  const picks = chosen.map((hit) => {
    if (hit.matched.length)
      notes.push(`${hit.media.filename} matched “${hit.matched.join(', ')}”.`);
    if (hit.media.type === 'image') return { file: hit.media.handle, duration: round3(seconds) };
    const part = usablePart(hit.media, seconds, { near: hit.at });
    return {
      file: hit.media.handle,
      role: 'broll',
      start: round3(part.start),
      end: round3(part.end),
    };
  });
  const options = { autoBroll: false, beatSync: false, sceneTolerance: 0.2 };
  const built = assembleFragment({ picks }, ctx, options);
  const filled = built.tracks.filter((t) => t.clips.length);
  const names = [...new Set(chosen.map((h) => h.media.filename))].join(', ');
  const what = `${chosen.length} b-roll clip${chosen.length === 1 ? '' : 's'} (${formatSeconds(built.seconds)}): ${names}`;
  notes.push(...built.notes);

  if (params.placement === 'overlay') {
    const at = snapToFrame(
      mode === 'range' ? context.range.start : context.playheadPosition,
      format.fps,
    );
    const tracks = docTracks(edl);
    const placed = overlayFragment(tracks, filled, at);
    return inPlaceResult(
      ctx,
      tracks,
      `Laid ${what} over the picture at ${formatSeconds(at)} on “${placed.video.name}”`,
      notes,
    );
  }
  const targets = insertTargets(
    edl,
    mode === 'append' ? timelineDuration(edl || []) : context.playheadPosition,
  );
  const tracks = filled.map((t) => ({
    ...t,
    ...(t.type === 'video' ? targets.video : targets.audio),
  }));
  const result = directorResult(
    { tracks, summary: '', notes, plan: built.plan },
    directive,
    edl,
    format.fps,
  );
  const where = {
    insert: `inserted at ${formatSeconds(result.at)}`,
    append: 'appended',
    prepend: 'prepended',
    range: 'put in place of the range',
  };
  result.summary = `${what} ${where[mode]}`;
  return result;
}
