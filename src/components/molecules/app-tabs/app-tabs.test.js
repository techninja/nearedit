import { fixture, expect } from '@open-wc/testing';
import './app-tabs.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const TABS = [
  { id: 'media', label: 'Media', icon: 'film' },
  { id: 'inspector', label: 'Inspector' },
  { id: 'director', label: 'Director' },
];

async function mount(active = 'media') {
  const el = await fixture(`<app-tabs label="Panels" panel-prefix="dock-"></app-tabs>`);
  el.tabs = TABS;
  el.active = active;
  await frame();
  return el;
}

describe('app-tabs', () => {
  it('renders a labelled tab list with one selected tab', async () => {
    const el = await mount('inspector');
    const list = el.querySelector('[role="tablist"]');
    const tabs = [...el.querySelectorAll('[role="tab"]')];
    expect(list.getAttribute('aria-label')).to.equal('Panels');
    expect(tabs.map((tab) => tab.textContent.trim())).to.deep.equal([
      'Media',
      'Inspector',
      'Director',
    ]);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).to.deep.equal([
      'false',
      'true',
      'false',
    ]);
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).to.deep.equal(['-1', '0', '-1']);
    expect(tabs[1].getAttribute('aria-controls')).to.equal('dock-inspector');
    expect(tabs[0].querySelector('app-icon')).to.not.equal(null);
  });

  it('announces a clicked tab', async () => {
    const el = await mount();
    const seen = [];
    el.addEventListener('tabchange', (event) => seen.push(event.detail.id));
    el.querySelectorAll('[role="tab"]')[2].click();
    expect(seen).to.deep.equal(['director']);
  });

  it('moves and selects with the arrow keys, wrapping around', async () => {
    const el = await mount();
    const tabs = [...el.querySelectorAll('[role="tab"]')];
    const seen = [];
    el.addEventListener('tabchange', (event) => seen.push(event.detail.id));
    const press = (target, key) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    tabs[0].focus();
    press(tabs[0], 'ArrowRight');
    expect(document.activeElement).to.equal(tabs[1]);
    press(tabs[1], 'End');
    expect(document.activeElement).to.equal(tabs[2]);
    press(tabs[2], 'ArrowRight');
    expect(document.activeElement).to.equal(tabs[0]);
    press(tabs[0], 'ArrowLeft');
    expect(seen).to.deep.equal(['inspector', 'director', 'media', 'director']);
  });

  it('keeps the first tab reachable when nothing is selected', async () => {
    const el = await mount('');
    const tabs = [...el.querySelectorAll('[role="tab"]')];
    expect(tabs[0].getAttribute('tabindex')).to.equal('0');
  });
});
