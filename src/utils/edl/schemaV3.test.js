import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './index.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from './testkit.js';

/** A document that uses every v3 addition, built by hand like a saved file. */
const rich = () => {
  const gen = testClip('gen', 0, 4, {
    sourceFile: '',
    sourceIn: -1.5,
    sourceOut: 2.5,
    blendMode: 'screen',
    fadeIn: 1,
    fadeInCurve: 'smooth',
    fadeOutCurve: 'sharp',
    generator: { type: 'particles', seed: 42, params: { rate: 80, emitter: { x: 0.5, y: 0.9 } } },
    effects: [
      {
        effectId: 'fx_glow',
        type: 'glow',
        enabled: true,
        params: { radius: 12, color: '#ffaa00' },
      },
      { effectId: 'fx_off', type: 'blur', enabled: false, params: {} },
    ],
    keyframes: {
      'transform.x': [
        { t: -1.5, v: -400, ease: 'ease-out' },
        { t: 0, v: 0, ease: 'linear' },
      ],
      'effects.fx_glow.radius': [
        { t: 0, v: 30, ease: 'hold' },
        { t: 1, v: 0, ease: 'linear' },
      ],
      'generator.params.rate': [
        { t: 0, v: 10, ease: 'linear' },
        { t: 2, v: 200, ease: 'linear' },
      ],
      'generator.params.emitter.x': [
        { t: 0, v: 0.1, ease: 'sine' },
        { t: 2, v: 0.9, ease: 'linear' },
      ],
    },
  });
  const title = testClip('title', 5, 8, {
    sourceFile: '',
    text: {
      content: 'Hello',
      fontFamily: 'Bebas Neue',
      weight: 900,
      lineHeight: 1.05,
      letterSpacing: 2,
      maxWidth: 1200,
      boxPadding: 0.4,
      boxRadius: 16,
      shadowColor: '#00000080',
      shadowBlur: 12,
      shadowX: 4,
      shadowY: 6,
      animateIn: { type: 'slide-up', duration: 0.6, by: 'word', stagger: 0.08, ease: 'back-out' },
      animateOut: { type: 'fade', duration: 0.3, by: 'block', stagger: 0, ease: 'linear' },
    },
    keyframes: {
      'text.color': [
        { t: 0, v: '#ffffff', ease: 'linear' },
        { t: 2, v: '#f97316', ease: 'linear' },
      ],
      volume: [{ t: 0, v: 0.5, ease: 'linear' }],
    },
  });
  const doc = testEdl(
    { v1: [gen, title], a1: [testClip('song', 0, 8)] },
    { background: '#101820' },
  );
  doc.tracks[0].opacity = 0.8;
  doc.tracks[0].blendMode = 'add';
  doc.tracks[0].effects = [{ effectId: 'fx_v', type: 'vignette', enabled: true, params: {} }];
  doc.regions = [{ regionId: 'r1', start: 1, end: 3, label: 'Verse', color: '' }];
  return deepFreeze(doc);
};

describe('schema v3 — factories', () => {
  it('fills every v3 field with a default that draws like v2', () => {
    const edl = assertValid(testEdl({ v1: [testClip('a', 0, 2)] }));
    assert.deepEqual([edl.version, edl.background, edl.regions], [3, '#000000', []]);
    const [track] = edl.tracks;
    assert.deepEqual([track.opacity, track.blendMode, track.effects], [1, 'normal', []]);
    const clip = track.clips[0];
    assert.deepEqual(
      [clip.blendMode, clip.fadeInCurve, clip.fadeOutCurve, clip.effects, clip.keyframes],
      ['normal', 'linear', 'linear', [], {}],
    );
    assert.deepEqual(clip.generator, { type: '', seed: 0, params: {} });
    const { text } = clip;
    assert.deepEqual(
      [text.weight, text.lineHeight, text.boxPadding, text.boxRadius],
      [0, 1.2, 0.25, 0],
    );
    assert.deepEqual([text.shadowBlur, text.shadowX, text.shadowY, text.maxWidth], [0, 0, 0, 0]);
    assert.equal(text.animateIn.type, 'none');
    assert.notEqual(text.animateIn, text.animateOut, 'blocks are not shared');
  });

  it('createClip merges nested overrides; clipKind knows generators', () => {
    const clip = E.createClip({
      generator: { type: 'solid' },
      text: { animateIn: { type: 'fade' } },
    });
    assert.deepEqual(clip.generator, { type: 'solid', seed: 0, params: {} });
    assert.deepEqual([clip.text.animateIn.type, clip.text.animateIn.by], ['fade', 'block']);
    assert.equal(E.clipKind(clip), 'generator');
    assert.equal(
      E.clipKind({ ...clip, sourceFile: '/a.mp4', text: { content: 'x' } }),
      'generator',
    );
    assert.equal(E.clipKind(E.createClip({ text: { content: 'x' } })), 'title');
    assert.equal(E.isTimed(clip, { type: 'video' }), false, 'a generator has no bounded source');
  });
});

