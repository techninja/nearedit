import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEdl, createTrack } from '#utils/edl/factory.js';
import { clipKind } from '#utils/edl/clipKind.js';
import { validateEdl } from '#utils/edl/validate.js';
import { builtinKit, resolveElement, resolveKit } from '#utils/brand/index.js';
import { coverTime, expandElement } from './expand.js';
import { LOWER, SQUARE, TALL, WIDE, boxOf, expand } from './testkit.js';

describe('expandElement: what comes out', () => {
  const kit = resolveKit(builtinKit('clean'));
  const slots = {
    name: 'Ada Lovelace',
    role: 'Mathematician',
    title: 'A title',
    subtitle: 'Under it',
    text: 'Words',
    by: 'Ada',
    number: '01',
  };

  it('is ordinary clips: a document made of them is valid', () => {
    for (const id of Object.keys(kit.elements)) {
      for (const frame of [WIDE, TALL, SQUARE]) {
        const clips = expandElement(resolveElement(kit, id), slots, { duration: 4, frame });
        const tracks = clips.map((clip, i) =>
          createTrack('video', { trackId: `v${i}`, clips: [clip] }),
        );
        const edl = createEdl({
          tracks: [...tracks.reverse(), createTrack('audio', { trackId: 'a1' })],
        });
        assert.deepEqual(validateEdl(edl).problems, [], `${id} in ${frame.width}x${frame.height}`);
        for (const clip of clips) {
          assert.ok(
            clip.timelineStart >= 0 &&
              clip.timelineEnd <= 4 + 1e-9 &&
              clip.timelineEnd > clip.timelineStart,
          );
          assert.ok(
            ['title', 'generator', 'image'].includes(clipKind(clip)),
            'no element inside an element',
          );
        }
      }
    }
  });

  it('is deterministic: the same input gives equal clips, and nothing is changed', () => {
    const given = resolveElement(kit, 'lower-third');
    const before = JSON.stringify(given);
    const a = expandElement(given, slots, { duration: 5, frame: WIDE });
    const b = expandElement(JSON.parse(before), { ...slots }, { duration: 5, frame: { ...WIDE } });
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(given), before);
    assert.notDeepEqual(a, expandElement(given, slots, { duration: 6, frame: WIDE }));
  });

  it('uses the measure and the picture sizes a host gives', () => {
    const wide = (text, style) => text.length * style.fontSize;
    const estimated = expand(LOWER, { name: 'Ada Lovelace' }).by.plate;
    const measured = expand(LOWER, { name: 'Ada Lovelace' }, { measure: wide }).by.plate;
    assert.equal(
      boxOf(measured).w,
      12 * 54 + 2 * 32 + 1,
      'twelve characters, a font size wide each',
    );
    assert.notEqual(boxOf(estimated).w, boxOf(measured).w);
    const logo = {
      layers: [{ id: 'logo', type: 'image', src: '/logo.png', at: 'top-left', h: 10 }],
    };
    const unknown = expand(logo).by.logo;
    const known = expand(logo, {}, { sizeOf: () => ({ width: 400, height: 100 }) }).by.logo;
    assert.equal(unknown.sourceFile, '/logo.png');
    assert.deepEqual(
      [unknown.transform.fit, unknown.transform.scaleX],
      ['contain', 0.1],
      'taken to be square',
    );
    // 400×100 contained in 1920×1080 is 1920×480; shown 432×108 it is scaled by 0.225.
    assert.ok(Math.abs(known.transform.scaleX - 0.225) < 1e-9);
    assert.equal(Math.round(known.transform.x), Math.round(65 + 216 - 960));
  });

  it('turns a generator layer into a generator clip, its lengths in units', () => {
    const { by } = expand({
      layers: [
        {
          id: 'g',
          type: 'generator',
          generator: 'pattern',
          params: { pattern: 'dots', color: '#ff0000' },
          lengths: { size: 5 },
          animate: { fill: [0.2, 0.6], color: ['#ff0000', '#00ff00'], pattern: ['a', 'b'] },
          seed: 7,
        },
      ],
    });
    assert.deepEqual(by.g.generator, {
      type: 'pattern',
      seed: 7,
      params: { pattern: 'dots', color: '#ff0000', size: 54 },
    });
    assert.deepEqual(Object.keys(by.g.keyframes), [
      'generator.params.fill',
      'generator.params.color',
    ]);
    assert.deepEqual(
      by.g.keyframes['generator.params.fill'].map((key) => [key.t, key.v]),
      [
        [0, 0.2],
        [5, 0.6],
      ],
    );
  });

  it('says where a transition covers the frame', () => {
    assert.equal(coverTime({ cover: 0.25 }, 2), 0.5);
    assert.equal(coverTime({}, 1.2), 0.6);
    assert.equal(coverTime({ cover: 9 }, 2), 2);
    assert.equal(coverTime(null, 2), 1);
  });
});
