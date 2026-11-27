import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '../../lib/ffmpeg.js';
import { prepareRender } from '../prepare.js';
import * as kit from '../testkit.js';
import { buildCanvasPlan } from './plan.js';
import { decodeSize } from './sizes.js';

/**
 * Footage on the canvas path: what FFmpeg decodes for the compositor must
 * be what a viewer sees — the right orientation, shape, colour and frame.
 */

const { createClip, createEdl, createTrack } = kit;
const RED = [254, 0, 0];
const BLUE = [0, 0, 254];
const lit = (rgb) => rgb[0] + rgb[1] + rgb[2] > 60;
const reddish = (rgb) => rgb[0] > 128 && rgb[2] < 100;

function isColor(actual, expected, label, tolerance = 12) {
  const ok = actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance);
  assert.ok(ok, `${label}: got rgb(${actual}) expected ~rgb(${expected})`);
}

function isBox(actual, expected, label, tolerance = 3) {
  const ok = actual && expected.every((v, i) => Math.abs(v - actual[i]) <= tolerance);
  assert.ok(ok, `${label}: got box ${actual} expected ~${expected}`);
}

describe('canvas path: footage', () => {
  const tmp = kit.scratch();
  const file = (name) => join(tmp.dir, name);
  const edl = (tracks, more = {}) => createEdl({ resolution: '320x180', fps: 30, tracks, ...more });
  const clip = (name, start, end, more = {}) =>
    createClip({ sourceFile: file(name), timelineStart: start, timelineEnd: end, ...more });
  const video = (...clips) => createTrack('video', { clips });
  const shoot = async (document, options, hooks) => {
    const { output, width, height } = await kit.draw(document, tmp.dir, options, hooks);
    return { output, frames: await kit.readFrames(output, width, height) };
  };
  const halves = (size, rate = 30) => [
    `color=red:s=${size}:r=${rate}:d=3`,
    `color=blue:s=${size}:r=${rate}:d=3`,
  ];
  const side = ['-filter_complex', '[0][1]hstack'];
  const contain = { transform: { fit: 'contain' } };

  before(async () => {
    await kit.generate(file('red.mp4'), ['color=red:s=320x180:r=30:d=3']);
    await kit.generate(file('halves.mp4'), halves('160x180'), side);
    // Phone-style: stored 320x180, flagged to be shown rotated (180x320).
    const rotate = ['-hide_banner', '-loglevel', 'error', '-y', '-display_rotation', '90'];
    await run('ffmpeg', [...rotate, '-i', file('halves.mp4'), '-c', 'copy', file('phone.mp4')]);
    // Non-square pixels: stored 160x180, shown 320x180.
    const wide = ['-filter_complex', '[0][1]hstack,setsar=2/1'];
    await kit.generate(file('anamorphic.mp4'), halves('80x180'), wide);
    await kit.generate(file('fast.mp4'), halves('160x180', 60), [...side, '-pix_fmt', 'yuv444p']);
    const deep = [...side, '-pix_fmt', 'yuv420p10le'];
    await kit.generate(file('deep.mp4'), halves('160x180'), deep);
    const hd =
      'color=red:s=1280x720:r=30:d=1,format=rgb24,' +
      'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p';
    await kit.generate(file('hd709.mp4'), [hd], ['-colorspace', 'bt709']);
    await kit.generate(file('hd-untagged.mp4'), [hd]);
    // Half-transparent red, with an alpha channel all the way through.
    const glass = ['color=c=red@0.5:s=320x180:r=30:d=2,format=rgba'];
    await kit.generate(file('glass.mov'), glass, ['-c:v', 'png']);
    const numbered = `nullsrc=s=256x16:r=30:d=3,geq=lum='if(between(X,N*4,N*4+3),235,16)':cb=128:cr=128`;
    await kit.generate(file('numbered.mp4'), [numbered], ['-crf', '10']);
    // A phone photo: stored landscape with an EXIF tag saying "show rotated".
    const still = ['-frames:v', '1', '-q:v', '2'];
    await kit.generate(file('plain.jpg'), halves('160x180'), [...side, ...still]);
    const exif = '457869660000 49492a0008000000 0100 1201 0300 01000000 06000000 00000000';
    const tag = Buffer.from(`ffe10022${exif.replaceAll(' ', '')}`, 'hex');
    const jpeg = readFileSync(file('plain.jpg'));
    writeFileSync(file('upright.jpg'), Buffer.concat([jpeg.subarray(0, 2), tag, jpeg.subarray(2)]));
  });
  after(() => tmp.cleanup());

  it('reduces a large still with FFmpeg before the canvas draws it', async () => {
    // Fine stripes, a big photo, a big photo with an EXIF turn, a big picture with alpha.
    const stripes = "nullsrc=s=1920x64,geq=lum='if(eq(mod(X,3),0),255,0)':cb=128:cr=128";
    await kit.generate(file('stripes.png'), [stripes], ['-frames:v', '1', '-pix_fmt', 'gray']);
    const still = ['-frames:v', '1', '-q:v', '2'];
    await kit.generate(file('photo.jpg'), ['color=red:s=1280x720'], still);
    await kit.generate(file('big.jpg'), halves('640x720'), [...side, ...still]);
    const exif = '457869660000 49492a0008000000 0100 1201 0300 01000000 06000000 00000000';
    const tag = Buffer.from(`ffe10022${exif.replaceAll(' ', '')}`, 'hex');
    const jpeg = readFileSync(file('big.jpg'));
    writeFileSync(file('turned.jpg'), Buffer.concat([jpeg.subarray(0, 2), tag, jpeg.subarray(2)]));
    const glass = 'color=c=red@0.5:s=640x360,format=rgba';
    await kit.generate(file('pane.png'), [glass], ['-frames:v', '1']);

    const striped = edl([video(clip('stripes.png', 0, 1, contain))]);
    const { probes } = await prepareRender(striped);
    const plan = buildCanvasPlan(striped, { probes });
    assert.deepEqual(
      plan.stills.map((s) => [s.file, s.width, s.height]),
      [[file('stripes.png'), 320, 11]],
    );
    assert.match(plan.stills[0].args.join(' '), /-frames:v 1 -vf scale=w=320:h=11:/);
    const { frames } = await shoot(striped, { preset: 'high' });
    const row = Array.from({ length: 300 }, (_, i) => frames.at(10, 10 + i, 90)[1]);
    const [low, high] = [Math.min(...row), Math.max(...row)];
    // A third of the pixels are white: an even grey, not the moiré of a careless reduction.
    assert.ok(high - low < 50 && low > 50 && high < 140, `stripes average out: ${low}..${high}`);

    const photo = (await shoot(edl([video(clip('photo.jpg', 0, 1))]))).frames;
    isColor(photo.at(10, 160, 90), [255, 0, 0], 'a reduced JPEG stays pure red', 6);
    const turned = (await shoot(edl([video(clip('turned.jpg', 0, 1, contain))]))).frames;
    const small = (await shoot(edl([video(clip('upright.jpg', 0, 1, contain))]))).frames;
    isBox(turned.box(10, lit), [109, 0, 210, 179], 'the turned photo is 720x1280 on screen');
    const upper = (shot, x) => reddish(shot.at(10, x, 40));
    assert.equal(upper(turned, 160), upper(small, 160), 'turned the same way as by the canvas');
    assert.notEqual(upper(turned, 160), reddish(turned.at(10, 160, 140)), 'its halves are stacked');
    const backdrop = createClip({
      ...{ timelineStart: 0, timelineEnd: 1 },
      generator: { type: 'solid', params: { color: '#0000ff' } },
    });
    const pane = (await shoot(edl([video(clip('pane.png', 0, 1)), video(backdrop)]))).frames;
    isColor(pane.at(10, 160, 90), [128, 0, 127], 'a reduced still keeps its alpha', 8);
  });

  it('uses the displayed size of rotated and non-square-pixel sources', async () => {
    const phone = (await shoot(edl([video(clip('phone.mp4', 0, 1, contain))]))).frames;
    // Shown as 180x320 → contained 101x180 at x 109..210, the halves now stacked.
    isBox(phone.box(10, lit), [109, 0, 210, 179], 'rotated source is pillarboxed');
    const [top, bottom] = [phone.at(10, 160, 40), phone.at(10, 160, 140)];
    assert.ok(reddish(top) !== reddish(bottom), `halves are stacked: ${top} / ${bottom}`);
    const photo = (await shoot(edl([video(clip('upright.jpg', 0, 1, contain))]))).frames;
    isBox(photo.box(10, lit), [109, 0, 210, 179], 'EXIF-rotated photo is pillarboxed');
    const wide = (await shoot(edl([video(clip('anamorphic.mp4', 0, 1, contain))]))).frames;
    isColor(wide.at(10, 20, 90), RED, 'anamorphic source fills the frame (left)');
    isColor(wide.at(10, 300, 90), BLUE, 'anamorphic source fills the frame (right)');
    isColor(wide.at(10, 150, 90), RED, 'its halves meet in the middle');
    isColor(wide.at(10, 170, 90), BLUE, 'its halves meet in the middle');
  });

  it('conforms frame rate and pixel format, and keeps colours true', async () => {
    const fast = (await shoot(edl([video(clip('fast.mp4', 0, 2))]))).frames;
    assert.equal(fast.count, 60, '60 fps source becomes 60 frames in 2 s at 30 fps');
    isColor(fast.at(30, 80, 90), RED, '4:4:4 source, left');
    isColor(fast.at(30, 240, 90), BLUE, '4:4:4 source, right');
    const deep = (await shoot(edl([video(clip('deep.mp4', 0, 1))]))).frames;
    isColor(deep.at(10, 80, 90), RED, '10-bit source, left');
    isColor(deep.at(10, 240, 90), BLUE, '10-bit source, right');
    for (const name of ['hd709.mp4', 'hd-untagged.mp4', 'red.mp4']) {
      const shot = (await shoot(edl([video(clip(name, 0, 1))]))).frames;
      isColor(shot.at(10, 160, 90), [255, 0, 0], `${name} stays pure red`, 6);
    }
  });

  it('composites footage that has an alpha channel', async () => {
    const backdrop = createClip({
      ...{ timelineStart: 0, timelineEnd: 1 },
      generator: { type: 'solid', params: { color: '#0000ff' } },
    });
    const document = edl([video(clip('glass.mov', 0, 1)), video(backdrop)]);
    const { frames } = await shoot(document);
    isColor(frames.at(10, 160, 90), [128, 0, 127], 'half red over blue', 8);
    const dimmed = edl([
      video(clip('glass.mov', 0, 1, { transform: { opacity: 0.5 } })),
      video(backdrop),
    ]);
    isColor((await shoot(dimmed)).frames.at(10, 160, 90), [64, 0, 191], 'and at half opacity', 8);
  });

  it('reads one file for several clips at once, each from its own position', async () => {
    const strip = (sourceIn, y) =>
      clip('numbered.mp4', 0, 0.5, { sourceIn, transform: { fit: 'contain', y } });
    const document = edl([video(strip(1, -8)), video(strip(0.2, 8))], { resolution: '256x32' });
    const { frames } = await shoot(document, { preset: 'high' });
    const shown = (n, row) => {
      let [best, at] = [0, -1];
      for (let x = 0; x < 256; x++) {
        const value = frames.at(n, x, row)[1];
        if (value > best) [best, at] = [value, x];
      }
      return best > 100 ? Math.floor(at / 4) : -1;
    };
    assert.equal(frames.count, 15);
    for (let n = 0; n < 15; n++) {
      assert.equal(shown(n, 8), 30 + n, `top clip, frame ${n}: starts 1 s into the file`);
      assert.equal(shown(n, 24), 6 + n, `bottom clip, frame ${n}: starts 0.2 s into the file`);
    }
  });

  it('holds the last frame of a source that ends early, and says when there is none', async () => {
    const warnings = [];
    const warn = (message) => warnings.push(message);
    // red.mp4 lasts 3 s: one clip asks for 4 s of it, another starts after its end.
    const long = (await shoot(edl([video(clip('red.mp4', 0, 4))]), {}, { warn })).frames;
    assert.equal(long.count, 120);
    isColor(long.at(119, 160, 90), RED, 'the last frame is held to the end');
    assert.deepEqual(warnings, []);
    const past = clip('red.mp4', 0, 1, { clipId: 'late', sourceIn: 5 });
    const document = edl([video(past)], { background: '#00ff00' });
    const none = (await shoot(document, {}, { warn })).frames;
    isColor(none.at(10, 160, 90), [0, 255, 0], 'nothing is drawn: the background shows');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /clip "late": .*red\.mp4 has no picture at this position/);
  });

  it('decodes at the size a clip is shown at, never larger than the source', () => {
    const [hd, uhd] = [
      { width: 1920, height: 1080 },
      { width: 3840, height: 2160 },
    ];
    const at = (transform, more = {}) =>
      createClip({ timelineStart: 0, timelineEnd: 4, transform, ...more });
    assert.deepEqual(decodeSize(at({}), uhd, hd, hd), hd, '4K in an HD frame');
    assert.deepEqual(decodeSize(at({}), uhd, hd, { width: 960, height: 540 }), {
      width: 960,
      height: 540,
    });
    assert.deepEqual(decodeSize(at({ scaleX: 0.25, scaleY: 0.25 }), hd, hd, hd), {
      width: 480,
      height: 270,
    });
    assert.deepEqual(decodeSize(at({ scaleX: 3, scaleY: 3 }), hd, hd, hd), hd, 'never enlarged');
    const zoom = { kenBurns: { enabled: true, startScale: 0.2, endScale: 0.5 } };
    assert.deepEqual(decodeSize(at(zoom), hd, hd, hd), { width: 960, height: 540 }, 'its largest');
    const keys = {
      'transform.scaleX': [
        { t: 0, v: 0.1 },
        { t: 2, v: 0.75 },
        { t: 4, v: 0.1 },
      ],
    };
    const pulsing = at({ scaleY: 0.1 }, { keyframes: keys });
    assert.deepEqual(decodeSize(pulsing, hd, hd, hd), { width: 1440, height: 810 });
    const tall = decodeSize(at({ fit: 'contain' }), { width: 1080, height: 1920 }, hd, hd);
    assert.deepEqual(tall, { width: 608, height: 1081 }, 'proportions are kept');
  });
});
