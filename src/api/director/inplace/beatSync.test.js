import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeContext } from '../testing/context.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { clip, doc, pair, title, trackClips } from '../testing/timeline.js';
import { beatSync } from './beatSync.js';

let park;
let P;
before(async () => {
  park = await createParkProject();
  P = park.paths;
});
after(() => park.cleanup());

async function run(edl, directive = {}) {
  const ctx = await makeContext(park, { action: 'beat_sync', ...directive }, { edl });
  const result = beatSync(ctx);
  const durations = Object.fromEntries(ctx.media.map((m) => [m.filePath, m.duration]));
  assert.deepEqual(checkResult(result, { fps: 30, durations, roots: [park.dir] }), []);
  assert.equal(result.mode, 'replace');
  return result;
}
const round = (v) => Math.round(v * 1000) / 1000;
const times = (clips) => clips.map((c) => [round(c.timelineStart), round(c.timelineEnd)]);
const sources = (clips) => clips.map((c) => [round(c.sourceIn), round(c.sourceOut)]);

/** Four shots cut off the beat, a title above, music (120 BPM, beat every 0.5s) below. */
function montage() {
  const [beachA, beachASound] = pair(P['broll/beach.mp4'], 3, 5.7, 0);
  const city = clip(P['broll/city.mp4'], 0.2, 3.4, 2.7);
  const sign = clip(P['stills/sign.png'], 0, 2.7, 5.9);
  const [beachB, beachBSound] = pair(P['broll/beach.mp4'], 0.3, 2.6, 8.6);
  const music = clip(P['music/bed.wav'], 0, 12, 0, { intent: 'music' });
  return {
    music,
    city,
    edl: doc({
      video: [[title('Hi', 1, 3.3)], [beachA, city, sign, beachB]],
      audio: [[beachASound, beachBSound], [music]],
    }),
  };
}

test('cuts are rolled onto the nearest beat, linked sound with them', async () => {
  const { edl } = montage();
  const result = await run(edl);
  const picture = trackClips(result, 'video', 1);
  assert.deepEqual(times(picture), [
    [0, 2.5],
    [2.5, 6],
    [6, 8.5],
    [8.5, 11],
  ]);
  // Rolling changes what each clip shows at the cut, not where the rest sits.
  assert.deepEqual(sources(picture), [
    [3, 5.5],
    [0, 3.5],
    [0, 2.5],
    [0.2, 2.7],
  ]);
  const sound = trackClips(result, 'audio', 0);
  assert.deepEqual(times(sound), [
    [0, 2.5],
    [8.5, 11],
  ]);
  assert.deepEqual(sources(sound), [
    [3, 5.5],
    [0.2, 2.7],
  ]);
  assert.equal(result.summary, 'Moved 4 of 4 cuts onto the beat (120 BPM)');
  assert.match(result.notes[0], /Synced “Video 2” to bed\.wav \(120 BPM\)/);
  // Everything that is not the picture track or its linked sound is untouched.
  assert.deepEqual(trackClips(result, 'video', 0), edl.tracks[0].clips);
  assert.deepEqual(trackClips(result, 'audio', 1), edl.tracks[3].clips);
});

test('a cut already on a beat is counted, not moved', async () => {
  const { edl } = montage();
  const once = await run(edl);
  const again = await run({
    ...edl,
    tracks: edl.tracks.map((t, i) => ({ ...t, clips: once.tracks[i].clips })),
  });
  assert.equal(again.summary, 'Moved 0 of 4 cuts onto the beat (120 BPM)');
  assert.match(again.notes.join(' '), /4 cuts were already on a beat/);
});

test('a coarser grid and the largest allowed move limit what is moved', async () => {
  const { edl } = montage();
  // Bars every 2s: only the cut at 5.9s is within 0.5s of one.
  const bars = await run(edl, { params: { every: '4', maxShift: 0.5 } });
  assert.deepEqual(times(trackClips(bars, 'video', 1)), [
    [0, 2.7],
    [2.7, 6],
    [6, 8.6],
    [8.6, 10.9],
  ]);
  assert.equal(bars.summary, 'Moved 1 of 4 cuts onto the beat (120 BPM)');
  assert.match(bars.notes.join(' '), /The cut at 2\.70s was left alone: no beat within 0\.5s/);
  assert.match(bars.notes[0], /every 4th beat/);
});

