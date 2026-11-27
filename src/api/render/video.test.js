import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as kit from './testkit.js';

const { createClip, createEdl, createTrack } = kit;
const [W, H] = [320, 180];
const RED = [254, 0, 0];
const BLUE = [0, 0, 254];
const LIME = [0, 255, 0];
const BLACK = [0, 0, 0];

/** Assert a pixel is within a tolerance of a colour. */
function isColor(actual, expected, label, tolerance = 12) {
  const ok = actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance);
  assert.ok(ok, `${label}: got rgb(${actual}) expected ~rgb(${expected})`);
}

describe('render: video layers', () => {
  const tmp = kit.scratch();
  const file = (name) => join(tmp.dir, name);
  const edl = (...tracks) => createEdl({ resolution: `${W}x${H}`, fps: 30, tracks });
  const clip = (name, start, end, more = {}) =>
    createClip({
      ...{ sourceFile: file(name), sourceIn: 0, sourceOut: end - start },
      ...{ timelineStart: start, timelineEnd: end, ...more },
    });
  const shoot = async (document, options) => {
    const { output, plan } = await kit.render(document, tmp.dir, options);
    return { output, plan, frames: await kit.readFrames(output, plan.width, plan.height) };
  };

  before(async () => {
    await kit.generate(file('red.mp4'), ['color=red:s=320x180:r=30:d=3']);
    await kit.generate(file('blue.mp4'), ['color=blue:s=320x180:r=30:d=3']);
    const bands = ['color=red:s=320x70:r=30:d=2', 'color=lime:s=320x180:r=30:d=2'];
    const stack = ['-filter_complex', '[0][1][2]vstack=inputs=3'];
    await kit.generate(file('bands.mp4'), [...bands, 'color=blue:s=320x70:r=30:d=2'], stack);
    await kit.generate(file('photo.png'), ['color=lime:s=200x100'], ['-frames:v', '1']);
  });
  after(() => tmp.cleanup());

  it('renders one clip with the right size, rate, length and streams per preset', async () => {
    const document = edl(createTrack('video', { clips: [clip('red.mp4', 0, 2)] }));
    for (const [preset, width, height] of [
      ['draft', 160, 90],
      ['standard', 320, 180],
      ['high', 320, 180],
    ]) {
      const { output, frames } = await shoot(document, { preset });
      const info = await kit.inspect(output);
      assert.equal(info.video.codec_name, 'h264', preset);
      assert.equal(info.video.pix_fmt, 'yuv420p', preset);
      assert.deepEqual([info.video.width, info.video.height], [width, height], preset);
      assert.equal(info.video.r_frame_rate, '30/1', preset);
      assert.equal(Number(info.video.nb_read_frames), 60, preset);
      assert.equal(info.video.color_space, 'bt709', preset);
      assert.equal(info.audio.codec_name, 'aac', preset);
      assert.deepEqual([info.audio.sample_rate, info.audio.channels], ['48000', 2], preset);
      assert.ok(Math.abs(info.duration - 2) <= 1 / 30, `${preset} duration ${info.duration}`);
      assert.equal(frames.count, 60);
      isColor(frames.at(30, width / 2, height / 2), RED, preset);
    }
  });

  it('puts the first video track in front and honours scale and x offset', async () => {
    const small = { transform: { scaleX: 0.5, scaleY: 0.5, x: 80 } };
    const { frames } = await shoot(
      edl(
        createTrack('video', { clips: [clip('red.mp4', 0, 1, small)] }),
        createTrack('video', { clips: [clip('blue.mp4', 0, 1)] }),
      ),
    );
    // Half-size clip, centred then moved right by 80: covers x 160..320, y 45..135.
    isColor(frames.at(15, 240, 90), RED, 'inside the front clip');
    isColor(frames.at(15, 165, 50), RED, 'front clip top-left corner');
    isColor(frames.at(15, 154, 90), BLUE, 'left of the front clip');
    isColor(frames.at(15, 240, 40), BLUE, 'above the front clip');
    isColor(frames.at(15, 240, 140), BLUE, 'below the front clip');
    isColor(frames.at(15, 80, 90), BLUE, 'back track where the front was before the offset');
  });

  it('hides muted tracks and plays only solo tracks', async () => {
    const tracks = (front, back) =>
      edl(
        createTrack('video', { ...front, clips: [clip('red.mp4', 0, 1)] }),
        createTrack('video', { ...back, clips: [clip('blue.mp4', 0, 1)] }),
      );
    isColor((await shoot(tracks({}, {}))).frames.at(10, 160, 90), RED, 'both on');
    isColor((await shoot(tracks({ muted: true }, {}))).frames.at(10, 160, 90), BLUE, 'front muted');
    isColor((await shoot(tracks({}, { solo: true }))).frames.at(10, 160, 90), BLUE, 'back solo');
  });

  it('dissolves a cross-fade: 50/50 at the midpoint and not darker', async () => {
    const track = createTrack('video', {
      clips: [clip('red.mp4', 0, 2, { fadeOut: 1 }), clip('blue.mp4', 1, 3, { fadeIn: 1 })],
    });
    const { frames } = await shoot(edl(track));
    assert.equal(frames.count, 90);
    isColor(frames.at(20, 160, 90), RED, 'before the overlap');
    const mid = frames.at(45, 160, 90);
    isColor(mid, [127, 0, 127], 'midpoint blend', 8);
    assert.ok(mid[0] + mid[2] >= 245, `midpoint keeps full energy, got rgb(${mid})`);
    // The outgoing clip stays opaque: a quarter in, it is 75% red + 25% blue.
    isColor(frames.at(37, 160, 90), [194, 0, 60], 'a quarter into the dissolve', 10);
    isColor(frames.at(75, 160, 90), BLUE, 'after the overlap');
  });

  it('fades out to black, or to the track behind, when nothing dissolves over', async () => {
    const fading = clip('red.mp4', 0, 2, { fadeIn: 0.5, fadeOut: 1 });
    const alone = await shoot(edl(createTrack('video', { clips: [fading] })));
    isColor(alone.frames.at(0, 160, 90), BLACK, 'fade-in starts transparent', 4);
    isColor(alone.frames.at(7, 160, 90), [119, 0, 0], 'fade-in halfway', 10);
    isColor(alone.frames.at(20, 160, 90), RED, 'fully visible');
    isColor(alone.frames.at(45, 160, 90), [127, 0, 0], 'fade-out midpoint', 8);
    isColor(alone.frames.at(59, 160, 90), [8, 0, 0], 'last frame almost gone', 8);
    const over = await shoot(
      edl(
        createTrack('video', { clips: [fading] }),
        createTrack('video', { clips: [clip('blue.mp4', 0, 2)] }),
      ),
    );
    isColor(over.frames.at(45, 160, 90), [127, 0, 127], 'fades to the lower track', 8);
  });

  it('letterboxes with contain and crops with cover', async () => {
    // bands.mp4 is 320x320: red (70 rows), lime (180 rows), blue (70 rows).
    const fit = (value) =>
      edl(createTrack('video', { clips: [clip('bands.mp4', 0, 1, { transform: { fit: value } })] }));
    const contain = (await shoot(fit('contain'))).frames;
    isColor(contain.at(10, 30, 90), BLACK, 'contain: left bar');
    isColor(contain.at(10, 290, 90), BLACK, 'contain: right bar');
    isColor(contain.at(10, 160, 15), RED, 'contain: top band');
    isColor(contain.at(10, 160, 90), LIME, 'contain: middle band');
    isColor(contain.at(10, 160, 165), BLUE, 'contain: bottom band');
    isColor(contain.at(10, 76, 90), LIME, 'contain: picture starts at x=70');
    isColor(contain.at(10, 64, 90), BLACK, 'contain: bar ends at x=70');
    const cover = (await shoot(fit('cover'))).frames;
    for (const [x, y] of [[4, 4], [160, 4], [316, 176], [160, 176]])
      isColor(cover.at(10, x, y), LIME, `cover: only the middle band is visible at ${x},${y}`);
  });

  it('crops, sets opacity, flips and rotates about the anchor', async () => {
    const one = (transform) =>
      shoot(edl(createTrack('video', { clips: [clip('bands.mp4', 0, 1, { transform })] })));
    // Top 70/320 cropped away, contained: 250 rows scaled to 180 → lime starts at the top.
    const cropped = (await one({ fit: 'contain', cropTop: 70 / 320 })).frames;
    isColor(cropped.at(5, 160, 6), LIME, 'crop removed the red band');
    isColor(cropped.at(5, 160, 172), BLUE, 'blue band still at the bottom');
    const flipped = (await one({ fit: 'contain', scaleY: -1 })).frames;
    isColor(flipped.at(5, 160, 15), BLUE, 'vertical flip puts blue on top');
    const ghost = (await one({ opacity: 0.5 })).frames;
    isColor(ghost.at(5, 160, 90), [0, 127, 0], 'half opacity over black', 8);
    // 90° clockwise about the centre: the contained 180x180 square stays put,
    // red moves from the top edge to the right edge.
    const turned = (await one({ fit: 'contain', rotation: 90 })).frames;
    isColor(turned.at(5, 235, 90), RED, 'rotated: red band on the right');
    isColor(turned.at(5, 85, 90), BLUE, 'rotated: blue band on the left');
    isColor(turned.at(5, 160, 15), LIME, 'rotated: lime spans top to bottom');
    // Half size (90x90 at 115,45), rotated 90° about its top-left corner: swings to x 25..115.
    const swung = await one({ fit: 'contain', scaleX: 0.5, scaleY: 0.5, rotation: 90, anchorX: 0, anchorY: 0 });
    const box = swung.frames.box(5, (rgb) => rgb[0] + rgb[1] + rgb[2] > 60);
    for (const [i, want] of [25, 45, 114, 134].entries())
      assert.ok(Math.abs(box[i] - want) <= 2, `rotated box ${box} vs 25,45,114,134`);
  });

  it('holds a still image for its free duration', async () => {
    const still = createClip({
      ...{ sourceFile: file('photo.png'), timelineStart: 0.5, timelineEnd: 2 },
      transform: { fit: 'contain' },
    });
    const { frames, plan } = await shoot(edl(createTrack('video', { clips: [still] })));
    assert.equal(frames.count, 60);
    assert.equal(plan.inputs[0].kind, 'image');
    isColor(frames.at(14, 160, 90), BLACK, 'before the image');
    isColor(frames.at(15, 160, 90), LIME, 'first image frame');
    isColor(frames.at(59, 160, 90), LIME, 'last image frame');
    // 200x100 contained in 320x180 is 320x160: 10 rows of black above and below.
    isColor(frames.at(30, 160, 4), BLACK, 'letterbox above the image');
    isColor(frames.at(30, 160, 14), LIME, 'image starts at y=10');
  });
});
