import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '../lib/ffmpeg.js';
import * as kit from './testkit.js';

const { createClip, createEdl, createTrack } = kit;
const RED = [254, 0, 0];
const BLUE = [0, 0, 254];
const BLACK = [0, 0, 0];
const lit = (rgb) => rgb[0] + rgb[1] + rgb[2] > 60;
const reddish = (rgb) => rgb[0] > 128 && rgb[2] < 100;

function isColor(actual, expected, label, tolerance = 12) {
  const ok = actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance);
  assert.ok(ok, `${label}: got rgb(${actual}) expected ~rgb(${expected})`);
}

function isBox(actual, expected, label, tolerance = 2) {
  const ok = actual && expected.every((v, i) => Math.abs(v - actual[i]) <= tolerance);
  assert.ok(ok, `${label}: got box ${actual} expected ~${expected}`);
}

describe('render: ken burns, ranges and awkward sources', () => {
  const tmp = kit.scratch();
  const file = (name) => join(tmp.dir, name);
  const edl = (...tracks) => createEdl({ resolution: '320x180', fps: 30, tracks });
  const clip = (name, start, end, more = {}) =>
    createClip({
      ...{ sourceFile: file(name), sourceIn: 0, sourceOut: end - start },
      ...{ timelineStart: start, timelineEnd: end, ...more },
    });
  const video = (...clips) => createTrack('video', { clips });
  const shoot = async (document, options) => {
    const { output, plan } = await kit.render(document, tmp.dir, options);
    return { output, plan, frames: await kit.readFrames(output, plan.width, plan.height) };
  };
  const halves = (size, rate = 30) => [
    `color=red:s=${size}:r=${rate}:d=3`,
    `color=blue:s=${size}:r=${rate}:d=3`,
  ];
  const side = ['-filter_complex', '[0][1]hstack'];

  before(async () => {
    await kit.generate(file('red.mp4'), ['color=red:s=320x180:r=30:d=3']);
    await kit.generate(file('blue.mp4'), ['color=blue:s=320x180:r=30:d=3']);
    await kit.generate(file('halves.mp4'), halves('160x180'), side);
    // Phone-style: stored 320x180, flagged to be shown rotated (180x320).
    const rotate = ['-hide_banner', '-loglevel', 'error', '-y', '-display_rotation', '90'];
    await run('ffmpeg', [...rotate, '-i', file('halves.mp4'), '-c', 'copy', file('phone.mp4')]);
    // Non-square pixels: stored 160x180, shown 320x180.
    const wide = ['-filter_complex', '[0][1]hstack,setsar=2/1'];
    await kit.generate(file('anamorphic.mp4'), halves('80x180'), wide);
    // 60 fps, 4:4:4 chroma.
    await kit.generate(file('fast.mp4'), halves('160x180', 60), [...side, '-pix_fmt', 'yuv444p']);
    // HD in BT.709, as cameras write it — tagged and untagged.
    const hd =
      'color=red:s=1280x720:r=30:d=1,format=rgb24,' +
      'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p';
    await kit.generate(file('hd709.mp4'), [hd], ['-colorspace', 'bt709']);
    await kit.generate(file('hd-untagged.mp4'), [hd]);
    // A JPEG is full-range BT.601 whatever its size.
    const still = ['-frames:v', '1', '-q:v', '2'];
    await kit.generate(file('photo.jpg'), ['color=red:s=1280x720'], still);
    // A phone photo: stored landscape with an EXIF tag saying "show rotated".
    await kit.generate(file('plain.jpg'), halves('160x180'), [...side, ...still]);
    const exif = '457869660000 49492a0008000000 0100 1201 0300 01000000 06000000 00000000';
    const tag = Buffer.from(`ffe10022${exif.replaceAll(' ', '')}`, 'hex');
    const jpeg = readFileSync(file('plain.jpg'));
    writeFileSync(file('upright.jpg'), Buffer.concat([jpeg.subarray(0, 2), tag, jpeg.subarray(2)]));
  });
  after(() => tmp.cleanup());

  it('moves a ken-burns clip linearly between its start and end placement', async () => {
    const pan = { enabled: true, startScale: 0.5, endScale: 0.5, startX: -80, endX: 80 };
    const moving = clip('red.mp4', 0, 2, { transform: { kenBurns: pan } });
    const { frames } = await shoot(edl(video(moving)));
    isBox(frames.box(0, lit), [0, 45, 159, 134], 'start: left');
    isBox(frames.box(30, lit), [80, 45, 239, 134], 'middle: centred');
    isBox(frames.box(59, lit), [157, 45, 316, 134], 'end: right');
  });

  it('zooms a ken-burns clip, also when it is rotated', async () => {
    const zoom = { enabled: true, startScale: 0.25, endScale: 0.75 };
    const { frames } = await shoot(
      edl(video(clip('red.mp4', 0, 2, { transform: { kenBurns: zoom } }))),
    );
    isBox(frames.box(0, lit), [120, 68, 199, 112], 'start: quarter size');
    isBox(frames.box(30, lit), [80, 45, 239, 134], 'middle: half size');
    const turned = clip('red.mp4', 0, 2, { transform: { rotation: 90, kenBurns: zoom } });
    const rotated = (await shoot(edl(video(turned)))).frames;
    isBox(rotated.box(30, lit), [115, 10, 204, 169], 'rotated, middle: 90x160 upright');
  });

  it('animates the crop of a ken-burns clip', async () => {
    const wipe = { enabled: true, startCropLeft: 0, endCropLeft: 0.5 };
    const { frames } = await shoot(
      edl(video(clip('halves.mp4', 0, 2, { transform: { kenBurns: wipe } }))),
    );
    // Red is the left half of the source; cropping from the left pushes it out.
    isBox(frames.box(0, reddish), [0, 0, 159, 179], 'start: red fills the left half');
    const middle = frames.box(30, reddish);
    assert.ok(Math.abs(middle[2] - 106) <= 4, `middle: red ends near x=106, got ${middle}`);
    assert.equal(
      frames.box(59, reddish) && frames.box(59, reddish)[2] > 8,
      false,
      'end: red is gone',
    );
    isColor(frames.at(59, 160, 90), BLUE, 'end: all blue');
  });

  it('renders a range: right length, right content, fades picked up part-way', async () => {
    const track = video(clip('red.mp4', 0, 2, { fadeIn: 2 }), clip('blue.mp4', 2, 4));
    const { output, frames, plan } = await shoot(edl(track), { range: { start: 1.5, end: 3 } });
    const info = await kit.inspect(output);
    assert.equal(plan.duration, 1.5);
    assert.equal(Number(info.video.nb_read_frames), 45);
    assert.ok(Math.abs(info.duration - 1.5) <= 1 / 30, `duration ${info.duration}`);
    assert.ok(Math.abs(Number(info.audio.duration) - 1.5) <= 0.03, `audio ${info.audio.duration}`);
    isColor(frames.at(0, 160, 90), [191, 0, 0], 'range starts 75% into the fade-in', 8);
    isColor(frames.at(14, 160, 90), [250, 0, 0], 'last red frame', 10);
    isColor(frames.at(15, 160, 90), BLUE, 'cut to blue at 2.0s');
    isColor(frames.at(44, 160, 90), BLUE, 'last frame');
  });

  it('uses displayed size for rotated and non-square-pixel sources', async () => {
    const contain = { transform: { fit: 'contain' } };
    const phone = (await shoot(edl(video(clip('phone.mp4', 0, 1, contain))))).frames;
    // Shown as 180x320 → contained 101x180 at x 109..210, the halves now stacked.
    isBox(phone.box(10, lit), [109, 0, 210, 179], 'rotated source is pillarboxed', 3);
    const top = phone.at(10, 160, 40);
    const bottom = phone.at(10, 160, 140);
    assert.ok(reddish(top) !== reddish(bottom), `halves are stacked: ${top} / ${bottom}`);
    const upright = createClip({
      ...{ sourceFile: file('upright.jpg'), timelineStart: 0, timelineEnd: 1 },
      ...contain,
    });
    const photo = (await shoot(edl(video(upright)))).frames;
    isBox(photo.box(10, lit), [109, 0, 210, 179], 'EXIF-rotated photo is pillarboxed', 3);
    const wide = (await shoot(edl(video(clip('anamorphic.mp4', 0, 1, contain))))).frames;
    isColor(wide.at(10, 20, 90), RED, 'anamorphic source fills the frame (left)');
    isColor(wide.at(10, 300, 90), BLUE, 'anamorphic source fills the frame (right)');
    isColor(wide.at(10, 150, 90), RED, 'its halves meet in the middle');
    isColor(wide.at(10, 170, 90), BLUE, 'its halves meet in the middle');
  });

  it('conforms frame rate and pixel format, and keeps colours true', async () => {
    const fast = await shoot(edl(video(clip('fast.mp4', 0, 2))));
    assert.equal(fast.frames.count, 60, '60 fps source becomes 60 frames in 2 s at 30 fps');
    isColor(fast.frames.at(30, 80, 90), RED, '4:4:4 source, left');
    isColor(fast.frames.at(30, 240, 90), BLUE, '4:4:4 source, right');
    for (const name of ['hd709.mp4', 'hd-untagged.mp4']) {
      const hd = await shoot(edl(video(clip(name, 0, 1))));
      isColor(hd.frames.at(10, 160, 90), [255, 0, 0], `${name} stays pure red`, 6);
    }
    const jpeg = createClip({ sourceFile: file('photo.jpg'), timelineStart: 0, timelineEnd: 1 });
    const photo = await shoot(edl(video(jpeg)));
    isColor(photo.frames.at(10, 160, 90), [255, 0, 0], 'JPEG stays pure red', 6);
    isColor(photo.frames.at(29, 160, 90), [255, 0, 0], 'JPEG held to the end', 6);
  });

  it('holds the last frame when a source is shorter than its clip', async () => {
    // red.mp4 lasts 3 s; the clip asks for 4 s of it.
    const { frames } = await shoot(edl(video(clip('red.mp4', 0, 4))));
    assert.equal(frames.count, 120);
    isColor(frames.at(119, 160, 90), RED, 'last frame is held, not black');
  });

  it('leaves gaps black', async () => {
    const { frames } = await shoot(edl(video(clip('red.mp4', 1, 2))));
    isColor(frames.at(10, 160, 90), BLACK, 'gap before the clip');
    isColor(frames.at(29, 160, 90), BLACK, 'frame before the clip');
    isColor(frames.at(30, 160, 90), RED, 'first frame of the clip');
  });
});
