import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as kit from './testkit.js';

/**
 * Frame accuracy. The sources carry their frame number as a bright bar at
 * x = 4N, so a rendered frame says exactly which source frame it shows.
 */

const { createClip, createEdl, createTrack } = kit;
const [W, H] = [256, 16];
/** A third of an output frame: how early a source frame may count as "on screen". */
const TOLERANCE = 0.01;

describe('render: frame accuracy', () => {
  const tmp = kit.scratch();
  const file = (name) => join(tmp.dir, name);
  const numbered = (rate) =>
    `nullsrc=s=${W}x${H}:r=${rate}:d=2,geq=lum='if(between(X,N*4,N*4+3),235,16)':cb=128:cr=128`;
  const clip = (name, sourceIn, start, end) =>
    createClip({
      ...{ sourceFile: file(name), sourceIn, sourceOut: sourceIn + end - start },
      ...{ timelineStart: start, timelineEnd: end },
    });

  /** Render and return the source frame number shown by each output frame. */
  const shown = async (clips, options) => {
    const edl = createEdl({
      resolution: `${W}x${H}`,
      fps: 30,
      tracks: [createTrack('video', { clips })],
    });
    const { output } = await kit.render(edl, tmp.dir, { preset: 'high', ...options });
    const frames = await kit.readFrames(output, W, H);
    return Array.from({ length: frames.count }, (_, n) => {
      let [best, at] = [0, -1];
      for (let x = 0; x < W; x++) {
        const value = frames.at(n, x, 8)[1];
        if (value > best) [best, at] = [value, x];
      }
      return best > 100 ? Math.floor(at / 4) : -1;
    });
  };
  /** What a player shows: the latest source frame that has started. */
  const player = (sourceIn, rate, count) =>
    Array.from({ length: count }, (_, j) =>
      Math.floor((sourceIn + j / 30 + TOLERANCE) * rate + 1e-6),
    );

  before(async () => {
    const x264 = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '10'];
    await kit.generate(file('n30.mp4'), [numbered(30)], ['-crf', '10']);
    // Matroska rounds timestamps to milliseconds.
    await kit.generate(file('n30.mkv'), [numbered(30)], x264);
    await kit.generate(file('n60.mp4'), [numbered(60)], ['-crf', '10']);
    await kit.generate(file('n24.mkv'), [numbered(24)], x264);
  });
  after(() => tmp.cleanup());

  it('starts every clip on exactly the frame at sourceIn', async () => {
    for (const name of ['n30.mp4', 'n30.mkv']) {
      for (const first of [0, 1, 2, 7, 13, 31]) {
        const frames = await shown([clip(name, first / 30, 0, 0.2)]);
        const want = [0, 1, 2, 3, 4, 5].map((j) => first + j);
        assert.deepEqual(frames, want, `${name} from frame ${first}`);
      }
    }
  });

  it('cuts between clips without repeating or dropping a frame', async () => {
    const cuts = [
      clip('n30.mkv', 0.5, 0, 0.2),
      clip('n30.mp4', 4 / 30, 0.2, 0.4),
      clip('n30.mkv', 1, 0.4, 0.5),
    ];
    assert.deepEqual(await shown(cuts), [15, 16, 17, 18, 19, 20, 4, 5, 6, 7, 8, 9, 30, 31, 32]);
  });

  it('shows what a player shows when sourceIn falls between frames', async () => {
    // 0.04 s is inside frame 1; 0.062 s is 5 ms before frame 2 (close enough to count).
    assert.deepEqual(await shown([clip('n30.mp4', 0.04, 0, 0.2)]), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(await shown([clip('n30.mp4', 0.05, 0, 0.2)]), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(await shown([clip('n30.mp4', 0.062, 0, 0.2)]), [2, 3, 4, 5, 6, 7]);
  });

  it('conforms other frame rates with a steady cadence', async () => {
    assert.deepEqual(await shown([clip('n60.mp4', 0, 0, 0.2)]), [0, 2, 4, 6, 8, 10]);
    assert.deepEqual(await shown([clip('n60.mp4', 0.05, 0, 0.2)]), [3, 5, 7, 9, 11, 13]);
    for (const sourceIn of [0, 0.1, 0.3]) {
      const frames = await shown([clip('n24.mkv', sourceIn, 0, 0.5)]);
      assert.deepEqual(frames, player(sourceIn, 24, 15), `24 fps from ${sourceIn}s`);
      const steps = frames.slice(1).map((n, i) => n - frames[i]);
      assert.ok(
        steps.every((step) => step === 0 || step === 1),
        `no skipped frames: ${frames}`,
      );
      assert.equal(steps.filter((step) => step === 0).length, 3, `one repeat per five: ${frames}`);
    }
  });

  it('picks the same frames in a range render as in the whole render', async () => {
    const clips = [clip('n24.mkv', 0.1, 0, 1), clip('n60.mp4', 0.25, 1, 1.5)];
    const whole = await shown(clips);
    for (const [start, end] of [
      [0.3, 1.2],
      [0.7, 1.5],
      [1.1, 1.3],
    ]) {
      const part = await shown(clips, { range: { start, end } });
      const from = Math.round(start * 30);
      assert.deepEqual(part, whole.slice(from, Math.round(end * 30)), `range ${start}-${end}`);
    }
  });
});
