import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SCENES, MAX_TITLE } from '#utils/director/motion/planSchema.js';
import { THEMES, getTheme, themeIds } from '#utils/director/motion/themes.js';
import { vocabulary } from '#utils/director/motion/vocab.js';
import { briefScenes, lineScene, tidyText } from './brief.js';
import { completePlan } from './complete.js';
import { normalizeMotionPlan, tidyName } from './normalize.js';
import { parseMotionPlan, salvageMotionPlan } from './parse.js';

const BRIEF = `Made from nothing | no footage, only layers
Every number can move

- Keyframes — eased
2. Start here`;

test('brief: every non-empty line is a scene; " | " or a dash starts the subtitle', () => {
  const { scenes, notes } = briefScenes(BRIEF);
  assert.deepEqual(scenes, [
    { title: 'Made from nothing', subtitle: 'no footage, only layers' },
    { title: 'Every number can move' },
    { title: 'Keyframes', subtitle: 'eased' },
    { title: 'Start here' },
  ]);
  assert.deepEqual(notes, []);
  assert.deepEqual(lineScene('Fast – and free'), { title: 'Fast', subtitle: 'and free' });
  assert.deepEqual(lineScene('a -- b | c'), { title: 'a', subtitle: 'b | c' });
  assert.deepEqual(lineScene('well-known half-truths'), { title: 'well-known half-truths' });
  assert.deepEqual(lineScene('## Heading   with   spaces'), { title: 'Heading with spaces' });
  assert.deepEqual(lineScene('* | only a subtitle'), { title: 'only a subtitle' });
  assert.equal(lineScene('  -  '), null);
  assert.deepEqual(briefScenes('\n  \r\n').scenes, []);
  assert.deepEqual(briefScenes('One\r\nTwo').scenes, [{ title: 'One' }, { title: 'Two' }]);
});

test('brief: a single long line is split at its sentences, and limits are kept', () => {
  const one = briefScenes('Welcome to the show. We made this from nothing at all! Enjoy it.');
  assert.deepEqual(
    one.scenes.map((s) => s.title),
    ['Welcome to the show.', 'We made this from nothing at all!', 'Enjoy it.'],
  );
  assert.match(one.notes[0], /split into 3 scenes/);
  assert.equal(briefScenes('Just one short line. Really.').scenes.length, 1);

  const many = briefScenes(Array.from({ length: 55 }, (_, i) => `Line ${i + 1}`).join('\n'));
  assert.equal(many.scenes.length, MAX_SCENES);
  assert.match(many.notes[0], /first 40 of 55 lines/);

  const long = briefScenes(`${'word '.repeat(80)}\nShort`);
  assert.ok(long.scenes[0].title.length <= MAX_TITLE && long.scenes[0].title.endsWith('…'));
  assert.match(long.notes.join(' '), /shortened/);
  assert.equal(tidyText('  a \n b  ', 10), 'a b');
  assert.equal(tidyText('abcdefghij klmno', 12), 'abcdefghij…');
});

const WORDS = { scenes: briefScenes(BRIEF).scenes };

test('complete: every choice is made, from the vocabularies, the same for the same seed', () => {
  const names = vocabulary();
  for (const theme of themeIds()) {
    for (const seed of [1, 2, 3, 17]) {
      const { plan, notes } = completePlan(WORDS, { theme, seed });
      assert.deepEqual(notes, []);
      assert.equal(plan.theme, theme);
      assert.ok(['center', 'left'].includes(plan.align));
      assert.equal(plan.scenes.length, 4);
      for (const scene of plan.scenes) {
        for (const [field, list] of Object.entries(names)) {
          assert.ok(list.includes(scene[field]), `${theme}/${seed}: ${field} ${scene[field]}`);
        }
        assert.equal(scene.look, getTheme(theme).look);
      }
      // The words are passed through untouched, and nothing invents a duration.
      assert.deepEqual(
        plan.scenes.map(({ title, subtitle }) => ({ title, ...(subtitle && { subtitle }) })),
        WORDS.scenes,
      );
      assert.ok(plan.scenes.every((scene) => !('duration' in scene)));
      assert.equal(plan.scenes[0].background, getTheme(theme).backgrounds[0], 'signature first');
      assert.equal(plan.scenes[0].transition, 'fade', 'opens from black');
      assert.deepEqual(completePlan(WORDS, { theme, seed }).plan, plan);
    }
  }
});

