/**
 * Schema-v3 content for the soak test's start document. Not part of the
 * runtime API — imported by soak.test.js.
 * @module utils/edl/soakFixture
 */

import { testClip } from './testkit.js';

/**
 * Clips for the start document: a keyframed generator with an effect and a
 * keyframed, curved title. Both sit on a track of their own.
 * @returns {{ generator: any, title: any }}
 */
export function v3Clips() {
  const key = (t, v, ease = 'linear') => ({ t, v, ease });
  const generator = testClip('gen', 1, 7, {
    sourceFile: '',
    sourceIn: -1,
    sourceOut: 5,
    blendMode: 'screen',
    fadeIn: 1,
    fadeInCurve: 'smooth',
    generator: { type: 'gradient', seed: 5, params: { angle: 10, stops: [0, 0.5, 1] } },
    effects: [
      { effectId: 'fx_a', type: 'blur', enabled: true, params: { radius: 4 } },
      { effectId: 'fx_b', type: 'tint', enabled: false, params: { color: '#00ff00' } },
    ],
    keyframes: {
      'transform.x': [key(-1, -300, 'ease-out'), key(2, 0)],
      'effects.fx_a.radius': [key(0, 20), key(3, 0)],
      'generator.params.angle': [key(0, 0), key(6, 360)],
    },
  });
  const title = testClip('kt', 14, 19, {
    sourceFile: '',
    fadeOut: 1,
    fadeOutCurve: 'fast',
    text: { content: 'Keyed', animateIn: { type: 'slide-up', by: 'word' } },
    keyframes: { 'text.color': [key(0, '#ffffff'), key(4, '#ff8800')], volume: [key(1, 0.5)] },
  });
  return { generator, title };
}
