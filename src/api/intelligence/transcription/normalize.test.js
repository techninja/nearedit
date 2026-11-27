import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTranscripts, normalizeTranscript, planChunks } from './normalize.js';
import { isLanguage, languageCode } from './languages.js';

test('normalising, merging, chunk planning and language codes', () => {
  const nested = normalizeTranscript(
    {
      language: 'German',
      segments: [
        {
          start: 1,
          end: 2,
          text: ' Guten Tag ',
          words: [
            { word: ' Guten', start: 1, end: 1.4, probability: 0.91234 },
            { word: 'Tag', start: 1.5, end: 2 },
            { word: ' ', start: 2, end: 2 },
          ],
        },
      ],
    },
    100,
  );
  assert.deepEqual(nested, {
    language: 'de',
    words: [
      { word: 'Guten', start: 101, end: 101.4, probability: 0.912 },
      { word: 'Tag', start: 101.5, end: 102 },
    ],
    segments: [{ id: 0, start: 101, end: 102, text: 'Guten Tag' }],
  });
  assert.deepEqual(normalizeTranscript(null), { words: [], segments: [], language: '' });
  const merged = mergeTranscripts([
    nested,
    normalizeTranscript({ segments: [{ start: 0, end: 1, text: 'x' }] }, 200),
  ]);
  assert.deepEqual(
    merged.segments.map((s) => [s.id, s.start]),
    [
      [0, 101],
      [1, 200],
    ],
  );
  assert.equal(merged.language, 'de');

  assert.deepEqual(planChunks(10, 600), [{ start: 0, length: 10 }]);
  assert.deepEqual(planChunks(1500, 600), [
    { start: 0, length: 600 },
    { start: 600, length: 600 },
    { start: 1200, length: 300 },
  ]);
  // A silence shortly before a boundary moves the cut into its middle.
  const silences = [
    { start: 100, end: 101 },
    { start: 570, end: 580 },
    { start: 590, end: 592 },
    { start: 1250, end: 1251 },
  ];
  assert.deepEqual(planChunks(1500, 600, silences), [
    { start: 0, length: 591 },
    { start: 591, length: 600 },
    { start: 1191, length: 309 },
  ]);

  assert.deepEqual(['English', 'en', 'en-US', 'cantonese', 'klingon', '', null].map(languageCode), [
    'en',
    'en',
    'en',
    'yue',
    '',
    '',
    '',
  ]);
  assert.deepEqual(['fr', 'french', 'xx', 5, "en'; rm -rf"].map(isLanguage), [
    true,
    true,
    false,
    false,
    false,
  ]);
});
