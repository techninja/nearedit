import { fixture, expect, waitUntil } from '@open-wc/testing';
import { FONT_FAMILIES } from '#utils/compose/fonts.js';
import './field-font.js';

async function mount(props = {}) {
  const el = await fixture('<field-font name="text.fontFamily"></field-font>');
  Object.assign(el, { value: 'Inter', ...props });
  const events = [];
  el.addEventListener('field-change', (e) => events.push(e.detail));
  await waitUntil(() => el.querySelector('.field-font-current'));
  return { el, events, button: el.querySelector('.field-font-current') };
}
const open = async (el, button) => {
  button.click();
  await waitUntil(() => el.querySelector('[role="listbox"]'));
  return [...el.querySelectorAll('[role="option"]')];
};

describe('field-font', () => {
  it('shows the current family in its own face; generic names mean a bundled one', async () => {
    const { el, button } = await mount({ value: 'serif' });
    await waitUntil(() => button.textContent.includes('Playfair Display'));
    expect(button.style.fontFamily).to.contain('Playfair Display');
    el.mixed = true;
    await waitUntil(() => button.textContent.includes('Mixed'));
  });

  it('lists every bundled family, each in its face, and reports the choice', async () => {
    const { el, events, button } = await mount();
    const options = await open(el, button);
    expect(options.map((o) => o.textContent.trim())).to.deep.equal(
      FONT_FAMILIES.map((f) => f.label),
    );
    for (const option of options) expect(option.style.fontFamily).to.contain(option.dataset.value);
    expect(options[0].getAttribute('aria-selected')).to.equal('true');
    await waitUntil(() => document.activeElement === options[0], 'the current family has focus');
    options[3].click();
    await waitUntil(() => !el.querySelector('[role="listbox"]'));
    expect(events).to.deep.equal([
      { name: 'text.fontFamily', value: FONT_FAMILIES[3].id, phase: 'commit' },
    ]);
  });

  it('moves with the arrow keys, closes on Escape, and keeps its keys to itself', async () => {
    const { el, events, button } = await mount();
    const options = await open(el, button);
    await waitUntil(() => document.activeElement === options[0]);
    let leaked = 0;
    const count = () => leaked++;
    window.addEventListener('keydown', count);
    const press = (key) =>
      document.activeElement.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );
    press('ArrowDown');
    expect(document.activeElement).to.equal(options[1]);
    press('Escape');
    window.removeEventListener('keydown', count);
    await waitUntil(() => !el.querySelector('[role="listbox"]'));
    expect(leaked).to.equal(0);
    expect(events).to.deep.equal([]);
    expect(document.activeElement).to.equal(button);
  });

  it('choosing the family it already has changes nothing', async () => {
    const { el, events, button } = await mount();
    (await open(el, button))[0].click();
    expect(events).to.deep.equal([]);
  });
});
