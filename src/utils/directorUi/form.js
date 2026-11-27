/**
 * The director form — starting values from an action schema, which fields
 * show first, and the directive a filled form turns into. Pure.
 * Schemas: `GET /api/director/actions` (docs/app-spec/DIRECTOR.md § Actions).
 * @module utils/directorUi/form
 */

/** @typedef {import('#utils/director/actions.js').ActionSchema} ActionSchema */
/** @typedef {import('#utils/director/fields.js').ActionField} ActionField */

/** Forms with more fields than this tuck all but the first few under "More options". */
const MAX_PLAIN = 6;
const FIRST_SHOWN = 3;

/**
 * @param {ActionSchema} action
 * @returns {Record<string, string|number|boolean>} Every field's default
 */
export function initialValues(action) {
  return Object.fromEntries((action?.fields || []).map((field) => [field.key, field.default]));
}

/**
 * Split an action's fields into those always shown and those under "More
 * options", keeping the schema's order.
 * @param {ActionSchema} action
 * @returns {{ main: ActionField[], more: ActionField[] }}
 */
export function fieldGroups(action) {
  const fields = action?.fields || [];
  if (fields.length <= MAX_PLAIN) return { main: fields, more: [] };
  return { main: fields.slice(0, FIRST_SHOWN), more: fields.slice(FIRST_SHOWN) };
}

/**
 * Whether running the form as filled will use the language model.
 * @param {ActionSchema} action
 * @param {Record<string, any>} values
 * @returns {boolean}
 */
export function usesLlm(action, values) {
  return action.llm === 'yes' || (action.llm === 'optional' && values.useLlm === true);
}

/**
 * The `directive` of a request.
 * @param {{ action: ActionSchema, mode: string, prompt: string, values: Record<string, any>,
 *   context: object }} form
 * @returns {{ action: string, mode?: string, prompt?: string, params: Record<string, any>,
 *   context: object }}
 */
export function buildDirective({ action, mode, prompt, values, context }) {
  /** @type {Record<string, any>} */
  const params = {};
  for (const field of action.fields) {
    const value = values[field.key];
    // An empty text or file field means "not given": the server fills its default.
    if (value === undefined || value === null || value === '') continue;
    params[field.key] = value;
  }
  return {
    action: action.id,
    ...(action.modes.length && { mode }),
    ...(action.prompt && prompt.trim() && { prompt: prompt.trim() }),
    params,
    context,
  };
}

/**
 * Field problems from a 422 answer, keyed the way the form shows them:
 * `params.duration` → `duration`; `mode`, `prompt` and others stay.
 * @param {Record<string, string>|undefined} fields - `fields` of the error body
 * @returns {Record<string, string>}
 */
export function fieldProblems(fields) {
  return Object.fromEntries(
    Object.entries(fields || {}).map(([key, message]) => [key.replace(/^params\./, ''), message]),
  );
}

/**
 * A range field's value for display: "60 s", "0.8 s", "3".
 * @param {ActionField} field
 * @param {unknown} value
 * @returns {string}
 */
export function rangeText(field, value) {
  const number = Number(value);
  const digits = String(field.step ?? 1).split('.')[1]?.length || 0;
  const text = Number.isFinite(number) ? number.toFixed(digits) : String(value ?? '');
  return field.unit ? `${text} ${field.unit}` : text;
}
