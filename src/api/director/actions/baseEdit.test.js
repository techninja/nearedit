import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createEdl, createClip } from '#utils/edl/factory.js';
import { PLAN_SCHEMA } from '#utils/director/planSchema.js';
import Ajv from 'ajv';
import { makeContext } from '../testing/context.js';
import { beatGrid, createProject, say } from '../testing/fixtures.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { baseEdit, planBaseEdit } from './baseEdit.js';

const projects = [];
after(() => projects.forEach((p) => p.cleanup()));
const use = async (promise) => {
  const project = await promise;
  projects.push(project);
  return project;
};

/** Run a base edit and check every invariant of the result. */
async function run(project, params = {}, directive = {}, extra = {}) {
  const ctx = await makeContext(project, { action: 'base_edit', params, ...directive }, extra);
  const result = baseEdit(ctx);
  const durations = Object.fromEntries(ctx.media.map((m) => [m.filePath, m.duration]));
  assert.deepEqual(checkResult(result, { fps: 30, durations, roots: [project.dir] }), []);
  const slot = (type, index) =>
    result.tracks.find((t) => t.type === type && t.index === index).clips;
  const tracks = {
    titles: slot('video', 0),
    broll: slot('video', 1),
    main: slot('video', 2),
    dialogue: slot('audio', 0),
    ambience: slot('audio', 1),
    music: slot('audio', 2),
  };
  return { result, ctx, ...tracks, notes: result.notes.join('\n') };
}
const names = (clips) => clips.map((c) => c.sourceFile.split('/').pop());

test('auto style picks a talking-head cut when the project has speech', async () => {
  const park = await use(createParkProject());
  const out = await run(park, { duration: 60, title: 'Park day' });
  assert.match(out.result.summary, /^Base edit \(talking head\): \d+ clips, \d+(\.\d)?s/);
  assert.match(
    out.notes,
    /Media read as — speech: interview\.mp4, voice-memo\.wav, voice\.wav; picture: beach\.mp4, city\.mp4; stills: sign\.png, tall\.png; music: bed\.wav\./,
  );
  assert.match(out.notes, /Style auto → talking head \(17\.\ds of speech found\)/);
  // Interview: three sentences with the two pauses cut out, picture and sound linked.
  assert.deepEqual(names(out.main), ['interview.mp4', 'interview.mp4', 'interview.mp4']);
  assert.ok(out.main.every((c, i) => c.linkedClipId === out.dialogue[i].clipId));
  // The memo has no transcript (cut on its detected silences); the voice-over has words.
  const voices = out.dialogue.slice(3);
  assert.deepEqual(names(voices), [
    'voice-memo.wav',
    'voice-memo.wav',
    'voice-memo.wav',
    'voice.wav',
    'voice.wav',
  ]);
  assert.match(out.notes, /Removed 5 pauses/);
  assert.match(out.notes, /1 pick had no word timestamps/);
  // Neither has a picture of its own: b-roll covers all of it.
  const cover = out.broll.filter((c) => c.timelineStart >= voices[0].timelineStart);
  const covered = cover.reduce((sum, c) => sum + c.timelineEnd - c.timelineStart, 0);
  assert.ok(Math.abs(covered - (voices.at(-1).timelineEnd - voices[0].timelineStart)) < 1e-6);
  // Music under speech, opening title in front.
  assert.equal(out.music[0].volume, 0.25);
  assert.equal(out.titles[0].text.content, 'Park day');
  assert.equal(out.result.mode, 'replace');
  assert.ok(Math.abs(out.result.duration - 18.7) < 0.2, String(out.result.duration));
});

test('the heuristic plan is a valid edit plan', async () => {
  const park = await use(createParkProject());
  const ctx = await makeContext(park, { action: 'base_edit' });
  const validate = new Ajv().compile(PLAN_SCHEMA);
  for (const style of ['talking_head', 'montage']) {
    const { plan } = planBaseEdit(ctx.media, { ...ctx.directive.params, style });
    assert.equal(validate(plan), true, JSON.stringify(validate.errors));
    assert.ok(plan.picks.every((p) => /^m\d+$/.test(p.file)));
  }
});

test('too much speech is cut down to the target on sentence boundaries', async () => {
  const sentence = 'this is one complete sentence of the talk';
  const words = Array.from({ length: 30 }, (_, i) => say(sentence, { start: 1 + i * 4.2 })).flat();
  const long = await use(
    createProject({
      'talk.mp4': { duration: 128, size: '160x90', sidecar: { transcript: words } },
    }),
  );
  for (const duration of [20, 45]) {
    const out = await run(long, { duration, music: false });
    assert.ok(
      Math.abs(out.result.duration - duration) <= duration * 0.25,
      `${out.result.duration} vs ${duration}`,
    );
    // Whole sentences: every cut starts just before a sentence start (1 + n × 4.2s).
    for (const clip of out.main) {
      const offset = (clip.sourceIn + 0.1 - 1) / 4.2;
      assert.ok(Math.abs(offset - Math.round(offset)) < 0.02, `cut at ${clip.sourceIn}`);
    }
  }
});

