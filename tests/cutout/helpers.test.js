/**
 * The pure half of the person cutout: the `cutout` block of a clip, the
 * stretches a timeline needs, keys, and time inside a cutout file — and
 * that its frame arithmetic is the renderer's.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { conformFilters } from '../../src/api/render/conform.js';
import { fpsRational } from '../../src/api/render/timing.js';
import * as cutout from '../../src/utils/cutout/index.js';

const { CUTOUT_FIELDS, cutoutKey, cutoutRanges, cutoutTime, coversClip, frameRange } = cutout;
const SOURCE = { path: '/p/selfie.mp4', size: 1535025, mtime: 1715000000000 };
const on = { on: true };
/** A clip of a video with cutout on. */
const clip = (sourceIn, sourceOut, more = {}) => ({
  ...{ clipId: `c${sourceIn}`, sourceFile: '/p/selfie.mp4', sourceIn, sourceOut },
  ...{ timelineStart: 0, timelineEnd: sourceOut - sourceIn, cutout: on, ...more },
});
const doc = (clips, more = {}) => ({ fps: 30, tracks: [{ type: 'video', clips }], ...more });

describe('the cutout block', () => {
  it('has every field with its default, and the table an inspector is made from', () => {
    const block = { on: false, mode: 'remove', feather: 0.4, shrink: 0.3, blur: 3 };
    assert.deepEqual(cutout.normalizeCutout(undefined), block);
    assert.deepEqual({ ...cutout.CUTOUT_DEFAULTS }, block);
    assert.deepEqual(Object.keys(CUTOUT_FIELDS), Object.keys(block));
    for (const [name, spec] of Object.entries(CUTOUT_FIELDS)) {
      assert.ok(spec.label && spec.type, name);
      if (spec.type === 'number') assert.ok(spec.min < spec.max && spec.unit === 'u', name);
    }
    assert.deepEqual(CUTOUT_FIELDS.blur.when, { mode: ['blur'] });
  });

  it('keeps what is usable and holds numbers inside their limits', () => {
    const raw = { on: true, mode: 'blur', feather: '1.5', shrink: -9, blur: 99, colour: 'red' };
    const block = { on: true, mode: 'blur', feather: 1.5, shrink: -3, blur: 20 };
    assert.deepEqual(cutout.normalizeCutout(raw), block);
    const hostile = { on: 'yes', mode: 'erase', feather: NaN, shrink: null, blur: {} };
    assert.deepEqual(cutout.normalizeCutout(hostile), cutout.normalizeCutout(null));
    assert.deepEqual(cutout.normalizeCutout([1, 2]), cutout.normalizeCutout({}));
    const inherited = Object.create({ on: true });
    assert.equal(cutout.normalizeCutout(inherited).on, false, 'only own fields are read');
  });

  it('says what is wrong with a stored block', () => {
    const problems = [];
    const report = (path, message) => problems.push(`${path} ${message}`);
    cutout.checkCutout(undefined, 'c', report);
    cutout.checkCutout(cutout.normalizeCutout({ on: true }), 'c', report);
    assert.deepEqual(problems, []);
    cutout.checkCutout({ on: 1, mode: 'x', feather: 9, shrink: 0, blur: 3, extra: 1 }, 'c', report);
    assert.deepEqual(problems, [
      'c.extra is not a field of a cutout',
      'c.on must be true or false',
      'c.mode must be one of: remove, blur',
      'c.feather must be a number from 0 to 5',
    ]);
    assert.equal(cutout.hasCutout({ cutout: on }), true);
    assert.equal(cutout.hasCutout({ cutout: { on: 'true' } }), false);
    assert.equal(cutout.hasCutout({}), false);
  });
});

describe('cutoutRanges', () => {
  it('covers every cutout clip of a file, with a second of margin on the frame grid', () => {
    const other = { ...clip(1, 2), sourceFile: '/p/b.mp4', clipId: 'b' };
    const ranges = cutoutRanges(doc([clip(4, 9), clip(12.02, 19.01), other]));
    assert.deepEqual(ranges, [
      {
        path: '/p/selfie.mp4',
        start: 3,
        end: 20 + 1 / 30,
        fps: 30,
        frames: 511,
        clips: ['c4', 'c12.02'],
      },
      { path: '/p/b.mp4', start: 0, end: 3, fps: 30, frames: 90, clips: ['b'] },
    ]);
    assert.equal(cutoutRanges(doc([clip(0.4, 2)]))[0].start, 0, 'never before the file starts');
  });

  it('snaps outwards to whole frames of the document', () => {
    const [range] = cutoutRanges(doc([clip(2.51, 4.49)], { fps: 24 }));
    assert.deepEqual([range.start * 24, range.end * 24, range.frames], [36, 132, 96]);
    const [ntsc] = cutoutRanges(doc([clip(2, 4)], { fps: 29.97 }));
    assert.equal(ntsc.fps, 30000 / 1001);
    assert.ok(Math.abs(ntsc.start * ntsc.fps - 29) < 1e-9 && ntsc.frames === 121);
  });

  it('counts muted tracks, and nothing that is not a video with cutout on', () => {
    const muted = { type: 'video', muted: true, clips: [clip(30, 31)] };
    const sound = { type: 'audio', clips: [clip(50, 51)] };
    const edl = doc(
      [
        clip(4, 9),
        clip(60, 70, { cutout: { on: false } }),
        clip(60, 70, { cutout: undefined }),
        clip(60, 70, { sourceFile: '/p/still.png' }),
        clip(60, 70, { sourceFile: '', text: { content: 'Title' } }),
        clip(60, 70, { generator: { type: 'gradient' } }),
      ],
      {},
    );
    edl.tracks.push(muted, sound);
    const ranges = cutoutRanges(edl);
    assert.deepEqual([ranges.length, ranges[0].start, ranges[0].end], [1, 3, 32]);
    assert.deepEqual(cutoutRanges(null), []);
    assert.deepEqual(cutoutRanges({ tracks: [{ clips: [null, 3] }, null] }), []);
  });
});

