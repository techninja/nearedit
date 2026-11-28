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

import { sectionName } from '#utils/director/score/arc.js';
import { autoStyle } from '#utils/director/score/auto.js';
import { moodsIn, readMood } from '#utils/director/score/mood.js';
import { AUTO, findStyle, getStyle } from '#utils/director/score/styles.js';
import { SONG_LIMITS } from '#utils/music/limits.js';
import { keyName } from '#utils/music/normalize.js';
import { scorePrompt } from '../prompts/score.js';
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

const clamp01 = (/** @type {number} */ value) => Math.min(1, Math.max(0, value));

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
      ...scorePrompt({ directive, format, seen }),
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

/**
 * Turn a plan into the choices the generator needs.
 * @param {ScorePlan} plan
 * @param {{ params: Record<string, any>, prompt: string, seen: Seen, by: 'llm'|'rule' }} given
 * @returns {{ style: import('#utils/director/score/style.js').Style, energy: number,
 *   brightness: number, mood: string[], bpm: number, key: string|undefined,
 *   sections: import('#utils/director/score/sections.js').AskedSection[], notes: string[] }}
 */
export function decide(plan, { params, prompt, seen, by }) {
  const notes = [];
  const auto = () =>
    autoStyle({
      cutsPerMinute: seen.cutsPerMinute,
      spoken: seen.speech.spoken,
      seed: params.seed,
      brief: prompt,
    });
  let style = getStyle(params.style);
  if (style) notes.push(`Style ${style.label}, as chosen in the form.`);
  else if (plan.style === AUTO || !plan.style) {
    const chosen = auto();
    style = chosen.style;
    notes.push(`Style ${style.label} — ${chosen.why}.`);
  } else {
    style = findStyle(plan.style);
    if (style) notes.push(`Style ${style.label} (the LLM’s choice).`);
    else {
      const chosen = auto();
      style = chosen.style;
      notes.push(`Unknown style “${plan.style}” — ${style.label} is used instead: ${chosen.why}.`);
    }
  }
  const mood = readMood(plan.mood);
  const energy = Math.round(clamp01(params.energy + mood.energy) * 100) / 100;
  const brightness = Math.round(clamp01(0.5 + mood.brightness) * 100) / 100;
  if (mood.known.length) {
    const source = by === 'llm' ? 'Mood' : 'Mood from the brief';
    notes.push(`${source}: ${mood.known.join(', ')} — energy ${energy}, brightness ${brightness}.`);
  }
  if (mood.unknown.length && by === 'llm') {
    notes.push(
      `Mood words the director does not know were passed over: ${mood.unknown.join(', ')}.`,
    );
  }
  const sections = (plan.sections || []).map((section) => {
    const name = sectionName(section.name);
    if (!name) notes.push(`Unknown kind of section “${section.name}” — taken as a verse.`);
    const share = section.share > 0 ? section.share : 1;
    return { name: name || 'verse', share, energy: section.energy };
  });
  const [slowest, fastest] = SONG_LIMITS.bpm;
  const asked = params.bpm > 0 ? params.bpm : plan.bpm;
  const bpm = asked > 0 ? Math.min(fastest, Math.max(slowest, asked)) : 0;
  const key = params.key !== AUTO ? params.key : keyName(plan.key, '') || undefined;
  return { style, energy, brightness, mood: mood.known, bpm, key, sections, notes };
}
