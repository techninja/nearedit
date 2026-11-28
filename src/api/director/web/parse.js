/**
 * Demo plan parsing — dig the JSON out of a model reply, repair it when it
 * is malformed, normalise it and validate it against the demo-plan schema
 * and against what each kind of stop needs. The counterpart of
 * `motion/parse.js` for motion plans.
 * @module api/director/web/parse
 */

import Ajv from 'ajv';
import { jsonrepair } from 'jsonrepair';
import {
  DEMO_PLAN_SCHEMA,
  MAX_STOPS,
  STOP_SCHEMA,
  stopProblem,
} from '#utils/director/web/planSchema.js';
import { jsonCandidates } from '../llm/clean.js';
import { normalizeDemoPlan } from './normalize.js';

const ajv = new Ajv({ allErrors: true });
const validatePlan = ajv.compile(DEMO_PLAN_SCHEMA);
const validateStop = ajv.compile(STOP_SCHEMA);
// As plain yes-or-no questions: a validator is typed as a guard that would narrow `any` to nothing.
const isPlan = /** @type {(value: any) => boolean} */ (validatePlan);
const isStop = /** @type {(value: any) => boolean} */ (validateStop);

/**
 * Readable validation errors: "stops[2].do must be equal to one of the allowed values: click, …".
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
 * Normalised plans found in a reply, those with stops first.
 * @param {string} reply
 * @returns {{ plan: any, repaired: boolean }[]}
 */
function candidatePlans(reply) {
  const plans = [];
  for (const snippet of jsonCandidates(reply)) {
    const parsed = parseLoose(snippet);
    if (!parsed || typeof parsed.value !== 'object' || parsed.value === null) continue;
    plans.push({ plan: normalizeDemoPlan(parsed.value), repaired: parsed.repaired });
  }
  return plans.sort(
    (a, b) => Number(Array.isArray(b.plan.stops)) - Number(Array.isArray(a.plan.stops)),
  );
}

/**
 * Everything wrong with a plan: its shape, then what its stops still need.
 * @param {any} plan
 * @returns {string[]} Empty for a plan that can be played
 */
function problems(plan) {
  if (!isPlan(plan)) return explain(validatePlan.errors);
  return plan.stops
    .map((/** @type {any} */ stop, /** @type {number} */ i) => [i, stopProblem(stop)])
    .filter(([, why]) => why)
    .map(([i, why]) => `stops[${i}]: ${why}`);
}

/**
 * Parse and validate a model reply as a demo plan.
 * @param {string} reply
 * @returns {{ ok: true, plan: any, repaired: boolean } | { ok: false, errors: string[] }}
 */
export function parseDemoPlan(reply) {
  const plans = candidatePlans(reply);
  if (!plans.length) return { ok: false, errors: ['the reply contained no JSON object'] };
  for (const { plan, repaired } of plans)
    if (!problems(plan).length) return { ok: true, plan, repaired };
  return { ok: false, errors: problems(plans[0].plan) };
}

/**
 * Last resort after a failed retry: keep the stops that can be played.
 * @param {string} reply
 * @returns {{ plan: any, dropped: string[] } | null} null when no stop survives
 */
export function salvageDemoPlan(reply) {
  const best = candidatePlans(reply)[0]?.plan;
  if (!best || !Array.isArray(best.stops)) return null;
  const dropped = [];
  const stops = [];
  best.stops.forEach((/** @type {any} */ stop, /** @type {number} */ i) => {
    const why = isStop(stop)
      ? stopProblem(stop)
      : explain(validateStop.errors)[0] || 'is not a stop';
    if (why) dropped.push(`stop ${i + 1}: ${why}`);
    else stops.push(stop);
  });
  if (!stops.length) return null;
  const plan = { stops: stops.slice(0, MAX_STOPS) };
  if (typeof best.title === 'string') plan.title = best.title;
  return { plan, dropped };
}
