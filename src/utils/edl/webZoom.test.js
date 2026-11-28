import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ZOOM_PATHS, placeRect, zoomState, zoomView } from '#utils/web/index.js';
import { BUTTON, CORNER, FRAME, trackOf } from '#utils/web/testkit.js';
import {
  applyWebZoom,
  clearWebZoom,
  clipProgress,
  insertWebClip,
  newClipIds,
  placeSource,
  resolveClip,
  resolveTransform,
  splitClips,
  updateClip,
} from './index.js';
import { assertValid, clipOf, testEdl } from './testkit.js';

/** Where a rectangle of the page is drawn, by the compositor's own placement. */
function drawn(clip, time, rect, track, frame = FRAME) {
  const now = resolveClip(clip, time);
  const flat = resolveTransform(now, clipProgress(now, time));
  const put = placeSource(track.width, track.height, frame.width, frame.height, flat);
  const perPixel = put.dw / put.sw;
  return {
    x: put.dx + (rect.x * track.scale - put.sx) * perPixel,
    y: put.dy + (rect.y * track.scale - put.sy) * perPixel,
    width: rect.width * track.scale * perPixel,
    height: rect.height * track.scale * perPixel,
    picture: put,
  };
}

/** A document with a web clip at 10 s that carries the zoom of a track. */
function zoomedClip(track, options, resolution = '1920x1080') {
  const base = testEdl({}, { resolution });
  const inserted = insertWebClip(base, { url: 'https://example.com', tail: 100 }, { time: 10 });
  const [id] = newClipIds(base, inserted);
  const edl = applyWebZoom(inserted, id, track, options);
  assertValid(edl);
  return { edl, id, clip: clipOf(edl, id) };
}

describe('zoomKeyframes: the placement proof', () => {
  for (const [name, resolution, viewport, scale] of [
    ['same shape', '1920x1080', { width: 1280, height: 720 }, 2.2],
    ['a wider frame', '2560x1080', { width: 1280, height: 720 }, 2.2],
    ['a square page', '1920x1080', { width: 1000, height: 1000 }, 1.9608],
  ]) {
    it(`${name}: at the hold the target is centred, inside the frame, and no edge shows`, () => {
      const [width, height] = resolution.split('x').map(Number);
      const frame = { width, height };
      const rect = { x: viewport.width * 0.6, y: viewport.height * 0.55, width: 180, height: 48 };
      const track = trackOf([{ rect }], {
        viewport,
        width: viewport.width * 2,
        height: viewport.height * 2,
      });
      const { clip } = zoomedClip(track, {}, resolution);
      const hold = 10 + (track.steps[0].actionEnd + track.steps[0].end) / 2;
      const at = drawn(clip, hold, rect, track, frame);
      assert.ok(
        Math.abs(at.x + at.width / 2 - width / 2) < 0.02,
        `centre x ${at.x + at.width / 2}`,
      );
      assert.ok(
        Math.abs(at.y + at.height / 2 - height / 2) < 0.02,
        `centre y ${at.y + at.height / 2}`,
      );
      assert.ok(at.x >= 0 && at.y >= 0 && at.x + at.width <= width && at.y + at.height <= height);
      assert.equal(resolveClip(clip, hold).transform.scaleX, scale);
      const padded = [at.width * 1.7, at.height * 1.7];
      assert.ok(padded[0] <= 0.6 * width + 0.2, 'with its margin it fills at most 0.6 across');
      assert.ok(padded[1] <= 0.6 * height + 0.2, 'and at most 0.6 down');
      const filled = Math.max(padded[0] / width, padded[1] / height);
      assert.ok(scale === 2.2 || filled > 0.599, 'and no less, unless maxZoom stops it');
      const { dx, dy, dw, dh } = at.picture;
      assert.ok(dx <= 1e-9 && dy <= 1e-9 && dx + dw >= width - 1e-9 && dy + dh >= height - 1e-9);
    });
  }

  it('a wide page in a tall frame: a target too large to zoom is still brought into view', () => {
    // 180 px of a page 1280 wide are 480 px of a frame 1080 wide: no room to scale up.
    const frame = { width: 1080, height: 1920 };
    const rect = { x: 768, y: 396, width: 180, height: 48 };
    const track = trackOf([{ rect }]);
    const { clip } = zoomedClip(track, {}, '1080x1920');
    const rest = drawn(clip, 10.5, rect, track, frame);
    assert.ok(rest.x + rest.width > 1080, 'at rest it is cut off by the frame');
    const at = drawn(clip, 12, rect, track, frame);
    assert.equal(resolveClip(clip, 12).transform.scaleX, 1);
    assert.ok(
      Math.abs(at.x + at.width / 2 - 540) < 0.02,
      'centred across, where the picture overflows',
    );
    assert.equal(at.y, rest.y, 'no room to move it down');
    assert.ok(at.x >= 0 && at.x + at.width <= 1080 && at.y >= 0 && at.y + at.height <= 1920);
    const { dx, dy, dw, dh } = at.picture;
    assert.ok(dx <= 1e-9 && dy <= 1e-9 && dx + dw >= 1080 - 1e-9 && dy + dh >= 1920 - 1e-9);
  });

  it('a target in the corner is brought as near as the edges of the picture allow', () => {
    const track = trackOf([{ rect: CORNER }]);
    const { clip } = zoomedClip(track);
    const at = drawn(clip, 12, CORNER, track);
    const { dx, dy, dw, dh } = at.picture;
    assert.ok(
      Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01,
      'the corner of the page is in the corner',
    );
    assert.ok(dx <= 1e-9 && dy <= 1e-9 && dx + dw >= 1920 - 1e-9 && dy + dh >= 1080 - 1e-9);
    assert.ok(at.x >= 0 && at.y >= 0 && at.x + at.width <= 1920 && at.y + at.height <= 1080);
    assert.ok(at.x + at.width / 2 < 960 && at.y + at.height / 2 < 540, 'short of the middle');
  });

  it("agrees with placeRect, the library's own picture of the placement", () => {
    const track = trackOf([{ rect: BUTTON }]);
    const { clip } = zoomedClip(track);
    const view = zoomView(track, FRAME);
    const state = zoomState(BUTTON, 0, view);
    const mine = placeRect(BUTTON, state, view);
    const theirs = drawn(clip, 12, BUTTON, track);
    for (const side of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(mine[side] - theirs[side]) < 1e-6, side);
    }
  });

  it('before and after, the clip is drawn as if it had no keyframes', () => {
    const track = trackOf([{ rect: BUTTON }]);
    const { clip } = zoomedClip(track);
    for (const time of [10, 10.5, 11, 10 + track.steps[0].end + 0.6, 40]) {
      const at = drawn(clip, time, { x: 0, y: 0, width: 1280, height: 720 }, track);
      assert.deepEqual([at.x, at.y, at.width, at.height].map(Math.round), [0, 0, 1920, 1080]);
    }
  });
});

