import { test } from 'node:test';
import assert from 'node:assert/strict';
import { luminance } from '#utils/director/motion/color.js';
import { THEMES, getTheme } from '#utils/director/motion/themes.js';
import { siteDemo } from '../actions/siteDemo.js';
import { createCanvas } from '../../compose/index.js';
import { MAX_LOOKS, createSurvey } from './survey.js';
import { fakeRecorder } from './testing/fakeRecorder.js';
import { demoContext, scratchProject } from './testing/kit.js';
import { demoTheme, pageTone } from './theme.js';

/** A picture of a page: a ground, and a button's worth of an accent colour. */
function picture(ground, accent) {
  const canvas = createCanvas(640, 360);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, 640, 360);
  if (accent) {
    ctx.fillStyle = accent;
    ctx.fillRect(40, 200, 110, 40);
  }
  return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
}
const near = (hue, wanted) => Math.min(Math.abs(hue - wanted), 360 - Math.abs(hue - wanted)) < 12;

test('a page is seen from afar: light or dark, and the hue of its accents', async () => {
  const indigo = await pageTone(picture('#ffffff', '#4f46e5'));
  assert.equal(indigo.light, true);
  assert.ok(near(indigo.hue, 243), `${indigo.hue}`);
  const orange = await pageTone(picture('#fafafa', '#ea580c'));
  assert.ok(orange.light && near(orange.hue, 21), `${orange.hue}`);
  const night = await pageTone(picture('#0b1020', '#22c55e'));
  assert.ok(!night.light && near(night.hue, 142), `${night.hue}`);
  assert.deepEqual(
    await pageTone(picture('#f4f4f5', '')),
    { light: true, hue: null },
    'no colour, no hue',
  );
  assert.deepEqual(await pageTone(picture('#18181b', '#52525b')), { light: false, hue: null });
  for (const nothing of ['', undefined, 'data:image/png;base64,AAAA', 'https://example.com/a.png'])
    assert.equal(await pageTone(nothing), null);
});

test('auto takes a ground that sets the page off, close to its own colour', () => {
  const auto = (tone) => demoTheme('auto', tone);
  assert.equal(auto({ light: true, hue: 243 }).theme.id, 'midnight');
  assert.equal(auto({ light: true, hue: 20 }).theme.id, 'sunrise');
  assert.equal(auto({ light: true, hue: 170 }).theme.id, 'forest');
  assert.equal(auto({ light: true, hue: null }).theme.id, 'midnight', 'no hue to go by: the first');
  assert.equal(auto(null).theme.id, 'midnight');
  assert.match(
    auto({ light: true, hue: 243 }).why,
    /^auto: a dark ground for a light page, the closest to its own colour$/,
  );
  assert.equal(auto(null).why, 'auto: a dark ground for the page');
  // A dark page gets the light ground.
  const lit = auto({ light: false, hue: 142 });
  assert.equal(lit.theme.id, 'paper');
  assert.ok(luminance(lit.colors[1]) > 0.5);
  assert.match(lit.why, /^auto: a light ground for a dark page/);
  // A named theme is used as it is — in its colour way nearest the page.
  for (const theme of THEMES) {
    const named = demoTheme(theme.id, { light: true, hue: 243 });
    assert.equal(named.theme, theme);
    assert.ok(theme.backdrops.includes(named.colors));
    assert.equal(named.why, '');
  }
  const pop = getTheme('pop');
  assert.equal(
    demoTheme('pop', { light: true, hue: 225 }).colors,
    pop.backdrops[3],
    'the blue one',
  );
  assert.equal(
    demoTheme('pop', { light: true, hue: 345 }).colors,
    pop.backdrops[0],
    'the rose one',
  );
  assert.equal(demoTheme('pop', null).colors, pop.backdrops[0]);
  assert.equal(demoTheme('lava', null).theme.id, 'midnight', 'an unknown name is auto');
});

test('the page is looked at a few times at most; what comes after goes by its text', async () => {
  const recorder = fakeRecorder();
  const survey = createSurvey({
    base: { url: 'https://tideline.test/' },
    browser: '/b',
    snapshot: recorder.snapshot,
  });
  assert.deepEqual([survey.count(), survey.spent()], [0, false]);
  for (let i = 0; i < MAX_LOOKS; i++) await survey.look([{ do: 'wait' }]);
  assert.deepEqual([survey.count(), survey.spent()], [MAX_LOOKS, true]);
  // A demo that keeps clicking links uses its looks up; a new page after that is not read.
  const brief =
    'click Docs\nclick Pricing\nclick Features\nclick Sign in\ngo to /docs.html\nscroll to API keys';
  const busy = fakeRecorder();
  const result = await siteDemo(demoContext(scratchProject(), { prompt: brief }), busy);
  assert.equal(busy.looks.length, MAX_LOOKS);
  const steps = result.tracks[2].clips[0].web.recipe.steps;
  assert.equal(steps.at(-1).to, 'text=API keys');
  assert.match(result.notes.join('\n'), /The page was read again before stop 2, 3 and 4: /);
  assert.match(
    result.notes.join('\n'),
    /Stop 6 could not be matched to the page it happens on \(the page is read 4 times at most\): the recording looks for those names by their text\./,
  );
});