describe('cutoutKey', () => {
  const what = { source: SOURCE, start: 3, end: 20, fps: 30, model: 'modnet-abc/size512' };
  const key = cutoutKey(what);

  it('is twenty hex digits that stay the same', () => {
    assert.match(key, cutout.KEY_PATTERN);
    assert.equal(key, '7af3ad1e195fdd62d97b', 'changing this makes every cutout out of date');
    assert.equal(cutoutKey(structuredClone(what)), key);
    assert.equal(cutoutKey({ ...what, start: 3 + 1e-9, end: 20 - 1e-9 }), key, 'float dust');
    assert.equal(cutoutKey({ ...what, source: { ...SOURCE, mtime: SOURCE.mtime + 0.4 } }), key);
    assert.equal(cutoutKey({ ...what, fps: 29.97 }), cutoutKey({ ...what, fps: 30000 / 1001 }));
  });

  it('changes with the file, the stretch, the rate and the model', () => {
    const others = [
      { ...what, source: { ...SOURCE, size: SOURCE.size + 1 } },
      { ...what, source: { ...SOURCE, mtime: SOURCE.mtime + 1 } },
      { ...what, source: { ...SOURCE, path: '/p/other.mp4' } },
      { ...what, start: 3 + 1 / 30 },
      { ...what, end: 20 + 1 / 30 },
      { ...what, fps: 25 },
      { ...what, model: 'modnet-abc/size384' },
    ].map((other) => cutoutKey(other));
    assert.equal(new Set([key, ...others]).size, 8);
    assert.notEqual(cutoutKey(what, 2), key, 'and with the version of the file format');
  });
});

describe('time in a cutout file', () => {
  const meta = { source: SOURCE, start: 3, end: 20, fps: 30, frames: 510 };

  it('counts with the frame rates and the tolerance the renderer counts with', () => {
    for (const fps of [23.976, 24, 25, 29.97, 30, 50, 59.94, 60, 12.5, 0, 'x', 1000])
      assert.equal(cutout.cutoutFps(fps), fpsRational(fps).fps, String(fps));
    for (const fps of [12, 24, 25, 30000 / 1001, 30, 60, 120]) {
      // conform.js shifts timestamps by its tolerance (and the lead), in microseconds.
      const shift = Number(/setpts=PTS-(\d+)/.exec(conformFilters({}, fpsRational(fps)).join())[1]);
      assert.ok(Math.abs(cutout.frameTolerance(fps) / fps - shift / 1e6) < 1e-6, String(fps));
    }
  });

  it('puts a stretch on the frame grid, at least one frame long', () => {
    assert.deepEqual(frameRange(1.01, 1.99, 30), {
      start: 1,
      end: 2,
      fps: 30,
      startFrame: 30,
      frames: 30,
    });
    assert.deepEqual(frameRange(2, 2, 30).frames, 1);
    assert.deepEqual(frameRange(-5, 0.5, 10), {
      start: 0,
      end: 0.5,
      fps: 10,
      startFrame: 0,
      frames: 5,
    });
  });

  it('knows whether a cutout covers what a clip plays', () => {
    assert.equal(coversClip(meta, clip(4, 19)), true);
    assert.equal(coversClip(meta, clip(3, 20)), true);
    assert.equal(
      coversClip(meta, clip(3 - 0.016, 20 + 0.016)),
      true,
      'a render snaps by half a frame',
    );
    assert.equal(coversClip(meta, clip(2.9, 19)), false, 'trimmed beyond the start');
    assert.equal(coversClip(meta, clip(4, 20.1)), false, 'trimmed beyond the end');
    assert.equal(coversClip(meta, clip(4, 19, { sourceFile: '/p/b.mp4' })), false);
    assert.equal(coversClip(null, clip(4, 19)), false);
  });

  it('finds the frame of a moment: the latest that has started, as the renderer picks', () => {
    assert.deepEqual(cutoutTime(meta, 3), { frame: 0, time: 0, inside: true });
    assert.deepEqual(cutoutTime(meta, 4), { frame: 30, time: 1, inside: true });
    assert.equal(cutoutTime(meta, 4 + 0.6 / 30).frame, 30, 'the frame on screen, not the nearest');
    assert.equal(
      cutoutTime(meta, 4 + 0.71 / 30).frame,
      31,
      'within a third of a frame of the next',
    );
    assert.equal(cutoutTime(meta, 4 - 1e-9).frame, 30, 'float dust below a boundary');
    assert.deepEqual(cutoutTime(meta, 20 - 1 / 30), { frame: 509, time: 509 / 30, inside: true });
    assert.deepEqual(cutoutTime(meta, 25), { frame: 509, time: 509 / 30, inside: false });
    assert.deepEqual(cutoutTime(meta, 1), { frame: 0, time: 0, inside: false });
    // Walking a clip frame by frame walks the file frame by frame, whatever the rate.
    const ntsc = { start: 29 * (1001 / 30000), fps: 29.97, frames: 121 };
    for (let n = 0; n < 121; n++)
      assert.equal(cutoutTime(ntsc, ntsc.start + (n * 1001) / 30000).frame, n);
  });
});
