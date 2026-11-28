import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compileScore, recipeKey } from '#utils/web/index.js';
import {
  copyClips,
  duplicateClips,
  insertWebClip,
  isStale,
  moveClips,
  newClipIds,
  pasteClips,
  setWebRecording,
  splitClips,
  staleWebClips,
  stepMarks,
  updateClip,
  webClips,
} from './index.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from './testkit.js';

const RECIPE = {
  url: 'https://example.com/pricing',
  steps: [
    { do: 'click', target: 'text=Get started', note: 'open the form' },
    { do: 'type', text: 'ada@example.io', target: 'label=Email' },
    { do: 'focus', target: '#plans' },
  ],
};
const LENGTH = compileScore(RECIPE, 30).duration;
const KEY = recipeKey(RECIPE, 30);
const FILE = `/project/.nearedit/web/${KEY}.mp4`;

/** A document with one web clip; returns it with the clip's id. */
function withWebClip(recipe = RECIPE, opts = {}, base = testEdl()) {
  const edl = deepFreeze(insertWebClip(base, recipe, opts));
  const [id] = newClipIds(base, edl);
  return { edl, id };
}

/** The same, recorded. */
function recorded() {
  const { edl, id } = withWebClip();
  const result = { file: FILE, key: KEY, duration: LENGTH, title: 'Pricing' };
  return { edl: deepFreeze(setWebRecording(edl, id, result)), id };
}

describe('web clips through the other operations', () => {
  it('both halves of a split keep the recipe and the key', () => {
    const { edl, id } = recorded();
    const halves = splitClips(edl, 3);
    const [rightId] = newClipIds(edl, halves);
    assertValid(halves);
    const [left, right] = [clipOf(halves, id), clipOf(halves, rightId)];
    assert.equal(left.web, clipOf(edl, id).web, 'the very same block');
    assert.equal(right.web, left.web);
    assert.deepEqual([left.sourceOut, right.sourceIn, right.sourceOut], [3, 3, LENGTH]);
    assert.equal(right.sourceFile, FILE);
    assert.equal(webClips(halves).length, 2);
    assert.deepEqual(staleWebClips(halves), []);
  });

  it('copy and paste, and duplicate, keep the web block', () => {
    const { edl, id } = recorded();
    const pasted = pasteClips(edl, JSON.parse(JSON.stringify(copyClips(edl, [id]))), { time: 20 });
    assertValid(pasted);
    const [copyId] = newClipIds(edl, pasted);
    assert.deepEqual(clipOf(pasted, copyId).web, clipOf(edl, id).web);
    assert.equal(clipOf(pasted, copyId).sourceFile, FILE);
    assert.equal(isStale(clipOf(pasted, copyId), 30), false);
    const twice = duplicateClips(edl, [id]);
    assertValid(twice);
    assert.equal(webClips(twice).length, 2);
    assert.deepEqual(clipOf(twice, newClipIds(edl, twice)[0]).web, clipOf(edl, id).web);
  });

  it('a move keeps it; updateClip cannot write the recipe or the recording', () => {
    const { edl, id } = recorded();
    const moved = moveClips(edl, [id], { delta: 4 });
    assert.equal(clipOf(moved, id).web, clipOf(edl, id).web);
    const patched = updateClip(edl, id, {
      label: 'Demo',
      web: { recipe: { url: 'https://evil.example' }, key: '' },
      sourceFile: '/etc/passwd',
      sourceIn: 99,
    });
    assertValid(patched);
    const clip = clipOf(patched, id);
    assert.equal(clip.label, 'Demo');
    assert.equal(clip.web, clipOf(edl, id).web);
    assert.deepEqual([clip.sourceFile, clip.sourceIn], [FILE, 0]);
  });
});

describe('setWebRecording and a duration off the frame grid', () => {
  it('takes the nearest frame, so a whole clip stays whole', () => {
    for (const duration of [LENGTH - 1e-7, LENGTH + 1e-7, LENGTH + 0.004, LENGTH - 0.004]) {
      const { edl, id } = withWebClip();
      const done = setWebRecording(edl, id, { file: FILE, key: KEY, duration });
      assertValid(done);
      assert.equal(clipOf(done, id).timelineEnd, LENGTH, String(duration));
      assert.equal(clipOf(done, id).sourceOut, LENGTH);
    }
  });
});

describe('webClips, staleWebClips, stepMarks', () => {
  it('lists web clips, and those that need recording', () => {
    const base = testEdl({ v1: [testClip('film', 20, 30)] });
    const first = withWebClip(RECIPE, { trackId: 'v1' }, base);
    const second = insertWebClip(
      first.edl,
      { url: 'https://example.org' },
      { trackId: 'v1', time: 10 },
    );
    const [otherId] = newClipIds(first.edl, second);
    assert.deepEqual(
      webClips(second).map((ref) => ref.clip.clipId),
      [first.id, otherId],
    );
    assert.equal(webClips(second)[0].track.trackId, 'v1');
    assert.deepEqual(
      staleWebClips(second).map((ref) => ref.clip.clipId),
      [first.id, otherId],
    );
    const done = setWebRecording(second, first.id, { file: FILE, key: KEY, duration: LENGTH });
    assert.deepEqual(
      staleWebClips(done).map((ref) => ref.clip.clipId),
      [otherId],
    );
    assert.deepEqual(
      staleWebClips({ ...done, fps: 25 }).length,
      2,
      'another frame rate, another key',
    );
    assert.deepEqual(webClips(base), []);
  });

  it("marks where the steps begin, in the clip's source time, before anything is recorded", () => {
    const { edl, id } = withWebClip();
    assert.deepEqual(stepMarks(clipOf(edl, id), 30), [
      { time: 0.6, label: 'open the form', do: 'click', index: 0 },
      { time: 1.9, label: 'Type: “ada@example.io”', do: 'type', index: 1 },
      { time: 3.9, label: 'Focus: #plans', do: 'focus', index: 2 },
    ]);
    assert.deepEqual(stepMarks(testClip('a', 0, 5), 30), []);
  });
});
