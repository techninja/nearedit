import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isHex } from '#utils/compose/color.js';
import { paramControls } from '#utils/inspector/paramControls.js';
import {
  CAPTION_PRESETS,
  CAPTION_STYLE,
  PRESET_NAMES,
  STYLE_PATHS,
  flatCaptionStyle,
  normalizeCaptionStyle,
  resolveCaptionStyle,
} from './index.js';
import { readPath } from './style.js';

/** Every leaf of a nested object, as dotted paths. */
function leaves(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) =>
    value && typeof value === 'object' ? leaves(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

/** A value is what its field allows. */
function fits(path, value) {
  const spec = CAPTION_STYLE[path];
  if (spec.type === 'number') return value >= spec.min && value <= spec.max;
  if (spec.type === 'select') return spec.options.includes(value);
  if (spec.type === 'color') return isHex(value);
  if (spec.type === 'boolean') return typeof value === 'boolean';
  return typeof value === 'string' && value.length > 0 && value.length <= 80;
}

describe('CAPTION_STYLE', () => {
  it('describes every field of the contract with a type, a default, a label and a section', () => {
    const wanted = ['preset', 'font.family', 'font.weight', 'size', 'case', 'color'];
    wanted.push('stroke.width', 'shadow.blur', 'plate.on', 'plate.opacity', 'plate.padding');
    wanted.push('plate.radius', 'highlight.mode', 'highlight.color', 'unspoken', 'group.words');
    wanted.push('group.chars', 'group.lines', 'group.pause', 'punctuation', 'position.anchor');
    wanted.push('position.offset', 'motion.in', 'motion.word', 'motion.seconds', 'hold');
    for (const path of wanted) assert.ok(CAPTION_STYLE[path], `${path} is described`);
    for (const [path, spec] of Object.entries(CAPTION_STYLE)) {
      assert.ok(spec.label && spec.group, `${path} has a label and a section`);
      assert.ok(fits(path, spec.default), `${path}: the default is a value the field allows`);
      if (spec.type === 'number') assert.ok(spec.step > 0 && spec.min < spec.max, path);
    }
  });

  it('has the defaults the contract names', () => {
    const style = resolveCaptionStyle();
    assert.equal(style.preset, 'clean');
    assert.deepEqual(style.font, { family: 'Inter', weight: 800 });
    assert.equal(style.size, 5.2);
    assert.deepEqual(style.group, { words: 3, chars: 18, lines: 1, pause: 0.5 });
    assert.deepEqual(style.position, { anchor: 'bottom', offset: 12 });
    assert.deepEqual(style.motion, { in: 'pop', word: 'pop', seconds: 0.12 });
    assert.deepEqual([style.highlight.mode, style.highlight.color], ['color', '#facc15']);
    assert.deepEqual([style.unspoken, style.punctuation, style.case], ['show', 'keep', 'as-is']);
    assert.equal(style.hold, 0.3);
    assert.equal(style.plate.on, false);
  });

  it('feeds the inspector controls that generators and effects use, hints included', () => {
    const controls = paramControls(CAPTION_STYLE, flatCaptionStyle('pop'), 'captions.style');
    const names = controls.map((control) => control.name);
    const size = controls.find((control) => control.name === 'size');
    assert.deepEqual([size.path, size.type, size.value], ['captions.style.size', 'number', 7.4]);
    // The plate's fields show only while there is a plate, the size of the
    // word being said only while it is marked by size.
    assert.ok(names.includes('highlight.scale') && !names.includes('plate.color'));
    assert.equal(names.length, STYLE_PATHS.length - 4);
    const boxed = paramControls(CAPTION_STYLE, flatCaptionStyle('boxed'), 'captions.style');
    assert.equal(boxed.length, STYLE_PATHS.length - 1);
    assert.ok(!boxed.some((control) => control.name === 'highlight.scale'));
  });
});

describe('CAPTION_PRESETS', () => {
  it('holds five complete, frozen styles with a label and a one-line description', () => {
    assert.deepEqual(Object.keys(CAPTION_PRESETS), ['clean', 'pop', 'karaoke', 'boxed', 'minimal']);
    assert.deepEqual(PRESET_NAMES, Object.keys(CAPTION_PRESETS));
    for (const [name, preset] of Object.entries(CAPTION_PRESETS)) {
      assert.ok(preset.label && preset.description && !preset.description.includes('\n'), name);
      assert.deepEqual(leaves(preset.style).sort(), [...STYLE_PATHS].sort(), `${name} is complete`);
      for (const path of STYLE_PATHS) {
        assert.ok(fits(path, readPath(preset.style, path)), `${name}.${path}`);
      }
      assert.equal(preset.style.preset, name);
      assert.ok(Object.isFrozen(preset.style) && Object.isFrozen(preset.style.group));
      assert.equal(resolveCaptionStyle(name), preset.style, 'its name resolves to the very object');
    }
  });

  it('marks the word being said in every way the contract lists', () => {
    const modes = PRESET_NAMES.map((name) => CAPTION_PRESETS[name].style.highlight.mode);
    assert.deepEqual(modes, ['color', 'scale', 'color', 'box', 'underline']);
  });
});

describe('resolveCaptionStyle', () => {
  it('applies what is stored over the preset it names', () => {
    const stored = { preset: 'pop', size: 6, highlight: { color: '#FACC15' } };
    const style = resolveCaptionStyle(stored);
    assert.equal(style.size, 6);
    assert.equal(style.highlight.color, '#facc15');
    assert.equal(style.highlight.mode, 'scale', 'the rest of the group stays the preset');
    assert.equal(style.case, 'upper');
    assert.deepEqual(stored, { preset: 'pop', size: 6, highlight: { color: '#FACC15' } });
  });

  it('is complete, frozen, and the same object for the same stored object', () => {
    const stored = { preset: 'boxed', hold: 1 };
    const style = resolveCaptionStyle(stored);
    assert.deepEqual(leaves(style).sort(), [...STYLE_PATHS].sort());
    assert.ok(Object.isFrozen(style) && Object.isFrozen(style.plate));
    assert.equal(resolveCaptionStyle(stored), style);
    assert.equal(resolveCaptionStyle(style), style, 'a resolved style resolves to itself');
    assert.notEqual(resolveCaptionStyle({ ...stored }), style);
  });

  it('keeps every value inside its range and in whole steps where it counts', () => {
    const style = resolveCaptionStyle({
      size: 900,
      hold: -3,
      font: { weight: 849 },
      group: { words: 2.6, chars: 1e9, lines: 7, pause: 0 },
      position: { offset: -5 },
      motion: { seconds: 12 },
      shadow: { opacity: 4 },
      highlight: { scale: 0.2 },
    });
    assert.deepEqual([style.size, style.hold, style.font.weight], [20, 0, 800]);
    assert.deepEqual(style.group, { words: 3, chars: 80, lines: 2, pause: 0.1 });
    assert.deepEqual([style.position.offset, style.motion.seconds], [0, 1]);
    assert.deepEqual([style.shadow.opacity, style.highlight.scale], [1, 1]);
  });

  it('never throws and always gives a usable style, whatever it is handed', () => {
    const bomb = Object.defineProperty({}, 'size', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    const hostile = [undefined, null, 0, NaN, 'nope', '__proto__', [], [1, 2], () => 1, bomb];
    hostile.push({ preset: 'constructor' }, { preset: ['pop'] }, { preset: {} });
    hostile.push({ size: 'big', color: 'red', case: 7, font: 'Inter', group: [1, 2] });
    hostile.push({ font: { family: 'x'.repeat(5000), weight: '700' }, plate: { on: 'yes' } });
    hostile.push({ highlight: null, motion: 5, position: { anchor: {}, offset: Infinity } });
    hostile.push(JSON.parse('{"__proto__": {"size": 19}, "stroke": {"__proto__": {"width": 2}}}'));
    for (const raw of hostile) {
      const style = resolveCaptionStyle(raw);
      for (const path of STYLE_PATHS) {
        assert.ok(fits(path, readPath(style, path)), `${path} from ${String(raw)}`);
      }
    }
    assert.equal(
      resolveCaptionStyle({ size: '6.5' }).size,
      6.5,
      'a number written as text is read',
    );
    assert.equal(
      resolveCaptionStyle({ font: { family: 'x'.repeat(5000) } }).font.family.length,
      80,
    );
    assert.equal(resolveCaptionStyle(hostile.at(-1)).size, 5.2, 'nothing is read from a prototype');
    assert.equal({}.size, undefined, 'and nothing is written to one');
  });
});

describe('normalizeCaptionStyle', () => {
  it('stores the preset name and only what differs from it', () => {
    assert.deepEqual(normalizeCaptionStyle(undefined), { preset: 'clean' });
    assert.deepEqual(normalizeCaptionStyle('karaoke'), { preset: 'karaoke' });
    const same = { preset: 'pop', size: 7.4, case: 'upper', highlight: { mode: 'scale' } };
    assert.deepEqual(normalizeCaptionStyle(same), { preset: 'pop' });
    const stored = normalizeCaptionStyle({
      preset: 'pop',
      size: 6,
      highlight: { color: '#FACC15', mode: 'scale' },
      nonsense: true,
      group: { words: 99, colour: 'x' },
    });
    assert.deepEqual(stored, {
      preset: 'pop',
      size: 6,
      highlight: { color: '#facc15' },
      group: { words: 12 },
    });
  });

  it('gives back what resolves to the same style, as plain JSON', () => {
    const raw = { preset: 'boxed', plate: { opacity: 0.5 }, motion: { word: 'fill' }, hold: 2 };
    const stored = normalizeCaptionStyle(raw);
    assert.deepEqual(JSON.parse(JSON.stringify(stored)), stored);
    assert.deepEqual(resolveCaptionStyle(stored), resolveCaptionStyle(raw));
    assert.deepEqual(normalizeCaptionStyle(stored), stored);
    assert.deepEqual(normalizeCaptionStyle({ preset: 'gone', size: 5.2 }), { preset: 'clean' });
  });
});
