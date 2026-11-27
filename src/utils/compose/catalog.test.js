import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EASINGS as EDL_EASINGS } from '#utils/edl/easing.js';
import { doc, fx, gen, media, title } from '../../../tests/compose/build.js';
import { compositeOperation, isBlended } from './blend.js';
import {
  BLEND_MODES,
  EASINGS,
  EFFECTS,
  GENERATORS,
  catalog,
  effectModule,
  generatorModule,
} from './catalog.js';
import { cssColor, isHex, parseColor, rgba, withAlpha } from './color.js';
import { clipTime, frameInfo, timelineTime } from './frame.js';
import { layerKind, layersAt } from './layers.js';
import { coerceParam, imageParams, resolveParams } from './params.js';
import { requirements } from './requirements.js';

const TYPES = ['number', 'color', 'boolean', 'select', 'text', 'image', 'point'];

describe('catalog', () => {
  it('lists the starting generators and the two reference effects', () => {
    assert.deepEqual(
      GENERATORS.map((g) => g.type),
      ['solid', 'gradient', 'shape', 'pattern', 'noise'],
    );
    assert.deepEqual(
      EFFECTS.map((e) => [e.type, e.kind]),
      [
        ['blur', 'filter'],
        ['glow', 'apply'],
      ],
    );
    assert.equal(generatorModule('gradient').type, 'gradient');
    assert.equal(typeof effectModule('glow').apply, 'function');
    assert.equal(generatorModule('nope'), undefined);
    assert.equal(effectModule(undefined), undefined);
  });

  it('gives every parameter a type, a usable default and sane limits', () => {
    for (const module of [...GENERATORS, ...EFFECTS]) {
      assert.ok(module.type && module.label && module.category, JSON.stringify(module.type));
      for (const [name, spec] of Object.entries(module.params)) {
        const where = `${module.type}.${name}`;
        assert.ok(TYPES.includes(spec.type), `${where} has type ${spec.type}`);
        assert.deepEqual(
          coerceParam(spec, spec.default),
          spec.default,
          `${where} default is not valid`,
        );
        if (spec.type === 'number')
          assert.ok((spec.min ?? -Infinity) < (spec.max ?? Infinity), where);
        if (spec.type === 'select') assert.ok(spec.options.includes(spec.default), where);
        for (const other of Object.keys(spec.when || {})) {
          assert.ok(module.params[other], `${where} depends on unknown parameter ${other}`);
        }
      }
      assert.ok(!('seed' in module.params), `${module.type} must not declare "seed"`);
    }
  });

  it('is plain data that survives JSON', () => {
    const data = catalog();
    assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
    assert.deepEqual(data.easings, EDL_EASINGS);
    assert.equal(EASINGS, EDL_EASINGS);
    assert.equal(data.blendModes.length, 9);
    assert.ok(data.fonts.some((font) => font.id === 'Inter'));
    assert.ok(data.textAnimations.includes('typewriter') && data.textUnits.includes('char'));
  });

  it('maps blend modes onto composite operations', () => {
    assert.deepEqual(
      BLEND_MODES.map((mode) => mode.id),
      [
        'normal',
        'add',
        'screen',
        'multiply',
        'overlay',
        'darken',
        'lighten',
        'difference',
        'soft-light',
      ],
    );
    assert.equal(compositeOperation('add'), 'lighter');
    assert.equal(compositeOperation('soft-light'), 'soft-light');
    assert.equal(compositeOperation('bogus'), 'source-over');
    assert.equal(isBlended('normal'), false);
    assert.equal(isBlended(undefined), false);
    assert.equal(isBlended('multiply'), true);
  });
});

describe('parameters', () => {
  const schema = {
    radius: { type: 'number', default: 8, min: 0, max: 100 },
    tint: { type: 'color', default: '#112233' },
    on: { type: 'boolean', default: true },
    mode: { type: 'select', default: 'a', options: ['a', 'b'] },
    label: { type: 'text', default: 'hi' },
    sprite: { type: 'image', default: '' },
    at: { type: 'point', default: { x: 0.5, y: 0.5 } },
  };

  it('takes defaults for whatever the document does not store', () => {
    assert.deepEqual(resolveParams(schema, undefined), {
      radius: 8,
      tint: '#112233',
      on: true,
      mode: 'a',
      label: 'hi',
      sprite: '',
      at: { x: 0.5, y: 0.5 },
    });
    assert.deepEqual(resolveParams(undefined, { a: 1 }), {});
  });

  it('keeps usable values, clamps numbers and drops what the schema does not know', () => {
    const got = resolveParams(schema, {
      radius: 250,
      tint: '#ABCDEF80',
      on: false,
      mode: 'b',
      label: 'x',
      sprite: '/m/a.png',
      at: { x: 0.1 },
      extra: 1,
    });
    assert.deepEqual(got, {
      radius: 100,
      tint: '#ABCDEF80',
      on: false,
      mode: 'b',
      label: 'x',
      sprite: '/m/a.png',
      at: { x: 0.1, y: 0.5 },
    });
  });

  it('falls back to the default for values of the wrong kind', () => {
    const got = resolveParams(schema, {
      radius: 'wide',
      tint: 'red',
      on: 'yes',
      mode: 'c',
      label: 5,
      at: 'here',
    });
    assert.deepEqual(got, resolveParams(schema, {}));
    assert.equal(resolveParams(schema, { radius: '12.5' }).radius, 12.5);
    assert.equal(resolveParams(schema, { radius: NaN }).radius, 8);
    assert.equal(resolveParams(schema, { on: 'false' }).on, false);
  });

  it('finds the image paths a bag refers to', () => {
    assert.deepEqual(imageParams(schema, { sprite: '/m/spark.png' }), ['/m/spark.png']);
    assert.deepEqual(imageParams(schema, {}), []);
    assert.deepEqual(imageParams(undefined, { sprite: '/x.png' }), []);
  });
});

