import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import { escapeValue, filter, hexColor, lerpExpr, num, progressExpr, quote } from './expr.js';
import { clipGeometry, rotatedBox } from './placement.js';
import { pixelRect, visiblePart } from './visible.js';
import { clipWindow, createTiming, fpsRational, sampleAt, snapTrack } from './timing.js';

const near = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

describe('render: graph text helpers', () => {
  it('formats numbers plainly', () => {
    assert.deepEqual(
      [num(1), num(0.1 + 0.2), num(-0), num(1e-9), num(NaN)],
      ['1', '0.3', '0', '0', '0'],
    );
    assert.deepEqual(
      [num(1234567.891, 2), num(1e21 / 1e21), num(-2.5)],
      ['1234567.89', '1', '-2.5'],
    );
  });

  it('escapes values so they cannot end an option, a filter or a chain', () => {
    assert.equal(escapeValue("a:b,c;d[e]'f\\g"), "a\\\\:b\\,c\\;d\\[e\\]\\\\\\'f\\\\\\\\g");
    assert.equal(escapeValue('/plain/path-1.txt'), '/plain/path-1.txt');
    assert.throws(() => quote("it's"));
    assert.equal(quote('max(1,t)'), "'max(1,t)'");
    assert.equal(
      filter('fade', { t: 'in', st: 0, d: 0.5, alpha: 1, skip: undefined }),
      'fade=t=in:st=0:d=0.5:alpha=1',
    );
    assert.equal(filter('hflip'), 'hflip');
  });

  it('builds interpolation expressions', () => {
    assert.equal(lerpExpr(5, 5, 'P'), '5');
    assert.equal(lerpExpr(10, 4, 'P'), '(10+(-6)*P)');
    assert.equal(progressExpr('t', 0, 2), 'clip(t/2,0,1)');
    assert.equal(progressExpr('on', -29, 60), 'clip((on-(-29))/60,0,1)');
  });

  it('accepts only hex colours', () => {
    assert.equal(hexColor('#FfCc00'), '0xffcc00@1');
    assert.equal(hexColor('#abc'), '0xaabbcc@1');
    assert.equal(hexColor('#00000080'), '0x000000@0.502');
    for (const bad of ['red', 'rgb(1,2,3)', '#12', 'ffcc00:box=1', '', null, undefined])
      assert.equal(hexColor(bad, 'fallback'), 'fallback', String(bad));
  });
});

describe('render: timing', () => {
  it('turns frame rates into exact rationals', () => {
    assert.deepEqual(fpsRational(30), { fps: 30, fpsText: '30' });
    assert.equal(fpsRational(29.97).fpsText, '30000/1001');
    assert.equal(fpsRational(23.976).fpsText, '24000/1001');
    assert.equal(fpsRational(59.94).fpsText, '60000/1001');
    assert.equal(fpsRational(12.5).fpsText, '12500/1000');
    assert.equal(fpsRational(undefined).fpsText, '30');
    assert.equal(fpsRational(100000).fps, 240);
  });

  it('counts frames and samples for the whole timeline or a clamped range', () => {
    const clip = createClip({ sourceFile: '/a.mp4', timelineStart: 0, timelineEnd: 10 });
    const edl = createEdl({ fps: 29.97, tracks: [createTrack('video', { clips: [clip] })] });
    const all = createTiming(edl);
    assert.equal(all.frames, 300);
    assert.ok(near(all.duration, 10.01));
    assert.equal(all.samples, sampleAt(300, all.fps));
    const part = createTiming(edl, { start: 2, end: 99 });
    assert.deepEqual([part.startFrame, part.endFrame, part.frames], [60, 300, 240]);
    assert.equal(createTiming(edl, { start: 50, end: 60 }).frames, 0);
  });

  it('snaps clips to frames, keeps the source in sync and clamps fades', () => {
    const timing = createTiming(createEdl({ fps: 30, tracks: [] }));
    const loose = {
      clipId: 'c',
      sourceFile: '/a.mp4',
      sourceIn: 5,
      timelineStart: 1.02,
      timelineEnd: 3.01,
      fadeIn: 9,
      fadeOut: 9,
    };
    const empty = { clipId: 'e', sourceFile: '/a.mp4', timelineStart: 2, timelineEnd: 2.01 };
    const ghost = {
      clipId: 'p',
      sourceFile: '',
      text: { content: '' },
      timelineStart: 0,
      timelineEnd: 5,
    };
    const { clips } = snapTrack({ type: 'video', clips: [loose, empty, ghost, null] }, timing);
    assert.equal(clips.length, 1);
    const [clip] = clips;
    assert.deepEqual([clip.startFrame, clip.endFrame], [31, 90]);
    assert.ok(near(clip.timelineStart, 31 / 30) && near(clip.sourceIn, 5 + 31 / 30 - 1.02));
    assert.ok(near(clip.fadeIn, 59 / 30) && clip.fadeOut === 0, 'fades fit inside the clip');
    const window = clipWindow(clip, { ...timing, startFrame: 60, endFrame: 75 });
    assert.deepEqual([window.count, window.offset, window.shift, window.length], [15, 29, -29, 59]);
    assert.ok(near(window.seek, 5 + 2 - 1.02));
    assert.equal(clipWindow(clip, { ...timing, startFrame: 90, endFrame: 120 }), null);
  });
});

