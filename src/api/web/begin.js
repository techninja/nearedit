/**
 * Beginning a step: the moment its target is looked for on the page as it
 * is right then. A step that finds what it needs becomes an act
 * (`acts.js`); `goto`, `run` and `hide` do their work here and leave
 * nothing to play. A target that is not there fails the recording with the
 * step's number — or, with `onMissing: skip`, is noted and passed over.
 * @module api/web/begin
 */

import { parseTarget, scrollGoal } from '#utils/web/index.js';
import { aimedParts } from './acts.js';
import { WebError } from './errors.js';
import { pressParts, typeParts } from './typing.js';

/**
 * @typedef {import('./performer.js').Stage & { spans: import('./acts.js').Span[], rows: any[],
 *   hide: { by: string, value: string, index: number }[], rest: () => Promise<void>,
 *   miss: (step: number, why: string) => null }} Playing
 */

/**
 * What happens when a step cannot do its work.
 * @param {import('#utils/web/types.js').Recipe} recipe
 * @param {any[]} rows - The track's steps
 * @param {(message: string) => void} warn
 * @returns {(step: number, why: string) => null} Throws unless the recipe says `skip`
 */
export function missing(recipe, rows, warn) {
  return (step, why) => {
    const said = `Step ${step + 1} (${recipe.steps[step].do}): ${why}`;
    if (recipe.onMissing !== 'skip') throw new WebError(422, said, { step });
    rows[step].missing = true;
    warn(`${said} — skipped`);
    return null;
  };
}

/**
 * @param {Playing} playing
 * @param {number} i
 * @param {any} step
 * @returns {Promise<null>}
 */
async function goTo(playing, i, step) {
  const { url: here } = await playing.tab.call('pageFacts');
  const url = URL.canParse(step.url, here) ? new URL(step.url, here).href : '';
  if (!/^https?:/i.test(url)) return playing.miss(i, `${step.url} is not a web address`);
  await playing.load(url, playing.rest);
  return null;
}

/**
 * Begin step `i`.
 * @param {Playing} playing
 * @param {number} i
 * @returns {Promise<import('./acts.js').Act|null>} null when nothing is left to play
 * @throws {WebError} 422 naming the step, when it cannot do its work and may not be skipped
 */
export async function beginStep(playing, i) {
  const { tab, recipe, spans, rows, hide, miss } = playing;
  const { fps } = playing.score;
  const step = /** @type {any} */ (recipe.steps[i]);
  const span = spans[i];
  if (step.do === 'wait') return null;
  if (step.do === 'goto') return goTo(playing, i, step);
  if (step.do === 'run') {
    const why = await tab.run(step.js);
    return why ? miss(i, `the script failed: ${why}`) : null;
  }
  if (step.do === 'press') {
    const parts = pressParts(step, span);
    return parts ? { ...span, ...parts } : miss(i, `there is no key called "${step.key}"`);
  }
  const goal = step.do === 'scroll' ? scrollGoal(step) : { target: parseTarget(step.target) };
  const target = goal && 'target' in goal ? goal.target : null;
  if (!goal || (!target && 'target' in goal)) {
    // Typing needs no target: the keys go to whatever has the focus.
    return step.do === 'type' ? { ...span, ...typeParts(step, span, fps) } : null;
  }
  rows[i].target = step.do === 'scroll' ? step.to : step.target;
  const how = step.do === 'scroll' ? { align: step.align, always: true } : {};
  const found = target
    ? await tab.call('resolve', i, target, step.index || 0, how)
    : await tab.call('resolvePage', i, goal);
  if (found.why) return miss(i, found.why);
  if (step.do === 'hide') {
    if (target.by === 'point') return miss(i, 'a point cannot be hidden; name the element');
    hide.push({ by: target.by, value: target.value, index: step.index || 0 });
    rows[i].rect = found.rect;
    return null;
  }
  if (step.do === 'focus' && step.zoom) rows[i].zoom = step.zoom;
  const parts =
    step.do === 'scroll'
      ? { ease: step.ease }
      : step.do === 'type'
        ? typeParts(step, span, fps)
        : aimedParts(step, span, fps, tab.call);
  const moves = found.scrolls.some(
    (/** @type {number[]} */ [fx, fy, tx, ty]) => fx !== tx || fy !== ty,
  );
  return {
    ...span,
    ...parts,
    ...{ plan: i, scrolls: moves ? found.scrolls : [] },
    ...(found.x !== undefined && { aim: { x: found.x, y: found.y } }),
  };
}
