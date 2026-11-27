import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './index.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

const key = (t, v, ease = 'linear') => ({ t, v, ease });

/**
 * `src` is a styled, animated title (source window from 2). Targets: a
 * video clip with a linked sound and animation of its own, a title, a clip
 * that cross-fades with its neighbour, and one on a locked track.
 */
const doc = () => {
  const edl = testEdl({
    v3: [testClip('lock', 0, 4, { transform: { rotation: 33 } })],
    v2: [
      testClip('src', 0, 4, {
        sourceFile: '',
        sourceIn: 2,
        sourceOut: 6,
        fadeIn: 1,
        fadeOut: 0.5,
        fadeInCurve: 'smooth',
        fadeOutCurve: 'fast',
        blendMode: 'screen',
        text: { content: 'Source', color: '#ff0000', fontSize: 120, weight: 900 },
        transform: { x: 100, rotation: 10, kenBurns: { enabled: true, endScale: 1.5 } },
        effects: [{ effectId: 'fx', type: 'glow', enabled: true, params: { radius: 4 } }],
        keyframes: {
          'transform.x': [key(2, 0), key(4, 200)],
          'effects.fx.radius': [key(2, 0), key(3, 10)],
          'text.color': [key(2, '#ff0000')],
        },
      }),
      testClip('ttl', 6, 9, { sourceFile: '', text: { content: 'Target', italic: true } }),
    ],
    v1: [
      testClip('vid', 10, 14, {
        sourceIn: 30,
        sourceOut: 34,
        linkedClipId: 'snd',
        transform: { y: 7 },
        effects: [{ effectId: 'old', type: 'blur', enabled: true, params: {} }],
        keyframes: {
          'transform.y': [key(30, 1)],
          'effects.old.radius': [key(31, 2)],
          volume: [key(30, 1)],
        },
      }),
      testClip('f1', 20, 25, { fadeOut: 1 }),
      testClip('f2', 24, 30, { fadeIn: 1 }),
    ],
    a1: [testClip('snd', 10, 14, { sourceIn: 30, sourceOut: 34, linkedClipId: 'vid' })],
  });
  return deepFreeze(assertValid(E.toggleTrackLock(edl, 'v3')));
};
const ok = (edl) => {
  assertValid(edl);
  assert.deepEqual(E.normalizeEdl(edl), edl, 'normalising the result changes nothing');
  return edl;
};

