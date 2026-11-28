import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIN, createFixture, film, probe } from './testkit.js';

/**
 * The person cutout on the command line: validate knows the field and says
 * when a cutout is missing, `cutout` makes it with the server's pipeline (a
 * fake matte program answers an ellipse in the middle of the picture),
 * frame and render find the file beside the document and draw through it.
 */

const FAKE = fileURLToPath(new URL('../../tests/cutout/fakeMatte.js', import.meta.url));
const KEY = /^[0-9a-f]{20}\.mp4$/;

describe('nearedit: person cutout', () => {
  /** @type {ReturnType<typeof createFixture>} */
  let fx;
  /** The red film, cut out, over green. */
  const edit = (clip = {}, cutout = { on: true }) => ({
    fps: 30,
    resolution: '320x180',
    tracks: [
      { type: 'video', clips: [{ ...film(0, 2), sourceIn: 1, cutout, ...clip }] },
      {
        type: 'video',
        clips: [
          {
            ...{ timelineStart: 0, timelineEnd: 2 },
            generator: { type: 'solid', params: { color: '#00ff00' } },
          },
        ],
      },
    ],
  });
  /** Run the tool as a user does, with a matte program of our own (or none). */
  const cli = (args, command = `"${process.execPath}" "${FAKE}"`) => {
    const env = { ...process.env, CUTOUT_COMMAND: command, CUTOUT_MODEL: '/nowhere/model.onnx' };
    const done = spawnSync(process.execPath, [BIN, ...args], {
      ...{ cwd: fx.elsewhere, encoding: 'utf8', env },
    });
    return { code: done.status, out: done.stdout, err: done.stderr };
  };
  /** `[r, g, b]` of a pixel of a picture file (a PNG, or the first frame of a video). */
  const pixel = (file, x, y) => {
    const args = ['-v', 'error', '-i', file, '-frames:v', '1', '-f', 'rawvideo'];
    const raw = spawnSync('ffmpeg', [...args, '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
    const i = (y * 320 + x) * 3;
    return [...raw.stdout.subarray(i, i + 3)];
  };
  const red = ([r, g]) => r > 180 && g < 80;
  const green = ([r, g]) => g > 180 && r < 80;
  const cutouts = () => join(fx.project, '.nearedit', 'cutout');

  before(() => (fx = createFixture()));
  after(() => fx.remove());

  it('validate knows the field and says that the cutout is not made', () => {
    const file = fx.save('me.json', edit());
    const done = cli(['validate', file, '--json']);
    const report = JSON.parse(done.out);
    assert.equal(done.code, 0, done.out + done.err);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, [
      {
        path: 'tracks[0].clips[0].cutout',
        message:
          'person cutout not made yet: the clip is drawn with its background — "nearedit cutout" makes it',
      },
    ]);
    assert.deepEqual(report.segments[0].reasons, ['generator'], 'drawn without the matte');
    // A value out of range is repaired and said; a field that is none is named.
    const odd = fx.save('odd.json', edit({}, { on: true, feather: 99, glow: 1 }));
    const text = cli(['validate', odd]).out;
    assert.match(text, /clips\[0\]\.cutout\.feather: 99 was read as 5/);
    assert.match(text, /clips\[0\]\.cutout\.glow: is not a field/);
    // A cutout on something that is no video is not kept.
    const still = edit();
    still.tracks[1].clips[0].cutout = { on: true };
    assert.match(cli(['validate', fx.save('still.json', still)]).out, /clips\[0\]\.cutout: is not/);
  });

  it('frame and render draw the plain picture while the cutout is missing', () => {
    const file = fx.save('me.json', edit());
    const png = join(fx.root, 'plain.png');
    const done = cli(['frame', file, '--time', '1', '-o', png]);
    assert.equal(done.code, 0, done.err);
    assert.match(done.err, /person cutout not made yet/);
    assert.ok(red(pixel(png, 10, 10)) && red(pixel(png, 160, 90)), 'the whole film');
  });

  it('cutout says what is missing when there is no matte program', () => {
    const file = fx.save('me.json', edit());
    const done = cli(['cutout', file], '');
    assert.equal(done.code, 1, done.out + done.err);
    assert.match(done.err, /^nearedit: No cutout can be made: .*install-cutout/m);
    assert.equal(existsSync(cutouts()), false, 'nothing was written');
    assert.equal(cli(['cutout']).code, 2, 'a document is required');
    assert.match(cli(['help', 'cutout']).out, /^nearedit cutout <edl\.json>/);
  });

  it('cutout makes the missing file beside the document, once', () => {
    const file = fx.save('me.json', edit());
    const done = cli(['cutout', file]);
    assert.equal(done.code, 0, done.out + done.err);
    const made = done.out.trim();
    assert.equal(made.startsWith(cutouts()), true, made);
    // 1 … 3 s of the film are used: with a second of margin each side, 0 … 4 s.
    assert.match(done.err, /cutting out film\.mp4: 0–4 s, 120 frames/);
    const names = readdirSync(cutouts()).sort();
    assert.equal(names.length, 2, `the file and its description: ${names}`);
    assert.match(names[1], KEY);
    const [video] = probe(made);
    assert.deepEqual([video.width, video.height, Number(video.nb_read_frames)], [640, 180, 120]);
    const again = cli(['cutout', file]);
    assert.deepEqual([again.code, again.out], [0, '']);
    assert.match(again.err, /every cutout is made/);
    const off = fx.save('off.json', edit({}, { on: false }));
    assert.match(cli(['cutout', off]).err, /no clip has "cutout" on/);
  });

  it('validate, frame and render then draw the person alone', () => {
    const file = fx.save('me.json', edit());
    const report = JSON.parse(cli(['validate', file, '--json']).out);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(report.segments[0].reasons, ['cutout', 'generator']);
    assert.equal(report.media, 1, 'the cutout file is not counted with the media');
    const png = join(fx.root, 'cut.png');
    const frame = cli(['frame', file, '--time', '1', '-o', png]);
    assert.equal(frame.code, 0, frame.err);
    assert.ok(red(pixel(png, 160, 90)), `the person in the middle: ${pixel(png, 160, 90)}`);
    assert.ok(green(pixel(png, 10, 10)), `the background is gone: ${pixel(png, 10, 10)}`);
    assert.ok(green(pixel(png, 300, 170)));
    const mp4 = join(fx.root, 'cut.mp4');
    const render = cli(['render', file, '-o', mp4, '--range', '0.5:1.5']);
    assert.equal(render.code, 0, render.err);
    assert.equal(Number(probe(mp4)[0].nb_read_frames), 30);
    assert.ok(red(pixel(mp4, 160, 90)) && green(pixel(mp4, 10, 10)));
    // Moved and with an outline: a transform and an effect apply to the person.
    const sticker = edit({
      transform: { scaleX: 0.5, scaleY: 0.5, x: -80, y: 45 },
      effects: [{ type: 'outline', params: { color: '#0000ff', width: 3 } }],
    });
    const moved = join(fx.root, 'moved.png');
    assert.equal(
      cli(['frame', fx.save('sticker.json', sticker), '--time', '1', '-o', moved]).code,
      0,
    );
    assert.ok(red(pixel(moved, 80, 135)), `moved to the lower left: ${pixel(moved, 80, 135)}`);
    assert.ok(green(pixel(moved, 160, 90)), 'and gone from the middle');
    const [r, g, b] = pixel(moved, 80, 103);
    assert.ok(b > 180 && r < 80 && g < 80, `a blue border above it: ${[r, g, b]}`);
  });

  it('a clip trimmed beyond its cutout is drawn plain again, and says so', () => {
    const long = fx.save('long.json', edit({ timelineEnd: 3.5 }));
    // 1 … 4.5 s of the file; the cutout holds 0 … 4 s.
    const done = cli(['validate', long, '--json']);
    assert.match(JSON.parse(done.out).warnings[0].message, /person cutout not made yet/);
    // A cutout found in a --media folder serves a document elsewhere.
    const away = join(fx.library, 'away.json');
    fx.save('../library/away.json', edit({ sourceFile: '../project/media/film.mp4' }));
    const media = ['--media', fx.project];
    const found = JSON.parse(cli(['validate', away, '--json', ...media]).out);
    assert.deepEqual([found.valid, found.warnings], [true, []]);
    rmSync(cutouts(), { recursive: true });
    const gone = JSON.parse(cli(['validate', away, '--json', ...media]).out);
    assert.equal(gone.warnings.length, 1, 'no file, no cutout');
  });
});
