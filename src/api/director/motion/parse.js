/**
 * Motion plan parsing — dig the JSON out of a model reply, repair it when
 * it is malformed, normalise it and validate it against the motion-plan
 * schema. The counterpart of `plan/parse.js` for edit plans.
 * @module api/director/motion/parse
 */

import Ajv from 'ajv';
import { jsonrepair } from 'jsonrepair';
import { MOTION_PLAN_SCHEMA, SCENE_SCHEMA } from '#utils/director/motion/planSchema.js';
import { jsonCandidates } from '../llm/clean.js';
import { normalizeMotionPlan } from './normalize.js';

const ajv = new Ajv({ allErrors: true });
const validatePlan = ajv.compile(MOTION_PLAN_SCHEMA);
const validateScene = ajv.compile(SCENE_SCHEMA);

/**
 * Readable validation errors: "scenes[2].title must be string".
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
    return `${prefix}${path}${path ? ' ' : ''}${e.message}`.trim();
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
 * Normalised plans found in a reply, those with scenes first.
 * @param {string} reply
 * @returns {{ plan: any, repaired: boolean }[]}
 */
function candidatePlans(reply) {
  const plans = [];
  for (const snippet of jsonCandidates(reply)) {
    const parsed = parseLoose(snippet);
    if (!parsed || typeof parsed.value !== 'object' || parsed.value === null) continue;
    plans.push({ plan: normalizeMotionPlan(parsed.value), repaired: parsed.repaired });
  }
  return plans.sort(
    (a, b) => Number(Array.isArray(b.plan.scenes)) - Number(Array.isArray(a.plan.scenes)),
  );
}

/**
 * Parse and validate a model reply as a motion plan.
 * @param {string} reply
 * @returns {{ ok: true, plan: any, repaired: boolean } | { ok: false, errors: string[] }}
 */
export function parseMotionPlan(reply) {
  const plans = candidatePlans(reply);
  if (!plans.length) return { ok: false, errors: ['the reply contained no JSON object'] };
  for (const { plan, repaired } of plans)
    if (validatePlan(plan)) return { ok: true, plan, repaired };
  validatePlan(plans[0].plan);
  return { ok: false, errors: explain(validatePlan.errors) };
}

/**
 * Last resort after a failed retry: keep the scenes whose words are usable,
 * without the fields that are not.
 * @param {string} reply
 * @returns {{ plan: any, dropped: string[] } | null} null when no scene survives
 */
export function salvageMotionPlan(reply) {
  const best = candidatePlans(reply)[0]?.plan;
  if (!best || !Array.isArray(best.scenes)) return null;
  const dropped = [];
  const scenes = [];
  best.scenes.forEach((/** @type {any} */ scene, /** @type {number} */ i) => {
    const kept = scene && typeof scene === 'object' ? { ...scene } : scene;
    for (const key of Object.keys(SCENE_SCHEMA.properties)) {
      if (key === 'title' || kept?.[key] === undefined) continue;
      if (validateScene({ title: 'x', [key]: kept[key] })) continue;
      dropped.push(`scene ${i + 1}: ${explain(validateScene.errors)[0]}`);
      delete kept[key];
    }
    if (validateScene(kept)) scenes.push(kept);
    else dropped.push(explain(validateScene.errors, `scene ${i + 1}: `)[0] || `scene ${i + 1}`);
  });
  if (!scenes.length) return null;
  const plan = { scenes: scenes.slice(0, MOTION_PLAN_SCHEMA.properties.scenes.maxItems) };
  for (const key of ['theme', 'align']) {
    if (validatePlan({ ...plan, [key]: best[key] })) plan[key] = best[key];
  }
  return { plan, dropped };
}
