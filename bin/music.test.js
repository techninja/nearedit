import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { encodeWav, renderSong, songKey } from '#utils/music/index.js';
import { readAudio } from '../src/api/render/testkit.js';
import * as kit from '../tests/music/serverKit.js';
import { withProgress } from './lib/musicRender.js';
import { BIN, createFixture, film, probe } from './lib/testkit.js';

/**
 * The command line and music: `music` renders one song, and `render`,
 * `frame` and `validate` treat a document's music clips like its web clips
 * — except that the missing renderings can always be made.
 */

const { KICK_HAT } = kit;

describe('nearedit command line: music', () => {
  /** @type {ReturnType<typeof createFixture>} */
  let fixture;
  let project;
  const cli = (...args) => fixture.cli(...args);
  const save = (name, content) => fixture.save(name, content);
  const wav = (song) => Buffer.from(encodeWav(renderSong(song)));
  const rendering = (folder, song) => join(folder, '.nearedit', 'music', `${songKey(song)}.wav`);
  /** Footage for three seconds over a song of five. */
  const document = (song, more = {}) => ({
    fps: 30,
    resolution: '320x180',
    tracks: [
      { type: 'video', clips: [film(0, 3)] },
      { type: 'audio', clips: [{ timelineStart: 0, music: { song }, ...more }] },
    ],
  });

  before(() => {
    fixture = createFixture();
    ({ project } = fixture);
  });
  after(() => {
    assert.deepEqual(kit.debris(project), [], 'nothing but renderings in the music folder');
    assert.deepEqual(readdirSync(fixture.elsewhere), [], 'nothing where the tool was run from');
    fixture.remove();
  });

  it('renders a song: the path on stdout, what it does on stderr', () => {
    const file = save('beat.json', KICK_HAT);
    const done = cli('music', file);
    assert.equal(done.code, 0, done.err);
    assert.equal(done.out, `${join(project, 'beat.wav')}\n`, 'stdout is the path and nothing else');
    assert.match(done.err, /^rendering beat\.json \(5 s of music\)\n(music \d0%\n)*$/);
    assert.ok(
      readFileSync(join(project, 'beat.wav')).equals(wav(KICK_HAT)),
      "the engine's samples",
    );
    assert.deepEqual(readdirSync(project).sort(), ['beat.json', 'beat.wav', 'media']);
    const named = cli('music', file, '-o', join(fixture.root, 'out', 'take'));
    assert.equal(named.out, `${join(fixture.root, 'out', 'take.wav')}\n`);
    assert.ok(readFileSync(join(fixture.root, 'out', 'take.wav')).equals(wav(KICK_HAT)));
    assert.deepEqual(readdirSync(join(fixture.root, 'out')), ['take.wav']);

    const mp3 = cli('music', file, '-o', 'beat.mp3');
    assert.equal(mp3.code, 2);
    assert.match(
      mp3.err,
      /^nearedit: music writes WAV files: name the output beat\.wav\.\n\nnearedit music/,
    );
    assert.deepEqual([cli('music').code, cli('music', file, '--fps', '3').code], [2, 2]);
    assert.match(cli('help', 'music').out, /^nearedit music <song\.json> \[-o out\.wav\]\n/);
    assert.match(cli('help').out, /\n {2}nearedit music {4}<song\.json> \[-o out\.wav\]\n/);
    assert.match(cli('help', 'render').out, /Music clips without a rendering are rendered first/);
    assert.match(cli('musik').err, /Unknown command "musik"\. Did you mean "music"\?/);
  });

  it('says what is wrong with a song, with its place', () => {
    const bad = {
      bpm: 900,
      parts: [
        { kind: 'drums', kit: '707', lanes: { kick: 'X..Q' } },
        { kind: 'synth', notes: [[0, 1, 'H9']] },
      ],
    };
    const done = cli('music', save('bad.json', bad));
    assert.deepEqual([done.code, done.out], [1, '']);
    assert.match(done.err, /^error {3}bpm: 900 must be a number 40\.\.240\n/);
    assert.match(done.err, /\nerror {3}parts\[0\]\.kit: "707" is not a kit: use one of 808, 909/);
    assert.match(done.err, /\nerror {3}parts\[1\]\.notes\[0\]: "H9" is not a pitch/);
    assert.match(done.err, /bad\.json cannot be rendered: 4 error\(s\) above\n$/);
    assert.equal(existsSync(join(project, 'bad.wav')), false);
    assert.match(
      cli('music', save('list.json', '[1, 2]')).err,
      /error {3}a song is an object like/,
    );
    assert.match(
      cli('music', save('cut.json', '{ "bpm": ')).err,
      /cut\.json is not valid JSON \(line 1/,
    );
    assert.match(cli('music', join(project, 'none.json')).err, /none\.json: no such file\n$/);
  });

  it('is quiet about a quick render and shows how far a long one is', async () => {
    const said = [];
    const io = { out: () => {}, err: (line) => void said.push(line) };
    const result = await withProgress(
      'slow.json',
      { bars: 30 },
      async (hooks) => {
        assert.equal(hooks.timeoutMs, 0, 'the command line renders as long as it takes');
        for (const done of [10, 20, 30]) hooks.onProgress(done, 100);
        await kit.sleep(1050);
        for (const done of [35, 40, 41, 79, 80, 100]) hooks.onProgress(done, 100);
        return 'made';
      },
      io,
    );
    assert.equal(result, 'made');
    assert.deepEqual(said, [
      'rendering slow.json (62 s of music)',
      'music 40%',
      'music 70%',
      'music 80%',
    ]);
  });

  it('stops cleanly when interrupted', async () => {
    const file = save('heavy.json', kit.heavy(8));
    const child = spawn(process.execPath, [BIN, 'music', file], { cwd: fixture.elsewhere });
    let err = '';
    child.stderr.on('data', (chunk) => (err += chunk));
    for (let i = 0; i < 400 && !readdirSync(project).some((name) => name.endsWith('.part')); i++)
      await kit.sleep(10);
    child.kill('SIGINT');
    const code = await new Promise((done) => child.on('close', done));
    assert.equal(code, 130, err);
    assert.match(
      err,
      /^rendering heavy\.json \(17 s of music\)\n(music \d0%\n)*music render cancelled\n$/,
    );
    assert.deepEqual(
      readdirSync(project).filter((name) => /heavy\.wav/.test(name)),
      [],
      'no file, whole or partial',
    );
  });

  it('validates a document with music clips without rendering anything', () => {
    // Written by hand: lanes spaced for the eye, a note by name, a velocity left out.
    const song = {
      bars: 2,
      tail: 1,
      parts: [
        { kind: 'drums', kit: '909', bars: 1, lanes: { kick: 'X... .... | x... ....' } },
        {
          kind: 'synth',
          preset: 'bass',
          bars: 2,
          notes: [
            [0, 1, 'A1'],
            [4, 1, 36, 0.9],
          ],
        },
      ],
    };
    const good = cli('validate', save('score.json', document(song)));
    assert.equal(good.code, 0, good.out);
    assert.equal(
      good.out,
      'warning tracks[1].clips[0].music: music clip not rendered yet: "nearedit render" and "frame" render it first\n' +
        `${join(project, 'score.json')}: valid — 320x180 at 30 fps, 5 s, 2 clips (1 warning)\n`,
    );
    assert.equal(existsSync(join(project, '.nearedit')), false, 'nothing was rendered');
    // Music and nothing else: it will be sound once `render` has rendered it.
    const only = { fps: 30, resolution: '320x180', tracks: [document(song).tracks[1]] };
    const alone = cli('validate', save('only.json', only));
    assert.equal(alone.code, 0, alone.out);
    assert.match(alone.out, /^warning tracks\[0\]\.clips\[0\]\.music: music clip not rendered yet/);
    assert.match(alone.out, /only\.json: valid — 320x180 at 30 fps, 5 s, 1 clip \(1 warning\)\n$/);

    const wrong = {
      ...song,
      bpmm: 90,
      parts: [
        { ...song.parts[0], kit: '707' },
        { kind: 'synth', notes: [[0, 1, 'H9']] },
      ],
    };
    const bad = cli('validate', save('wrong.json', document(wrong)), '--json');
    assert.equal(bad.code, 1);
    const report = JSON.parse(bad.out);
    assert.deepEqual(
      report.errors.map((error) => error.path),
      [
        'tracks[1].clips[0].music.song.parts[0].kit',
        'tracks[1].clips[0].music.song.parts[1].notes[0]',
      ],
    );
    assert.match(report.errors[0].message, /"707" is not a kit/);
    assert.deepEqual(
      report.warnings.map((warning) => warning.path),
      ['tracks[1].clips[0].music.song.bpmm', 'tracks[1].clips[0].music'],
    );
    assert.match(report.warnings[0].message, /is not a field of the document and was ignored/);
    const refused = cli('render', join(project, 'wrong.json'));
    assert.equal(refused.code, 1);
    assert.match(refused.err, /wrong\.json cannot be rendered: 2 error\(s\) above\n$/);
    assert.equal(existsSync(join(project, '.nearedit')), false, 'and still nothing was rendered');
  });

  it('renders the music clips of a document before rendering it or drawing a frame', async () => {
    const file = save('cut.json', document(KICK_HAT));
    const done = cli('render', file);
    assert.equal(done.code, 0, done.err);
    assert.match(done.err, /^rendering music: 909 drums \(5 s of music\)\n/);
    assert.ok(
      readFileSync(rendering(project, KICK_HAT)).equals(wav(KICK_HAT)),
      'beside the document',
    );
    const [video, audio] = probe(join(project, 'cut.mp4'));
    assert.deepEqual(
      [video.codec_name, video.nb_read_frames, audio.codec_name],
      ['h264', '150', 'aac'],
    );
    // The film has no sound: what is heard is the song — a kick, a hat at 2 s, silence between.
    const { left } = await readAudio(join(project, 'cut.mp4'));
    assert.ok(kit.level(left, 0, 0.2) > 0.1 && kit.brightness(left, 0.02, 0.2) < 250, 'the kick');
    assert.ok(kit.level(left, 2, 2.06) > 0.004 && kit.brightness(left, 2, 2.06) > 3000, 'the hat');
    assert.ok(kit.level(left, 0.8, 1.95) < 0.001 && kit.level(left, 2.5, 4.95) < 0.001, 'silence');
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), document(KICK_HAT), 'not rewritten');

    const again = cli('render', file, '--range', '0:1', '-o', join(fixture.root, 'out', 'again'));
    assert.equal(again.code, 0, again.err);
    assert.doesNotMatch(again.err, /music/, 'the rendering is there: nothing to make');
    assert.match(
      cli('validate', file).out,
      /cut\.json: valid — 320x180 at 30 fps, 5 s, 2 clips\n$/,
    );
    // A changed song is another rendering; `frame` makes it like `render` does.
    const faster = { ...KICK_HAT, bpm: 150 };
    const moved = { sourceFile: rendering(project, KICK_HAT), placeholder: false };
    const stale = document(faster, moved);
    stale.tracks[1].clips[0].music.key = songKey(KICK_HAT);
    const shot = cli('frame', save('cut.json', stale), '--time', '1');
    assert.equal(shot.code, 0, shot.err);
    assert.match(shot.err, /^rendering music: 909 drums \(4\.2 s of music\)\n(music \d0%\n)*$/);
    assert.ok(readFileSync(rendering(project, faster)).equals(wav(faster)));
    assert.equal(readdirSync(join(project, '.nearedit', 'music')).length, 2, 'the old one stays');
  });

  it('finds a rendering in a --media folder, as a project keeps them', async () => {
    const away = join(fixture.root, 'away');
    mkdirSync(join(away, 'media'), { recursive: true });
    copyFileSync(join(project, 'media', 'film.mp4'), join(away, 'media', 'film.mp4'));
    const file = join(away, 'cut.json');
    copyFileSync(save('copy.json', document(KICK_HAT)), file);
    assert.match(cli('validate', file).out, /music clip not rendered yet/);
    const found = cli('validate', file, '--media', project);
    assert.match(found.out, /cut\.json: valid — 320x180 at 30 fps, 5 s, 2 clips\n$/);
    const done = cli('render', file, '--media', project, '--range', '0:1');
    assert.equal(done.code, 0, done.err);
    assert.doesNotMatch(done.err, /music/, 'found: nothing was rendered');
    assert.equal(existsSync(join(away, '.nearedit')), false);
    const { left } = await readAudio(join(away, 'cut.mp4'));
    assert.ok(kit.level(left, 0, 0.2) > 0.1, 'and the render plays it');
  });
});
