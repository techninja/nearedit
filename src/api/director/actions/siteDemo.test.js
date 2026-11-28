import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { applyDirectorResult } from '#utils/edl/apply.js';
import { timelineDuration } from '#utils/edl/query.js';
import { testClip, testEdl } from '#utils/edl/testkit.js';
import { validateEdl } from '#utils/edl/validate.js';
import { compileScore, isStale, validateRecipe } from '#utils/web/index.js';
import { checkResult } from '../testing/invariants.js';
import { fakeRecorder } from '../web/testing/fakeRecorder.js';
import { demoContext, scratchProject } from '../web/testing/kit.js';
import { siteDemo } from './siteDemo.js';

const DIR = scratchProject();
const BRIEF = `hover Get started | One update, three places
scroll to Features
zoom in on the chart | Readers, week by week
click Yearly — two months free
highlight the Pro plan
type hello@example.com into Email | Sign up in seconds`;
const run = (directive, extra, recorder = fakeRecorder()) =>
  siteDemo(demoContext(DIR, directive, extra), recorder);
const row = (result, name) => result.tracks.find((track) => track.name === name).clips;
const page = (result) => row(result, 'Page')[0];
const steps = (result) => page(result).web.recipe.steps;

test('the lines of a brief become a recorded demo: recipe, zooms, captions, a window', async () => {
  const recorder = fakeRecorder();
  const ctx = demoContext(DIR, { prompt: BRIEF });
  const result = await siteDemo(ctx, recorder);
  assert.deepEqual(checkResult(result, { fps: 30, roots: [DIR] }), []);
  assert.equal(result.mode, 'replace');
  assert.deepEqual(
    result.tracks.map((track) => track.name),
    ['Titles', 'Text', 'Page', 'Background'],
  );
  // The recipe: one step per stop, each aimed at what the snapshot calls its target.
  const recipe = page(result).web.recipe;
  assert.deepEqual(validateRecipe(recipe).problems, []);
  assert.deepEqual(
    recipe.steps.map((step) => [step.do, step.target ?? step.to]),
    [
      ['hover', 'text=Get started'],
      ['scroll', '#features'],
      ['focus', 'svg[aria-label="Readers chart"]'],
      ['click', 'text=Yearly'],
      ['highlight', 'article[aria-label="Pro plan"]'],
      ['type', 'label=Email'],
    ],
  );
  assert.deepEqual(
    [recipe.url, recipe.viewport, recipe.scale, recipe.onMissing],
    ['https://tideline.test/', { width: 1280, height: 720 }, 2, 'skip'],
  );
  assert.deepEqual([recipe.cursor.style, recipe.cursor.clicks], ['arrow', true]);
  assert.equal(recipe.steps[5].text, 'hello@example.com');
  assert.equal(recipe.steps[3].note, 'two months free', 'the caption travels with the step');
  // The clip: recorded into the project, not stale, as long as its score.
  const clip = page(result);
  assert.ok(clip.sourceFile.startsWith(`${DIR}/.nearedit/web/`) && existsSync(clip.sourceFile));
  assert.equal(isStale(clip, 30), false);
  assert.equal(clip.sourceOut, compileScore(recipe, 30).duration);
  assert.equal(result.duration, clip.timelineEnd);
  assert.ok(Object.keys(clip.keyframes).length === 4 && clip.effects.length === 2);
  assert.deepEqual(
    row(result, 'Titles').map((title) => title.text.content),
    ['One update, three places', 'Readers, week by week', 'two months free', 'Sign up in seconds'],
  );
  assert.equal(row(result, 'Background').length, 1);
  assert.equal(result.markers.length, 6);
  assert.deepEqual(result.markers.map((m) => m.label).slice(0, 2), [
    'One update, three places',
    'scroll “Features”',
  ]);
  // The result says what was done.
  assert.match(
    result.summary,
    /^Site demo of tideline\.test: 6 stops, \d+(\.\d)?s — window look, Midnight, 4 captions, \d zooms$/,
  );
  const notes = result.notes.join('\n');
  assert.match(
    notes,
    /^The brief was read as 6 stops: 1 hover “Get started” · 2 scroll “Features” · 3 zoom in on “chart”/,
  );
  assert.match(
    notes,
    /Recorded “Tideline — changelogs people read” as a desktop page, 1280 × 720, for a wide frame, at 2×/,
  );
  assert.match(notes, /Stop 3: “chart” was taken to be the image “Readers chart”\./);
  assert.match(
    notes,
    /Window look: the page sits \d+% in from the sides, with rounded corners and a shadow, on the Midnight theme \(auto: a dark ground for the page\)/,
  );
  assert.match(notes, /The page is a web clip: open it to change a step and record it again/);
  assert.deepEqual(result.plan.stops[3], {
    do: 'click',
    on: 'Yearly',
    say: 'two months free',
    target: 'text=Yearly',
    start: result.plan.stops[3].start,
    end: result.plan.stops[3].end,
    found: true,
  });
  assert.deepEqual(
    [result.plan.look, result.plan.theme, result.plan.page.viewport],
    ['window', 'midnight', { width: 1280, height: 720 }],
  );
  // One look at the page, one recording, with progress said along the way.
  assert.deepEqual([recorder.looks.length, recorder.recordings.length], [1, 1]);
  assert.ok(ctx.logs.some((line) => /^recording frame \d+ of \d+$/.test(line)));
  assert.ok(ctx.logs.includes('Reading tideline.test…'));
  assert.deepEqual(
    ctx.seen,
    [...ctx.seen].sort((a, b) => a - b),
    'progress only goes forward',
  );
  // The same request again finds its recording in the project.
  const again = await siteDemo(demoContext(DIR, { prompt: BRIEF }), recorder);
  assert.equal(recorder.recordings[1].cached, true);
  assert.match(again.notes.join('\n'), /had been recorded before/);
});

