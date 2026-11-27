import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../testing/fixtures.js';
import { makeContext } from '../testing/context.js';
import { startFakeLlm } from '../testing/fakeLlm.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { doc, pair, title, trackClips } from '../testing/timeline.js';
import { searchBroll } from '../search.js';
import { insertBroll } from './insertBroll.js';

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

async function run(edl, directive = {}, extra = {}) {
  const ctx = await makeContext(park, { action: 'insert_broll', ...directive }, { edl, ...extra });
  const result = await insertBroll(ctx);
  const durations = Object.fromEntries(ctx.media.map((m) => [m.filePath, m.duration]));
  assert.deepEqual(checkResult(result, { fps: 30, durations, roots: [park.dir] }), []);
  return result;
}
const file = (clip) => clip.sourceFile.split('/').pop();
/** A talking head on Video 1 / Audio 1, 0–9.5s. */
function talkingHead() {
  const [video, audio] = pair(P['interview.mp4'], 0.9, 10.4, 0);
  return doc({ video: [[video]], audio: [[audio]] });
}

test('search ranks by tags, description, keyframes and transcript', async () => {
  const { media } = await makeContext(park, { action: 'insert_broll' });
  const rank = (prompt, used) =>
    searchBroll(media, prompt, { used }).hits.map((h) => h.media.filename);
  // beach.mp4: tags + description + a "dog running" keyframe; the interview only says it.
  const dog = searchBroll(media, 'the dog running on the beach');
  assert.deepEqual(
    dog.hits.map((h) => h.media.filename),
    ['beach.mp4', 'interview.mp4'],
  );
  assert.deepEqual([dog.matched, dog.hits[0].at, dog.hits[1].at], [true, 5, 6.6]);
  assert.deepEqual(dog.hits[0].matched, ['dog', 'beach', 'running']);
  assert.ok(dog.hits[0].score > dog.hits[1].score * 3);
  assert.deepEqual(rank('city traffic')[0], 'city.mp4');
  assert.deepEqual(rank('a clip of the park sign')[0], 'sign.png');
  // Material already on the timeline is handicapped, not excluded.
  assert.deepEqual(rank('beach or city streets'), ['beach.mp4', 'city.mp4', 'interview.mp4']);
  assert.deepEqual(rank('beach or city streets', new Set([P['broll/beach.mp4']])).slice(0, 2), [
    'city.mp4',
    'beach.mp4',
  ]);
});

test('search offers unused picture files when nothing matches', async () => {
  const { media } = await makeContext(park, { action: 'insert_broll' });
  const none = searchBroll(media, 'helicopter', { used: new Set([P['broll/beach.mp4']]) });
  assert.equal(none.matched, false);
  assert.deepEqual(
    none.hits.map((h) => h.media.filename),
    ['city.mp4', 'sign.png', 'tall.png', 'beach.mp4'],
  );
  assert.equal(searchBroll(media, '').matched, false);
});

test('default: a ripple insert at the playhead on the track it interrupts', async () => {
  const directive = { prompt: 'the dog on the beach', context: { playheadPosition: 4.21 } };
  const result = await run(talkingHead(), directive);
  assert.deepEqual([result.mode, result.at, result.range], ['insert', 4.2, null]);
  assert.deepEqual(
    result.tracks.map((t) => [t.type, t.index, t.name]),
    [
      ['video', 0, 'Video 1'],
      ['audio', 1, 'Ambience'],
    ],
  );
  const [picture] = trackClips(result, 'video', 0);
  const [sound] = trackClips(result, 'audio', 1);
  assert.equal(file(picture), 'beach.mp4');
  // Fragment times are relative to 0; 4s around the "dog running" keyframe at 5s.
  assert.deepEqual([picture.timelineStart, picture.timelineEnd], [0, 4]);
  assert.ok(picture.sourceIn <= 5 && picture.sourceOut >= 5 && picture.sourceIn >= 3);
  assert.deepEqual([sound.linkedClipId, sound.volume], [picture.clipId, 0.25]);
  assert.equal(result.summary, '1 b-roll clip (4s): beach.mp4 inserted at 4.2s');
  assert.match(result.notes.join(' '), /beach\.mp4 matched “dog, beach”/);
});

test('count, length and sound follow the params', async () => {
  const params = { count: 2, duration: 2, naturalSound: 'off' };
  const result = await run(talkingHead(), {
    prompt: 'beach or city streets',
    params,
    mode: 'append',
  });
  assert.deepEqual([result.mode, result.at], ['append', 9.5]);
  assert.equal(result.tracks.length, 1, 'no sound track when natural sound is off');
  const clips = trackClips(result, 'video', 0);
  assert.deepEqual(clips.map(file), ['beach.mp4', 'city.mp4']);
  assert.deepEqual(
    clips.map((c) => [c.timelineStart, c.timelineEnd]),
    [
      [0, 2],
      [2, 4],
    ],
  );
  assert.match(result.summary, /^2 b-roll clips \(4s\): beach\.mp4, city\.mp4 appended$/);
});

