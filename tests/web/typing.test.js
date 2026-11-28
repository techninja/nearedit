import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { takeSnapshot } from '../../src/api/web/snapshot.js';
import * as kit from './kit.js';
import { startSite } from './site.js';

/**
 * Typing into fields that are not in the picture when the step begins:
 * below the fold, under a sticky header, at the bottom of a panel. The
 * field has to be in place when the pointer arrives to click it — half a
 * second into the step — however long the typing then takes.
 * The page: `site/fields.html`, 640 × 360, with a 50 px header that stays.
 */

const { span } = kit;
const holds = (values) => ({
  do: 'run',
  js: `if (values() !== '${values}') throw new Error(values())`,
});
const top = { do: 'scroll', to: 'top', duration: 0.2, hold: 0.1 };

describe('web recorder: typing into fields out of sight', { skip: kit.SKIP }, () => {
  let site;
  let rec;
  before(async () => {
    site = await startSite();
    rec = (steps, more = {}) =>
      kit.record({ url: `${site.url}/fields.html`, steps, ...more }, { allow: site.allow });
  });
  after(async () => {
    await site.close();
    assert.deepEqual(kit.leftovers(), { processes: [], profiles: [] });
    kit.cleanup();
  });

  it('brings a field below the fold into place before the click, however long the text', async () => {
    const steps = [
      { do: 'type', target: 'label=Name', text: 'Ada Lovelace' },
      top,
      { do: 'type', target: '#email', text: 'ada@b.co', speed: 6 },
      top,
      { do: 'type', target: 'text=Phone', text: '0123 456 789', speed: 30 },
      holds('name=Ada Lovelace|email=ada@b.co|phone=0123 456 789|city='),
    ];
    const { track, score } = await rec(steps);
    for (const i of [0, 2, 4]) {
      const row = track.steps[i];
      const { S, A } = span(score, i);
      assert.ok(A - S > 15, `step ${i + 1}: the typing goes on after the pointer has arrived`);
      const middle = row.rect.y + row.rect.height / 2;
      assert.ok(
        Math.abs(middle - 180) <= 1,
        `step ${i + 1}: clicked in the middle of the picture, at ${middle}`,
      );
      assert.ok(
        row.point.y > row.rect.y && row.point.y < row.rect.y + row.rect.height,
        'on the field',
      );
      // The page moves while the pointer travels — the first half second — and then stands still.
      const moving = track.scroll
        .filter(([t]) => t > row.start && t <= row.actionEnd)
        .map(([t]) => t);
      assert.ok(moving.length > 8, `step ${i + 1}: scrolled over ${moving.length} frames`);
      assert.ok(
        moving.at(-1) <= row.start + 0.5 + 1e-6,
        `step ${i + 1}: still scrolling at ${moving.at(-1)}`,
      );
      assert.equal(row.missing, false);
    }
    assert.deepEqual(track.warnings, []);
    // As a recording at the default scale: two device pixels per CSS pixel changes nothing.
    const sharp = await rec([steps[0], holds('name=Ada Lovelace|email=|phone=|city=')], {
      scale: 2,
    });
    assert.ok(
      Math.abs(sharp.track.steps[0].rect.y + sharp.track.steps[0].rect.height / 2 - 180) <= 1,
    );
  });

  it('moves a field out from under a sticky header, and scrolls a panel to one', async () => {
    // Scrolled so that the field lies whole under the header: in the picture, and not reachable.
    const under = { do: 'scroll', to: 910, duration: 0.2, hold: 0.1 };
    const hidden = await rec([
      under,
      { do: 'type', target: 'label=Name', text: 'Ada' },
      holds('name=Ada|email=|phone=|city='),
    ]);
    const row = hidden.track.steps[1];
    assert.ok(row.rect.y > 50, `clear of the header when it was clicked: ${row.rect.y}`);
    assert.ok(hidden.track.scroll.at(-1)[1] < 910, 'the page moved back to uncover it');

    const panel = await rec([
      { do: 'type', target: 'label=City', text: 'Paris, France' },
      holds('name=|email=|phone=|city=Paris, France'),
    ]);
    const { rect, point } = panel.track.steps[0];
    assert.ok(
      rect.x >= 340 && rect.y >= 80 && rect.y + rect.height <= 230,
      `inside the panel: ${JSON.stringify(rect)}`,
    );
    assert.ok(point.y > rect.y && point.y < rect.y + rect.height);
    assert.deepEqual(panel.track.scroll, [[0, 0]], 'the panel scrolled, the page did not');
  });

  it('clicks first and types after, also when the step has no time for both', async () => {
    const fast = { do: 'type', target: 'label=Name', text: 'Ada', duration: 0, hold: 0 };
    const { track, score } = await rec([
      fast,
      holds('name=Ada|email=|phone=|city='), // on the frame the step began and ended on
      { ...fast, text: 'Bo', clear: true, hold: 0.2 },
      holds('name=Bo|email=|phone=|city='),
      { do: 'type', target: '#email', text: 'a@b.c', duration: 0.2, hold: 0 }, // less than the approach
      { do: 'type', target: 'text=Phone', text: '12', duration: 0.5, hold: 0 }, // just the approach
      { do: 'type', target: 'text=Phone', text: '345', clear: true }, // the usual pace, emptied first
      holds('name=Bo|email=a@b.c|phone=345|city='),
    ]);
    assert.deepEqual([span(score, 0), span(score, 1).S], [{ S: 6, A: 6, E: 6 }, 6]);
    for (const i of [0, 2, 4, 5, 6]) {
      const { rect, point } = track.steps[i];
      assert.ok(Math.abs(rect.y + 15 - 180) <= 1, `step ${i + 1}: in place when clicked`);
      assert.ok(point.y > rect.y && point.y < rect.y + rect.height, `step ${i + 1}: on the field`);
    }
    assert.deepEqual(track.warnings, []);
  });

  it('types into whatever has the focus when no target is named: no scrolling, no check', async () => {
    const { track } = await rec([
      { do: 'type', text: 'lost', duration: 0.2, hold: 0 }, // nothing has the focus: no failure
      holds('name=|email=|phone=|city='),
      { do: 'click', target: 'label=Email', duration: 0.3, hold: 0.1 },
      { do: 'type', text: 'a@b.c' },
      holds('name=|email=a@b.c|phone=|city='),
    ]);
    const [lost, , click, typed] = track.steps;
    for (const row of [lost, typed])
      assert.deepEqual([row.target, row.rect, row.point], [undefined, undefined, undefined]);
    const after = track.scroll.filter(([t]) => t > click.actionEnd);
    assert.deepEqual(after, [], 'the page stands still while the keys are struck');
    assert.equal(track.cursor.at(-1)[0], click.actionEnd, 'and so does the pointer');
  });

  it('brings a list into place before its choice is made', async () => {
    const chosen = 'plan=team in view|size=l in view';
    const { track } = await rec([
      { do: 'select', target: 'label=Plan', value: 'Team' },
      { do: 'select', target: 'label=Size', value: 'Large', duration: 0.3 },
      { do: 'run', js: `if (picked() !== '${chosen}') throw new Error(picked())` },
    ]);
    const [plan, size] = track.steps;
    assert.ok(Math.abs(plan.rect.y + 15 - 180) <= 1, `in the middle: ${plan.rect.y}`);
    assert.ok(
      size.rect.y >= 80 && size.rect.y + 30 <= 230,
      `in the panel's window: ${size.rect.y}`,
    );
    const moving = track.scroll.filter(([t]) => t > plan.start).map(([t]) => t);
    assert.ok(moving.length > 8 && moving.at(-1) <= plan.actionEnd + 1e-6, 'scrolled, then chose');
  });

  it('a snapshot after a step and a recording agree on what can be done', async () => {
    // Every recording of the suite is compared with a snapshot of its recipe (kit.js); here in the open.
    const steps = [
      { do: 'type', target: 'label=Name', text: 'Ada Lovelace' },
      { do: 'type', target: 'label=Nickname', text: 'Countess' },
      { do: 'type', target: 'label=Email', text: 'ada@example.com' },
    ];
    const recipe = { ...kit.SMALL, url: `${site.url}/fields.html`, steps };
    const options = { browser: kit.BROWSER, noSandbox: kit.NO_SANDBOX, allow: site.allow, recipe };
    const first = await takeSnapshot({ ...options, until: 1 });
    assert.ok(first.scrollY > 500, 'after the first step the page has scrolled to the field');
    const stopped = 'Step 2 (type): nothing on the page matches label=Nickname';
    await assert.rejects(
      takeSnapshot({ ...options, until: 2 }),
      (err) => err.message === stopped && err.step === 1,
    );
    await assert.rejects(takeSnapshot(options), (err) => err.message === stopped);
    await assert.rejects(rec(steps), (err) => err.message === stopped && err.step === 1);
    const skipped = await rec(steps, { onMissing: 'skip' });
    assert.deepEqual(
      skipped.track.steps.map((step) => step.missing),
      [false, true, false],
    );
    const tolerant = await takeSnapshot({
      ...options,
      recipe: { ...recipe, onMissing: 'skip' },
      fps: 25,
    });
    assert.deepEqual(tolerant.warnings, [`${stopped} — skipped`]);
  });
});
