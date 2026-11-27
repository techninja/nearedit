import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '../lib/ffmpeg.js';
import * as kit from './testkit.js';

/**
 * Timelines that need both renderers: plain footage on the filter graph,
 * everything else on the canvas path, joined into one file.
 */

const { createClip, createEdl, createTrack } = kit;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('render: both renderers in one timeline', () => {
  const tmp = kit.scratch();
  const file = (name) => join(tmp.dir, name);
  const clip = (name, start, end, more = {}) =>
    createClip({
      ...{ sourceFile: file(name), sourceIn: start, timelineStart: start, timelineEnd: end },
      ...more,
    });
  const title = (start, end, more = {}) =>
    createClip({
      ...{ timelineStart: start, timelineEnd: end },
      text: { content: 'OVER', fontSize: 40, background: '#000000' },
      transform: { y: 50 },
      ...more,
    });
  const solid = (start, end, color) =>
    createClip({
      timelineStart: start,
      timelineEnd: end,
      generator: { type: 'solid', params: { color } },
    });
  const edl = (tracks, more = {}) => createEdl({ resolution: '320x180', tracks, ...more });
  const video = (...clips) => createTrack('video', { clips });
  const strays = () =>
    execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.startsWith('ffmpeg') && line.includes(tmp.dir));
  const stamps = async (path) => {
    const args = ['-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time'];
    const { stdout } = await run('ffprobe', [...args, '-of', 'csv=p=0', path]);
    return stdout.trim().split('\n').map(parseFloat);
  };
  /** Mean absolute difference between two frames, sampled on a grid. */
  const differ = (one, n, other, m) => {
    let sum = 0;
    for (let y = 0; y < 180; y += 3)
      for (let x = 0; x < 320; x += 3)
        sum += one.at(n, x, y).reduce((d, v, i) => d + Math.abs(v - other.at(m, x, y)[i]), 0);
    return sum / (60 * 107 * 3);
  };

  before(async () => {
    // A test pattern whose hue turns (every frame differs clearly), with a steady tone.
    const picture = 'testsrc2=s=320x180:r=30:d=9,hue=h=t*360';
    const sources = [picture, 'aevalsrc=0.5*sin(2*PI*440*t):s=48000:d=9'];
    await kit.generate(file('moving.mp4'), sources, ['-c:a', 'aac', '-b:a', '192k']);
    const numbered = `nullsrc=s=512x16:r=30:d=4,geq=lum='if(between(X,N*4,N*4+3),235,16)':cb=128:cr=128`;
    await kit.generate(file('numbered.mp4'), [numbered], ['-crf', '10']);
    await kit.generate(file('gone.mp4'), ['testsrc2=s=320x180:r=30:d=9']);
  });
  after(() => tmp.cleanup());

  /** Footage throughout; a title over seconds 2-4, a generator replacing seconds 6-7. */
  const mixed = () =>
    edl([
      video(title(2, 4, { fadeIn: 0.5, fadeOut: 0.5 })),
      video(clip('moving.mp4', 0, 6), solid(6, 7, '#7c3aed'), clip('moving.mp4', 7, 8)),
      createTrack('audio', { clips: [clip('moving.mp4', 0, 8)] }),
    ]);

  it('joins filter-graph and canvas segments into one seamless file', async () => {
    const both = await kit.encode(mixed(), tmp.dir, { workers: 2 });
    assert.equal(both.plan.segments, 5);
    assert.equal(both.plan.drawn, 2);
    assert.match(
      both.log[0],
      /^Encoding 240 frames in 5 segments, 2 drawn by the compositor, 2 at a time$/,
    );
    const parts = readdirSync(both.workDir).filter((name) => name.startsWith('segment-'));
    assert.equal(parts.length, 5, 'one intermediate file per segment');

    const info = await kit.inspect(both.output);
    assert.equal(Number(info.video.nb_read_frames), 240);
    assert.equal(info.video.r_frame_rate, '30/1');
    assert.ok(Math.abs(info.duration - 8) <= 1 / 30, `duration ${info.duration}`);
    const times = await stamps(both.output);
    assert.equal(times.length, 240);
    times.forEach((t, i) => assert.ok(Math.abs(t - i / 30) < 0.001, `frame ${i} is at ${t}`));

    // The same timeline drawn by the compositor alone is the yardstick.
    const drawn = await kit.encode(mixed(), tmp.dir, { engine: 'canvas' });
    assert.equal(drawn.plan.drawn, drawn.plan.segments);
    const a = await kit.readFrames(drawn.output, 320, 180);
    const b = await kit.readFrames(both.output, 320, 180);
    assert.equal(b.count, a.count);
    let [worst, slip] = [0, Infinity];
    for (let frame = 1; frame < a.count; frame++) {
      worst = Math.max(worst, differ(a, frame, b, frame));
      // Inside the solid generator neighbouring frames are the same picture.
      if (frame < 180 || frame > 211) slip = Math.min(slip, differ(a, frame, a, frame - 1));
    }
    assert.ok(slip > 8, `neighbouring frames differ by at least ${slip.toFixed(2)}`);
    assert.ok(worst < 5, `worst difference between the two renders: ${worst.toFixed(2)}`);

    const sound = await kit.readAudio(both.output);
    for (let t = 0.25; t < 7.75; t += 0.25) {
      const level = kit.tone(sound.left, 440, t, t + 0.2);
      assert.ok(Math.abs(level - 0.5) < 0.03, `tone is steady at ${t}s: ${level.toFixed(3)}`);
    }
    const rising = both.progress.every((p, i) => i === 0 || p >= both.progress[i - 1]);
    assert.ok(rising && both.progress.at(-1) <= 99, `progress ${both.progress}`);
    assert.ok(
      both.progress.some((p) => p > 20 && p < 95),
      'progress moves through the segments',
    );
  });

  it('never repeats or drops a frame where the renderer changes', async () => {
    const strip = createClip({
      ...{ sourceFile: file('numbered.mp4'), sourceIn: 0.5 },
      ...{ timelineStart: 0, timelineEnd: 3 },
    });
    const label = createClip({
      ...{ timelineStart: 1, timelineEnd: 2 },
      text: { content: '.', fontSize: 4, color: '#101010' },
      transform: { x: 120, y: 6 },
    });
    const document = createEdl({ resolution: '512x16', tracks: [video(label), video(strip)] });
    const { output, plan } = await kit.encode(document, tmp.dir, { preset: 'high' });
    assert.deepEqual([plan.segments, plan.drawn], [3, 1]);
    const frames = await kit.readFrames(output, 512, 16);
    const shown = Array.from({ length: frames.count }, (_, n) => {
      let [best, at] = [0, -1];
      for (let x = 0; x < 512; x++) {
        const value = frames.at(n, x, 4)[1];
        if (value > best) [best, at] = [value, x];
      }
      return best > 100 ? Math.floor(at / 4) : -1;
    });
    assert.deepEqual(
      shown,
      Array.from({ length: 90 }, (_, n) => 15 + n),
      'source frames 15 to 104, one each',
    );
  });

  it('draws chunks on several workers and gets the same frames', async () => {
    const piece = () =>
      edl([
        video(
          title(0, 6, {
            keyframes: {
              'transform.x': [
                { t: 0, v: -100 },
                { t: 6, v: 100 },
              ],
            },
          }),
        ),
        video(clip('moving.mp4', 0, 6)),
      ]);
    const one = await kit.encode(piece(), tmp.dir, { workers: 1, chunkFrames: 60, lossless: true });
    const three = await kit.encode(piece(), tmp.dir, {
      workers: 3,
      chunkFrames: 60,
      lossless: true,
    });
    assert.deepEqual([three.plan.segments, three.plan.drawn], [3, 3]);
    assert.match(three.log[0], /in 3 segments, 3 drawn by the compositor, 3 at a time$/);
    assert.match(one.log[0], /1 at a time$/);
    const a = await kit.readFrames(one.output, 320, 180);
    const b = await kit.readFrames(three.output, 320, 180);
    assert.equal(b.count, 180);
    for (let frame = 0; frame < 180; frame += 7)
      assert.equal(differ(a, frame, b, frame), 0, `frame ${frame} is the same on any worker`);
  });

  it('stops every worker and FFmpeg when cancelled or when a segment fails', async () => {
    const long = edl([video(title(0, 8)), video(clip('moving.mp4', 0, 8))], {
      resolution: '1280x720',
    });
    const stop = new AbortController();
    const options = { workers: 2, chunkFrames: 60, preset: 'high' };
    // Cancel once it is well under way, whatever the speed of the machine.
    const onProgress = (percent) => percent >= 10 && stop.abort();
    const running = kit.encode(long, tmp.dir, { ...options, onProgress }, stop.signal);
    await assert.rejects(running, (err) => err.killedBy === 'aborted');
    for (let i = 0; i < 60 && strays().length; i++) await sleep(50);
    assert.deepEqual(strays(), [], 'nothing keeps running after a cancel');

    // The last of four segments reads a file that disappears once rendering is under way.
    const broken = edl([
      video(title(0, 8)),
      video(clip('moving.mp4', 0, 6), clip('gone.mp4', 6, 8)),
    ]);
    const vanish = () => rmSync(file('gone.mp4'), { force: true });
    const failing = kit.encode(broken, tmp.dir, {
      workers: 2,
      chunkFrames: 60,
      onProgress: vanish,
    });
    await assert.rejects(failing, /Cannot decode source file: .*gone\.mp4/);
    for (let i = 0; i < 60 && strays().length; i++) await sleep(50);
    assert.deepEqual(strays(), [], 'nothing keeps running after a failure');
  });

  it('obeys RENDER_ENGINE', async () => {
    const saved = process.env.RENDER_ENGINE;
    try {
      process.env.RENDER_ENGINE = 'ffmpeg';
      await assert.rejects(
        kit.encode(mixed(), tmp.dir),
        (err) =>
          err.status === 422 &&
          /RENDER_ENGINE=ffmpeg cannot render this timeline/.test(err.message),
      );
      const plain = edl([video(clip('moving.mp4', 0, 1))]);
      assert.equal((await kit.encode(plain, tmp.dir)).plan.drawn, 0);
      process.env.RENDER_ENGINE = 'canvas';
      const forced = await kit.encode(plain, tmp.dir);
      assert.deepEqual([forced.plan.segments, forced.plan.drawn], [1, 1]);
      assert.equal(Number((await kit.inspect(forced.output)).video.nb_read_frames), 30);
    } finally {
      if (saved === undefined) delete process.env.RENDER_ENGINE;
      else process.env.RENDER_ENGINE = saved;
    }
  });
});
