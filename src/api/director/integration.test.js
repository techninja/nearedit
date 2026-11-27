/**
 * Contract check between the director and the EDL core: every fragment the
 * director produces must merge through `applyDirectorResult` into a
 * document that passes `validateEdl`. Those two modules belong to the EDL
 * core; when they are absent these tests skip rather than fail.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createEdl } from '#utils/edl/factory.js';
import { timelineDuration } from '#utils/edl/query.js';
import { baseEdit } from './actions/baseEdit.js';
import { insertBroll } from './actions/insertBroll.js';
import { addCaptions } from './inplace/addCaptions.js';
import { beatSync } from './inplace/beatSync.js';
import { removeSilence } from './inplace/removeSilence.js';
import { makeContext } from './testing/context.js';
import { createParkProject } from './testing/park.js';
import { clip, doc, pair, title } from './testing/timeline.js';

let park;
let P;
let core = null;
before(async () => {
  park = await createParkProject();
  P = park.paths;
  try {
    const [apply, validate] = await Promise.all([
      import('#utils/edl/apply.js'),
      import('#utils/edl/validate.js'),
    ]);
    core = { apply: apply.applyDirectorResult, validate: validate.validateEdl };
  } catch (err) {
    console.warn(`[director] EDL core not available, integration tests skipped: ${err.message}`);
  }
});
after(() => park.cleanup());

/** Interview pair, a title in front, city after it and a music bed, with one marker. */
function timeline() {
  const [video, audio] = pair(P['interview.mp4'], 0, 16, 0);
  return doc(
    {
      video: [[title('Hi', 10, 12)], [video, clip(P['broll/city.mp4'], 1, 5, 16)]],
      audio: [[audio], [clip(P['music/bed.wav'], 0, 20, 0, { intent: 'music' })]],
    },
    { markers: [{ markerId: 'm_1', time: 18, label: 'city', color: '' }] },
  );
}

/** Run an action, merge its result and validate the merged document. */
async function merged(t, fn, directive, edl) {
  if (!core) return t.skip('EDL core not available');
  const ctx = await makeContext(park, directive, { edl });
  const result = await fn(ctx);
  const out = core.apply(edl || createEdl(), result);
  const sourceDurations = Object.fromEntries(ctx.media.map((m) => [m.filePath, m.duration]));
  const report = core.validate(out, { sourceDurations });
  assert.deepEqual(report.problems, [], `${directive.action} (${result.mode})`);
  return { out, result };
}
const names = (track) => track.clips.map((c) => c.sourceFile.split('/').pop() || c.text.content);
const lane = (out, type) => out.tracks.filter((t) => t.type === type);

test('a generated fragment merges validly in every mode', async (t) => {
  const context = { playheadPosition: 4, range: { start: 2, end: 6 } };
  for (const style of ['talking_head', 'montage']) {
    for (const mode of ['replace', 'append', 'prepend', 'insert', 'range']) {
      const directive = { action: 'base_edit', mode, context, params: { style, duration: 12 } };
      const done = await merged(t, baseEdit, directive, timeline());
      if (!done) return;
      const length = timelineDuration(done.out);
      if (mode === 'replace') assert.equal(length, done.result.duration);
      else if (mode === 'range') assert.equal(length, 20 - 4 + done.result.duration);
      else assert.equal(length, 20 + done.result.duration);
    }
  }
});

test('base edit on an empty default timeline builds the layout', async (t) => {
  const done = await merged(t, baseEdit, { action: 'base_edit', params: { title: 'Park' } }, null);
  if (!done) return;
  const video = lane(done.out, 'video');
  const audio = lane(done.out, 'audio');
  // A replace adopts the result's layout: every row carries the layout's name.
  assert.deepEqual(
    video.map((v) => v.name),
    ['Titles', 'B-roll', 'Main'],
  );
  assert.deepEqual(
    audio.map((a) => a.name),
    ['Dialogue', 'Ambience', 'Music'],
  );
  assert.deepEqual(names(video[0]), ['Park']);
  assert.ok(names(video[2]).every((n) => n === 'interview.mp4'));
  assert.deepEqual(names(audio[2]), ['bed.wav']);
});

test('in-place results merge back into the same timeline', async (t) => {
  const silence = await merged(t, removeSilence, { action: 'remove_silence' }, timeline());
  if (!silence) return;
  assert.equal(timelineDuration(silence.out), 13.5);
  assert.deepEqual(lane(silence.out, 'video')[1].clips.length, 4);
  assert.deepEqual(
    silence.out.markers.map((m) => [m.time, m.label]),
    [[11.5, 'city']],
  );

  const captions = await merged(t, addCaptions, { action: 'add_captions' }, timeline());
  const front = lane(captions.out, 'video')[0];
  assert.equal(front.clips.length, 4);
  assert.ok(front.clips.every((c) => !c.sourceFile && c.text.content));
  assert.deepEqual(names(lane(captions.out, 'video')[2]), ['interview.mp4', 'city.mp4']);
  assert.equal(captions.out.markers.length, 1);

  const synced = await merged(t, beatSync, { action: 'beat_sync' }, timeline());
  assert.equal(timelineDuration(synced.out), 20);
});

test('insert_broll: ripple insert and cutaway both merge validly', async (t) => {
  const directive = {
    action: 'insert_broll',
    prompt: 'dog beach',
    context: { playheadPosition: 3 },
  };
  const insert = await merged(t, insertBroll, directive, timeline());
  if (!insert) return;
  assert.equal(timelineDuration(insert.out), 24);
  assert.deepEqual(names(lane(insert.out, 'video')[1]), [
    'interview.mp4',
    'beach.mp4',
    'interview.mp4',
    'city.mp4',
  ]);
  const overlay = { ...directive, params: { placement: 'overlay' } };
  const cutaway = await merged(t, insertBroll, overlay, timeline());
  assert.equal(timelineDuration(cutaway.out), 20);
  const video = lane(cutaway.out, 'video');
  // In front of the interview, behind the title track.
  assert.deepEqual(video.map(names), [['Hi'], ['beach.mp4'], ['interview.mp4', 'city.mp4']]);
});

test('a locked track survives an in-place action untouched and unduplicated', async (t) => {
  const edl = timeline();
  edl.tracks[3].locked = true;
  const done = await merged(t, addCaptions, { action: 'add_captions' }, edl);
  if (!done) return;
  const audio = lane(done.out, 'audio');
  assert.equal(audio.length, 2);
  assert.deepEqual(audio[1].clips, edl.tracks[3].clips);
});
