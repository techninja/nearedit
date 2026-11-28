import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EFFECT_PRESETS } from '#utils/compose/index.js';
import { normalizeDirective } from '#utils/director/directive.js';
import { themeIds } from '#utils/director/motion/themes.js';
import { BACKGROUNDS, PARTICLES, TRANSITIONS } from '#utils/director/motion/vocab.js';
import { applyDirectorResult } from '#utils/edl/apply.js';
import { timelineDuration } from '#utils/edl/query.js';
import { testClip, testEdl } from '#utils/edl/testkit.js';
import { validateEdl } from '#utils/edl/validate.js';
import { createLlmClient } from '../llm/client.js';
import { checkBrief } from '../motion/brief.js';
import { withoutIds } from '../motion/testkit.js';
import { startFakeLlm } from '../testing/fakeLlm.js';
import { checkResult } from '../testing/invariants.js';
import { motionPiece } from './motion.js';

const BRIEF = 'Made from nothing | no footage, only layers\nEvery number can move\nStart here';
const PLAN = {
  theme: 'neon',
  scenes: [
    { title: 'Spring sale', subtitle: 'three days only', background: 'grid', particles: 'sparks' },
    { title: 'Everything must go', transition: 'iris', textAnimation: 'typewriter' },
    { title: 'Starts Friday', accent: 'frame', duration: 5 },
  ],
};

let fake;
before(async () => {
  fake = await startFakeLlm();
});
after(() => fake.close());

/**
 * An ActionContext without a project: a motion piece needs no media. This
 * suite is about the themes of the list, so it leaves the brand (the
 * default; `motionBrand.test.js`) unless a test names a theme.
 */
function ctxFor(directive, extra = {}) {
  const params = { theme: 'auto', ...directive.params };
  const normal = normalizeDirective({
    ...{ action: 'motion_piece', prompt: BRIEF, ...directive },
    params,
  });
  if (normal.ok === false) throw new Error(`bad test directive: ${JSON.stringify(normal)}`);
  const logs = [];
  const format = { fps: 30, width: 1920, height: 1080, aspectRatio: '16:9', name: 'Main Edit' };
  return {
    projectId: 'none',
    projectDir: '/nowhere',
    directive: normal.directive,
    edl: extra.edl || null,
    format: { ...format, ...extra.format },
    media: [],
    llm: createLlmClient({
      provider: extra.llm === false ? 'none' : 'ollama',
      url: extra.url || fake.url,
      model: 'test-model',
      apiKey: '',
    }),
    signal: extra.signal,
    progress: (_percent, message) => message && logs.push(message),
    log: (message) => logs.push(message),
    logs,
  };
}
const llm = (/** @type {object} */ params = {}) => ({ params: { useLlm: true, ...params } });
const titles = (/** @type {any} */ result) => result.plan.scenes.map((scene) => scene.title);

test('without a brief the action refuses, helpfully, before and inside the job', async () => {
  const refuses = (/** @type {any} */ err) => {
    assert.equal(err.status, 422);
    assert.match(err.message, /Write a brief/);
    assert.match(err.detail, /One line per scene; put a subtitle after " \| "/);
    assert.deepEqual(err.fields, { prompt: 'The brief is empty' });
    return true;
  };
  for (const prompt of ['', '-\n * \n', '|']) {
    await assert.rejects(motionPiece(ctxFor({ prompt })), refuses);
    await assert.rejects(motionPiece(ctxFor({ prompt, params: { useLlm: true } })), refuses);
    // The route's check, which answers 422 before a job exists.
    assert.throws(() => checkBrief(ctxFor({ prompt }).directive), refuses);
  }
  assert.doesNotThrow(() => checkBrief(ctxFor({ prompt: 'One line' }).directive));
});

test('the lines of the brief become a piece, with no model and no media', async () => {
  const before = fake.requests.length;
  const ctx = ctxFor({ params: { seed: 4 } });
  const result = await motionPiece(ctx);
  assert.equal(fake.requests.length, before, 'the model is not asked');
  assert.deepEqual(checkResult(result, { fps: 30 }), []);
  assert.equal(result.mode, 'replace');
  assert.deepEqual(titles(result), ['Made from nothing', 'Every number can move', 'Start here']);
  assert.equal(result.plan.scenes[0].subtitle, 'no footage, only layers');
  assert.equal(result.plan.theme, themeIds()[3], 'seed 4 of auto is the fourth theme');
  const seconds = result.plan.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  assert.ok(Math.abs(seconds - result.duration) < 0.02, 'the plan reports the lengths built');
  assert.match(result.summary, /^Motion piece “Neon”: 3 scenes, \d+(\.\d)?s — /);
  assert.match(result.notes.join('\n'), /Theme Neon \(variation 4\): a black night/);
  assert.match(result.notes.join('\n'), /Laid out for 1920×1080 at 30 fps/);
  const clips = result.tracks.flatMap((track) => track.clips);
  assert.ok(clips.length >= 9 && clips.every((clip) => clip.sourceFile === ''));
  assert.deepEqual(
    result.markers.map((m) => m.label),
    titles(result),
  );
});