test('a montage hits the target, cut on the beat, with stills moving', async () => {
  const media = {
    'music.wav': { duration: 40, sidecar: { beats: beatGrid(100, 40, 0.2), bpm: 100 } },
  };
  for (let i = 1; i <= 5; i++)
    media[`clip${i}.mp4`] = {
      duration: 9,
      size: '160x90',
      sidecar: {
        scenes: [
          { start: 0, end: 4 },
          { start: 4, end: 9 },
        ],
      },
    };
  media['photo.png'] = { size: '400x300' };
  const reel = await use(createProject(media));
  const out = await run(reel, { duration: 24, pacing: 'medium' });
  assert.match(out.result.summary, /^Base edit \(montage\): .*cut on the beat at 100 BPM/);
  assert.ok(Math.abs(out.result.duration - 24) <= 3, String(out.result.duration));
  assert.equal(new Set(names(out.main)).size, 6, 'every file gets a turn');
  // The bed starts on its first beat (0.2s), so beats fall every 0.6s from 0.
  assert.equal(out.music[0].sourceIn, 0.2);
  for (const clip of out.main) {
    const beats = clip.timelineEnd / 0.6;
    assert.ok(Math.abs(beats - Math.round(beats)) < 0.06, `cut at ${clip.timelineEnd}`);
  }
  assert.equal(
    out.main.find((c) => c.sourceFile.endsWith('.png')).transform.kenBurns.enabled,
    true,
  );
  // Natural sound stays, low and linked; the music carries the piece.
  assert.ok(
    out.ambience.length >= 5 && out.ambience.every((c) => c.volume === 0.25 && c.linkedClipId),
  );
  assert.equal(out.music[0].volume, 0.7);
  assert.equal(out.dialogue.length, 0);
});

test('probe data alone still gives a reasonable cut', async () => {
  const bare = await use(
    createProject({
      'a.mp4': { duration: 12, size: '160x90', sidecar: false },
      'b.mp4': { duration: 5, size: '160x90', audio: false, sidecar: false },
      'c.png': { size: '300x300', sidecar: false },
      'tune.wav': { duration: 30, sidecar: false },
    }),
  );
  const out = await run(bare, { duration: 15 });
  assert.match(out.notes, /4 files have not been analysed/);
  assert.match(out.notes, /Style auto → montage \(no speech found\)/);
  assert.match(out.notes, /tune\.wav has no beat analysis/);
  assert.ok(out.main.length >= 4, String(out.main.length));
  assert.ok(Math.abs(out.result.duration - 15) <= 3, String(out.result.duration));
  assert.equal(names(out.music)[0], 'tune.wav');
  // The long take is sampled in more than one place.
  const fromA = out.main.filter((c) => c.sourceFile.endsWith('a.mp4'));
  assert.ok(fromA.length >= 2 && fromA[1].sourceIn > fromA[0].sourceOut);
});

test('without music a montage keeps natural sound at full level', async () => {
  const park = await use(createParkProject());
  const out = await run(park, { style: 'montage', music: false, duration: 12, pacing: 'fast' });
  assert.equal(out.music.length, 0);
  assert.ok(out.dialogue.some((c) => c.sourceFile.endsWith('beach.mp4') && c.volume === 1));
  assert.ok(!names(out.main).includes('interview.mp4'), 'speech is not montage material');
});

test('asking for a talking head without speech falls back to a montage', async () => {
  const silent = await use(createProject({ 'x.mp4': { duration: 6, size: '160x90' } }));
  const out = await run(silent, { style: 'talking_head', duration: 5 });
  assert.match(out.notes, /No speech-led media was found, so a montage was built instead/);
  assert.deepEqual([out.main.length, out.result.duration], [1, 5]);
});

test('the fragment is placed by mode: append, insert and range', async () => {
  const park = await use(createParkProject());
  const edl = createEdl();
  edl.tracks[0].clips.push(
    createClip({ timelineStart: 0, timelineEnd: 42.5, text: { content: 'x' } }),
  );
  const append = await run(park, {}, { mode: 'append' }, { edl });
  assert.deepEqual(
    [append.result.mode, append.result.at, append.result.range],
    ['append', 42.5, null],
  );
  const insert = await run(
    park,
    {},
    { mode: 'insert', context: { playheadPosition: 7.01 } },
    { edl },
  );
  assert.deepEqual([insert.result.mode, insert.result.at], ['insert', 7]);
  const range = { start: 10, end: 20 };
  const ranged = await run(park, {}, { mode: 'range', context: { range } }, { edl });
  assert.deepEqual(
    [ranged.result.mode, ranged.result.at, ranged.result.range],
    ['range', 10, range],
  );
  // A replace names every track of the old document so nothing stale survives.
  const extra = createEdl();
  for (let i = 0; i < 4; i++)
    extra.tracks.push({ ...extra.tracks[0], trackId: `v${i + 2}`, name: `Video ${i + 2}` });
  const replaced = await run(park, {}, {}, { edl: extra });
  assert.deepEqual(
    replaced.result.tracks.map((t) => `${t.type}${t.index}`),
    ['video0', 'video1', 'video2', 'video3', 'video4', 'audio0', 'audio1', 'audio2'],
  );
});

test('an empty project is a 422', async () => {
  const empty = await use(createProject({}));
  const ctx = await makeContext(empty, { action: 'base_edit' });
  assert.throws(() => baseEdit(ctx), { status: 422, message: /nothing to build/ });
});
