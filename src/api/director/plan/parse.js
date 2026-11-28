/**
 * Plan parsing — dig the JSON out of a model reply, repair it when it is
 * malformed, normalise it and validate it against the edit-plan schema.
 * @module api/director/plan/parse
 */

import Ajv from 'ajv';
import { jsonrepair } from 'jsonrepair';
import { PICK_SCHEMA, PLAN_SCHEMA, VISUAL_SCHEMA } from '#utils/director/planSchema.js';
import { jsonCandidates } from '../llm/clean.js';
import { normalizePlan } from './normalize.js';

const ajv = new Ajv({ allErrors: true });
const validatePlan = ajv.compile(PLAN_SCHEMA);
const validatePick = ajv.compile(PICK_SCHEMA);
const validateVisual = ajv.compile(VISUAL_SCHEMA);

/**
 * Readable validation errors: "picks[2].start must be number".
 * @param {import('ajv').ErrorObject[]|null|undefined} errors
 * @param {string} [prefix]
 * @returns {string[]}
 */
function explain(errors, prefix = '') {
  const lines = (errors || []).map((e) => {
    const path = e.instancePath
      .replace(/\/(\d+)/g, '[$1]')
      .replace(/\//g, '.')
      .replace(/^\./, '');
    const allowed = e.params?.allowedValues ? `: ${e.params.allowedValues.join(', ')}` : '';
    return `${prefix}${path}${path ? ' ' : ''}${e.message}${allowed}`.trim();
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
 * Normalised plans found in a reply, best candidates first.
 * @param {string} reply
 * @returns {{ plan: any, repaired: boolean }[]}
 */
function candidatePlans(reply) {
  const plans = [];
  for (const snippet of jsonCandidates(reply)) {
    const parsed = parseLoose(snippet);
    if (!parsed || typeof parsed.value !== 'object' || parsed.value === null) continue;
    plans.push({ plan: normalizePlan(parsed.value), repaired: parsed.repaired });
  }
  return plans.sort(
    (a, b) => Number(Array.isArray(b.plan.picks)) - Number(Array.isArray(a.plan.picks)),
  );
}

/**
 * Parse and validate a model reply as an edit plan.
 * @param {string} reply
 * @returns {{ ok: true, plan: any, repaired: boolean } | { ok: false, errors: string[] }}
 */
export function parsePlan(reply) {
  const plans = candidatePlans(reply);
  if (!plans.length) return { ok: false, errors: ['the reply contained no JSON object'] };
  for (const { plan, repaired } of plans)
    if (validatePlan(plan)) return { ok: true, plan, repaired };
  validatePlan(plans[0].plan);
  return { ok: false, errors: explain(validatePlan.errors) };
}

/**
 * Last resort after a failed retry: keep whatever parts of the best
 * candidate are individually valid.
 * @param {string} reply
 * @returns {{ plan: any, dropped: string[] } | null} null when no pick survives
 */
export function salvagePlan(reply) {
  const best = candidatePlans(reply)[0]?.plan;
  if (!best || !Array.isArray(best.picks)) return null;
  const dropped = [];
  const picks = [];
  best.picks.forEach((/** @type {any} */ pick, /** @type {number} */ i) => {
    if (Array.isArray(pick?.visuals)) pick.visuals = pick.visuals.filter((v) => validateVisual(v));
    if (validatePick(pick)) picks.push(pick);
    else
      dropped.push(explain(validatePick.errors, `pick ${i + 1}: `)[0] || `pick ${i + 1}: invalid`);
  });
  if (!picks.length) return null;
  const plan = { ...best, picks };
  if (Array.isArray(plan.elements)) {
    const kept = plan.elements.filter((item) => validatePlan({ picks, elements: [item] }));
    if (kept.length < plan.elements.length) {
      dropped.push(`${plan.elements.length - kept.length} element item(s) could not be read`);
    }
    plan.elements = kept;
  }
  for (const key of ['title', 'rationale', 'music', 'elements']) {
    if (plan[key] === undefined || validatePlan({ picks, [key]: plan[key] })) continue;
    dropped.push(`${key}: ${explain(validatePlan.errors)[0]}`);
    delete plan[key];
  }
  return { plan, dropped };
}
