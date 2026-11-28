/**
 * Choosing a style for a timeline when none was asked for: by its pace —
 * cuts per minute — and by whether people speak on it. A voice wants a bed
 * that leaves it room; a silent montage can carry more. The seed chooses
 * among the styles that suit, so another variation number can give another
 * style.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § Without a model. Isomorphic and pure.
 * @module utils/director/score/auto
 */

import { getStyle, styleInText } from './styles.js';

/** Cuts per minute from which a timeline counts as moving along, and as fast. */
const PACE = [8, 20];
/** Share of the span that is spoken from which the timeline counts as voice-led. */
const SPOKEN = 0.2;

/** The styles that suit a timeline, by voice and pace; the first is the usual choice. */
const SUITS = {
  voice: [
    ['lofi', 'ambient', 'bossa'],
    ['corporate', 'lofi', 'bossa'],
    ['corporate', 'house', 'hiphop'],
  ],
  picture: [
    ['cinematic', 'ambient', 'waltz'],
    ['synthwave', 'corporate', 'house'],
    ['house', 'breakbeat', 'hiphop'],
  ],
};

/**
 * @param {{ cutsPerMinute: number, spoken: number, seed?: number, brief?: string }} timeline -
 *   `spoken`: share of the span in which someone speaks, 0 … 1
 * @returns {{ style: import('./style.js').Style, why: string }}
 */
export function autoStyle({ cutsPerMinute, spoken, seed = 1, brief = '' }) {
  const named = styleInText(brief);
  if (named) return { style: named, why: 'the brief names it' };
  const pace = cutsPerMinute < PACE[0] ? 0 : cutsPerMinute < PACE[1] ? 1 : 2;
  const voice = spoken >= SPOKEN;
  const suits = SUITS[voice ? 'voice' : 'picture'][pace];
  const turn = Math.max(0, Math.round(Number(seed) || 1) - 1) % suits.length;
  const cuts = Math.round(cutsPerMinute);
  const speed = ['a slow', 'a steady', 'a fast'][pace];
  const why =
    `${speed} timeline (${cuts} cut${cuts === 1 ? '' : 's'} a minute) ` +
    (voice
      ? `with speech over ${Math.round(spoken * 100)}% of it: a bed that leaves the voice room`
      : 'without speech: the music may carry it');
  return { style: getStyle(suits[turn]), why };
}
