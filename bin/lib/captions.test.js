import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFixture, film, probe, title } from './testkit.js';

/** Captions on the command line: validate, frame, render, captions, catalog. */

const WORDS = [
  { word: 'Hello', start: 0.5, end: 0.9 },
  { word: 'there,', start: 1, end: 1.4 },
  { word: 'everyone.', start: 1.5, end: 2.2 },
  { word: 'Welcome', start: 2.8, end: 3.2 },
  { word: 'back.', start: 3.3, end: 3.7 },
];

describe('nearedit: captions', () => {
  /** @type {ReturnType<typeof createFixture>} */
  let fx;
  /** The film with its sound on an audio track, captions on. */
  const spoken = (more = {}, clip = {}) => ({
    fps: 30,
    resolution: '320x180',
    tracks: [
      { type: 'video', clips: [film(0, 4)] },
      { type: 'audio', clips: [{ ...film(0, 4), captions: { on: true }, ...clip }] },
    ],
    ...more,
  });
  /** How many pixels of a PNG's lower half are light: letters (the film is pure red). */
  const white = (png) => {
    const raw = spawnSync(
      'ffmpeg',
      ['-v', 'error', '-i', png, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
      { maxBuffer: 1 << 26 },
    ).stdout;
    let count = 0;
    for (let i = raw.length / 2; i < raw.length; i += 3)
      if (raw[i + 1] > 120 && raw[i + 2] > 120) count++;
    return count;
  };

  before(() => {
    fx = createFixture();
    const media = join(fx.project, 'media', 'film.mp4');
    // The transcript beside the file, as the server's transcriber leaves it.
    const sidecar = { transcript: WORDS, segments: [], _sourceMtime: statSync(media).mtimeMs };
    writeFileSync(`${media}.nearedit.json`, JSON.stringify(sidecar));
  });
  after(() => fx.remove());

  it('validate accepts a captioned document and says which renderer draws it', () => {
    const file = fx.save(
      'spoken.json',
      spoken({ captions: { style: { preset: 'pop', size: 9 } } }),
    );
    const done = fx.cli('validate', file, '--json');
    const report = JSON.parse(done.out);
    assert.equal(done.code, 0, done.out + done.err);
    assert.deepEqual([report.valid, report.errors, report.warnings], [true, [], []]);
    assert.deepEqual(
      report.segments.map((s) => [s.engine, s.reasons]),
      [['canvas', ['captions']]],
    );
  });

  it('validate warns for a captioned clip with no words to be found', () => {
    const sea = { ...film(0, 4, '../library/sea.mp4'), captions: { on: true } };
    const doc = spoken();
    doc.tracks.push({ type: 'audio', clips: [sea] });
    const done = fx.cli('validate', fx.save('wordless.json', doc), '--media', fx.library);
    assert.equal(done.code, 0, done.out + done.err);
    const lines = done.out.split('\n');
    assert.equal(lines.filter((line) => line.startsWith('warning')).length, 1, done.out);
    assert.match(
      lines[0],
      /^warning tracks\[2\]\.clips\[0\]\.captions: captions are on, but .*sea\.mp4 has no transcript beside it \(.*sea\.mp4\.nearedit\.json\) and the clip carries no words: it is rendered without captions$/,
    );
    assert.match(lines[lines.length - 2], /valid — .*\(1 warning\)$/);
  });

  it('validate says what it repaired in captions, one line each', () => {
    const words = [[2, 2.5, 'b'], { start: 1, end: 1.5, word: 'a' }, 'junk', [0, 1]];
    const doc = spoken(
      {
        captions: {
          style: { preset: 'vapor', size: 99, glitter: 1, group: { words: 2 } },
          mood: 'x',
        },
      },
      { captions: { on: 'yes', words } },
    );
    doc.tracks[0].clips.push({ ...title(5, 6), captions: { on: true } });
    doc.tracks[1].clips.push({ ...film(5, 6), sourceIn: 0, captions: { on: false } });
    const done = fx.cli('validate', fx.save('repaired.json', doc));
    assert.equal(done.code, 0, done.out + done.err);
    const said = done.out.split('\n').filter((line) => /captions/.test(line));
    assert.deepEqual(said, [
      'warning captions.mood: is not a field of the document',
      'warning captions.style.preset: "vapor" was read as "clean"',
      'warning captions.style.size: 99 was read as 20',
      'warning captions.style.glitter: is not a field of a caption style',
      'warning tracks[0].clips[1].captions: only a clip that plays video or sound has captions: ignored',
      'warning tracks[1].clips[0].captions.on: "yes" was read as false',
      'warning tracks[1].clips[0].captions.words: has 4 entries, 2 were usable ([start, end, "text"])',
    ]);
  });

  it('frame draws the caption of that moment from the sidecar beside the media', () => {
    const file = fx.save('frame.json', spoken());
    const at = (time, name) => {
      const done = fx.cli('frame', file, '--time', String(time), '-o', join(fx.root, name));
      assert.equal(done.code, 0, done.err);
      return white(done.out.trim());
    };
    assert.equal(at(0.3, 'before.png'), 0, 'no word yet');
    const saying = at(1.2, 'saying.png');
    assert.ok(saying > 30, `a caption while a word is said: ${saying} light pixels`);
    const plain = spoken();
    delete plain.tracks[1].clips[0].captions;
    const done = fx.cli(
      'frame',
      fx.save('plain.json', plain),
      '-t',
      '1.2',
      '-o',
      join(fx.root, 'plain.png'),
    );
    assert.equal(white(done.out.trim()), 0, 'and none without captions');
  });

  it('render draws the captions into the video', () => {
    const file = fx.save('render.json', spoken());
    const out = join(fx.root, 'spoken.mp4');
    const done = fx.cli('render', file, '--preset', 'draft', '-o', out);
    assert.equal(done.code, 0, done.err);
    assert.match(done.err, /drawn by the compositor/);
    assert.equal(probe(out)[0].nb_read_frames, '120');
    const shot = (time, name) => {
      const png = join(fx.root, name);
      spawnSync('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-ss',
        String(time),
        '-i',
        out,
        '-frames:v',
        '1',
        png,
      ]);
      return white(png);
    };
    assert.equal(shot(0.2, 'r-before.png'), 0);
    const saying = shot(1.2, 'r-saying.png');
    assert.ok(saying > 5, `${saying} light pixels at half size`);
  });

  it('captions writes the subtitle file, as phrases or as drawn', () => {
    const file = fx.save('subs.json', spoken());
    const done = fx.cli('captions', file);
    assert.equal(done.code, 0, done.err);
    assert.equal(done.out.trim(), join(fx.project, 'subs.srt'));
    assert.equal(
      readFileSync(done.out.trim(), 'utf8'),
      '1\n00:00:00,500 --> 00:00:02,500\nHello there, everyone.\n\n2\n00:00:02,800 --> 00:00:04,000\nWelcome back.\n',
    );
    const drawn = fx.cli(
      'captions',
      file,
      '--as',
      'drawn',
      '-o',
      join(fx.root, 'out', 'drawn.vtt'),
    );
    assert.equal(drawn.code, 0, drawn.err);
    const text = readFileSync(join(fx.root, 'out', 'drawn.vtt'), 'utf8');
    assert.match(
      text,
      /^WEBVTT\n\n00:00:00\.500 --> 00:00:01\.500\nHello there,\n\n00:00:01\.500 --> /,
    );
    const vtt = fx.cli('captions', file, '--format', 'vtt');
    assert.equal(vtt.out.trim(), join(fx.project, 'subs.vtt'));
  });

  it('reads the sidecar beside media in a --media folder, and none outside what is allowed', () => {
    const sea = join(fx.library, 'sea.mp4');
    const transcript = [{ word: 'Waves.', start: 1, end: 2 }];
    const sidecar = { transcript, segments: [], _sourceMtime: statSync(sea).mtimeMs };
    writeFileSync(`${sea}.nearedit.json`, JSON.stringify(sidecar));
    const doc = spoken();
    doc.tracks[1].clips = [{ ...film(0, 4, sea), captions: { on: true } }];
    const file = fx.save('sea.json', doc);
    const done = fx.cli('captions', file, '--media', fx.library, '-o', join(fx.root, 'sea.srt'));
    assert.equal(done.code, 0, done.err);
    assert.match(readFileSync(join(fx.root, 'sea.srt'), 'utf8'), /\nWaves\.\n/);
    const shut = fx.cli('captions', file);
    assert.equal(shut.code, 1, 'outside the document’s folder: its sidecar is not opened');
    assert.match(shut.err, /sea\.mp4 is outside the document's folder/);
    assert.match(shut.err, /has no captions to write/);
    rmSync(`${sea}.nearedit.json`);
  });

  it('captions says so when there is nothing to write, and how it is used', () => {
    const plain = spoken();
    delete plain.tracks[1].clips[0].captions;
    const none = fx.cli('captions', fx.save('none.json', plain));
    assert.equal(none.code, 1);
    assert.match(none.err, /has no captions to write/);
    assert.equal(existsSync(join(fx.project, 'none.srt')), false);
    const usage = fx.cli('captions', fx.save('x.json', spoken()), '--format', 'ass');
    assert.equal(usage.code, 2);
    assert.match(usage.err, /--format must be one of: srt, vtt/);
    assert.match(usage.err, /nearedit captions <edl\.json>/);
    assert.equal(fx.cli('captions').code, 2);
  });

  it('catalog lists the caption presets', () => {
    const text = fx.cli('catalog').out;
    assert.match(text, /Caption presets — /);
    assert.match(text, /\n {2}karaoke +A whole phrase/);
    const all = JSON.parse(fx.cli('catalog', '--json').out);
    assert.deepEqual(
      all.captions.presets.map((preset) => preset.id),
      ['clean', 'pop', 'karaoke', 'boxed', 'minimal'],
    );
    assert.equal(all.captions.presets[1].style.case, 'upper');
    assert.equal(all.captions.style['highlight.mode'].type, 'select');
  });

  it('a document font whose file is missing is a warning, not an error', () => {
    const fonts = [
      { family: 'House Sans', weight: 700, style: 'normal', file: 'fonts/gone.woff2' },
    ];
    const doc = spoken({ fonts, captions: { style: { font: { family: 'House Sans' } } } });
    const file = fx.save('fontless.json', doc);
    const done = fx.cli('validate', file);
    assert.equal(done.code, 0, done.out + done.err);
    assert.match(
      done.out,
      /^warning fonts\[0\]\.file: font file not found: fonts\/gone\.woff2 — its text is drawn in the bundled sans-serif$/m,
    );
    const frame = fx.cli('frame', file, '-t', '1.2', '-o', join(fx.root, 'fontless.png'));
    assert.equal(frame.code, 0, frame.err);
    assert.ok(white(frame.out.trim()) > 30, 'drawn in the fallback');
    rmSync(join(fx.root, 'fontless.png'));
  });
});
