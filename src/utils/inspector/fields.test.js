import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KEN_BURNS_PRESETS, kenBurnsPreset, matchingPreset } from './kenBurns.js';
import { formatValue, parseValue, scrubValue, stepValue } from './fieldValue.js';
import { clampNumber, formatNumber, parseNumber, stepNumber } from './numberField.js';
import { getPath, mergedValue, patchFor } from './paths.js';
import { FIELD_SPECS, specFor } from './specs.js';
import { parseTime, stepTime } from './timeField.js';

const percent = specFor('transform.opacity');
const pixels = specFor('transform.x');
const degrees = specFor('transform.rotation');

describe('number fields', () => {
  it('formats stored values for display', () => {
    assert.equal(formatNumber(0.5, percent), '50');
    assert.equal(formatNumber(1.234, { decimals: 2 }), '1.23');
    assert.equal(formatNumber(1.5, { decimals: 2 }), '1.5');
    assert.equal(formatNumber(100, { decimals: 2 }), '100');
    assert.equal(formatNumber(-0.001, { decimals: 1 }), '0');
    assert.equal(formatNumber(NaN, percent), '');
    assert.equal(formatNumber(12.5, degrees), '12.5');
  });

  it('parses what people type: units, commas, sums', () => {
    assert.equal(parseNumber('50', percent), 0.5);
    assert.equal(parseNumber(' 75 % ', percent), 0.75);
    assert.equal(parseNumber('12,5', degrees), 12.5);
    assert.equal(parseNumber('-40px', pixels), -40);
    assert.equal(parseNumber('100+20', pixels), 120);
    assert.equal(parseNumber('90/4', degrees), 22.5);
    assert.equal(parseNumber('10-2.5', degrees), 7.5);
    assert.equal(parseNumber('-5*3', pixels), -15);
    assert.equal(parseNumber('', pixels), null);
    assert.equal(parseNumber('abc', pixels), null);
    assert.equal(parseNumber('1/0', pixels), null);
  });

  it('clamps to the range of the field', () => {
    assert.equal(parseNumber('250', percent), 1);
    assert.equal(parseNumber('-3', percent), 0);
    assert.equal(parseNumber('150', specFor('volume')), 1.5);
    assert.equal(clampNumber(5, {}), 5);
    assert.equal(parseNumber('999', degrees), 360);
  });

  it('steps with the arrow keys; shift is ten steps, alt a tenth', () => {
    assert.equal(stepNumber(0.5, 1, percent), 0.51);
    assert.equal(stepNumber(0.5, -1, percent, { shift: true }), 0.4);
    assert.equal(stepNumber(0.995, 1, percent), 1);
    assert.equal(stepNumber(10, 1, pixels, { shift: true }), 20);
    assert.equal(stepNumber(10, -1, degrees, { alt: true }), 9.9);
    assert.equal(stepNumber(0.1, 1, { step: 0.1 }), 0.2, 'no float noise');
    assert.equal(stepNumber(NaN, 1, pixels), 1, 'a mixed field steps from zero');
  });

  it('scrubs by dragging: three pixels a step', () => {
    assert.equal(scrubValue(100, 30, pixels), 110);
    assert.equal(scrubValue(100, -9, pixels, { shift: true }), 70);
    assert.equal(scrubValue(100, 2, pixels), 100);
    assert.equal(scrubValue(0.5, 3000, percent), 1);
    assert.equal(scrubValue(NaN, 6, pixels), 2);
  });

  it('treats time specs as timecode: format, parse, step and scrub by frames', () => {
    const time = { kind: /** @type {'time'} */ ('time'), fps: 30 };
    assert.equal(formatValue(5.4, time), '00:00:05:12');
    assert.equal(formatValue(NaN, time), '');
    assert.equal(formatValue(0.5, percent), '50');
    assert.ok(Math.abs(parseValue('512', time) - 5.4) < 1e-9);
    assert.equal(parseValue('later', time), null);
    assert.equal(parseValue('75', percent), 0.75);
    assert.ok(Math.abs(stepValue(1, 1, time) - 31 / 30) < 1e-9);
    assert.equal(stepValue(1, -1, time, { shift: true }), 0);
    assert.ok(Math.abs(scrubValue(1, 9, time) - 1.1) < 1e-9);
    assert.equal(stepValue(0.2, -30, { ...time, min: 1 / 30 }), 1 / 30);
  });

  it('has a spec for every number the inspector edits', () => {
    for (const spec of Object.values(FIELD_SPECS)) assert.ok(spec.step > 0);
    assert.equal(specFor('transform.cropLeft').unit, '%');
    assert.deepEqual(specFor('unknown.path'), { step: 1, decimals: 2 });
  });
});

