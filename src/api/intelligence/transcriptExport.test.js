import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportTranscript, formatTimestamp, toCues, toSrt, toVtt } from './transcriptExport.js';
import { matchFile } from './search.js';
import { excerpt, parseQuery } from './searchTerms.js';

const sidecar = {
  duration: 3700,
  language: 'en',
  transcriptProvider: 'whisper-cpp',
  transcript: [
    { word: 'Hello', start: 0.5, end: 0.9, probability: 0.98 },
    { word: 'world.', start: 1, end: 1.4, probability: 0.95 },
    { word: 'Much', start: 3661.25, end: 3661.6, probability: 0.9 },
    { word: 'later.', start: 3661.7, end: 3662.004, probability: 0.9 },
  ],
  segments: [
    { id: 0, start: 0.5, end: 1.4, text: 'Hello world.' },
    { id: 1, start: 3661.25, end: 3662.004, text: 'Much later.' },
  ],
};

test('timestamps: zero padding, both separators, rounding carries, past one hour', () => {
  assert.equal(formatTimestamp(0), '00:00:00,000');
  assert.equal(formatTimestamp(1.5), '00:00:01,500');
  assert.equal(formatTimestamp(61.042), '00:01:01,042');
  assert.equal(formatTimestamp(3661.5), '01:01:01,500');
  assert.equal(formatTimestamp(3661.5, '.'), '01:01:01.500');
  assert.equal(formatTimestamp(59.9996), '00:01:00,000', 'never 00:00:60,000');
  assert.equal(formatTimestamp(3599.9999), '01:00:00,000');
  assert.equal(formatTimestamp(0.0004), '00:00:00,000');
  assert.equal(formatTimestamp(36000.001), '10:00:00,001');
  assert.equal(formatTimestamp(360000), '100:00:00,000', 'hours are not capped at two digits');
  assert.equal(formatTimestamp(-3), '00:00:00,000');
  assert.equal(formatTimestamp(NaN), '00:00:00,000');
});

test('SRT: numbered cues separated by blank lines', () => {
  assert.equal(
    exportTranscript(sidecar, 'srt'),
    '1\n00:00:00,500 --> 00:00:01,400\nHello world.\n\n' +
      '2\n01:01:01,250 --> 01:01:02,004\nMuch later.\n',
  );
  assert.equal(toSrt([]), '');
});

test('WebVTT: header, dot separator, "-->" never appears in cue text', () => {
  assert.equal(
    exportTranscript(sidecar, 'vtt'),
    'WEBVTT\n\n00:00:00.500 --> 00:00:01.400\nHello world.\n\n' +
      '01:01:01.250 --> 01:01:02.004\nMuch later.\n',
  );
  assert.equal(
    toVtt([{ start: 0, end: 1, text: 'a --> b' }]),
    'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\na -> b\n',
  );
  assert.equal(toVtt([]), 'WEBVTT\n\n');
});

test('plain text and JSON exports', () => {
  assert.equal(exportTranscript(sidecar, 'txt'), 'Hello world.\nMuch later.\n');
  const json = JSON.parse(exportTranscript(sidecar, 'json', '/media/talk.mp4'));
  assert.deepEqual(Object.keys(json), [
    'path',
    'language',
    'provider',
    'duration',
    'text',
    'words',
    'segments',
  ]);
  assert.equal(json.path, '/media/talk.mp4');
  assert.equal(json.text, 'Hello world. Much later.');
  assert.equal(json.words.length, 4);
  assert.equal(json.provider, 'whisper-cpp');
});

test('a transcript with only words is grouped into readable cues', () => {
  const words = [];
  for (let i = 0; i < 14; i++) words.push({ word: `w${i}`, start: i * 0.5, end: i * 0.5 + 0.25 });
  words.push({ word: 'after', start: 10, end: 10.3 }, { word: 'pause', start: 10.4, end: 10.8 });
  const cues = toCues({ transcript: words, segments: [] });
  assert.deepEqual(
    cues.map((c) => [c.start, c.end, c.text.split(' ').length]),
    [
      [0, 4.75, 10],
      [5, 6.75, 4],
      [10, 10.8, 2],
    ],
  );
  assert.deepEqual(toCues({ transcript: null, segments: null }), []);
  assert.equal(exportTranscript({ transcript: [] }, 'srt'), '');
});