test('no brief: a tour of the page, as long as the target length allows', async () => {
  const result = await run({});
  assert.deepEqual(
    result.plan.stops.map((stop) => `${stop.do} ${stop.on}`),
    [
      'scroll Features',
      'scroll Pricing',
      'scroll Create your account',
      'hover Create account',
      'focus Create account',
    ],
  );
  assert.match(
    result.notes[0],
    /^No brief: a tour of the page — 3 of its 3 sections below the opening view, top to bottom, ending on “Create account”\.$/,
  );
  assert.deepEqual(row(result, 'Titles'), [], 'a tour has nothing to say');
  assert.equal(page(result).transform.y, 0, 'so the window sits in the middle');
  assert.match(result.summary, /5 stops, .* — window look, Midnight, 1 zoom$/);
  const short = await run({ params: { duration: 11 } });
  assert.equal(short.duration, 11);
  assert.deepEqual(short.plan.stops.map((stop) => stop.on).slice(0, 2), [
    'Create your account',
    'Create account',
  ]);
  assert.match(
    short.notes.join('\n'),
    /1 of its 3 sections[\s\S]*2 sections were passed by to keep to the length asked for/,
  );
  const fast = await run({ params: { pacing: 'fast' } });
  const slow = await run({ params: { pacing: 'slow' } });
  assert.ok(fast.duration < result.duration && result.duration < slow.duration);
});

test('names are matched to the page as the demo finds it: after a click, on another page', async () => {
  const recorder = fakeRecorder();
  const brief =
    'click Watch the demo\nclick Close tour\ngo to /docs.html\nscroll to API keys\nclick Reviews\nSomething nobody wrote on this page at all';
  const result = await run({ prompt: brief }, {}, recorder);
  assert.deepEqual(
    steps(result).map((step) => [step.do, step.target || step.to || step.url || '']),
    [
      ['click', 'text=Watch the demo'],
      ['click', 'text=Close tour'],
      ['goto', '/docs.html'],
      ['scroll', 'section:nth-of-type(2)'],
      ['click', 'text=Reviews'],
      ['wait', ''],
    ],
  );
  // Four looks: the page, after the click that opened the dialog, on the new page, and
  // after a click on something unknown — which may have led anywhere.
  assert.deepEqual(
    recorder.looks.map((recipe) => recipe.steps.length),
    [0, 1, 3, 5],
  );
  assert.ok(recorder.looks.every((recipe) => recipe.onMissing === 'skip'));
  const notes = result.notes.join('\n');
  assert.match(
    notes,
    /The page was read again before stop 2, 4 and 6: a click or a new page may have changed what is on it\./,
  );
  assert.match(
    notes,
    /Stop 5: nothing on the page is called “Reviews” — the recording looks for that text when it gets there, and passes over the step if it is not found\./,
  );
  assert.match(
    notes,
    /Stop 6: no heading matches “Something nobody wrote on this page at all” — the page stays where it is while the caption shows\./,
  );
  assert.match(
    notes,
    /The recorder says: Step 5 \(click\): nothing matches text=Reviews — skipped/,
  );
  assert.equal(result.plan.stops[4].found, false);
  assert.equal(
    row(result, 'Titles').at(-1).text.content,
    'Something nobody wrote on this page at all',
  );
});

