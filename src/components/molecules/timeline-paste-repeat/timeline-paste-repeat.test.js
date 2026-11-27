import { fixture, expect, waitUntil } from '@open-wc/testing';
import './timeline-paste-repeat.js';

const input = (el, field) => el.querySelector(`input[data-field="${field}"]`);
const set = (target, value) => {
  target.value = value;
  target.dispatchEvent(new Event('input', { bubbles: true }));
};

async function mount() {
  const el = await fixture('<timeline-paste-repeat open></timeline-paste-repeat>');
  await waitUntil(() => el.querySelector('form'), 'the dialog never rendered');
  const events = [];
  el.addEventListener('apply', (event) => events.push(event.detail));
  el.addEventListener('close', () => events.push('close'));
  return { el, events };
}

describe('timeline-paste-repeat', () => {
  it('is a modal dialog that asks for a count and a spacing', async () => {
    const { el } = await mount();
    const dialog = el.querySelector('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).to.equal('true');
    expect(dialog.getAttribute('aria-label')).to.equal('Paste repeat');
    expect(input(el, 'count').value).to.equal('2');
    expect(input(el, 'every').disabled).to.equal(true);
    expect(el.querySelector('input[value="end"]').checked).to.equal(true);
  });

  it('applies end to end by default', async () => {
    const { el, events } = await mount();
    set(input(el, 'count'), '4');
    el.querySelector('button[type="submit"]').click();
    expect(events).to.deep.equal([{ count: 4, every: 0 }, 'close']);
  });

  it('applies an even spacing when that is chosen', async () => {
    const { el, events } = await mount();
    const spaced = el.querySelector('input[value="spaced"]');
    spaced.checked = true;
    spaced.dispatchEvent(new Event('input', { bubbles: true }));
    await waitUntil(() => !input(el, 'every').disabled, 'the interval stayed disabled');
    set(input(el, 'every'), '2.5');
    set(input(el, 'count'), '3');
    el.querySelector('form').requestSubmit();
    expect(events[0]).to.deep.equal({ count: 3, every: 2.5 });
  });

  it('keeps the count in bounds and closes without applying on Escape or Cancel', async () => {
    const { el, events } = await mount();
    set(input(el, 'count'), '100000');
    el.querySelector('form').requestSubmit();
    expect(events, 'the form refuses a count beyond its maximum').to.deep.equal([]);
    // Whatever reaches the handler is still clamped.
    el.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(events[0].count).to.equal(500);
    events.length = 0;
    el.querySelector('form').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    el.querySelector('.dialog-footer .btn').click();
    expect(events).to.deep.equal(['close', 'close']);
  });
});
