/**
 * The captions part of `nearedit catalog`: the presets a document may name
 * in `captions.style`, and every field of a style.
 * @module bin/lib/captionsCatalog
 */

import { CAPTION_PRESETS, CAPTION_STYLE, PRESET_NAMES } from '#utils/captions/index.js';

/**
 * @returns {{ presets: { id: string, label: string, description: string, style: object }[],
 *   style: Record<string, object> }} For `--json`: the presets, complete, and
 *   the style's fields by path with their type, range and default
 */
export function captionsCatalog() {
  const presets = PRESET_NAMES.map((id) => ({ id, ...CAPTION_PRESETS[id] }));
  return { presets, style: { ...CAPTION_STYLE } };
}

/**
 * @returns {string[]} The same as lines of text
 */
export function captionLines() {
  const lines = [
    'Caption presets — "captions": { "style": { "preset": … } }; a clip speaks with "captions": { "on": true }',
  ];
  for (const { id, description } of captionsCatalog().presets)
    lines.push(`  ${id.padEnd(8)} ${description}`);
  const fields = Object.entries(CAPTION_STYLE)
    .filter(([path]) => path !== 'preset')
    .map(([path, spec]) => (spec.type === 'select' ? `${path} (${spec.options.join('|')})` : path));
  lines.push(`  a style is a preset and what differs: ${fields.join(', ')}`, '');
  return lines;
}
