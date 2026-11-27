import { fixture, expect, waitUntil } from '@open-wc/testing';
import { EFFECTS } from '#utils/compose/catalog.js';
import { EFFECT_DRAG_TYPE, draggedPayload } from '#utils/create/dragTypes.js';
import './effect-catalog.js';

async function mount(props = {}) {
  const el = await fixture('<effect-catalog></effect-catalog>');
  Object.assign(el, props);
  const picks = [];
  el.addEventListener('effect-pick', (e) => picks.push(e.detail));
  await waitUntil(() => el.querySelector('.effect-catalog-item'));
  return { el, picks, items: () => [...el.querySelectorAll('.effect-catalog-item')] };
}

describe('effect-catalog', () => {
  it('lists every effect of the catalog under its category', async () => {
    const { el, items } = await mount();
    for (const effect of EFFECTS) {
      expect(el.querySelector(`.effect-catalog-item[data-key="${effect.type}"]`), effect.type).to
        .exist;
    }
    expect(items().length).to.be.at.least(EFFECTS.length);
    expect(el.querySelectorAll('.field-group-title').length).to.be.at.least(2);
  });

  it('narrows as you type and says when nothing matches', async () => {
    const { el, items } = await mount();
    const input = el.querySelector('input[type=search]');
    input.value = 'glow';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await waitUntil(() => items().length < EFFECTS.length);
    expect(items().some((item) => item.dataset.key === 'glow')).to.equal(true);
    input.value = 'zzzz';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await waitUntil(() => el.querySelector('.empty-state'));
    expect(el.querySelector('.empty-state').textContent).to.contain('zzzz');
  });

  it('announces a pick as the action to apply', async () => {
    const { el, picks } = await mount({ hint: 'Adds to “Talk”.' });
    await waitUntil(() => el.querySelector('.effect-catalog-hint'));
    el.querySelector('.effect-catalog-item[data-key="blur"]').click();
    expect(picks.length).to.equal(1);
    expect(picks[0]).to.include({ action: 'add', type: 'blur', label: 'Blur' });
  });

  it('cannot be picked from while disabled, and carries its effect when dragged', async () => {
    const { el, picks } = await mount({ disabled: true, dragItems: true });
    await waitUntil(() => el.querySelector('.effect-catalog-item').disabled);
    el.querySelector('.effect-catalog-item').click();
    expect(picks).to.deep.equal([]);
    el.disabled = false;
    await waitUntil(() => !el.querySelector('.effect-catalog-item').disabled);
    const item = el.querySelector('.effect-catalog-item[data-key="glow"]');
    expect(item.getAttribute('draggable')).to.equal('true');
    const dataTransfer = new DataTransfer();
    item.dispatchEvent(new DragEvent('dragstart', { dataTransfer, bubbles: true }));
    expect(JSON.parse(dataTransfer.getData(EFFECT_DRAG_TYPE))).to.include({
      action: 'add',
      type: 'glow',
    });
    expect(draggedPayload(EFFECT_DRAG_TYPE).type).to.equal('glow');
    item.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
    expect(draggedPayload(EFFECT_DRAG_TYPE)).to.equal(null);
  });
});
