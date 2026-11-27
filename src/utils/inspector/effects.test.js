import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addEffect } from '#utils/edl/effects.js';
import { createClip } from '#utils/edl/factory.js';
import { setKeyframe } from '#utils/edl/keyframes.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from '#utils/edl/testkit.js';
import { anyEnabled, applyEffectAction } from './effectActions.js';
import { copyEffects, heldEffects, holdEffects, pasteEffects } from './effectClipboard.js';
import { applyTrackChange, trackModel } from './trackSubject.js';

const title = (clipId, start = 0) =>
  createClip({ clipId, timelineStart: start, timelineEnd: start + 5, text: { content: clipId } });
const doc = () =>
  deepFreeze(testEdl({ v0: [title('t'), title('u', 10)], v1: [testClip('v', 0, 8)] }));
const types = (edl, target) =>
  (target.trackId
    ? edl.tracks.find((t) => t.trackId === target.trackId)
    : clipOf(edl, target.clipId)
  ).effects.map((fx) => `${fx.type}${fx.enabled ? '' : ' (off)'}`);
const act = (edl, target, action) => assertValid(applyEffectAction(edl, target, action));

describe('effect stack actions', () => {
  const one = { clipIds: ['t'] };

  it('adds an effect to every clip named, or a whole chain in order', () => {
    const edl = act(
      doc(),
      { clipIds: ['t', 'v'] },
      { action: 'add', type: 'blur', params: { radius: 3 } },
    );
    assert.deepEqual(types(edl, { clipId: 't' }), ['blur']);
    assert.deepEqual(clipOf(edl, 'v').effects[0].params, { radius: 3 });
    const chain = [{ type: 'glow', params: { radius: 9 } }, { type: 'blur' }];
    const chained = act(edl, one, { action: 'chain', effects: chain });
    assert.deepEqual(types(chained, { clipId: 't' }), ['blur', 'glow', 'blur']);
    const base = doc();
    assert.equal(applyEffectAction(base, one, { action: 'add', type: '' }), base);
    assert.equal(applyEffectAction(base, one, /** @type {any} */ ({ action: 'nope' })), base);
  });

  it('toggles, moves, resets and removes one effect', () => {
    let edl = addEffect(doc(), 't', 'blur', { effectId: 'a', params: { radius: 30 } });
    edl = addEffect(edl, 't', 'glow', { effectId: 'b' });
    edl = setKeyframe(edl, 't', 'effects.a.radius', 1, 10);
    const off = act(edl, one, { action: 'toggle', effectId: 'a' });
    assert.deepEqual(types(off, { clipId: 't' }), ['blur (off)', 'glow']);
    const moved = act(edl, one, { action: 'move', effectId: 'b', toIndex: 0 });
    assert.deepEqual(types(moved, { clipId: 't' }), ['glow', 'blur']);
    const reset = act(edl, one, { action: 'reset', effectId: 'a' });
    assert.deepEqual(clipOf(reset, 't').effects[0].params, {});
    assert.deepEqual(clipOf(reset, 't').keyframes, {});
    const removed = act(edl, one, { action: 'remove', effectId: 'a' });
    assert.deepEqual(types(removed, { clipId: 't' }), ['glow']);
    assert.deepEqual(clipOf(removed, 't').keyframes, {}, 'its keyframes go with it');
  });

  it('bypasses a whole stack and brings it back', () => {
    let edl = addEffect(doc(), 't', 'blur');
    edl = addEffect(edl, 't', 'glow', { enabled: false });
    assert.equal(anyEnabled(edl, one), true);
    const off = act(edl, one, { action: 'bypass' });
    assert.deepEqual(types(off, { clipId: 't' }), ['blur (off)', 'glow (off)']);
    assert.equal(anyEnabled(off, one), false);
    assert.deepEqual(types(act(off, one, { action: 'bypass' }), { clipId: 't' }), ['blur', 'glow']);
  });

  it('works on a track stack the same way', () => {
    const track = { trackId: 'v1' };
    let edl = act(doc(), track, { action: 'add', type: 'glow' });
    edl = act(edl, track, { action: 'add', type: 'blur' });
    const [glow, blur] = edl.tracks[1].effects;
    edl = act(edl, track, { action: 'move', effectId: blur.effectId, toIndex: 0 });
    edl = act(edl, track, { action: 'toggle', effectId: glow.effectId });
    assert.deepEqual(types(edl, track), ['blur', 'glow (off)']);
    assert.deepEqual(types(act(edl, track, { action: 'remove', effectId: blur.effectId }), track), [
      'glow (off)',
    ]);
  });
});