describe('schema v3 — normalise, save, load', () => {
  it('a valid v3 document is left exactly as it is', () => {
    const doc = assertValid(rich());
    assert.deepEqual(E.normalizeEdl(doc), doc);
  });

  it('round-trips through save → JSON → load with nothing lost', () => {
    const doc = rich();
    const saved = E.toSavedDocument(doc, { zoom: 2, playheadPosition: 3 });
    const { edl, view } = E.fromSavedDocument(JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(edl, doc);
    assert.deepEqual([view.zoom, view.playheadPosition], [2, 3]);
    assert.equal(saved.tracks, doc.tracks, 'clips are saved as they are');
    assert.deepEqual([saved.background, saved.regions], ['#101820', doc.regions]);
  });

  it('keeps what an operation result carries (the old loss: unknown keys were dropped)', () => {
    const doc = rich();
    const out = E.updateClip(doc, 'gen', {
      generator: { params: { rate: 120, burst: true } },
      blendMode: 'multiply',
      fadeOutCurve: 'fast',
    });
    const clip = clipOf(assertValid(out), 'gen');
    assert.deepEqual(clip.generator.params, {
      rate: 120,
      emitter: { x: 0.5, y: 0.9 },
      burst: true,
    });
    assert.deepEqual([clip.blendMode, clip.fadeOutCurve], ['multiply', 'fast']);
    assert.equal(clip.effects, clipOf(doc, 'gen').effects, 'untouched parts are shared');
    assert.deepEqual(E.normalizeEdl(out), out);
  });

  it('resets unknown blend modes, curves, easings, fonts and animations to defaults', () => {
    const raw = structuredClone(rich());
    const [gen, title] = raw.tracks[0].clips;
    Object.assign(gen, { blendMode: 'dodge', fadeInCurve: 'bouncy', fadeOutCurve: 7 });
    gen.keyframes['transform.x'][0].ease = 'wobble';
    Object.assign(title.text, {
      fontFamily: 'Comic Neue',
      animateIn: { type: 'explode', by: 'pixel' },
    });
    Object.assign(raw.tracks[0], { blendMode: 'burn', opacity: 7 });
    raw.background = 'navy';
    const edl = assertValid(E.normalizeEdl(raw));
    const [g, t] = edl.tracks[0].clips;
    assert.deepEqual([g.blendMode, g.fadeInCurve, g.fadeOutCurve], ['normal', 'linear', 'linear']);
    assert.equal(g.keyframes['transform.x'][0].ease, 'linear');
    assert.equal(t.text.fontFamily, 'sans-serif');
    assert.deepEqual([t.text.animateIn.type, t.text.animateIn.by], ['none', 'block']);
    assert.deepEqual([edl.tracks[0].blendMode, edl.tracks[0].opacity], ['normal', 1]);
    assert.equal(edl.background, '#000000');
  });

  it('sorts keys, drops unusable keys and paths that address nothing', () => {
    const raw = structuredClone(rich());
    raw.tracks[0].clips[0].keyframes = {
      'transform.x': [
        { t: 2, v: 5 },
        { t: 'soon', v: 1 },
        { t: 0, v: '10' },
        { t: 1, v: null },
        { t: 2, v: 7, ease: 'hold' },
        { t: Infinity, v: 3 },
      ],
      'transform.opacity': [{ t: 0, v: 4 }],
      'transform.fit': [{ t: 0, v: 1 }],
      'text.color': [{ t: 0, v: 12 }],
      'effects.fx_gone.radius': [{ t: 0, v: 1 }],
      'effects.fx_glow': [{ t: 0, v: 1 }],
      timelineStart: [{ t: 0, v: 9 }],
      fadeIn: [{ t: 0, v: 9 }],
      'a..b': [{ t: 0, v: 1 }],
      volume: 'loud',
      'transform.y': [],
    };
    const keyframes = clipOf(assertValid(E.normalizeEdl(raw)), 'gen').keyframes;
    assert.deepEqual(keyframes, {
      'transform.x': [
        { t: 0, v: 10, ease: 'linear' },
        { t: 2, v: 7, ease: 'hold' },
      ],
      'transform.opacity': [{ t: 0, v: 1, ease: 'linear' }],
    });
  });

  it('makes effect ids unique within their clip or track and drops effects without a type', () => {
    const raw = structuredClone(rich());
    const fx = (effectId, type = 'blur') => ({ effectId, type, params: { radius: 2 } });
    raw.tracks[0].clips[0].effects = [fx('same'), fx('same'), fx('has space'), fx('x', ''), 'blur'];
    raw.tracks[0].effects = [fx('same'), { id: 'same', type: 'tint', enabled: 'false' }];
    const edl = assertValid(E.normalizeEdl(raw));
    const ids = clipOf(edl, 'gen').effects.map((e) => e.effectId);
    assert.equal(ids.length, 3);
    assert.equal(ids[0], 'same');
    assert.equal(new Set(ids).size, 3);
    assert.match(ids[2], /^fx_/);
    const [first, second] = edl.tracks[0].effects;
    assert.equal(first.effectId, 'same', 'a track stack is its own scope');
    assert.notEqual(second.effectId, 'same');
    assert.deepEqual([second.type, second.enabled, second.params], ['tint', false, {}]);
  });
});
