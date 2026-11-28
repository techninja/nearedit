import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEP_KINDS, validateRecipe } from '#utils/web/index.js';
import { HOME_PAGE } from '../../../api/director/web/testing/page.js';
import { ENOUGH, cleanName, matchElement, nameFit } from './match.js';
import { callToAction, pagePlaces, scrollFor, sectionOf, tourStops } from './places.js';
import { DEMO_VERBS } from './planSchema.js';
import { fallbackTarget, scrollWord, stopStep } from './steps.js';
import { centring, sightAfter, topOfPage } from './view.js';

const VIEW = { width: 1280, height: 720 };
const PAGE = { elements: [...HOME_PAGE], viewport: VIEW };
const el = (name, kind) => HOME_PAGE.find((e) => e.name === name && (!kind || e.kind === kind));
const found = (verb, said) => {
  const match = matchElement(said, PAGE.elements, verb);
  return match ? `${match.element.kind} ${match.element.name}` : null;
};

test('a name is cleaned of quotes, articles and the word that only says its kind', () => {
  assert.deepEqual(cleanName('the “Pricing” link'), { name: 'Pricing', kinds: ['link', 'button'] });
  assert.deepEqual(cleanName('the Email field'), { name: 'Email', kinds: ['input'] });
  assert.deepEqual(cleanName('Get started'), { name: 'Get started', kinds: [] });
  assert.deepEqual(
    cleanName('button'),
    { name: 'button', kinds: [] },
    'a kind word alone is a name',
  );
  assert.deepEqual(cleanName('  '), { name: '', kinds: [] });
});

test('names fit exactly, then by case, spelling, part and shared words', () => {
  const fit = (a, b) => nameFit(a, b);
  assert.deepEqual(fit('Pricing', 'Pricing'), { quality: 1, how: 'exact' });
  assert.equal(fit('pricing', 'Pricing').how, 'case');
  assert.equal(fit('Sign-in', 'Sign in').how, 'spelling');
  assert.equal(fit('chart', 'Readers chart').how, 'part');
  assert.equal(fit('Our plans', 'Starter plan').how, 'words');
  const order = [fit('Pricing', 'Pricing'), fit('pricing', 'Pricing'), fit('Sign-in', 'Sign in')];
  order.push(fit('chart', 'Readers chart'), fit('Readers chart of the week', 'chart'));
  order.push(fit('Our plans', 'Starter plan'));
  for (let i = 1; i < order.length; i++) assert.ok(order[i].quality < order[i - 1].quality, `${i}`);
  assert.ok(order.at(-1).quality >= ENOUGH);
  assert.equal(fit('Testimonials', 'Pricing').quality, 0);
  assert.equal(
    fit('People love it', 'Changelogs people actually read').quality,
    0,
    'one word of four',
  );
  assert.equal(fit('', 'x').quality, 0);
});

test('the verb says which kind of thing is meant', () => {
  // The same name, another element.
  assert.equal(found('click', 'Pricing'), 'link Pricing');
  assert.equal(found('scroll', 'Pricing'), 'section Pricing');
  assert.equal(found('focus', 'Pricing'), 'section Pricing');
  assert.equal(found('scroll', 'the Pricing heading'), 'heading Pricing');
  assert.equal(found('hover', 'the Get started button'), 'link Get started');
  assert.equal(found('highlight', 'Pro'), 'section Pro plan', 'the card, not its heading');
  assert.equal(found('highlight', 'the Pro heading'), 'heading Pro');
  assert.equal(found('click', 'Choose pro'), 'link Choose Pro');
  assert.equal(found('focus', 'the chart'), 'image Readers chart');
  // Typing and choosing only ever go to a field.
  assert.equal(found('type', 'the Email field'), 'input Email');
  assert.equal(found('select', 'Team size'), 'input Team size Just me 2 to 10 11 to 50');
  assert.equal(found('type', 'Pricing'), null);
  assert.equal(found('type', 'Name'), null);
  // A sentence finds the heading it talks about; nothing is found for nothing.
  assert.equal(found('scroll', 'Simple pricing for every team'), 'section Pricing');
  assert.equal(found('scroll', 'We love our customers'), null);
  assert.equal(found('click', 'Testimonials'), null);
  assert.equal(found('click', ''), null);
  assert.equal(matchElement('Pricing', [], 'click'), null);
  // Among equals, the first on the page.
  const twins = [el('Pricing', 'link'), { ...el('Pricing', 'link'), target: 'second' }];
  assert.equal(matchElement('Pricing', twins, 'click').element.target, 'a[href="#pricing"]');
});

