import { fixture, expect } from '@open-wc/testing';
import './director-modes.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const CHOICES = [
  { id: 'replace', label: 'Replace the timeline', hint: 'Everything makes way', available: true },
  { id: 'insert', label: 'Insert at the cursor', hint: 'At 00:00:12:15', available: true },
  { id: 'range', label: 'Replace a range', hint: 'Set a loop region first', available: false },
];

async function mount(mode = 'replace') {
  const el = await fixture(`<director-modes></director-modes>`);
  el.choices = CHOICES;
  el.mode = mode;
  await frame();
  return el;
}

describe('director-modes', () => {
  it('offers the choices as radio buttons with the current one checked', async () => {
    const el = await mount('insert');
    const radios = [...el.querySelectorAll('input[type="radio"]')];
    expect(radios.map((r) => [r.value, r.checked, r.disabled])).to.deep.equal([
      ['replace', false, false],
      ['insert', true, false],
      ['range', false, true],
    ]);
  });

  it('says where the chosen mode goes and why an unavailable one is off', async () => {
    const el = await mount('insert');
    const hints = [...el.querySelectorAll('.director-modes-hint')].map((n) => n.textContent);
    expect(hints).to.deep.equal(['At 00:00:12:15', 'Set a loop region first']);
  });

  it('announces a change as a field change of "mode"', async () => {
    const el = await mount();
    const seen = [];
    el.addEventListener('fieldchange', (event) => seen.push(event.detail));
    const radio = el.querySelector('input[value="insert"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(seen).to.deep.equal([{ key: 'mode', value: 'insert' }]);
  });

  it('shows a problem reported by the server', async () => {
    const el = await mount();
    el.problem = 'mode "range" needs context.range';
    await frame();
    expect(el.querySelector('[role="alert"]').textContent).to.contain('needs context.range');
  });
});
