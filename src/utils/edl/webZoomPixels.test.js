import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recipeKey } from '#utils/web/index.js';
import { BUTTON, CORNER, trackOf } from '#utils/web/testkit.js';
import { createCanvas, renderFrame } from '../../api/compose/index.js';
import {
  applyWebZoom,
  createEdl,
  findClip,
  insertWebClip,
  newClipIds,
  setWebRecording,
  webDuration,
} from './index.js';
import { assertValid } from './testkit.js';

/**
 * The zoom keyframes drawn by the real compositor: a stand-in for a
 * recording (a page with two coloured targets) goes through `drawFrame`,
 * and the targets are looked for in the pixels of the frame.
 */

const RED = [225, 29, 72];
const BLUE = [37, 99, 235];
const BACKDROP = [255, 0, 255];

/** A 1280 × 720 page at 2×: white, a red button and a blue thing in the corner. */
function recording() {
  const canvas = createCanvas(2560, 1440);
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.fillStyle = `rgb(${RED})`;
  ctx.fillRect(BUTTON.x, BUTTON.y, BUTTON.width, BUTTON.height);
  ctx.fillStyle = `rgb(${BLUE})`;
  ctx.fillRect(CORNER.x, CORNER.y, CORNER.width, CORNER.height);
  return canvas;
}

/** Where the pixels of one colour are: `{ x, y, width, height }` or null. */
function boxOf(canvas, [r, g, b]) {
  const { width, height } = canvas;
  const { data } = canvas.getContext('2d').getImageData(0, 0, width, height);
  let [left, top, right, bottom] = [Infinity, Infinity, -1, -1];
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) > 24)
      continue;
    const [x, y] = [(i / 4) % width, Math.floor(i / 4 / width)];
    [left, top, right, bottom] = [
      Math.min(left, x),
      Math.min(top, y),
      Math.max(right, x),
      Math.max(bottom, y),
    ];
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

describe('zoom keyframes, as the compositor draws them', () => {
  const recipe = {
    url: 'https://example.com',
    lead: 1,
    tail: 3,
    steps: [{ do: 'wait', duration: 5 }],
  };
  const key = recipeKey(recipe, 30);
  const base = createEdl({ resolution: '960x540', background: '#ff00ff' });
  const placed = insertWebClip(base, recipe);
  const [id] = newClipIds(base, placed);
  const duration = webDuration(findClip(placed, id).clip, 30);
  const recorded = setWebRecording(placed, id, { file: `/p/${key}.mp4`, key, duration });
  const track = trackOf([{ rect: BUTTON }, { rect: CORNER, start: 3.1 }]);
  const edl = applyWebZoom(recorded, id, track);
  const page = recording();
  const draw = (time) => renderFrame(edl, time, { frameOf: () => page });

  it('at rest the page fills the frame', () => {
    assertValid(edl);
    const frame = draw(0.5);
    assert.deepEqual(boxOf(frame, RED), { x: 525, y: 285, width: 150, height: 45 });
    assert.equal(boxOf(frame, BACKDROP), null);
  });

  it('at the hold the target is in the middle of the frame, 2.2 times as large', () => {
    const frame = draw(2.5);
    const box = boxOf(frame, RED);
    assert.ok(Math.abs(box.x + box.width / 2 - 480) <= 1, `centre x ${box.x + box.width / 2}`);
    assert.ok(Math.abs(box.y + box.height / 2 - 270) <= 1, `centre y ${box.y + box.height / 2}`);
    assert.ok(Math.abs(box.width - 150 * 2.2) <= 2 && Math.abs(box.height - 45 * 2.2) <= 2);
    assert.equal(boxOf(frame, BACKDROP), null);
  });

  it('a target in the corner comes as near as it can: nothing behind the page shows', () => {
    const frame = draw(4.5);
    const box = boxOf(frame, BLUE);
    assert.ok(
      Math.abs(box.x - CORNER.x * 0.75 * 2.2) <= 1 && Math.abs(box.y - CORNER.y * 0.75 * 2.2) <= 1,
    );
    assert.equal(boxOf(frame, BACKDROP), null, 'no edge of the picture inside the frame');
    assert.equal(boxOf(draw(3.4), BACKDROP), null, 'nor on the way there');
  });

  it('afterwards the page is back', () => {
    assert.deepEqual(boxOf(draw(6.5), RED), { x: 525, y: 285, width: 150, height: 45 });
  });
});
