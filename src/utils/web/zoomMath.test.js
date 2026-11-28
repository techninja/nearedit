import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ZOOM_PATHS, placeRect, zoomKeyframes, zoomState, zoomView } from './index.js';
import { BUTTON, CORNER, FRAME, stateAt, trackOf } from './testkit.js';

describe('zoomKeyframes: how far', () => {
  const view = zoomView(trackOf([]), FRAME);

  it('fits the target with its margin into the share of the frame, up to the limit', () => {
    assert.equal(view.fit, 1.5);
    const small = zoomState(BUTTON, 0, view);
    assert.equal(small.scale, 2.2, 'a small target stops at maxZoom');
    const card = { x: 300, y: 200, width: 400, height: 200 };
    assert.equal(zoomState(card, 0, view).scale, 1.1294, '0.6 · 1920 / (400 · 1.7 · 1.5)');
    assert.equal(zoomState(card, 0, view, { margin: 0, fill: 1 }).scale, 2.2);
    assert.equal(zoomState(card, 0, view, { margin: 0, fill: 0.5, maxZoom: 9 }).scale, 1.6);
    assert.equal(
      zoomState(BUTTON, 0, view, { maxZoom: 3 }).scale,
      2.2588,
      'the fit, under the limit',
    );
    assert.equal(zoomState({ ...BUTTON, width: 20, height: 20 }, 0, view, { maxZoom: 3 }).scale, 3);
    const tall = { x: 600, y: 100, width: 50, height: 300 };
    assert.equal(
      zoomState(tall, 0, view).scale,
      1,
      'never below 1: 0.6 · 1080 / (300 · 1.7 · 1.5) is 0.85',
    );
  });

  it('a target too large to zoom in on leaves the picture at rest', () => {
    const page = { x: 100, y: 50, width: 900, height: 600 };
    assert.deepEqual(zoomState(page, 0, view), { scale: 1, x: 0, y: 0 });
    const keys = zoomKeyframes(trackOf([{ rect: page }]), FRAME);
    assert.ok(keys['transform.scaleX'].every((key) => key.v === 1));
    assert.ok(keys['transform.x'].every((key) => key.v === 0));
  });

  it("a focus step's own zoom overrides the fit — from the track or from the recipe", () => {
    assert.equal(zoomState(BUTTON, 1.5, view).scale, 1.5);
    assert.equal(zoomState(BUTTON, 5, view).scale, 5, 'also past maxZoom');
    assert.equal(zoomState(BUTTON, 99, view).scale, 8);
    assert.equal(zoomState(BUTTON, 0.5, view).scale, 1);
    const noted = zoomKeyframes(trackOf([{ rect: BUTTON, zoom: 1.5 }]), FRAME);
    assert.equal(stateAt(noted, 2)[0], 1.5);
    const recipe = { steps: [{ do: 'focus', zoom: 3 }] };
    const written = zoomKeyframes(trackOf([{ rect: BUTTON }]), FRAME, { recipe });
    assert.equal(stateAt(written, 2)[0], 3);
    const other = zoomKeyframes(trackOf([{ rect: BUTTON }]), FRAME, {
      recipe: { steps: [{ do: 'click', zoom: 3 }] },
    });
    assert.equal(stateAt(other, 2)[0], 2.2, 'a recipe that has another step there is not asked');
  });

  it('clamps the offset so that no edge of the picture comes into the frame', () => {
    const state = zoomState(CORNER, 0, view);
    assert.equal(state.scale, 2.2);
    assert.deepEqual(
      [state.x, state.y],
      [1152, 648],
      'half the overflow, not the 1782 / 990 it asks',
    );
    const placed = placeRect({ x: 0, y: 0, width: 1280, height: 720 }, state, view);
    assert.ok(
      Math.abs(placed.x) < 0.01 && Math.abs(placed.y) < 0.01,
      'the corner sits in the corner',
    );
    const far = zoomState({ x: 1270, y: 715, width: 100, height: 40 }, 0, view);
    assert.deepEqual([far.x, far.y], [-1152, -648]);
  });

  it('honours a clip fitted contain', () => {
    const wide = zoomView(trackOf([]), { width: 2560, height: 1080 }, 'contain');
    assert.equal(wide.fit, 1.5);
    assert.equal(zoomView(trackOf([]), { width: 2560, height: 1080 }).fit, 2);
    const state = zoomState(BUTTON, 2, wide);
    const at = placeRect(BUTTON, state, wide);
    assert.ok(Math.abs(at.y + at.height / 2 - 540) < 0.01);
  });

  it('gives nothing without sizes or a usable rectangle', () => {
    assert.equal(zoomView({}, FRAME), null);
    assert.equal(zoomView(trackOf([]), { width: 0, height: 1080 }), null);
    assert.equal(zoomView({ width: 2560, height: 1440, scale: 2 }, FRAME).vw, 1280);
    for (const rect of [
      undefined,
      null,
      {},
      { x: 1, y: 2, width: NaN, height: 3 },
      { x: 0, y: 0, width: -1, height: 5 },
    ]) {
      assert.equal(zoomState(rect, 0, view), null);
    }
    const empty = {
      'transform.scaleX': [],
      'transform.scaleY': [],
      'transform.x': [],
      'transform.y': [],
    };
    assert.deepEqual(zoomKeyframes(trackOf([]), FRAME), empty);
    assert.deepEqual(zoomKeyframes(null, FRAME), empty);
    assert.deepEqual(zoomKeyframes(trackOf([{ rect: BUTTON }]), null), empty);
    assert.deepEqual(Object.keys(empty), Object.keys(ZOOM_PATHS));
  });
});
