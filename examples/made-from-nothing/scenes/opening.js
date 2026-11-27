/**
 * Scene 1 of "Made from nothing".
 * @module examples/made-from-nothing/scenes/opening
 */

/** @typedef {ReturnType<typeof import('../kit.js').stage>} Stage */

/**
 * The opening: a drifting radial gradient, dust and a glowing title.
 * @param {Stage} s
 * @param {number} at
 */
export function opening(s, at) {
  const end = at + 5.6;
  const colors = { color1: '#4f46e5', color2: '#1e1b4b', color3: '#020617' };
  const bg = s.generator('bgB', [at, end], 'gradient', {
    kind: 'radial',
    stops: 3,
    ...colors,
  });
  s.keys(bg, 'generator.params.center.x', [
    [at, 0.3, 'sine'],
    [end, 0.7],
  ]);
  s.keys(bg, 'generator.params.size', [
    [at, 0.7, 'ease-in-out'],
    [end, 1.3],
  ]);
  s.particles('fx', [at, at + 5], 'dust', {}, { fadeIn: 1, fadeOut: 0.4 });

  const title = s.title('title', [at + 0.4, at + 5], {
    content: 'MADE FROM\nNOTHING',
    fontFamily: 'Bebas Neue',
    fontSize: 250,
    lineHeight: 0.95,
    letterSpacing: 10,
    animateIn: {
      type: 'slide-up',
      by: 'char',
      duration: 0.7,
      stagger: 0.05,
      ease: 'back-out',
    },
    animateOut: { type: 'blur', by: 'char', duration: 0.4, stagger: 0.015 },
  });
  s.patch(title, { transform: { y: -60 } });
  const glow = s.effect(title, 'glow', { radius: 46, intensity: 0 });
  s.keys(title, `${glow}.intensity`, [
    [at + 0.4, 0, 'ease-out'],
    [at + 2, 1.1, 'sine'],
    [at + 4.4, 0.5],
  ]);

  const caption = s.title('text', [at + 1.8, at + 5], {
    content: 'no footage · no images · only layers',
    fontFamily: 'JetBrains Mono',
    fontSize: 44,
    color: '#a5b4fc',
    animateIn: {
      type: 'typewriter',
      by: 'char',
      duration: 0.05,
      stagger: 0.04,
    },
    animateOut: { type: 'fade', duration: 0.4 },
  });
  s.patch(caption, { transform: { y: 300 } });
}
