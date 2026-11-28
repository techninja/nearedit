import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPTION_STYLE,
  ROOM,
  SAFE,
  captionGroups,
  clearOf,
  layoutCaption,
  liftFor,
  normalizeCaptionStyle,
  resolveCaptionStyle,
  restRect,
  unitOf,
} from './index.js';
import { placeWords } from './geometry.js';

const WIDE = { width: 1920, height: 1080 };
const TALL = { width: 1080, height: 1920 };
const U = 10.8;
const WORDS = [
  [1, 1.4, 'one'],
  [1.5, 1.9, 'two'],
  [2, 2.4, 'three'],
];
const GAP = { x: ROOM.beside * U, y: ROOM.above * U };
const LIMITS = { top: SAFE.y * U, bottom: 1080 - SAFE.y * U };

/** A stand-in measure: 0.6 of the font size a character. */
const measureFor = (style, frame) => (text) =>
  (text === ' ' ? 0.25 : [...text].length * 0.6) * resolveCaptionStyle(style).size * unitOf(frame);

/** The first group of the words, placed. */
function place(style, frame = WIDE, lane = 0, lift = 0) {
  const resolved = resolveCaptionStyle(style);
  const [group] = captionGroups(WORDS, resolved);
  return placeWords(group, resolved, frame, measureFor(style, frame), lane, lift);
}
/** The move of that group among blocks, units. */
const lift = (style, blocks, frame = WIDE, lane = 0) =>
  liftFor(place(style, frame, lane), blocks, resolveCaptionStyle(style), frame);
const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 0.01, `${what}: ${actual} is ${expected}`);

/** A caption 400 wide in the middle of the frame's foot, and a lower third beside it. */
const CAPTION = { x: 760, y: 900, width: 400, height: 60 };
const third = (right, top = 860) => ({ x: 60, y: top, width: right - 60, height: 1010 - top });

describe('what is in a caption’s way', () => {
  it('moves a bottom caption above what overlaps it, a gap clear', () => {
    const dy = clearOf(CAPTION, [third(900)], 'bottom', GAP, LIMITS);
    assert.equal(CAPTION.y + dy + CAPTION.height, 860 - GAP.y, 'its foot a gap above the block');
  });

  it('leaves a caption alone when the block does not come near', () => {
    assert.equal(clearOf(CAPTION, [third(500)], 'bottom', GAP, LIMITS), 0);
    // A bug in the top corner is nowhere near a caption at the foot of the frame.
    const bug = { x: 1780, y: 65, width: 76, height: 76 };
    assert.equal(clearOf(CAPTION, [bug], 'bottom', GAP, LIMITS), 0);
    assert.equal(clearOf(CAPTION, [], 'bottom', GAP, LIMITS), 0);
  });

  it('keeps a gap: beside the caption, and above and below it', () => {
    const nearly = 760 - GAP.x;
    assert.equal(clearOf(CAPTION, [third(nearly)], 'bottom', GAP, LIMITS), 0, 'a gap away: clear');
    assert.ok(
      clearOf(CAPTION, [third(nearly + 1)], 'bottom', GAP, LIMITS) < 0,
      'nearer: in the way',
    );
    const under = { x: 700, y: 960 + GAP.y, width: 500, height: 40 };
    assert.equal(clearOf(CAPTION, [under], 'bottom', GAP, LIMITS), 0, 'a gap below: clear');
    assert.ok(clearOf(CAPTION, [{ ...under, y: under.y - 1 }], 'bottom', GAP, LIMITS) < 0);
  });

  it('moves a top caption below what is in its way', () => {
    const caption = { ...CAPTION, y: 100 };
    const block = { x: 700, y: 60, width: 300, height: 90 };
    const dy = clearOf(caption, [block], 'top', GAP, LIMITS);
    assert.equal(caption.y + dy, 150 + GAP.y, 'its head a gap below the block');
  });

  it('moves a middle caption the shorter way', () => {
    const caption = { ...CAPTION, y: 510 };
    const low = { x: 700, y: 540, width: 300, height: 200 };
    assert.ok(clearOf(caption, [low], 'middle', GAP, LIMITS) < 0, 'up, away from a block below');
    const high = { x: 700, y: 300, width: 300, height: 240 };
    assert.ok(clearOf(caption, [high], 'middle', GAP, LIMITS) > 0, 'down, away from a block above');
  });

  it('clears everything in its way, one block after another', () => {
    const upper = { x: 900, y: 700, width: 400, height: 130 };
    const dy = clearOf(CAPTION, [third(900), upper], 'bottom', GAP, LIMITS);
    assert.equal(CAPTION.y + dy + CAPTION.height, 700 - GAP.y, 'above the upper one as well');
  });

  it('goes the other way when there is no room, and stays when there is none at all', () => {
    // A block from the top of the frame down into the caption: only below is free.
    const curtain = { x: 700, y: 0, width: 500, height: 910 };
    const dy = clearOf(CAPTION, [curtain], 'bottom', GAP, LIMITS);
    assert.equal(CAPTION.y + dy, 910 + GAP.y);
    const wall = { x: 700, y: 0, width: 500, height: 1000 };
    assert.equal(clearOf(CAPTION, [wall], 'bottom', GAP, LIMITS), 0, 'nowhere to go: unchanged');
  });
});