describe('time fields', () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

  it('reads timecode, right-aligned digits, seconds and frames', () => {
    close(parseTime('00:00:05:12', 30), 5.4);
    close(parseTime('1:05:12', 30), 65.4);
    close(parseTime('512', 30), 5.4);
    close(parseTime('5', 30), 5 / 30);
    close(parseTime('10000', 30), 60);
    close(parseTime('12.5', 30), 12.5);
    close(parseTime('3s', 30), 3);
    close(parseTime('1,5s', 30), 1.5);
    close(parseTime('45f', 30), 1.5);
    close(parseTime('12', 24), 0.5);
    assert.ok(Number.isNaN(parseTime('', 30)));
    assert.ok(Number.isNaN(parseTime('soon', 30)));
  });

  it('steps by a frame, or a second with shift, and stops at zero', () => {
    close(stepTime(1, 1, 30), 31 / 30);
    close(stepTime(1, -1, 30, { shift: true }), 0);
    close(stepTime(0, -1, 30), 0);
    close(stepTime(2.0000001, 1, 25), 2.04);
  });
});

describe('paths', () => {
  const clip = { label: 'A', transform: { x: 4, kenBurns: { endScale: 1.2 } } };

  it('reads and writes nested fields by dotted path', () => {
    assert.equal(getPath(clip, 'transform.kenBurns.endScale'), 1.2);
    assert.equal(getPath(clip, 'text.content'), undefined);
    assert.deepEqual(patchFor('transform.kenBurns.endScale', 2), {
      transform: { kenBurns: { endScale: 2 } },
    });
    assert.deepEqual(patchFor('label', 'B'), { label: 'B' });
  });

  it('merges a field across clips and flags differences', () => {
    const other = { label: 'B', transform: { x: 4.0000000001, kenBurns: { endScale: 1.2 } } };
    assert.deepEqual(mergedValue([clip, other], 'transform.x'), { value: 4, mixed: false });
    assert.deepEqual(mergedValue([clip, other], 'label'), { value: 'A', mixed: true });
    assert.deepEqual(mergedValue([], 'label'), { value: undefined, mixed: false });
  });
});

describe('ken burns presets', () => {
  it('builds complete, enabled blocks sized to the frame', () => {
    const zoom = kenBurnsPreset('zoom-in', '1920x1080');
    assert.deepEqual([zoom.enabled, zoom.startScale, zoom.endScale, zoom.endX], [true, 1, 1.2, 0]);
    const pan = kenBurnsPreset('pan-left', '1920x1080');
    assert.deepEqual([pan.startX, pan.endX, pan.startScale, pan.endScale], [115, -115, 1.15, 1.15]);
    const tall = kenBurnsPreset('pan-up', '1080x1920');
    assert.deepEqual([tall.startY, tall.endY, tall.startX], [115, -115, 0]);
    assert.equal(Object.keys(zoom).length, 15, 'every kenBurns key is present');
    assert.equal(kenBurnsPreset('spin', '1920x1080'), null);
  });

  it('pans never show the edge of the picture', () => {
    for (const { id } of KEN_BURNS_PRESETS.filter((p) => p.id.startsWith('pan'))) {
      const kb = kenBurnsPreset(id, '1920x1080');
      const roomX = (1920 * (Number(kb.startScale) - 1)) / 2;
      assert.ok(Math.abs(Number(kb.startX)) <= roomX && Math.abs(Number(kb.endX)) <= roomX, id);
    }
  });

  it('recognises which preset a block is', () => {
    const block = kenBurnsPreset('pan-right', '1280x720');
    assert.equal(matchingPreset(block, '1280x720'), 'pan-right');
    assert.equal(matchingPreset({ ...block, endX: 3 }, '1280x720'), '');
    assert.equal(matchingPreset({ ...block, enabled: false }, '1280x720'), '');
  });
});