test('a tour stops at the first heading of every stretch and ends on the call to action', () => {
  assert.deepEqual(
    pagePlaces(PAGE.elements, VIEW).map((place) => place.name),
    ['Changelogs people actually read', 'Features', 'Pricing', 'Create your account'],
  );
  assert.equal(callToAction(PAGE.elements).name, 'Create account', 'the lowest of the strong ones');
  assert.equal(callToAction(PAGE.elements.slice(0, 20)).name, 'Get started');
  assert.equal(callToAction([el('Docs'), el('Pricing', 'heading')]), null);
  const names = (tour) => tour.stops.map((stop) => `${stop.do} ${stop.on}`);
  const all = tourStops(PAGE.elements, VIEW);
  assert.deepEqual(names(all), [
    'scroll Features',
    'scroll Pricing',
    'scroll Create your account',
    'hover Create account',
    'focus Create account',
  ]);
  assert.deepEqual([all.places, all.left], [3, 0]);
  const two = tourStops(PAGE.elements, VIEW, 2);
  assert.deepEqual(names(two).slice(0, 2), ['scroll Features', 'scroll Create your account']);
  assert.equal(two.left, 1);
  assert.deepEqual(names(tourStops(PAGE.elements, VIEW, 1))[0], 'scroll Create your account');
  assert.deepEqual(
    names(tourStops([el('Docs')], VIEW)),
    ['scroll bottom'],
    'a page with nothing to stop at',
  );
});

test('a scroll shows a section from its top, a lone heading clear of the menu, a small thing in the middle', () => {
  const to = (name, kind) => scrollFor(el(name, kind), PAGE.elements, VIEW);
  assert.deepEqual(to('Features', 'section'), { to: '#features', align: 'start' });
  assert.deepEqual(to('Features', 'heading'), { to: '#features', align: 'start' });
  assert.equal(sectionOf(el('Pro', 'heading'), PAGE.elements, VIEW).name, 'Pro plan');
  assert.deepEqual(to('Pro', 'heading'), { to: 1504 - 144, align: 'start' });
  assert.deepEqual(to('Readers chart'), { to: 'svg[aria-label="Readers chart"]', align: 'center' });
});

test('a stop becomes a step that the recipe library accepts', () => {
  const step = (stop, name, kind) => stopStep(stop, name ? el(name, kind) : null, PAGE);
  assert.deepEqual(step({ do: 'click', on: 'Yearly', say: 'Save' }, 'Yearly'), {
    do: 'click',
    note: 'Save',
    target: 'text=Yearly',
  });
  assert.deepEqual(step({ do: 'type', on: 'Email', text: ' hi ' }, 'Email'), {
    do: 'type',
    note: '',
    target: 'label=Email',
    text: 'hi',
  });
  assert.deepEqual(step({ do: 'type', text: 'hi' }), { do: 'type', note: '', text: 'hi' });
  assert.deepEqual(step({ do: 'select', on: 'Plan', text: 'Pro' }), {
    do: 'select',
    note: '',
    target: 'label=Plan',
    value: 'Pro',
  });
  assert.deepEqual(step({ do: 'press', text: 'Control+k' }), {
    do: 'press',
    note: '',
    key: 'k',
    modifiers: ['Control'],
  });
  assert.deepEqual(step({ do: 'press', text: 'esc' }), {
    do: 'press',
    note: '',
    key: 'Escape',
    modifiers: [],
  });
  assert.deepEqual(step({ do: 'goto', text: '/docs.html' }), {
    do: 'goto',
    note: '',
    url: '/docs.html',
  });
  assert.deepEqual(step({ do: 'wait', text: '2' }), { do: 'wait', note: '', duration: 2 });
  assert.deepEqual(step({ do: 'wait', text: '900' }), { do: 'wait', note: '', duration: 60 });
  assert.deepEqual(step({ do: 'wait' }), { do: 'wait', note: '' });
  assert.deepEqual(step({ do: 'highlight', on: 'Pro', text: 'Spotlight' }, 'Pro plan'), {
    do: 'highlight',
    note: '',
    target: 'article[aria-label="Pro plan"]',
    style: 'spotlight',
  });
  assert.equal(step({ do: 'highlight', on: 'Pro', text: 'sparkly' }, 'Pro plan').style, undefined);
  assert.deepEqual(step({ do: 'scroll', on: 'the Top' }), { do: 'scroll', note: '', to: 'top' });
  assert.deepEqual(step({ do: 'scroll', on: 'down' }), { do: 'scroll', note: '', by: 576 });
  assert.deepEqual(step({ do: 'scroll', on: 'up', text: '300' }), {
    do: 'scroll',
    note: '',
    by: -300,
  });
  assert.deepEqual(step({ do: 'scroll', on: 'Reviews' }), {
    do: 'scroll',
    note: '',
    to: 'text=Reviews',
    align: 'center',
  });
  assert.equal(scrollWord('the very bottom of the page'), 'bottom');
  assert.equal(scrollWord('Top stories'), '');
  assert.equal(fallbackTarget({ do: 'type', on: 'the Name field' }), 'label=Name');
  assert.equal(fallbackTarget({ do: 'click', on: '“Sign in”' }), 'text=Sign in');
  // Every kind of stop makes a step of its own kind that would record.
  const samples = { on: 'Pricing', text: 'Enter' };
  for (const verb of DEMO_VERBS) {
    const made = step(
      { do: verb, ...samples, ...(verb === 'wait' && { text: '1' }) },
      'Pricing',
      'section',
    );
    assert.equal(made.do, verb);
    assert.deepEqual(
      validateRecipe({ url: 'https://example.com', steps: [made] }).problems,
      [],
      verb,
    );
  }
  assert.ok(STEP_KINDS.length > DEMO_VERBS.length);
});