describe('copying effects', () => {
  it('pastes a stack with its keyframes, timed from the start of each clip', () => {
    let edl = addEffect(doc(), 't', 'blur', { effectId: 'a', params: { radius: 30 } });
    edl = setKeyframe(edl, 't', 'effects.a.radius', 1, 30);
    edl = setKeyframe(edl, 't', 'transform.x', 1, 5);
    edl = addEffect(edl, 'u', 'glow');
    edl = setKeyframe(edl, 'u', 'transform.y', 11, 7);
    const copied = copyEffects(edl, { clipId: 't' });
    assert.deepEqual(Object.keys(copied.keyframes), ['effects.a.radius']);
    const pasted = assertValid(pasteEffects(edl, copied, { clipIds: ['u', 'v'] }));
    assert.deepEqual(types(pasted, { clipId: 'u' }), ['blur']);
    assert.deepEqual(clipOf(pasted, 'u').keyframes, {
      'transform.y': [{ t: 1, v: 7, ease: 'linear' }],
      'effects.a.radius': [{ t: 1, v: 30, ease: 'linear' }],
    });
    assert.deepEqual(clipOf(pasted, 'v').effects[0].params, { radius: 30 });
    assert.equal(copyEffects(edl, { clipId: 'v' }), null, 'nothing to copy');
    assert.equal(pasteEffects(edl, null, { clipIds: ['u'] }), edl);
  });

  it('pastes between a clip and a track, and holds the last copy', () => {
    const edl = addEffect(doc(), 't', 'blur', { effectId: 'a' });
    const onTrack = assertValid(
      pasteEffects(edl, copyEffects(edl, { clipId: 't' }), { trackId: 'v1' }),
    );
    assert.deepEqual(types(onTrack, { trackId: 'v1' }), ['blur']);
    const back = pasteEffects(onTrack, copyEffects(onTrack, { trackId: 'v1' }), { clipIds: ['u'] });
    assert.deepEqual(types(back, { clipId: 'u' }), ['blur']);
    assert.equal(holdEffects(null), false);
    assert.equal(holdEffects(copyEffects(edl, { clipId: 't' })), true);
    assert.equal(heldEffects().effects[0].type, 'blur');
  });
});

describe('track subject', () => {
  it('describes a track and edits its compositing settings', () => {
    const model = trackModel(doc(), 'v0');
    assert.deepEqual(
      [model.heading, model.type, model.detail],
      ['V0', 'video', 'video track · 2 clips'],
    );
    assert.equal(trackModel(doc(), 'nope'), null);
    assert.equal(trackModel(doc(), 'a1').type, 'audio');
    let edl = applyTrackChange(doc(), 'v0', { name: 'track.opacity', value: 0.4 });
    edl = applyTrackChange(edl, 'v0', { name: 'track.blendMode', value: 'screen' });
    edl = applyTrackChange(edl, 'a1', { name: 'track.volume', value: 1.5 });
    edl = applyTrackChange(edl, 'v0', { name: 'track.name', value: 'Titles' });
    assertValid(edl);
    assert.deepEqual([edl.tracks[0].opacity, edl.tracks[0].blendMode], [0.4, 'screen']);
    assert.deepEqual([edl.tracks[2].volume, edl.tracks[0].name], [1.5, 'Titles']);
    assert.equal(applyTrackChange(edl, 'v0', { name: 'track.name', value: ' ' }), edl);
  });

  it('writes effect parameters of a track, keeping the other half of a point', () => {
    let edl = applyEffectAction(doc(), { trackId: 'v0' }, { action: 'add', type: 'blur' });
    const { effectId } = edl.tracks[0].effects[0];
    edl = applyTrackChange(edl, 'v0', { name: `effects.${effectId}.radius`, value: 12 });
    edl = applyTrackChange(edl, 'v0', { name: `effects.${effectId}.center.x`, value: 0.2 });
    edl = applyTrackChange(edl, 'v0', { name: `effects.${effectId}.center.y`, value: 0.8 });
    assert.deepEqual(assertValid(edl).tracks[0].effects[0].params, {
      radius: 12,
      center: { x: 0.2, y: 0.8 },
    });
    assert.equal(applyTrackChange(edl, 'v0', { name: 'effects.gone.radius', value: 1 }), edl);
  });
});
