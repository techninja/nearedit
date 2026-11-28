import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_PLAN_EXAMPLE, DEMO_VERBS } from '#utils/director/web/planSchema.js';
import { normalizeDemoPlan, tidyVerb } from './normalize.js';
import { parseDemoPlan, salvageDemoPlan } from './parse.js';
import { correctionPrompt } from './request.js';

const stops = (reply) => {
  const parsed = parseDemoPlan(reply);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  return parsed.plan.stops;
};

test('a clean plan is read as it is', () => {
  const parsed = parseDemoPlan(JSON.stringify(DEMO_PLAN_EXAMPLE));
  assert.deepEqual(parsed, { ok: true, plan: DEMO_PLAN_EXAMPLE, repaired: false });
});

test('verbs a model writes its own way are read like the lines of a brief', () => {
  const same = {
    click: ['Click', 'tap', 'push', 'click on', 'CLICK_ON'],
    hover: ['hover', 'Hover over', 'mouseover', 'mouse over'],
    type: ['type', 'fill', 'input', 'enter'],
    scroll: ['scroll', 'scroll to', 'Scroll-To', 'show', 'look at'],
    focus: ['focus', 'zoom', 'zoom in', 'Zoom in on', 'focus on'],
    highlight: ['highlight', 'outline', 'point out'],
    goto: ['goto', 'go to', 'navigate', 'visit', 'GoTo'],
    wait: ['wait', 'pause', 'sleep', 'delay'],
    press: ['keypress', 'key'],
    select: ['select'],
  };
  for (const [verb, words] of Object.entries(same)) {
    for (const word of words) assert.equal(tidyVerb(word), verb, word);
  }
  assert.deepEqual(Object.keys(same).sort(), [...DEMO_VERBS].sort());
  assert.equal(tidyVerb('teleport'), 'teleport', 'an unknown verb is left for validation');
  assert.equal(tidyVerb(7), 7);
});

test('harmless deviations are forgiven: other keys, a bare list, a wrapper, sentences', () => {
  assert.deepEqual(
    stops(
      '{"plan": {"steps": [{"action": "Tap", "target": "Pricing", "caption": " Plans "}, {"verb": "type", "element": "Email", "value": "a@b.c"}]}}',
    ),
    [
      { do: 'click', on: 'Pricing', say: 'Plans' },
      { do: 'type', on: 'Email', text: 'a@b.c' },
    ],
  );
  assert.deepEqual(stops('[{"do": "wait", "seconds": 2}, {"do": "press", "key": "Enter"}]'), [
    { do: 'wait', text: '2' },
    { do: 'press', text: 'Enter' },
  ]);
  assert.deepEqual(
    stops('{"stops": ["click Pricing | plans", "zoom in on the chart", "Simple pricing"]}'),
    [
      { do: 'click', on: 'Pricing', say: 'plans' },
      { do: 'focus', on: 'chart' },
      { do: 'scroll', on: 'Simple pricing', say: 'Simple pricing' },
    ],
  );
  const plan = normalizeDemoPlan({ headline: ' Hello ', actions: [{ do: 'goto', url: '/docs' }] });
  assert.deepEqual(plan, { stops: [{ do: 'goto', text: '/docs' }], title: 'Hello' });
  assert.deepEqual(normalizeDemoPlan({ stops: 'none' }), { stops: 'none' });
  assert.equal(normalizeDemoPlan(null), null);
});

test('a chatty, fenced, malformed reply is dug out and repaired', () => {
  const reply = [
    '<think>Start at the top. {"stops": []}</think>Here is the plan:',
    '```json',
    "{title: 'Tour', stops: [{do: 'scroll', on: 'Features',}, {do: 'click', on: 'Yearly' 'say': 'Save'},]}",
    '```',
    'Let me know!',
  ].join('\n');
  const parsed = parseDemoPlan(reply);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(parsed.repaired, true);
  assert.equal(parsed.plan.title, 'Tour');
  assert.deepEqual(parsed.plan.stops, [
    { do: 'scroll', on: 'Features' },
    { do: 'click', on: 'Yearly', say: 'Save' },
  ]);
  // Cut off in the middle: the retry is asked for, and failing that, what is whole is kept.
  const cut = '{"stops": [{"do": "hover", "on": "Get started"}, {"do": "cli';
  assert.equal(parseDemoPlan(cut).ok, false);
  assert.deepEqual(salvageDemoPlan(cut).plan.stops, [{ do: 'hover', on: 'Get started' }]);
});

test('what cannot be a plan is refused with errors a model can act on', () => {
  const errors = (reply) => {
    const parsed = parseDemoPlan(reply);
    assert.equal(parsed.ok, false, reply);
    return parsed.errors.join('\n');
  };
  assert.match(errors('I cannot help with that.'), /no JSON object/);
  assert.match(errors('{"note": "nothing"}'), /must have required property 'stops'/);
  assert.match(errors('{"stops": []}'), /stops must NOT have fewer than 1 items/);
  assert.match(
    errors('{"stops": [{"do": "teleport", "on": "Mars"}]}'),
    /stops\[0\]\.do must be equal to one of the allowed values: wait, hover, click/,
  );
  assert.match(
    errors('{"stops": [{"do": "run", "text": "alert(1)"}]}'),
    /stops\[0\]\.do must be equal/,
  );
  assert.match(
    errors('{"stops": [{"do": "click"}, {"do": "type", "on": "Email"}]}'),
    /stops\[0\]: click needs "on".*\nstops\[1\]: type needs "text": the text/,
  );
  assert.match(
    errors('{"stops": [{"do": "click", "on": {"selector": "#a"}}]}'),
    /stops\[0\]\.on must be string/,
  );
  const prompt = correctionPrompt(['stops[0]: click needs "on"']);
  assert.match(
    prompt,
    /could not be used as a demo plan:\n- stops\[0\]: click needs "on"\nReply again with ONE corrected JSON object/,
  );
});

test('after a failed retry the stops that can be played are kept, the rest named', () => {
  const reply = JSON.stringify({
    title: 'Mixed',
    stops: [
      { do: 'click', on: 'Pricing' },
      { do: 'teleport', on: 'Mars' },
      { do: 'type', on: 'Email' },
      'hover Get started',
      { do: 'run', text: 'alert(1)' },
      42,
    ],
  });
  assert.equal(parseDemoPlan(reply).ok, false);
  const kept = salvageDemoPlan(reply);
  assert.deepEqual(kept.plan, {
    stops: [
      { do: 'click', on: 'Pricing' },
      { do: 'hover', on: 'Get started' },
    ],
    title: 'Mixed',
  });
  assert.equal(kept.dropped.length, 4);
  assert.match(kept.dropped[0], /^stop 2: do must be equal to one of the allowed values/);
  assert.match(kept.dropped[1], /^stop 3: type needs "text"/);
  assert.match(kept.dropped[3], /^stop 6: must be object/);
  assert.equal(salvageDemoPlan('{"stops": [{"do": "teleport"}]}'), null);
  assert.equal(salvageDemoPlan('no plan here'), null);
  const many = { stops: Array.from({ length: 60 }, () => ({ do: 'wait' })) };
  assert.equal(salvageDemoPlan(JSON.stringify(many)).plan.stops.length, 40);
});
