import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEdl } from '#utils/edl/normalize.js';
import { UsageError, closest, parseArgs, parseRange } from './args.js';
import { catalogFindings } from './catalogCheck.js';
import { jsonErrorOffset, lineAndColumn } from './jsonError.js';
import { repairFindings } from './repairs.js';

describe('nearedit: command-line arguments', () => {
  const spec = {
    output: { short: 'o', type: /** @type {'string'} */ ('string') },
    time: { type: /** @type {'number'} */ ('number') },
    json: { type: /** @type {'flag'} */ ('flag') },
    media: { type: /** @type {'list'} */ ('list') },
    preset: { type: /** @type {'string'} */ ('string'), choices: ['draft', 'high'] },
  };
  const parse = (...argv) => parseArgs(argv, spec, 'frame');

  it('reads options in any order, long or short, with = or a space', () => {
    assert.deepEqual(parse('a.json', '-o', 'x.png', '--time=1.5', '--json'), {
      values: { output: 'x.png', time: 1.5, json: true },
      rest: ['a.json'],
    });
    assert.deepEqual(parse('--media', 'a', 'doc', '--media=b').values.media, ['a', 'b']);
    assert.deepEqual(parse('--time', '-2', '-').rest, ['-'], 'a negative number is a value');
    assert.equal(parse('--time', '-2').values.time, -2);
    assert.deepEqual(parse('--', '--json').rest, ['--json']);
    assert.equal(parse('--output=a=b').values.output, 'a=b');
  });

  it('says what was expected', () => {
    const fails = (argv, message) =>
      assert.throws(
        () => parse(...argv),
        (err) => err instanceof UsageError && err.command === 'frame' && message.test(err.message),
      );
    fails(['--speed'], /"frame" has no option --speed\. It takes: --output, --time, --json/);
    fails(['-x'], /has no option -x/);
    fails(['--time'], /--time needs a value/);
    fails(['--time', ''], /--time must be a number, not ""/);
    fails(['--time', '1s'], /--time must be a number, not "1s"/);
    fails(['--preset', 'best'], /--preset must be one of: draft, high/);
    assert.throws(() => parseArgs(['-v'], {}, 'catalog'), /It takes no options/);
  });

  it('reads ranges and suggests commands', () => {
    assert.deepEqual(parseRange('5:12.5', 'render'), { start: 5, end: 12.5 });
    assert.deepEqual(parseRange(':10', 'render'), { start: 0, end: 10 });
    assert.deepEqual(parseRange(' 30 : ', 'render'), { start: 30, end: Infinity });
    for (const bad of ['', '5', '5-10', '10:5', '3:3', 'a:b', '1:2:3', '-1:4'])
      assert.throws(() => parseRange(bad, 'render'), UsageError, bad);
    const commands = ['render', 'frame', 'validate', 'catalog', 'help'];
    assert.equal(closest('rendr', commands), 'render');
    assert.equal(closest('Validat', commands), 'validate');
    assert.equal(closest('export', commands), '');
  });
});