describe('pasteAttributes', () => {
  it('pastes everything by default; what the clips show and where they are stays', () => {
    const start = doc();
    const out = ok(E.pasteAttributes(start, 'src', ['vid', 'ttl']));
    assert.deepEqual(layout(out), layout(start));
    const [src, vid, ttl] = ['src', 'vid', 'ttl'].map((id) => clipOf(out, id));
    assert.equal(src, clipOf(start, 'src'));
    for (const clip of [vid, ttl]) {
      assert.equal(clip.transform, src.transform);
      assert.equal(clip.effects, src.effects);
      assert.deepEqual(
        [clip.blendMode, clip.fadeInCurve, clip.fadeOutCurve],
        ['screen', 'smooth', 'fast'],
      );
      assert.deepEqual([clip.fadeIn, clip.fadeOut], [1, 0.5]);
      assert.deepEqual(
        [clip.text.color, clip.text.fontSize, clip.text.weight],
        ['#ff0000', 120, 900],
      );
    }
    assert.deepEqual([vid.text.content, ttl.text.content], ['', 'Target'], 'the words stay');
    assert.deepEqual([vid.sourceFile, vid.sourceIn, vid.volume], ['/media/vid.mp4', 30, 1]);
    assert.deepEqual(
      clipOf(out, 'snd'),
      clipOf(start, 'snd'),
      'the linked partner is not pasted onto',
    );
  });

  it('pasted keys keep their distance from the start of the clip', () => {
    const out = ok(E.pasteAttributes(doc(), 'src', ['vid']));
    assert.deepEqual(clipOf(out, 'vid').keyframes, {
      'transform.x': [key(30, 0), key(32, 200)],
      'effects.fx.radius': [key(30, 0), key(31, 10)],
      'text.color': [key(30, '#ff0000')],
    });
    const at = (id, time) => E.resolveClip(clipOf(out, id), time);
    for (const offset of [0, 0.5, 1, 3.9]) {
      assert.equal(at('vid', 10 + offset).transform.x, at('src', offset).transform.x);
      assert.equal(
        at('vid', 10 + offset).effects[0].params.radius,
        at('src', offset).effects[0].params.radius,
      );
    }
  });

  it('pastes only the chosen parts', () => {
    const start = doc();
    const only = (parts) => clipOf(ok(E.pasteAttributes(start, 'src', ['vid'], parts)), 'vid');
    const before = clipOf(start, 'vid');
    const transform = only({ transform: true });
    assert.equal(transform.transform.x, 100);
    assert.deepEqual(
      Object.keys(transform.keyframes),
      ['effects.old.radius', 'volume'],
      'its own transform keys go',
    );
    assert.deepEqual(
      [transform.effects, transform.blendMode, transform.text],
      [before.effects, 'normal', before.text],
    );
    const effects = only({ effects: true });
    assert.deepEqual(
      effects.effects.map((fx) => fx.effectId),
      ['fx'],
    );
    assert.deepEqual(Object.keys(effects.keyframes), ['transform.y', 'volume']);
    const keys = only({ keyframes: true });
    assert.deepEqual(
      Object.keys(keys.keyframes),
      ['transform.x', 'text.color'],
      'no such effect here',
    );
    assert.equal(keys.transform, before.transform);
    const look = only({ blendMode: true, fades: true });
    assert.deepEqual(
      [look.blendMode, look.fadeIn, look.fadeInCurve, look.keyframes],
      ['screen', 1, 'smooth', before.keyframes],
    );
    const text = clipOf(ok(E.pasteAttributes(start, 'src', ['ttl'], { text: true })), 'ttl');
    assert.deepEqual(
      [text.text.content, text.text.color, text.text.italic],
      ['Target', '#ff0000', false],
    );
    assert.equal(E.pasteAttributes(start, 'src', ['vid'], {}), start, 'no part chosen');
  });

  it('fades fit the target: a cross-fading edge keeps its overlap, long fades are shortened', () => {
    const start = doc();
    const out = ok(E.pasteAttributes(start, 'src', ['f1', 'f2'], { fades: true }));
    const [f1, f2] = [clipOf(out, 'f1'), clipOf(out, 'f2')];
    assert.deepEqual([f1.fadeIn, f1.fadeOut, f2.fadeIn, f2.fadeOut], [1, 1, 1, 0.5]);
    assert.deepEqual([f1.fadeOutCurve, f2.fadeInCurve], ['fast', 'smooth']);
    const short = E.trimClipEnd(start, 'ttl', 7);
    const fitted = clipOf(ok(E.pasteAttributes(short, 'src', ['ttl'], { fades: true })), 'ttl');
    assert.deepEqual([fitted.fadeIn, fitted.fadeOut], [1, 0]);
  });

  it('copies from a clip object or a clipboard payload, which is sanitised first', () => {
    const start = doc();
    const payload = JSON.parse(JSON.stringify(E.copyClips(start, ['src'])));
    payload.items[0].clip.blendMode = 'dodge';
    payload.items[0].clip.effects.push({ type: 'tint', params: { f: null } }, { type: '' });
    const out = ok(E.pasteAttributes(start, payload, ['ttl']));
    const ttl = clipOf(out, 'ttl');
    assert.deepEqual([ttl.blendMode, ttl.transform.x], ['normal', 100]);
    assert.deepEqual(
      ttl.effects.map((fx) => [fx.type, fx.params]),
      [
        ['glow', { radius: 4 }],
        ['tint', {}],
      ],
    );
    const fromClip = ok(
      E.pasteAttributes(start, clipOf(start, 'src'), ['ttl'], { blendMode: true }),
    );
    assert.equal(clipOf(fromClip, 'ttl').blendMode, 'screen');
    const text = ok(E.pasteAttributes(start, clipOf(start, 'vid'), ['ttl']));
    assert.equal(
      clipOf(text, 'ttl').text.italic,
      true,
      'a source without text has no style to give',
    );
  });

  it('leaves locked clips, unknown ids and the source itself alone', () => {
    const start = doc();
    assert.equal(E.pasteAttributes(start, 'src', ['lock', 'nope', 'src']), start);
    assert.equal(E.pasteAttributes(start, 'nope', ['vid']), start);
    assert.equal(E.pasteAttributes(start, null, ['vid']), start);
    assert.equal(E.pasteAttributes(start, 'src', []), start);
    const fromLocked = ok(E.pasteAttributes(start, 'lock', ['ttl'], { transform: true }));
    assert.equal(
      clipOf(fromLocked, 'ttl').transform.rotation,
      33,
      'a locked clip can be copied from',
    );
    const twice = E.pasteAttributes(start, 'src', ['vid']);
    assert.equal(E.pasteAttributes(twice, 'src', ['vid']), twice, 'pasting again changes nothing');
  });
});
