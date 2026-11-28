/**
 * What goes wrong, and what is said then: a matte program that dies, stops
 * in the middle of a matte, writes what is not a matte, hangs or cannot be
 * started; a file without a picture. Every failure names its cause and
 * leaves neither a file nor a process.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as cutout from '../../src/api/cutout/index.js';
import * as kit from './kit.js';

const [W, H] = [320, 180];

describe('a cutout that fails', () => {
  let box;
  let video;
  const make = (more = {}) =>
    cutout.makeCutout({ folder: box.project, path: video, start: 0.5, end: 1.5, fps: 30, ...more });
  /** Run a cutout that must fail; returns what it threw. */
  const failing = async (flags, more) => {
    kit.useFake(box, flags);
    const err = await make(more).then(
      () => null,
      (thrown) => thrown,
    );
    assert.ok(err, 'the cutout failed');
    return err;
  };

  before(() => {
    box = kit.cutoutSandbox('cutout-failures');
    video = kit.numbered(join(box.project, 'n30.mp4'), { fps: 30, frames: 90 });
  });
  afterEach(() => {
    assert.deepEqual(kit.debris(box.project), [], 'no partial file, no half of a pair');
    assert.deepEqual(kit.leftovers(box.root), [], 'no process left running');
  });
  after(() => {
    delete process.env.CUTOUT_COMMAND;
    assert.ok(!existsSync(box.cutouts) || kit.debris(box.project).length === 0);
    box.cleanup();
  });

  it('names what a matte program printed before it died', async () => {
    const err = await failing('--die-after 5');
    assert.equal(err.status, 500);
    assert.match(err.message, /^The matte program stopped \(exit code 3\) after 5 of 30 frames: /);
    assert.match(err.message, /fake matte: out of memory on frame 6$/);
  });

  it('says so when a matte stops half way', async () => {
    const err = await failing('--short-after 7');
    assert.match(err.message, /^The matte program stopped \(exit code 0\) after 7 of 30 frames/);
    assert.match(err.message, /in the middle of a matte \(28800 of 57600 bytes\)/);
  });

  it('refuses output that is more than one matte a frame', async () => {
    const extra = await failing('--extra-after 20');
    assert.match(extra.message, /wrote more than a matte for each of the 30 frames/);
    const chatty = await failing('--garbage-after 3');
    assert.match(
      chatty.message,
      /wrote more than a matte for each of the 30 frames \(or something/,
    );
    assert.match(chatty.detail, /more than 1728000 bytes on its standard output/);
  });

  it('gives up on a matte program that stops answering', async () => {
    const started = performance.now();
    const err = await failing('--hang-after 4', { stallMs: 600 });
    assert.equal(err.status, 504);
    assert.match(err.message, /^The matte program gave nothing for 1 s after 4 of 30 frames/);
    assert.ok(performance.now() - started < 5000, 'without waiting for it');
  });

  it('says why when the matte program cannot be started or does not speak the protocol', async () => {
    process.env.CUTOUT_COMMAND = join(box.root, 'no-such-program');
    const missing = await make().catch((thrown) => thrown);
    assert.equal(missing.status, 503);
    assert.match(
      missing.message,
      /^CUTOUT_COMMAND cannot be started \(.*no-such-program\): .*ENOENT/,
    );
    kit.useFake(box, '--garbage-after 1');
    const wrong = await make().catch((thrown) => thrown);
    assert.equal(wrong.status, 503);
    assert.match(
      wrong.message,
      /does not speak the matte protocol: for two 64 × 64 frames it gave 8219 bytes/,
    );
    const status = await cutout.cutoutStatus();
    assert.deepEqual([status.available, status.provider, status.model], [false, 'command', '']);
    assert.equal(status.reason, wrong.message);
  });

  it('refuses a file without a picture, and a stretch after its end', async () => {
    kit.useFake(box);
    const text = join(box.project, 'notes.mp4');
    writeFileSync(text, 'not a video at all');
    const range = { folder: box.project, start: 0, end: 1, fps: 30 };
    const none = await cutout.makeCutout({ ...range, path: text }).catch((thrown) => thrown);
    assert.deepEqual([none.status, none.message], [422, 'The file has no picture']);
    const gone = await cutout
      .makeCutout({ ...range, path: join(box.project, 'gone.mp4') })
      .catch((thrown) => thrown);
    assert.deepEqual([gone.status, gone.message], [404, 'File not found']);
    const late = await make({ start: 10, end: 11 }).catch((thrown) => thrown);
    assert.equal(late.status, 422);
    assert.match(late.message, /n30\.mp4 has no picture in that range$/);
  });

  it('names the stage that failed: the decoder, the packer, a matte program that is not there', async () => {
    const [w, h, frames] = [320, 180, 20];
    const raw = ['-frames:v', String(frames), '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'];
    const good = {
      decoder: { cmd: 'ffmpeg', args: ['-v', 'error', '-i', video, ...raw] },
      matte: {
        cmd: process.execPath,
        args: [kit.FAKE, '--width', String(w), '--height', String(h)],
      },
      packer: { cmd: process.execPath, args: [kit.SINK, '--bytes', String(w * h), '--delay', '1'] },
    };
    const sizes = { frameBytes: w * h * 3, matteBytes: w * h, frames };
    /** A stage that says something and ends at once. */
    const dying = (says, code) => ({
      cmd: process.execPath,
      args: ['-e', `console.error(${JSON.stringify(says)}); process.exit(${code})`, box.root],
    });
    const run = (stages) =>
      cutout.runPipeline({ ...good, ...stages, ...sizes }).then(
        () => null,
        (err) => err,
      );
    assert.equal(await run({}), null, 'the three as they are run to the end');
    const packer = await run({ packer: dying('No space left on device', 7) });
    assert.match(
      packer.message,
      /^The packer \(FFmpeg\) stopped \(exit code 7\) after \d+ of 20 frames: No space left on device$/,
    );
    const decoder = await run({ decoder: dying('moov atom not found', 4) });
    assert.match(
      decoder.message,
      /^The decoder \(FFmpeg\) stopped \(exit code 4\) after 0 of 20 frames: moov atom not found$/,
    );
    const nowhere = join(box.root, 'no-such-program');
    const missing = await run({ matte: { cmd: nowhere, args: [] } });
    assert.equal(missing.status, 503);
    assert.match(
      missing.message,
      /^Cannot start the matte program \(.*no-such-program\): .*ENOENT/,
    );
  });

  it('works again once the matte program does', async () => {
    kit.useFake(box);
    const made = await make();
    assert.deepEqual([made.cached, made.frames, made.width, made.height], [false, 30, W, H]);
    assert.ok(existsSync(made.file));
  });
});
