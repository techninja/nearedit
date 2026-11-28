import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_VERBS } from '#utils/director/web/planSchema.js';
import { startFakeLlm } from '../testing/fakeLlm.js';
import { checkResult } from '../testing/invariants.js';
import { fakeRecorder } from '../web/testing/fakeRecorder.js';
import { demoContext, scratchProject } from '../web/testing/kit.js';
import { siteDemo } from './siteDemo.js';

const DIR = scratchProject();
const PLAN = {
  title: 'Pricing in ten seconds',
  stops: [
    { do: 'scroll', on: 'Pricing', say: 'Plans for every team' },
    { do: 'click', on: 'Yearly', say: 'Two months free' },
    { do: 'highlight', on: 'Pro plan' },
  ],
};
let fake;
before(async () => {
  fake = await startFakeLlm();
});
after(() => fake.close());

const llm = (directive = {}) => ({
  prompt: 'show how yearly billing saves money',
  ...directive,
  params: { useLlm: true, ...directive.params },
});
const ask = (directive, extra = {}) => {
  const ctx = demoContext(DIR, llm(directive), { llmUrl: fake.url, ...extra });
  return siteDemo(ctx, fakeRecorder()).then((result) => ({ result, ctx }));
};
const stops = (result) => result.plan.stops.map((stop) => `${stop.do} ${stop.on || stop.text}`);
const steps = (result) => result.tracks[2].clips[0].web.recipe.steps;

test('with the LLM: its plan is recorded, and the prompt shows the page by its names', async () => {
  fake.setReply(() => JSON.stringify(PLAN));
  const { result, ctx } = await ask({ params: { duration: 20 } });
  assert.deepEqual(checkResult(result, { fps: 30, roots: [DIR] }), []);
  assert.deepEqual(stops(result), ['scroll Pricing', 'click Yearly', 'highlight Pro plan']);
  assert.deepEqual(
    steps(result).map((step) => step.target || step.to),
    ['#pricing', 'text=Yearly', 'article[aria-label="Pro plan"]'],
  );
  assert.equal(result.duration, 20, 'the target decides the length, not the model');
  assert.equal(
    result.tracks[0].clips[0].text.content,
    'Pricing in ten seconds',
    'its title opens the piece',
  );
  assert.equal(result.plan.title, 'Pricing in ten seconds');
  assert.match(result.notes[0], /^The demo was planned by the LLM \(test-model\)\.$/);
  assert.ok(ctx.logs.includes('Asking test-model for a demo plan…'));
  assert.ok(ctx.logs.includes('Plan received: 3 stops'));

  const request = fake.requests.at(-1).body;
  const [system, user] = request.messages.map((message) => message.content);
  assert.equal(request.format, 'json');
  assert.match(system, /Reply with ONE JSON object/);
  for (const verb of DEMO_VERBS)
    assert.ok(system.includes(`\n  ${verb}: `), `the prompt does not offer ${verb}`);
  assert.ok(!/\n {2}(run|hide|move): /.test(system), 'nor what a demo may not do');
  assert.match(system, /Never write times, durations, selectors, coordinates, sizes or colours\./);
  assert.match(
    user,
    /^PAGE\n"Tideline — changelogs people read" — https:\/\/tideline\.test\/ — seen 1280 × 720, 2516 px tall\n\(top of the page\)\n {2}link "Features"/,
  );
  assert.match(user, /\nheading "Pricing"\n {2}button "Monthly"\n {2}button "Yearly"/);
  assert.ok(
    !user.includes('aria-label') && !user.includes('text=Yearly'),
    'no selectors are shown',
  );
  assert.match(user, /\nTIMELINE\nMain Edit: 1920x1080 \(16:9, landscape\), 30 fps\.\n/);
  assert.match(user, /Target length: about 20 seconds, so about 7 stops\.\nPacing: medium\./);
  assert.match(user, /Captions: write a "say" for the stops that deserve one\./);
  assert.match(
    user,
    /What the editor asked for: show how yearly billing saves money\n\nReply with the JSON demo plan\.$/,
  );
  await ask({ prompt: '', params: { captions: false, pacing: 'fast' } });
  const bare = fake.requests.at(-1).body.messages[1].content;
  assert.match(bare, /Captions: none \(the editor turned them off\); leave "say" out\./);
  assert.match(
    bare,
    /The editor gave no further direction: plan a tour of the page, top to bottom/,
  );
  assert.ok(!bare.includes('Target length'));
});

