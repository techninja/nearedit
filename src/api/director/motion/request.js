/**
 * Ask the LLM for a motion plan: one attempt, and one retry that feeds the
 * validation errors back. If the retry is still not valid, the scenes that
 * are usable are kept; if none are, the request fails. The same procedure
 * as `plan/request.js` follows for edit plans, for the motion plan's own
 * parser.
 * @module api/director/motion/request
 */

import { DirectorError } from '../errors.js';
import { parseMotionPlan, salvageMotionPlan } from './parse.js';

/**
 * @typedef {Object} MotionRequest
 * @property {import('../llm/client.js').LlmClient} llm
 * @property {string} system - System prompt
 * @property {string} user - User prompt (the brief and the format)
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
    'That reply could not be used as a motion plan:',
    ...errors.slice(0, 10).map((e) => `- ${e}`),
    'Reply again with ONE corrected JSON object: {"scenes": [{"title": "..."}, ...]}. ' +
      'No commentary, no code fences.',
  ].join('\n');
}

/**
 * @param {MotionRequest} req
 * @returns {Promise<{ plan: any, notes: string[], attempts: number }>}
 * @throws {DirectorError} 502 when neither reply holds a usable scene
 */
export async function requestMotionPlan(req) {
  const { llm, signal, log = () => {} } = req;
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

  const first = await chat(messages, 1);
  const parsed = parseMotionPlan(first.text);
  if (parsed.ok === true) {
    const notes = parsed.repaired ? ['The model’s JSON was malformed and was repaired.'] : [];
    return { plan: parsed.plan, notes, attempts: 1 };
  }

  log(`Plan not usable (${parsed.errors[0]}) — asking the model to correct it`);
  const second = await chat(
    [
      ...messages,
      { role: 'assistant', content: first.text.slice(0, 8000) || '(empty reply)' },
      { role: 'user', content: correctionPrompt(parsed.errors) },
    ],
    2,
  );
  const retried = parseMotionPlan(second.text);
  const retryNote = `The model’s first plan was rejected (${parsed.errors[0]}); it was asked to correct it.`;
  if (retried.ok === true) return { plan: retried.plan, notes: [retryNote], attempts: 2 };

  for (const text of [second.text, first.text]) {
    const salvaged = salvageMotionPlan(text);
    if (!salvaged) continue;
    const dropped = salvaged.dropped.map((d) => `Dropped from the plan — ${d}.`);
    return { plan: salvaged.plan, notes: [retryNote, ...dropped], attempts: 2 };
  }
  throw new DirectorError('The LLM did not return a usable motion plan', {
    status: 502,
    detail: retried.errors.slice(0, 5).join('; '),
  });
}
