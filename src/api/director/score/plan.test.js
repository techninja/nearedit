import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultParams } from '#utils/director/actions.js';
import { SCORE_PLAN_EXAMPLE } from '#utils/director/score/planSchema.js';
import { STYLES } from '#utils/director/score/styles.js';
import { scorePrompt, scoreSystemPrompt } from '../prompts/score.js';
import { normalizeScorePlan, toLevel } from './normalize.js';
import { parseScorePlan, salvageScorePlan } from './parse.js';
import { decide } from './plan.js';
import { correctionPrompt } from './request.js';

const seen = (more = {}) => ({
  seconds: 40,
  what: 'the whole timeline',
  cutsPerMinute: 4,
  points: [],
  speech: { spans: [], spoken: 0, clips: 0, notes: [] },
  ...more,
});
// The form as it is with the style and the key left to the timeline, not to the brand.
const params = (more = {}) => ({ ...defaultParams('score'), style: 'auto', key: 'auto', ...more });
const decided = (plan, more = {}) =>
  decide(plan, {
    params: params(more.params),
    prompt: more.prompt || '',
    seen: seen(more.seen),
    by: more.by || 'llm',
  });

test('a clean reply is the plan; prose, fences and reasoning around it are passed over', () => {
  const plan = JSON.stringify(SCORE_PLAN_EXAMPLE);
  for (const reply of [
    plan,
    `Here is the plan:\n\`\`\`json\n${plan}\n\`\`\`\nEnjoy!`,
    `<think>The user wants calm music. {"style": "house"} would be wrong.</think>${plan}`,
    `Sure — ${plan} — let me know.`,
  ]) {
    const parsed = parseScorePlan(reply);
    assert.equal(parsed.ok, true, reply.slice(0, 40));
    assert.deepEqual(parsed.ok && parsed.plan, SCORE_PLAN_EXAMPLE);
    assert.equal(parsed.ok && parsed.repaired, false);
  }
});

test('malformed JSON is repaired; harmless deviations are normalised', () => {
  const sloppy = `{style: 'Lo-Fi', "mood": "calm, hopeful and warm", sections: [
    {section: "Intro", length: "1", intensity: "low"},
    {"name": "Chorus", "share": 3, "energy": 85,},
    "outro",
  ], tempo: "84 bpm", key: "D minor",}`;
  const parsed = parseScorePlan(sloppy);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(parsed.ok && parsed.repaired, true);
  assert.deepEqual(parsed.ok && parsed.plan, {
    style: 'lo-fi',
    mood: ['calm', 'hopeful', 'warm'],
    sections: [
      { name: 'intro', share: 1, energy: 0.3 },
      { name: 'chorus', share: 3, energy: 0.85 },
      { name: 'outro' },
    ],
    bpm: 84,
    key: 'D',
  });
  // Wrappers and other words for the fields.
  assert.deepEqual(normalizeScorePlan({ plan: { genre: 'House', vibe: ['Driving'] } }), {
    style: 'house',
    mood: ['driving'],
  });
  assert.deepEqual(
    normalizeScorePlan({ result: { style: 'waltz', structure: [{ type: 'verse' }] } }),
    {
      style: 'waltz',
      sections: [{ name: 'verse' }],
    },
  );
  assert.deepEqual(['high', ' Medium ', '40%', 0.4, 40, 400, 'loud'].map(toLevel), [
    0.9,
    0.55,
    0.4,
    0.4,
    0.4,
    400,
    'loud',
  ]);
  // What it cannot make sense of is left for validation.
  assert.deepEqual(normalizeScorePlan({ style: 7, mood: 3, sections: 'two' }), {
    style: 7,
    mood: 3,
    sections: 'two',
  });
  for (const junk of [null, 7, 'house', [1, 2]]) assert.deepEqual(normalizeScorePlan(junk), junk);
});

