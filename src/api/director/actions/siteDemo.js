/**
 * `site_demo` — a demo of a web page, from an address and a few plain
 * lines. A demo plan says what is shown (read from the brief, written by
 * the LLM when asked, or a tour of the page when there is no brief); its
 * names are matched to the page, the recipe is timed and recorded by the
 * web clip recorder inside the job, and the builder frames the recording:
 * zooms, captions, a window on a background. Reference:
 * docs/app-spec/DIRECTOR-WEB.md.
 * @module api/director/actions/siteDemo
 */

import { formatSeconds } from '#utils/director/snap.js';
import { describeStop } from '#utils/director/web/brief.js';
import { paceSteps } from '#utils/director/web/pacing.js';
import { demoView } from '#utils/director/web/sizes.js';
import { splitCaption } from '#utils/director/web/words.js';
import { hostOf, normalizeRecipe } from '#utils/web/index.js';
import { directorResult } from '../result.js';
import { brandCard, brandNotes, demoBrand } from '../web/brand.js';
import { buildDemo } from '../web/build.js';
import { titleCard } from '../web/card.js';
import { checkRecorder, checkSite } from '../web/check.js';
import { finishDemo, finishFrames } from '../web/finish.js';
import { demoNotes, describeDemo } from '../web/notes.js';
import { planDemo } from '../web/plan.js';
import { recordDemo } from '../web/record.js';
import { resolveStops } from '../web/resolve.js';
import { stageFor } from '../web/stage.js';
import { createSurvey } from '../web/survey.js';
import { demoTheme, pageTone } from '../web/theme.js';

/**
 * @typedef {import('../pipeline.js').ActionContext} ActionContext
 * @typedef {Object} RecorderParts - The recorder, for tests to stand in for
 * @property {typeof import('../../web/status.js').browserStatus} [status]
 * @property {typeof import('../../web/snapshot.js').takeSnapshot} [snapshot]
 * @property {typeof import('../../web/cache.js').recordToCache} [record]
 */

/**
 * @param {ActionContext} ctx
 * @param {RecorderParts} [recorder]
 * @returns {Promise<import('../result.js').DirectorResult>}
 */
export async function siteDemo(ctx, recorder = {}) {
  const { directive, format, edl } = ctx;
  const { params, context, mode } = directive;
  const { fps } = format;
  const url = checkSite(directive);
  ctx.progress(12, 'Looking for a browser to record with…');
  const browser = await checkRecorder(recorder);
  const view = demoView(format, params.size, params.look);
  const base = {
    ...{ url, viewport: view.viewport, scale: view.scale, onMissing: 'skip' },
    cursor: { ...view.cursor, clicks: true },
  };
  const survey = createSurvey({ base, browser, signal: ctx.signal, snapshot: recorder.snapshot });
  ctx.progress(15, `Reading ${hostOf(url)}…`);
  const seen = await survey.look();
  const brand = demoBrand(ctx);
  const look = demoTheme(params.theme, await pageTone(seen.image), brand);
  const finished = Boolean(brand && params.finished);

  const notes = [];
  const span = mode === 'range' && context.range ? context.range.end - context.range.start : 0;
  const total = params.duration || span;
  const heading = splitCaption(params.title || '');
  // The card's length does not depend on the plan, so the plan can be given the time that is left.
  const style = { theme: look.theme.id, format, pacing: params.pacing, seed: 1 };
  /** @type {(words: { title?: string, subtitle?: string }) => [string, string]} */
  const titled = (words) => {
    const given = heading.head ? [heading.head, heading.caption] : [words.title, words.subtitle];
    // A finished piece always opens: with the page's own name when no title was given.
    return [given[0] || (finished ? seen.title || hostOf(url) : ''), given[1] || ''];
  };
  const cardOf = (/** @type {{ title?: string, subtitle?: string }} */ words) => {
    const [head, second] = titled(words);
    return brand ? brandCard(brand.kit, head, second, format) : titleCard(head, second, style);
  };
  const tailF = finished ? finishFrames(brand.kit, fps) : 0;
  const spare = (/** @type {number} */ frames) =>
    total ? Math.max(1, total - (frames + tailF) / fps) : 0;
  const plan = await planDemo(ctx, seen, spare(cardOf({}).frames), notes);
  const card = cardOf(plan);
  ctx.signal?.throwIfAborted();

  ctx.progress(30, 'Matching names to the page…');
  const found = await resolveStops(plan.stops, seen, survey, { zoom: params.zoom });
  const quiet = params.captions ? found.steps : found.steps.map((step) => ({ ...step, note: '' }));
  const paced = paceSteps(quiet, { fps, pacing: params.pacing, target: spare(card.frames) });
  const steps = paced.steps.map((step, i) => ({ ...step, note: found.steps[i].note }));
  const recipe = normalizeRecipe({ ...base, lead: paced.lead, tail: paced.tail, steps });
  ctx.progress(33, `Recording ${formatSeconds(paced.seconds)} of ${hostOf(url)}…`);
  const recording = await recordDemo({ ctx, recipe, browser, record: recorder.record });
  ctx.progress(94, 'Framing the recording…');

  const { track } = recording;
  const captioned = params.captions && track.steps.some((step) => step.note);
  const stage = stageFor(params.look, format, recipe.viewport, captioned);
  const labels = plan.stops.map((stop) => stop.say || describeStop(stop));
  const framed = buildDemo({
    ...{ recording, recipe, stage, theme: look.theme, colors: look.colors, format, card, labels },
    ...{ owners: found.owners, zoom: params.zoom, captions: params.captions, kit: brand?.kit },
  });
  const [title] = titled(plan);
  const closing = { kit: brand?.kit, format, startF: card.frames, title, text: hostOf(url) };
  const built = finished ? finishDemo(framed, closing) : { ...framed, finished: [] };
  notes.push(
    ...demoNotes({ plan, found, paced, recording, view, look, stage, built, card, survey, params }),
    ...brandNotes({ brand, built, card, asked: params.finished }),
  );
  const count = plan.stops.length;
  const extras = [
    `${stage.look === 'window' ? 'window' : 'full-frame'} look`,
    ...(stage.look === 'window' || card.frames ? [look.theme.label] : []),
    ...(built.counts.captions
      ? [`${built.counts.captions} caption${built.counts.captions === 1 ? '' : 's'}`]
      : []),
    ...(built.counts.zooms
      ? [`${built.counts.zooms} zoom${built.counts.zooms === 1 ? '' : 's'}`]
      : []),
  ];
  const summary =
    `Site demo of ${hostOf(url)}: ${count} stop${count === 1 ? '' : 's'}, ` +
    `${formatSeconds(built.seconds)} — ${extras.join(', ')}`;
  const described = describeDemo({
    plan,
    title: card.frames ? title : '',
    made: { recording, recipe, stage, theme: look.theme.id },
    owners: found.owners,
  });
  return directorResult(
    { tracks: built.tracks, markers: built.markers, summary, notes, plan: described },
    directive,
    edl,
    fps,
  );
}
