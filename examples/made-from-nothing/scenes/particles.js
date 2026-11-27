/**
 * Scene 3 of "Made from nothing".
 * @module examples/made-from-nothing/scenes/particles
 */

import { FADE, mono } from './text.js';

/** @typedef {ReturnType<typeof import('../kit.js').stage>} Stage */

/**
 * Particles over slow noise: fireflies, a fountain of sparks and a burst
 * of confetti.
 * @param {Stage} s
 * @param {number} at
 */
export function particles(s, at) {
  const end = at + 5.6;
  const colors = { colors: 3, color1: '#020617', color2: '#312e81', color3: '#0e7490' };
  const bg = s.generator('bgB', [at, end], 'noise', { ...colors, scale: 900, speed: 0.4 });
  s.keys(bg, 'generator.params.balance', [
    [at, -0.25, 'sine'],
    [end, 0.3],
  ]);
  s.effect(bg, 'vignette', { amount: 0.6, size: 0.8 });
  s.particles('s3', [at + 0.4, at + 5], 'fireflies', {}, { fadeIn: 0.6, fadeOut: 0.4 });
  s.particles(
    's2',
    [at + 0.7, at + 5],
    'sparks',
    { position: { x: 0.5, y: 0.82 }, size: 40, rate: 420 },
    { fadeOut: 0.4 },
  );
  s.particles(
    'fx',
    [at + 1.5, at + 5],
    'confetti',
    { position: { x: 0.5, y: 0.85 } },
    { fadeOut: 0.4 },
  );

  const title = s.title('title', [at + 0.6, at + 5], {
    content: 'Particles',
    fontFamily: 'Playfair Display',
    italic: true,
    weight: 700,
    fontSize: 230,
    shadowBlur: 40,
    shadowY: 12,
    animateIn: {
      type: 'scale',
      by: 'char',
      duration: 0.6,
      stagger: 0.06,
      ease: 'back-out',
    },
    animateOut: FADE,
  });
  s.patch(title, { transform: { y: -90 } });
  const caption = s.title(
    'text',
    [at + 2, at + 5],
    mono('snow · sparks · confetti · your own sprites', '#c7d2fe'),
  );
  s.patch(caption, { transform: { y: 120 } });
}
