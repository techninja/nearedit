/**
 * Scene 2 of "Made from nothing".
 * @module examples/made-from-nothing/scenes/shapes
 */

/** @typedef {ReturnType<typeof import('../kit.js').stage>} Stage */

/**
 * Shapes that pop in, turn and change colour, over a drifting dot pattern
 * that opens and closes with an iris wipe.
 * @param {Stage} s
 * @param {number} at
 */
export function shapes(s, at) {
  const end = at + 5.6;
  const dots = {
    pattern: 'dots',
    background: '#0f172a',
    color: '#334155',
    size: 64,
    fill: 0.3,
  };
  const bg = s.generator('bgA', [at, end], 'pattern', {
    ...dots,
    speedX: 28,
    speedY: 14,
  });
  const wipe = s.effect(bg, 'wipe', {
    shape: 'radial',
    feather: 160,
    progress: 0,
  });
  s.keys(bg, `${wipe}.progress`, [
    [at, 0, 'ease-in-out'],
    [at + 0.6, 1, 'hold'],
    [end - 0.6, 1, 'ease-in-out'],
    [end, 0],
  ]);
  s.effect(bg, 'vignette', { amount: 0.75 });

  /** @type {[string, string, string, string, number, object][]} */
  const row = [
    ['s1', 'ellipse', '#f472b6', '#fb923c', 0.22, {}],
    ['s2', 'star', '#fde047', '#a3e635', 0.5, { points: 5, inner: 0.45, radius: 12 }],
    ['s3', 'polygon', '#22d3ee', '#818cf8', 0.78, { sides: 6, radius: 18 }],
  ];
  row.forEach(([trackId, shape, fill, later, x, extra], i) => {
    const from = at + 0.8 + i * 0.35;
    const params = {
      shape,
      fill,
      sizing: 'pixels',
      widthPx: 0,
      heightPx: 0,
      ...extra,
    };
    const span = /** @type {[number, number]} */ ([from, at + 5]);
    const id = s.generator(trackId, span, 'shape', {
      ...params,
      position: { x, y: 0.54 },
    });
    s.patch(id, { fadeOut: 0.4 });
    for (const side of ['widthPx', 'heightPx']) {
      s.keys(id, `generator.params.${side}`, [
        [from, 0, 'back-out'],
        [from + 0.7, 360, 'sine'],
        [at + 5, 300],
      ]);
    }
    s.keys(id, 'generator.params.rotation', [
      [from, -120, 'ease-out'],
      [from + 1, 0, 'ease-in-out'],
      [at + 5, 72 * (i - 1)],
    ]);
    s.keys(id, 'generator.params.position.y', [
      [from + 1, 0.54, 'sine'],
      [from + 2.2, 0.5, 'sine'],
      [from + 3.4, 0.56],
    ]);
    s.keys(id, 'generator.params.fill', [
      [at + 2.4, fill, 'ease-in-out'],
      [at + 4, later],
    ]);
    s.effect(id, 'dropShadow', { x: 0, y: 26, blur: 32, opacity: 0.55 });
  });

  const title = s.title('title', [at + 0.6, at + 5], {
    content: 'Shapes, keyed and eased',
    fontFamily: 'Inter',
    weight: 900,
    fontSize: 104,
    animateIn: {
      type: 'slide-down',
      by: 'word',
      duration: 0.5,
      stagger: 0.12,
      ease: 'back-out',
    },
    animateOut: { type: 'fade', duration: 0.4 },
  });
  s.patch(title, { transform: { y: -340 } });
  const caption = s.title('text', [at + 2.2, at + 5], {
    content: 'position · size · rotation · colour — every number can move',
    fontFamily: 'JetBrains Mono',
    fontSize: 38,
    color: '#94a3b8',
    animateIn: { type: 'fade', by: 'word', duration: 0.4, stagger: 0.08 },
    animateOut: { type: 'fade', duration: 0.4 },
  });
  s.patch(caption, { transform: { y: 380 } });
}
