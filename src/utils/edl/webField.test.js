import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compileScore, normalizeRecipe, recipeKey } from '#utils/web/index.js';
import {
  applyDirectorResult,
  createClip,
  fromSavedDocument,
  insertWebClip,
  isTimed,
  newClipIds,
  normalizeEdl,
  setWebRecording,
  toSavedDocument,
  validateEdl,
} from './index.js';
import { assertValid, clipOf, testClip, testEdl } from './testkit.js';

const RECIPE = { url: 'https://example.com', steps: [{ do: 'wait', duration: 3.4 }] };
const LENGTH = 5; // 0.6 lead + 3.4 + 1 tail
const KEY = recipeKey(RECIPE, 30);
const FILE = `/project/.nearedit/web/${KEY}.mp4`;

/** A raw clip as a document on disk might hold it. */
const rawClip = (fields = {}) => ({
  clipId: 'w',
  timelineStart: 0,
  timelineEnd: LENGTH,
  sourceIn: 0,
  sourceOut: LENGTH,
  web: { recipe: RECIPE },
  ...fields,
});
const rawDoc = (clip) => ({ version: 3, fps: 30, tracks: [{ type: 'video', clips: [clip] }] });
const loaded = (clip) => normalizeEdl(rawDoc(clip)).tracks[0].clips[0];
const problemsOf = (edl) => validateEdl(edl).problems.map((problem) => problem.path);