test('what the camera goes close to is scrolled to the middle first — only when it needs it', () => {
  const page = { viewport: VIEW, height: 2516 };
  const click = (name) => ({ do: 'click', target: el(name).target });
  let sight = topOfPage();
  // In the middle of the opening view: nothing to do.
  assert.equal(centring(sight, click('Get started'), el('Get started'), page, true), null);
  // At the top of the page, where no scroll could centre it: nothing to do either.
  assert.equal(centring(sight, click('Docs'), el('Docs'), page, true), null);
  sight = sightAfter(
    sight,
    { do: 'scroll', to: '#features', align: 'start' },
    el('Features', 'section'),
    page,
  );
  assert.deepEqual(sight, { y: 535, known: true });
  // The chart is in view and near enough the middle.
  const chart = el('Readers chart');
  assert.equal(centring(sight, { do: 'focus', target: chart.target }, chart, page, false), null);
  // The section's heading is in view, but high: the camera could not centre it.
  const card = el('Features', 'heading');
  const focus = { do: 'focus', target: card.target, note: 'Look' };
  const move = centring(sight, focus, card, page, false);
  assert.deepEqual(move, {
    ...{ do: 'scroll', to: card.target, align: 'center' },
    ...{ duration: 0.7, hold: 0.1, note: 'Look' },
  });
  sight = sightAfter(sight, move, card, page);
  assert.deepEqual(sight, { y: 607 + 26.5 - 360, known: true });
  assert.equal(centring(sight, focus, card, page, false), null);
  // Clicks are only the camera's business when it zooms on clicks; a hover never is.
  const high = { do: 'click', target: card.target };
  sight = { y: 590, known: true };
  assert.equal(centring(sight, high, card, page, false), null);
  assert.ok(centring(sight, high, card, page, true));
  assert.equal(centring(sight, { do: 'hover', target: card.target }, card, page, true), null);
  // Out of view, the step itself brings its target to the middle.
  assert.equal(centring(sight, click('Yearly'), el('Yearly'), page, true), null);
  sight = sightAfter(sight, click('Create account'), el('Create account'), page);
  assert.deepEqual(sight, { y: 2516 - 720, known: true }, 'as far as the page goes');
  // After a link or a key the page may be anywhere: centre to be sure.
  const lost = sightAfter(topOfPage(), click('Pricing'), el('Pricing', 'link'), page);
  assert.equal(lost.known, false);
  assert.ok(centring(lost, click('Get started'), el('Get started'), page, true));
  assert.deepEqual(sightAfter(lost, { do: 'goto', url: '/x' }, null, page), topOfPage());
  assert.equal(
    sightAfter(topOfPage(), { do: 'click', target: 'text=Nope' }, null, page).known,
    false,
  );
  assert.deepEqual(sightAfter(sight, { do: 'scroll', by: -5000 }, null, page), topOfPage());
});
