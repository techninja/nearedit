/**
 * Scene 5 of "Made from nothing".
 * @module examples/made-from-nothing/scenes/endCard
 */

/** @typedef {ReturnType<typeof import('../kit.js').stage>} Stage */

/**
 * The end card: a star field, the name and a line drawn under it.
 * @param {Stage} s
 * @param {number} at
 */
export function endCard(s, at) {
  const end = at + 5;
  const night = {
    kind: 'radial',
    stops: 3,
    color1: '#1d4ed8',
    color2: '#0f172a',
    color3: '#020617',
  };
  const bg = s.generator('bgB', [at, end], 'gradient', {
    ...night,
    center: { x: 0.5, y: 0.62 },
  });
  s.patch(bg, { fadeOut: 1 });
  s.particles('fx', [at, end], 'starfield', {}, { fadeIn: 0.8, fadeOut: 1 });

  const title = s.title('title', [at + 0.7, end], {
    content: 'NearEdit',
    fontFamily: 'Inter',
    weight: 900,
    fontSize: 240,
    animateIn: {
      type: 'scale',
      by: 'char',
      duration: 0.7,
      stagger: 0.06,
      ease: 'elastic-out',
    },
  });
  s.patch(title, { fadeOut: 1, transform: { y: -70 } });
  s.effect(title, 'glow', { radius: 40, intensity: 0.5 });

  const rule = {
    shape: 'line',
    sizing: 'frame',
    width: 0,
    thickness: 8,
    stroke: '#38bdf8',
    fill: '#38bdf8',
  };
  const line = s.generator('s1', [at + 1.4, end], 'shape', {
    ...rule,
    position: { x: 0.5, y: 0.6 },
  });
  s.patch(line, { fadeOut: 1 });
  s.keys(line, 'generator.params.width', [
    [at + 1.4, 0, 'ease-out'],
    [at + 2.4, 0.42],
  ]);

  const caption = s.title('text', [at + 2, end], {
    content: 'open source · in your browser',
    fontFamily: 'Caveat',
    weight: 700,
    fontSize: 96,
    color: '#bae6fd',
    animateIn: { type: 'slide-up', by: 'word', duration: 0.5, stagger: 0.1 },
  });
  s.patch(caption, { fadeOut: 1, transform: { y: 180 } });
}