test('the parameters shape the piece: look, size, theme, zoom, captions, title, length', async () => {
  const full = await run({ prompt: BRIEF, params: { look: 'full', theme: 'paper' } });
  assert.deepEqual([page(full).effects.length, row(full, 'Background').length], [0, 0]);
  assert.ok(
    row(full, 'Titles').every((title) => title.text.background),
    'captions on plates',
  );
  assert.match(full.summary, /full-frame look, 4 captions/);
  const tall = await run({ prompt: BRIEF }, { format: { width: 1080, height: 1920 } });
  assert.deepEqual(page(tall).web.recipe.viewport, { width: 390, height: 844 });
  assert.deepEqual([page(tall).web.recipe.scale, page(tall).web.recipe.cursor.style], [3, 'dot']);
  const filled = await run({ params: { look: 'full' } }, { format: { width: 1080, height: 1920 } });
  assert.deepEqual(page(filled).web.recipe.viewport, { width: 390, height: 694 });
  const chosen = await run(
    { params: { look: 'full', size: 'desktop' } },
    { format: { width: 1080, height: 1920 } },
  );
  assert.match(chosen.notes.join('\n'), /different shapes, so the page is cut at its edges/);
  const plain = await run({
    prompt: BRIEF,
    params: { zoom: false, captions: false, theme: 'forest' },
  });
  assert.deepEqual(row(plain, 'Titles'), []);
  assert.match(plain.notes.join('\n'), /1 zoom inside the window: only on “zoom in on …” steps\./);
  assert.match(plain.notes.join('\n'), /on the Forest theme\./);
  assert.equal(steps(plain)[3].note, 'two months free', 'the words stay on the step');
  const spoken = await run({ prompt: BRIEF });
  assert.ok(plain.duration < spoken.duration, 'no captions, no time to read them');
  // A title card: from the parameter, or from a "# …" line of the brief; it counts towards the length.
  const titled = await run({
    prompt: BRIEF,
    params: { title: 'Tideline | in twenty seconds', duration: 30 },
  });
  assert.equal(titled.duration, 30);
  assert.equal(row(titled, 'Titles')[0].text.content, 'Tideline');
  assert.equal(row(titled, 'Text')[0].text.content, 'in twenty seconds');
  assert.ok(page(titled).timelineStart >= 2 && titled.plan.title === 'Tideline');
  const headed = await run({ prompt: `# From the brief\n${BRIEF}` });
  assert.equal(row(headed, 'Titles')[0].text.content, 'From the brief');
  assert.equal(headed.plan.stops.length, 6);
});

test('the demo merges validly in every mode, into an empty and a cut timeline', async () => {
  const cut = () =>
    testEdl({
      v1: [testClip('a', 0, 8), testClip('b', 8, 20)],
      a1: [testClip('m', 0, 20, { sourceFile: '/media/m.wav' })],
    });
  const context = { playheadPosition: 4, range: { start: 2, end: 18 } };
  for (const mode of ['replace', 'append', 'prepend', 'insert', 'range']) {
    for (const edl of [null, cut()]) {
      const result = await run({ mode, context, prompt: BRIEF }, { edl });
      assert.deepEqual(checkResult(result, { fps: 30, roots: [DIR] }), [], mode);
      const out = applyDirectorResult(edl || testEdl(), result);
      assert.deepEqual(validateEdl(out).problems, [], `${mode} into ${edl ? 'a cut' : 'nothing'}`);
      const had = edl ? 20 : 0;
      const expected = {
        replace: result.duration,
        append: had + result.duration,
        prepend: had + result.duration,
        insert: edl ? had + result.duration : 4 + result.duration,
        range: edl ? had - 16 + result.duration : 2 + result.duration,
      };
      assert.ok(Math.abs(timelineDuration(out) - expected[mode]) < 1e-6, `${mode}: length`);
      if (mode === 'replace' && edl) assert.ok(result.tracks.some((t) => t.type === 'audio'));
    }
  }
});
