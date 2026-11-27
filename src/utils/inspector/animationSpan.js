/**
 * The stretch of the timeline that shows a title's entrance or its exit,
 * worked out from the text animation's settings. Pure and isomorphic.
 * @module utils/inspector/animationSpan
 */

/** Seconds shown at rest after an entrance (before an exit), to take it in. */
const REST = 0.6;

/**
 * How many pieces a text animation moves one after another.
 * @param {string} content
 * @param {string} by - `block`, `line`, `word` or `char`
 * @returns {number} At least 1 (wrapping may add lines; this is an estimate)
 */
export function unitCount(content, by) {
  const text = String(content || '');
  if (by === 'line') return Math.max(1, text.split('\n').filter((line) => line.trim()).length);
  if (by === 'word') return Math.max(1, (text.match(/\S+/g) || []).length);
  if (by === 'char') return Math.max(1, text.replace(/\s/g, '').length);
  return 1;
}

/**
 * The stretch of the timeline that shows a title's entrance or exit.
 * @param {any} clip - A title clip
 * @param {'in'|'out'} edge
 * @returns {{ from: number, to: number }} Timeline seconds, inside the clip
 */
export function animationSpan(clip, edge) {
  const animation = clip.text?.[edge === 'out' ? 'animateOut' : 'animateIn'] || {};
  const units = unitCount(clip.text?.content, animation.by);
  const length = (animation.duration || 0) + (animation.stagger || 0) * (units - 1) + REST;
  const { timelineStart: start, timelineEnd: end } = clip;
  if (edge === 'out') return { from: Math.max(start, end - length), to: end };
  return { from: start, to: Math.min(end, start + length) };
}
