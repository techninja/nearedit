/**
 * The prompt that asks the LLM for a demo plan. The kinds of stop are read
 * from the recipe library's own table at the moment of asking, and the
 * page is shown as its digest — names only. The model is told to choose
 * WHAT is shown and said, and nothing about timing, selectors or position.
 * @module api/director/prompts/siteDemo
 */

import { pageDigest } from '#utils/director/web/digest.js';
import { paceOf } from '#utils/director/web/pacing.js';
import {
  DEMO_KINDS,
  DEMO_PLAN_EXAMPLE,
  WORD_PARAM,
  stopNeeds,
} from '#utils/director/web/planSchema.js';
import { formatLine } from './editPlan.js';

/** Seconds a stop takes on average at medium pacing, to suggest how many fit a length. */
const PER_STOP = 3;

/**
 * One line per kind of stop: what it does and what it needs.
 * @returns {string}
 */
function kindLines() {
  return DEMO_KINDS.map((kind) => {
    const needs = stopNeeds(kind.do);
    const word = kind.params[WORD_PARAM[kind.do]]?.label.toLowerCase();
    const says = [
      needs.on ? 'needs "on"' : needs.aims ? '"on" is optional' : '',
      needs.text ? `needs "text" (the ${word})` : '',
    ].filter(Boolean);
    return `  ${kind.do}: ${kind.description}${says.length ? ` — ${says.join(', ')}` : ''}`;
  }).join('\n');
}

/**
 * The system prompt, with the step kinds as they are now.
 * @returns {string}
 */
export function demoSystemPrompt() {
  return `You are the demo director inside a video editing program. You plan a short screen demo of a web page. The program records the page while a pointer scrolls, clicks and types on it, and adds zooms and captions. You decide WHAT is shown, in which order, and what each caption says. The program finds the elements and does all timing, pointer movement, zooming and layout afterwards.

Reply with ONE JSON object and nothing else: no commentary, no code fences.

Example of the shape:
${JSON.stringify(DEMO_PLAN_EXAMPLE, null, 1)}

Rules:
- "stops" happen one after another. Each has a "do", one of:
${kindLines()}
- "on" is the NAME of something on the page, written exactly as the PAGE list writes it between quotes: a link, button, input, heading, image or section. For scroll it may also be "top" or "bottom". Use only names from the PAGE list.
- "text" is what is typed (type), the key such as "Enter" or "Control+k" (press), the option (select), the address, which may be relative like "/pricing" (goto), or the seconds (wait).
- "say" is optional: a caption shown while the stop happens. One short line, at most about ten words. Not every stop needs one.
- "title" is optional: a few words for a title card before the demo.
- The program brings what a stop acts on into view by itself. Use scroll for a part of the page you want looked at.
- Never write times, durations, selectors, coordinates, sizes or colours.`;
}

/**
 * The prompt for `site_demo`.
 * @param {{ directive: import('#utils/director/directive.js').Directive, format: any,
 *   seen: Parameters<typeof pageDigest>[0], target?: number }} input - `seen`: the snapshot
 *   of the page; `target`: length in seconds, 0 for none
 * @returns {{ system: string, user: string, shown: number, total: number }} `shown` of
 *   `total` things on the page fitted into the prompt
 */
export function demoPrompt({ directive, format, seen, target = 0 }) {
  const { params, prompt } = directive;
  const digest = pageDigest(seen);
  const lines = ['PAGE', digest.text, '', 'TIMELINE', formatLine(format), '', 'REQUEST'];
  if (target > 0) {
    const count = Math.max(2, Math.round(target / (PER_STOP * paceOf(params.pacing).scale)));
    lines.push(`Target length: about ${Math.round(target)} seconds, so about ${count} stops.`);
  }
  lines.push(`Pacing: ${params.pacing}.`);
  lines.push(
    params.captions
      ? 'Captions: write a "say" for the stops that deserve one.'
      : 'Captions: none (the editor turned them off); leave "say" out.',
  );
  lines.push(
    prompt
      ? `What the editor asked for: ${prompt}`
      : 'The editor gave no further direction: plan a tour of the page, top to bottom, ' +
          'that ends on its main call to action.',
    '',
    'Reply with the JSON demo plan.',
  );
  return {
    system: demoSystemPrompt(),
    user: lines.join('\n'),
    shown: digest.shown,
    total: digest.total,
  };
}
