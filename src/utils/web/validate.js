/**
 * Recipe validation: what would make a recording fail before the browser
 * even starts — no address, a step of an unknown kind, a step without the
 * thing it needs, a target that names nothing. It reads the recipe as it
 * was written (the normaliser would quietly drop most of this), so every
 * problem has the path of the field it concerns and a message for the
 * person who wrote it. Isomorphic and pure.
 * @module utils/web/validate
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { own, pageUrl } from './coerce.js';
import { RECIPE_LIMITS as LIMITS } from './limits.js';
import { normalizeStep } from './normalize.js';
import { compileScore } from './score.js';
import { STEP_KINDS, stepKind } from './stepKinds.js';
import { parseTarget } from './target.js';

/** @typedef {{ path: string, message: string }} Problem */
/** @typedef {(path: string, message: string) => void} Report */

const TARGET_HELP = 'like "text=Sign in", "label=Email" or a CSS selector';
const TARGET_FORMS =
  'after "text=", "label=" or "css=" something must follow, and a point is "point=640,300"';

/** @type {(value: any) => string} A value as its author wrote it, shortened. */
const show = (value) => {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
};

/**
 * One parameter of a step.
 * @param {import('./types.js').StepKind} kind
 * @param {string} name
 * @param {any} value - As the normaliser reads it
 * @param {any} given - As it was written
 * @param {string} path
 * @param {Report} report
 */
function checkParam(kind, name, value, given, path, report) {
  const spec = kind.params[name];
  if (spec.type === 'target') {
    const word = typeof value === 'number' || spec.options?.includes(value);
    if (value === '' && spec.required) {
      report(path, `${kind.do} needs a ${name}: what to aim at, ${TARGET_HELP}`);
    } else if (value !== '' && !word && !parseTarget(value)) {
      report(path, `${show(value)} cannot be read as a target: ${TARGET_FORMS}`);
    }
    return;
  }
  if (!spec.required || value !== '') return;
  if (spec.format === 'url' && typeof given === 'string' && given.trim()) {
    report(path, `${show(given)} is not somewhere a page can go: use http://, https:// or a path`);
  } else {
    const label = spec.label.toLowerCase();
    report(path, `${kind.do} needs "${name}"${label === name ? '' : ` (the ${label})`}`);
  }
}

/**
 * @param {any} raw - One entry of `steps`, as written
 * @param {string} path
 * @param {Report} report
 */
function checkStep(raw, path, report) {
  if (!isPlainObject(raw)) {
    return report(path, 'must be an object like { "do": "click", "target": "text=Sign in" }');
  }
  const kind = stepKind(own(raw, 'do'));
  if (!kind) {
    const names = STEP_KINDS.map((entry) => entry.do).join(', ');
    const given = own(raw, 'do');
    const what = given === undefined ? 'is required' : `${show(given)} is not a step`;
    return report(`${path}.do`, `${what}: use one of ${names}`);
  }
  const step = normalizeStep(raw);
  for (const name of Object.keys(kind.params)) {
    checkParam(kind, name, step[name], own(raw, name), `${path}.${name}`, report);
  }
  const unset = (name) => step[name] === kind.params[name].default;
  if (kind.oneOf?.every(unset)) {
    const names = kind.oneOf.map((name) => `"${name}"`).join(' or ');
    report(`${path}.${kind.oneOf[0]}`, `${kind.do} needs ${names}`);
  }
}

/**
 * Validate a recipe.
 * @param {any} recipe - As written; it need not be normalised
 * @returns {{ valid: boolean, problems: Problem[] }} Paths look like
 *   `url`, `steps[2].target`, `hide[0]`
 */
export function validateRecipe(recipe) {
  /** @type {Problem[]} */
  const problems = [];
  const report = (path, message) => void problems.push({ path, message });
  const done = () => ({ valid: problems.length === 0, problems });
  if (!isPlainObject(recipe)) {
    report('', 'a recipe is an object like { "url": "https://example.com", "steps": [] }');
    return done();
  }
  const url = own(recipe, 'url');
  if (url === undefined || url === null || url === '') {
    report('url', 'is required: the address of the page, starting with http:// or https://');
  } else if (!pageUrl(url, LIMITS.url)) {
    const long = typeof url === 'string' && url.trim().length > LIMITS.url;
    const why = long ? `is longer than ${LIMITS.url} characters` : 'is not a web address';
    report('url', `${show(url)} ${why}: it must start with http:// or https://`);
  }
  const steps = own(recipe, 'steps');
  if (steps !== undefined && !Array.isArray(steps)) {
    report('steps', 'must be a list of steps, like [{ "do": "click", "target": "text=Sign in" }]');
  }
  const list = Array.isArray(steps) ? steps : [];
  if (list.length > LIMITS.steps) {
    report('steps', `has ${list.length} steps; a recording plays at most ${LIMITS.steps}`);
  }
  list.slice(0, LIMITS.steps).forEach((raw, i) => checkStep(raw, `steps[${i}]`, report));
  const hide = own(recipe, 'hide');
  if (hide !== undefined && !Array.isArray(hide)) report('hide', 'must be a list of targets');
  (Array.isArray(hide) ? hide.slice(0, LIMITS.hide) : []).forEach((target, i) => {
    if (!parseTarget(target)) {
      report(`hide[${i}]`, `${show(target)} cannot be read as a target: ${TARGET_FORMS}`);
    }
  });
  const seconds = compileScore(recipe, 30).duration;
  if (seconds > LIMITS.duration) {
    const about = Math.round(seconds);
    report('steps', `the recording would run ${about} s; the longest is ${LIMITS.duration} s`);
  }
  return done();
}
