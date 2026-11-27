/**
 * The optional LLM ranking of `insert_broll`: the model picks from the
 * project's picture material; any failure hands back to keyword matching.
 * @module api/director/actions/brollLlm
 */

import { buildDigest } from '../context/digest.js';
import { requestPlan } from '../plan/request.js';
import { resolvePlan } from '../plan/resolve.js';
import { brollPrompt } from '../prompts/editPlan.js';
import { usesKnownFiles } from './generateEdit.js';

/** @typedef {import('../pipeline.js').ActionContext} ActionContext */

/**
 * Let the LLM choose the b-roll; null when it cannot (keywords take over).
 * @param {ActionContext} ctx
 * @param {number} seconds
 * @param {string[]} notes
 * @returns {Promise<import('../search.js').BrollHit[]|null>}
 */
export async function askLlm(ctx, seconds, notes) {
  const { directive, llm } = ctx;
  const pictures = ctx.media.filter((m) => m.hasVideo);
  const digest = buildDigest(pictures, { focus: directive.prompt, budget: 12000 });
  const prompt = brollPrompt({
    digest: digest.text,
    prompt: directive.prompt,
    count: directive.params.count,
    seconds,
  });
  try {
    ctx.progress(20, `Asking ${llm.model} to choose the b-roll…`);
    const asked = await requestPlan({
      llm,
      ...prompt,
      check: usesKnownFiles(pictures),
      signal: ctx.signal,
      log: ctx.log,
    });
    const picks = resolvePlan(asked.plan, pictures).picks.filter((p) => p.media.hasVideo);
    notes.push('Chosen by the LLM.', ...asked.notes);
    return picks.map((p) => ({ media: p.media, score: 0, matched: [], at: p.start }));
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    notes.push(`The LLM could not choose (${err.message}) — keyword matching was used instead.`);
    return null;
  }
}
