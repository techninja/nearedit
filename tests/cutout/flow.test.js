/**
 * How a cutout runs: three processes held to the pace of the slowest, one
 * run however many ask, as many runs at once as `CUTOUT_CONCURRENCY` allows
 * — and cancelling, which ends all three and leaves nothing.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as cutout from '../../src/api/cutout/index.js';
import * as kit from './kit.js';

const MB = 1024 * 1024;

describe('a running cutout', () => {
  let box;
  let video;
  const make = (start, end, more = {}) =>
    cutout.makeCutout({ folder: box.project, path: video, start, end, fps: 30, ...more });
  const cancelled = (/** @type {any} */ err) => err.killedBy === 'aborted';
  /** The fake matte programs of real runs that are alive now. */
  const mattesRunning = () =>
    kit.leftovers(box.root).filter((line) => line.includes(kit.FAKE) && !line.includes(' 64 '));

  before(() => {
    box = kit.cutoutSandbox('cutout-flow');
    video = kit.numbered(join(box.project, 'n30.mp4'), { fps: 30, frames: 150 });
  });
  afterEach(() => {
    assert.deepEqual(kit.debris(box.project), [], 'no partial file');
    assert.deepEqual(kit.leftovers(box.root), [], 'no process left running');
  });
  after(() => {
    delete process.env.CUTOUT_COMMAND;
    delete process.env.CUTOUT_CONCURRENCY;
    box.cleanup();
  });

  it('cancelling ends the decoder, the matte program and the packer, and removes the partial file', async () => {
    kit.useFake(box, '--delay 40');
    const stop = new AbortController();
    let running = [];
    let last = 0;
    const onProgress = (/** @type {number} */ done) => {
      last = done;
      if (done !== 4) return;
      running = kit.leftovers(box.root);
      stop.abort();
    };
    await assert.rejects(make(0, 3, { signal: stop.signal, onProgress }), cancelled);
    if (kit.canList) {
      const ffmpegs = running.filter((line) => /^\s*\d+ ffmpeg /.test(line));
      assert.equal(ffmpegs.length, 2, running.join('\n'));
      assert.equal(running.filter((line) => line.includes(kit.FAKE)).length, 1);
    }
    assert.ok(last < 10, `it stopped at once (frame ${last} of 90)`);
    assert.deepEqual(kit.leftovers(box.root), [], 'all three are gone when the call returns');
    assert.ok(!existsSync(box.cutouts) || kit.debris(box.project).length === 0);
    await assert.rejects(make(0, 3, { signal: stop.signal }), cancelled, 'already cancelled');
  });

  it('one of two who wait may leave: the run goes on for the other', async () => {
    kit.useFake(box, '--delay 10');
    const runs = kit.fakeRuns(box).length;
    const leaving = new AbortController();
    const first = make(0, 1, { signal: leaving.signal });
    const second = make(0, 1, { onProgress: (done) => done === 3 && leaving.abort() });
    await assert.rejects(first, cancelled);
    const made = await second;
    assert.deepEqual([made.cached, made.frames, existsSync(made.file)], [false, 30, true]);
    assert.equal(kit.fakeRuns(box).length, runs + 1);
  });

  it('when the last one leaves the run stops, and the next request starts afresh', async () => {
    kit.useFake(box, '--delay 20');
    const [a, b] = [new AbortController(), new AbortController()];
    const first = make(1, 2, { signal: a.signal, onProgress: (done) => done === 3 && a.abort() });
    const second = make(1, 2, { signal: b.signal, onProgress: (done) => done === 5 && b.abort() });
    await assert.rejects(first, cancelled);
    await assert.rejects(second, cancelled);
    assert.deepEqual(kit.leftovers(box.root), []);
    kit.useFake(box);
    assert.equal((await make(1, 2)).cached, false);
  });

  it('runs as many cutouts at once as CUTOUT_CONCURRENCY says', async () => {
    for (const [limit, from] of [
      ['1', 2],
      ['2', 3],
    ]) {
      process.env.CUTOUT_CONCURRENCY = limit;
      kit.useFake(box, `--delay 25 --tag ${limit}`);
      let most = 0;
      const watch = setInterval(() => (most = Math.max(most, mattesRunning().length)), 40);
      const made = await Promise.all([make(from, from + 0.5), make(from + 0.1, from + 0.6)]);
      clearInterval(watch);
      assert.deepEqual(
        made.map((one) => one.cached),
        [false, false],
      );
      if (kit.canList)
        assert.equal(
          most,
          Number(limit),
          `matte programs running at once with a limit of ${limit}`,
        );
    }
  });

  it('a slow encoder holds everything back instead of filling memory', async (t) => {
    const [w, h, frames, delay] = [1280, 720, 240, 12];
    const big = join(box.project, 'big.mp4');
    const picture = `testsrc2=size=${w}x${h}:rate=30:duration=${frames / 30}`;
    const h264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'];
    kit.ffmpeg(['-f', 'lavfi', '-i', picture, ...h264, big]);
    const raw = ['-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'];
    const size = ['--width', String(w), '--height', String(h)];
    const stages = {
      decoder: { cmd: 'ffmpeg', args: ['-v', 'error', '-i', big, ...raw] },
      matte: {
        cmd: process.execPath,
        args: [kit.FAKE, '--log', join(box.root, 'runs.log'), ...size],
      },
      packer: {
        cmd: process.execPath,
        args: [kit.SINK, '--bytes', String(w * h), '--delay', String(delay), '--of', box.root],
      },
    };
    /** Resident memory of the three stages together, bytes. */
    const stagesRss = () => {
      const list = execFileSync('ps', ['-eo', 'rss=,args='], { encoding: 'utf8' }).split('\n');
      const mine = list.filter((line) => line.includes(box.root));
      return mine.reduce((sum, line) => sum + parseInt(line, 10) * 1024, 0);
    };
    const own = process.memoryUsage().rss;
    let [ownPeak, stagesPeak] = [own, 0];
    const watch = setInterval(() => {
      ownPeak = Math.max(ownPeak, process.memoryUsage().rss);
      stagesPeak = Math.max(stagesPeak, stagesRss());
    }, 100);
    const started = performance.now();
    const sizes = { frameBytes: w * h * 3, matteBytes: w * h, frames };
    await cutout.runPipeline({ ...stages, ...sizes }).finally(() => clearInterval(watch));
    const seconds = (performance.now() - started) / 1000;
    const through = (frames * w * h * 4) / MB;
    const grew = (ownPeak - own) / MB;
    t.diagnostic(
      `${frames} frames of ${w} × ${h} (${Math.round(through)} MB of frames and mattes) in ` +
        `${seconds.toFixed(1)} s: this process grew by ${Math.round(grew)} MB, ` +
        `the three stages held ${Math.round(stagesPeak / MB)} MB at most`,
    );
    assert.ok(seconds >= (frames * delay) / 1000, 'the encoder set the pace');
    assert.ok(grew < 100, `this process grew by ${Math.round(grew)} MB`);
    assert.ok(stagesPeak / MB < 450, `the stages held ${Math.round(stagesPeak / MB)} MB`);
  });
});
