import { fixture, expect, waitUntil } from '@open-wc/testing';
import './field-number.js';

const PERCENT = { min: 0, max: 1, step: 0.01, scale: 100, decimals: 0, unit: '%' };
const tick = () => new Promise((r) => requestAnimationFrame(() => r()));

async function mount(props = {}) {
  const el = await fixture(
    '<field-number name="transform.opacity" label="Opacity"></field-number>',
  );
  Object.assign(el, { spec: PERCENT, value: 0.5, ...props });
  const events = [];
  el.addEventListener('field-change', (e) => events.push(e.detail));
  await waitUntil(() => el.querySelector('input.field-num'));
  await tick();
  return { el, events, input: el.querySelector('input.field-num') };
}
const key = (input, type, name, extra = {}) =>
  input.dispatchEvent(
    new KeyboardEvent(type, { key: name, bubbles: true, cancelable: true, ...extra }),
  );
const type = (input, text) => {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('field-number', () => {
  it('shows the value in display units with its unit and a label', async () => {
    const { el, input } = await mount();
    expect(input.value).to.equal('50');
    expect(input.getAttribute('aria-label')).to.equal('Opacity');
    expect(el.querySelector('.field-number-unit').textContent).to.equal('%');
    expect(el.getAttribute('name')).to.equal('transform.opacity');
    el.value = 0.25;
    await waitUntil(() => input.value === '25');
  });

  it('commits a typed value on Enter, clamped, and not per keystroke', async () => {
    const { events, input } = await mount();
    type(input, '7');
    type(input, '75%');
    expect(events).to.deep.equal([]);
    key(input, 'keydown', 'Enter');
    expect(events).to.deep.equal([{ name: 'transform.opacity', value: 0.75, phase: 'commit' }]);
    type(input, '400');
    input.dispatchEvent(new Event('blur'));
    expect(events[1]).to.deep.equal({ name: 'transform.opacity', value: 1, phase: 'commit' });
  });

  it('ignores text that is not a number and restores the value on Escape', async () => {
    const { events, input } = await mount();
    type(input, 'abc');
    key(input, 'keydown', 'Enter');
    expect(events).to.deep.equal([]);
    type(input, '99');
    await tick(); // a frame passes between keystrokes
    key(input, 'keydown', 'Escape');
    await waitUntil(() => input.value === '50');
    input.dispatchEvent(new Event('blur'));
    expect(events).to.deep.equal([]);
  });

  it('steps live with the arrow keys and commits when the key is released', async () => {
    const { events, input } = await mount();
    key(input, 'keydown', 'ArrowUp');
    key(input, 'keydown', 'ArrowUp');
    key(input, 'keydown', 'ArrowUp', { shiftKey: true });
    key(input, 'keyup', 'ArrowUp');
    expect(events.map((e) => [e.value, e.phase])).to.deep.equal([
      [0.51, 'live'],
      [0.52, 'live'],
      [0.62, 'live'],
      [0.62, 'commit'],
    ]);
    key(input, 'keydown', 'ArrowDown');
    key(input, 'keydown', 'Escape');
    expect(events.at(-1).phase).to.equal('cancel');
  });

  it('scrubs by dragging the label and commits on release', async () => {
    const { el, events, input } = await mount();
    const label = el.querySelector('.field-number-label');
    const pointer = (kind, x) =>
      label.dispatchEvent(
        new PointerEvent(kind, { clientX: x, pointerId: 1, button: 0, bubbles: true }),
      );
    pointer('pointerdown', 100);
    pointer('pointermove', 101);
    expect(events).to.deep.equal([]);
    pointer('pointermove', 130);
    pointer('pointermove', 160);
    pointer('pointerup', 160);
    expect(events.map((e) => [e.value, e.phase])).to.deep.equal([
      [0.6, 'live'],
      [0.7, 'live'],
      [0.7, 'commit'],
    ]);
    pointer('pointerdown', 100);
    pointer('pointerup', 100);
    expect(events.length).to.equal(3, 'a click without movement changes nothing');
    expect(document.activeElement).to.equal(input);
  });

  it('shows a dash for mixed values and applies a typed value to all', async () => {
    const { events, input } = await mount({ mixed: true });
    expect(input.value).to.equal('');
    expect(input.getAttribute('placeholder')).to.equal('—');
    type(input, '50');
    key(input, 'keydown', 'Enter');
    expect(events[0]).to.deep.equal({ name: 'transform.opacity', value: 0.5, phase: 'commit' });
  });

  it('offers a slider, formats timecode, and can be disabled', async () => {
    const { el, events } = await mount({ slider: true });
    const range = el.querySelector('input[type=range]');
    expect([range.min, range.max, range.value]).to.deep.equal(['0', '1', '0.5']);
    range.value = '0.2';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    expect(events.map((e) => [e.value, e.phase])).to.deep.equal([
      [0.2, 'live'],
      [0.2, 'commit'],
    ]);
    const time = await mount({ spec: { kind: 'time', fps: 30 }, value: 5.4 });
    expect(time.input.value).to.equal('00:00:05:12');
    type(time.input, '1000');
    key(time.input, 'keydown', 'Enter');
    expect(time.events[0].value).to.equal(10);
    const off = await mount({ disabled: true });
    expect(off.input.disabled).to.equal(true);
  });
});
