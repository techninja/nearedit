import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recipeKey } from '#utils/web/index.js';
import {
  createClip,
  insertWebClip,
  isTimed,
  newClipIds,
  rollEdit,
  setWebRecording,
  slipClip,
  slipTrim,
  trimClipEnd,
  trimClipStart,
} from './index.js';
import { assertValid, clipOf, deepFreeze, testEdl } from './testkit.js';

const RECIPE = { url: 'https://example.com', steps: [{ do: 'wait', duration: 3.4 }] };
const LENGTH = 5; // 0.6 lead + 3.4 + 1 tail
const KEY = recipeKey(RECIPE, 30);
const FILE = `/project/.nearedit/web/${KEY}.mp4`;

describe('the source of a web clip is its score', () => {
  for (const state of ['unrecorded', 'recorded']) {
    const base = testEdl();
    const inserted = insertWebClip(base, RECIPE, { time: 10 });
    const [id] = newClipIds(base, inserted);
    const edl = deepFreeze(
      state === 'recorded'
        ? setWebRecording(inserted, id, { file: FILE, key: KEY, duration: LENGTH })
        : inserted,
    );
    const window = (doc) => {
      const clip = clipOf(doc, id);
      return [clip.sourceIn, clip.sourceOut, clip.timelineStart, clip.timelineEnd].map(
        (time) => Math.round(time * 1000) / 1000,
      );
    };

    it(`${state}: it counts as timed and trims only inside the score`, () => {
      assert.equal(isTimed(clipOf(edl, id), edl.tracks[0]), true);
      assert.equal(trimClipEnd(edl, id, 30), edl, 'nothing after the end');
      assert.equal(trimClipStart(edl, id, 5), edl, 'nothing before the start');
      const shorter = trimClipEnd(edl, id, 13);
      assert.deepEqual(window(shorter), [0, 3, 10, 13]);
      assert.deepEqual(
        window(trimClipEnd(shorter, id, 99)),
        [0, 5, 10, 15],
        'back to the end, no further',
      );
      const later = trimClipStart(edl, id, 12);
      assert.deepEqual(window(later), [2, 5, 12, 15]);
      assert.deepEqual(window(trimClipStart(later, id, 0)), [0, 5, 10, 15]);
      for (const doc of [shorter, later]) assertValid(doc);
    });

    it(`${state}: the file's duration in a map does not widen or narrow it`, () => {
      const more = { sourceDurations: { [FILE]: 100, '': 100 } };
      assert.equal(trimClipEnd(edl, id, 30, more), edl);
      const less = { sourceDurations: new Map([[FILE, 1]]) };
      const shorter = trimClipEnd(edl, id, 13);
      assert.deepEqual(window(trimClipEnd(shorter, id, 99, less)), [0, 5, 10, 15]);
    });

    it(`${state}: it slips only inside the score`, () => {
      assert.equal(slipClip(edl, id, 1), edl, 'the whole score is showing');
      const middle = trimClipEnd(trimClipStart(edl, id, 11), id, 13);
      assert.deepEqual(window(middle), [1, 3, 11, 13]);
      assert.deepEqual(window(slipClip(middle, id, 10)), [3, 5, 11, 13]);
      assert.deepEqual(window(slipClip(middle, id, -10)), [0, 2, 11, 13]);
      // Slip-trim keeps the dragged edge on its frame: only the second before it can appear.
      assert.deepEqual(window(slipTrim(middle, id, 'end', 20)), [0, 3, 11, 14]);
      assert.deepEqual(window(slipTrim(middle, id, 'start', 0)), [1, 5, 9, 13]);
      assert.deepEqual(window(rollEdit(middle, id, 'end', 40)), [1, 5, 11, 15]);
      for (const doc of [slipClip(middle, id, 10), slipTrim(middle, id, 'end', 20)])
        assertValid(doc);
    });
  }

  it('other placeholders stay unbounded', () => {
    const blank = createClip({ clipId: 'p', placeholder: true, timelineStart: 5, timelineEnd: 8 });
    const edl = testEdl({ v1: [blank] });
    assert.equal(isTimed(blank, edl.tracks[0]), false);
    assert.equal(clipOf(trimClipEnd(edl, 'p', 60), 'p').timelineEnd, 60);
    assert.equal(clipOf(slipClip(edl, 'p', -9), 'p').sourceIn, -9);
  });
});
