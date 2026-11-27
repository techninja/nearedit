/**
 * Directive normalisation — checks a raw `directive` against its action
 * schema, fills defaults and coerces form values. Used by the server before
 * a job starts; a client may use it to validate a form early.
 * Shape reference: docs/app-spec/API.md § Director. Isomorphic and pure.
 * @module utils/director/directive
 */

import { getAction } from './actions.js';

const MAX_PROMPT = 60000;

/**
 * @typedef {Object} Directive
 * @property {string} action
 * @property {string} mode - replace | append | prepend | insert | range ('' for scripts)
 * @property {string} prompt
 * @property {Record<string, any>} params - Every field of the action, defaults filled
 * @property {{ playheadPosition: number, range: { start: number, end: number } | null,
 *   selection: string[] }} context
 * @property {string[]} given - Keys of `params` the caller set explicitly
 */

/**
 * Coerce one form value to its field type.
 * @param {import('./fields.js').ActionField} field
 * @param {unknown} raw
 * @returns {{ value: any } | { error: string }}
 */
export function coerceField(field, raw) {
  if (field.type === 'range') {
    const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (typeof n !== 'number' || !Number.isFinite(n)) return { error: 'must be a number' };
    return { value: Math.max(field.min, Math.min(field.max, n)) };
  }
  if (field.type === 'toggle') {
    if (typeof raw === 'boolean') return { value: raw };
    if (raw === 'true' || raw === 'false') return { value: raw === 'true' };
    return { error: 'must be true or false' };
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') return { error: 'must be text' };
  const value = String(raw).trim();
  if (field.type !== 'select') return { value: value.slice(0, 2000) };
  if (field.options.some((o) => o.value === value)) return { value };
  if (field.allowCustom && value) return { value: value.slice(0, 200) };
  return { error: `must be one of: ${field.options.map((o) => o.value).join(', ')}` };
}

/**
 * @param {any} raw - `directive.context`
 * @returns {Directive['context']}
 */
function normalizeContext(raw) {
  const ctx = raw && typeof raw === 'object' ? raw : {};
  const playhead = Number(ctx.playheadPosition);
  const start = Number(ctx.range?.start);
  const end = Number(ctx.range?.end);
  const hasRange = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;
  return {
    playheadPosition: Number.isFinite(playhead) && playhead > 0 ? playhead : 0,
    range: hasRange ? { start, end } : null,
    selection: Array.isArray(ctx.selection)
      ? ctx.selection.filter((id) => typeof id === 'string' && id)
      : [],
  };
}

/**
 * Validate and complete a directive.
 * @param {any} raw
 * @returns {{ ok: true, directive: Directive } |
 *   { ok: false, status: number, error: string, fields?: Record<string, string> }}
 */
export function normalizeDirective(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, status: 400, error: 'directive required' };
  const action = getAction(raw.action);
  if (!action) return { ok: false, status: 400, error: `Unknown action "${raw.action ?? ''}"` };

  /** @type {Record<string, string>} */
  const fields = {};
  const rawParams = raw.params && typeof raw.params === 'object' ? raw.params : {};
  const params = {};
  const given = [];
  for (const field of action.fields) {
    const value = rawParams[field.key];
    if (value === undefined || value === null || value === '') {
      params[field.key] = field.default;
      continue;
    }
    const result = coerceField(field, value);
    if ('error' in result) fields[`params.${field.key}`] = `${field.label} ${result.error}`;
    else {
      params[field.key] = result.value;
      given.push(field.key);
    }
  }

  const context = normalizeContext(raw.context);
  const mode = raw.mode === undefined || raw.mode === '' ? action.defaultMode : raw.mode;
  if (action.modes.length && !action.modes.includes(mode))
    fields.mode = `mode must be one of: ${action.modes.join(', ')}`;
  else if (mode === 'range' && !context.range)
    fields['context.range'] = 'mode "range" needs context.range with end > start >= 0';

  const promptSource = raw.prompt ?? rawParams.prompt ?? '';
  if (typeof promptSource !== 'string') fields.prompt = 'prompt must be text';
  const prompt = String(promptSource).trim().slice(0, MAX_PROMPT);
  if (action.prompt?.required && !prompt) fields.prompt = `${action.prompt.label} is required`;

  if (Object.keys(fields).length)
    return { ok: false, status: 422, error: 'Invalid directive', fields };
  return {
    ok: true,
    directive: {
      action: action.id,
      mode: action.modes.length ? mode : '',
      prompt,
      params,
      context,
      given,
    },
  };
}
