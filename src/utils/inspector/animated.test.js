import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addEffect } from '#utils/edl/effects.js';
import { createClip } from '#utils/edl/factory.js';
import { insertGenerator } from '#utils/edl/generator.js';
import { setKeyframe } from '#utils/edl/keyframes.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from '#utils/edl/testkit.js';
import { applyChange } from './apply.js';
import { inspectorModel } from './model.js';
import { fieldScope, selectedClips, targetsOf } from './targets.js';

/** A title (2..8 s) over a video with linked sound, plus a gradient generator. */
function doc() {
  const title = createClip({
    clipId: 't',
    timelineStart: 2,
    timelineEnd: 8,
    text: { content: 'Hi' },
  });
  let edl = testEdl({
    v0: [title],
    v1: [testClip('v', 0, 10, { linkedClipId: 'a' })],
    a1: [testClip('a', 0, 10, { linkedClipId: 'v' })],
  });
  edl = insertGenerator(
    edl,
    { type: 'gradient', seed: 7 },
    { time: 20, trackId: 'v1', clip: { clipId: 'g' } },
  );
  return edl;
}
const generatorId = (edl) => edl.tracks[1].clips.find((clip) => clip.generator.type).clipId;

describe('auto-key through the inspector', () => {
  it('writes the plain value while a property is not animated', () => {
    const edl = applyChange(
      deepFreeze(doc()),
      ['t'],
      { name: 'transform.x', value: 40 },
      { time: 3 },
    );
    assert.equal(clipOf(edl, 't').transform.x, 40);
    assert.deepEqual(clipOf(edl, 't').keyframes, {});
  });

  it('writes a key at the playhead while it is animated, inside the clip', () => {
    let edl = setKeyframe(doc(), 't', 'transform.x', 2, 0);
    edl = applyChange(deepFreeze(edl), ['t'], { name: 'transform.x', value: 300 }, { time: 4 });
    assert.deepEqual(clipOf(assertValid(edl), 't').keyframes['transform.x'], [
      { t: 0, v: 0, ease: 'linear' },
      { t: 2, v: 300, ease: 'linear' },
    ]);
    assert.equal(clipOf(edl, 't').transform.x, 0, 'the plain value underneath is untouched');
    const late = applyChange(edl, ['t'], { name: 'transform.x', value: 9 }, { time: 60 });
    assert.equal(clipOf(late, 't').keyframes['transform.x'].at(-1).t, 6, 'at the clip end');
  });

  it('shows the animated value at the playhead in the model', () => {
    let edl = setKeyframe(doc(), 't', 'transform.x', 2, 0);
    edl = setKeyframe(edl, 't', 'transform.x', 4, 200);
    assert.equal(inspectorModel(edl, ['t'], 3).fields['transform.x'].value, 100);
    assert.equal(inspectorModel(edl, ['t'], 9).fields['transform.x'].value, 200);
    assert.equal(inspectorModel(edl, ['t']).fields['transform.x'].value, 0, 'no time: stored');
    assert.equal(inspectorModel(edl, ['t'], 3).time, 3);
  });

  it('keys uniform scale on both axes and a reset removes the keys', () => {
    let edl = setKeyframe(doc(), 't', 'transform.scaleX', 2, 1);
    edl = setKeyframe(edl, 't', 'transform.scaleY', 2, 1);
    edl = applyChange(edl, ['t'], { name: 'transform.scale', value: 2 }, { time: 5 });
    const keys = clipOf(edl, 't').keyframes;
    assert.deepEqual([keys['transform.scaleX'][1].v, keys['transform.scaleY'][1].v], [2, 2]);
    edl = setKeyframe(edl, 't', 'transform.cropTop', 2, 0.2);
    const reset = assertValid(applyChange(edl, ['t'], { name: 'reset.transform' }, { time: 5 }));
    assert.deepEqual(Object.keys(clipOf(reset, 't').keyframes), ['transform.cropTop']);
    assert.equal(clipOf(reset, 't').transform.scaleX, 1);
  });
});

