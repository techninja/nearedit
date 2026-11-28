import { fixture, expect, oneEvent } from '@open-wc/testing';
import { normalizeRecipe } from '#utils/web/index.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './web-topbar.js';

const recipe = (more = {}) => normalizeRecipe({ url: 'https://example.com/', ...more });

async function mount(more) {
  const el = await fixture(`<web-topbar></web-topbar>`);
  el.recipe = recipe(more);
  await settle();
  return el;
}
const changes = (el) => {
  const seen = [];
  el.addEventListener('field-change', (event) => seen.push(event.detail));
  return seen;
};
const choose = (el, name, value) => {
  const control = el.querySelector(`[data-name="${name}"]`);
  control.value = value;
  control.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('web-topbar', () => {
  it('shows the address, the size, the colour scheme and the cursor of the recipe', async () => {
    const el = await mount({ colorScheme: 'dark', cursor: { style: 'dot', size: 1.5 } });
    expect(el.querySelector('.web-topbar-address input').value).to.equal('https://example.com/');
    expect(el.querySelector('[data-name="size"]').value).to.equal('desktop');
    expect(el.querySelector('[data-name="colorScheme"]').value).to.equal('dark');
    expect(el.querySelector('[data-name="cursor.style"]').value).to.equal('dot');
    expect(el.querySelector('[data-name="cursor.size"]').value).to.equal('1.5');
  });

  it('offers a recipe’s own size as Custom', async () => {
    const el = await mount({ viewport: { width: 1000, height: 700 } });
    const size = el.querySelector('[data-name="size"]');
    expect(size.value).to.equal('custom');
    expect(size.selectedOptions[0].textContent.trim()).to.equal('Custom 1000 × 700');
    expect(size.options.length).to.equal(5);
  });

  it('reports a new address when the box is left with one', async () => {
    const el = await mount();
    const seen = changes(el);
    const input = el.querySelector('.web-topbar-address input');
    input.value = ' example.org/app ';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(seen).to.deep.equal([
      { name: 'url', value: 'https://example.org/app', phase: 'commit' },
    ]);
    expect(input.value).to.equal('https://example.org/app');
  });

  it('refuses what is not an address and says why', async () => {
    const el = await mount();
    const seen = changes(el);
    const input = el.querySelector('.web-topbar-address input');
    input.value = 'javascript:alert(1)';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(seen).to.deep.equal([]);
    expect(el.querySelector('[role="alert"]').textContent).to.contain('http');
    expect(input.getAttribute('aria-invalid')).to.equal('true');
  });

  it('reports the dropdowns and the cursor size at once', async () => {
    const el = await mount();
    const seen = changes(el);
    choose(el, 'size', 'phone');
    choose(el, 'colorScheme', 'dark');
    choose(el, 'cursor.style', 'none');
    choose(el, 'cursor.size', '2');
    expect(seen.map((detail) => [detail.name, detail.value])).to.deep.equal([
      ['size', 'phone'],
      ['colorScheme', 'dark'],
      ['cursor.style', 'none'],
      ['cursor.size', 2],
    ]);
  });

  it('asks for a fresh view, and cannot be changed on a locked track', async () => {
    const el = await mount();
    setTimeout(() => el.querySelector('.web-topbar-refresh').click());
    await oneEvent(el, 'web-refresh');
    el.busy = true;
    el.locked = true;
    await settle();
    expect(el.querySelector('.web-topbar-refresh').disabled).to.equal(true);
    expect(el.querySelector('.web-topbar-address input').disabled).to.equal(true);
    expect(el.querySelector('[data-name="size"]').disabled).to.equal(true);
  });
});
