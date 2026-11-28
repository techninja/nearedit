import { test } from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { SECTION_NAMES, sectionName } from './arc.js';
import { autoStyle } from './auto.js';
import { clock, pointName, timelineDigest } from './digest.js';
import { MOODS, moodsIn, readMood } from './mood.js';
import { SCORE_PLAN_EXAMPLE, SCORE_PLAN_SCHEMA } from './planSchema.js';
import { STYLES, findStyle, getStyle } from './styles.js';

const validate = new Ajv({ allErrors: true }).compile(SCORE_PLAN_SCHEMA);

test('the plan schema: a style is all a plan needs, and its example is valid', () => {
  assert.equal(validate(SCORE_PLAN_EXAMPLE), true, JSON.stringify(validate.errors));
  assert.ok(findStyle(SCORE_PLAN_EXAMPLE.style));
  assert.equal(readMood(SCORE_PLAN_EXAMPLE.mood).unknown.length, 0);
  for (const section of SCORE_PLAN_EXAMPLE.sections) assert.ok(sectionName(section.name));
  assert.equal(validate({ style: 'house' }), true);
  // Names are plain strings: an unknown style or section is for the director to replace.
  assert.equal(validate({ style: 'polka', sections: [{ name: 'solo' }] }), true);
  const bad = [
    {},
    { style: '' },
    { style: 7 },
    { style: 'house', mood: 'calm' },
    { style: 'house', mood: Array(9).fill('calm') },
    { style: 'house', sections: [] },
    { style: 'house', sections: [{ share: 1 }] },
    { style: 'house', sections: [{ name: 'intro', share: 0 }] },
    { style: 'house', sections: [{ name: 'intro', energy: 1.2 }] },
    { style: 'house', sections: Array(13).fill({ name: 'verse' }) },
    { style: 'house', bpm: 20 },
    { style: 'house', bpm: '120' },
    { style: 'house', key: 5 },
  ];
  for (const plan of bad) assert.equal(validate(plan), false, JSON.stringify(plan));
  // A plan has no room for notes: nothing in the schema could hold one.
  const fields = Object.keys(SCORE_PLAN_SCHEMA.properties);
  assert.deepEqual(fields, ['style', 'mood', 'sections', 'bpm', 'key']);
});

test('mood words move the energy and the brightness, within limits', () => {
  assert.deepEqual(readMood(['calm', 'hopeful']), {
    energy: -0.2,
    brightness: 0.15,
    known: ['calm', 'hopeful'],
    unknown: [],
  });
  assert.deepEqual(readMood(['Energetic ', 'BRIGHT', 'crunchy', 7, 'energetic']), {
    energy: 0.3,
    brightness: 0.4,
    known: ['energetic', 'bright'],
    unknown: ['crunchy'],
  });
  // Many words pulling one way stop at ±0.4.
  assert.equal(readMood(['calm', 'quiet', 'soft', 'gentle']).energy, -0.4);
  assert.equal(readMood(['epic', 'intense', 'powerful']).energy, 0.4);
  assert.equal(readMood(['dark', 'moody', 'deep']).brightness, -0.4);
  for (const nothing of [undefined, null, 'calm', {}, []]) {
    assert.deepEqual(readMood(nothing), { energy: 0, brightness: 0, known: [], unknown: [] });
  }
  for (const [word, [energy, brightness]] of Object.entries(MOODS)) {
    assert.match(word, /^[a-z]+$/);
    assert.ok(Math.abs(energy) <= 0.4 && Math.abs(brightness) <= 0.4, word);
    assert.ok(energy !== 0 || brightness !== 0, `${word} does nothing`);
  }
});

test('the mood words of a brief are found in it', () => {
  assert.deepEqual(moodsIn('calm, hopeful, picks up at the product reveal'), ['calm', 'hopeful']);
  assert.deepEqual(moodsIn('Dark and MOODY. Dark.'), ['dark', 'moody']);
  assert.deepEqual(moodsIn('a lo-fi bed for the interview'), []);
  assert.deepEqual(moodsIn(''), []);
  assert.deepEqual(moodsIn(undefined), []);
  // Words inside other words are not moods: "calmly" is no "calm", "highlight" no "light".
  assert.deepEqual(moodsIn('calmly highlight the bigger picture'), []);
});

