/**
 * `base_edit` — the automatic rough cut, no LLM. Classifies the project's
 * media from its sidecars, writes an edit plan with heuristics and hands
 * it to the same assembler the LLM plans go through.
 * Reference: docs/app-spec/DIRECTOR.md § Base edit.
 * @module api/director/actions/baseEdit
 */

import { formatSeconds } from '#utils/director/snap.js';
import { PACING } from '../assemble/options.js';
import { planMontage, shotLength } from '../baseEdit/montagePlan.js';
import { chooseMusic, musicStart } from '../baseEdit/music.js';
import { planSpeech } from '../baseEdit/speechPlan.js';
import { DirectorError } from '../errors.js';
import { assembleResult } from '../pipeline.js';

/** @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo */

/**
 * One line saying what the media was taken to be.
 * @param {Record<string, MediaInfo[]>} kinds
 * @returns {string}
 */
function inventory(kinds) {
  const names = (/** @type {MediaInfo[]} */ list) =>
    list.length <= 3 ? list.map((m) => m.filename).join(', ') : `${list.length} files`;
  const parts = [];
  if (kinds.speech.length) parts.push(`speech: ${names(kinds.speech)}`);
  if (kinds.picture.length) parts.push(`picture: ${names(kinds.picture)}`);
  if (kinds.still.length) parts.push(`stills: ${names(kinds.still)}`);
  if (kinds.music.length) parts.push(`music: ${names(kinds.music)}`);
  return `Media read as — ${parts.join('; ')}.`;
}

/**
 * Build the heuristic plan for a base edit.
 * @param {MediaInfo[]} media
 * @param {Record<string, any>} params - base_edit params
 * @returns {{ plan: any, notes: string[], style: 'talking_head'|'montage' }}
 */
export function planBaseEdit(media, params) {
  const own = media.filter((m) => !m.global);
  const kinds = { speech: [], picture: [], still: [], music: [] };
  for (const m of own) kinds[m.kind].push(m);
  const notes = [inventory(kinds)];
  const unanalysed = own.filter((m) => !m.analysed).length;
  if (unanalysed)
    notes.push(
      `${unanalysed} file${unanalysed === 1 ? ' has' : 's have'} not been analysed — ` +
        'only length and size were known. Run analysis for word, shot and beat accuracy.',
    );

  const target = params.duration;
  const speech = planSpeech(kinds.speech, { duration: target, threshold: params.threshold });
  let style = params.style;
  if (style === 'auto') {
    style = speech.total >= Math.min(10, target * 0.25) ? 'talking_head' : 'montage';
    const why = speech.total ? `${formatSeconds(speech.total)} of speech found` : 'no speech found';
    notes.push(`Style auto → ${style === 'montage' ? 'montage' : 'talking head'} (${why}).`);
  } else if (style === 'talking_head' && !speech.picks.length) {
    style = 'montage';
    notes.push('No speech-led media was found, so a montage was built instead.');
  }

  const music = params.music ? chooseMusic(media, target) : null;
  /** @type {any} */
  const plan = { picks: [] };
  if (params.title) plan.title = params.title;
  if (music) plan.music = { file: music.handle, start: musicStart(music) };

  if (style === 'talking_head') {
    plan.picks = speech.picks;
    notes.push(...speech.notes);
    if (speech.total <= target * 1.15 && speech.seconds < target * 0.8)
      notes.push(
        `All the speech was used: about ${formatSeconds(speech.seconds)} before pauses are cut.`,
      );
  } else {
    const pictures = [...kinds.picture, ...kinds.still];
    const sources = (pictures.length ? pictures : kinds.speech.filter((m) => m.hasVideo)).sort(
      (a, b) => media.indexOf(a) - media.indexOf(b),
    );
    const pace = PACING[params.pacing] || PACING.medium;
    const bpm = music && params.beatSync ? music.bpm : null;
    const montage = planMontage(sources, {
      duration: target,
      shot: shotLength(pace.shot, bpm),
      still: shotLength(pace.still, bpm),
      role: music ? 'broll' : 'primary',
    });
    plan.picks = montage.picks;
    notes.push(...montage.notes);
  }
  return { plan, notes, style };
}

/**
 * @param {import('../pipeline.js').ActionContext} ctx
 * @returns {import('../result.js').DirectorResult}
 */
export function baseEdit(ctx) {
  const { plan, notes, style } = planBaseEdit(ctx.media, ctx.directive.params);
  if (!plan.picks.length)
    throw new DirectorError('There is nothing to build a base edit from', {
      status: 422,
      detail: 'The project has no video, speech or image files. Add media to the project folder.',
    });
  ctx.progress(
    50,
    `Planned a ${style === 'montage' ? 'montage' : 'talking-head cut'} of ${plan.picks.length} picks`,
  );
  // The heuristic takes are already trimmed inside their shots: only snap a
  // cut that would otherwise leave a few stray frames of the next shot.
  const result = assembleResult(plan, ctx, { notes, options: { sceneTolerance: 0.2 } });
  result.summary = `Base edit (${style === 'montage' ? 'montage' : 'talking head'}): ${result.summary}`;
  return result;
}
