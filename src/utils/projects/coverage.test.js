import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analysisCoverage, analysisPending, coveragePercent, mediaOverview } from './coverage.js';

const item = (type, extra = {}) => ({
  type,
  hasAudio: type === 'audio',
  indexed: false,
  duration: null,
  size: 0,
  analysis: {},
  ...extra,
});

const MEDIA = [
  item('video', {
    hasAudio: true,
    duration: 30,
    size: 1000,
    indexed: true,
    analysis: { scenes: true, silences: true, beats: true, transcript: true },
  }),
  item('video', {
    hasAudio: false,
    duration: 10,
    size: 500,
    indexed: true,
    analysis: { scenes: true },
  }),
  item('audio', {
    duration: 60,
    size: 200,
    indexed: true,
    analysis: { beats: true, silences: true },
  }),
  item('image', { size: 50 }),
  item('text', { size: 5, indexed: true }),
];

describe('mediaOverview', () => {
  it('counts by kind and adds up length and size', () => {
    assert.deepEqual(mediaOverview(MEDIA), {
      total: 5,
      video: 2,
      audio: 1,
      image: 1,
      text: 1,
      duration: 100,
      size: 1755,
    });
  });

  it('is all zero for no media', () => {
    assert.equal(mediaOverview([]).total, 0);
    assert.equal(mediaOverview(undefined).duration, 0);
  });
});

describe('analysisCoverage', () => {
  const rows = Object.fromEntries(analysisCoverage(MEDIA).map((row) => [row.key, row]));

  it('counts indexing over every file', () => {
    assert.deepEqual([rows.probe.done, rows.probe.total], [4, 5]);
  });

  it('applies shots to video only', () => {
    assert.deepEqual([rows.scenes.done, rows.scenes.total], [2, 2]);
  });

  it('applies sound steps to audio and video with sound', () => {
    assert.deepEqual([rows.silences.done, rows.silences.total], [2, 2]);
    assert.deepEqual([rows.beats.done, rows.beats.total], [2, 2]);
    assert.deepEqual([rows.transcript.done, rows.transcript.total], [1, 2]);
  });

  it('applies descriptions to video and stills', () => {
    assert.deepEqual([rows.tags.done, rows.tags.total], [0, 3]);
    assert.equal(rows.tags.provider, 'vision');
  });

  it('leaves out steps that apply to nothing', () => {
    const keys = analysisCoverage([item('image')]).map((row) => row.key);
    assert.deepEqual(keys, ['probe', 'tags']);
    assert.deepEqual(analysisCoverage([]), []);
  });
});

describe('analysisPending', () => {
  const rows = analysisCoverage(MEDIA);

  it('is true while a step the server can run is incomplete', () => {
    assert.equal(analysisPending(rows), true);
  });

  it('ignores steps whose provider is not set up', () => {
    const done = MEDIA.map((m) => ({ ...m, indexed: true }));
    const status = { transcription: { available: false }, vision: { available: false } };
    assert.equal(analysisPending(analysisCoverage(done), status), false);
    assert.equal(analysisPending(analysisCoverage(done), { vision: { available: true } }), true);
  });
});

describe('coveragePercent', () => {
  it('rounds to whole percent', () => {
    assert.equal(coveragePercent({ done: 1, total: 3 }), 33);
    assert.equal(coveragePercent({ done: 0, total: 0 }), 0);
    assert.equal(coveragePercent({ done: 4, total: 4 }), 100);
  });
});
