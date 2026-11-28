/**
 * Ask the LLM for a score plan: one attempt, and one retry that feeds the
 * validation errors back. If the retry is still not valid, what is usable
 * of it is kept; if nothing is, the request fails and the heuristic takes
 * over. The procedure `plan/request.js` follows for edit plans, for the
 * score plan's own parser.
 * @module api/director/score/request
 */

import { DirectorError } from '../errors.js';
import { parseScorePlan, salvageScorePlan } from './parse.js';

/**
 * @typedef {Object} ScoreRequest
 * @property {import('../llm/client.js').LlmClient} llm
 * @property {string} system - System prompt
 * @property {string} user - User prompt (the timeline and the brief)
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
    'That reply could not be used as a score plan:',
    ...errors.slice(0, 10).map((e) => `- ${e}`),
    'Reply again with ONE corrected JSON object: {"style": "...", "mood": ["..."], ' +
      '"sections": [{"name": "...", "share": 1, "energy": 0.5}]}. No commentary, no code fences.',
  ].join('\n');
}

/**
 * @param {ScoreRequest} req
 * @returns {Promise<{ plan: any, notes: string[], attempts: number }>}
 * @throws {DirectorError} 502 when neither reply names a style
 */
export async function requestScorePlan(req) {
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
      maxTokens: 1024,
      onToken: (_delta, info) => req.onProgress?.(info.chars, attempt),
    });

  const first = await chat(messages, 1);
  const parsed = parseScorePlan(first.text);
  if (parsed.ok === true) {
    const notes = parsed.repaired ? ['The model’s JSON was malformed and was repaired.'] : [];
    return { plan: parsed.plan, notes, attempts: 1 };
  }

  log(`Plan not usable (${parsed.errors[0]}) — asking the model to correct it`);
  const second = await chat(
    [
      ...messages,
      { role: 'assistant', content: first.text.slice(0, 4000) || '(empty reply)' },
      { role: 'user', content: correctionPrompt(parsed.errors) },
    ],
    2,
  );
  const retried = parseScorePlan(second.text);
  const retryNote = `The model’s first plan was rejected (${parsed.errors[0]}); it was asked to correct it.`;
  if (retried.ok === true) return { plan: retried.plan, notes: [retryNote], attempts: 2 };

  for (const text of [second.text, first.text]) {
    const salvaged = salvageScorePlan(text);
    if (!salvaged) continue;
    const dropped = salvaged.dropped.map((d) => `Dropped from the plan — ${d}.`);
    return { plan: salvaged.plan, notes: [retryNote, ...dropped], attempts: 2 };
  }
  throw new DirectorError('The LLM did not return a usable score plan', {
    status: 502,
    detail: retried.errors.slice(0, 5).join('; '),
  });
}
