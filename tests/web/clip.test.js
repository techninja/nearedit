import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { scrollAt } from '#utils/web/index.js';
import { takeSnapshot } from '../../src/api/web/snapshot.js';
import * as kit from './kit.js';
import { startSite } from './site.js';

/**
 * Targets that lie inside the picture but do not show — a scrolling panel
 * has cut them off — and targets that show but cannot be reached, because
 * something lies on top. The page is an app made of panels: `site/clip.html`.
 */

const { near, span } = kit;
const isRed = (rgb) => rgb[0] > 200 && rgb[1] < 60 && rgb[2] < 60;
const GREEN = [0, 255, 0];
/** Lamps are fixed along the top: [x, y] of the middle of each. */
const LAMP = {
  hit: [410, 30],
  miss: [435, 30],
  deep: [460, 30],
  strip: [485, 30],
  bar: [510, 30],
  veil: [535, 30],
};
const quick = { duration: 0.3, hold: 0.3 };

describe('web recorder: clipped and covered targets', { skip: kit.SKIP }, () => {
  let site;
  let rec;
  before(async () => {
    site = await startSite();
    rec = (steps, more = {}) =>
      kit.record({ url: `${site.url}/clip.html`, steps, ...more }, { allow: site.allow });
  });
  after(async () => {
    await site.close();
    assert.deepEqual(kit.leftovers(), { processes: [], profiles: [] });
    kit.cleanup();
  });

  it('scrolls the panel that cuts a target off, frame by frame, and clicks the target', async () => {
    // The seventh tile's box is at 10,190 — inside the picture, below the dock, where the timeline is drawn.
    const steps = [{ do: 'click', target: '.tile[data-key="snow"]', duration: 0.5, hold: 0.4 }];
    const { frames, score, track } = await rec(steps);
    const click = span(score, 0);
    const last = frames.count - 1;
    assert.ok(near(frames.at(click.A + 3, ...LAMP.hit), [0, 0, 0]));
    assert.ok(near(frames.at(click.A + 4, ...LAMP.hit), GREEN), 'the click reached the tile');
    assert.ok(
      near(frames.at(last, ...LAMP.miss), [0, 0, 0]),
      'and not the timeline under its old place',
    );
    // The track tells where the tile was when it was clicked: in the dock, centred.
    const [row] = track.steps;
    assert.deepEqual(
      [row.rect, row.point, row.missing],
      [{ x: 10, y: 50, width: 80, height: 50 }, { x: 50, y: 75 }, false],
    );
    // The dock scrolled 140 px over the step's fifteen frames: a ruler in it says how far, frame by frame.
    const seen = new Set();
    for (let n = click.S; n <= click.A; n++) {
      const want = scrollAt(0, 140, (n - click.S) / (click.A - click.S), 'ease-in-out');
      const top = frames.box(n, isRed)[1];
      assert.ok(
        Math.abs(top - (140 - want)) <= 2,
        `frame ${n}: ruler at ${top}, dock scrolled ${want}`,
      );
      seen.add(top);
    }
    assert.ok(seen.size >= 10, `not in one jump: ${seen.size} places`);
    assert.deepEqual(
      track.scroll,
      [[0, 0]],
      'the page itself never scrolled: `scroll` is the page',
    );
    assert.deepEqual(track.warnings, []);
  });

  it('scrolls boxes inside boxes, and sideways', async () => {
    const steps = [
      { do: 'click', target: '#deepest', ...quick },
      { do: 'click', target: 'text=Sideways', ...quick },
    ];
    const { frames, score, track } = await rec(steps);
    const [deep, side] = [span(score, 0), span(score, 1)];
    assert.ok(
      near(frames.at(deep.A + 4, ...LAMP.deep), GREEN),
      'the button two boxes down was clicked',
    );
    const inner = track.steps[0].rect;
    assert.ok(inner.x >= 230 && inner.x + inner.width <= 380, JSON.stringify(inner));
    assert.ok(inner.y >= 60 && inner.y + inner.height <= 160, 'it ended inside the outer box');
    assert.ok(near(frames.at(side.S, ...LAMP.strip), [0, 0, 0]));
    assert.ok(near(frames.at(side.A + 4, ...LAMP.strip), GREEN), 'and the one cut off sideways');
    // Cut off sideways only: the strip scrolls it to its middle, and nothing moves up or down.
    assert.deepEqual(track.steps[1].rect, { x: 265, y: 210, width: 80, height: 40 });
    assert.deepEqual(track.scroll, [[0, 0]], 'the page stayed where it was');
    assert.ok(near(frames.at(frames.count - 1, ...LAMP.miss), [0, 0, 0]));
  });

  it('moves a target out from under what covers it — or refuses to click something else', async () => {
    // A bar along the bottom lies on the button; the page can scroll it clear.
    const freed = await rec([{ do: 'click', target: 'text=Under the bar', ...quick }]);
    const click = span(freed.score, 0);
    assert.ok(near(freed.frames.at(click.A + 4, ...LAMP.bar), GREEN), 'clicked once it was clear');
    const scrolled = freed.track.scroll.map(([, y]) => y);
    assert.ok(
      scrolled.length > 5 && scrolled.at(-1) === 150,
      `the page scrolled it to the middle: ${scrolled}`,
    );
    assert.deepEqual(freed.track.steps[0].rect, { x: 400, y: 160, width: 100, height: 40 });

    // A veil down the edge lies on this one wherever the page scrolls.
    const covered = 'css=#veiled is covered by <div#veil.veil.chat> "Chat with us"';
    await assert.rejects(rec([{ do: 'click', target: '#veiled', ...quick }]), (err) => {
      assert.equal(err.message, `Step 1 (click): ${covered}`);
      return err.status === 422 && err.step === 0;
    });
    await assert.rejects(
      rec([{ do: 'hover', target: '#veiled', ...quick }]),
      /Step 1 \(hover\): css=#veiled is covered by/,
    );
    await assert.rejects(
      rec([{ do: 'click', target: 'text=Tucked away', ...quick }]),
      /Step 1 \(click\): text=Tucked away cannot be brought into view: it is cut off by <div#closed>/,
    );
    const steps = [
      { do: 'click', target: '#veiled', ...quick },
      { do: 'type', target: '#veiled', text: 'abc' },
      { do: 'click', target: '.tile[data-key="snow"]', ...quick },
    ];
    const skipped = await rec(steps, { onMissing: 'skip' });
    const end = skipped.frames.count - 1;
    assert.deepEqual(
      skipped.track.steps.map((row) => row.missing),
      [true, true, false],
    );
    assert.deepEqual(skipped.track.warnings, [
      `Step 1 (click): ${covered} — skipped`,
      `Step 2 (type): ${covered} — skipped`,
    ]);
    assert.ok(near(skipped.frames.at(end, ...LAMP.veil), [0, 0, 0]), 'the veil was never clicked');
    assert.ok(near(skipped.frames.at(end, ...LAMP.hit), GREEN), 'and the next step did its work');
    assert.equal(
      skipped.track.steps[0].rect,
      undefined,
      'a step that was passed over has no place',
    );
  });

  it('prefers the match that shows, and says in a snapshot what shows', async () => {
    const options = { browser: kit.BROWSER, noSandbox: kit.NO_SANDBOX, allow: site.allow };
    const snapshot = await takeSnapshot({
      ...options,
      recipe: { ...kit.SMALL, url: `${site.url}/clip.html` },
    });
    const visible = Object.fromEntries(
      snapshot.elements.map((element) => [element.name, element.visible]),
    );
    const shows = ['Tile 1', 'Tile 4', 'Tile 6', 'Under the bar', 'Veiled'];
    const hidden = ['Tile 7', 'Tile 10', 'Deepest', 'Sideways', 'Tucked away'];
    assert.deepEqual(
      shows.map((name) => visible[name]),
      shows.map(() => true),
    );
    assert.deepEqual(
      hidden.map((name) => visible[name]),
      hidden.map(() => false),
      'inside the picture, but cut off',
    );
    const tile = snapshot.elements.find((element) => element.name === 'Tile 7');
    assert.deepEqual([tile.target, tile.rect.y], ['button:nth-of-type(7)', 190]);

    // Two things say "Tile 7": a label that shows and the tile that does not. The first match is the one in sight.
    const move = (more) => ({
      do: 'move',
      target: 'text=tile 7',
      duration: 0.1,
      hold: 0.1,
      ...more,
    });
    const { track } = await rec([
      move(),
      move({ index: 1 }),
      { do: 'move', target: '.tile', index: 6, ...quick },
    ]);
    assert.deepEqual([track.steps[0].rect.x, track.steps[0].rect.y], [230, 20], 'the label');
    assert.deepEqual(
      track.steps[1].rect,
      { x: 10, y: 50, width: 80, height: 50 },
      'number 1 is the tile, scrolled into the dock',
    );
    // In document order the seventh tile; counted from what shows, `index: 6` is another.
    assert.notDeepEqual(track.steps[2].rect, track.steps[1].rect);
  });
});