test('the same request gives the same piece; seed, theme and format change it', async () => {
  const make = async (/** @type {object} */ params, /** @type {object} */ format) =>
    withoutIds(await motionPiece(ctxFor({ params }, { format })));
  const one = await make({ seed: 7 });
  assert.deepEqual(await make({ seed: 7 }), one);
  assert.notDeepEqual(await make({ seed: 8 }), one);
  assert.notDeepEqual(await make({ seed: 7, theme: 'paper' }), one);
  assert.notDeepEqual(await make({ seed: 7, pacing: 'fast' }), one);
  const tall = await make({ seed: 7 }, { width: 1080, height: 1920 });
  const wrap = (/** @type {any} */ piece) => piece.tracks[0].clips[0].text.maxWidth;
  assert.ok(wrap(tall) < wrap(one) && wrap(tall) <= 1080, 'a narrow frame wraps the title sooner');
  const quiet = await motionPiece(ctxFor({ params: { theme: 'midnight', particles: 'none' } }));
  assert.equal(quiet.tracks.find((t) => t.name === 'Particles').clips.length, 0);
  const paced = await motionPiece(ctxFor({ params: { theme: 'pop', duration: 30 } }));
  assert.equal(paced.duration, 30);
});

test('the piece merges validly in every mode, into an empty and a cut timeline', async () => {
  const cut = () =>
    testEdl({
      v1: [testClip('a', 0, 8), testClip('b', 8, 20)],
      a1: [testClip('m', 0, 20, { sourceFile: '/media/m.wav' })],
    });
  const context = { playheadPosition: 4, range: { start: 2, end: 6 } };
  for (const mode of ['replace', 'append', 'prepend', 'insert', 'range']) {
    for (const edl of [null, cut()]) {
      const result = await motionPiece(ctxFor({ mode, context, params: { seed: 2 } }, { edl }));
      assert.deepEqual(checkResult(result, { fps: 30 }), [], mode);
      const out = applyDirectorResult(edl || testEdl(), result);
      assert.deepEqual(validateEdl(out).problems, [], `${mode} into ${edl ? 'a cut' : 'nothing'}`);
      const had = edl ? 20 : 0;
      const expected = {
        replace: result.duration,
        append: had + result.duration,
        prepend: had + result.duration,
        insert: edl ? had + result.duration : 4 + result.duration,
        range: edl ? had - 4 + result.duration : 2 + result.duration,
      };
      assert.ok(Math.abs(timelineDuration(out) - expected[mode]) < 1e-6, `${mode}: length`);
      if (mode === 'range') assert.equal(result.duration, 4, 'the piece fills the range');
      if (mode === 'replace' && edl) {
        assert.ok(
          result.tracks.some((t) => t.type === 'audio'),
          'every track is accounted for',
        );
      }
    }
  }
  const fixed = { mode: 'range', context, params: { duration: 9 } };
  assert.equal(
    (await motionPiece(ctxFor(fixed))).duration,
    9,
    'a given length wins over the range',
  );
});

test('with the LLM: its plan is built, and the prompt offers the catalog’s names', async () => {
  fake.setReply(() => JSON.stringify(PLAN));
  const ctx = ctxFor({ prompt: 'a teaser for our spring sale', ...llm({ duration: 12 }) });
  const result = await motionPiece(ctx);
  assert.deepEqual(checkResult(result, { fps: 30 }), []);
  assert.deepEqual(titles(result), ['Spring sale', 'Everything must go', 'Starts Friday']);
  assert.equal(result.plan.theme, 'neon');
  const [one, two, three] = result.plan.scenes;
  assert.deepEqual([one.background, one.particles], ['grid', 'sparks']);
  assert.deepEqual([two.transition, two.textAnimation, two.by], ['iris', 'typewriter', 'char']);
  assert.equal(three.accent, 'frame');
  assert.equal(result.duration, 12, 'the target still decides the length');
  assert.ok(three.duration > one.duration, 'the model’s longer scene stays the longest');
  assert.match(result.notes[0], /written by the LLM \(test-model\)/);
  assert.match(result.notes.join('\n'), /Theme Neon \(the LLM’s choice\)/);
  assert.ok(ctx.logs.some((line) => /Asking test-model for a motion plan/.test(line)));
  assert.ok(ctx.logs.some((line) => /Plan received: 3 scenes/.test(line)));

  const request = fake.requests.at(-1).body;
  const [system, user] = request.messages.map((m) => m.content);
  assert.equal(request.format, 'json');
  assert.match(system, /Reply with ONE JSON object/);
  for (const name of [...themeIds(), ...BACKGROUNDS, ...PARTICLES, ...TRANSITIONS]) {
    assert.ok(system.includes(name), `the prompt does not offer ${name}`);
  }
  for (const preset of EFFECT_PRESETS) assert.ok(system.includes(preset.name), preset.name);
  assert.match(system, /Never write times, colours, sizes/);
  assert.match(user, /^FORMAT\nMain Edit: 1920x1080 \(16:9, landscape\), 30 fps\./);
  assert.match(user, /Target length: about 12 seconds, so about \d+ scenes?\./);
  assert.match(user, /Theme: choose the one that suits the request\./);
  assert.match(user, /What the editor asked for: a teaser for our spring sale/);
  await motionPiece(ctxFor(llm({ theme: 'paper', particles: 'snow' })));
  const fixed = fake.requests.at(-1).body.messages[1].content;
  assert.match(fixed, /Theme: paper \(the editor chose it; use it\)/);
  assert.match(fixed, /Particles: snow in every scene/);
});