describe('nearedit: reading a document', () => {
  it('finds where JSON goes wrong', () => {
    for (const text of [
      '{}',
      ' [1, 2.5e3, -0, true, null, "x\\n\\u00e9"] ',
      '"s"',
      '12',
      '{"a":{"b":[]}}',
    ]) {
      assert.doesNotThrow(() => JSON.parse(text));
      assert.equal(jsonErrorOffset(text), -1, text);
    }
    for (const [text, offset] of [
      ['{', 1],
      ['{"a":1,}', 7],
      ['[1,]', 3],
      ['{a:1}', 1],
      ['[1 2]', 3],
      ['{"a" 1}', 5],
      ['"abc', 0],
      ['{} x', 3],
      ['', 0],
      ["{'a':1}", 1],
      ['[01]', 2],
    ]) {
      assert.throws(() => JSON.parse(text), SyntaxError, text);
      assert.equal(jsonErrorOffset(text), offset, text);
    }
    assert.equal(lineAndColumn('{\n  "a": 1,\n}', 12), 'line 3, column 1');
    assert.equal(lineAndColumn('x', 0), 'line 1, column 1');
  });

  it('reports what loading repaired, pairing clips by id or by time', () => {
    const raw = {
      fps: '30',
      resolution: '640',
      colour: 'red',
      tracks: [
        {
          type: 'video',
          opacity: 3,
          clips: [
            { timelineStart: 5, timelineEnd: 7, text: { content: 'late', align: 'middle' } },
            {
              clipId: 'a',
              timelineStart: 0,
              timelineEnd: 2.004,
              text: { content: 'early' },
              fadeIn: 9,
            },
            { timelineEnd: 3, text: { content: 'no start' } },
          ],
        },
        'not a track',
      ],
    };
    const findings = repairFindings(raw, normalizeEdl(raw));
    const lines = findings.map((f) => `${f.path}: ${f.message}`);
    const errors = findings.filter((f) => f.level === 'error');
    assert.equal(errors.length, 2, 'what was dropped is an error');
    assert.ok(lines.every((line) => line.length > 0));
    const has = (pattern) =>
      assert.ok(
        lines.some((line) => pattern.test(line)),
        `${pattern}\n${lines.join('\n')}`,
      );
    has(/^fps: "30" was read as 30$/);
    has(/^resolution: "640" was read as "1920x1080"$/);
    has(/^colour: is not a field of the document and was ignored$/);
    has(/^tracks\[0\]\.opacity: 3 was read as 1$/);
    has(/^tracks\[0\]\.clips\[0\]\.text\.align: "middle" was read as "center"$/);
    has(/^tracks\[0\]\.clips\[1\]\.timelineEnd: 2\.004 was read as 2$/);
    has(/^tracks\[0\]\.clips\[1\]\.fadeIn: 9 was read as 2$/);
    has(/^tracks\[1\]: could not be used and was dropped \(a track is an object/);
    has(
      /^tracks\[0\]\.clips\[2\]: could not be used and was dropped \(a clip needs "timelineStart"/,
    );
    assert.ok(
      !lines.some((line) => /clips\[0\]\.timelineStart/.test(line)),
      'clips are paired by time',
    );
    const clean = normalizeEdl(raw);
    assert.deepEqual(repairFindings(clean, normalizeEdl(clean)), [], 'a normal document has none');
  });

  it('checks generators and effects against the catalog', () => {
    const edl = normalizeEdl({
      tracks: [
        {
          type: 'video',
          effects: [{ type: 'glow', params: { radius: 'big' } }],
          clips: [
            { timelineStart: 0, timelineEnd: 1, generator: { type: 'nope' } },
            {
              ...{ timelineStart: 1, timelineEnd: 2 },
              generator: {
                type: 'gradient',
                params: { angle: 720, kind: 'spiral', color1: '#abc' },
              },
              effects: [{ type: 'blur', params: { radius: 4 } }, { type: 'sparkle' }],
            },
          ],
        },
      ],
    });
    const found = catalogFindings(edl).map((f) => `${f.level} ${f.path}: ${f.message}`);
    const has = (pattern) =>
      assert.ok(
        found.some((line) => pattern.test(line)),
        `${pattern}\n${found.join('\n')}`,
      );
    has(
      /^error tracks\[0\]\.clips\[0\]\.generator\.type: unknown generator "nope" — one of: .*\bgradient\b/,
    );
    has(/^error tracks\[0\]\.clips\[1\]\.effects\[1\]\.type: unknown effect "sparkle" — one of: /);
    has(
      /^warning tracks\[0\]\.clips\[1\]\.generator\.params\.angle: 720 is not a usable number: \d+ is drawn$/,
    );
    has(
      /^warning tracks\[0\]\.clips\[1\]\.generator\.params\.kind: "spiral" is not a usable select: "\w+" is drawn$/,
    );
    has(
      /^warning tracks\[0\]\.effects\[0\]\.params\.radius: "big" is not a usable number: \d+ is drawn$/,
    );
    const errors = found.filter((line) => line.startsWith('error'));
    assert.equal(errors.length, 2, found.join('\n'));
  });
});
