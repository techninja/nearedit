/**
 * The person cutout with the real model — where there is one: a Python
 * with onnxruntime and the MODNet file (`npm run install-cutout`, or
 * `CUTOUT_PYTHON` / `CUTOUT_MODEL`). A photo of a person slides over colour
 * bars; the person must be in the matte and the bars out of it, on every
 * frame. Skipped, saying why, everywhere else.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cutout from '../../src/api/cutout/index.js';
import * as kit from './kit.js';

const PERSON = fileURLToPath(new URL('./fixtures/person.jpg', import.meta.url));
const [W, H, FRAMES] = [1280, 720, 90];
/** The photo is shown 480 wide, its top at 240, sliding between x = 200 and 600. */
const [SIDE, TOP] = [480, 240];
const leftAt = (/** @type {number} */ n) => 400 + 200 * Math.sin((2 * Math.PI * (n / 30)) / 3);
/** Where the face is in the photo, as fractions of its side. */
const FACE = { x0: 0.38, x1: 0.5, y0: 0.17, y1: 0.31 };

const own = Boolean(process.env.CUTOUT_COMMAND);
const status = own ? null : await cutout.cutoutStatus();
const skip = own
  ? 'CUTOUT_COMMAND is set: this is about the built-in worker'
  : !status.available && `no matte model here — ${status.reason}`;