describe('the move of a group', () => {
  it('is in units, whatever the size of the frame it was laid out in', () => {
    const rect = restRect(place('clean'));
    const block = { x: 60, y: rect.y - 30, width: rect.x, height: 200 };
    const moved = lift('clean', [block]);
    close(moved, (block.y - ROOM.above * U - rect.y - rect.height) / U, 'units up');
    // The same picture at a third of the size: the same move.
    const small = { width: 640, height: 360 };
    const third = (/** @type {any} */ r) =>
      Object.fromEntries(Object.entries(r).map(([key, value]) => [key, value / 3]));
    close(lift('clean', [third(block)], small), moved, 'at 640 × 360');
    assert.equal(lift('clean', []), 0);
    assert.equal(lift('clean', [{ x: 60, y: 60, width: 80, height: 80 }]), 0);
  });

  it('is applied by the layout to every word, the mark and the plate alike', () => {
    const [group] = captionGroups(WORDS, resolveCaptionStyle('boxed'));
    const lay = (/** @type {object} */ state) =>
      layoutCaption(group, { word: 1, ...state }, 'boxed', WIDE, measureFor('boxed', WIDE));
    const [normal, moved] = [lay({}), lay({ lift: -10 })];
    close(moved.box.y, normal.box.y - 10 * U, 'the lines');
    close(moved.plate.y, normal.plate.y - 10 * U, 'the plate');
    close(moved.mark.y, normal.mark.y - 10 * U, 'the mark');
    close(moved.words[2].y, normal.words[2].y - 10 * U, 'each word');
    assert.equal(moved.box.x, normal.box.x, 'never sideways');
    assert.deepEqual(lay({ lift: 0 }), normal, 'no move: the layout it always was');
    assert.deepEqual(lay({ lift: 'up' }), normal, 'a move that is not a number is none');
  });

  it('never takes a caption out of the frame’s safe area', () => {
    const top = place('clean', WIDE, 0, -500).box.y;
    close(top, SAFE.y * U + resolveCaptionStyle('clean').stroke.width * U, 'stops at the top');
    const low = place('clean', WIDE, 0, 500);
    assert.ok(low.box.y + low.box.height <= 1080 - SAFE.y * U);
  });

  it('moves a second voice with the first: the stack is tried as one', () => {
    const first = restRect(place('clean', WIDE, 0));
    const second = restRect(place('clean', WIDE, 1));
    assert.ok(second.y + second.height < first.y, 'the second voice sits above the first');
    // A block that reaches the first voice's place only.
    const block = { x: 60, y: first.y + 5, width: first.x, height: 100 };
    const moved = lift('clean', [block], WIDE, 0);
    assert.ok(moved < 0);
    close(lift('clean', [block], WIDE, 1), moved, 'the same move, so they stay stacked');
  });

  it('sits a tall frame’s caption above a lower third that is raised there', () => {
    const rect = restRect(place('minimal', TALL));
    const block = { x: 65, y: rect.y + 20, width: 500, height: 170 };
    assert.ok(lift('minimal', [block], TALL) < 0);
  });
});

describe('the switch', () => {
  it('is a field of the style, on unless a document turns it off', () => {
    assert.equal(CAPTION_STYLE.avoid.type, 'boolean');
    assert.equal(CAPTION_STYLE.avoid.group, 'Position');
    for (const preset of ['clean', 'pop', 'karaoke', 'boxed', 'minimal']) {
      assert.equal(resolveCaptionStyle(preset).avoid, true);
    }
    assert.equal(resolveCaptionStyle({ preset: 'pop', avoid: false }).avoid, false);
    assert.deepEqual(normalizeCaptionStyle({ preset: 'pop', avoid: false }), {
      preset: 'pop',
      avoid: false,
    });
    assert.deepEqual(normalizeCaptionStyle({ preset: 'pop', avoid: true }), { preset: 'pop' });
    assert.equal(resolveCaptionStyle({ avoid: 'nonsense' }).avoid, true, 'unusable: the default');
  });
});
