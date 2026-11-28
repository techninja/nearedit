import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { STYLES } from '#utils/director/score/styles.js';
import { applyDirectorResult } from '#utils/edl/apply.js';
import { validateEdl } from '#utils/edl/validate.js';
import { fakeRenderer } from '../score/testing/renderer.js';
import { makeContext } from '../testing/context.js';
import { startFakeLlm } from '../testing/fakeLlm.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { clip, doc, pair, title } from '../testing/timeline.js';
import { score } from './score.js';

const PLAN = {
  style: 'bossa',
  mood: ['calm', 'hopeful'],
  sections: [
    { name: 'intro', share: 1, energy: 0.2 },
    { name: 'verse', share: 1, energy: 0.5 },
    { name: 'lift', share: 2, energy: 1 },
  ],
};
let park;
let P;
let fake;
before(async () => {
  park = await createParkProject();
  P = park.paths;
  fake = await startFakeLlm();
});
after(async () => {
  await fake.close();
  park.cleanup();
});

/** Forty seconds: the interview, b-roll and a title, with a marker where the product is shown. */
function timeline() {
  const [video, audio] = pair(P['interview.mp4'], 0, 16, 0);
  const shots = [16, 22, 28, 34].map((at) => clip(P['broll/beach.mp4'], 0, 6, at));
  return doc(
    { video: [[title('Meet the dashboard', 20, 24)], [video, ...shots]], audio: [[audio]] },
    { markers: [{ markerId: 'm_1', time: 20, label: 'Product reveal', color: '' }] },
  );
}
const ask = async (directive = {}, extra = {}) => {
  const edl = timeline();
  const full = {
    action: 'score',
    prompt: 'calm, picks up at the product reveal',
    ...directive,
    params: { useLlm: true, ...directive.params },
  };
  const ctx = await makeContext(park, full, { edl, llmUrl: fake.url, ...extra });
  const result = await score(ctx, fakeRenderer());
  assert.deepEqual(checkResult(result, { fps: 30, roots: [park.dir] }), []);
  assert.deepEqual(validateEdl(applyDirectorResult(edl, result)).problems, []);
  const music = result.tracks.at(-1).clips[0];
  return { result, ctx, music };
};
const arc = (result) => result.plan.sections.map((s) => [s.name, s.start, s.energy]);

test('with the LLM: its style, mood and sections; the notes are still written by rule', async () => {
  fake.setReply(() => JSON.stringify(PLAN));
  const { result, ctx, music } = await ask();
  assert.equal(result.plan.style, 'bossa');
  assert.deepEqual(result.plan.mood, ['calm', 'hopeful']);
  // Energy 0.5 from the form, −0.2 from the mood; the sections' own levels move around that.
  assert.deepEqual([result.plan.energy, result.plan.brightness], [0.3, 0.65]);
  // 40 s of bossa at 120 BPM are 20 bars, and the marker at 20 s is a bar line: the plan's
  // lift — the second half — begins on it.
  assert.deepEqual([result.plan.bpm, result.plan.bars], [120, 20]);
  assert.deepEqual(arc(result), [
    ['intro', 0, 0.16],
    ['verse', 10, 0.4],
    ['lift', 20, 0.8],
  ]);
  assert.deepEqual(result.notes.slice(0, 3), [
    'The music was planned by the LLM (test-model).',
    'Style Bossa nova (the LLM’s choice).',
    'Mood: calm, hopeful — energy 0.3, brightness 0.65.',
  ]);
  assert.match(result.notes.join('\n'), /· lift 0:20 \(marker “Product reveal”\)\./);
  assert.ok(ctx.logs.includes('Asking test-model for a score plan…'));
  assert.ok(ctx.logs.includes('Plan received: bossa'));
  // The song is the generator's: the model's reply holds no note, and the clip has thousands.
  assert.ok(music.music.song.parts.length >= 6);
  assert.equal(music.music.song.scale, 'major');

  const request = fake.requests.at(-1).body;
  const [system, user] = request.messages.map((message) => message.content);
  assert.equal(request.format, 'json');
  for (const style of STYLES) assert.ok(system.includes(`${style.id} (`), style.id);
  assert.match(system, /Never write notes, chords, bars, times, instruments or settings\./);
  assert.match(
    user,
    /^TIMELINE\nMain Edit: 1920x1080 \(16:9, landscape\), 30 fps\.\nLength to score: 40 seconds \(the whole timeline\)\.\nPace: 6 cuts a minute\.\nTurning points:\n {2}0:16 a new shot\n {2}0:20 marker “Product reveal”\n/,
  );
  assert.match(user, /\nSpeech: 0:01–0:05, 0:07–0:09, 0:11–0:14 \(22% of the length\)\.\n/);
  assert.match(user, /\nWhat the editor asked for: calm, picks up at the product reveal\n/);
  assert.ok(!user.includes(P['interview.mp4']) && !user.includes('.mp4'), 'no files are shown');
});

test('a reply wrapped in thinking, prose and broken JSON is still the plan', async () => {
  fake.setReply(() => ({
    reasoning: 'They want something calm…',
    content:
      '<think>lofi? no — bossa.</think>Here you go:\n```json\n' +
      "{style: 'Bossa Nova', mood: 'calm, hopeful', sections: [{section: 'Intro', length: 1, " +
      "intensity: 'low'}, {name: 'chorus', share: 3, energy: 90},]}\n```",
  }));
  const { result } = await ask();
  assert.equal(result.plan.style, 'bossa');
  assert.deepEqual(
    result.plan.sections.map((s) => s.name),
    ['intro', 'lift'],
  );
  assert.equal(result.notes[1], 'The model’s JSON was malformed and was repaired.');
});

