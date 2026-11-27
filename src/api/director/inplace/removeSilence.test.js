import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeContext } from '../testing/context.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { clip, doc, pair, title, trackClips } from '../testing/timeline.js';
import { mergeSpans, timeMap } from './collapse.js';
import { removeSilence } from './removeSilence.js';

let park;
let P;
before(async () => {
  park = await createParkProject();
  P = park.paths;
});
after(() => park.cleanup());

async function run(edl, directive = {}) {
  const ctx = await makeContext(park, { action: 'remove_silence', ...directive }, { edl });
  const result = removeSilence(ctx);
  const durations = Object.fromEntries(ctx.media.map((m) => [m.filePath, m.duration]));
  assert.deepEqual(checkResult(result, { fps: 30, durations, roots: [park.dir] }), []);
  assert.equal(result.mode, 'replace');
  return result;
}
const spans = (clips) =>
  clips.map((c) => [c.timelineStart, c.timelineEnd].map((t) => Math.round(t * 30)));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≉ ${b}`);

/** Interview (linked pair) 0–16s, city after it, a title, and music under everything. */
function interviewDoc() {
  const [video, audio] = pair(P['interview.mp4'], 0, 16, 0);
  return doc({
    video: [[title('Hello', 10, 12)], [video, clip(P['broll/city.mp4'], 1, 5, 16)]],
    audio: [[audio], [clip(P['music/bed.wav'], 0, 20, 0, { intent: 'music', fadeOut: 2 })]],
  });
}

test('timeMap closes removed spans; frames inside one land on its start', () => {
  const map = timeMap(
    mergeSpans([
      [50, 60],
      [10, 20],
      [18, 25],
    ]),
  );
  assert.deepEqual([0, 10, 12, 25, 30, 55, 100].map(map), [0, 10, 10, 10, 15, 35, 75]);
});

test('linked picture and sound are split together and stay in sync', async () => {
  const edl = interviewDoc();
  const [video, audio] = [edl.tracks[1].clips[0], edl.tracks[2].clips[0]];
  const result = await run(edl, { params: { threshold: 0.8, padding: 0.1 } });
  const pictures = trackClips(result, 'video', 1).filter(
    (c) => c.sourceFile === P['interview.mp4'],
  );
  const sounds = trackClips(result, 'audio', 0);
  // Words run 1.0–4.5, 6.6–9.3 and 10.9–13.6: three runs padded by 0.1s.
  assert.deepEqual(spans(pictures), [
    [0, 111],
    [111, 198],
    [198, 285],
  ]);
  assert.deepEqual(spans(sounds), spans(pictures));
  pictures.forEach((picture, i) => {
    assert.equal(picture.linkedClipId, sounds[i].clipId);
    assert.equal(sounds[i].linkedClipId, picture.clipId);
    assert.deepEqual(
      [sounds[i].sourceIn, sounds[i].sourceOut],
      [picture.sourceIn, picture.sourceOut],
    );
  });
  near(pictures[0].sourceIn, 0.9);
  near(pictures[1].sourceIn, 6.5);
  near(pictures[2].sourceOut, 13.7);
  // The first piece keeps the original ids so the selection survives.
  assert.deepEqual([pictures[0].clipId, sounds[0].clipId], [video.clipId, audio.clipId]);
  assert.equal(new Set([...pictures, ...sounds].map((c) => c.clipId)).size, 6);
  assert.match(
    result.summary,
    /^Removed 4 pauses \(6\.5s\) from 1 clip — the timeline is now 13\.5s$/,
  );
  assert.match(result.notes[0], /Pauses found from word timestamps; 0\.1s kept either side/);
});

test('later clips close up; a bed is trimmed at its tail, not chopped', async () => {
  const result = await run(interviewDoc());
  const city = trackClips(result, 'video', 1).at(-1);
  assert.deepEqual([city.timelineStart, city.timelineEnd, city.sourceIn], [9.5, 13.5, 1]);
  const [bed] = trackClips(result, 'audio', 1);
  assert.equal(trackClips(result, 'audio', 1).length, 1);
  assert.deepEqual(
    [bed.timelineStart, bed.timelineEnd, bed.sourceIn, bed.sourceOut],
    [0, 13.5, 0, 13.5],
  );
  assert.equal(bed.fadeOut, 2);
  // The title started at 10s, inside the stretch that followed 3.4s of cuts.
  const [caption] = trackClips(result, 'video', 0);
  assert.deepEqual(spans([caption]), [[198, 234]]);
  // Track identity and settings ride along.
  assert.deepEqual(
    result.tracks.map((t) => [t.type, t.index, t.name, t.trackId]),
    [
      ['video', 0, 'Video 1', 'v1'],
      ['video', 1, 'Video 2', 'v2'],
      ['audio', 0, 'Audio 1', 'a1'],
      ['audio', 1, 'Audio 2', 'a2'],
    ],
  );
});

test('only the selected clip is tightened; unselected speech just moves', async () => {
  const [video, audio] = pair(P['interview.mp4'], 0, 10, 0);
  const voice = clip(P['voice.wav'], 0, 8, 10);
  const edl = doc({ video: [[video]], audio: [[audio, voice]] });
  const result = await run(edl, { context: { selection: [video.clipId] } });
  const sounds = trackClips(result, 'audio', 0);
  assert.deepEqual(
    sounds.map((c) => c.sourceFile.split('/').pop()),
    ['interview.mp4', 'interview.mp4', 'voice.wav'],
  );
  const moved = sounds.at(-1);
  near(moved.timelineEnd - moved.timelineStart, 8);
  near(moved.timelineStart, 3.7 + 2.9);
  // Selecting everything tightens the voice-over too.
  const all = await run(edl);
  assert.equal(trackClips(all, 'audio', 0).length, 4);
});

test('range mode only removes the pauses inside the range', async () => {
  const [video, audio] = pair(P['interview.mp4'], 0, 16, 0);
  const edl = doc({ video: [[video]], audio: [[audio]] });
  const result = await run(edl, { mode: 'range', context: { range: { start: 4, end: 7 } } });
  // Only the 4.6–6.5s pause falls inside 4–7s.
  assert.deepEqual(spans(trackClips(result, 'video', 0)), [
    [0, 138],
    [138, 423],
  ]);
  assert.match(result.summary, /^Removed 1 pause \(1\.9s\)/);
});

test('files without a transcript are tightened from detected silences', async () => {
  const memo = clip(P['voice-memo.wav'], 0, 8, 0);
  const result = await run(doc({ audio: [[memo]] }), { params: { threshold: 0.8, padding: 0.1 } });
  const pieces = trackClips(result, 'audio', 0);
  // Silences 1.5–3.5 and 5–6 lose all but 0.1s at each side.
  assert.deepEqual(
    pieces.map((c) => [c.sourceIn, c.sourceOut].map((t) => Math.round(t * 10) / 10)),
    [
      [0, 1.6],
      [3.4, 5.1],
      [5.9, 8],
    ],
  );
  assert.match(result.notes[0], /detected silences/);
});

test('music and unanalysed clips are left alone, with a note when asked for', async () => {
  const bed = clip(P['music/bed.wav'], 0, 10, 0);
  const still = clip(P['stills/tall.png'], 0, 4, 0);
  const edl = doc({ video: [[still]], audio: [[bed]] });
  const untouched = await run(edl);
  assert.match(untouched.summary, /No pauses longer than 0\.8s found — nothing changed/);
  assert.deepEqual(spans(trackClips(untouched, 'audio', 0)), [[0, 300]]);
  const asked = await run(edl, { context: { selection: [bed.clipId] } });
  assert.match(asked.notes.join(' '), /bed\.wav has no word timestamps or silence analysis/);
});

test('fades are protected and a locked track is reported, not rippled', async () => {
  const [video, audio] = pair(P['interview.mp4'], 0, 16, 0);
  video.fadeIn = 1.5;
  audio.fadeIn = 1.5;
  const edl = doc({ video: [[video], [clip(P['broll/city.mp4'], 0, 6, 14)]], audio: [[audio]] });
  edl.tracks[1].locked = true;
  const result = await run(edl);
  const [first] = trackClips(result, 'video', 0);
  // The lead-in silence (0–0.9s) lies under the fade-in and stays.
  assert.deepEqual([first.sourceIn, first.fadeIn], [0, 1.5]);
  assert.deepEqual(spans(trackClips(result, 'video', 1)), [[420, 600]]);
  assert.match(result.notes.join(' '), /Track “Video 2” is locked/);
});