test('with the LLM: a chatty, malformed reply and unknown names are repaired and explained', async () => {
  fake.setReply(() =>
    [
      '<think>Something bold. {"scenes": []}</think>Here you go:',
      '```json',
      '{"Theme": "x", "theme": "Pop", "slides": [',
      ' {"heading": "Hello  there", "bg": "lava lamp", "particles": "Confetti", "look": "sparkle",},',
      ' {"text": "Goodbye", "animation": "slide up", "by": "letter", "seconds": "3s"},',
      ']}',
      '```',
    ].join('\n'),
  );
  const result = await motionPiece(ctxFor(llm()));
  assert.deepEqual(checkResult(result, { fps: 30 }), []);
  assert.equal(result.plan.theme, 'pop');
  assert.deepEqual(titles(result), ['Hello there', 'Goodbye']);
  const [hello, goodbye] = result.plan.scenes;
  assert.equal(hello.particles, 'confetti');
  assert.deepEqual([goodbye.textAnimation, goodbye.by, goodbye.duration], ['slide-up', 'char', 3]);
  const notes = result.notes.join('\n');
  assert.match(notes, /The model’s JSON was malformed and was repaired/);
  assert.match(notes, new RegExp(`Scene 1: unknown background “lava-lamp” — ${hello.background}`));
  assert.match(notes, /Scene 1: unknown look “sparkle” — none is used instead/);
});

test('with the LLM: one retry with the errors; then the usable scenes are kept', async () => {
  const start = fake.requests.length;
  fake.setReply((req) =>
    req.n === start + 1 ? '{"scenes": "three of them"}' : JSON.stringify(PLAN),
  );
  const retried = await motionPiece(ctxFor(llm()));
  assert.equal(fake.requests.length, start + 2);
  assert.deepEqual(titles(retried), ['Spring sale', 'Everything must go', 'Starts Friday']);
  assert.match(retried.notes.join('\n'), /first plan was rejected \(scenes must be array\)/);
  const messages = fake.requests.at(-1).body.messages;
  assert.equal(messages.length, 4);
  assert.equal(messages[2].content, '{"scenes": "three of them"}');
  assert.match(messages[3].content, /could not be used as a motion plan:\n- scenes must be array/);

  fake.setReply(
    () => '{"scenes": [{"subtitle": "no title"}, {"title": "Kept", "duration": "soon"}]}',
  );
  const salvaged = await motionPiece(ctxFor(llm()));
  assert.deepEqual(titles(salvaged), ['Kept']);
  assert.match(salvaged.notes.join('\n'), /Dropped from the plan — scene 1: must have required/);
  assert.match(
    salvaged.notes.join('\n'),
    /Dropped from the plan — scene 2: duration must be number/,
  );
});

test('with the LLM out of reach or talking nonsense, the lines of the brief are used', async () => {
  const expectFallback = async (/** @type {any} */ ctx, /** @type {RegExp} */ why) => {
    const result = await motionPiece(ctx);
    assert.deepEqual(checkResult(result, { fps: 30 }), []);
    assert.deepEqual(titles(result), ['Made from nothing', 'Every number can move', 'Start here']);
    assert.match(result.notes[0], /The LLM could not write the plan/);
    assert.match(result.notes[0], why);
    assert.match(result.notes[0], /the lines of the brief were used as scenes instead/);
  };
  fake.setReply(() => 'I would rather talk about the weather.');
  await expectFallback(ctxFor(llm()), /did not return a usable motion plan/);
  fake.setReply(() => ({ status: 500, body: { error: 'model crashed' } }));
  await expectFallback(ctxFor(llm()), /\(.+\)/);
  await expectFallback(ctxFor(llm(), { llm: false }), /No LLM provider is configured/);
  await expectFallback(ctxFor(llm(), { url: 'http://127.0.0.1:9' }), /\(.+\)/);
});

test('cancelling while the model writes stops the job', async () => {
  fake.setReply(() => ({ hang: true }));
  const controller = new AbortController();
  const running = motionPiece(ctxFor(llm(), { signal: controller.signal }));
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(running, (err) => err.name === 'AbortError');
});