test('complete: different seeds give recognisably different pieces', () => {
  const key = (/** @type {any} */ plan) => JSON.stringify(plan);
  // With the theme left to the seed, neighbouring seeds never share a theme.
  for (let seed = 1; seed < 40; seed++) {
    const a = completePlan(WORDS, { seed }).plan;
    const b = completePlan(WORDS, { seed: seed + 1 }).plan;
    assert.notEqual(a.theme, b.theme, `seeds ${seed} and ${seed + 1}`);
  }
  // Within one theme the seed still moves several choices.
  for (const theme of themeIds()) {
    const plans = Array.from({ length: 12 }, (_, i) => completePlan(WORDS, { theme, seed: i + 1 }));
    assert.ok(new Set(plans.map((p) => key(p.plan))).size >= 6, `${theme}: too few variations`);
  }
  assert.deepEqual(
    completePlan(WORDS, { seed: 'spring' }).plan,
    completePlan(WORDS, { seed: 'spring' }).plan,
  );
});

test('complete: what a plan chose is kept; unknown names fall back and are reported', () => {
  const raw = {
    theme: 'neon',
    align: 'left',
    scenes: [
      { title: 'One', background: 'noise', particles: 'snow', accent: 'none', look: 'cinematic' },
      { title: 'Two', background: 'lava', transition: 'star-wipe', textAnimation: 'explode' },
      { title: 'Three', textAnimation: 'typewriter', duration: 6, by: 'glyph' },
    ],
  };
  const { plan, notes } = completePlan(raw, { seed: 4 });
  assert.equal(plan.theme, 'neon');
  assert.equal(plan.align, 'left');
  const [one, two, three] = plan.scenes;
  assert.deepEqual(
    [one.background, one.particles, one.accent, one.look],
    ['noise', 'snow', 'none', 'cinematic'],
  );
  const neon = getTheme('neon');
  assert.ok(neon.backgrounds.includes(two.background));
  assert.ok(neon.transitions.includes(two.transition));
  assert.ok(neon.animations.some(([animation]) => animation === two.textAnimation));
  assert.equal(three.textAnimation, 'typewriter');
  assert.equal(three.by, 'char', 'a typewriter types characters unless told otherwise');
  assert.equal(three.duration, 6);
  assert.deepEqual(notes, [
    `Scene 2: unknown background “lava” — ${two.background} is used instead.`,
    `Scene 2: unknown textAnimation “explode” — ${two.textAnimation} is used instead.`,
    `Scene 2: unknown transition “star-wipe” — ${two.transition} is used instead.`,
    'Scene 3: unknown by “glyph” — char is used instead.',
  ]);
});

test('complete: the action’s parameters override the plan', () => {
  const raw = { theme: 'neon', scenes: [{ title: 'One', particles: 'snow' }, { title: 'Two' }] };
  const forced = completePlan(raw, { theme: 'paper', seed: 2, particles: 'rain' });
  assert.equal(forced.plan.theme, 'paper');
  assert.deepEqual(
    forced.plan.scenes.map((s) => s.particles),
    ['rain', 'rain'],
  );
  assert.match(forced.notes.join(' '), /Particles were set to rain for every scene/);
  const none = completePlan(raw, { particles: 'none' });
  assert.ok(none.plan.scenes.every((s) => s.particles === 'none'));
  assert.equal(completePlan(raw, { theme: 'auto', particles: 'auto' }).plan.theme, 'neon');
  const unknown = completePlan({ theme: 'vaporwave', align: 'right', scenes: raw.scenes }, {});
  assert.equal(unknown.plan.theme, THEMES[0].id);
  assert.match(unknown.notes[0], /Unknown theme “vaporwave” — Midnight was chosen/);
  assert.match(unknown.notes[1], /Unknown align “right”/);
});

