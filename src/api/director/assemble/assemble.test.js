import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { gatherMedia } from '../context/gather.js';
import { resolvePlan } from '../plan/resolve.js';
import { brollPool } from '../pipeline.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { assemblePlan } from './index.js';
import { assembleOptions } from './options.js';

const FORMAT = { fps: 30, width: 1920, height: 1080 };
let project;
let media;
let durations;
before(async () => {
  project = await createParkProject();
  media = await gatherMedia(project.projectId);
  durations = Object.fromEntries(media.map((m) => [m.filePath, m.duration]));
});
after(() => project.cleanup());

const handle = (name) => media.find((m) => m.relativePath === name).handle;
/** Assemble a raw plan and check every invariant of the fragment. */
function build(plan, params = {}, format = FORMAT) {
  const resolved = resolvePlan(plan, media);
  const pool = brollPool(media, resolved);
  const built = assemblePlan(
    resolved,
    assembleOptions(format, { autoBroll: false, ...params }, { pool }),
  );
  const result = { mode: 'replace', ...built };
  const errors = checkResult(result, { fps: format.fps, durations, roots: [project.dir] });
  assert.deepEqual(errors, []);
  const slot = (type, index) =>
    built.tracks.find((t) => t.type === type && t.index === index).clips;
  return {
    ...built,
    titles: slot('video', 0),
    broll: slot('video', 1),
    main: slot('video', 2),
    dialogue: slot('audio', 0),
    ambience: slot('audio', 1),
    music: slot('audio', 2),
  };
}
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('speech picks snap outward to word boundaries, padded and frame-aligned', () => {
  // Rough range starts inside "arrived" (1.4–1.7) and ends inside "park" (2.6–2.9).
  const plan = {
    picks: [{ file: handle('interview.mp4'), role: 'primary', start: 1.55, end: 2.75 }],
  };
  const out = build(plan, { padding: 0.1 });
  const [video] = out.main;
  const [audio] = out.dialogue;
  // "we" ends at 1.3, "arrived" starts at 1.4: padding stops at the midpoint 1.35.
  assert.ok(video.sourceIn <= 1.4 && video.sourceIn >= 1.35 - 1 / 30, String(video.sourceIn));
  // "park" ends 2.9, "early" starts 3.0: padded end is 2.95, rounded out to a frame.
  assert.ok(video.sourceOut >= 2.9 && video.sourceOut <= 2.95 + 1 / 30, String(video.sourceOut));
  assert.equal(video.timelineStart, 0);
  assert.equal(video.linkedClipId, audio.clipId);
  assert.equal(audio.linkedClipId, video.clipId);
  assert.deepEqual([audio.sourceIn, audio.sourceOut], [video.sourceIn, video.sourceOut]);
  assert.equal(video.label, 'arrived at the park');
  assert.match(out.notes.join(' '), /1 speech pick aligned to word boundaries/);
});

test('segment-number picks resolve to transcript times and tightening removes pauses', () => {
  const plan = { picks: [{ file: handle('interview.mp4'), role: 'primary', segments: [1, 3] }] };
  const loose = build(plan, { tighten: false });
  assert.equal(loose.main.length, 1);
  near(loose.main[0].sourceIn, 0.9, 1 / 30);
  near(loose.main[0].sourceOut, 13.7, 1 / 30);

  const tight = build(plan, { tighten: true, threshold: 0.8, padding: 0.1 });
  assert.equal(tight.main.length, 3);
  assert.equal(tight.dialogue.length, 3);
  // Three sentences: 3.5s, 2.7s and 2.7s of words plus 0.1s padding each side.
  near(tight.seconds, 3.7 + 2.9 + 2.9, 4 / 30);
  for (let i = 0; i < 3; i++) {
    assert.equal(tight.main[i].linkedClipId, tight.dialogue[i].clipId);
    if (i) assert.equal(tight.main[i].timelineStart, tight.main[i - 1].timelineEnd);
  }
  assert.ok(tight.main[1].sourceIn >= 6.5 - 1 / 30 && tight.main[1].sourceIn <= 6.5);
  assert.match(tight.notes.join(' '), /Removed 2 pauses \(3\.\ds of dead air\)/);
});

