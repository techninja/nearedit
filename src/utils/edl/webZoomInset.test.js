import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BUTTON, FRAME, trackOf } from '#utils/web/testkit.js';
import {
  applyWebZoom,
  clipProgress,
  insertWebClip,
  newClipIds,
  placeSource,
  resolveClip,
  resolveTransform,
  updateClip,
} from './index.js';
import { assertValid, clipOf, testEdl } from './testkit.js';

/** Where a rectangle of the page is drawn, by the compositor's own placement. */
function drawn(clip, time, rect, track) {
  const now = resolveClip(clip, time);
  const flat = resolveTransform(now, clipProgress(now, time));
  const put = placeSource(track.width, track.height, FRAME.width, FRAME.height, flat);
  const perPixel = put.dw / put.sw;
  return {
    x: put.dx + (rect.x * track.scale - put.sx) * perPixel,
    y: put.dy + (rect.y * track.scale - put.sy) * perPixel,
    width: rect.width * track.scale * perPixel,
    height: rect.height * track.scale * perPixel,
    picture: put,
  };
}

/** A web clip at 10 s that rests as a window: 80 % of the frame, raised 60 px. */
function insetClip(track) {
  const base = testEdl({}, { resolution: '1920x1080' });
  const inserted = insertWebClip(base, { url: 'https://example.com', tail: 100 }, { time: 10 });
  const [id] = newClipIds(base, inserted);
  const inset = updateClip(inserted, id, { transform: { scaleX: 0.8, scaleY: 0.8, y: -60 } });
  const edl = applyWebZoom(inset, id, track, {});
  assertValid(edl);
  return clipOf(edl, id);
}

describe('applyWebZoom on a clip that rests as a window', () => {
  const track = trackOf([{ rect: BUTTON }]);
  const clip = insetClip(track);
  const step = track.steps[0];
  const hold = 10 + (step.actionEnd + step.end) / 2;
  const window = { x: 192, y: 48, width: 1536, height: 864 };

  it('starts from, and returns to, the clip’s own scale and position', () => {
    for (const time of [10.2, 10 + step.end + 5]) {
      const { transform } = resolveClip(clip, time);
      assert.deepEqual(
        [transform.scaleX, transform.scaleY, transform.x, transform.y],
        [0.8, 0.8, 0, -60],
      );
    }
    assert.equal(clip.transform.scaleX, 0.8, 'the plain values are untouched');
  });

  it('centres the target in the window at the hold', () => {
    const at = drawn(clip, hold, BUTTON, track);
    assert.ok(Math.abs(at.x + at.width / 2 - (window.x + window.width / 2)) < 0.5, `x ${at.x}`);
    assert.ok(Math.abs(at.y + at.height / 2 - (window.y + window.height / 2)) < 0.5, `y ${at.y}`);
    assert.ok(resolveClip(clip, hold).transform.scaleX > 1.2, 'and has moved closer');
  });

  it('never lets the picture fall short of the window it rests in', () => {
    for (let time = 10; time < 10 + step.end + 2; time += 1 / 30) {
      const { picture: p } = drawn(clip, time, BUTTON, track);
      assert.ok(p.dx <= window.x + 0.05 && p.dy <= window.y + 0.05, `left/top at ${time}`);
      assert.ok(p.dx + p.dw >= window.x + window.width - 0.05, `right at ${time}`);
      assert.ok(p.dy + p.dh >= window.y + window.height - 0.05, `bottom at ${time}`);
    }
  });

  it('leaves a clip that fills the frame as it was', () => {
    const base = testEdl({}, { resolution: '1920x1080' });
    const inserted = insertWebClip(base, { url: 'https://example.com', tail: 100 }, { time: 10 });
    const [id] = newClipIds(base, inserted);
    const full = clipOf(applyWebZoom(inserted, id, track, {}), id);
    assert.equal(resolveClip(full, 10.2).transform.scaleX, 1);
    const at = drawn(full, hold, BUTTON, track);
    assert.ok(Math.abs(at.x + at.width / 2 - FRAME.width / 2) < 0.5);
  });
});
