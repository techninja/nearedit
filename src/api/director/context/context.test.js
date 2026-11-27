import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDigest, describeFile, shareBudget } from './digest.js';
import { gatherMedia } from './gather.js';
import { classifyMedia, speechCoverage, toMediaInfo } from './mediaInfo.js';
import { windowSegments } from './window.js';
import { beatGrid, createProject, say } from '../testing/fixtures.js';

let project;
let media;
before(async () => {
  project = await createProject({
    'interview.mp4': {
      duration: 8,
      sidecar: {
        transcript: say('we arrived at the park early | the dog loved the beach'),
        tags: ['interview', 'woman'],
        description: 'A woman talks to camera in a park.',
        scenes: [{ start: 0, end: 8 }],
      },
    },
    'broll/beach10.mp4': {
      duration: 5,
      audio: false,
      sidecar: {
        tags: ['beach', 'dog'],
        scenes: [
          { start: 0, end: 2 },
          { start: 2, end: 5 },
        ],
      },
    },
    'broll/beach2.mp4': { duration: 3, sidecar: false },
    'music/bed.wav': { duration: 10, sidecar: { beats: beatGrid(120, 10), bpm: 120 } },
    'stills/sign.png': { size: '640x480', sidecar: false },
  });
  writeFileSync(join(project.dir, 'notes.md'), '# not media');
  media = await gatherMedia(project.projectId);
});
after(() => project.cleanup());

const entry = (name, type) => ({
  filename: name,
  filePath: `/x/${name}`,
  relativePath: name,
  root: '/x',
  global: false,
  type,
});

test('gatherMedia lists media in a stable natural order with handles', () => {
  assert.deepEqual(
    media.map((m) => [m.handle, m.relativePath, m.kind]),
    [
      ['m1', 'broll/beach2.mp4', 'picture'],
      ['m2', 'broll/beach10.mp4', 'picture'],
      ['m3', 'interview.mp4', 'speech'],
      ['m4', 'music/bed.wav', 'music'],
      ['m5', 'stills/sign.png', 'still'],
    ],
  );
});

test('un-analysed files are probed so they still carry what is known', () => {
  const [raw, , , , still] = media;
  assert.equal(raw.analysed, false);
  assert.ok(Math.abs(raw.duration - 3) < 0.1);
  assert.deepEqual([raw.width, raw.height, raw.hasAudio], [320, 180, true]);
  assert.deepEqual([still.width, still.height, still.duration], [640, 480, null]);
  assert.equal(media[1].hasAudio, false);
  assert.equal(media[1].analysed, true);
});

test('sidecars without segments get them derived from the words', () => {
  const interview = media[2];
  assert.equal(interview.words.length, 11);
  assert.deepEqual(
    interview.segments.map((s) => s.text),
    ['we arrived at the park early', 'the dog loved the beach'],
  );
});

test('gatherMedia honours cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(gatherMedia(project.projectId, { signal: controller.signal }));
});

test('classifyMedia: coverage, tag overrides and filename hints', () => {
  const info = (name, type, sidecar) => toMediaInfo(entry(name, type), sidecar);
  const talk = { duration: 10, hasAudio: true, transcript: say('a b c d e f g h i j k l') };
  assert.equal(info('a.mp4', 'video', talk).kind, 'speech');
  assert.ok(speechCoverage(info('a.mp4', 'video', talk)) > 0.4);
  const aside = { duration: 60, hasAudio: true, transcript: say('look at that') };
  assert.equal(info('a.mp4', 'video', aside).kind, 'picture');
  assert.equal(info('a.mp4', 'video', { ...aside, tags: ['Interview'] }).kind, 'speech');
  assert.equal(info('a.mp4', 'video', { ...talk, tags: ['b-roll'] }).kind, 'picture');
  assert.equal(info('a.wav', 'audio', { ...talk, tags: ['music'] }).kind, 'music');
  assert.equal(info('a.wav', 'audio', talk).kind, 'speech');
  assert.equal(info('song.wav', 'audio', { duration: 90 }).kind, 'music');
  assert.equal(info('voiceover take 2.wav', 'audio', null).kind, 'speech');
  assert.equal(classifyMedia(info('pic.jpg', 'image', null)), 'still');
});

test('toMediaInfo reads legacy resolution strings and swaps rotated dimensions', () => {
  const legacy = toMediaInfo(entry('a.mp4', 'video'), { duration: 4, resolution: '3840x2160' });
  assert.deepEqual([legacy.width, legacy.height, legacy.hasAudio], [3840, 2160, false]);
  const phone = toMediaInfo(entry('b.mp4', 'video'), { width: 1920, height: 1080, rotation: -90 });
  assert.deepEqual([phone.width, phone.height], [1080, 1920]);
});

