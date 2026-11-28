/**
 * Which frame is where: frame n of a cutout shows the frame of the source
 * the renderer shows at `start + n / fps` — whatever the two frame rates —
 * and the matte beside it was made from exactly that picture. Proved with
 * videos whose frames carry their own number.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as cutout from '../../src/api/cutout/index.js';
import { cutoutTime } from '../../src/utils/cutout/index.js';
import * as kit from './kit.js';

const [W, H] = [320, 180];

describe('frames of a cutout', () => {
  let box;
  /** @type {Record<number, string>} A numbered video per frame rate */
  const videos = {};
  /** The numbers in both halves of every frame of a cutout, read as the renderer reads footage. */
  const numbersOf = async (made) => {
    const window = { seek: 0, count: made.frames, fps: made.fps, width: 2 * W, height: H };
    const frames = await kit.renderFrames(made.file, window);
    return frames.map((frame) => {
      const { picture, matte } = kit.halves(frame, W, H, 4);
      return [kit.frameNumber(picture, W), kit.frameNumber(matte, W, 1)];
    });
  };
  /** The numbers the renderer shows for a stretch of a source. */
  const shown = async (file, seek, count, fps) => {
    const frames = await kit.renderFrames(file, { seek, count, fps, width: W, height: H });
    return frames.map((frame) => kit.frameNumber(frame, W, 4));
  };

  before(() => {
    box = kit.cutoutSandbox('cutout-frames');
    // The matte is the bright part of the picture it was given: it carries the number too.
    kit.useFake(box, '--shape luma');
    for (const fps of [24, 25, 30, 60])
      videos[fps] = kit.numbered(join(box.project, `n${fps}.mp4`), { fps, frames: fps * 3 });
  });
  after(() => {
    delete process.env.CUTOUT_COMMAND;
    assert.deepEqual(kit.debris(box.project), []);
    assert.deepEqual(kit.leftovers(box.root), []);
    box.cleanup();
  });

  const cases = [
    { source: 30, fps: 30, start: 0.5, end: 1.5 },
    { source: 24, fps: 30, start: 0.5, end: 1.5 },
    { source: 60, fps: 30, start: 1 / 3, end: 1.4 },
    { source: 25, fps: 24, start: 0.25, end: 1.25 },
    { source: 30, fps: 29.97, start: 0.7, end: 1.7 },
    { source: 30, fps: 60, start: 1, end: 1.5 },
  ];
  for (const { source, fps, start, end } of cases) {
    it(`a ${source} fps file cut out at ${fps}: frame n is what a render shows at start + n / fps`, async () => {
      const file = videos[source];
      const made = await cutout.makeCutout({ folder: box.project, path: file, start, end, fps });
      const numbers = await numbersOf(made);
      const expected = await shown(file, made.start, made.frames, fps);
      assert.equal(numbers.length, made.frames);
      assert.deepEqual(
        numbers.map(([picture]) => picture),
        expected,
      );
      assert.ok(new Set(expected).size > made.frames / 3, `not one frame held: ${expected}`);
      // The same whether a render takes the stretch whole or one frame at a time.
      for (const n of [0, 7, made.frames - 1])
        assert.deepEqual(await shown(file, made.start + n / made.fps, 1, fps), [expected[n]]);
      // And the matte of every frame was made from the picture beside it.
      for (const [picture, matte] of numbers) assert.equal(matte, picture);
    });
  }

  it('shows the very frames of a 30 fps file, and repeats them for a 24 fps one', async () => {
    const same = await cutout.makeCutout({
      folder: box.project,
      path: videos[30],
      start: 0.5,
      end: 1.5,
      fps: 30,
    });
    assert.deepEqual(
      (await numbersOf(same)).map(([n]) => n),
      Array.from({ length: 30 }, (_, n) => 15 + n),
    );
    const slow = await cutout.makeCutout({
      folder: box.project,
      path: videos[24],
      start: 0.5,
      end: 1.5,
      fps: 30,
    });
    const numbers = (await numbersOf(slow)).map(([n]) => n);
    assert.deepEqual(numbers.slice(0, 6), [12, 13, 13, 14, 15, 16]);
    assert.equal(numbers.at(-1), 35);
  });

  it('gives a clip its frames through cutoutTime, wherever the clip starts', async () => {
    const made = await cutout.makeCutout({
      folder: box.project,
      path: videos[30],
      start: 0.5,
      end: 2.5,
      fps: 30,
    });
    const numbers = (await numbersOf(made)).map(([n]) => n);
    const meta = cutout.readMeta(box.project, made.key);
    // A clip that starts at 0.8 s of the file, and one trimmed off the frame grid.
    for (const sourceIn of [0.8, 1.2 + 0.4 / 30, 2]) {
      const render = await shown(videos[30], sourceIn, 12, 30);
      const fromFile = Array.from({ length: 12 }, (_, j) => cutoutTime(meta, sourceIn + j / 30));
      assert.deepEqual(
        fromFile.map(({ frame }) => numbers[frame]),
        render,
        `clip from ${sourceIn}`,
      );
      assert.ok(fromFile.every(({ inside }) => inside));
    }
  });

  it('holds the last frame where the range runs past the end of the file', async () => {
    const made = await cutout.makeCutout({
      folder: box.project,
      path: videos[30],
      start: 2.5,
      end: 3.5,
      fps: 30,
    });
    const numbers = await numbersOf(made);
    assert.deepEqual(
      numbers.map(([n]) => n),
      await shown(videos[30], 2.5, 30, 30),
    );
    assert.deepEqual(
      numbers.slice(-16).map(([n]) => n),
      Array(16).fill(89),
    );
    for (const [picture, matte] of numbers) assert.equal(matte, picture);
  });

  it('keeps picture and matte together when the matte program answers late', async () => {
    kit.useFake(box, '--shape luma --hold 5');
    const made = await cutout.makeCutout({
      folder: box.project,
      path: videos[30],
      start: 1,
      end: 2,
      fps: 30,
    });
    const numbers = await numbersOf(made);
    assert.deepEqual(
      numbers.map(([n]) => n),
      Array.from({ length: 30 }, (_, n) => 30 + n),
    );
    for (const [picture, matte] of numbers) assert.equal(matte, picture);
  });
  it('cuts a video filmed on its side out the way it is shown', async () => {
    kit.useFake(box, '--shape luma');
    const turned = join(box.project, 'turned.mp4');
    kit.ffmpeg(['-display_rotation', '90', '-i', videos[30], '-c', 'copy', turned]);
    const made = await cutout.makeCutout({
      folder: box.project,
      path: turned,
      start: 0.5,
      end: 1,
      fps: 30,
    });
    assert.deepEqual([made.width, made.height, made.frames], [H, W, 15]);
    const window = { count: 15, fps: 30, height: W };
    const packed = await kit.renderFrames(made.file, { ...window, seek: 0, width: 2 * H });
    const upright = await kit.renderFrames(turned, { ...window, seek: 0.5, width: H });
    packed.forEach((frame, n) => {
      const { picture, matte } = kit.halves(frame, H, W, 4);
      assert.ok(kit.psnr(picture, upright[n], 4) > 40, `frame ${n} is the upright picture`);
      // The matte is the bright part of the picture beside it — turned with it.
      for (let i = 0; i < matte.length; i += 7) {
        const green = picture[i * 3 + 1];
        if (green < 60 || green > 200) assert.equal(matte[i] >= 128, green >= 128, `pixel ${i}`);
      }
    });
  });
});