describe('the real matte model', { skip }, () => {
  let box;
  let video;
  const background = `testsrc2=size=${W}x${H}:rate=30:duration=${FRAMES / 30}`;
  const h264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p'];
  /** A clip of the photo over something, placed by an overlay expression. */
  const clip = (name, under, x, size = `${SIDE}:${SIDE}`, more = '') => {
    const graph = `[1:v]scale=${size}[p];[0:v][p]overlay=x='${x}':y=${TOP}:shortest=1${more}`;
    const inputs = ['-f', 'lavfi', '-i', under, '-loop', '1', '-i', PERSON];
    kit.ffmpeg([...inputs, '-filter_complex', graph, ...h264, join(box.project, name)]);
    return join(box.project, name);
  };
  /** Mean and extremes of a matte inside a rectangle. */
  const inBox = (matte, x0, y0, x1, y1) => {
    let [sum, min, max] = [0, 255, 0];
    for (let y = Math.round(y0); y < y1; y++) {
      for (let x = Math.round(x0); x < x1; x++) {
        const value = matte[y * W + x];
        [sum, min, max] = [sum + value, Math.min(min, value), Math.max(max, value)];
      }
    }
    return {
      mean: sum / ((Math.round(y1) - Math.round(y0)) * (Math.round(x1) - Math.round(x0))),
      min,
      max,
    };
  };

  before(() => {
    box = kit.cutoutSandbox('cutout-real');
    video = clip('selfie.mp4', background, '400+200*sin(2*PI*t/3)');
  });
  after(() => {
    assert.deepEqual(kit.debris(box.project), []);
    assert.deepEqual(kit.leftovers(box.root), []);
    box.cleanup();
  });

  it('is the built-in worker, with its model in the key', () => {
    assert.deepEqual([status.available, status.provider, status.reason], [true, 'builtin', '']);
    assert.match(status.model, /^modnet-[0-9a-f]{12}\/size512\/steady0\.6\/v1$/);
    assert.match(
      status.detail,
      /^Python 3\.\S+ at .*, onnxruntime \S+, numpy \S+; model .*\.onnx$/,
    );
  });

  it('puts the face inside the matte and the corners of the bars outside it, on every frame', async (t) => {
    const started = performance.now();
    const made = await cutout.makeCutout({
      folder: box.project,
      path: video,
      start: 0,
      end: 3,
      fps: 30,
    });
    const seconds = (performance.now() - started) / 1000;
    t.diagnostic(
      `${FRAMES} frames of ${W} × ${H} in ${seconds.toFixed(1)} s: ${(FRAMES / seconds).toFixed(1)} frames a second`,
    );
    assert.deepEqual([made.cached, made.frames, made.width, made.height], [false, FRAMES, W, H]);
    const window = { seek: 0, count: FRAMES, fps: 30, width: 2 * W, height: H };
    const frames = await kit.renderFrames(made.file, window);
    assert.equal(frames.length, FRAMES);
    const corner = 80;
    frames.forEach((frame, n) => {
      const { matte } = kit.halves(frame, W, H, 4);
      const left = leftAt(n);
      const [x0, x1] = [left + FACE.x0 * SIDE, left + FACE.x1 * SIDE];
      const face = inBox(matte, x0, TOP + FACE.y0 * SIDE, x1, TOP + FACE.y1 * SIDE);
      assert.ok(
        face.mean > 245 && face.min > 200,
        `frame ${n}: the face is ${JSON.stringify(face)}`,
      );
      for (const [x, y] of [
        [0, 0],
        [W - corner, 0],
        [0, H - corner],
        [W - corner, H - corner],
      ]) {
        const bars = inBox(matte, x, y, x + corner, y + corner);
        assert.ok(bars.max < 16, `frame ${n}: the corner at ${x},${y} is ${JSON.stringify(bars)}`);
      }
    });
  });

  it('steadies a still shot and does not drag a ghost behind a fast move', async (t) => {
    const [w, h, count] = [640, 360, 16];
    const noise = ',noise=alls=4:allf=t';
    const still = clip(
      'still.mp4',
      `color=c=0x607080:size=${w}x${h}:rate=30:duration=1`,
      '180',
      '280:280',
      noise,
    );
    const fast = clip(
      'fast.mp4',
      `testsrc2=size=${w}x${h}:rate=30:duration=1`,
      '180+170*sin(2*PI*t/0.8)',
      '280:280',
      noise,
    );
    const { words } = cutout.builtinProvider();
    /** The worker's mattes for the first frames of a clip, as numbers. */
    const mattes = (file, steady) => {
      const raw = ['-frames:v', String(count), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'];
      const frames = kit.ffmpeg(['-i', file, ...raw]);
      const args = [
        ...words.slice(1, 4),
        '--steady',
        steady,
        '--width',
        String(w),
        '--height',
        String(h),
      ];
      const ran = spawnSync(words[0], args, { input: frames, maxBuffer: 1 << 28 });
      assert.equal(ran.status, 0, String(ran.stderr));
      assert.equal(ran.stdout.length, count * w * h);
      return Array.from({ length: count }, (_, n) =>
        ran.stdout.subarray(n * w * h, (n + 1) * w * h),
      );
    };
    /** Mean change from each matte to the next, in levels. */
    const flicker = (list) => {
      let sum = 0;
      for (let n = 1; n < list.length; n++)
        for (let i = 0; i < w * h; i++) sum += Math.abs(list[n][i] - list[n - 1][i]);
      return sum / ((list.length - 1) * w * h);
    };
    const [plain, steadied] = [mattes(still, '0'), mattes(still, '0.6')];
    const [calm, calmer] = [flicker(plain), flicker(steadied)];
    // Where the model itself says "background now": what the steadied matte still holds there.
    const [moving, followed] = [mattes(fast, '0'), mattes(fast, '0.6')];
    let [held, places] = [0, 0];
    for (let n = 1; n < count; n++) {
      for (let i = 0; i < w * h; i++) {
        if (moving[n][i] >= 13) continue;
        held += followed[n][i];
        places++;
      }
    }
    t.diagnostic(
      `still shot: the matte changes ${calm.toFixed(2)} levels a frame, steadied ${calmer.toFixed(2)}; ` +
        `fast move: ${(held / places).toFixed(2)} levels left where the person was`,
    );
    assert.ok(calmer < calm * 0.85, `steadied ${calmer} against ${calm}`);
    assert.ok(held / places < 1.5, `a trail of ${held / places} levels`);
  });

  it('the worker says so when its input stops in the middle of a frame', () => {
    const { words } = cutout.builtinProvider();
    const args = [...words.slice(1, 4), '--width', '64', '--height', '64'];
    const cut = spawnSync(words[0], args, { input: Buffer.alloc(64 * 64 * 3 + 100) });
    assert.equal(cut.status, 6);
    assert.equal(cut.stdout.length, 64 * 64, 'the whole frame was answered');
    assert.match(
      String(cut.stderr),
      /person_matte: the input ended in the middle of frame 2 \(100 of 12288 bytes\)/,
    );
    const check = execFileSync(words[0], [...words.slice(1, 4), '--check'], { encoding: 'utf8' });
    assert.deepEqual(Object.keys(JSON.parse(check)), [
      'onnxruntime',
      'numpy',
      'python',
      'model',
      'providers',
    ]);
  });
});