describe('colours', () => {
  it('accepts hex colours only', () => {
    for (const ok of ['#fff', '#ffff', '#a1B2c3', '#a1b2c3d4']) assert.ok(isHex(ok), ok);
    for (const bad of ['red', '#12', '#12345', 'rgb(0,0,0)', '', null, 3])
      assert.ok(!isHex(bad), String(bad));
    assert.equal(cssColor('#123456', '#ffffff'), '#123456');
    assert.equal(cssColor('url(x)', '#ffffff'), '#ffffff');
    assert.equal(cssColor(undefined), '#000000');
  });

  it('splits and rebuilds colours', () => {
    assert.deepEqual(parseColor('#ff8000'), [255, 128, 0, 1]);
    assert.deepEqual(parseColor('#f80'), [255, 136, 0, 1]);
    assert.deepEqual(parseColor('#00000080'), [0, 0, 0, 128 / 255]);
    assert.deepEqual(parseColor('nope', [1, 2, 3, 0.5]), [1, 2, 3, 0.5]);
    assert.equal(rgba(255.4, -3, 12, 2), 'rgba(255, 0, 12, 1)');
    assert.equal(withAlpha('#ff000080', 0.5), `rgba(255, 0, 0, ${128 / 255 / 2})`);
  });
});

describe('frame, time and layers', () => {
  it('describes a canvas against the output size', () => {
    assert.deepEqual(frameInfo({ resolution: '1920x1080', fps: 24 }, 480, 270), {
      width: 480,
      height: 270,
      scale: 0.25,
      fps: 24,
      outWidth: 1920,
      outHeight: 1080,
    });
    assert.equal(frameInfo({}, 1920, 1080).fps, 30);
  });

  it('describes a moment in a clip and on the timeline', () => {
    const clip = { sourceIn: 10, timelineStart: 2, timelineEnd: 6 };
    assert.deepEqual(clipTime(clip, 3, 30), {
      t: 11,
      age: 1,
      remaining: 3,
      duration: 4,
      frame: 90,
    });
    const edl = doc([[gen('a', 'solid')]]);
    assert.deepEqual(timelineTime(edl, 1, 30), {
      t: 1,
      age: 1,
      remaining: 3,
      duration: 4,
      frame: 30,
    });
  });

  it('lists the layers of a frame back to front, with their source times', () => {
    const edl = doc([
      [title('t', 'Hi'), media('p', '', { placeholder: true })],
      { muted: true, clips: [gen('hidden', 'solid')] },
      [
        media('v', '/m/a.mp4', { sourceIn: 5, sourceOut: 9 }),
        media('late', '/m/b.png', { timelineStart: 4, timelineEnd: 8 }),
      ],
      [gen('g', 'solid')],
    ]);
    const layers = layersAt(edl, 1.5);
    assert.deepEqual(
      layers.map((l) => [l.clip.clipId, l.kind]),
      [
        ['g', 'generator'],
        ['v', 'video'],
        ['t', 'title'],
      ],
    );
    assert.equal(layers[1].sourceTime, 6.5);
    assert.equal(layerKind(media('a', '/m/song.mp3'), {}), null);
    assert.equal(layerKind(media('i', '/m/pic.JPG'), {}), 'image');
  });
});

describe('requirements', () => {
  it('lists every still and every font a document needs, once', () => {
    const edl = doc([
      [
        title('t1', 'One', { fontFamily: 'Caveat', bold: true }),
        title('t2', 'One', { fontFamily: 'Caveat', bold: true, fontSize: 90 }),
      ],
      [
        media('a', '/m/a.png'),
        media('b', '/m/a.png', { timelineStart: 5, timelineEnd: 6 }),
        media('v', '/m/v.mp4'),
      ],
      [gen('g', 'solid', {}, { effects: [fx('blur')] }), media('p', '', { placeholder: true })],
    ]);
    const needs = requirements(edl);
    assert.deepEqual(needs.images, ['/m/a.png']);
    assert.deepEqual(needs.fonts, [
      { font: '700 72px "Caveat", "Noto Color Emoji"', text: 'One' },
      { font: '700 90px "Caveat", "Noto Color Emoji"', text: 'One' },
    ]);
    assert.deepEqual(requirements({}), { images: [], fonts: [] });
  });
});
