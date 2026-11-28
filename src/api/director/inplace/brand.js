/**
 * `brand` — "Apply brand": dress the posted timeline in the project's
 * brand kit, as one step. The request is read by rule (and, when asked,
 * a language model says who speaks where); the pass itself is the pure
 * `brandPass`, made of the editor's own operations, and comes back as the
 * whole timeline — with the caption style and the font files it needs as
 * the result's `document` part.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § The brand pass.
 * @module api/director/inplace/brand
 */

import { brandPass } from '#utils/director/brand/pass.js';
import { readBrandRequest } from '#utils/director/brand/request.js';
import { readProject } from '../../lib/registry.js';
import { kitOf } from '../brand/kit.js';
import { brandReport } from '../brand/report.js';
import { timeSpeakers } from '../brand/speakers.js';
import { speakingFiles } from '../brand/speech.js';
import { docTracks, inPlaceResult, mediaLookup } from './doc.js';

/**
 * @param {import('../pipeline.js').ActionContext} ctx
 * @returns {Promise<import('../result.js').DirectorResult & { document?: object }>}
 */
export async function applyBrand(ctx) {
  const { directive, edl } = ctx;
  const kit = kitOf(ctx);
  const request = readBrandRequest(directive.params, directive.prompt, kit);
  const notes = [...request.notes];
  const title = request.title || readProject(ctx.projectId)?.name || ctx.format.name || '';
  const people = request.parts.names && (request.speakers.length || directive.params.useLlm);
  const speaking = people ? speakingFiles(edl, mediaLookup(ctx.media)) : [];
  const speakers = people ? await timeSpeakers(ctx, request.speakers, speaking, notes) : [];
  ctx.signal?.throwIfAborted();
  ctx.progress(60, 'Placing the brand’s elements…');

  const passed = brandPass(edl, kit, { ...request, title, speakers });
  const report = brandReport(passed, kit);
  // What was assumed about the speakers matters where a name was placed by it.
  const named = passed.done.some((entry) => entry.state === 'placed' && entry.why);
  const said = notes.filter((note) => named || !note.startsWith('Assumed:'));
  // A track the pass made is new to the editor's document: it has no id there yet.
  const known = new Set(edl.tracks.map((/** @type {any} */ track) => track.trackId));
  const tracks = docTracks(passed.edl).map((track) =>
    known.has(track.trackId) ? track : { ...track, trackId: undefined },
  );
  const result = inPlaceResult(
    ctx,
    tracks,
    report.summary,
    [...report.notes, ...said],
    passed.edl.markers,
  );
  const family = String(passed.captions?.style.font?.family || '').toLowerCase();
  const fonts = (kit.fonts || []).filter((face) => face.family.toLowerCase() === family);
  return {
    ...result,
    plan: { title, subtitle: request.subtitle, parts: request.parts, speakers, done: passed.done },
    document: {
      ...(fonts.length && { fonts }),
      ...(passed.captions && { captions: { style: passed.captions.style } }),
      ...(passed.opened && Array.isArray(passed.edl.regions) && { regions: passed.edl.regions }),
    },
  };
}
