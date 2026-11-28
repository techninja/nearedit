/**
 * Where a score's plan comes from, and what it comes to. The plan — a
 * style, mood words, perhaps sections, a tempo and a key — is written by
 * the language model when asked and able, otherwise by rule: the style
 * from the form or from the timeline's pace and speech, the mood from the
 * words of the brief. Whoever wrote it, `decide` turns it into the choices
 * the generator needs; what the form fixes always wins.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § The plan.
 * @module api/director/score/plan
 */

import { moodsIn } from '#utils/director/score/mood.js';
import { scorePrompt } from '../prompts/score.js';
import { soundLine } from './brand.js';
import { requestScorePlan } from './request.js';

/**
 * @typedef {{ style: string, mood?: string[], sections?: { name: string, share?: number,
 *   energy?: number }[], bpm?: number, key?: string }} ScorePlan
 * @typedef {Object} Seen - What was read from the timeline
 * @property {number} seconds
 * @property {string} what
 * @property {number} cutsPerMinute
 * @property {import('#utils/director/score/sections.js').TurningPoint[]} points
 * @property {import('./speech.js').Heard} speech
 */

/**
 * Let the LLM write the plan; null when it cannot.
 * @param {import('../pipeline.js').ActionContext} ctx
 * @param {Seen} seen
 * @param {string[]} notes
 * @returns {Promise<ScorePlan|null>}
 */
async function askLlm(ctx, seen, notes) {
  const { directive, llm, format } = ctx;
  try {
    ctx.progress(15, `Asking ${llm.model} for a score plan…`);
    let lastReport = 0;
    const asked = await requestScorePlan({
      llm,
      ...scorePrompt({ directive, format, seen, sound: soundLine(ctx) }),
      signal: ctx.signal,
      log: ctx.log,
      onProgress: (chars, attempt) => {
        if (Date.now() - lastReport < 750) return;
        lastReport = Date.now();
        const verb = attempt === 1 ? 'Writing' : 'Correcting';
        ctx.progress(Math.min(34, 15 + chars / 40), `${verb} the plan… ${chars} characters`);
      },
    });
    ctx.progress(35, `Plan received: ${asked.plan.style}`);
    notes.push(`The music was planned by the LLM (${llm.model}).`, ...asked.notes);
    return asked.plan;
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    notes.push(
      `The LLM could not plan the music (${err.message}) — the style and the mood were ` +
        'chosen from the timeline and the brief instead.',
    );
    return null;
  }
}

/**
 * The plan of a score.
 * @param {import('../pipeline.js').ActionContext} ctx
 * @param {Seen} seen
 * @param {string[]} notes - Added to
 * @returns {Promise<{ plan: ScorePlan, by: 'llm'|'rule' }>}
 */
export async function planScore(ctx, seen, notes) {
  const { params, prompt } = ctx.directive;
  if (params.useLlm) {
    const plan = await askLlm(ctx, seen, notes);
    if (plan) return { plan, by: 'llm' };
  }
  const mood = moodsIn(prompt);
  return { plan: { style: params.style, ...(mood.length && { mood }) }, by: 'rule' };
}

export { decide } from './decide.js';
