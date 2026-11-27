/**
 * Field paths — the inspector names a clip field by its dotted path
 * (`transform.kenBurns.endScale`) and turns one value into the nested patch
 * `updateClip` expects. Pure and isomorphic.
 * @module utils/inspector/paths
 */

/**
 * @param {Record<string, any>} object
 * @param {string} path - Dotted path
 * @returns {any} undefined when any step is missing
 */
export function getPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

/**
 * The nested patch that sets one path.
 * @param {string} path
 * @param {any} value
 * @returns {Record<string, any>} e.g. `{ transform: { x: 12 } }`
 */
export function patchFor(path, value) {
  return path
    .split('.')
    .reduceRight((inner, key) => ({ [key]: inner }), /** @type {any} */ (value));
}

/**
 * The value a field shows for several clips at once.
 * @param {Record<string, any>[]} clips
 * @param {string} path
 * @returns {{ value: any, mixed: boolean }} `mixed` when the clips differ;
 *   `value` is then the first clip's
 */
export function mergedValue(clips, path) {
  if (!clips.length) return { value: undefined, mixed: false };
  const first = getPath(clips[0], path);
  const same = (/** @type {any} */ other) =>
    typeof first === 'number' && typeof other === 'number'
      ? Math.abs(first - other) < 1e-9
      : first === other;
  return { value: first, mixed: !clips.every((clip) => same(getPath(clip, path))) };
}
