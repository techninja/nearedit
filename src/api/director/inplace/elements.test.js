import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { builtinKit, resolveKit } from '#utils/brand/index.js';
import { elementClip } from '#utils/director/brand/elementClip.js';
import { applyDirectorResult, validateEdl } from '#utils/edl/index.js';
import { turningPoints, cutsPerMinute } from '../score/timeline.js';
import { makeContext } from '../testing/context.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { clip, doc, pair, title, trackClips } from '../testing/timeline.js';
import { insertBroll } from '../actions/insertBroll.js';
import { beatSync } from './beatSync.js';
import { isOverlay, isShot, isStinger } from './kinds.js';
import { cutawayTrack } from './placement.js';
import { docTracks } from './doc.js';
import { removeSilence } from './removeSilence.js';

const kit = resolveKit(builtinKit('clean'));
const FRAME = { fps: 30, width: 1920, height: 1080 };
/** An element clip over a span of seconds. */
const el = (id, slots, start, end) =>
  elementClip(kit, id, slots, {
    ...FRAME,
    startF: Math.round(start * 30),
    endF: Math.round(end * 30),
  });
let park;
let P;
before(async () => {
  park = await createParkProject();
  P = park.paths;
});
after(() => park.cleanup());
const round = (v) => Math.round(v * 1000) / 1000;
const span = (c) => [round(c.timelineStart), round(c.timelineEnd)];

test('an element is an overlay like a title, or a shot of the cut — by its kind', () => {
  const [third, bug, stinger, intro] = [
    el('lower-third', { name: 'Ada' }, 0, 4),
    el('bug', {}, 0, 9),
    el('stinger', {}, 1, 2.2),
    el('intro', { title: 'Park' }, 0, 4),
  ];
  const video = { type: 'video' };
  assert.deepEqual(
    [third, bug, stinger, intro].map((c) => isOverlay(c, video)),
    [true, true, true, false],
  );
  assert.deepEqual(
    [third, bug, stinger, intro].map((c) => isShot(c, video)),
    [false, false, false, true],
  );
  assert.deepEqual([third, stinger].map(isStinger), [false, true]);
  assert.equal(isOverlay(title('Hi', 0, 1), video), true);
  assert.equal(isShot(clip(P['broll/city.mp4'], 0, 2, 0), video), true);
});

/** An intro card, three shots cut off the beat, a stinger on the second cut, music (beats every 0.5 s). */
function dressedMontage() {
  const intro = el('intro', { title: 'Park' }, 0, 4);
  const [beach, beachSound] = pair(P['broll/beach.mp4'], 3, 5.7, 4);
  const city = clip(P['broll/city.mp4'], 0.2, 3.4, 6.7);
  const sign = clip(P['stills/sign.png'], 0, 2.4, 9.9);
  const stinger = el('stinger', {}, 9.9 - 0.6, 9.9 + 0.6);
  const third = el('lower-third', { name: 'Ada' }, 4.2, 8.2);
  const bug = el('bug', {}, 4, 12.3);
  const music = clip(P['music/bed.wav'], 0, 12.3, 0, { intent: 'music' });
  return {
    parts: { intro, stinger, third, bug },
    edl: doc({
      video: [[third, stinger], [bug], [intro, beach, city, sign]],
      audio: [[beachSound], [music]],
    }),
  };
}

test('beat sync: a card is never re-timed, a stinger rides its cut, other elements stay put', async () => {
  const { edl, parts } = dressedMontage();
  const ctx = await makeContext(park, { action: 'beat_sync' }, { edl });
  const result = beatSync(ctx);
  const durations = Object.fromEntries(ctx.media.map((m) => [m.filePath, m.duration]));
  assert.deepEqual(checkResult(result, { fps: 30, durations, roots: [park.dir] }), []);
  const picture = trackClips(result, 'video', 2);
  // The cut at 6.7 moves to 6.5 and the one at 9.9 to 10; the intro's end (4.0, on a beat) is held.
  assert.deepEqual(picture.map(span), [
    [0, 4],
    [4, 6.5],
    [6.5, 10],
    [10, 12],
  ]);
  assert.deepEqual(picture[0], parts.intro, 'the card is exactly as it was');
  const [third, stinger] = trackClips(result, 'video', 0);
  assert.deepEqual(span(stinger), [9.4, 10.6], 'the stinger still covers its cut');
  assert.deepEqual(stinger.element, parts.stinger.element);
  assert.deepEqual(third, parts.third);
  assert.deepEqual(trackClips(result, 'video', 1)[0], parts.bug);
  assert.deepEqual(validateEdl(applyDirectorResult(edl, result)).problems, []);
  // A cut that touches a card and is off the beat is left alone, and the result says why.
  const off = dressedMontage();
  const first = off.edl.tracks[2].clips;
  Object.assign(first[0], { timelineEnd: 4.2, sourceOut: 4.2 });
  Object.assign(first[1], { timelineStart: 4.2, sourceIn: 3.2 });
  Object.assign(off.edl.tracks[3].clips[0], { timelineStart: 4.2, sourceIn: 3.2 });
  const held = beatSync(await makeContext(park, { action: 'beat_sync' }, { edl: off.edl }));
  assert.deepEqual(span(trackClips(held, 'video', 2)[0]), [0, 4.2]);
  assert.match(
    held.notes.join('\n'),
    /The cut at 4\.20s was left alone: a card of the brand kit stands there\./,
  );
});

