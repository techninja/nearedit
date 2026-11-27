/**
 * Reference documents: titles in the middle of an entrance or an exit, and
 * a title through an effect. Each comes with the time to draw it at.
 * @module tests/compose/cases/motion
 */

import { doc, fx, gen, title } from '../build.js';
import { titled } from './text.js';

const anim = (/** @type {string} */ type, /** @type {object} */ rest = {}) => ({
  type,
  duration: 1,
  by: 'char',
  stagger: 0.06,
  ease: 'ease-out',
  ...rest,
});

/**
 * @returns {Record<string, [any, number]>} `[document, time]` by case name
 */
export function motionDocs() {
  return {
    'text-in-slide-char': [
      titled('Letters rise in', { fontSize: 170, animateIn: anim('slide-up') }),
      0.6,
    ],
    'text-in-blur-word': [
      titled('Words come into focus', {
        fontSize: 130,
        outlineWidth: 4,
        animateIn: anim('blur', { by: 'word', stagger: 0.2 }),
      }),
      0.5,
    ],
    'text-in-scale-block': [
      titled('Block pops', {
        fontSize: 200,
        background: '#7c3aed',
        animateIn: anim('scale', { by: 'block', ease: 'back-out' }),
      }),
      0.45,
    ],
    'text-in-blur-block': [
      titled('Whole block', {
        fontSize: 180,
        background: '#be185d',
        shadowBlur: 20,
        shadowY: 12,
        animateIn: anim('blur', { by: 'block', ease: 'linear' }),
      }),
      0.5,
    ],
    // Lines fading one after another, outlined: the cut-out path.
    'text-in-fade-line': [
      titled('Line one\nLine two\nLine three', {
        fontSize: 120,
        outlineWidth: 8,
        outlineColor: '#111827',
        animateIn: anim('fade', { by: 'line', stagger: 0.4 }),
      }),
      0.8,
    ],
    'text-typewriter': [
      titled('Typed out, letter by letter', {
        fontFamily: 'JetBrains Mono',
        fontSize: 90,
        animateIn: anim('typewriter', { duration: 2 }),
      }),
      1.1,
    ],
    'text-out-slide-left': [
      titled('Leaving to the left', {
        fontSize: 140,
        animateOut: anim('slide-left', { by: 'word', stagger: 0.15 }),
      }),
      3.3,
    ],
    'text-out-scale-char': [
      titled('Shrinking away', {
        fontSize: 160,
        letterSpacing: 6,
        animateOut: anim('scale', { ease: 'ease-in' }),
      }),
      3.4,
    ],
    'text-glow': [
      doc([
        [
          title(
            'a',
            'NEON',
            { fontFamily: 'Bebas Neue', fontSize: 420, color: '#67e8f9' },
            { effects: [fx('glow', { radius: 40, intensity: 1.4 })] },
          ),
        ],
        [gen('bg', 'solid', { color: '#020617' })],
      ]),
      1,
    ],
  };
}