test('auto: the pace of the timeline and whether someone speaks choose the style', () => {
  const pick = (cutsPerMinute, spoken, seed = 1) => autoStyle({ cutsPerMinute, spoken, seed });
  assert.equal(pick(3, 0.6).style.id, 'lofi');
  assert.equal(pick(12, 0.6).style.id, 'corporate');
  assert.equal(pick(30, 0.6).style.id, 'corporate');
  assert.equal(pick(3, 0).style.id, 'cinematic');
  assert.equal(pick(12, 0).style.id, 'synthwave');
  assert.equal(pick(30, 0).style.id, 'house');
  assert.equal(pick(0, 0.19).style.id, 'cinematic', 'a few words are not a voice-over');
  assert.equal(pick(0, 0.2).style.id, 'lofi');
  // Another seed, another of the styles that suit: all of them are styles.
  assert.deepEqual(
    [1, 2, 3, 4].map((seed) => pick(3, 0.6, seed).style.id),
    ['lofi', 'ambient', 'bossa', 'lofi'],
  );
  const reached = new Set();
  for (const cuts of [0, 12, 40]) {
    for (const spoken of [0, 0.5]) {
      for (let seed = 1; seed <= 3; seed++) {
        const { style, why } = pick(cuts, spoken, seed);
        assert.ok(getStyle(style.id), `${cuts}/${spoken}/${seed}`);
        assert.match(why, /^a (slow|steady|fast) timeline \(\d+ cuts? a minute\) with/);
        reached.add(style.id);
      }
    }
  }
  assert.equal(reached.size, STYLES.length, 'every style can be chosen');
  assert.match(pick(3, 0.62).why, /with speech over 62% of it: a bed that leaves the voice room$/);
  assert.match(pick(1, 0).why, /\(1 cut a minute\) without speech: the music may carry it$/);
  // A style named in the brief is taken at its word.
  const named = autoStyle({ cutsPerMinute: 3, spoken: 0.6, brief: 'something like synthwave' });
  assert.deepEqual([named.style.id, named.why], ['synthwave', 'the brief names it']);
});

test('the timeline digest: length, pace, turning points and speech in clock times', () => {
  assert.deepEqual([clock(0), clock(7.4), clock(59.6), clock(135)], ['0:00', '0:07', '1:00', '2:15']);
  assert.equal(pointName({ time: 1, weight: 3, kind: 'marker', label: 'Reveal' }), 'marker “Reveal”');
  assert.equal(pointName({ time: 1, weight: 1, kind: 'shot' }), 'a new shot');
  assert.equal(pointName({ time: 1, weight: 2 }), 'a turning point');
  const text = timelineDigest({
    seconds: 42.04,
    what: 'the whole timeline',
    cutsPerMinute: 8.6,
    points: [
      { time: 12.4, weight: 3, kind: 'marker', label: 'Product reveal' },
      { time: 20, weight: 2, kind: 'title', label: 'Meet the dashboard' },
      { time: 31, weight: 1, kind: 'shot', label: '' },
    ],
    speech: {
      spans: [
        { start: 1, end: 11.2 },
        { start: 14, end: 28 },
      ],
      spoken: 0.576,
    },
  });
  assert.equal(
    text,
    [
      'Length to score: 42 seconds (the whole timeline).',
      'Pace: 9 cuts a minute.',
      'Turning points:',
      '  0:12 marker “Product reveal”',
      '  0:20 title “Meet the dashboard”',
      '  0:31 a new shot',
      'Speech: 0:01–0:11, 0:14–0:28 (58% of the length).',
    ].join('\n'),
  );
  const empty = { seconds: 8, what: 'the range', cutsPerMinute: 0, points: [] };
  assert.equal(
    timelineDigest({ ...empty, speech: { spans: [], spoken: 0 } }),
    'Length to score: 8 seconds (the range).\nPace: 0 cuts a minute.\n' +
      'Turning points: none (no markers, titles or long shots).\nSpeech: none.',
  );
  // A long list is cut short and says so.
  const points = Array.from({ length: 40 }, (_, i) => ({ time: i * 5, weight: 1, kind: 'shot' }));
  const long = timelineDigest({ ...empty, points, speech: { spans: [], spoken: 0 } });
  assert.match(long, /\n {2}1:55 a new shot\n… and 16 more\n/);
  assert.equal(SECTION_NAMES.length, 5);
});
