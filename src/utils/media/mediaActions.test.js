import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEdl } from '../edl/factory.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from '../edl/testkit.js';
import {
  analysisBadges,
  applicableKinds,
  providerProblems,
  summarizeAnalysis,
} from './analysis.js';
import { insertSequence } from './insertSequence.js';
import { NO_MARKS, getMarks, markedRange, setMarks, withIn, withOut } from './ranges.js';

const video = {
  filename: 'talk.mp4',
  filePath: '/p/talk.mp4',
  type: 'video',
  duration: 10,
  hasAudio: true,
};
const song = { filename: 'song.mp3', filePath: '/p/song.mp3', type: 'audio', duration: 30 };
const photo = { filename: 'pic.jpg', filePath: '/p/pic.jpg', type: 'image', duration: null };
const notes = { filename: 'notes.md', filePath: '/p/notes.md', type: 'text', duration: null };

describe('insertSequence', () => {
  it('places items back to back from a time and reports what it created', () => {
    const start = deepFreeze(createEdl());
    const out = insertSequence(start, [{ item: video }, { item: photo }, { item: song }], {
      time: 2,
    });
    assertValid(out.edl);
    assert.deepEqual(
      layout(out.edl).v1.map((s) => s.split(' ')[1]),
      ['2-12', '12-17'],
    );
    assert.deepEqual(
      layout(out.edl).a1.map((s) => s.split(' ')[1]),
      ['2-12', '17-47'],
    );
    assert.equal(out.placed, 3);
    assert.equal(out.clipIds.length, 4, 'video + linked audio, image, song');
    assert.equal(out.end, 47);
    const [picture, sound] = out.clipIds.map((id) => clipOf(out.edl, id));
    assert.equal(picture.linkedClipId, sound.clipId);
  });

  it('honours source ranges and skips what cannot be placed', () => {
    const out = insertSequence(createEdl(), [
      { item: notes },
      { item: video, sourceIn: 2, sourceOut: 5.5 },
    ]);
    assert.equal(out.placed, 1);
    const clip = clipOf(out.edl, out.clipIds[0]);
    assert.deepEqual(
      [clip.sourceIn, clip.sourceOut, clip.timelineStart, clip.timelineEnd],
      [2, 5.5, 0, 3.5],
    );
    const nothing = insertSequence(createEdl(), [{ item: notes }]);
    assert.equal(nothing.placed, 0);
    assert.deepEqual(nothing.clipIds, []);
  });

  it('selects only the inserted clip when it overwrites the same source', () => {
    const start = testEdl({ v1: [testClip('old', 0, 10, { sourceFile: '/p/talk.mp4' })] });
    const out = insertSequence(start, [{ item: { ...video, hasAudio: false, duration: 2 } }], {
      time: 4,
      autoCrossfade: false,
    });
    assertValid(out.edl);
    assert.equal(out.clipIds.length, 1);
    assert.equal(clipOf(out.edl, out.clipIds[0]).timelineStart, 4);
    assert.equal(out.end, 6);
    assert.equal(layout(out.edl).v1.length, 3, 'the old clip was cut in two around it');
  });

  it('ripples later clips when asked', () => {
    const start = testEdl({ v1: [testClip('x', 0, 4)] });
    const out = insertSequence(start, [{ item: photo }], { time: 0, ripple: true });
    assert.deepEqual(
      layout(out.edl).v1.map((s) => s.split(' ')[1]),
      ['0-5', '5-9'],
    );
  });
});

describe('source marks', () => {
  it('keeps in before out and turns marks into insert options', () => {
    let marks = withIn(NO_MARKS, 3, 10);
    assert.deepEqual(markedRange(marks, 10), { sourceIn: 3, sourceOut: 10 });
    marks = withOut(marks, 7.5, 10);
    assert.deepEqual(markedRange(marks, 10), { sourceIn: 3, sourceOut: 7.5 });
    assert.deepEqual(withIn(marks, 8, 10), { in: 8, out: null });
    assert.deepEqual(withOut(marks, 2, 10), { in: null, out: 2 });
    assert.deepEqual(withOut(NO_MARKS, 99, 10), { in: null, out: 10 });
    assert.equal(markedRange(NO_MARKS, 10), null);
    assert.deepEqual(markedRange({ in: 4, out: null }, null), { sourceIn: 4 });
  });

  it('remembers marks per file', () => {
    assert.equal(getMarks('/p/a.mp4'), NO_MARKS);
    setMarks('/p/a.mp4', { in: 1, out: 2 });
    assert.deepEqual(getMarks('/p/a.mp4'), { in: 1, out: 2 });
    assert.equal(setMarks('/p/a.mp4', NO_MARKS), NO_MARKS);
  });
});

describe('analysis', () => {
  const analysed = { ...video, analysis: { transcript: true, scenes: true, silences: false } };

  it('offers only the analyses that suit a file', () => {
    const keys = (item) => applicableKinds(item).map((kind) => kind.key);
    assert.deepEqual(keys(video), ['transcript', 'tags', 'scenes', 'beats', 'silences']);
    assert.deepEqual(keys({ ...video, hasAudio: false }), ['tags', 'scenes']);
    assert.deepEqual(keys(song), ['transcript', 'beats', 'silences']);
    assert.deepEqual(keys(photo), ['tags']);
    assert.deepEqual(keys(notes), []);
  });

  it('marks each badge done, missing or blocked by a missing provider', () => {
    const status = { transcription: { available: true }, vision: { available: false } };
    const states = Object.fromEntries(
      analysisBadges(analysed, status).map((b) => [b.key, b.state]),
    );
    assert.deepEqual(states, {
      transcript: 'done',
      tags: 'unavailable',
      scenes: 'done',
      beats: 'missing',
      silences: 'missing',
    });
    assert.equal(analysisBadges(analysed)[1].state, 'missing', 'unknown status blocks nothing');
  });

  it('explains missing providers', () => {
    const status = {
      ffmpeg: { available: true, detail: '6.1' },
      transcription: { available: false, detail: 'whisper-cli not found' },
      vision: { available: false, detail: '' },
    };
    const problems = providerProblems(status);
    assert.deepEqual(
      problems.map((p) => p.capability),
      ['Transcription', 'Visual tagging'],
    );
    assert.match(problems[0].message, /whisper-cli not found/);
    assert.match(problems[1].message, /no provider is configured/);
    assert.deepEqual(providerProblems(null), []);
  });

  it('summarises an analyze job, naming each skip reason once', () => {
    const result = {
      files: [
        {
          path: '/p/a.mp4',
          steps: { probe: 'ok', transcribe: 'skipped: no provider', tags: 'error: timeout' },
        },
        {
          path: '/p/b.mp4',
          steps: { probe: 'ok', transcribe: 'skipped: no provider', scenes: 'skipped' },
        },
      ],
    };
    const summary = summarizeAnalysis(result);
    assert.equal(summary.headline, 'Analysed 2 files, 1 step failed');
    assert.deepEqual(summary.problems, [
      'Transcription skipped — no provider (2 files)',
      'Visual tagging failed for a.mp4 — timeout',
    ]);
    assert.equal(
      summarizeAnalysis({ files: [{ path: '/p/a', steps: { probe: 'ok' } }] }).headline,
      'Analysed 1 file',
    );
    assert.deepEqual(summarizeAnalysis(/** @type {any} */ ({})).problems, []);
  });
});
