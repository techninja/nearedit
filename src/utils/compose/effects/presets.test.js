import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, gen, media } from '../../../../tests/compose/build.js';
import { draw } from '../../../../tests/compose/pixels.js';
import { createCanvas, createEnv } from '../../../api/compose/index.js';
import { effectModule } from '../catalog.js';
import { coerceParam } from '../params.js';
import { EFFECT_PRESETS, effectPreset } from './presets.js';

const plate = createCanvas(480, 270);
{
  const ctx = plate.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 480, 270);
  sky.addColorStop(0, '#0ea5e9');
  sky.addColorStop(0.5, '#fde68a');
  sky.addColorStop(1, '#be123c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 480, 270);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(60, 60, 120, 80);
}
const env = createEnv({ frameOf: () => plate });
const stack = (preset) =>
  preset.effects.map((effect, i) => ({ effectId: `fx_${i}`, enabled: true, ...effect }));
const footage = (effects, time = 1) =>
  draw(doc([[media('v', '/m/clip.mp4', { effects })]]), time, { env });

describe('effect presets', () => {
  it('are plain data: a name, a label, a description and a stack', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(EFFECT_PRESETS)), EFFECT_PRESETS);
    const names = EFFECT_PRESETS.map((preset) => preset.name);
    assert.equal(new Set(names).size, names.length, 'names are unique');
    for (const wanted of ['cinematic', 'dream', 'vhs', 'noir', 'warm', 'cool', 'spotlight']) {
      assert.ok(names.includes(wanted), `${wanted} is missing`);
    }
    for (const preset of EFFECT_PRESETS) {
      assert.match(preset.name, /^[a-z][a-zA-Z0-9]*$/);
      assert.ok(preset.label && preset.description.length > 15, preset.name);
      assert.ok(preset.effects.length >= 1 && preset.effects.length <= 6, preset.name);
    }
    assert.equal(effectPreset('noir').label, 'Noir');
    assert.equal(effectPreset('nope'), undefined);
  });

  it('name only effects that exist, with parameters their schemas accept', () => {
    for (const preset of EFFECT_PRESETS) {
      for (const { type, params } of preset.effects) {
        const module = effectModule(type);
        assert.ok(module, `${preset.name} uses unknown effect "${type}"`);
        for (const [name, value] of Object.entries(params)) {
          const where = `${preset.name}: ${type}.${name}`;
          const spec = module.params[name];
          assert.ok(spec, `${where} is not a parameter`);
          assert.deepEqual(coerceParam(spec, value), value, `${where} = ${value} is not valid`);
          assert.notDeepEqual(value, spec.default, `${where} only repeats the default`);
        }
      }
    }
  });

  it('each change the picture, the same way every time, without a warning', () => {
    const plain = footage([]);
    const warnings = [];
    const warn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      for (const preset of EFFECT_PRESETS) {
        const first = footage(stack(preset));
        assert.ok(Buffer.from(first.data).equals(Buffer.from(footage(stack(preset)).data)));
        let changed = 0;
        for (let i = 0; i < first.data.length; i++) changed += first.data[i] !== plain.data[i];
        assert.ok(changed > 10000, `${preset.name} changed only ${changed} values`);
        assert.equal(
          first.count(() => true),
          480 * 270,
        );
      }
    } finally {
      console.warn = warn;
    }
    assert.deepEqual(warnings, []);
  });

  it('keep an opaque picture opaque, and work on a title-like layer too', () => {
    for (const preset of EFFECT_PRESETS) {
      const over = (background) =>
        draw(doc([[media('v', '/m/clip.mp4', { effects: stack(preset) })]], { background }), 1, {
          env,
        });
      const black = over('#000000');
      const white = over('#ffffff');
      let leaks = 0;
      for (let i = 0; i < black.data.length; i += 4) leaks += white.data[i] - black.data[i] > 2;
      assert.equal(leaks, 0, `${preset.name} lets the background through footage`);
      const shape = gen(
        's',
        'shape',
        { shape: 'star', fill: '#f97316' },
        { effects: stack(preset) },
      );
      const drawn = draw(doc([[shape]], { background: '#102030' }));
      assert.deepEqual(drawn.at(3, 3), [0x10, 0x20, 0x30], `${preset.name} filled the frame`);
    }
  });
});
