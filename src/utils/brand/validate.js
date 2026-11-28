/**
 * What is wrong with a kit, for the person who wrote it: every problem
 * with the path of what it concerns — a token the schema does not have, a
 * value that cannot be used, a font file of the wrong kind, text that does
 * not read on its ground, an element that refers to what is not there.
 * `normalizeKit` repairs in silence; this says what it would have to.
 * Isomorphic and pure. Contract: docs/app-spec/BRAND.md § A kit.
 * @module utils/brand/validate
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { checkElement } from './element/validate.js';
import { cleanFace, isCustomFamily } from './fontTable.js';
import { BUILTIN_PREFIX, LIMITS, isId } from './limits.js';
import { cleanToken } from './tokenClean.js';
import { TOKEN_SCHEMA } from './tokens.js';
import { checkEffective } from './validateEffective.js';

/** @typedef {import('./types.js').Problem} Problem */

const FIELDS = ['id', 'name', 'description', 'extends', 'tokens', 'fonts', 'elements', 'defaults'];
/** Pictures an editor and both canvases can show. */
const PICTURE = /\.(png|jpe?g|webp|gif)$/i;
/**
 * @param {any} tokens
 * @param {(path: string, message: string, level?: 'error'|'warning') => void} report
 */
function checkTokens(tokens, report) {
  if (tokens === undefined) return;
  if (!isPlainObject(tokens)) return report('tokens', 'must be an object');
  for (const [group, values] of Object.entries(tokens)) {
    const specs = Object.hasOwn(TOKEN_SCHEMA, group) ? TOKEN_SCHEMA[group] : null;
    const at = `tokens.${group}`;
    if (!specs)
      report(
        at,
        `is not a token group — one of: ${Object.keys(TOKEN_SCHEMA).join(', ')}`,
        'warning',
      );
    else if (!isPlainObject(values)) report(at, 'must be an object');
    else {
      for (const [name, value] of Object.entries(values)) {
        const spec = Object.hasOwn(specs, name) ? specs[name] : null;
        if (!spec)
          report(
            `${at}.${name}`,
            `is not a token — ${group} has: ${Object.keys(specs).join(', ')}`,
            'warning',
          );
        else if (cleanToken(spec, value) === undefined)
          report(`${at}.${name}`, `is not a usable ${spec.type}`);
        else if (spec.type === 'image' && value && !PICTURE.test(value)) {
          report(`${at}.${name}`, 'must be a png, jpg, webp or gif picture');
        }
      }
    }
  }
}

/**
 * Validate a kit as it was written.
 * @param {any} kit - A parsed `kit.json`
 * @param {{ effective?: import('./types.js').Kit }} [opts] - The effective
 *   kit it resolves to (`resolveKit`): with it, what depends on the whole
 *   chain is checked too — contrast, font families, completeness
 * @returns {{ valid: boolean, problems: Problem[] }} `valid` is false when
 *   a problem is an error
 */
export function validateKit(kit, opts = {}) {
  /** @type {Problem[]} */
  const problems = [];
  const report = (/** @type {string} */ path, /** @type {string} */ message, level = 'error') =>
    void problems.push({ path, message, level: /** @type {'error'|'warning'} */ (level) });
  const done = () => ({ valid: !problems.some((problem) => problem.level === 'error'), problems });
  if (!isPlainObject(kit)) return (report('', 'a kit must be an object'), done());
  for (const key of Object.keys(kit).filter((name) => !FIELDS.includes(name))) {
    report(key, 'is not a field of a kit', 'warning');
  }
  if (!isId(kit.id)) report('id', 'is required: letters, digits, - and _, at most 40');
  if (typeof kit.name === 'string' && kit.name.length > LIMITS.name)
    report('name', 'is too long', 'warning');
  const parent =
    typeof kit.extends === 'string' ? kit.extends.replace(BUILTIN_PREFIX, '') : kit.extends;
  if (kit.extends !== undefined && kit.extends !== '' && !isId(parent)) {
    report('extends', 'must name a kit: an id, or builtin:<id>');
  }
  checkTokens(kit.tokens, report);
  (Array.isArray(kit.fonts) ? kit.fonts : []).forEach((face, i) => {
    if (cleanFace(face)) return;
    const reserved =
      isPlainObject(face) && typeof face.family === 'string' && !isCustomFamily(face.family);
    const why = reserved
      ? `"${face.family}" is a bundled family and cannot be redefined`
      : 'needs a family and a .woff2, .woff, .ttf or .otf file';
    report(`fonts[${i}]`, why);
  });
  if (kit.elements !== undefined && !isPlainObject(kit.elements))
    report('elements', 'must be an object');
  for (const [id, element] of Object.entries(isPlainObject(kit.elements) ? kit.elements : {})) {
    if (!isId(id)) report(`elements.${id}`, 'is not a usable id', 'warning');
    else checkElement(element, `elements.${id}`, report);
  }
  if (opts.effective) checkEffective(opts.effective, report);
  return done();
}
