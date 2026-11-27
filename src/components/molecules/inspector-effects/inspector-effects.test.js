import { fixture, expect, waitUntil } from '@open-wc/testing';
import './inspector-effects.js';

const STACK = [
  { effectId: 'a', type: 'blur', enabled: true, params: {} },
  { effectId: 'b', type: 'glow', enabled: false, params: {} },
];

async function mount(props = {}) {
  const el = await fixture('<inspector-effects></inspector-effects>');
  Object.assign(el, { effects: STACK, shown: STACK, ...props });
  const actions = [];
  el.addEventListener('effect-action', (e) => actions.push(e.detail));
  await waitUntil(() => el.querySelector('.inspector-effects-add'));
  return { el, actions };
}

describe('inspector-effects', () => {
  it('lists the stack in order, one card each', async () => {
    const { el } = await mount();
    await waitUntil(() => el.querySelectorAll('effect-card').length === 2);
    const cards = [...el.querySelectorAll('effect-card')];
    expect(cards.map((card) => card.effect.type)).to.deep.equal(['blur', 'glow']);
    expect(cards.map((card) => card.index)).to.deep.equal([0, 1]);
    expect(el.querySelector('.field-group-title').textContent).to.contain('Effects · 2');
  });

  it('opens the effect list in place and adds what is picked', async () => {
    const { el, actions } = await mount();
    el.querySelector('.inspector-effects-add').click();
    await waitUntil(() => el.querySelector('effect-catalog .effect-catalog-item'));
    el.querySelector('effect-catalog .effect-catalog-item[data-key="glow"]').click();
    await waitUntil(() => !el.querySelector('effect-catalog'));
    expect(actions.length).to.equal(1);
    expect(actions[0]).to.include({ action: 'add', type: 'glow' });
  });

  it('copies, pastes and bypasses through actions; paste waits for a copy', async () => {
    const { el, actions } = await mount();
    const paste = el.querySelector('[data-action="paste"]');
    expect(paste.disabled).to.equal(true);
    el.pasteable = true;
    await waitUntil(() => !paste.disabled);
    for (const action of ['bypass', 'copy', 'paste'])
      el.querySelector(`[data-action="${action}"]`).click();
    expect(actions).to.deep.equal([{ action: 'bypass' }, { action: 'copy' }, { action: 'paste' }]);
  });

  it('shows where a dragged card would drop', async () => {
    const { el } = await mount();
    await waitUntil(() => el.querySelector('effect-card'));
    el.querySelector('effect-card').dispatchEvent(
      new CustomEvent('effect-drag', { detail: { gap: 2 }, bubbles: true }),
    );
    await waitUntil(() => el.querySelector('.inspector-effects-gap.active'));
    const gaps = [...el.querySelectorAll('.inspector-effects-gap')];
    expect(gaps.indexOf(el.querySelector('.inspector-effects-gap.active'))).to.equal(2);
  });

  it('explains an empty stack, and that several clips share only the buttons', async () => {
    const { el } = await mount({ effects: [], shown: [] });
    await waitUntil(() => el.querySelector('.inspector-effects-note'));
    expect(el.querySelector('.inspector-effects-note').textContent).to.contain('No effects');
    expect(el.querySelector('[data-action="copy"]').disabled).to.equal(true);
    el.owner = 'clips';
    await waitUntil(() =>
      el.querySelector('.inspector-effects-note').textContent.includes('one clip'),
    );
  });

  it('locks every way of changing the stack on a locked track', async () => {
    const context = { clips: [], time: 0, fps: 30, locked: true };
    const { el } = await mount({ context, pasteable: true });
    await waitUntil(() => el.querySelector('.inspector-effects-add').disabled);
    expect(el.querySelector('[data-action="paste"]').disabled).to.equal(true);
    expect(el.querySelector('[data-action="copy"]').disabled, 'copying is harmless').to.equal(
      false,
    );
  });
});
