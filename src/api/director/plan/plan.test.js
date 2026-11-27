import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMediaInfo } from '../context/mediaInfo.js';
import { describePlan } from './describe.js';
import { toSeconds } from './coerce.js';
import { normalizePlan } from './normalize.js';
import { parsePlan, salvagePlan } from './parse.js';
import { findMedia, fitRole, resolvePlan } from './resolve.js';

const entry = (name, type) => ({
  filename: name.split('/').pop(),
  filePath: `/p/${name}`,
  relativePath: name,
  root: '/p',
  global: false,
  type,
});
const segments = Array.from({ length: 6 }, (_, i) => ({
  start: i * 10,
  end: i * 10 + 8,
  text: `s${i}`,
}));
const MEDIA = [
  toMediaInfo(entry('talk.mp4', 'video'), { duration: 60, hasAudio: true, segments }),
  toMediaInfo(entry('b/beach.mp4', 'video'), {
    duration: 12,
    hasAudio: true,
    scenes: [
      { start: 0, end: 5 },
      { start: 5, end: 12 },
    ],
  }),
  toMediaInfo(entry('sign.png', 'image'), { width: 640, height: 480 }),
  toMediaInfo(entry('song.wav', 'audio'), { duration: 90, beats: [0, 0.5, 1], bpm: 120 }),
  toMediaInfo(entry('mute.mp4', 'video'), { duration: 9, hasAudio: false }),
];
MEDIA.forEach((m, i) => (m.handle = `m${i + 1}`));

test('parsePlan reads clean JSON', () => {
  const out = parsePlan('{"picks":[{"file":"m1","role":"primary","segments":[1,2]}]}');
  assert.deepEqual(out, {
    ok: true,
    repaired: false,
    plan: { picks: [{ file: 'm1', role: 'primary', segments: [1, 2] }] },
  });
});

test('parsePlan survives think blocks, code fences and trailing prose', () => {
  const reply = [
    '<think>The user wants {"picks": "something"} hmm</think>',
    'Here is the plan you asked for:',
    '```json',
    '{ "title": "Park", "picks": [ { "file": "m2", "start": 1, "end": 4 } ] }',
    '```',
    'Let me know if you want changes! {not json}',
  ].join('\n');
  const out = parsePlan(reply);
  assert.equal(out.ok, true);
  assert.deepEqual(out.ok && out.plan, {
    title: 'Park',
    picks: [{ file: 'm2', start: 1, end: 4 }],
  });
});

test('parsePlan repairs malformed and truncated JSON', () => {
  const sloppy = "{picks: [{'file': 'm1', role: 'primary', segments: [1, 2],}, {file: 'm2'}],}";
  const out = parsePlan(sloppy);
  assert.equal(out.ok && out.repaired, true);
  assert.equal(out.ok && out.plan.picks.length, 2);
  const cut = parsePlan('{"picks":[{"file":"m1","segments":[1,2]},{"file":"m2","start":3');
  assert.equal(cut.ok, true);
  assert.deepEqual(cut.ok && cut.plan.picks[1], { file: 'm2', start: 3 });
});

test('normalizePlan forgives synonyms, wrappers and numbers written as text', () => {
  const plan = normalizePlan({
    plan: {
      music: 'm4',
      sequence: [
        { source: 'm1', type: 'A-Roll', in: '0:12', out: '1:05.5', reason: 'hook', extra: true },
        { file: 3, role: 'weird', duration: '4s', on_screen_text: ' Hello ', text: 'a quote' },
        { handle: 'm1', segment: 's3-s5', role: 'voiceover', broll: ['m2', { media: 'm3' }] },
      ],
    },
  });
  assert.deepEqual(plan, {
    music: { file: 'm4' },
    picks: [
      { file: 'm1', start: 12, end: 65.5, role: 'primary', note: 'hook' },
      { file: '3', duration: 4, title: 'Hello' },
      {
        file: 'm1',
        segments: [3, 5],
        role: 'narration',
        visuals: [{ file: 'm2' }, { file: 'm3' }],
      },
    ],
  });
  assert.deepEqual(normalizePlan([{ file: 'm1' }]), { picks: [{ file: 'm1' }] });
  assert.equal(toSeconds('1:02:03'), 3723);
  assert.equal(toSeconds('soon'), 'soon');
});

test('parsePlan reports what is wrong in words a model can act on', () => {
  const bad = parsePlan('{"picks":[{"role":"primary","start":"soon"},{"file":"m1","end":-2}]}');
  assert.equal(bad.ok, false);
  const errors = !bad.ok && bad.errors.join(' | ');
  assert.match(errors, /picks\[0\] must have required property 'file'/);
  assert.match(errors, /picks\[0\]\.start must be number/);
  assert.match(errors, /picks\[1\]\.end must be >= 0/);
  assert.deepEqual(parsePlan('I cannot help with that.'), {
    ok: false,
    errors: ['the reply contained no JSON object'],
  });
  assert.match(
    parsePlan('{"title":"x"}').ok === false && parsePlan('{"title":"x"}').errors[0],
    /picks/,
  );
});

