import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BIN, createFixture, edit, film, probe, title } from './lib/testkit.js';

/** The command line: drawing frames and rendering. */

describe('nearedit command line: frame, render', () => {
  /** @type {ReturnType<typeof createFixture>} */
  let fixture;
  const cli = (...args) => fixture.cli(...args);
  const save = (name, document) => fixture.save(name, document);
  let root;
  let project;
  let elsewhere;

  before(() => {
    fixture = createFixture();
    ({ root, project, elsewhere } = fixture);
  });
  after(() => fixture.remove());

  it('draws single frames, footage included', () => {
    const doc = save('shot.json', edit());
    const shot = cli('frame', doc, '--time', '1.5');
    assert.equal(shot.code, 0, shot.err);
    assert.equal(shot.out, `${join(project, 'shot-1.5s.png')}\n`);
    const [png] = probe(join(project, 'shot-1.5s.png'));
    assert.deepEqual([png.codec_name, png.width, png.height], ['png', 320, 180]);
    const pixels = (path, w, h) => {
      const raw = spawnSync('ffmpeg', [
        '-v',
        'error',
        '-i',
        path,
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-',
      ]).stdout;
      return (x, y) => [...raw.subarray((y * w + x) * 3, (y * w + x) * 3 + 3)];
    };
    const at = pixels(join(project, 'shot-1.5s.png'), 320, 180);
    assert.ok(at(20, 20)[0] > 240 && at(20, 20)[2] < 12, `the footage is red: ${at(20, 20)}`);
    let white = 0;
    for (let x = 100; x < 220; x++) if (at(x, 90).every((v) => v > 230)) white++;
    assert.ok(white > 10, 'the title is drawn over it');
    const small = cli('frame', doc, '-t', '0', '--width', '160', '-o', join(root, 'out', 'first'));
    assert.equal(small.out, `${join(root, 'out', 'first.png')}\n`);
    const [half] = probe(join(root, 'out', 'first.png'));
    assert.deepEqual([half.width, half.height], [160, 90]);
    const late = cli('frame', doc, '--time', '12');
    assert.equal(late.code, 1);
    assert.match(late.err, /Time 12 is outside the timeline \(0 to 3 s\)/);
  });

  it('renders: progress on stderr, the path on stdout', () => {
    const doc = save('cut.json', edit());
    const done = cli('render', doc);
    assert.equal(done.code, 0, done.err);
    assert.equal(done.out, `${join(project, 'cut.mp4')}\n`, 'stdout is the path and nothing else');
    assert.match(done.err, /Encoding 90 frames in 3 segments, 1 drawn by the compositor/);
    assert.match(done.err, /rendering \d0%\n(.*\n)*rendering 90%\n/);
    const [video, audio] = probe(join(project, 'cut.mp4'));
    assert.deepEqual(
      [video.codec_name, video.width, video.height, Number(video.nb_read_frames)],
      ['h264', 320, 180, 90],
    );
    assert.equal(audio.codec_name, 'aac');
    const draft = cli(
      'render',
      doc,
      '--preset',
      'draft',
      '--range',
      '1:2',
      '-o',
      join(root, 'out', 'part.mp4'),
    );
    assert.equal(draft.out, `${join(root, 'out', 'part.mp4')}\n`);
    const [part] = probe(join(root, 'out', 'part.mp4'));
    assert.deepEqual([part.width, part.height, Number(part.nb_read_frames)], [160, 90, 30]);
    const hidden = readdirSync(project).filter((name) => name.startsWith('.nearedit-work-'));
    assert.deepEqual(hidden, [], 'the work folder is gone');
    const bad = cli('render', save('bad.json', edit(film(0, 3, 'media/nope.mp4'))));
    assert.equal(bad.code, 1);
    assert.match(bad.err, /error +tracks\[1\]\.clips\[0\]\.sourceFile: file not found/);
    assert.match(bad.err, /bad\.json cannot be rendered: 1 error\(s\) above/);
    assert.equal(bad.out, '');
    assert.equal(existsSync(join(project, 'bad.mp4')), false);
  });

  it('stops cleanly when interrupted', async () => {
    const big = edit(film(0, 4));
    big.resolution = '1920x1080';
    big.tracks[0].clips = [title(0, 4)];
    const doc = save('big.json', big);
    const child = spawn(process.execPath, [BIN, 'render', doc, '--preset', 'high'], {
      cwd: elsewhere,
    });
    let err = '';
    let interrupted = false;
    child.stderr.on('data', (chunk) => {
      err += chunk;
      if (!interrupted && /rendering 10%/.test(err)) interrupted = child.kill('SIGINT');
    });
    const code = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(code, 130, err);
    assert.match(err, /render cancelled/);
    assert.equal(existsSync(join(project, 'big.mp4')), false);
    assert.deepEqual(
      readdirSync(project).filter((name) => name.startsWith('.nearedit-work-')),
      [],
    );
    assert.ok(readFileSync(doc, 'utf8').length > 0);
  });
});