describe('applyWebZoom and clearWebZoom', () => {
  const track = trackOf([{ rect: BUTTON }]);

  it('writes the four paths, replacing what they had and leaving the rest', () => {
    const { edl, id } = zoomedClip(track);
    const keyed = updateClip(edl, id, {
      keyframes: {
        'transform.opacity': [
          { t: 0, v: 0 },
          { t: 1, v: 1 },
        ],
        'transform.x': [{ t: 0, v: 500 }],
      },
    });
    const again = applyWebZoom(keyed, id, track, { maxZoom: 1.5 });
    assertValid(again);
    const clip = clipOf(again, id);
    assert.deepEqual(
      Object.keys(clip.keyframes).sort(),
      [...Object.keys(ZOOM_PATHS), 'transform.opacity'].sort(),
    );
    assert.deepEqual(
      clip.keyframes['transform.x'].map((key) => key.v),
      [0, -360, -360, 0],
    );
    assert.equal(clip.keyframes['transform.scaleX'][1].v, 1.5);
    assert.equal(
      applyWebZoom(again, id, track, { maxZoom: 1.5 }),
      again,
      'the same zoom twice changes nothing',
    );
  });

  it("uses the recipe of the clip for a focus step's own zoom, and the clip's fit", () => {
    const base = testEdl();
    const recipe = { url: 'https://example.com', steps: [{ do: 'focus', target: '#a', zoom: 4 }] };
    const inserted = insertWebClip(base, recipe);
    const [id] = newClipIds(base, inserted);
    const zoomed = applyWebZoom(inserted, id, track);
    assert.equal(clipOf(zoomed, id).keyframes['transform.scaleX'][1].v, 4);
    assert.equal(
      applyWebZoom(inserted, id, track, { recipe: null }).tracks[0].clips[0].keyframes[
        'transform.scaleX'
      ][1].v,
      2.2,
    );
  });

  it('the keys stay with the picture through a split', () => {
    const { edl, id, clip } = zoomedClip(track);
    const halves = splitClips(edl, 12);
    const [rightId] = newClipIds(edl, halves);
    assertValid(halves);
    for (const time of [10.5, 11.3, 11.9]) {
      assert.deepEqual(
        resolveClip(clipOf(halves, id), time).transform,
        resolveClip(clip, time).transform,
      );
    }
    for (const time of [12, 12.5, 13.4, 14]) {
      assert.deepEqual(
        resolveClip(clipOf(halves, rightId), time).transform,
        resolveClip(clip, time).transform,
      );
    }
  });

  it('a track with nothing to zoom on, and clearWebZoom, remove the four paths', () => {
    const { edl, id } = zoomedClip(track);
    assert.deepEqual(clipOf(applyWebZoom(edl, id, trackOf([])), id).keyframes, {});
    const cleared = clearWebZoom(edl, id);
    assert.deepEqual(clipOf(cleared, id).keyframes, {});
    assert.equal(clearWebZoom(cleared, id), cleared, 'nothing left to clear');
    const plain = testEdl();
    assert.equal(applyWebZoom(plain, 'nope', track), plain);
  });
});