test('normalize: synonymous keys, bare lists, wrappers and loosely written names', () => {
  assert.equal(tidyName(' Slide Up '), 'slide-up');
  assert.equal(tidyName('gradient_drift', 'background'), 'gradient');
  assert.equal(tidyName('Radial', 'background'), 'spotlight');
  assert.equal(tidyName('Radial', 'transition'), 'radial');
  assert.equal(tidyName(false, 'particles'), 'none');
  assert.equal(tidyName('off', 'transition'), 'cut');
  assert.equal(tidyName(7), 7);
  assert.deepEqual(normalizeMotionPlan(['One', { text: 'Two', caption: 'more' }]), {
    scenes: [{ title: 'One' }, { title: 'Two', subtitle: 'more' }],
  });
  const wrapped = normalizeMotionPlan({
    plan: {
      Theme: 'ignored',
      theme: ' Neon ',
      align: 'Centre',
      slides: [
        {
          heading: '  Hello\n world ',
          tagline: '',
          bg: 'Dots',
          animation: 'Type Writer',
          unit: 'Letter',
          transition: 'Dissolve',
          particles: false,
          seconds: '4s',
          colour: '#ff0000',
        },
      ],
    },
  });
  assert.deepEqual(wrapped, {
    theme: 'neon',
    align: 'center',
    scenes: [
      {
        title: 'Hello world',
        background: 'dots',
        particles: 'none',
        textAnimation: 'type-writer',
        by: 'char',
        transition: 'fade',
        duration: 4,
      },
    ],
  });
  assert.deepEqual(normalizeMotionPlan({ scenes: { title: 'Alone' } }), {
    scenes: [{ title: 'Alone' }],
  });
  assert.deepEqual(normalizeMotionPlan({ scenes: 'three' }), { scenes: 'three' });
  assert.deepEqual(normalizeMotionPlan('nope'), 'nope');
  assert.deepEqual(normalizeMotionPlan({ note: 'no scenes' }), {});
});

test('parse: fences, prose, reasoning and malformed JSON still give a plan', () => {
  const chatty = [
    '<think>Maybe {"scenes": []}? No.</think>',
    'Here is the plan:',
    '```json',
    '{ "theme": "pop", "scenes": [ { "title": "One", }, { "title": "Two", "duration": "3s" } ], }',
    '```',
    'Hope that helps!',
  ].join('\n');
  const parsed = parseMotionPlan(chatty);
  assert.equal(parsed.ok, true);
  if (parsed.ok !== true) return;
  assert.equal(parsed.repaired, true);
  assert.deepEqual(parsed.plan, {
    theme: 'pop',
    scenes: [{ title: 'One' }, { title: 'Two', duration: 3 }],
  });
  assert.deepEqual(parseMotionPlan('{"scenes":[{"title":"A"}]}'), {
    ok: true,
    plan: { scenes: [{ title: 'A' }] },
    repaired: false,
  });
  assert.deepEqual(parseMotionPlan('I cannot do that.'), {
    ok: false,
    errors: ['the reply contained no JSON object'],
  });
  const bad = parseMotionPlan(
    '{"scenes":[{"subtitle":"no title"},{"title":"x","duration":"soon"}]}',
  );
  assert.equal(bad.ok, false);
  if (bad.ok !== false) return;
  assert.deepEqual(bad.errors, [
    "scenes[0] must have required property 'title'",
    'scenes[1].duration must be number',
  ]);
  assert.match(parseMotionPlan('{"theme":"pop"}').errors?.[0], /required property 'scenes'/);
});

test('salvage: usable scenes are kept without their unusable fields', () => {
  const reply = JSON.stringify({
    theme: 12,
    scenes: [
      { subtitle: 'no title' },
      { title: 'Kept', duration: 'soon', background: 'dots' },
      7,
      { title: 'Also kept', subtitle: 'fine' },
    ],
  });
  assert.deepEqual(salvageMotionPlan(reply), {
    plan: {
      scenes: [
        { title: 'Kept', background: 'dots' },
        { title: 'Also kept', subtitle: 'fine' },
      ],
    },
    dropped: [
      "scene 1: must have required property 'title'",
      'scene 2: duration must be number',
      'scene 3: must be object',
    ],
  });
  assert.equal(salvageMotionPlan('{"scenes":[{"subtitle":"x"}]}'), null);
  assert.equal(salvageMotionPlan('no json'), null);
});
