import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './index.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from './testkit.js';

describe('schema v3 — carried by everything else', () => {
  it('applyDirectorResult keeps a fragment’s generators, effects and keyframes, cleaned', () => {
    const start = deepFreeze(testEdl({ v1: [testClip('a', 0, 4)] }));
    const fragment = {
      mode: 'append',
      tracks: [
        {
          type: 'video',
          index: 0,
          clips: [
            {
              clipId: 'spark',
              timelineStart: 0,
              timelineEnd: 3,
              sourceIn: -1,
              generator: { type: 'particles', seed: 2, params: { rate: 50, fn: null } },
              effects: [{ effectId: 'g', type: 'glow', params: { radius: 6 } }, { type: '' }],
              keyframes: {
                'effects.g.radius': [
                  { t: 1, v: 0 },
                  { t: -1, v: 12, ease: 'ease-out' },
                ],
                'effects.gone.radius': [{ t: 0, v: 1 }],
                'generator.params.rate': [{ t: 0, v: 5 }],
              },
              blendMode: 'add',
              fadeOutCurve: 'smooth',
            },
          ],
        },
      ],
    };
    const out = assertValid(E.applyDirectorResult(start, fragment));
    const clip = clipOf(out, 'spark');
    assert.deepEqual(
      [clip.timelineStart, clip.timelineEnd, clip.sourceIn, clip.sourceOut],
      [4, 7, -1, 2],
    );
    assert.deepEqual(clip.generator, { type: 'particles', seed: 2, params: { rate: 50 } });
    assert.deepEqual(clip.effects, [
      { effectId: 'g', type: 'glow', enabled: true, params: { radius: 6 } },
    ]);
    assert.deepEqual(clip.keyframes, {
      'effects.g.radius': [
        { t: -1, v: 12, ease: 'ease-out' },
        { t: 1, v: 0, ease: 'linear' },
      ],
      'generator.params.rate': [{ t: 0, v: 5, ease: 'linear' }],
    });
    assert.deepEqual([clip.blendMode, clip.fadeOutCurve], ['add', 'smooth']);
    assert.equal(E.resolveClip(clip, 5).effects[0].params.radius, 1.5, 'half way, eased out');
    assert.deepEqual(E.normalizeEdl(out), out);
  });

  it('a keyframed transform property wins over ken burns; the others still move', () => {
    const clip = E.createClip({
      timelineStart: 0,
      timelineEnd: 10,
      transform: { kenBurns: { enabled: true, endX: 100, endScale: 2 } },
      keyframes: {
        'transform.x': [
          { t: 0, v: -50, ease: 'ease-out' },
          { t: 10, v: 50, ease: 'linear' },
        ],
      },
    });
    const at = (time) => E.resolveTransform(E.resolveClip(clip, time), E.clipProgress(clip, time));
    assert.deepEqual([at(0).x, at(0).scaleX, at(5).scaleX, at(5).scaleY], [-50, 1, 1.5, 1.5]);
    assert.equal(at(5).x, 37.5, 'x follows its keys (eased), not the ken burns move');
    const plain = { ...clip, keyframes: {} };
    assert.equal(E.resolveTransform(plain, 0.5).x, 50, 'without keys ken burns drives x');
    const over = E.resolveTransform({ transform: { opacity: 1.3, cropLeft: -0.2 } });
    assert.deepEqual([over.opacity, over.cropLeft], [1, 0], 'an overshoot is clamped');
  });

  it('getPath / setPath reach into structured effect parameters without breaking the stack', () => {
    const clip = {
      effects: [{ effectId: 'fx', type: 'wipe', params: { center: { x: 0.5, y: 0.5 } } }],
    };
    assert.equal(E.getPath(clip, 'effects.fx.center.x'), 0.5);
    assert.equal(E.getPath(clip, 'effects.nope.center.x'), undefined);
    const next = E.setPath(clip, 'effects.fx.center.x', 0.9);
    assert.deepEqual(next.effects[0].params, { center: { x: 0.9, y: 0.5 } });
    assert.ok(Array.isArray(next.effects));
    assert.equal(clip.effects[0].params.center.x, 0.5, 'the input is not mutated');
  });
});
