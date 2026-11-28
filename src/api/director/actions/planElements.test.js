import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { builtinKit, resolveKit } from '#utils/brand/index.js';
import { applyDirected } from '#utils/director/applyResult.js';
import { createEdl, elementClips, timelineDuration, validateEdl } from '#utils/edl/index.js';
import { assembleResult } from '../pipeline.js';
import { parsePlan, salvagePlan } from '../plan/parse.js';
import { editPlanPrompt, scriptPlanPrompt } from '../prompts/editPlan.js';
import { makeContext } from '../testing/context.js';
import { startFakeLlm } from '../testing/fakeLlm.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { generateEdit } from './generateEdit.js';

// Handles in the park project: m1 beach, m2 city, m3 interview, m4 music,
// m5 sign.png, m6 tall.png, m7 voice-memo.wav, m8 voice.wav.
const PICKS = [
  { file: 'm3', role: 'primary', segments: [1, 2], note: 'arrival' },
  { file: 'm2', role: 'broll', start: 0.5, end: 3.5, note: 'the city' },
  { file: 'm1', role: 'broll', scene: 2 },
];
let fake;
let park;
before(async () => {
  fake = await startFakeLlm();
  park = await createParkProject();
});
after(async () => {
  await fake.close();
  park.cleanup();
});
const ctxFor = (extra = {}) =>
  makeContext(
    park,
    { action: 'generate_edit', prompt: 'the park', params: { duration: 14 } },
    extra,
  );
const row = (result, name) => result.tracks.find((t) => t.name === name).clips;
const els = (clips) => clips.filter((c) => c.element).map((c) => [c.element.id, c.element.slots]);
const span = (c) => [c.timelineStart, c.timelineEnd];

test('a plan names elements: an overlay over its pick, a card before it, a stinger on its cut', async () => {
  const ctx = await ctxFor({ kit: resolveKit(builtinKit('bold')) });
  const plan = {
    picks: PICKS,
    elements: [
      { element: 'intro', slots: { title: 'Park day', subtitle: 'A short film' } },
      { element: 'lower-third', slots: { name: 'Ada Lovelace', role: 'Park ranger' }, pick: 1 },
      { element: 'chapter', slots: { title: 'The city' }, pick: 2 },
      { element: 'stinger', pick: 3 },
      { element: 'outro', slots: { title: 'Thanks for watching' } },
    ],
  };
  const bare = assembleResult({ picks: PICKS }, ctx);
  const result = assembleResult(plan, ctx);
  const durations = Object.fromEntries(ctx.media.map((m) => [m.filePath, m.duration]));
  assert.deepEqual(checkResult(result, { fps: 30, durations, roots: [park.dir] }), []);
  const main = row(result, 'Main');
  // The cards stand in the cut, on the main row, each taking its own time.
  assert.deepEqual(els(main), [
    ['intro', { title: 'Park day', subtitle: 'A short film' }],
    ['chapter', { title: 'The city' }],
    ['outro', { title: 'Thanks for watching' }],
  ]);
  assert.deepEqual(span(main[0]), [0, 4], 'the intro opens the edit');
  assert.equal(result.duration, bare.duration + 4 + 3 + 5);
  assert.equal(main.at(-1).timelineEnd, result.duration, 'the outro closes it');
  const shots = main.filter((c) => !c.element);
  const [chapter] = main.filter((c) => c.element?.id === 'chapter');
  assert.equal(chapter.timelineEnd, shots.find((c) => /city/.test(c.sourceFile)).timelineStart);
  // The overlays are on the Titles row: the name over its pick, the stinger across the cut into pick 3.
  const titles = row(result, 'Titles');
  assert.deepEqual(els(titles), [
    ['lower-third', { name: 'Ada Lovelace', role: 'Park ranger' }],
    ['stinger', {}],
  ]);
  assert.equal(titles[0].timelineStart, 4, 'where the first pick begins, after the intro');
  const beach = shots.find((c) => /beach/.test(c.sourceFile));
  assert.ok(
    titles[1].timelineStart < beach.timelineStart && titles[1].timelineEnd > beach.timelineStart,
  );
  // Linked pairs stay in step, markers follow the cards, and the plan says what it used.
  assert.deepEqual(
    result.markers.map((m) => [m.label, m.time]),
    [
      ['arrival', 4],
      ['the city', chapter.timelineEnd],
    ],
  );
  assert.deepEqual(result.plan.elements[1], {
    element: 'lower-third',
    slots: { name: 'Ada Lovelace', role: 'Park ranger' },
    pick: 1,
  });
  assert.match(result.summary, /5 brand elements$/);
  const merged = applyDirected(createEdl(), result);
  assert.deepEqual(validateEdl(merged).problems, []);
  assert.ok(elementClips(merged).every(({ clip }) => clip.element.kit.id === 'bold'));
  assert.equal(timelineDuration(merged), result.duration);
});

