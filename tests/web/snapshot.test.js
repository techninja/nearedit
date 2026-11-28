import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { parseTarget } from '#utils/web/index.js';
import { takeSnapshot } from '../../src/api/web/snapshot.js';
import * as kit from './kit.js';
import { startSite } from './site.js';

/**
 * A snapshot lists what one can aim at, each with a target. The promise is
 * that every one of those targets, used in a step, finds exactly the
 * element it was listed for — so each is tried in a real recording.
 */

describe('web snapshot: things to aim at', { skip: kit.SKIP }, () => {
  let site;
  const options = () => ({ browser: kit.BROWSER, noSandbox: kit.NO_SANDBOX, allow: site.allow });
  const snapshot = (path, more = {}) =>
    takeSnapshot({ ...options(), recipe: { ...kit.SMALL, url: `${site.url}${path}`, ...more } });
  /** Aim a step at every listed target and compare where it landed with where the element is. */
  const aimAtAll = async (path, elements) => {
    const steps = elements.map(({ target }) => ({ do: 'focus', target, duration: 0.1, hold: 0 }));
    const { track } = await kit.record({ url: `${site.url}${path}`, steps }, options());
    elements.forEach((element, i) => {
      const row = track.steps[i];
      const scrolled = track.scroll.filter(([t]) => t <= row.actionEnd + 1e-6).at(-1)[1];
      const found = { ...row.rect, y: row.rect.y + scrolled };
      const close = ['x', 'y', 'width', 'height'].every(
        (side) => Math.abs(found[side] - element.rect[side]) < 1,
      );
      assert.ok(
        close,
        `${element.target} found ${JSON.stringify(found)}, listed ${JSON.stringify(element.rect)}`,
      );
    });
  };

  before(async () => {
    site = await startSite();
  });
  after(async () => {
    await site.close();
    assert.deepEqual(kit.leftovers(), { processes: [], profiles: [] });
    kit.cleanup();
  });

  it('lists links, buttons, controls, headings, pictures and sections of a long page', async () => {
    const { elements, page, viewport } = await snapshot('/long.html');
    assert.deepEqual(
      [page, viewport],
      [
        { width: 640, height: 3000 },
        { width: 640, height: 360 },
      ],
    );
    const listed = elements.map(({ kind, name, target, visible }) => [kind, name, target, visible]);
    assert.deepEqual(listed, [
      ['section', 'Main menu', '#menu', true],
      ['section', 'Introduction', '#intro', true],
      ['heading', 'Introduction', 'text=Introduction', true],
      ['section', 'Pricing', '#pricing', false],
      ['heading', 'Pricing', 'text=Pricing', false],
      ['button', 'Buy now', 'text=Buy now', false],
      ['section', 'Contact us', '#contact', false],
      ['heading', 'Contact us', 'text=Contact us', false],
      ['image', 'A map of the office', 'img[alt="A map of the office"]', false],
      // Two links say the same: their words cannot tell them apart, their addresses can.
      ['link', 'Write to us', 'a[href="/form.html"]', false],
      ['link', 'Write to us', 'a[href="/second.html"]', false],
    ]);
    assert.deepEqual(elements[5].rect, { x: 100, y: 1060, width: 120, height: 40 });
    assert.ok(
      elements.every(({ target }) => parseTarget(target)),
      'every target reads as one',
    );
    await aimAtAll('/long.html', elements);
  });

  it('lists form controls by their labels, and whatever a hostile page leaves', async () => {
    const form = await snapshot('/form.html');
    assert.deepEqual(
      form.elements.map(({ kind, name, target }) => [kind, name, target]),
      [
        ['input', 'Full name', 'label=Full name'],
        ['input', 'Plan', 'label=Plan'],
        ['input', 'I agree', 'label=I agree'],
      ],
    );
    await aimAtAll('/form.html', form.elements);

    const hostile = await snapshot('/hostile.html');
    assert.deepEqual(
      hostile.elements.map(({ kind, target }) => [kind, target]),
      [['button', 'text=Switch the lamp']],
    );
    await aimAtAll('/hostile.html', hostile.elements);
    assert.equal(hostile.title, 'A hostile page');

    const app = await snapshot('/app.html');
    assert.deepEqual(app.page, { width: 640, height: 360 }, 'the page itself does not scroll');
    assert.deepEqual(
      app.elements.map(({ target, visible }) => [target, visible]),
      [['text=Deep in the panel', false]],
    );
  });

  it('plays the steps first, and fails as a recording would', async () => {
    const steps = [
      { do: 'scroll', to: 'text=Pricing', align: 'start', duration: 0.2 },
      { do: 'wait' },
    ];
    const scrolled = await snapshot('/long.html', { steps });
    assert.equal(scrolled.scrollY, 1000);
    const buy = scrolled.elements.find((element) => element.name === 'Buy now');
    assert.deepEqual(
      [buy.visible, buy.rect.y],
      [true, 1060],
      'places are in page pixels, scrolled or not',
    );
    const partly = await takeSnapshot({
      ...options(),
      until: 0,
      recipe: { ...kit.SMALL, url: `${site.url}/long.html`, steps },
    });
    assert.equal(partly.scrollY, 0);
    await assert.rejects(
      snapshot('/long.html', { steps: [{ do: 'click', target: 'text=Sell now' }] }),
      /Step 1 \(click\): nothing on the page matches text=Sell now/,
    );
    await assert.rejects(
      takeSnapshot({ ...options(), allow: '', recipe: { url: `${site.url}/` } }),
      /was refused/,
    );
    const stop = new AbortController();
    stop.abort();
    await assert.rejects(
      takeSnapshot({ ...options(), signal: stop.signal, recipe: { url: `${site.url}/` } }),
      /cancelled/,
    );
  });
});
