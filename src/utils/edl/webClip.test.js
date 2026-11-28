import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compileScore, normalizeRecipe, recipeKey } from '#utils/web/index.js';
import {
  clipKind,
  insertWebClip,
  isStale,
  isWebClip,
  newClipIds,
  setWebRecording,
  splitClips,
  updateWebRecipe,
  webClips,
  webDuration,
} from './index.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

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
  const done = setWebRecording(edl, id, {
    file: FILE,
    key: KEY,
    duration: LENGTH,
    title: 'Pricing',
  });
  return { edl: deepFreeze(done), id };
}

describe('insertWebClip', () => {
  it('adds a placeholder as long as the score, carrying the normalised recipe', () => {
    const { edl, id } = withWebClip(RECIPE, { time: 2 });
    const clip = clipOf(edl, id);
    assertValid(edl);
    assert.equal(LENGTH, 7);
    assert.deepEqual(layout(edl), { v1: [`${id} 2-9`], a1: [] });
    assert.deepEqual([clip.sourceIn, clip.sourceOut], [0, LENGTH]);
    assert.deepEqual(clip.web, { recipe: normalizeRecipe(RECIPE), key: '', title: '' });
    assert.equal(clip.label, 'example.com');
    assert.equal(clip.placeholder, true);
    assert.equal(clip.sourceFile, '');
    assert.equal(clipKind(clip, edl.tracks[0]), 'placeholder');
    assert.ok(isWebClip(clip));
  });

  it('is placed like an overlay: on a new top track when the front track is taken', () => {
    const base = testEdl({ v1: [testClip('a', 0, 20)] });
    const { edl, id } = withWebClip(RECIPE, { time: 5 }, base);
    assertValid(edl);
    assert.equal(edl.tracks.length, 3);
    assert.deepEqual(
      edl.tracks[0].clips.map((clip) => clip.clipId),
      [id],
    );
    assert.deepEqual(layout(edl).v1, ['a 0-20'], 'the picture under it is left alone');
    const onTrack = insertWebClip(base, RECIPE, { time: 30, trackId: 'v1', label: 'Demo' });
    assert.deepEqual(layout(onTrack).v1.length, 2);
    assert.equal(clipOf(onTrack, newClipIds(base, onTrack)[0]).label, 'Demo');
  });

  it('follows the frame rate of the document', () => {
    for (const fps of [24, 25, 60]) {
      const base = testEdl({}, { fps });
      const edl = insertWebClip(base, RECIPE);
      const clip = clipOf(edl, newClipIds(base, edl)[0]);
      assert.equal(clip.timelineEnd, compileScore(RECIPE, fps).duration);
      assert.equal(webDuration(clip, fps), clip.sourceOut);
      assertValid(edl);
    }
  });

  it('changes nothing without an address', () => {
    const base = testEdl();
    for (const recipe of [{}, { url: 'example.com' }, { url: 'file:///etc/passwd' }, null]) {
      assert.equal(insertWebClip(base, recipe), base);
    }
  });
});