test('the digest names every file, its facts and a numbered transcript', () => {
  const { text, shown, hidden } = buildDigest(media);
  assert.equal(hidden, 0);
  assert.equal(shown.length, 5);
  assert.match(
    text,
    /^m1 video "broll\/beach2\.mp4" 3\.0s 320x180 with sound \[picture\] \(not analysed\)/m,
  );
  assert.match(text, /^m2 video "broll\/beach10\.mp4" 5\.0s 320x180 silent \[picture\]$/m);
  assert.match(text, /tags: beach, dog/);
  assert.match(text, /shots: 1 0\.0-2\.0, 2 2\.0-5\.0/);
  assert.match(text, /^m4 audio "music\/bed\.wav" 10\.0s \[music\] 120 bpm$/m);
  assert.match(text, /^m5 image "stills\/sign\.png" 640x480 \[still image\] \(not analysed\)$/m);
  assert.match(text, /about: A woman talks to camera/);
  assert.match(
    text,
    /transcript \(2 segments\):\n {4}s1 \[0\.0-2\.3\] we arrived at the park early\n {4}s2 /,
  );
  assert.ok(!text.includes('notes.md'));
});

const longTranscript = (n) =>
  Array.from({ length: n }, (_, i) => ({
    start: i * 5,
    end: i * 5 + 4,
    text: i === 150 ? 'the lighthouse keeper waves' : `sentence number ${i + 1} about nothing much`,
  }));

test('windowSegments shows everything when it fits', () => {
  const view = windowSegments(longTranscript(5), 10000);
  assert.deepEqual([view.shown, view.total, view.lines.length], [5, 5, 5]);
});

test('windowSegments samples coherent stretches across a long transcript', () => {
  const segments = longTranscript(200);
  const view = windowSegments(segments, 2500);
  assert.ok(view.lines.join('\n').length <= 2500);
  assert.ok(view.shown > 15 && view.shown < 80, String(view.shown));
  const shown = view.lines
    .filter((l) => /^ {4}s\d/.test(l))
    .map((l) => Number(l.match(/s(\d+)/)[1]));
  // Spread through the file, not just the opening minutes.
  assert.ok(shown[0] < 40 && shown.at(-1) > 160, `${shown[0]}..${shown.at(-1)}`);
  // Stretches, not isolated lines: most shown segments have a shown neighbour.
  const paired = shown.filter((n) => shown.includes(n + 1) || shown.includes(n - 1));
  assert.ok(paired.length >= shown.length * 0.8);
  const gaps = view.lines.filter((l) => l.includes('not shown'));
  assert.ok(gaps.length >= 2);
  assert.match(gaps[0], /… s\d+(–s\d+)? not shown \(\d/);
});

test('windowSegments centres a window on what the request mentions', () => {
  const view = windowSegments(longTranscript(200), 1500, ['lighthouse']);
  assert.ok(view.lines.some((l) => l.includes('s151 ') && l.includes('lighthouse')));
});

test('shareBudget gives short transcripts everything and splits the rest', () => {
  assert.deepEqual(shareBudget([100, 5000, 5000], 3100), [100, 1500, 1500]);
  assert.deepEqual(shareBudget([100, 200], 1000), [100, 200]);
  assert.deepEqual(shareBudget([], 1000), []);
});

test('the digest stays within budget and says what it left out', () => {
  const many = Array.from({ length: 300 }, (_, i) =>
    toMediaInfo(entry(`clip${i}.mp4`, 'video'), {
      duration: 12,
      tags: i === 250 ? ['lighthouse'] : ['filler', 'footage', 'outdoor'],
      description: 'x'.repeat(200),
      segments: longTranscript(30),
    }),
  );
  many.forEach((m, i) => (m.handle = `m${i + 1}`));
  const { text, shown, hidden } = buildDigest(many, { budget: 6000, focus: 'the lighthouse' });
  assert.ok(text.length <= 6000, String(text.length));
  assert.ok(hidden > 0 && shown.length + hidden === 300);
  assert.match(text, new RegExp(`\\(${hidden} more files are not listed\\)$`));
  assert.ok(
    shown.some((m) => m.handle === 'm251'),
    'the relevant file is kept',
  );
  assert.ok(
    describeFile(many[0], true).join('\n').length < describeFile(many[0]).join('\n').length,
  );
});
