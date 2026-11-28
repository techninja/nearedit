import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefStops, describeStop, readInstruction, readLine } from './brief.js';
import { readKey } from './keys.js';
import { DEMO_VERBS, MAX_SAY, MAX_STOPS } from './planSchema.js';
import { leadingQuote, splitCaption, tokens } from './words.js';

/**
 * Every phrasing of a row must read as the stop the row starts with:
 * `do on=… & text=… :: phrasing ;; phrasing`.
 */
const READS = `
click on=Pricing :: click Pricing ;; Click on Pricing. ;; tap the Pricing ;; press Pricing ;; open Pricing ;; then click Pricing ;; And then tap on the Pricing!
click on=Sign up button :: click the Sign up button ;; push the Sign up button ;; hit the Sign up button
click on=Yearly :: select Yearly ;; choose Yearly ;; pick the Yearly ;; switch to Yearly ;; toggle Yearly ;; double-click Yearly
hover on=Get started :: hover Get started ;; hover over Get started ;; mouse over the Get started ;; point at Get started ;; move the mouse to Get started ;; move to Get started
type on=Email & text=hello@example.com :: type hello@example.com into Email ;; enter hello@example.com in the Email ;; write "hello@example.com" into Email ;; fill Email with hello@example.com ;; fill in the Email with "hello@example.com"
type on=Origin field & text=made in France :: type "made in France" into the Origin field ;; type ‘made in France’ in the Origin field ;; fill the Origin field with made in France
type text=hello world :: type hello world ;; type "hello world" ;; write hello world
scroll on=Features :: scroll to Features ;; scroll down to the Features ;; go to Features ;; jump to Features ;; show me the Features ;; look at Features ;; back to Features
scroll on=top :: scroll to the top ;; scroll back to the top ;; scroll up to the top of the page ;; back to top
scroll on=bottom :: scroll to the bottom ;; scroll down to the end ;; scroll to bottom
scroll on=down :: scroll down ;; scroll ;; scroll down a bit ;; scroll down a screen
scroll on=up & text=300 :: scroll up 300 ;; scroll up 300px ;; scroll up 300 pixels
highlight on=Pro plan :: highlight the Pro plan ;; outline the Pro plan ;; circle Pro plan ;; point out the Pro plan ;; call out the Pro plan
highlight on=Pro plan & text=spotlight :: spotlight the Pro plan ;; put a spotlight on the Pro plan
focus on=chart :: zoom in on the chart ;; zoom into the chart ;; zoom on the chart ;; zoom to the chart ;; focus on the chart ;; close-up on the chart ;; closeup of the chart
press text=Enter :: press Enter ;; hit enter ;; press the Enter key ;; press return ;; tap Enter
press text=Control+k :: press Ctrl+K ;; hit ctrl-k ;; press control k
press text=Meta+Shift+p :: press Cmd+Shift+P ;; press Shift-Cmd-P
press text=ArrowDown :: press down ;; press the down arrow ;; press Arrow Down ;; hit ArrowDown
select on=Plan & text=Pro :: select Pro from Plan ;; choose Pro in the Plan ;; pick "Pro" from the Plan ;; set Plan to Pro ;; select the option Pro from Plan
select on=Team size menu & text=2 to 10 :: choose "2 to 10" in the Team size menu ;; set the Team size menu to 2 to 10
goto text=/pricing :: go to /pricing ;; goto /pricing ;; open /pricing ;; visit /pricing ;; navigate to /pricing ;; go to the page /pricing ;; load /pricing
goto text=https://example.com/docs :: open https://example.com/docs ;; visit example.com/docs ;; go to "https://example.com/docs"
wait text=2 :: wait 2 ;; wait 2s ;; wait for 2 seconds ;; pause 2 sec ;; hold for about 2 seconds ;; pause 2000ms
wait text=0.5 :: wait half a second ;; pause for 0.5 ;; wait 500 ms
wait :: wait ;; pause ;; Wait.`
  .trim()
  .split('\n')
  .map((row) => {
    const [stop, phrasings] = row.split(' :: ');
    const [verb, rest = ''] = stop.split(/ (.*)/s);
    const fields = rest ? rest.split(' & ') : [];
    const pairs = fields.map((field) => field.split(/=(.*)/s).slice(0, 2));
    return [{ do: verb, ...Object.fromEntries(pairs) }, ...phrasings.split(' ;; ')];
  });

test('every verb is read in its many wordings', () => {
  for (const [stop, ...lines] of READS) {
    for (const line of lines) assert.deepEqual(readInstruction(line), stop, line);
  }
  const read = new Set(READS.map(([stop]) => stop.do));
  assert.deepEqual([...read].sort(), [...DEMO_VERBS].sort(), 'every kind of stop can be asked for');
});

test('wording is read generously, meaning strictly', () => {
  // A key only when it is one; an address only when it looks like one.
  assert.deepEqual(readInstruction('press Sign up'), { do: 'click', on: 'Sign up' });
  assert.deepEqual(readInstruction('press the X button'), { do: 'click', on: 'X button' });
  assert.deepEqual(readInstruction('go to Pricing'), { do: 'scroll', on: 'Pricing' });
  assert.deepEqual(readInstruction('open the menu'), { do: 'click', on: 'menu' });
  assert.deepEqual(readInstruction('select Pro'), { do: 'click', on: 'Pro' });
  // Quotes keep words that would otherwise split the sentence.
  assert.deepEqual(readInstruction('type made in France'), {
    do: 'type',
    text: 'made',
    on: 'France',
  });
  assert.deepEqual(readInstruction('type "made in France"'), {
    do: 'type',
    text: 'made in France',
  });
  assert.deepEqual(readInstruction('click "Sign in"'), { do: 'click', on: 'Sign in' });
  // Not instructions.
  for (const line of [
    'Simple pricing for every team',
    'wait for the page',
    'We click with people',
    '',
  ])
    assert.equal(readInstruction(line), null, line);
  assert.deepEqual(readKey('Enter'), { key: 'Enter', modifiers: [] });
  assert.deepEqual(readKey('alt shift f4'), { key: 'F4', modifiers: ['Alt', 'Shift'] });
  assert.deepEqual(readKey('?'), { key: '?', modifiers: [] });
  assert.equal(readKey('Sign up'), null);
  assert.equal(readKey('the big button'), null);
});