test('a cut moves the other way when there is no footage on one side', async () => {
  // The incoming clip starts at the very start of its file, so the cut at
  // 2.7s cannot move earlier; it moves to 3.0s instead.
  const a = clip(P['broll/beach.mp4'], 3, 5.7, 0);
  const b = clip(P['broll/city.mp4'], 0, 3, 2.7);
  const music = clip(P['music/bed.wav'], 0, 8, 0);
  const result = await run(doc({ video: [[a, b]], audio: [[music]] }));
  assert.deepEqual(times(trackClips(result, 'video', 0)), [
    [0, 3],
    [3, 5.5],
  ]);
});

test('speech is protected: a cut is not moved into a word', async () => {
  // Tight interview cuts: "…in the morning" | "the dog ran…".
  const [a, aSound] = pair(P['interview.mp4'], 0.9, 4.6, 0);
  const [b, bSound] = pair(P['interview.mp4'], 6.5, 9.4, 3.7);
  const music = clip(P['music/bed.wav'], 0, 8, 0, { intent: 'music' });
  const edl = doc({ video: [[a, b]], audio: [[aSound, bSound], [music]] });
  const safe = await run(edl);
  assert.deepEqual(times(trackClips(safe, 'video', 0))[0], [0, 3.7]);
  assert.match(safe.notes.join(' '), /The cut at 3\.70s was left alone: it would cut into a word/);
  const forced = await run(edl, { params: { protectSpeech: false } });
  assert.deepEqual(times(trackClips(forced, 'video', 0))[0], [0, 3.5]);
  assert.deepEqual(times(trackClips(forced, 'audio', 0))[0], [0, 3.5]);
});

test('linked sound never runs into an unrelated neighbour', async () => {
  const [a, aSound] = pair(P['broll/beach.mp4'], 3, 5.3, 0);
  const b = clip(P['broll/city.mp4'], 1, 4, 2.3);
  const voice = clip(P['voice.wav'], 0, 3, 2.3);
  const music = clip(P['music/bed.wav'], 0, 8, 0);
  // Moving the cut 2.3 → 2.5 would push beach's sound into the voice clip.
  const result = await run(doc({ video: [[a, b]], audio: [[aSound, voice], [music]] }));
  // So it goes to 2.0 instead (the next nearest beat).
  assert.deepEqual(times(trackClips(result, 'video', 0)), [
    [0, 2],
    [2, 5.5],
  ]);
  assert.deepEqual(times(trackClips(result, 'audio', 0)), [
    [0, 2],
    [2.3, 5.3],
  ]);
});

test('range mode syncs only the cuts inside the range', async () => {
  const { edl } = montage();
  const result = await run(edl, { mode: 'range', context: { range: { start: 5, end: 9 } } });
  assert.deepEqual(times(trackClips(result, 'video', 1)), [
    [0, 2.7],
    [2.7, 6],
    [6, 8.5],
    [8.5, 10.9],
  ]);
});

test('the music clip can be selected; missing beats or music are 422s', async () => {
  const { edl, music } = montage();
  const picked = await run(edl, { context: { selection: [music.clipId] } });
  assert.match(picked.summary, /Moved 4 of 4/);
  const voice = clip(P['voice.wav'], 0, 6, 0);
  const noBeats = doc({ video: [[clip(P['broll/city.mp4'], 0, 3, 0)]], audio: [[voice]] });
  const ctx = (edlDoc, selection = []) =>
    makeContext(park, { action: 'beat_sync', context: { selection } }, { edl: edlDoc });
  await assert.rejects(async () => beatSync(await ctx(noBeats)), {
    status: 422,
    message: /no music clip with beat analysis/,
  });
  await assert.rejects(async () => beatSync(await ctx(noBeats, [voice.clipId])), {
    status: 422,
    message: /voice\.wav has no beat analysis/,
  });
  const noPicture = doc({
    video: [[title('x', 0, 2)]],
    audio: [[clip(P['music/bed.wav'], 0, 8, 0)]],
  });
  await assert.rejects(async () => beatSync(await ctx(noPicture)), {
    status: 422,
    message: /no picture clips/,
  });
});