const entry = {
  filename: 'park-day.mp4',
  filePath: '/m/day1/park-day.mp4',
  relativePath: 'day1/park-day.mp4',
  root: '/m',
  global: false,
  type: /** @type {const} */ ('video'),
};
const indexed = {
  type: 'video',
  tags: ['dog', 'park', 'hot dog stand'],
  description: 'A golden retriever chases a ball across a sunny park while children watch.',
  keyframes: [
    { time: 2, tags: ['dog', 'ball'], description: 'A dog jumps for a ball.' },
    { time: 9, tags: ['kids'], description: 'Children laughing.' },
  ],
  transcript: [
    { word: 'Look', start: 4, end: 4.2 },
    { word: 'at', start: 4.2, end: 4.3 },
    { word: 'the', start: 4.3, end: 4.4 },
    { word: 'dog!', start: 4.6, end: 5 },
    { word: 'Ice', start: 12, end: 12.3 },
    { word: 'cream', start: 12.3, end: 12.8 },
    { word: 'time.', start: 12.8, end: 13.2 },
  ],
  segments: [
    { id: 0, start: 4, end: 5, text: 'Look at the dog!' },
    { id: 1, start: 12, end: 13.2, text: 'Ice cream time.' },
  ],
};

test('search: matches say where the hit is, with timestamps', () => {
  const hit = matchFile(entry, indexed, ['dog']);
  assert.deepEqual(
    hit.matches.map((m) => m.field),
    ['tag', 'tag', 'keyframe', 'transcript'],
  );
  assert.deepEqual(hit.matches[0], { field: 'tag', text: 'dog' });
  assert.deepEqual(hit.matches[2], {
    field: 'keyframe',
    text: 'A dog jumps for a ball., dog, ball',
    time: 2,
  });
  assert.deepEqual(hit.matches[3], {
    field: 'transcript',
    text: 'Look at the dog!',
    start: 4,
    end: 5,
    time: 4.6,
  });
  assert.equal(hit.matchCount, 4);
  assert.equal(hit.score, 3 + 3 + 1 + 1);

  const spoken = matchFile(entry, indexed, ['ice', 'cream']);
  assert.deepEqual(spoken.matches, [
    { field: 'transcript', text: 'Ice cream time.', start: 12, end: 13.2, time: 12 },
  ]);
  assert.equal(spoken.score, 2, 'both terms in one cue');
});

test('search: every term must match somewhere; filenames match without a sidecar', () => {
  assert.ok(matchFile(entry, indexed, ['park', 'retriever']), 'filename/tag + description');
  assert.equal(matchFile(entry, indexed, ['dog', 'giraffe']), null);
  assert.deepEqual(matchFile(entry, null, ['day1']), {
    score: 3,
    matchCount: 1,
    matches: [{ field: 'filename', text: 'day1/park-day.mp4' }],
  });
  assert.equal(matchFile(entry, null, ['dog']), null);
  const many = {
    transcript: [],
    segments: Array.from({ length: 40 }, (_, i) => ({
      start: i,
      end: i + 1,
      text: `take ${i} of the dog`,
    })),
  };
  const capped = matchFile(entry, many, ['dog']);
  assert.equal(capped.matches.length, 5, 'at most five excerpts per field');
  assert.equal(capped.matchCount, 40);
});

test('search: text files match on their sections; excerpts are short', () => {
  const script = {
    type: 'text',
    sections: [
      { heading: 'Intro', level: 1, text: 'Welcome to the park.' },
      { start: 3, end: 5, text: 'subtitle about a park bench' },
    ],
  };
  const hit = matchFile({ ...entry, relativePath: 'script.md', type: 'text' }, script, ['park']);
  assert.deepEqual(hit.matches, [
    { field: 'content', text: 'Intro — Welcome to the park.' },
    { field: 'content', text: 'subtitle about a park bench', start: 3, end: 5 },
  ]);
  const long = `${'lorem ipsum '.repeat(40)}needle ${'dolor sit '.repeat(40)}`;
  assert.deepEqual(parseQuery('  Dog! (PARK)  dog  — "ice-cream" '), ['dog', 'park', 'ice-cream']);
  assert.deepEqual(parseQuery('?!'), []);
  const cut = excerpt(long, ['needle'], 30);
  assert.ok(cut.startsWith('…') && cut.endsWith('…') && cut.includes('needle'));
  assert.ok(cut.length < 70);
});