test('a caption follows a bar or a dash; list marks are dropped', () => {
  const said = (line) => readLine(line).stop;
  assert.deepEqual(said('click Pricing | plans for every team'), {
    do: 'click',
    on: 'Pricing',
    say: 'plans for every team',
  });
  assert.deepEqual(said('click Yearly — two months free'), {
    do: 'click',
    on: 'Yearly',
    say: 'two months free',
  });
  assert.deepEqual(said('- hover Get started -- try it'), {
    do: 'hover',
    on: 'Get started',
    say: 'try it',
  });
  assert.deepEqual(said('3. press Enter – and you are in'), {
    do: 'press',
    text: 'Enter',
    say: 'and you are in',
  });
  assert.deepEqual(said('* type "a | b" into Notes | piped'), {
    do: 'type',
    on: 'Notes',
    text: 'a | b',
    say: 'piped',
  });
  assert.deepEqual(said('| only a caption'), { do: 'wait', say: 'only a caption' });
  assert.equal(said(`click A | ${'word '.repeat(60)}`).say.length <= MAX_SAY, true);
  for (const nothing of ['', '   ', '-', '* ', '—', '|'])
    assert.equal(readLine(nothing), null, nothing);
  assert.deepEqual(splitCaption('a — b | c'), { head: 'a', caption: 'b | c' });
  assert.deepEqual(splitCaption("the user's menu | it's here"), {
    head: "the user's menu",
    caption: "it's here",
  });
  assert.deepEqual(leadingQuote('“a b” into c'), { inner: 'a b', rest: 'into c' });
  assert.equal(leadingQuote("don't"), null);
  assert.deepEqual(tokens('The Plans of our Teams'), ['plan', 'team']);
});

test('a line that is not an instruction is a place to look at, captioned by itself', () => {
  assert.deepEqual(readLine('Simple pricing for every team'), {
    stop: {
      do: 'scroll',
      on: 'Simple pricing for every team',
      say: 'Simple pricing for every team',
    },
    look: true,
  });
  assert.deepEqual(readLine('Our plans | fair and simple').stop, {
    do: 'scroll',
    on: 'Our plans',
    say: 'fair and simple',
  });
});

test('a brief becomes stops, a title and notes that say how it was read', () => {
  const read = briefStops(
    '# Tideline in 20 seconds | changelogs people read\n\nclick Pricing, then click Yearly | two months free\n' +
      'Simple pricing; for every team\n   \n2) hover Get started',
  );
  assert.equal(read.title, 'Tideline in 20 seconds');
  assert.equal(read.subtitle, 'changelogs people read');
  assert.deepEqual(read.stops, [
    { do: 'click', on: 'Pricing' },
    { do: 'click', on: 'Yearly', say: 'two months free' },
    { do: 'scroll', on: 'Simple pricing; for every team', say: 'Simple pricing; for every team' },
    { do: 'hover', on: 'Get started' },
  ]);
  assert.match(
    read.notes[0],
    /^The brief was read as 4 stops: 1 click “Pricing” · 2 click “Yearly” · 3 look at “Simple pricing; for every team” · 4 hover “Get started”\.$/,
  );
  assert.match(read.notes[1], /^One line is not an instruction: the page scrolls to the heading/);
  assert.equal(briefStops('Title: Hello\nwait 1').title, 'Hello');
  for (const empty of ['', '  \n \n', '-\n*\n', undefined]) {
    assert.deepEqual(briefStops(empty), { title: '', subtitle: '', stops: [], notes: [] });
  }
  const long = briefStops(
    Array.from({ length: MAX_STOPS + 5 }, (_, i) => `click Item ${i}`).join('\n'),
  );
  assert.equal(long.stops.length, MAX_STOPS);
  assert.match(long.notes[0], /Only the first 40 of 45 lines were used/);
});

test('stops are described in words', () => {
  const words = [
    [{ do: 'type', on: 'Email', text: 'hi' }, 'type “hi” into “Email”'],
    [{ do: 'type', text: 'hi' }, 'type “hi”'],
    [{ do: 'select', on: 'Plan', text: 'Pro' }, 'select “Pro” in “Plan”'],
    [{ do: 'press', text: 'Control+k' }, 'press Control+k'],
    [{ do: 'goto', text: '/pricing' }, 'go to /pricing'],
    [{ do: 'wait', text: '2' }, 'wait 2 s'],
    [{ do: 'focus', on: 'chart' }, 'zoom in on “chart”'],
    [{ do: 'scroll', on: 'top' }, 'scroll to the top'],
    [{ do: 'scroll', on: 'up', text: '300' }, 'scroll “up” 300 px'],
    [{ do: 'highlight', on: 'Pro plan', text: 'spotlight' }, 'highlight “Pro plan”'],
    [{ do: 'click', on: 'Yearly' }, 'click “Yearly”'],
  ];
  for (const [stop, said] of words) assert.equal(describeStop(stop), said);
  assert.equal(describeStop({ do: 'scroll', on: 'Our plans' }, true), 'look at “Our plans”');
});