describe('render: placement', () => {
  const frame = { width: 1920, height: 1080 };

  it('scales shared placement to the rendered size', () => {
    const clip = createClip({
      transform: { scaleX: 0.5, scaleY: 0.5, x: 100, rotation: 370, opacity: 2 },
    });
    const g = clipGeometry(clip, frame, frame, { width: 960, height: 540 });
    assert.deepEqual(g.rect[0], { x: 290, y: 135, w: 480, h: 270 });
    assert.deepEqual(g.crop[0], { x: 0, y: 0, w: 1920, h: 1080 });
    assert.deepEqual([g.rotation, g.opacity, g.moves, g.cropMoves], [10, 1, false, false]);
    const kenBurns = {
      enabled: true,
      startScale: 1,
      endScale: 2,
      startCropLeft: 0,
      endCropLeft: 0.5,
    };
    const moving = clipGeometry(createClip({ transform: { kenBurns } }), frame, frame, frame);
    assert.ok(moving.moves && moving.cropMoves);
    assert.equal(
      clipGeometry(createClip({ transform: { scaleX: -1 } }), frame, frame, frame).flipX,
      true,
    );
  });

  it('finds the bounding box of a rectangle rotated about its anchor', () => {
    const rect = { x: 80, y: 45, w: 160, h: 90 };
    const quarter = rotatedBox(rect, 90, 0.5, 0.5);
    assert.ok(
      near(quarter.x, 115) && near(quarter.y, 10) && near(quarter.w, 90) && near(quarter.h, 160),
    );
    const corner = rotatedBox(rect, 90, 0, 0);
    assert.ok(near(corner.x, -10) && near(corner.y, 45), 'clockwise about the top-left corner');
    const same = rotatedBox(rect, 0, 0.3, 0.9);
    assert.ok(near(same.x, 80) && near(same.w, 160));
  });

  it('rounds edges, and keeps only what the frame shows', () => {
    assert.deepEqual(pixelRect({ x: 0.4, y: 0.6, w: 10.2, h: 0.1 }), { x: 0, y: 1, w: 11, h: 1 });
    const source = { width: 1920, height: 1080 };
    const out = { width: 1080, height: 1920 };
    const cover = { x: -1166.67, y: 0, w: 3413.33, h: 1920 };
    const part = visiblePart({ x: 0, y: 0, w: 1920, h: 1080 }, cover, source, out);
    assert.deepEqual(part.crop, { x: 656, y: 0, w: 608, h: 1080 });
    assert.ok(part.rect.x <= 0 && part.rect.x + part.rect.w >= 1080, 'the frame stays covered');
    const inside = visiblePart(
      { x: 0, y: 0, w: 1920, h: 1080 },
      { x: 10, y: 20, w: 192, h: 108 },
      source,
      out,
    );
    assert.deepEqual(inside, {
      crop: { x: 0, y: 0, w: 1920, h: 1080 },
      rect: { x: 10, y: 20, w: 192, h: 108 },
    });
    assert.equal(
      visiblePart({ x: 0, y: 0, w: 1920, h: 1080 }, { x: 5000, y: 0, w: 100, h: 100 }, source, out),
      null,
    );
  });
});