test('a style the director does not have is replaced and reported; the rest of the plan stands', async () => {
  fake.setReply(() => JSON.stringify({ ...PLAN, style: 'polka', mood: ['calm', 'crunchy'] }));
  const { result } = await ask();
  assert.equal(result.plan.style, 'lofi');
  assert.match(
    result.notes[1],
    /^Unknown style “polka” — Lo-fi is used instead: a slow timeline \(6 cuts/,
  );
  assert.match(
    result.notes.join('\n'),
    /\nMood words the director does not know were passed over: crunchy\.\n/,
  );
  assert.deepEqual(
    result.plan.sections.map((s) => s.name),
    ['intro', 'verse', 'lift'],
  );
});

test('what the form fixes wins over the plan, and the model is told so', async () => {
  fake.setReply(() => JSON.stringify({ ...PLAN, bpm: 200, key: 'B' }));
  const { result } = await ask({ params: { style: 'cinematic', key: 'E', bpm: 80 } });
  assert.deepEqual([result.plan.style, result.plan.key, result.plan.bpm], ['cinematic', 'E', 80]);
  assert.equal(result.notes[1], 'Style Cinematic, as chosen in the form.');
  const user = fake.requests.at(-1).body.messages[1].content;
  assert.match(user, /\nStyle: cinematic \(the editor chose it; use it\)\.\n/);
  assert.match(
    user,
    /\nTempo: 80 BPM \(the editor chose it\)\.\nKey: E \(the editor chose it\)\.\n/,
  );
  // Left free, the plan's own tempo and key are taken.
  const free = await ask();
  assert.deepEqual([free.result.plan.key, free.result.plan.bpm], ['B', 200]);
});

test('an invalid plan is sent back once with the errors; the corrected one is used', async () => {
  fake.setReply((req) =>
    req.body.messages.length === 2
      ? '{"mood": ["calm"], "sections": [{"name": "lift", "energy": 7}]}'
      : JSON.stringify(PLAN),
  );
  const count = fake.requests.length;
  const { result, ctx } = await ask();
  assert.equal(fake.requests.length, count + 2);
  assert.equal(result.plan.style, 'bossa');
  assert.match(
    result.notes[1],
    /^The model’s first plan was rejected \(must have required property 'style'\); it was asked/,
  );
  const retry = fake.requests.at(-1).body.messages;
  assert.equal(retry.length, 4);
  assert.match(
    retry[3].content,
    /^That reply could not be used as a score plan:\n- must have required/,
  );
  assert.ok(
    ctx.logs.some((line) => /^Plan not usable \(.*\) — asking the model to correct it$/.test(line)),
  );
  // Still wrong the second time: what is usable of it is kept.
  fake.setReply(
    () => '{"style": "house", "bpm": 900, "sections": [{"name": "lift"}, {"share": 2}]}',
  );
  const kept = await ask();
  assert.equal(kept.result.plan.style, 'house');
  assert.deepEqual(kept.result.notes.slice(2, 4), [
    'Dropped from the plan — bpm: bpm must be <= 240.',
    "Dropped from the plan — section 2: must have required property 'name'.",
  ]);
});

test('no usable plan, or no model: the timeline and the brief decide, and the first note says so', async () => {
  fake.setReply(() => 'I think something gentle would be lovely here.');
  const count = fake.requests.length;
  const useless = await ask();
  assert.equal(fake.requests.length, count + 2, 'asked, and asked again');
  assert.match(
    useless.result.notes[0],
    /^The LLM could not plan the music \(The LLM did not return a usable score plan\) — the style and the mood were chosen from the timeline and the brief instead\.$/,
  );
  assert.equal(useless.result.plan.style, 'lofi');
  assert.deepEqual(useless.result.plan.mood, ['calm']);
  // The marker begins the lift without the model, too.
  assert.match(useless.result.notes.join('\n'), /lift 0:20 \(marker “Product reveal”\)/);
  const unreachable = await ask({}, { llmUrl: 'http://127.0.0.1:9' });
  assert.match(unreachable.result.notes[0], /^The LLM could not plan the music \(/);
  const off = await ask({}, { llmUrl: undefined, provider: 'none' });
  assert.match(
    off.result.notes[0],
    /^The LLM could not plan the music \(No LLM provider is configured/,
  );
  assert.equal(off.result.plan.style, 'lofi');
  // Without the switch the model is never asked.
  const before = fake.requests.length;
  await ask({ params: { useLlm: false } });
  assert.equal(fake.requests.length, before);
});

test('cancelling while the model writes stops the job, and nothing is rendered', async () => {
  fake.setReply(() => ({ hang: true }));
  const stop = new AbortController();
  const renderer = fakeRenderer();
  const directive = { action: 'score', params: { useLlm: true } };
  const ctx = await makeContext(park, directive, {
    edl: timeline(),
    llmUrl: fake.url,
    signal: stop.signal,
  });
  const pending = score(ctx, renderer);
  setTimeout(() => stop.abort(), 60);
  await assert.rejects(pending, (err) => err.name === 'AbortError');
  assert.equal(renderer.calls.length, 0);
});