describe('updateWebRecipe', () => {
  const longer = { ...RECIPE, steps: [...RECIPE.steps, { do: 'wait', duration: 2 }] };
  const shorter = { ...RECIPE, steps: RECIPE.steps.slice(0, 1) };

  it('a clip that showed the whole score follows the new one', () => {
    const { edl, id } = withWebClip(RECIPE, { time: 1 });
    const grown = updateWebRecipe(edl, id, longer);
    assertValid(grown);
    assert.deepEqual(layout(grown).v1, [`${id} 1-10`]);
    assert.deepEqual(clipOf(grown, id).web.recipe, normalizeRecipe(longer));
    const cut = updateWebRecipe(grown, id, shorter);
    assertValid(cut);
    assert.deepEqual(layout(cut).v1, [`${id} 1-3.9`]);
    assert.deepEqual([clipOf(cut, id).sourceIn, clipOf(cut, id).sourceOut], [0, 2.9]);
  });

  it('a trimmed clip keeps its window, brought inside the new score', () => {
    const { edl, id } = withWebClip();
    const trimmed = deepFreeze(splitClips(edl, 3));
    const [rightId] = newClipIds(edl, trimmed);
    const left = updateWebRecipe(trimmed, id, longer);
    assert.deepEqual(layout(left).v1[0], `${id} 0-3`, 'the left part keeps its three seconds');
    assert.deepEqual([clipOf(left, id).sourceIn, clipOf(left, id).sourceOut], [0, 3]);
    const right = updateWebRecipe(trimmed, rightId, shorter);
    assertValid(right);
    const clip = clipOf(right, rightId);
    assert.ok(clip.sourceOut <= 2.9 + 1e-9, 'no window past the end of the new score');
    assert.ok(clip.sourceIn >= 0 && clip.timelineEnd - clip.timelineStart >= 1 / 30 - 1e-9);
    assert.equal(clip.timelineStart, 3);
  });

  it('keeps the old recording and its key, so the clip is stale, not empty', () => {
    const { edl, id } = recorded();
    assert.equal(isStale(clipOf(edl, id), 30), false);
    const changed = updateWebRecipe(edl, id, longer);
    const clip = clipOf(changed, id);
    assertValid(changed);
    assert.equal(clip.sourceFile, FILE);
    assert.equal(clip.web.key, KEY);
    assert.equal(clip.web.title, 'Pricing');
    assert.equal(clip.placeholder, false);
    assert.equal(isStale(clip, 30), true);
    assert.equal(clip.timelineEnd, 9, 'the length already follows the new score');
  });

  it('takes a function of the current recipe', () => {
    const { edl, id } = withWebClip();
    const dark = updateWebRecipe(edl, id, (recipe) => ({ ...recipe, colorScheme: 'dark' }));
    assert.equal(clipOf(dark, id).web.recipe.colorScheme, 'dark');
    assert.deepEqual(layout(dark), layout(edl));
  });

  it('returns the same document when nothing changes or nothing can', () => {
    const { edl, id } = withWebClip();
    assert.equal(updateWebRecipe(edl, id, RECIPE), edl);
    assert.equal(updateWebRecipe(edl, id, normalizeRecipe(RECIPE)), edl);
    assert.equal(updateWebRecipe(edl, 'nope', longer), edl);
    const plain = testEdl({ v1: [testClip('a', 0, 5)] });
    assert.equal(updateWebRecipe(plain, 'a', longer), plain, 'not a web clip');
    const locked = { ...edl, tracks: edl.tracks.map((track) => ({ ...track, locked: true })) };
    assert.equal(updateWebRecipe(locked, id, longer), locked);
  });

  it('a clip that grows over its neighbour behaves like a trimmed one', () => {
    const base = testEdl({ v1: [testClip('next', 7.2, 20)] });
    const { edl, id } = withWebClip(RECIPE, { trackId: 'v1' }, base);
    assert.deepEqual(layout(edl).v1, [`${id} 0-7`, 'next 7.2-20']);
    const faded = updateWebRecipe(edl, id, longer);
    assertValid(faded);
    assert.deepEqual(layout(faded).v1, [`${id} 0-9`, 'next 7.2-20']);
    assert.ok(Math.abs(clipOf(faded, id).fadeOut - 1.8) < 1e-9, 'a cross-fade');
    const cut = updateWebRecipe(edl, id, longer, { autoCrossfade: false });
    assertValid(cut);
    assert.deepEqual(layout(cut).v1, [`${id} 0-9`, 'next 9-20']);
  });

  it('keeps the recipe while it has no address, and fits the clip when one returns', () => {
    const { edl, id } = withWebClip();
    const blank = updateWebRecipe(edl, id, { ...RECIPE, url: '' });
    assertValid(blank);
    assert.equal(isWebClip(clipOf(blank, id)), false);
    assert.equal(clipOf(blank, id).web.recipe.steps.length, 3, 'the steps are not lost');
    assert.deepEqual(layout(blank), layout(edl));
    assert.deepEqual(webClips(blank), []);
    const back = updateWebRecipe(blank, id, shorter);
    assertValid(back);
    assert.ok(isWebClip(clipOf(back, id)));
    assert.equal(clipOf(back, id).timelineEnd, 2.9);
  });
});

