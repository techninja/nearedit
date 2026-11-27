import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFixture, edit, film } from './lib/testkit.js';

/** The command line: help, mistakes, the catalog, and checking a document. */

describe('nearedit command line: help, catalog, validate', () => {
  /** @type {ReturnType<typeof createFixture>} */
  let fixture;
  const cli = (...args) => fixture.cli(...args);
  const save = (name, document) => fixture.save(name, document);
  let root;
  let project;

  before(() => {
    fixture = createFixture();
    ({ root, project } = fixture);
  });
  after(() => fixture.remove());

  it('explains itself, and says what was wrong with a command it does not understand', () => {
    for (const args of [[], ['help'], ['--help'], ['-h']]) {
      const { code, out } = cli(...args);
      assert.equal(code, 0);
      assert.match(out, /nearedit render +<edl\.json>.*\n +nearedit frame +<edl\.json> --time/);
      assert.match(out, /Exit codes: 0 done/);
    }
    assert.match(cli('help', 'frame').out, /^nearedit frame <edl\.json> --time <seconds>/);
    assert.match(cli('render', '--help').out, /--preset <name>/);
    const typo = cli('rendr', 'x.json');
    assert.equal(typo.code, 2);
    assert.match(typo.err, /Unknown command "rendr"\. Did you mean "render"\?/);
    assert.equal(typo.out, '');
    assert.match(cli('fly').err, /Unknown command "fly"\.\n\nRun "nearedit help"/);
    assert.equal(cli('help', 'nope').code, 2);
    const cases = [
      [['render'], /render takes one document/],
      [['render', 'a.json', 'b.json'], /render takes one document/],
      [
        ['render', 'a.json', '--speed', '2'],
        /"render" has no option --speed\. It takes: --output, --preset/,
      ],
      [['render', 'a.json', '--preset', 'ultra'], /--preset must be one of: draft, standard, high/],
      [['render', 'a.json', '--range', 'soon'], /--range must look like start:end/],
      [['render', 'a.json', '--range', '5:2'], /start before end/],
      [['render', 'a.json', '-o'], /--output needs a value/],
      [['frame', 'a.json'], /frame needs --time <seconds>/],
      [['frame', 'a.json', '--time', 'now'], /--time must be a number, not "now"/],
      [
        ['frame', 'a.json', '--time', '1', '--width', '7'],
        /--width must be a whole number of pixels/,
      ],
      [['validate'], /validate takes one document/],
      [['catalog', 'all'], /catalog takes no arguments/],
    ];
    for (const [args, message] of cases) {
      const { code, err, out } = cli(...args);
      assert.equal(code, 2, args.join(' '));
      assert.match(err, message);
      assert.match(err, new RegExp(`\\nnearedit ${args[0]} `), 'the usage of the command follows');
      assert.equal(out, '');
    }
  });

  it('prints the catalog, readable or as JSON', () => {
    const text = cli('catalog');
    assert.equal(text.code, 0);
    assert.match(text.out, /^Generators/);
    assert.match(text.out, /\n {2}gradient — Gradient/);
    assert.match(text.out, /\n {4}radius +number 0\.\.\d+ px +=/);
    assert.match(text.out, /Blend modes[^\n]*\n {2}normal, add, screen/);
    assert.match(text.out, /Easings[^\n]*\n {2}linear, /);
    assert.match(text.out, /Fonts[^\n]*\n {2}Inter/);
    const all = JSON.parse(cli('catalog', '--json').out);
    // The catalog grows as generators and effects are added: these it always has.
    for (const part of [
      'generators',
      'effects',
      'blendModes',
      'easings',
      'textAnimations',
      'fonts',
    ])
      assert.ok(Array.isArray(all[part]) && all[part].length > 0, part);
    assert.equal(all.generators.find((g) => g.type === 'solid').params.color.type, 'color');
    assert.ok(all.effects.some((fx) => fx.type === 'blur') && all.fonts.length >= 5);
  });

  it('validates: errors and warnings with their place, and the exit code says which', () => {
    const good = cli('validate', save('good.json', edit()));
    assert.equal(good.code, 0, good.out + good.err);
    assert.match(good.out, /good\.json: valid — 320x180 at 30 fps, 3 s, 2 clips\n$/);
    const report = JSON.parse(cli('validate', save('good.json', edit()), '--json').out);
    assert.equal(report.valid, true);
    assert.deepEqual(
      [report.duration, report.clips, report.media, report.errors.length],
      [3, 2, 1, 0],
    );
    assert.deepEqual(
      report.segments.map((s) => [s.start, s.end, s.engine]),
      [
        [0, 1, 'ffmpeg'],
        [1, 2, 'canvas'],
        [2, 3, 'ffmpeg'],
      ],
    );

    const sloppy = edit();
    sloppy.tracks[0].clips[0].blendMode = 'glow';
    sloppy.tracks[0].clips[0].wobble = 3;
    sloppy.tracks[1].clips[0].timelineEnd = 3.01;
    const warned = cli('validate', save('sloppy.json', sloppy));
    assert.equal(warned.code, 0, 'repairs are warnings');
    assert.match(
      warned.out,
      /warning tracks\[0\]\.clips\[0\]\.blendMode: "glow" was read as "normal"/,
    );
    assert.match(
      warned.out,
      /warning tracks\[0\]\.clips\[0\]\.wobble: is not a field of the document/,
    );
    assert.match(warned.out, /warning tracks\[1\]\.clips\[0\]\.timelineEnd: 3\.01 was read as 3\n/);
    assert.match(warned.out, /valid — .* \(3 warnings\)\n$/);

    const broken = edit(film(0, 9, 'media/nope.mp4'));
    broken.tracks[0].clips.push({
      timelineStart: 4,
      timelineEnd: 5,
      generator: { type: 'gradiant' },
    });
    broken.tracks[0].clips.push({
      ...{ timelineStart: 5, timelineEnd: 6 },
      generator: { type: 'solid', params: { colour: '#ff0000' } },
      effects: [{ type: 'blurr' }],
    });
    const bad = cli('validate', save('broken.json', broken));
    assert.equal(bad.code, 1);
    assert.match(
      bad.out,
      /error +tracks\[1\]\.clips\[0\]\.sourceFile: file not found: media\/nope\.mp4/,
    );
    assert.match(
      bad.out,
      /error +tracks\[0\]\.clips\[1\]\.generator\.type: unknown generator "gradiant" — one of: .*\bgradient\b/,
    );
    assert.match(
      bad.out,
      /error +tracks\[0\]\.clips\[2\]\.effects\[0\]\.type: unknown effect "blurr"/,
    );
    assert.match(
      bad.out,
      /warning tracks\[0\]\.clips\[2\]\.generator\.params\.colour: "solid" has no such parameter \(it has: .*\bcolor\b/,
    );
    assert.match(bad.out, /broken\.json: invalid — .*\(3 errors, 1 warning\)\n$/);
    assert.equal(
      JSON.parse(cli('validate', save('broken.json', broken), '--json').out).errors.length,
      3,
    );

    const long = cli('validate', save('long.json', edit(film(0, 6))));
    assert.equal(long.code, 0);
    assert.match(
      long.out,
      /warning tracks\[1\]\.clips\[0\]\.sourceOut: exceeds the source duration.*last frame is held/,
    );
    for (const [name, text, message] of [
      [
        'syntax.json',
        '{ "tracks": [\n  { "type": "video" },\n]}',
        /not valid JSON \(line 3, column 1\)/,
      ],
      ['list.json', '{ "clips": [] }', /is not a timeline document: it needs a "tracks" array/],
      ['empty.json', '{ "tracks": [] }', /error +Timeline is empty: there is nothing to render/],
    ]) {
      const { code, out, err } = cli('validate', save(name, text));
      assert.equal(code, 1, name);
      assert.match(out + err, message);
    }
    assert.match(
      cli('validate', join(project, 'missing.json')).err,
      /Cannot read .*missing\.json: no such file/,
    );
  });

  it('reads media only from the document folder and the --media folders', () => {
    const sea = join(root, 'library', 'sea.mp4');
    const away = save('away.json', edit(film(0, 3, sea)));
    const refused = cli('validate', away);
    assert.equal(refused.code, 1);
    assert.match(
      refused.out,
      /sourceFile: .*sea\.mp4 is outside the document's folder — allow its folder with --media <dir>/,
    );
    assert.equal(cli('render', away).code, 1, 'and nothing is rendered');
    assert.equal(cli('validate', away, '--media', join(root, 'library')).code, 0);
    const climbing = cli('validate', save('climb.json', edit(film(0, 3, '../library/sea.mp4'))));
    assert.equal(climbing.code, 1, 'a relative path cannot climb out either');
    const named = cli(
      'validate',
      save('named.json', edit(film(0, 3, 'sea.mp4'))),
      '--media',
      join(root, 'library'),
    );
    assert.equal(named.code, 0, 'a relative name is also looked up in the --media folders');
    assert.match(
      cli('validate', away, '--media', join(root, 'nowhere')).err,
      /--media .*nowhere: no such folder/,
    );
  });
});
