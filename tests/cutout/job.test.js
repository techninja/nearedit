/**
 * The cutout job end to end, with the fake matte program: the file, its
 * description, what is in its two halves, and that nothing is made twice.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import * as cutout from '../../src/api/cutout/index.js';
import { cutoutKey } from '../../src/utils/cutout/index.js';
import * as kit from './kit.js';

const [W, H] = [320, 180];
const MODEL = () => `command:${process.env.CUTOUT_COMMAND}`;

describe('the cutout job, with a fake matte program', () => {
  let box;
  let video;
  let made;
  const make = (start, end, more = {}) =>
    cutout.makeCutout({ folder: box.project, path: video, start, end, fps: 30, ...more });
  const ffprobe = (entries, file) =>
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', entries, '-of', 'json', file], {
      encoding: 'utf8',
    });

  before(async () => {
    box = kit.cutoutSandbox('cutout-job');
    kit.useFake(box);
    video = join(box.project, 'bars.mp4');
    const tone = ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3'];
    const h264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p'];
    const picture = `testsrc2=size=${W}x${H}:rate=30:duration=3`;
    kit.ffmpeg(['-f', 'lavfi', '-i', picture, ...tone, ...h264, '-c:a', 'aac', video]);
    made = await make(0.5, 1.5);
  });
  after(() => {
    delete process.env.CUTOUT_COMMAND;
    assert.deepEqual(kit.debris(box.project), [], 'only whole pairs are left');
    assert.deepEqual(kit.leftovers(box.root), [], 'no process outlives the tests');
    box.cleanup();
  });

  it('answers with the file, its key and what is in it', () => {
    const source = { path: video, size: statSync(video).size, mtime: statSync(video).mtimeMs };
    const key = cutoutKey({ source, start: 0.5, end: 1.5, fps: 30, model: MODEL() });
    assert.deepEqual(made, {
      ...{ file: join(box.cutouts, `${key}.mp4`), source: video },
      ...{ key, start: 0.5, end: 1.5, width: W, height: H, frames: 30, fps: 30, cached: false },
    });
    assert.deepEqual(kit.fakeRuns(box), [`${W}x${H}`]);
  });

  it('writes H.264 with the picture left and the matte right, no sound, and a short GOP', () => {
    const { streams } = JSON.parse(ffprobe('stream', made.file));
    assert.equal(streams.length, 1, 'no audio stream');
    const [v] = streams;
    assert.deepEqual(
      [v.codec_name, v.profile, v.pix_fmt, v.width, v.height, v.r_frame_rate, v.nb_frames],
      ['h264', 'High', 'yuv420p', 2 * W, H, '30/1', '30'],
    );
    // A small picture is BT.601, and stays so: the file says which matrix it is in.
    const colour = [v.color_space, v.color_range, v.sample_aspect_ratio];
    assert.deepEqual(colour, ['smpte170m', 'tv', '1:1']);
    const packets = JSON.parse(ffprobe('packet=flags', made.file)).packets;
    const keys = packets.flatMap((packet, n) => (packet.flags.startsWith('K') ? [n] : []));
    assert.deepEqual(keys, [0, 15], 'a key frame every half second');
  });

  it('describes it in the file beside it', () => {
    const meta = JSON.parse(readFileSync(made.file.replace(/mp4$/, 'json'), 'utf8'));
    const { size, mtimeMs } = statSync(video);
    assert.deepEqual(meta, {
      ...{ version: 1, key: made.key },
      source: { path: video, size, mtime: Math.round(mtimeMs) },
      ...{ start: 0.5, end: 1.5, width: W, height: H, frames: 30, fps: 30, model: MODEL() },
    });
    assert.deepEqual(cutout.readMeta(box.project, made.key), meta);
    assert.deepEqual(cutout.readCutout(box.project, made.key), { ...made, cached: true });
    assert.equal(cutout.readCutout(box.project, 'f'.repeat(20)), null);
    assert.throws(() => cutout.readCutout(box.project, '../../etc/passwd'), /Not a cutout key/);
  });

  it('keeps the picture half faithful to the source, frame for frame', async () => {
    // Both decoded the way the renderer decodes footage — as the compositor will read them.
    const window = { count: 30, fps: 30, height: H };
    const packed = await kit.renderFrames(made.file, { ...window, seek: 0, width: 2 * W });
    const shown = await kit.renderFrames(video, { ...window, seek: 0.5, width: W });
    assert.equal(packed.length, 30);
    const pictures = packed.map((frame) => kit.halves(frame, W, H, 4).picture);
    const quality = pictures.map((picture, n) => kit.psnr(picture, shown[n], 4));
    assert.ok(
      Math.min(...quality) > 38,
      `PSNR against a direct decode: ${quality.map(Math.round)}`,
    );
    // The neighbouring frame is a different picture: the match is not a coincidence.
    const next = kit.psnr(pictures[10], shown[11], 4);
    assert.ok(next < quality[10] - 8, `the next frame matches worse (${Math.round(next)} dB)`);
  });

  it('holds the matte the program gave in the other half: white is the person', async () => {
    const shape = kit.ellipse(W, H);
    const window = { seek: 0, count: 30, fps: 30, width: 2 * W, height: H };
    for (const frame of await kit.renderFrames(made.file, window)) {
      const { matte } = kit.halves(frame, W, H, 4);
      let [wrong, inside] = [0, 0];
      for (let i = 0; i < matte.length; i++) {
        if (matte[i] >= 128 !== shape[i] >= 128) wrong++;
        if (matte[i] >= 128) inside++;
      }
      assert.ok(wrong < matte.length * 0.002, `${wrong} pixels on the wrong side of the edge`);
      assert.ok(Math.abs(inside / matte.length - Math.PI / 12) < 0.004, 'the area of the ellipse');
      const at = (/** @type {number} */ x, /** @type {number} */ y) => matte[y * W + x];
      assert.ok(at(W / 2, H / 2) >= 253 && at(W / 2 + 60, H / 2) >= 253, 'white inside');
      assert.ok(at(8, 8) <= 2 && at(W - 8, H - 8) <= 2 && at(W / 2, 12) <= 2, 'black outside');
    }
  });

  it('makes nothing twice: the same request finds the file', async () => {
    const again = await make(0.5, 1.5);
    assert.deepEqual(again, { ...made, cached: true });
    assert.deepEqual(await make(0.5 + 1e-7, 1.5 - 1e-7), { ...made, cached: true });
    assert.equal(kit.fakeRuns(box).length, 1, 'the matte program was not started again');
  });

  it('serves a shorter stretch from a longer cutout of the same file', async () => {
    assert.deepEqual(await make(0.8, 1.2), { ...made, cached: true });
    const source = cutout.sourceOf(video);
    const want = { start: 0.8, end: 1.2, fps: 30, model: MODEL() };
    assert.equal(cutout.findCutout(box.project, source, want).key, made.key);
    assert.equal(cutout.findCutout(box.project, source, { ...want, start: 0.4 }), null);
    assert.equal(cutout.findCutout(box.project, source, { ...want, end: 1.6 }), null);
    assert.equal(cutout.findCutout(box.project, source, { ...want, fps: 25 }), null);
    assert.equal(cutout.findCutout(box.project, source, { ...want, model: 'another' }), null);
    assert.equal(cutout.findCutout(box.project, { ...source, size: 1 }, want), null);
    assert.equal(cutout.findCutout(join(box.root, 'nowhere'), source, want), null);
    assert.equal(kit.fakeRuns(box).length, 1);
    // What is not covered is made, and from then on the shortest cover is used.
    const longer = await make(0.2, 1.6);
    assert.deepEqual([longer.cached, longer.frames, longer.start], [false, 42, 0.2]);
    assert.equal((await make(0.8, 1.2)).key, made.key);
    assert.equal((await make(0.3, 1.2)).key, longer.key);
  });

  it('counts a changed file as another file', async () => {
    const { atime, mtime } = statSync(video);
    utimesSync(video, atime, new Date(mtime.getTime() + 5000));
    const fresh = await make(0.5, 1.5);
    assert.equal(fresh.cached, false);
    assert.notEqual(fresh.key, made.key);
    assert.ok(existsSync(made.file), 'the old cutout stays until something removes it');
  });

  it('shares one run between requests for the same cutout, and tells each its progress', async () => {
    const before = kit.fakeRuns(box).length;
    const seen = [[], []];
    const asked = [0, 1, 2].map((i) =>
      make(2, 2.5, i < 2 ? { onProgress: (done, total) => seen[i].push(`${done}/${total}`) } : {}),
    );
    const results = await Promise.all(asked);
    assert.deepEqual(new Set(results.map((result) => result.key)).size, 1);
    assert.deepEqual(
      results.map((result) => result.cached),
      [false, false, false],
    );
    assert.equal(kit.fakeRuns(box).length, before + 1, 'one run for three requests');
    const frames = Array.from({ length: 15 }, (_, n) => `${n + 1}/15`);
    assert.deepEqual(seen, [frames, frames], 'progress is counted in frames');
  });
});
