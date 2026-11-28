import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { updateSidecar } from '../../lib/sidecar.js';
import { makeContext } from '../testing/context.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { clip, doc, pair, title, trackClips } from '../testing/timeline.js';
import { addCaptions } from './addCaptions.js';
import { segmentPhrases, timeCues } from './captions.js';

let park;
let P;
before(async () => {
  park = await createParkProject();
  P = park.paths;
});
after(() => park.cleanup());

/** Title clips of phrases: what `add_captions` made before it could switch captions on. */
async function run(edl, directive = {}, extra = {}) {
  const params = { as: 'phrases', ...directive.params };
  const asked = { action: 'add_captions', ...directive, params };
  const ctx = await makeContext(park, asked, { edl, ...extra });
  const result = await addCaptions(ctx);
  const durations = Object.fromEntries(ctx.media.map((m) => [m.filePath, m.duration]));
  assert.deepEqual(checkResult(result, { fps: 30, durations, roots: [park.dir] }), []);
  assert.equal(result.mode, 'replace');
  return result;
}
const frames = (c) => [Math.round(c.timelineStart * 30), Math.round(c.timelineEnd * 30)];
const texts = (clips) => clips.map((c) => c.text.content);

/** Two tightened interview cuts placed at 10s, so source time ≠ timeline time. */
function interviewAt10() {
  const [a, aSound] = pair(P['interview.mp4'], 0.9, 4.6, 10);
  const [b, bSound] = pair(P['interview.mp4'], 6.5, 9.4, 13.7);
  return doc({ video: [[a, b]], audio: [[aSound, bSound]] });
}

test('captions land on the words, mapped from source to timeline time', async () => {
  const result = await run(interviewAt10());
  const captions = trackClips(result, 'video', 0);
  assert.deepEqual(texts(captions), [
    'we arrived at the park early in the',
    'morning',
    'the dog ran straight to the beach',
  ]);
  // "we" is spoken at 1.0s in the file; the clip plays 0.9s at 10s → 10.1s.
  assert.deepEqual(frames(captions[0]), [303, 399]);
  // "morning" (4.2–4.5s) → 13.3s; it lingers until the next caption at 13.8s.
  assert.deepEqual(frames(captions[1]), [399, 414]);
  // "the dog…" starts 0.1s into the second clip and lingers 0.3s after "beach".
  assert.deepEqual(frames(captions[2]), [414, 504]);
  for (const caption of captions) {
    assert.equal(caption.sourceFile, '');
    assert.equal(caption.intent, 'title');
    assert.ok(caption.text.content.length <= 36);
  }
  assert.equal(result.summary, 'Added 3 captions from 2 clips on “Captions”');
});

test('a busy front track gets a new Captions track in front of it', async () => {
  const edl = interviewAt10();
  const result = await run(edl);
  assert.deepEqual(
    result.tracks.map((t) => [t.type, t.index, t.name, t.trackId]),
    [
      ['video', 0, 'Captions', undefined],
      ['video', 1, 'Video 1', 'v1'],
      ['audio', 0, 'Audio 1', 'a1'],
    ],
  );
  assert.deepEqual(trackClips(result, 'video', 1), edl.tracks[0].clips);
  assert.match(result.notes.join(' '), /new “Captions” track was added in front/);
});

test('a free front track is used as it is', async () => {
  const [a, aSound] = pair(P['interview.mp4'], 0.9, 4.6, 10);
  const edl = doc({ video: [[title('Opening', 0, 4)], [a]], audio: [[aSound]] });
  const result = await run(edl);
  assert.equal(result.tracks.length, 3);
  assert.deepEqual(texts(trackClips(result, 'video', 0)).slice(0, 2), [
    'Opening',
    'we arrived at the park early in the',
  ]);
  assert.match(result.summary, /on “Video 1”$/);
  // Run again: the captions are now in the way, so the next set goes in front.
  const again = await run({
    ...edl,
    tracks: edl.tracks.map((t, i) => ({ ...t, clips: result.tracks[i].clips })),
  });
  assert.equal(again.tracks[0].name, 'Captions');
});