test('what cannot be placed is dropped and said; the rest stands', async () => {
  const ctx = await ctxFor();
  const result = assembleResult(
    {
      title: 'Park day',
      picks: PICKS,
      elements: [
        { element: 'fireworks', slots: { text: 'boom' } },
        { element: 'bug' },
        { element: 'lower-third', slots: { name: 'Nobody' }, pick: 9 },
        { element: 'chapter', slots: { title: 'Floating' } },
        { element: 'stinger' },
        { element: 'quote', line: '“We arrived early” — Ada', at: 5 },
        { element: 'title', slots: { title: 'Too late' }, at: 500 },
      ],
    },
    ctx,
  );
  assert.deepEqual(checkResult(result, { fps: 30, roots: [park.dir] }), []);
  const notes = result.notes.join('\n');
  assert.match(notes, /The brand kit has no element “fireworks” — left out\./);
  assert.match(notes, /The logo bug spans a finished piece: run “Apply brand”/);
  assert.match(notes, /“Nobody” goes with pick 9, which is not in the edit — left out\./);
  assert.match(notes, /The chapter card “Floating” names no pick to open — left out\./);
  assert.match(notes, /A stinger names no pick or time — left out\./);
  assert.match(notes, /“Too late” was asked for at 8m 20s, after the end\./);
  // The opening title is the kit's title element; the quote shows at its time, after the title.
  assert.deepEqual(els(row(result, 'Titles')), [
    ['title', { title: 'Park day' }],
    ['quote', { text: 'We arrived early', by: 'Ada' }],
    ['title', { title: 'Too late' }],
  ]);
  assert.deepEqual(span(row(result, 'Titles')[1]), [5, 11]);
  assert.deepEqual(els(row(result, 'Main')), []);
});

test('reading a plan: elements under other keys, as lines, with flat slots — and salvaged one by one', () => {
  const reply = JSON.stringify({
    picks: [{ file: 'm3' }],
    graphics: [
      'lower third: Ada Lovelace, CEO, at 0:12',
      { type: 'Chapter card', title: 'The river', over: 'pick 2' },
      { element: 'intro', slots: { title: 'Park' } },
    ],
  });
  const parsed = parsePlan(reply);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.plan.elements, [
    { element: 'lower third', line: 'Ada Lovelace, CEO', at: 12 },
    { element: 'Chapter card', pick: 2, slots: { title: 'The river' } },
    { element: 'intro', slots: { title: 'Park' } },
  ]);
  const broken = JSON.stringify({
    picks: [{ file: 'm3' }, { start: 2 }],
    elements: [{ element: 'intro', slots: { title: 'Park' } }, { slots: { title: 'x' } }, 7],
  });
  assert.equal(parsePlan(broken).ok, false);
  const kept = salvagePlan(broken);
  assert.deepEqual(kept.plan.elements, [{ element: 'intro', slots: { title: 'Park' } }]);
  assert.match(kept.dropped.join(' '), /2 element item\(s\) could not be read/);
});

test('with the LLM: the prompt lists the kit’s elements, and the plan’s elements are built', async () => {
  fake.setReply(() =>
    JSON.stringify({
      title: 'Park Day',
      picks: PICKS,
      elements: ['lower third: Ada Lovelace, Park ranger', { element: 'outro', title: 'The end' }],
    }),
  );
  const ctx = await ctxFor({ llmUrl: fake.url, kit: resolveKit(builtinKit('documentary')) });
  const result = await generateEdit(ctx);
  const [system, user] = fake.requests.at(-1).body.messages.map((m) => m.content);
  assert.match(system, /"elements" is optional: graphics of the brand kit, listed under BRAND/);
  assert.match(system, /"elements": \[\s*\{\s*"element": "lower-third"/, 'the example shows one');
  assert.match(user, /BRAND\nThe brand kit “Documentary” has these elements/);
  assert.match(user, / {2}lower-third \(name, role\?\) — Lower third: over the picture/);
  assert.match(user, / {2}intro \(title, subtitle\?\) — Intro: a card that takes its own time/);
  assert.match(user, / {2}stinger — Stinger: covers the frame for a moment, on a cut/);
  assert.doesNotMatch(user, / {2}bug |  caption /, 'the bug and captions belong to other actions');
  assert.ok(user.indexOf('BRAND') < user.indexOf('REQUEST'));
  // The name (no pick, no time) shows from the start — after the opening title; the outro closes.
  assert.deepEqual(els(row(result, 'Titles')), [
    ['title', { title: 'Park Day' }],
    ['lower-third', { name: 'Ada Lovelace', role: 'Park ranger' }],
  ]);
  assert.deepEqual(els(row(result, 'Main')), [['outro', { title: 'The end' }]]);
  const script = scriptPlanPrompt({
    digest: 'm1 …',
    script: '# x',
    format: ctx.format,
    kit: ctx.kit,
  });
  assert.match(
    script.user,
    /BRAND[\s\S]*APPROVED SCRIPT[\s\S]*use the brand element for it in "elements"/,
  );
  assert.doesNotMatch(
    editPlanPrompt({ digest: '', directive: ctx.directive, format: ctx.format }).user,
    /BRAND/,
  );
});