describe('setWebRecording', () => {
  it('points the clip at the recording and makes it a video clip', () => {
    const { edl, id } = recorded();
    const clip = clipOf(edl, id);
    assertValid(edl);
    assert.equal(clip.sourceFile, FILE);
    assert.equal(clip.placeholder, false);
    assert.deepEqual(clip.web, { recipe: normalizeRecipe(RECIPE), key: KEY, title: 'Pricing' });
    assert.equal(clipKind(clip, edl.tracks[0]), 'video');
    assert.deepEqual([clip.sourceIn, clip.sourceOut, clip.timelineEnd], [0, LENGTH, LENGTH]);
    assert.equal(isStale(clip, 30), false);
  });

  it('leaves a trimmed window alone', () => {
    const { edl, id } = withWebClip();
    const halves = splitClips(edl, 3);
    const [rightId] = newClipIds(edl, halves);
    const done = setWebRecording(halves, rightId, { file: FILE, key: KEY, duration: LENGTH });
    assertValid(done);
    const right = clipOf(done, rightId);
    assert.deepEqual([right.sourceIn, right.sourceOut], [3, LENGTH]);
    assert.equal(right.web.title, '', 'no title given: the old one stays');
    assert.equal(clipOf(done, id).sourceFile, '', 'the other half is its own clip');
  });

  it('shows a recording of an earlier recipe without losing the length of the new one', () => {
    const { edl, id } = withWebClip();
    const longer = { ...RECIPE, tail: 4 };
    const edited = updateWebRecipe(edl, id, longer);
    const late = setWebRecording(edited, id, { file: FILE, key: KEY, duration: LENGTH });
    assertValid(late);
    assert.equal(clipOf(late, id).timelineEnd, 10, 'still the whole of the new score');
    assert.equal(isStale(clipOf(late, id), 30), true);
    const key = recipeKey(longer, 30);
    const fresh = setWebRecording(late, id, { file: `/p/${key}.mp4`, key, duration: 10 });
    assertValid(fresh);
    assert.equal(isStale(clipOf(fresh, id), 30), false);
    assert.deepEqual(layout(fresh).v1, [`${id} 0-10`]);
  });

  it('never lets the window pass the score, whatever duration is reported', () => {
    const { edl, id } = withWebClip();
    for (const duration of [LENGTH + 5, LENGTH - 1, 0.01]) {
      const done = setWebRecording(edl, id, { file: FILE, key: KEY, duration });
      assertValid(done);
      assert.ok(clipOf(done, id).sourceOut <= LENGTH + 1e-9);
    }
    const short = setWebRecording(edl, id, { file: FILE, key: KEY, duration: LENGTH - 1 });
    assert.equal(clipOf(short, id).timelineEnd, LENGTH - 1, 'a whole clip follows the recording');
  });

  it('changes nothing without a file, a key and a duration, or twice', () => {
    const { edl, id } = withWebClip();
    const ok = { file: FILE, key: KEY, duration: LENGTH, title: 'T' };
    for (const bad of [
      { file: '' },
      { key: 'xyz' },
      { key: '' },
      { duration: 0 },
      { duration: NaN },
    ]) {
      assert.equal(setWebRecording(edl, id, { ...ok, ...bad }), edl);
    }
    assert.equal(setWebRecording(edl, id, null), edl);
    assert.equal(setWebRecording(edl, 'nope', ok), edl);
    const once = setWebRecording(edl, id, ok);
    assert.equal(setWebRecording(once, id, ok), once);
    const plain = testEdl({ v1: [testClip('a', 0, 5)] });
    assert.equal(setWebRecording(plain, 'a', ok), plain);
    const blank = updateWebRecipe(edl, id, { ...RECIPE, url: '' });
    assert.equal(setWebRecording(blank, id, ok), blank, 'no address, no recording');
  });
});