test('an invalid reply says why, in words a model can act on', () => {
  const errors = (reply) => {
    const parsed = parseScorePlan(reply);
    return parsed.ok === false ? parsed.errors : [];
  };
  assert.deepEqual(errors('I would suggest something calm.'), [
    'the reply contained no JSON object',
  ]);
  assert.deepEqual(errors('[1, 2, 3]'), ['the reply contained no JSON object']);
  assert.deepEqual(errors('{"mood": ["calm"]}'), ["must have required property 'style'"]);
  assert.deepEqual(errors('{"style": "house", "sections": [{"name": "lift", "energy": 7000}]}'), [
    'sections[0].energy must be <= 1',
  ]);
  assert.deepEqual(errors('{"style": "house", "bpm": 300, "sections": []}'), [
    'sections must NOT have fewer than 1 items',
    'bpm must be <= 240',
  ]);
  // Of several objects in a reply, the one that names a style is the plan.
  const two = parseScorePlan('{"note": "thinking"} then {"style": "bossa"}');
  assert.deepEqual(two.ok && two.plan, { style: 'bossa' });
  const prompt = correctionPrompt(['bpm must be <= 240', 'sections must be array']);
  assert.match(
    prompt,
    /^That reply could not be used as a score plan:\n- bpm must be <= 240\n- sections/,
  );
  assert.match(prompt, /Reply again with ONE corrected JSON object/);
});

test('salvage keeps the style and whatever else is usable', () => {
  const reply =
    '{"style": "cinematic", "mood": "dark", "bpm": 900, "key": "E", "sections": ' +
    '[{"name": "intro"}, {"share": 2}, {"name": "lift", "energy": 3000}, {"name": "outro", "share": 1}]}';
  assert.equal(parseScorePlan(reply).ok, false);
  assert.deepEqual(salvageScorePlan(reply), {
    plan: {
      style: 'cinematic',
      mood: ['dark'],
      key: 'E',
      sections: [{ name: 'intro' }, { name: 'outro', share: 1 }],
    },
    dropped: [
      'bpm: bpm must be <= 240',
      "section 2: must have required property 'name'",
      'section 3: energy must be <= 1',
    ],
  });
  assert.deepEqual(salvageScorePlan('{"style": "house", "sections": "many"}'), {
    plan: { style: 'house' },
    dropped: ['sections: must be a list'],
  });
  for (const hopeless of ['{"mood": ["calm"]}', '{"style": 12}', 'no json', '']) {
    assert.equal(salvageScorePlan(hopeless), null, hopeless);
  }
});

test('deciding: what the form fixes wins; the plan fills the rest', () => {
  const plan = { style: 'Bossa Nova', mood: ['calm', 'bright'], bpm: 112, key: 'Eb' };
  const free = decided(plan);
  assert.deepEqual(
    [free.style.id, free.energy, free.brightness, free.bpm, free.key],
    ['bossa', 0.25, 0.8, 112, 'Eb'],
  );
  assert.deepEqual(free.mood, ['calm', 'bright']);
  assert.deepEqual(free.notes, [
    'Style Bossa nova (the LLM’s choice).',
    'Mood: calm, bright — energy 0.25, brightness 0.8.',
  ]);
  const fixed = decided(plan, { params: { style: 'house', bpm: 124, key: 'A', energy: 0.9 } });
  assert.deepEqual(
    [fixed.style.id, fixed.energy, fixed.bpm, fixed.key],
    ['house', 0.65, 124, 'A'],
    'the mood still moves the energy the form set',
  );
  assert.equal(fixed.notes[0], 'Style House, as chosen in the form.');
  // A tempo outside what a song can have is brought inside; a key that is none is left out.
  assert.equal(decided({ style: 'house' }, { params: { bpm: 12 } }).bpm, 40);
  assert.equal(decided({ style: 'house', key: 'H' }).key, undefined);
  assert.equal(decided({ style: 'house' }).bpm, 0, 'no tempo asked for: one is fitted');
});