test('salvagePlan keeps the valid picks and says what it dropped', () => {
  const reply =
    '{"title":7,"picks":[{"file":"m1"},{"start":2},{"file":"m2","visuals":[{"x":1},"m3"]}]}';
  const out = salvagePlan(reply);
  assert.deepEqual(out.plan.picks, [{ file: 'm1' }, { file: 'm2', visuals: [{ file: 'm3' }] }]);
  assert.equal(out.plan.title, undefined);
  assert.match(out.dropped[0], /pick 2: must have required property 'file'/);
  assert.equal(salvagePlan('{"picks":[{"start":1}]}'), null);
});

test('findMedia accepts handles, paths and names — and nothing else', () => {
  assert.equal(findMedia('M2', MEDIA).handle, 'm2');
  assert.equal(findMedia('b/beach.mp4', MEDIA).handle, 'm2');
  assert.equal(findMedia('"BEACH.MP4"', MEDIA).handle, 'm2');
  assert.equal(findMedia('beach', MEDIA).handle, 'm2');
  assert.equal(findMedia('/p/talk.mp4', MEDIA).handle, 'm1');
  assert.equal(findMedia('/etc/passwd', MEDIA), null);
  assert.equal(findMedia('m99', MEDIA), null);
  assert.equal(findMedia(undefined, MEDIA), null);
});

test('fitRole makes a role fit the file', () => {
  const [talk, beach, sign, song, mute] = MEDIA;
  assert.equal(fitRole(undefined, talk), 'primary');
  assert.equal(fitRole(undefined, beach), 'broll');
  assert.equal(fitRole('primary', sign), 'broll');
  assert.equal(fitRole(undefined, song), 'music');
  assert.equal(fitRole('narration', song), 'narration');
  assert.equal(fitRole('narration', mute), 'broll');
  assert.equal(fitRole('music', beach), 'music');
});

test('resolvePlan binds picks to media and explains everything it drops', () => {
  const plan = {
    title: ' Park ',
    music: { file: 'm9' },
    picks: [
      {
        file: 'm1',
        segments: [2, 3],
        note: 'a',
        title: 'T',
        visuals: [{ file: 'm2', scene: 2 }, { file: 'm4' }, { file: 'nope' }],
      },
      { file: 'made-up.mp4', start: 1 },
      { file: 'm1', segments: [1, 2, 5, 9] },
      { file: 'm2', start: 99, end: 120 },
      { file: 'm2', end: 3, start: 8 },
      { file: 'm4', role: 'music', start: 10 },
      { file: 'm5', role: 'primary', scene: 4 },
    ],
  };
  const out = resolvePlan(plan, MEDIA);
  assert.equal(out.title, 'Park');
  assert.deepEqual([out.music.media.handle, out.music.start], ['m4', 10]);
  assert.deepEqual(
    out.picks.map((p) => [p.media.handle, p.role, p.start, p.end, p.basis]),
    [
      ['m1', 'primary', 10, 28, 'segments'],
      ['m1', 'primary', 0, 18, 'segments'],
      ['m1', 'primary', 40, 48, 'segments'],
      ['m2', 'broll', null, null, 'auto'],
      ['m2', 'broll', 3, 8, 'times'],
      ['m5', 'broll', null, null, 'auto'],
    ],
  );
  assert.deepEqual(
    out.picks[0].visuals.map((v) => [v.media.handle, v.start, v.end]),
    [['m2', 5, 12]],
  );
  assert.deepEqual([out.picks[0].title, out.picks[1].title, out.picks[2].note], ['T', '', '']);
  const notes = out.notes.join('\n');
  assert.match(notes, /Music: unknown file "m9" — dropped/);
  assert.match(notes, /Pick 1: song\.wav has no picture — not used as a visual/);
  assert.match(notes, /Pick 1: unknown visual "nope" — dropped/);
  assert.match(notes, /Pick 2: unknown file "made-up\.mp4" — dropped/);
  assert.match(notes, /Pick 3: talk\.mp4 has segments 1–6; numbers outside that were ignored/);
  assert.match(notes, /Pick 4: 99s is past the end of beach\.mp4/);
  assert.match(notes, /Pick 7: mute\.mp4 cannot be "primary" — used as broll/);
  assert.match(notes, /Pick 7: mute\.mp4 has no shot 4/);
  const described = describePlan(out);
  assert.deepEqual(described.picks[0], {
    file: 'm1',
    filename: 'talk.mp4',
    start: 10,
    end: 28,
    role: 'primary',
    title: 'T',
    note: 'a',
    visuals: [{ file: 'm2', filename: 'b/beach.mp4', start: 5, end: 12 }],
  });
  assert.deepEqual(described.music, { file: 'm4', filename: 'song.wav', start: 10 });
});
