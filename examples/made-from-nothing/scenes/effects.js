/**
 * Scene 4 of "Made from nothing".
 * @module examples/made-from-nothing/scenes/effects
 */

import { FADE, mono } from './text.js';

/** @typedef {ReturnType<typeof import('../kit.js').stage>} Stage */

/**
 * Effects: a gradient that resolves out of a mosaic, a masked stripe
 * overlay, an expanding ring and a title with colour fringes.
 * @param {Stage} s
 * @param {number} at
 */
export function effects(s, at) {
  const end = at + 5.6;
  const sunset = {
    stops: 4,
    color1: '#0f172a',
    color2: '#7c3aed',
    color3: '#f97316',
    color4: '#fde047',
  };
  const bg = s.generator('bgA', [at, end], 'gradient', {
    kind: 'linear',
    ...sunset,
  });
  s.keys(bg, 'generator.params.angle', [
    [at, 60, 'ease-in-out'],
    [end, 200],
  ]);
  const wipe = s.effect(bg, 'wipe', {
    shape: 'linear',
    angle: 20,
    feather: 200,
    progress: 0,
  });
  s.keys(bg, `${wipe}.progress`, [
    [at, 0, 'ease-in-out'],
    [at + 0.6, 1],
  ]);
  const leave = s.effect(bg, 'wipe', { shape: 'clock', feather: 60, progress: 1 });
  s.keys(bg, `${leave}.progress`, [
    [end - 0.6, 1, 'ease-in-out'],
    [end, 0],
  ]);
  const mosaic = s.effect(bg, 'pixelate', { size: 160 });
  s.keys(bg, `${mosaic}.size`, [
    [at + 0.3, 160, 'ease-out'],
    [at + 1.8, 1],
  ]);
  s.effect(bg, 'grain', { amount: 0.22 });

  const stripes = {
    pattern: 'stripes',
    color: '#ffffff',
    background: '#000000',
    size: 46,
    speedX: 90,
  };
  const overlay = s.generator('s3', [at + 0.6, at + 5], 'pattern', {
    ...stripes,
    angle: 35,
  });
  s.patch(overlay, {
    blendMode: 'overlay',
    fadeIn: 0.5,
    fadeOut: 0.4,
    transform: { opacity: 0.5 },
  });
  const mask = s.effect(overlay, 'mask', {
    shape: 'ellipse',
    width: 0.2,
    height: 0.36,
    feather: 60,
  });
  for (const side of ['width', 'height']) {
    s.keys(overlay, `${mask}.${side}`, [
      [at + 0.6, 0.1, 'ease-out'],
      [at + 2.2, side === 'width' ? 0.62 : 0.9],
    ]);
  }

  const title = s.title('title', [at + 0.5, at + 5], {
    content: 'EFFECTS',
    fontFamily: 'Bebas Neue',
    fontSize: 340,
    letterSpacing: 16,
    animateIn: { type: 'blur', by: 'char', duration: 0.6, stagger: 0.07 },
    animateOut: FADE,
  });
  s.patch(title, { transform: { y: -40 } });
  const split = s.effect(title, 'rgbSplit', { distance: 60 });
  s.keys(title, `${split}.distance`, [
    [at + 0.5, 70, 'elastic-out'],
    [at + 2, 6, 'hold'],
    [at + 3.4, 6, 'ease-in'],
    [at + 3.6, 46, 'bounce-out'],
    [at + 4.3, 5],
  ]);
  s.effect(title, 'glow', { radius: 30, intensity: 0.6 });
  const caption = s.title(
    'text',
    [at + 2, at + 5],
    mono('blur · glow · masks · wipes · grades — stacked and keyframed', '#fef3c7'),
  );
  s.patch(caption, { transform: { y: 250 } });
}
