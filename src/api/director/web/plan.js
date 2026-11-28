/**
 * Where a demo's plan comes from: the language model when asked and
 * able, otherwise the lines of the brief, otherwise — with no brief at
 * all — a tour of the page. Whoever writes it, the plan has one shape.
 * Reference: docs/app-spec/DIRECTOR-WEB.md § The demo plan.
 * @module api/director/web/plan
 */

import { briefStops } from '#utils/director/web/brief.js';
import { paceOf } from '#utils/director/web/pacing.js';
import { tourStops } from '#utils/director/web/places.js';
import { demoPrompt } from '../prompts/siteDemo.js';
import { requestDemoPlan } from './request.js';

/** Places a tour stops at when no length is asked for. */
const TOUR_PLACES = 8;

/**
 * @typedef {{ do: string, on?: string, text?: string, say?: string }} Stop
 * @typedef {{ title?: string, subtitle?: string, stops: Stop[] }} DemoPlan
 */

/**
 * Let the LLM write the plan; null when it cannot.
 * @param {import('../pipeline.js').ActionContext} ctx
 * @param {import('./survey.js').Seen} seen
 * @param {number} target - Seconds, 0 for none
 * @param {string[]} notes
 * @returns {Promise<DemoPlan|null>}
 */
async function askLlm(ctx, seen, target, notes) {
  const { directive, llm, format } = ctx;
  try {
    ctx.progress(20, `Asking ${llm.model} for a demo plan…`);
    const prompt = demoPrompt({ directive, format, seen, target });
    let lastReport = 0;
    const asked = await requestDemoPlan({
      llm,
      ...prompt,
      signal: ctx.signal,
      log: ctx.log,
      onProgress: (chars, attempt) => {
        if (Date.now() - lastReport < 750) return;
        lastReport = Date.now();
        const verb = attempt === 1 ? 'Writing' : 'Correcting';
        ctx.progress(Math.min(28, 20 + chars / 100), `${verb} the plan… ${chars} characters`);
      },
    });
    const count = asked.plan.stops.length;
    ctx.progress(29, `Plan received: ${count} stop${count === 1 ? '' : 's'}`);
    notes.push(`The demo was planned by the LLM (${llm.model}).`, ...asked.notes);
    if (prompt.shown < prompt.total)
      notes.push(`The model was shown ${prompt.shown} of the ${prompt.total} things on the page.`);
    return asked.plan;
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    const instead = directive.prompt
      ? 'the lines of the brief were read as steps'
      : 'a tour of the page was made';
    notes.push(`The LLM could not plan the demo (${err.message}) — ${instead} instead.`);
    return null;
  }
}

/**
 * A tour: down the page from heading to heading, ending on the call to action.
 * @param {import('./survey.js').Seen} seen
 * @param {Record<string, any>} params - The directive's
 * @param {number} target - Seconds the whole recording should take, 0 for none
 * @param {string[]} notes
 * @returns {DemoPlan}
 */
function tour(seen, params, target, notes) {
  const pace = paceOf(params.pacing);
  // What a place costs: the scroll and the look; the opening view and the ending cost about two more.
  const each = pace.scale + pace.look;
  const most = target > 0 ? Math.max(1, Math.floor((target - 2 * each) / each)) : TOUR_PLACES;
  const { stops, places, left } = tourStops(seen.elements, seen.viewport, most);
  const ending = stops.find((stop) => stop.do === 'focus');
  const shown = places - left;
  notes.push(
    'No brief: a tour of the page — ' +
      (places
        ? `${shown} of its ${places} section${places === 1 ? '' : 's'} below the opening view, top to bottom`
        : 'it has no headings below its opening view') +
      (ending ? `, ending on “${ending.on}”.` : '; no call to action was found to end on.'),
  );
  if (left)
    notes.push(
      `${left} section${left === 1 ? ' was' : 's were'} passed by to keep to the length asked for.`,
    );
  return { stops };
}

/**
 * The plan of a demo.
 * @param {import('../pipeline.js').ActionContext} ctx
 * @param {import('./survey.js').Seen} seen - The page as it loads
 * @param {number} target - Seconds the recording should take, 0 for none
 * @param {string[]} notes - Added to
 * @returns {Promise<DemoPlan & { by: 'llm'|'brief'|'tour' }>}
 */
export async function planDemo(ctx, seen, target, notes) {
  const { params, prompt } = ctx.directive;
  const read = briefStops(prompt);
  const words = { title: read.title, subtitle: read.subtitle };
  if (params.useLlm) {
    const plan = await askLlm(ctx, seen, target, notes);
    if (plan) return { ...words, ...plan, by: 'llm' };
  }
  if (read.stops.length) {
    notes.push(...read.notes);
    return { ...words, stops: read.stops, by: 'brief' };
  }
  return { ...words, ...tour(seen, params, target, notes), by: 'tour' };
}