describe('the new clip fields', () => {
  it('scopes blend mode and effects to clips that draw, generator fields to generators', () => {
    assert.equal(fieldScope('blendMode'), 'visual');
    assert.equal(fieldScope('fadeInCurve'), 'all');
    assert.equal(fieldScope('generator.params.angle'), 'generator');
    assert.equal(fieldScope('effects.fx_1.radius'), 'visual');
    const edl = doc();
    const model = inspectorModel(edl, ['v', 'a', 't', generatorId(edl)], 0);
    assert.equal(model.fields.blendMode.count, 3, 'not the sound');
    assert.equal(model.fields.fadeInCurve.count, 4);
    assert.equal(model.visual.length, 3);
    assert.equal(model.show.generator, true);
    assert.equal(model.fields['generator.type'].value, 'gradient');
    assert.equal(model.fields['transform.x'].count, 3, 'a generator has a transform');
  });

  it('sets blend mode, fade curves and the new text fields', () => {
    let edl = applyChange(doc(), ['v', 'a'], { name: 'blendMode', value: 'screen' });
    assert.equal(clipOf(edl, 'v').blendMode, 'screen');
    assert.equal(clipOf(edl, 'a').blendMode, 'normal');
    edl = applyChange(edl, ['v', 'a'], { name: 'fadeOutCurve', value: 'smooth' });
    assert.equal(clipOf(edl, 'a').fadeOutCurve, 'smooth');
    edl = applyChange(edl, ['t'], { name: 'text.animateIn.type', value: 'typewriter' });
    edl = applyChange(edl, ['t'], { name: 'text.animateIn.by', value: 'char' });
    edl = applyChange(edl, ['t'], { name: 'text.fontFamily', value: 'Bebas Neue' });
    edl = applyChange(edl, ['t'], { name: 'text.shadowBlur', value: 12 });
    const { text } = clipOf(assertValid(edl), 't');
    assert.deepEqual([text.animateIn.type, text.animateIn.by], ['typewriter', 'char']);
    assert.deepEqual([text.fontFamily, text.shadowBlur], ['Bebas Neue', 12]);
    assert.equal(applyChange(edl, ['t'], { name: 'text.animateIn.type', value: 'explode' }), edl);
  });
});

describe('generator and effect parameters', () => {
  it('writes, keys and resets generator parameters; switches type and applies presets', () => {
    let edl = doc();
    const id = generatorId(edl);
    edl = applyChange(edl, [id], { name: 'generator.params.angle', value: 45 }, { time: 21 });
    edl = applyChange(edl, [id], { name: 'generator.params.center.x', value: 0.25 }, { time: 21 });
    edl = applyChange(edl, [id], { name: 'generator.seed', value: 99 });
    assert.deepEqual(clipOf(edl, id).generator, {
      type: 'gradient',
      seed: 99,
      params: { angle: 45, center: { x: 0.25 } },
    });
    edl = setKeyframe(edl, id, 'generator.params.angle', 20, 0);
    edl = applyChange(edl, [id], { name: 'generator.params.angle', value: 180 }, { time: 22 });
    assert.equal(clipOf(edl, id).keyframes['generator.params.angle'].length, 2);
    const preset = { params: { kind: 'radial' }, seed: 3 };
    const look = assertValid(applyChange(edl, [id], { name: 'generator.preset', value: preset }));
    assert.deepEqual(clipOf(look, id).generator, {
      type: 'gradient',
      seed: 3,
      params: { kind: 'radial' },
    });
    assert.deepEqual(clipOf(look, id).keyframes, {});
    const plain = applyChange(edl, [id], { name: 'reset.generator' });
    assert.deepEqual(clipOf(plain, id).generator.params, {});
    const solid = applyChange(edl, [id], { name: 'generator.type', value: 'solid' });
    assert.deepEqual(clipOf(assertValid(solid), id).generator, {
      type: 'solid',
      seed: 99,
      params: {},
    });
    assert.equal(applyChange(edl, [id], { name: 'generator.type', value: '' }), edl);
  });

  it('writes an effect parameter only to the clip that has the effect', () => {
    let edl = addEffect(doc(), 't', 'blur', { effectId: 'fx_a' });
    const refs = selectedClips(edl, ['t', 'v']);
    assert.deepEqual(
      targetsOf(refs, 'effects.fx_a.radius').map((ref) => ref.clip.clipId),
      ['t'],
    );
    edl = applyChange(edl, ['t', 'v'], { name: 'effects.fx_a.radius', value: 30 }, { time: 3 });
    assert.deepEqual(clipOf(edl, 't').effects[0].params, { radius: 30 });
    edl = setKeyframe(edl, 't', 'effects.fx_a.radius', 2, 30);
    edl = applyChange(edl, ['t'], { name: 'effects.fx_a.radius', value: 0 }, { time: 4 });
    assert.equal(clipOf(assertValid(edl), 't').keyframes['effects.fx_a.radius'].length, 2);
  });
});
