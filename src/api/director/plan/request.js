/**
 * Ask the LLM for an edit plan: one attempt, and one retry that feeds the
 * validation errors back. If the retry is still not valid, whatever picks
 * are individually valid are kept; if none are, the request fails.
 * @module api/director/plan/request
 */

import { DirectorError } from '../errors.js';
import { parsePlan, salvagePlan } from './parse.js';

/**
 * @typedef {Object} PlanRequest
 * @property {import('../llm/client.js').LlmClient} llm
 * @property {string} system - System prompt
 * @property {string} user - User prompt (media digest and request)
 * @property {(plan: any) => string[]} [check] - Extra checks beyond the schema
 *   (e.g. "no pick names a known file"); returned messages trigger the retry
 * @property {AbortSignal} [signal]
 * @property {(message: string) => void} [log]
 * @property {(chars: number, attempt: number) => void} [onProgress]
 */

/**
 * The correction message of the retry.
 * @param {string[]} errors
 * @returns {string}
 */
export function correctionPrompt(errors) {
  return [
    'That reply could not be used as an edit plan:',
    ...errors.slice(0, 10).map((e) => `- ${e}`),
    'Reply again with ONE corrected JSON object that follows the schema exactly. ' +
      'No commentary, no code fences.',
  ].join('\n');
}

/**
 * @param {PlanRequest} req
 * @returns {Promise<{ plan: any, notes: string[], attempts: number }>}
 */
export async function requestPlan(req) {
  const { llm, check = () => [], signal, log = () => {} } = req;
  const messages = [
    { role: /** @type {const} */ ('system'), content: req.system },
    { role: /** @type {const} */ ('user'), content: req.user },
  ];
  const chat = (/** @type {any[]} */ msgs, /** @type {number} */ attempt) =>
    llm.chat({
      messages: msgs,
      json: true,
      signal,
      onToken: (_delta, info) => req.onProgress?.(info.chars, attempt),
    });
  const judge = (/** @type {string} */ text) => {
    const parsed = parsePlan(text);
    if (parsed.ok === false) return { errors: parsed.errors };
    const problems = check(parsed.plan);
    return problems.length
      ? { errors: problems }
      : { plan: parsed.plan, repaired: parsed.repaired };
  };

  const first = await chat(messages, 1);
  let verdict = judge(first.text);
  if (verdict.plan) {
    const notes = verdict.repaired ? ['The model’s JSON was malformed and was repaired.'] : [];
    return { plan: verdict.plan, notes, attempts: 1 };
  }

  const firstErrors = verdict.errors;
  log(`Plan not usable (${firstErrors[0]}) — asking the model to correct it`);
  const second = await chat(
    [
      ...messages,
      { role: 'assistant', content: first.text.slice(0, 8000) || '(empty reply)' },
      { role: 'user', content: correctionPrompt(firstErrors) },
    ],
    2,
  );
  verdict = judge(second.text);
  const retryNote = `The model’s first plan was rejected (${firstErrors[0]}); it was asked to correct it.`;
  if (verdict.plan) return { plan: verdict.plan, notes: [retryNote], attempts: 2 };

  for (const text of [second.text, first.text]) {
    const salvaged = salvagePlan(text);
    if (!salvaged || check(salvaged.plan).length) continue;
    const dropped = salvaged.dropped.map((d) => `Dropped from the plan — ${d}.`);
    return { plan: salvaged.plan, notes: [retryNote, ...dropped], attempts: 2 };
  }
  throw new DirectorError('The LLM did not return a usable edit plan', {
    status: 502,
    detail: verdict.errors.slice(0, 5).join('; '),
  });
}