test('deciding: an unknown style is replaced by what the timeline suggests, and reported', () => {
  const calm = decided({ style: 'polka' }, { seen: { speech: { spans: [], spoken: 0.6 } } });
  assert.equal(calm.style.id, 'lofi');
  assert.equal(
    calm.notes[0],
    'Unknown style “polka” — Lo-fi is used instead: a slow timeline (4 cuts a minute) with ' +
      'speech over 60% of it: a bed that leaves the voice room.',
  );
  // Without a model the plan carries the form's "auto", and the brief may name a style.
  const auto = decided({ style: 'auto' }, { by: 'rule', seen: { cutsPerMinute: 30 } });
  assert.deepEqual(
    [auto.style.id, auto.notes[0]],
    [
      'house',
      'Style House — a fast timeline (30 cuts a minute) without speech: the music may carry it.',
    ],
  );
  const named = decided({ style: 'auto' }, { by: 'rule', prompt: 'a gentle waltz' });
  assert.deepEqual(
    [named.style.id, named.notes[0]],
    ['waltz', 'Style Waltz — the brief names it.'],
  );
  const second = decided({ style: 'auto' }, { by: 'rule', params: { seed: 2 } });
  assert.equal(second.style.id, 'ambient', 'another variation, another style that suits');
});

test('deciding: sections are named in the director’s words; moods it does not know are passed over', () => {
  const made = decided({
    style: 'house',
    mood: ['epic', 'crunchy'],
    sections: [
      { name: 'opening' },
      { name: 'drop', share: 2, energy: 1 },
      { name: 'solo', share: 0 },
    ],
  });
  assert.deepEqual(made.sections, [
    { name: 'intro', share: 1, energy: undefined },
    { name: 'lift', share: 2, energy: 1 },
    { name: 'verse', share: 1, energy: undefined },
  ]);
  assert.deepEqual(made.notes.slice(1), [
    'Mood: epic — energy 0.8, brightness 0.5.',
    'Mood words the director does not know were passed over: crunchy.',
    'Unknown kind of section “solo” — taken as a verse.',
  ]);
  const brief = decided({ style: 'auto', mood: ['calm'] }, { by: 'rule' });
  assert.equal(brief.notes[1], 'Mood from the brief: calm — energy 0.25, brightness 0.5.');
});

test('the prompt offers exactly what the generator can write, and shows the timeline', () => {
  const system = scoreSystemPrompt();
  assert.match(system, /Reply with ONE JSON object and nothing else/);
  for (const style of STYLES)
    assert.ok(system.includes(`${style.id} (${style.description})`), style.id);
  assert.match(system, /intro \(a quiet opening\), verse \(the main body\), lift \(/);
  assert.match(system, /\n {2}calm, quiet, gentle, /);
  assert.match(system, /Never write notes, chords, bars, times, instruments or settings\.$/);
  const directive = { prompt: 'calm, picks up at the reveal', params: params() };
  const format = { name: 'Main Edit', width: 1920, height: 1080, aspectRatio: '16:9', fps: 30 };
  const point = { time: 12, weight: 3, kind: 'marker', label: 'Reveal' };
  const asked = scorePrompt({ directive, format, seen: seen({ points: [point] }) });
  assert.equal(asked.system, system);
  assert.equal(
    asked.user,
    [
      'TIMELINE',
      'Main Edit: 1920x1080 (16:9, landscape), 30 fps.',
      'Length to score: 40 seconds (the whole timeline).',
      'Pace: 4 cuts a minute.',
      'Turning points:',
      '  0:12 marker “Reveal”',
      'Speech: none.',
      '',
      'REQUEST',
      'Style: choose the one that suits the timeline and the request.',
      'Energy: the editor set 0.5 on a scale from 0 (a quiet bed) to 1 (everything the style ' +
        'has); your sections move around that.',
      'What the editor asked for: calm, picks up at the reveal',
      '',
      'Reply with the JSON score plan.',
    ].join('\n'),
  );
  const fixed = { prompt: '', params: params({ style: 'lofi', bpm: 80, key: 'D' }) };
  const told = scorePrompt({ directive: fixed, format, seen: seen() }).user;
  assert.match(told, /\nStyle: lofi \(the editor chose it; use it\)\.\n/);
  assert.match(
    told,
    /\nTempo: 80 BPM \(the editor chose it\)\.\nKey: D \(the editor chose it\)\.\n/,
  );
  assert.match(told, /\nThe editor gave no further direction: choose what suits the timeline\.\n/);
});
