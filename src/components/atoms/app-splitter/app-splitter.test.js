import { fixture, expect } from '@open-wc/testing';
import './app-splitter.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

async function mount(attrs = '') {
  const el = await fixture(`<app-splitter label="Resize the timeline" ${attrs}></app-splitter>`);
  await frame();
  const events = [];
  for (const type of ['splitstart', 'splitmove', 'splitend', 'splitkey', 'splitreset']) {
    el.addEventListener(type, (event) =>
      events.push([type, event.detail?.delta ?? event.detail?.key]),
    );
  }
  return { el, grip: el.querySelector('[role="separator"]'), events };
}

const pointer = (type, x, y) =>
  new PointerEvent(type, {
    pointerId: 7,
    button: 0,
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
  });

describe('app-splitter', () => {
  it('is a focusable, labelled separator', async () => {
    const { grip } = await mount();
    expect(grip.getAttribute('tabindex')).to.equal('0');
    expect(grip.getAttribute('aria-label')).to.equal('Resize the timeline');
    expect(grip.getAttribute('aria-orientation')).to.equal('horizontal');
  });

  it('reports a vertical drag of a horizontal splitter as start, moves and end', async () => {
    const { el, grip, events } = await mount();
    grip.setPointerCapture = () => {};
    grip.dispatchEvent(pointer('pointerdown', 100, 300));
    expect(el.hasAttribute('dragging')).to.equal(true);
    grip.dispatchEvent(pointer('pointermove', 180, 260));
    grip.dispatchEvent(pointer('pointermove', 180, 240));
    await frame();
    grip.dispatchEvent(pointer('pointerup', 180, 230));
    expect(events[0]).to.deep.equal(['splitstart', undefined]);
    expect(events[events.length - 1]).to.deep.equal(['splitend', undefined]);
    const moves = events.filter(([type]) => type === 'splitmove').map(([, delta]) => delta);
    expect(moves).to.deep.equal(
      [-60, -70],
      'one move per frame with the latest position, then the release point',
    );
    expect(el.hasAttribute('dragging')).to.equal(false);
  });

  it('measures a vertical splitter along x', async () => {
    const { grip, events } = await mount('orientation="vertical"');
    grip.setPointerCapture = () => {};
    grip.dispatchEvent(pointer('pointerdown', 100, 300));
    grip.dispatchEvent(pointer('pointerup', 145, 900));
    expect(events.find(([type]) => type === 'splitmove')[1]).to.equal(45);
    expect(grip.getAttribute('aria-orientation')).to.equal('vertical');
  });

  it('ignores moves without a drag and secondary buttons', async () => {
    const { grip, events } = await mount();
    grip.dispatchEvent(pointer('pointermove', 10, 10));
    grip.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 7, button: 2, bubbles: true, cancelable: true }),
    );
    expect(events).to.deep.equal([]);
  });

  it('turns arrow keys, Enter and a double-click into key and reset events', async () => {
    const { grip, events } = await mount();
    const press = (key) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      grip.dispatchEvent(event);
      return event;
    };
    expect(press('ArrowUp').defaultPrevented).to.equal(true);
    press('Enter');
    grip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(press('a').defaultPrevented).to.equal(false);
    expect(events).to.deep.equal([
      ['splitkey', 'ArrowUp'],
      ['splitreset', undefined],
      ['splitreset', undefined],
    ]);
  });
});