describe('the web field on load', () => {
  it('is absent on every clip that is not a web clip', () => {
    assert.ok(!('web' in createClip()));
    assert.ok(!('web' in loaded(rawClip({ web: undefined, sourceFile: '/a.mp4' }))));
    const plain = normalizeEdl(testEdl({ v1: [testClip('a', 0, 5)], a1: [testClip('b', 0, 5)] }));
    for (const track of plain.tracks) for (const clip of track.clips) assert.ok(!('web' in clip));
    for (const web of [null, 5, 'x', [], {}, { recipe: 'x' }, { key: KEY }, { recipe: [RECIPE] }]) {
      assert.ok(!('web' in loaded(rawClip({ web }))), JSON.stringify(web));
    }
  });

  it('keeps the block of a web clip, with its recipe normalised', () => {
    const clip = loaded(rawClip({ web: { recipe: RECIPE, key: KEY, title: 'Example', more: 1 } }));
    assert.deepEqual(clip.web, { recipe: normalizeRecipe(RECIPE), key: KEY, title: 'Example' });
    assert.deepEqual(Object.keys(loaded(rawClip()).web), ['recipe', 'key', 'title']);
    assert.deepEqual(loaded(rawClip()).web, {
      recipe: normalizeRecipe(RECIPE),
      key: '',
      title: '',
    });
  });

  it('bounds hostile blocks', () => {
    const long = 'x'.repeat(50000);
    const cycle = { url: 'https://example.com', steps: [] };
    cycle.steps.push(cycle, { do: 'run', js: long, note: cycle });
    const polluted = JSON.parse(
      `{"recipe":{"url":"https://example.com","__proto__":{"steps":[{"do":"wait"}]}},"key":"${long}","title":"${long}","__proto__":{"x":1}}`,
    );
    const edl = normalizeEdl(rawDoc(rawClip({ web: { recipe: cycle, key: 7, title: {} } })));
    assertValid(edl);
    const [clip] = edl.tracks[0].clips;
    assert.equal(clip.web.recipe.steps.length, 1);
    assert.equal(clip.web.recipe.steps[0].js.length, 5000);
    assert.deepEqual([clip.web.key, clip.web.title], ['', '']);
    const other = loaded(rawClip({ web: polluted }));
    assert.deepEqual(other.web.recipe.steps, []);
    assert.equal(other.web.key, '');
    assert.equal(other.web.title.length, 300);
    assert.equal({}.x, undefined);
  });

  it('keeps a recipe without an address — as data, not as a web clip', () => {
    const edl = normalizeEdl(
      rawDoc(rawClip({ web: { recipe: { ...RECIPE, url: 'example.com' } } })),
    );
    assertValid(edl);
    const [clip] = edl.tracks[0].clips;
    assert.equal(clip.web.recipe.url, '');
    assert.equal(clip.web.recipe.steps.length, 1);
    assert.equal(isTimed(clip, edl.tracks[0]), false);
  });

  it('brings the window of a web clip inside its score', () => {
    const cases = [
      [{ timelineEnd: 30, sourceOut: 30 }, [0, LENGTH, LENGTH]],
      // As for footage: of a window that starts before the source, what is left counts.
      [{ sourceIn: -2, sourceOut: 3 }, [0, 3, 3]],
      [{ sourceIn: 2, sourceOut: 30, timelineEnd: 28 }, [2, LENGTH, 3]],
      [{ sourceIn: 99, sourceOut: 104 }, [LENGTH - 1 / 30, LENGTH, 1 / 30]],
      [{ sourceIn: 1, sourceOut: 4, timelineStart: 10, timelineEnd: 13 }, [1, 4, 13]],
    ];
    for (const [fields, [sourceIn, sourceOut, timelineEnd]] of cases) {
      const edl = normalizeEdl(rawDoc(rawClip(fields)));
      assertValid(edl);
      const [clip] = edl.tracks[0].clips;
      const near = (a, b) => Math.abs(a - b) < 1e-9;
      assert.ok(
        near(clip.sourceIn, sourceIn),
        `${JSON.stringify(fields)} sourceIn ${clip.sourceIn}`,
      );
      assert.ok(near(clip.sourceOut, sourceOut), `${JSON.stringify(fields)} sourceOut`);
      assert.ok(near(clip.timelineEnd, timelineEnd), `${JSON.stringify(fields)} end`);
    }
  });

  it('a web clip written without an end lasts as long as its score', () => {
    const bare = { timelineStart: 4, web: { recipe: RECIPE } };
    const clip = loaded(bare);
    assert.deepEqual(
      [clip.timelineStart, clip.timelineEnd, clip.sourceIn, clip.sourceOut],
      [4, 4 + LENGTH, 0, LENGTH],
    );
    const late = loaded({ ...bare, sourceIn: 2 });
    assert.deepEqual(
      [late.timelineEnd, late.sourceIn, late.sourceOut],
      [4 + LENGTH - 2, 2, LENGTH],
    );
    assert.equal(normalizeEdl(rawDoc({ timelineStart: 4 })).tracks[0].clips.length, 0);
    const blank = { timelineStart: 4, web: { recipe: { ...RECIPE, url: '' } } };
    assert.equal(normalizeEdl(rawDoc(blank)).tracks[0].clips.length, 0, 'no address, no score');
  });

  it('a normalised document with web clips comes back equal, also through a save', () => {
    const base = testEdl({ v1: [testClip('a', 0, 4)], a1: [testClip('s', 0, 4)] });
    const one = insertWebClip(base, RECIPE, { time: 2 });
    const [id] = newClipIds(base, one);
    const edl = setWebRecording(one, id, { file: FILE, key: KEY, duration: LENGTH, title: 'T' });
    assertValid(edl);
    assert.deepEqual(normalizeEdl(edl), edl);
    const saved = JSON.parse(JSON.stringify(toSavedDocument(edl, { zoom: 2 })));
    assert.deepEqual(fromSavedDocument(saved).edl, edl);
    assert.deepEqual(clipOf(fromSavedDocument(saved).edl, id).web, clipOf(edl, id).web);
  });

  it('a director fragment may carry a web clip', () => {
    const base = testEdl();
    const fragment = {
      mode: 'append',
      tracks: [{ type: 'video', clips: [rawClip({ clipId: 'demo' })] }],
    };
    const edl = applyDirectorResult(base, fragment);
    assertValid(edl);
    assert.deepEqual(clipOf(edl, 'demo').web.recipe, normalizeRecipe(RECIPE));
  });
});

