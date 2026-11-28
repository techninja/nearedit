import { fixture, expect, oneEvent } from '@open-wc/testing';
import { settle } from '#utils/ui/testing/mockApi.js';
import { testSnapshot } from '#utils/webUi/testkit.js';
import './web-element-list.js';

async function mount() {
  const el = await fixture(`<web-element-list></web-element-list>`);
  el.snapshot = testSnapshot();
  await settle();
  return el;
}
const names = (el) =>
  [...el.querySelectorAll('.web-element-list-group')].map((group) =>
    [...group.querySelectorAll('.web-element-list-name')].map((name) => name.textContent),
  );

describe('web-element-list', () => {
  it('lists everything under its section and says what is below the picture', async () => {
    const el = await mount();
    expect(names(el)).to.deep.equal([
      ['Hero', 'Get started', 'Pricing'],
      ['Sign up', 'Email'],
    ]);
    const email = el.querySelector('[data-index="4"]');
    expect(email.querySelector('small').textContent).to.equal('↓ below');
    expect(email.querySelector('.chip').textContent).to.equal('input');
    expect(el.querySelector('[data-index="1"] small').textContent).to.equal('');
  });

  it('says when something inside the picture’s bounds is cut off', async () => {
    const el = await fixture(`<web-element-list></web-element-list>`);
    const base = testSnapshot();
    base.elements[1] = { ...base.elements[1], visible: false };
    el.snapshot = base;
    await settle();
    expect(el.querySelector('[data-index="1"] small').textContent).to.equal('cut off');
  });

  it('finds elements by name', async () => {
    const el = await mount();
    const input = el.querySelector('input');
    input.value = 'pri';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(names(el)).to.deep.equal([['Hero', 'Pricing']]);
    input.value = 'zebra';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(el.querySelector('.app-muted').textContent).to.contain('Nothing on the page');
  });

  it('announces a pressed row as a pick of that element, at its middle', async () => {
    const el = await mount();
    setTimeout(() => el.querySelector('[data-index="4"]').click());
    const { detail } = await oneEvent(el, 'web-pick');
    expect(detail.pick.element.target).to.equal('label=Email');
    expect(detail.pick.point).to.deep.equal({ x: 250, y: 1320 });
    expect(detail.x).to.be.a('number');
  });

  it('lets a section itself be picked', async () => {
    const el = await mount();
    setTimeout(() => el.querySelector('[data-index="3"]').click());
    const { detail } = await oneEvent(el, 'web-pick');
    expect(detail.pick.element.target).to.equal('#signup');
  });
});