test('with the LLM: a chatty, malformed reply and names of its own are repaired and explained', async () => {
  fake.setReply(() =>
    [
      '<think>The pricing matters most. {"stops": []}</think>Here you go:',
      '```json',
      "{steps: [{action: 'Tap', target: 'css=.btn-primary:nth-child(2)', duration: 99, caption: 'Open pricing',},",
      " {action: 'zoom in', element: 'the chart'}, 'type hi@x.io into the Email field', {do: 'scroll', on: 'Testimonials'}]}",
      '```',
      'Hope that helps!',
    ].join('\n'),
  );
  const { result } = await ask();
  assert.deepEqual(stops(result), [
    'click css=.btn-primary:nth-child(2)',
    'focus the chart',
    'type Email field',
    'scroll Testimonials',
  ]);
  // A selector the model wrote is only ever a name to look for — and its times count for nothing.
  assert.deepEqual(
    result.plan.stops.map((stop) => stop.target),
    [
      ...['text=css=.btn-primary:nth-child(2)', 'svg[aria-label="Readers chart"]'],
      ...['label=Email', 'text=Testimonials'],
    ],
  );
  const made = steps(result);
  assert.ok(made[0].duration < 2);
  assert.equal(made.find((step) => step.do === 'type').text, 'hi@x.io');
  const notes = result.notes.join('\n');
  assert.match(notes, /The model’s JSON was malformed and was repaired\./);
  assert.match(notes, /Stop 1: nothing on the page is called “css=\.btn-primary:nth-child\(2\)”/);
  assert.match(notes, /Stop 2: “the chart” was taken to be the image “Readers chart”\./);
  assert.match(notes, /Stop 4: nothing on the page is called “Testimonials”/);
  assert.match(
    notes,
    /The recorder says: Step 1 \(click\): nothing matches text=css=\.btn-primary:nth-child\(2\) — skipped/,
  );
});

test('with the LLM: an unusable plan is sent back once; then what can be played is kept', async () => {
  const before = fake.requests.length;
  fake.setReply((request) =>
    request.n === before + 1
      ? '{"stops": [{"do": "teleport", "on": "Mars"}]}'
      : JSON.stringify(PLAN),
  );
  const { result, ctx } = await ask();
  assert.equal(fake.requests.length, before + 2);
  const retry = fake.requests.at(-1).body.messages;
  assert.deepEqual(
    retry.map((message) => message.role),
    ['system', 'user', 'assistant', 'user'],
  );
  assert.match(
    retry[3].content,
    /could not be used as a demo plan:\n- stops\[0\]\.do must be equal to one of the allowed values/,
  );
  assert.equal(result.plan.stops.length, 3);
  assert.match(
    result.notes[1],
    /^The model’s first plan was rejected \(stops\[0\]\.do must be equal/,
  );
  assert.ok(
    ctx.logs.some((line) => /^Plan not usable \(.*\) — asking the model to correct it$/.test(line)),
  );

  fake.setReply(
    () =>
      '{"stops": [{"do": "click"}, {"do": "hover", "on": "Get started"}, {"do": "run", "text": "x"}]}',
  );
  const kept = (await ask()).result;
  assert.deepEqual(stops(kept), ['hover Get started']);
  assert.match(
    kept.notes.join('\n'),
    /Dropped from the plan — stop 1: click needs "on"[\s\S]*Dropped from the plan — stop 3: do must be equal/,
  );
});

test('with the LLM out of reach, or of no use, the brief is read instead — and says so', async () => {
  const brief = 'click Pricing\nhover Get started';
  fake.setReply(() => 'I am sorry, I cannot plan videos.');
  const useless = (await ask({ prompt: brief })).result;
  assert.deepEqual(stops(useless), ['click Pricing', 'hover Get started']);
  assert.match(
    useless.notes[0],
    /^The LLM could not plan the demo \(The LLM did not return a usable demo plan\) — the lines of the brief were read as steps instead\.$/,
  );
  assert.match(useless.notes[1], /^The brief was read as 2 stops/);

  const count = fake.requests.length;
  const gone = await siteDemo(
    demoContext(DIR, llm({ prompt: '' }), { llmUrl: 'http://127.0.0.1:9' }),
    fakeRecorder(),
  );
  assert.match(
    gone.notes[0],
    /^The LLM could not plan the demo \(.+\) — a tour of the page was made instead\.$/,
  );
  assert.match(gone.notes[1], /^No brief: a tour of the page/);
  const off = await siteDemo(demoContext(DIR, llm({ prompt: brief })), fakeRecorder());
  assert.match(
    off.notes[0],
    /^The LLM could not plan the demo \(No LLM provider is configured.*\) — the lines of the brief/,
  );
  assert.equal(fake.requests.length, count, 'no request was made');
  // Without the switch the model is never asked.
  await siteDemo(demoContext(DIR, { prompt: brief }, { llmUrl: fake.url }), fakeRecorder());
  assert.equal(fake.requests.length, count);
});

test('cancelling while the model writes stops the job', async () => {
  fake.setReply(() => ({ hang: true }));
  const stop = new AbortController();
  const pending = ask({}, { signal: stop.signal });
  setTimeout(() => stop.abort(), 60);
  await assert.rejects(pending, (err) => err.name === 'AbortError');
});