test('picture-only cuts snap to shot boundaries where close, not otherwise', () => {
  const file = handle('broll/beach.mp4');
  const close = build({ picks: [{ file, role: 'broll', start: 2.7, end: 7.8 }] });
  assert.deepEqual([close.main[0].sourceIn, close.main[0].sourceOut], [3, 8]);
  assert.match(close.notes.join(' '), /2 picture cuts moved onto shot boundaries/);
  const far = build({ picks: [{ file, role: 'broll', start: 4, end: 6.5 }] });
  assert.deepEqual([far.main[0].sourceIn, far.main[0].sourceOut], [4, 6.5]);
  // B-roll keeps its sound, linked, low, on the ambience track.
  assert.equal(far.ambience[0].linkedClipId, far.main[0].clipId);
  assert.equal(far.ambience[0].volume, 0.25);
  assert.equal(
    build({ picks: [{ file, role: 'broll' }] }, { naturalSound: 'off' }).ambience.length,
    0,
  );
});

test('an open-ended picture pick takes the middle of the best shot', () => {
  const out = build({ picks: [{ file: handle('broll/beach.mp4') }] }, { pacing: 'medium' });
  // Longest shot is 3–8s; 3.5s from its middle (3.75–7.25), on the frame grid.
  near(out.main[0].sourceIn, 3.75, 1 / 60);
  near(out.main[0].sourceOut - out.main[0].sourceIn, 3.5);
  const scene = build({ picks: [{ file: handle('broll/beach.mp4'), scene: 1 }] });
  assert.deepEqual([scene.main[0].sourceIn, scene.main[0].sourceOut], [0, 3]);
});

test('picture cuts land on the beats of the music bed', () => {
  const beach = handle('broll/beach.mp4');
  const city = handle('broll/city.mp4');
  const plan = {
    music: { file: handle('music/bed.wav') },
    picks: [
      { file: beach, role: 'broll', start: 3.1, end: 5.8 },
      { file: city, role: 'broll', start: 0.2, end: 3.3 },
      { file: handle('stills/sign.png'), duration: 2.8 },
      { file: beach, role: 'broll', start: 0.3, end: 2.6 },
    ],
  };
  const synced = build(plan, { beatSync: true });
  // 120 BPM: a beat every 0.5s. Shot snapping makes the picks 2.8s, 3.1s, 2.8s
  // and 3s long; each cut then moves to the nearest beat.
  assert.deepEqual(
    synced.main.map((c) => c.timelineEnd),
    [3, 6, 9, 12],
  );
  assert.match(synced.notes.join(' '), /4 cuts land on the beat/);
  assert.match(synced.summary, /cut on the beat at 120 BPM/);
  const free = build(plan, { beatSync: false });
  assert.ok(free.main.some((c) => (c.timelineEnd * 2) % 1 !== 0));
});

test('the music bed sits on its own track, reduced, with a fade-out', () => {
  const plan = {
    music: { file: handle('music/bed.wav') },
    picks: [{ file: handle('interview.mp4'), role: 'primary', segments: [1, 1] }],
  };
  const out = build(plan);
  const [bed] = out.music;
  assert.equal(bed.timelineStart, 0);
  near(bed.timelineEnd, out.seconds);
  assert.equal(bed.volume, 0.25);
  assert.ok(bed.fadeOut > 0.5 && bed.linkedClipId === '');
  assert.equal(bed.intent, 'music');
  const alone = build({ ...plan, picks: [{ file: handle('broll/city.mp4') }] });
  assert.equal(alone.music[0].volume, 0.7);
  const loud = build({ ...plan, music: { file: handle('music/bed.wav'), volume: 0.5, start: 4 } });
  assert.deepEqual([loud.music[0].volume, loud.music[0].sourceIn], [0.5, 4]);
  assert.ok(loud.music[0].fadeIn > 0);
});

test('narration with visuals: voice on the dialogue track, pictures above it', () => {
  const plan = {
    picks: [
      {
        file: handle('voice.wav'),
        role: 'narration',
        segments: [1, 2],
        visuals: [{ file: handle('broll/beach.mp4') }, { file: handle('stills/sign.png') }],
      },
    ],
  };
  const out = build(plan, { tighten: false });
  assert.equal(out.main.length, 0);
  assert.equal(out.dialogue.length, 1);
  assert.equal(out.dialogue[0].linkedClipId, '');
  assert.equal(out.broll.length, 2);
  assert.equal(out.broll[0].timelineStart, 0);
  assert.equal(out.broll[1].timelineStart, out.broll[0].timelineEnd);
  near(out.broll[1].timelineEnd, out.dialogue[0].timelineEnd);
  assert.equal(out.broll[1].transform.kenBurns.enabled, true);
  assert.equal(out.broll[0].transform.kenBurns.enabled, false);
});