describe('validateEdl and web clips', () => {
  const base = testEdl();
  const inserted = insertWebClip(base, RECIPE);
  const [id] = newClipIds(base, inserted);
  const withWeb = (web) => ({
    ...inserted,
    tracks: inserted.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => (clip.clipId === id ? { ...clip, ...web } : clip)),
    })),
  });
  const recipe = clipOf(inserted, id).web.recipe;

  it('accepts what the operations make, and clips without the field', () => {
    assert.deepEqual(validateEdl(inserted).problems, []);
    assert.deepEqual(validateEdl(testEdl({ v1: [testClip('a', 0, 5)] })).problems, []);
  });

  it('reports a block of the wrong shape', () => {
    const at = 'tracks[0].clips[0].web';
    assert.deepEqual(problemsOf(withWeb({ web: 5 })), [at]);
    assert.deepEqual(problemsOf(withWeb({ web: { recipe, key: 'zz', title: '' } })), [`${at}.key`]);
    assert.deepEqual(problemsOf(withWeb({ web: { recipe, key: '', title: 3 } })), [`${at}.title`]);
    assert.deepEqual(problemsOf(withWeb({ web: { recipe, key: '', title: '', x: 1 } })), [
      `${at}.x`,
    ]);
    assert.deepEqual(problemsOf(withWeb({ web: { recipe: [], key: '', title: '' } })), [
      `${at}.recipe`,
    ]);
  });

  it('reports a recipe that is not normalised, with the place', () => {
    const at = 'tracks[0].clips[0].web.recipe';
    const broken = (change) => problemsOf(withWeb({ web: { recipe: change, key: '', title: '' } }));
    assert.deepEqual(broken({ ...recipe, scale: 99 }), [`${at}.scale`]);
    assert.deepEqual(broken({ ...recipe, url: 'javascript:alert(1)' }), [`${at}.url`]);
    assert.deepEqual(broken({ ...recipe, extra: true }), [`${at}.extra`]);
    assert.deepEqual(broken({ ...recipe, viewport: { width: 1280 } }), [`${at}.viewport.height`]);
    const unknownStep = { ...recipe, steps: [{ do: 'teleport' }] };
    // …and without that step the score is shorter than the clip.
    assert.deepEqual(broken(unknownStep), [`${at}.steps[0]`, 'tracks[0].clips[0].sourceOut']);
    const sloppyStep = { ...recipe, steps: [{ ...recipe.steps[0], duration: 1e9 }] };
    assert.deepEqual(broken(sloppyStep), [`${at}.steps[0].duration`]);
    const message = validateEdl(withWeb({ web: { recipe: sloppyStep, key: '', title: '' } }))
      .problems[0].message;
    assert.match(message, /normalised recipe/);
  });

  it('does not judge whether the recipe can be recorded', () => {
    const unfinished = {
      ...recipe,
      steps: [
        ...recipe.steps,
        normalizeRecipe({ url: 'https://e.com', steps: [{ do: 'click' }] }).steps[0],
      ],
    };
    const length = compileScore(unfinished, 30).duration;
    const edl = withWeb({
      web: { recipe: unfinished, key: '', title: '' },
      timelineEnd: length,
      sourceOut: length,
    });
    assert.deepEqual(validateEdl(edl).problems, []);
  });

  it('reports a window outside the score, recorded or not', () => {
    const at = 'tracks[0].clips[0]';
    const late = withWeb({ sourceIn: 2, sourceOut: 2 + LENGTH });
    assert.deepEqual(problemsOf(late), [`${at}.sourceOut`]);
    const early = withWeb({ sourceIn: -1, sourceOut: LENGTH - 1 });
    assert.deepEqual(problemsOf(early), [`${at}.sourceIn`]);
    const recorded = setWebRecording(inserted, id, { file: FILE, key: KEY, duration: LENGTH });
    const stretched = {
      ...recorded,
      tracks: recorded.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => ({ ...clip, timelineEnd: 9, sourceOut: 9 })),
      })),
    };
    assert.deepEqual(problemsOf(stretched), [`${at}.sourceOut`]);
    assert.deepEqual(validateEdl(stretched, { sourceDurations: { [FILE]: 100 } }).valid, false);
    assert.deepEqual(normalizeEdl(stretched).tracks[0].clips[0].timelineEnd, LENGTH);
  });
});