test('position, size and box follow the params and the frame', async () => {
  const edl = interviewAt10();
  const [low] = trackClips(await run(edl), 'video', 0);
  assert.deepEqual([low.text.fontSize, low.transform.y, low.text.background], [49, 389, '']);
  assert.ok(low.text.outlineWidth >= 2);
  const params = { position: 'top', size: 'large', background: true, maxChars: 60 };
  const [high] = trackClips(await run(edl, { params }), 'video', 0);
  assert.deepEqual(
    [high.text.fontSize, high.transform.y, high.text.background],
    [65, -389, '#000000'],
  );
  assert.equal(high.text.content, 'we arrived at the park early in the morning');
  // A vertical frame holds fewer characters per line: long phrases wrap in two.
  const vertical = { format: { width: 1080, height: 1920, aspectRatio: '9:16' } };
  const narrow = trackClips(
    await run(edl, { params: { size: 'large', maxChars: 60 } }, vertical),
    'video',
    0,
  );
  assert.ok(narrow.every((c) => c.text.content.split('\n').every((line) => line.length <= 24)));
  assert.ok(narrow.some((c) => c.text.content.includes('\n')));
});

test('selection and range limit what is captioned', async () => {
  const edl = interviewAt10();
  const second = edl.tracks[1].clips[1];
  const selected = await run(edl, { context: { selection: [second.clipId] } });
  assert.deepEqual(texts(trackClips(selected, 'video', 0)), ['the dog ran straight to the beach']);
  const ranged = await run(edl, { mode: 'range', context: { range: { start: 9, end: 13.25 } } });
  assert.deepEqual(texts(trackClips(ranged, 'video', 0)), ['we arrived at the park early in the']);
});

test('a linked pair is captioned once; music and muted sound are skipped', async () => {
  const [a, aSound] = pair(P['interview.mp4'], 0.9, 4.6, 0);
  const voice = clip(P['voice.wav'], 0.4, 2.1, 5);
  const bed = clip(P['music/bed.wav'], 0, 8, 0, { intent: 'music' });
  const edl = doc({ video: [[], [a]], audio: [[aSound], [voice], [bed]] });
  const all = await run(edl);
  assert.deepEqual(texts(trackClips(all, 'video', 0)), [
    'we arrived at the park early in the',
    'morning',
    'the beach was empty',
  ]);
  edl.tracks[3].muted = true;
  const muted = await run(edl);
  assert.equal(trackClips(muted, 'video', 0).length, 2);
  const asked = await run(edl, { context: { selection: [voice.clipId] } });
  assert.deepEqual(texts(trackClips(asked, 'video', 0)), ['the beach was empty']);
});

test('nothing to caption is a no-op with an explanation', async () => {
  const memo = clip(P['voice-memo.wav'], 0, 8, 0);
  const edl = doc({ video: [[clip(P['broll/city.mp4'], 0, 4, 0)]], audio: [[memo]] });
  const result = await run(edl);
  assert.equal(result.summary, 'No transcript found on the timeline — no captions added');
  assert.match(result.notes.join(' '), /voice-memo\.wav has no transcript for this part/);
  assert.deepEqual(trackClips(result, 'video', 0), edl.tracks[0].clips);
});

test('segment-only transcripts are timed by share of characters', async () => {
  const media = {
    segments: [{ start: 10, end: 16, text: 'one two three four five six seven eight nine ten' }],
  };
  const cues = segmentPhrases(media, 0, 20, 24);
  assert.deepEqual(
    cues.map((c) => c.text),
    ['one two three four five', 'six seven eight nine ten'],
  );
  assert.equal(cues[0].start, 10);
  assert.ok(Math.abs(cues[0].end - cues[1].start) < 1e-9 && cues[1].end <= 16);
  assert.ok(Math.abs(cues[0].end - 13) < 0.2);
  // End to end: a sidecar with segments but no words.
  updateSidecar(P['voice-memo.wav'], {
    segments: [{ start: 0, end: 1.5, text: 'testing one two' }],
  });
  const result = await run(doc({ video: [[]], audio: [[clip(P['voice-memo.wav'], 0, 8, 3)]] }));
  const [caption] = trackClips(result, 'video', 0);
  assert.deepEqual([caption.text.content, ...frames(caption)], ['testing one two', 90, 144]);
});

test('timeCues keeps cues in order, apart and at least two frames long', () => {
  const cues = [
    { text: 'b', start: 1.0, end: 1.02 },
    { text: 'a', start: 0, end: 0.9 },
    { text: 'c', start: 1.01, end: 1.03 },
    { text: 'd', start: 5, end: 5.2 },
  ];
  const timed = timeCues(cues, 30);
  // "b" has no room before "c" starts and is dropped; "c" then takes its place.
  assert.deepEqual(
    timed.map((c) => [c.text, c.startF, c.endF]),
    [
      ['a', 0, 30],
      ['c', 30, 51],
      ['d', 150, 171],
    ],
  );
});