test('remove silence: elements follow the timeline like titles — never split, never targets', async () => {
  const [video, audio] = pair(P['interview.mp4'], 0, 16, 4);
  const intro = el('intro', { title: 'Park' }, 0, 4);
  const third = el('lower-third', { name: 'Ada' }, 5, 10);
  const bug = el('bug', {}, 4, 20);
  const edl = doc({ video: [[third], [bug], [intro, video]], audio: [[audio]] });
  const ctx = await makeContext(park, { action: 'remove_silence' }, { edl });
  const result = removeSilence(ctx);
  assert.deepEqual(checkResult(result, { fps: 30, roots: [park.dir] }), []);
  const cut = trackClips(result, 'video', 2);
  assert.deepEqual(cut[0], intro, 'the card before the speech is untouched');
  assert.ok(cut.length > 2, 'the speech was cut at its pauses');
  const end = Math.max(...cut.map((c) => c.timelineEnd));
  const [bugNow] = trackClips(result, 'video', 1);
  assert.deepEqual(
    [bugNow.clipId, bugNow.element],
    [bug.clipId, bug.element],
    'one bug, the same design',
  );
  assert.deepEqual(span(bugNow), [4, round(end)], 'shorter by the time taken out');
  assert.equal(trackClips(result, 'video', 0).length, 1, 'the lower third is one clip still');
  assert.deepEqual(validateEdl(applyDirectorResult(edl, result)).problems, []);
});

test('placing a cutaway: never on a track of brand overlays, in front of a card', async () => {
  const [video, audio] = pair(P['interview.mp4'], 0, 8, 4);
  const edl = doc({
    video: [
      [el('lower-third', { name: 'Ada' }, 5, 9)],
      [el('bug', {}, 4, 12)],
      [el('intro', { title: 'P' }, 0, 4), video],
    ],
    audio: [[audio]],
  });
  const tracks = docTracks(edl);
  const over = cutawayTrack(tracks, 6, 8);
  assert.equal(over.name, 'B-roll', 'a new track, in front of the picture and behind the brand');
  assert.equal(over.index, 2);
  const card = cutawayTrack(docTracks(edl), 1, 3);
  assert.equal(card.index, 2, 'a card is picture: a cutaway goes in front of it');
  const directive = {
    ...{ action: 'insert_broll', prompt: 'the dog on the beach', mode: 'insert' },
    params: { placement: 'overlay', duration: 2 },
    context: { playheadPosition: 6 },
  };
  const result = await insertBroll(await makeContext(park, directive, { edl }));
  assert.deepEqual(checkResult(result, { fps: 30, roots: [park.dir] }), []);
  const merged = applyDirectorResult(edl, result);
  assert.deepEqual(validateEdl(merged).problems, []);
  const elements = merged.tracks.flatMap((t) => t.clips).filter((c) => c.element);
  assert.deepEqual(
    elements.map(span),
    [
      [5, 9],
      [4, 12],
      [0, 4],
    ],
    'no element moved or split',
  );
});

test('the score reads elements as turns of the piece, the bug as furniture; invariants know them', () => {
  const [video, audio] = pair(P['interview.mp4'], 0, 16, 4);
  const edl = doc({
    video: [
      [el('lower-third', { name: 'Ada' }, 6, 10), el('stinger', {}, 11.4, 12.6)],
      [el('bug', {}, 4, 20)],
      [el('intro', { title: 'Park' }, 0, 4), video],
    ],
    audio: [[audio]],
  });
  const whole = { start: 0, end: 20, seconds: 20 };
  assert.deepEqual(
    turningPoints(edl, whole).map((p) => [p.time, p.kind]),
    [
      [4, 'shot'],
      [6, 'title'],
      [12, 'title'],
    ],
    'the name, the cut the stinger covers — not the bug',
  );
  assert.equal(cutsPerMinute(edl, whole), 3, 'one cut in 20 s: overlays are not cuts');
  const onAudio = { mode: 'replace', summary: 's', notes: [], markers: [], tracks: [] };
  const bad = {
    ...onAudio,
    tracks: [{ type: 'audio', index: 0, name: 'A', clips: [el('bug', {}, 0, 2)] }],
  };
  assert.deepEqual(checkResult(bad).filter((e) => /element/.test(e)).length, 1);
});
