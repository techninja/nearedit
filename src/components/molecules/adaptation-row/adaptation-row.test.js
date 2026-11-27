import { fixture, expect } from '@open-wc/testing';
import './adaptation-row.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const ADAPTATION = {
  id: 'a2',
  projectId: 'p1',
  parentAdaptationId: 'a1',
  name: 'Vertical reel',
  aspectRatio: '9:16',
  resolution: '1080x1920',
  fps: 30,
  status: 'review',
};

async function mount(extra = {}) {
  const el = await fixture(`<adaptation-row></adaptation-row>`);
  Object.assign(el, { adaptation: ADAPTATION, depth: 1, parentName: 'Main Edit', ...extra });
  await frame();
  const actions = [];
  el.addEventListener('adaptationaction', (event) =>
    actions.push([event.detail.action, event.detail.value, event.detail.adaptation.id]),
  );
  return { el, actions };
}

describe('adaptation-row', () => {
  it('shows the adaptation with links into the editor', async () => {
    const { el } = await mount();
    const name = el.querySelector('.adaptation-row-name');
    expect(name.textContent).to.equal('Vertical reel');
    expect(name.getAttribute('href')).to.equal('/editor/p1/a2');
    expect(el.querySelector('.adaptation-row-open').getAttribute('href')).to.equal('/editor/p1/a2');
    expect(el.querySelector('.adaptation-row-aspect').textContent).to.equal('9:16');
    expect(
      el.querySelector('.adaptation-row-meta').textContent.replace(/\s+/g, ' ').trim(),
    ).to.equal('1080×1920 · 30 fps');
    expect(el.querySelector('.adaptation-row-status').value).to.equal('review');
  });

  it('is indented as a variant and says of what', async () => {
    const { el } = await mount();
    expect(el.querySelector('.adaptation-row').style.getPropertyValue('--depth')).to.equal('1');
    expect(el.querySelector('.adaptation-row-branch')).to.not.equal(null);
    expect(el.querySelector('.sr-only').textContent).to.contain('variant of Main Edit');
    const { el: root } = await mount({ depth: 0, parentName: '' });
    expect(root.querySelector('.adaptation-row-branch')).to.equal(null);
  });

  it('announces variant, edit, delete and status changes', async () => {
    const { el, actions } = await mount();
    el.querySelector('[data-action="variant"]').click();
    el.querySelector('[data-action="edit"]').click();
    el.querySelector('[data-action="delete"]').click();
    const status = el.querySelector('[data-action="status"]');
    status.value = 'final';
    status.dispatchEvent(new Event('change', { bubbles: true }));
    expect(actions).to.deep.equal([
      ['variant', '', 'a2'],
      ['edit', '', 'a2'],
      ['delete', '', 'a2'],
      ['status', 'final', 'a2'],
    ]);
  });

  it('cannot delete the only adaptation, and says why', async () => {
    const { el } = await mount({ sole: true });
    const button = el.querySelector('[data-action="delete"]');
    expect(button.disabled).to.equal(true);
    expect(button.title).to.equal('A project needs at least one adaptation');
  });
});
