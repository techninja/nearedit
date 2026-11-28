import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as kit from './kit.js';
import { startSite } from './site.js';

/**
 * Steps against real pages: how targets are found, what a missing one
 * does, pages that navigate, a modal dialog, a page that sabotages
 * scripts, and requests that are slow or never answered.
 */

const { near, span } = kit;
const cursor = { style: 'dot', color: '#ff8000' };
const isOrange = (rgb) => rgb[0] > 200 && rgb[1] > 90 && rgb[1] < 170 && rgb[2] < 70;
const isRed = (rgb) => rgb[0] > 200 && rgb[1] < 60 && rgb[2] < 60;
const quick = { duration: 0.2, hold: 0.2 };

describe('web recorder: steps', { skip: kit.SKIP }, () => {
  let site;
  let rec;
  before(async () => {
    site = await startSite();
    rec = (recipe, options = {}) =>
      kit.record({ cursor, ...recipe }, { allow: site.allow, ...options });
  });
  after(async () => {
    await site.close();
    assert.deepEqual(kit.leftovers(), { processes: [], profiles: [] });
    kit.cleanup();
  });

  it('finds targets by text, label, selector, point and number', async () => {
    const move = (target, more = {}) => ({ do: 'move', target, duration: 0.1, hold: 0.1, ...more });
    const long = await rec({
      url: `${site.url}/long.html`,
      steps: [
        move('text=  buy   NOW '),
        move('#menu'),
        move('css=#intro h2'),
        move({ x: 123, y: 45 }),
        move('point=200,100'),
        move('text=Contact'),
        move('text=Write to us'),
        move('text=Write to us', { index: 1 }),
      ],
    });
    const rows = long.track.steps;
    assert.equal(rows[0].rect.width, 120, 'case and spacing are ignored: the button');
    assert.deepEqual([rows[1].rect.width, rows[1].rect.height], [100, 30]);
    assert.equal(rows[2].rect.x, 100);
    assert.deepEqual([rows[3].point, rows[3].rect], [{ x: 123, y: 45 }, undefined]);
    assert.deepEqual(rows[4].point, { x: 200, y: 100 });
    assert.ok(
      rows[5].rect.height < 40,
      'a text that is only contained: the heading, not its section',
    );
    assert.ok(rows[7].rect.x > rows[6].rect.x + 40, 'index 1 is the second link');
    assert.ok(rows.every((row) => row.missing === false));

    const form = await rec({
      url: `${site.url}/form.html`,
      steps: [
        move('label=full NAME'),
        move('label=ada'),
        move('label=fullname'),
        move('label=I agree'),
      ],
    });
    const [byLabel, byPlaceholder, byName, byAria] = form.track.steps.map((row) => row.rect);
    assert.deepEqual(byLabel, { x: 40, y: 74, width: 308, height: 34 });
    assert.deepEqual([byPlaceholder, byName], [byLabel, byLabel]);
    assert.deepEqual([byAria.width, byAria.height], [20, 20]);

    const index = await rec({
      url: `${site.url}/`,
      steps: [
        move('text=second page'),
        { do: 'click', target: '#toggle', count: 2, ...quick },
        {
          do: 'run',
          js: "if (clicks.join() !== '1,2') throw new Error('clicks ' + clicks.join())",
        },
      ],
    });
    assert.deepEqual(index.track.steps[0].rect, { x: 40, y: 180, width: 160, height: 40 });
    assert.ok(
      near(index.frames.at(index.frames.count - 1, 260, 140), [0, 0, 0]),
      'on and off again',
    );
  });

  it('fails with the number of the step that cannot be done — or skips it', async () => {
    const steps = [
      { do: 'wait', duration: 0.1 },
      { do: 'click', target: 'text=No such button', ...quick },
      { do: 'click', target: '#toggle', ...quick },
    ];
    await assert.rejects(rec({ url: `${site.url}/`, steps }), (err) => {
      assert.equal(err.message, 'Step 2 (click): nothing on the page matches text=No such button');
      assert.deepEqual([err.status, err.step], [422, 1]);
      return true;
    });
    const more = [
      { do: 'run', js: 'undefinedFunction()' },
      { do: 'select', target: '#toggle', value: 'x', ...quick },
      { do: 'move', target: 'a >> b', ...quick },
      { do: 'move', target: '#next', index: 3, ...quick },
      { do: 'press', key: 'NoSuchKey' },
    ];
    const skipped = await rec({
      url: `${site.url}/`,
      onMissing: 'skip',
      steps: [...steps, ...more],
    });
    assert.equal(
      skipped.frames.count,
      skipped.score.frames,
      'the time of a skipped step still passes',
    );
    assert.deepEqual(
      skipped.track.steps.map((row) => row.missing),
      [false, true, false, true, true, true, true, true],
    );
    const lit = span(skipped.score, 2).A + 4;
    assert.ok(
      near(skipped.frames.at(lit, 260, 140), [255, 255, 0]),
      'the step after it still works',
    );
    const said = skipped.track.warnings.join('\n');
    assert.match(
      said,
      /Step 2 \(click\): nothing on the page matches text=No such button — skipped/,
    );
    assert.match(
      said,
      /Step 4 \(run\): the script failed: ReferenceError: undefinedFunction is not/,
    );
    assert.match(said, /Step 5 \(select\): the target is not a <select>/);
    assert.match(said, /Step 6 \(move\): "a >> b" is not a CSS selector/);
    assert.match(said, /Step 7 \(move\): css=#next matches 1 element\(s\); there is no number 3/);
    assert.match(said, /Step 8 \(press\): there is no key called "NoSuchKey"/);
    await assert.rejects(
      rec({ url: `${site.url}/`, steps: [{ do: 'run', js: 'throw new Error("boom")' }] }),
      /Step 1 \(run\): the script failed: Error: boom/,
    );
  });

  it('follows a click to another page and `goto`, keeping pointer and clocks', async () => {
    // The second page throws when animation-frame time and its own clock disagree.
    const agree =
      "if (!gaps.length || gaps.some((g) => Math.abs(g) > 1)) throw new Error('gaps ' + gaps)";
    const steps = [
      { do: 'click', target: 'text=Second page', duration: 0.3, hold: 0.5 },
      { do: 'run', js: agree },
      { do: 'goto', url: '/form.html', hold: 0.2 },
      { do: 'goto', url: `${site.url}/redirect-ok`, hold: 0.3 },
      { do: 'run', js: agree },
    ];
    const { frames, score, track } = await rec({ url: `${site.url}/`, steps });
    assert.equal(frames.count, score.frames);
    const click = span(score, 0);
    const arrive = click.A + 5;
    assert.ok(
      near(frames.at(click.A + 3, 600, 300), [255, 255, 255]),
      'the first page until the release',
    );
    assert.ok(
      near(frames.at(arrive, 600, 300), [0, 64, 128], 8),
      `then the second: ${frames.at(arrive, 600, 300)}`,
    );
    // Its animation starts when it appears and moves 10 px a frame from there.
    for (let k = 0; k < 10; k++) {
      const box = frames.box(arrive + k, isRed);
      assert.ok(Math.abs(box[0] - 10 * k) <= 1, `frame ${k} of the new page: slider at ${box[0]}`);
    }
    const dot = frames.box(arrive + 3, isOrange);
    assert.ok(
      Math.abs((dot[0] + dot[2]) / 2 - 120) < 2 && Math.abs((dot[1] + dot[3]) / 2 - 200) < 2,
      'pointer kept',
    );
    const form = span(score, 2);
    assert.ok(near(frames.at(form.S - 1, 600, 300), [0, 64, 128], 8));
    assert.ok(
      near(frames.at(form.S, 600, 300), [255, 255, 255]),
      'goto: the new page is there, loaded',
    );
    const back = span(score, 3);
    assert.ok(near(frames.at(back.S, 600, 300), [0, 64, 128], 8), 'through a redirect too');
    const loaded = frames.box(back.S, isRed);
    assert.ok(
      Math.abs(loaded[0] - 300) <= 1,
      `a page that was given a second to settle: ${loaded[0]}`,
    );
    assert.deepEqual(track.warnings, []);
  });

  it('draws above a modal dialog and survives a page that breaks every helper', async () => {
    const modal = await rec({
      url: `${site.url}/`,
      steps: [
        { do: 'click', target: 'text=Open the dialog', ...quick },
        { do: 'click', target: 'text=Close it', duration: 0.3, hold: 0.3 },
      ],
    });
    const close = span(modal.score, 1);
    const { point } = modal.track.steps[1];
    assert.ok(
      near(modal.frames.at(close.S, 600, 100), [128, 128, 128], 8),
      'the backdrop dims the page',
    );
    const dot = modal.frames.box(close.A, isOrange);
    assert.ok(
      dot && Math.abs((dot[0] + dot[2]) / 2 - point.x) < 2,
      'the pointer is drawn over the dialog',
    );
    assert.ok(
      near(modal.frames.at(close.A + 5, 600, 100), [255, 255, 255]),
      'and its click closed it',
    );

    const hostile = await rec({
      url: `${site.url}/hostile.html`,
      steps: [
        { do: 'click', target: 'text=switch the lamp', ...quick },
        { do: 'highlight', target: '#lamp', color: '#00ffff', duration: 0.1, hold: 0.3 },
      ],
    });
    const click = span(hostile.score, 0);
    assert.ok(near(hostile.frames.at(click.A + 4, 260, 140), [255, 255, 0]), 'the click landed');
    const seen = hostile.frames.box(click.A, isOrange);
    assert.ok(seen && Math.abs((seen[0] + seen[2]) / 2 - 120) < 2, 'the pointer is drawn');
    const ring = hostile.frames.box(
      span(hostile.score, 1).A + 2,
      (rgb) => rgb[0] < 90 && rgb[1] > 180 && rgb[2] > 180,
    );
    assert.ok(
      ring && Math.abs(ring[0] - 234) <= 1 && Math.abs(ring[2] - 285) <= 1,
      `the ring too: ${ring}`,
    );
    assert.deepEqual(hostile.track.steps[0].rect, { x: 40, y: 120, width: 160, height: 40 });
  });

  it('waits for a slow answer without moving the clock, and gives up on one that never comes', async () => {
    const started = Date.now();
    const slow = await rec({
      url: `${site.url}/slow.html`,
      steps: [{ do: 'click', target: 'text=Ask slowly', ...quick, hold: 0.5 }],
    });
    const click = span(slow.score, 0);
    const lamp = (shot, n) => shot.frames.at(n, 260, 80);
    assert.ok(near(lamp(slow, click.A + 4), [0, 0, 0]), 'asked on the release frame');
    assert.ok(
      near(lamp(slow, click.A + 5), [0, 255, 0]),
      'answered on the next: 400 ms took no time',
    );
    for (let n = 0; n < slow.frames.count; n++) {
      const off = Math.abs(slow.frames.box(n, isRed)[0] - ((300 + 10 * n) % 600));
      assert.ok(Math.min(off, 600 - off) <= 1, `frame ${n}: the animation never jumps`);
    }
    assert.ok(Date.now() - started >= 400, 'the recording itself did wait');
    assert.deepEqual(slow.track.warnings, []);

    const never = await rec(
      {
        url: `${site.url}/slow.html`,
        steps: [{ do: 'click', target: 'text=Ask in vain', ...quick, hold: 1 }],
      },
      { watchdog: 700 },
    );
    const asked = span(never.score, 0).A + 4;
    assert.ok(near(never.frames.at(asked, 260, 140), [255, 255, 0]));
    assert.equal(never.frames.count, never.score.frames, 'the recording is complete all the same');
    for (let n = 0; n < never.frames.count; n++) {
      const off = Math.abs(never.frames.box(n, isRed)[0] - ((300 + 10 * n) % 600));
      assert.ok(Math.min(off, 600 - off) <= 11, `frame ${n}: at most one frame is longer`);
    }
    assert.equal(never.track.warnings.length, 1);
    assert.match(
      never.track.warnings[0],
      /\/api\/never did not finish loading; the clock stopped waiting/,
    );
  });
});