test('what a plan puts on screen is the brand kit’s: on the front track, never overlapping', () => {
  const plan = {
    title: 'A Day at the Park',
    picks: [
      {
        file: handle('interview.mp4'),
        role: 'primary',
        segments: [1, 1],
        title: 'Morning',
        note: 'intro',
      },
      { file: handle('broll/city.mp4'), title: 'Downtown' },
    ],
  };
  const out = build(plan);
  // The opening title is the kit's `title` element, a pick's title its lower third.
  assert.deepEqual(
    out.titles.map((t) => [t.element.id, t.element.slots, t.element.kit.id]),
    [
      ['title', { title: 'A Day at the Park' }, 'clean'],
      ['lower-third', { name: 'Downtown' }, 'clean'],
    ],
  );
  assert.deepEqual([out.titles[0].timelineStart, out.titles[0].timelineEnd], [0, 4]);
  assert.equal(out.titles[0].sourceFile, '');
  assert.deepEqual([out.titles[0].label, out.titles[1].label], ['A Day at the Park', 'Downtown']);
  // The second pick starts at 3.7s, under the opening title: its title waits.
  assert.equal(out.titles[1].timelineStart, 4);
  assert.ok(out.titles[1].timelineEnd <= 7.2 + 1e-9, 'and ends with its pick');
  assert.match(out.notes.join(' '), /“Morning” did not fit/);
  assert.deepEqual(
    out.markers.map((m) => [m.time, m.label]),
    [[0, 'intro']],
  );
  // Interview (picture + linked sound count once), city, two elements.
  assert.equal(out.summary, '4 clips, 7.2s, 2 brand elements');
});

test('stills get a ken burns move that suits the frame', () => {
  const picks = [{ file: handle('stills/sign.png') }, { file: handle('stills/tall.png') }];
  const wide = build({ picks }).main.map((c) => c.transform.kenBurns);
  // 4:3 in 16:9 is taller than the frame → vertical pan; 1:2 even more so.
  assert.ok(wide[0].enabled && wide[0].startY !== 0 && wide[0].startY === -wide[0].endY);
  assert.equal(wide[0].startX, 0);
  assert.ok(Math.sign(wide[1].startY) === -Math.sign(wide[0].startY), 'direction alternates');
  const vertical = { fps: 30, width: 1080, height: 1920 };
  const tall = build({ picks }, {}, vertical).main.map((c) => c.transform.kenBurns);
  // 4:3 in 9:16 is wider than the frame → horizontal pan.
  assert.ok(tall[0].startX !== 0 && tall[0].startY === 0);
  // 1:2 in 9:16 is close to the frame → zoom.
  assert.ok(
    tall[1].startX === 0 && tall[1].startY === 0 && tall[1].startScale !== tall[1].endScale,
  );
  for (const kb of [...wide, ...tall]) assert.ok(kb.startScale >= 1 && kb.endScale >= 1);
});

test('auto b-roll covers pictureless narration with matching material', () => {
  const plan = { picks: [{ file: handle('voice.wav'), role: 'narration', segments: [1, 2] }] };
  const out = build(plan, { autoBroll: true, tighten: true, pacing: 'fast' });
  assert.equal(out.main.length, 0);
  const covered = out.broll.reduce((sum, c) => sum + c.timelineEnd - c.timelineStart, 0);
  near(covered, out.seconds, 1e-6);
  const files = out.broll.map((c) => c.sourceFile.split('/').pop());
  // "the beach was empty" → beach.mp4 first; "the city was waking up" → city.mp4.
  assert.equal(files[0], 'beach.mp4');
  assert.ok(files.includes('city.mp4'));
  assert.match(out.notes.join(' '), /Auto b-roll: \d+ shots? added/);
});

test('auto b-roll lays cutaways across talking-head jump cuts', () => {
  const plan = { picks: [{ file: handle('interview.mp4'), role: 'primary', segments: [1, 3] }] };
  const out = build(plan, { autoBroll: true, tighten: true });
  assert.equal(out.main.length, 3);
  assert.ok(out.broll.length >= 1);
  const jump = out.main[1].timelineStart;
  const [cutaway] = out.broll;
  assert.ok(cutaway.timelineStart < jump && cutaway.timelineEnd > jump);
  assert.ok(cutaway.timelineStart >= 0.5, 'the speaker is seen first');
  assert.equal(build(plan, { autoBroll: false, tighten: true }).broll.length, 0);
});

test('a plan with nothing usable is a 422, not an empty fragment', () => {
  const resolved = resolvePlan({ picks: [{ file: 'm99' }] }, media);
  assert.throws(() => assemblePlan(resolved, assembleOptions(FORMAT)), { status: 422 });
});