test('range mode fills the range unless a length is given', async () => {
  const context = { range: { start: 2, end: 5 } };
  const filled = await run(talkingHead(), { prompt: 'sign', mode: 'range', context });
  assert.deepEqual(
    [filled.mode, filled.at, filled.range, filled.duration],
    ['range', 2, { start: 2, end: 5 }, 3],
  );
  assert.equal(trackClips(filled, 'video', 0)[0].transform.kenBurns.enabled, true);
  const fixed = await run(talkingHead(), {
    prompt: 'sign',
    mode: 'range',
    context,
    params: { duration: 1.5 },
  });
  assert.equal(fixed.duration, 1.5);
});

test('overlay: a cutaway goes in front of the picture and nothing moves', async () => {
  const edl = talkingHead();
  const directive = {
    prompt: 'city traffic',
    params: { placement: 'overlay' },
    context: { playheadPosition: 3 },
  };
  const result = await run(edl, directive);
  assert.equal(result.mode, 'replace');
  assert.deepEqual(
    result.tracks.map((t) => [t.type, t.index, t.name]),
    [
      ['video', 0, 'B-roll'],
      ['video', 1, 'Video 1'],
      ['audio', 0, 'Audio 1'],
    ],
  );
  const [cutaway] = trackClips(result, 'video', 0);
  assert.deepEqual([file(cutaway), cutaway.timelineStart, cutaway.timelineEnd], ['city.mp4', 3, 7]);
  assert.deepEqual(trackClips(result, 'video', 1), edl.tracks[0].clips);
  assert.deepEqual(trackClips(result, 'audio', 0), edl.tracks[1].clips);
  assert.match(
    result.summary,
    /^Laid 1 b-roll clip \(4s\): city\.mp4 over the picture at 3s on “B-roll”$/,
  );
});

test('overlay reuses a free track in front, and gives sound its own track', async () => {
  const [video, audio] = pair(P['interview.mp4'], 0.9, 10.4, 0);
  const edl = doc({ video: [[title('Hi', 0, 2)], [], [video]], audio: [[audio]] });
  const directive = {
    prompt: 'dog beach',
    params: { placement: 'overlay' },
    context: { playheadPosition: 1 },
  };
  const result = await run(edl, directive);
  // Video 1 holds titles and is left alone; the empty Video 2 takes the cutaway.
  assert.deepEqual(
    result.tracks.map((t) => t.name),
    ['Video 1', 'Video 2', 'Video 3', 'Audio 1', 'Ambience'],
  );
  assert.equal(file(trackClips(result, 'video', 1)[0]), 'beach.mp4');
  const [sound] = trackClips(result, 'audio', 1);
  assert.deepEqual([sound.timelineStart, sound.volume], [1, 0.25]);
  assert.equal(sound.linkedClipId, trackClips(result, 'video', 1)[0].clipId);
});

test('the LLM can choose instead; any failure falls back to keywords', async () => {
  const directive = { prompt: 'the dog on the beach', params: { useLlm: true } };
  fake.setReply(() => '{"picks":[{"file":"m2","role":"broll","start":1}]}');
  const chosen = await run(talkingHead(), directive, { llmUrl: fake.url });
  assert.equal(file(trackClips(chosen, 'video', 0)[0]), 'city.mp4');
  assert.match(chosen.notes[0], /Chosen by the LLM/);
  const user = fake.requests.at(-1).body.messages[1].content;
  assert.match(
    user,
    /Choose 1 piece of b-roll, each about 4 seconds, best matching: the dog on the beach/,
  );
  assert.doesNotMatch(user, /voice\.wav|bed\.wav/, 'only picture files are offered');

  const dead = await run(talkingHead(), directive, { llmUrl: 'http://127.0.0.1:9' });
  assert.equal(file(trackClips(dead, 'video', 0)[0]), 'beach.mp4');
  assert.match(
    dead.notes[0],
    /The LLM could not choose \(Cannot reach.*keyword matching was used instead/,
  );
  const off = await run(talkingHead(), directive);
  assert.match(off.notes[0], /LLM_PROVIDER=none/);

  fake.setReply(() => ({ content: 'x', stall: true }));
  const controller = new AbortController();
  const ctx = await makeContext(
    park,
    { action: 'insert_broll', ...directive },
    { llmUrl: fake.url, signal: controller.signal },
  );
  setTimeout(() => controller.abort(), 40);
  await assert.rejects(insertBroll(ctx), { name: 'AbortError' });
});

test('a prompt that matches nothing says so and still inserts something', async () => {
  const result = await run(talkingHead(), { prompt: 'a helicopter' });
  assert.match(
    result.notes[0],
    /Nothing matched “a helicopter” — unused footage was offered instead/,
  );
  assert.equal(file(trackClips(result, 'video', 0)[0]), 'beach.mp4');
});

test('a project without picture material is a 422', async () => {
  const sound = await createProject({ 'tune.wav': { duration: 3 } });
  try {
    const ctx = await makeContext(sound, { action: 'insert_broll', prompt: 'anything' });
    await assert.rejects(insertBroll(ctx), { status: 422, message: /no footage or stills/ });
  } finally {
    sound.cleanup();
  }
});
