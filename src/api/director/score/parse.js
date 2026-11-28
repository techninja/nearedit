/**
 * Score plan parsing — dig the JSON out of a model reply, repair it when
 * it is malformed, normalise it and validate it against the score-plan
 * schema. The counterpart of `plan/parse.js` for edit plans.
 * @module api/director/score/parse
 */

import Ajv from 'ajv';
import { jsonrepair } from 'jsonrepair';
import { SCORE_PLAN_SCHEMA, SECTION_SCHEMA } from '#utils/director/score/planSchema.js';
import { jsonCandidates } from '../llm/clean.js';
import { normalizeScorePlan } from './normalize.js';

const ajv = new Ajv({ allErrors: true });
const validatePlan = ajv.compile(SCORE_PLAN_SCHEMA);
const validateSection = ajv.compile(SECTION_SCHEMA);

/**
 * Readable validation errors: "sections[2].energy must be <= 1".
 * @param {import('ajv').ErrorObject[]|null|undefined} errors
 * @returns {string[]}
 */
function explain(errors) {
  const lines = (errors || []).map((e) => {
    const path = e.instancePath
      .replace(/\/(\d+)/g, '[$1]')
      .replace(/\//g, '.')
      .replace(/^\./, '');
    return `${path}${path ? ' ' : ''}${e.message}`.trim();
  });
  return [...new Set(lines)].slice(0, 12);
}

/**
 * Parse one snippet strictly, then with jsonrepair.
 * @param {string} snippet
 * @returns {{ value: any, repaired: boolean } | null}
 */
function parseLoose(snippet) {
  try {
    return { value: JSON.parse(snippet), repaired: false };
  } catch {
    // Fall through: malformed JSON is expected from a language model.
  }
  try {
    return { value: JSON.parse(jsonrepair(snippet)), repaired: true };
  } catch {
    return null;
  }
}

/**
 * Normalised plans found in a reply, those that name a style first.
 * @param {string} reply
 * @returns {{ plan: any, repaired: boolean }[]}
 */
function candidatePlans(reply) {
  const plans = [];
  for (const snippet of jsonCandidates(reply)) {
    const parsed = parseLoose(snippet);
    const object = parsed && typeof parsed.value === 'object' && parsed.value !== null;
    if (!object || Array.isArray(parsed.value)) continue;
    plans.push({ plan: normalizeScorePlan(parsed.value), repaired: parsed.repaired });
  }
  const named = (/** @type {any} */ plan) => Number(typeof plan?.style === 'string');
  return plans.sort((a, b) => named(b.plan) - named(a.plan));
}

/**
 * Parse and validate a model reply as a score plan.
 * @param {string} reply
 * @returns {{ ok: true, plan: any, repaired: boolean } | { ok: false, errors: string[] }}
 */
export function parseScorePlan(reply) {
  const plans = candidatePlans(reply);
  if (!plans.length) return { ok: false, errors: ['the reply contained no JSON object'] };
  for (const { plan, repaired } of plans)
    if (validatePlan(plan)) return { ok: true, plan, repaired };
  validatePlan(plans[0].plan);
  return { ok: false, errors: explain(validatePlan.errors) };
}

/**
 * Last resort after a failed retry: keep the style and whichever other
 * fields are usable on their own.
 * @param {string} reply
 * @returns {{ plan: any, dropped: string[] } | null} null when the reply names no style
 */
export function salvageScorePlan(reply) {
  const best = candidatePlans(reply)[0]?.plan;
  if (!best || !validatePlan({ style: best.style })) return null;
  /** @type {Record<string, any>} */
  const plan = { style: best.style };
  const dropped = [];
  for (const key of ['mood', 'bpm', 'key']) {
    if (best[key] === undefined) continue;
    if (validatePlan({ ...plan, [key]: best[key] })) plan[key] = best[key];
    else dropped.push(`${key}: ${explain(validatePlan.errors)[0] || 'not usable'}`);
  }
  if (Array.isArray(best.sections)) {
    const kept = best.sections.filter((/** @type {any} */ section, /** @type {number} */ i) => {
      if (validateSection(section)) return true;
      dropped.push(`section ${i + 1}: ${explain(validateSection.errors)[0] || 'not usable'}`);
      return false;
    });
    const most = SCORE_PLAN_SCHEMA.properties.sections.maxItems;
    if (kept.length) plan.sections = kept.slice(0, most);
  } else if (best.sections !== undefined) dropped.push('sections: must be a list');
  return { plan, dropped };
}
