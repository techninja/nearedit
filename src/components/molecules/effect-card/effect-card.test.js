import { fixture, expect, waitUntil } from '@open-wc/testing';
import { createClip } from '#utils/edl/factory.js';
import './effect-card.js';

const BLUR = { effectId: 'fx_1', type: 'blur', enabled: true, params: { radius: 12 } };

async function mount(props = {}) {
  const list = await fixture('<div></div>');
  const el = document.createElement('effect-card');
  Object.assign(el, { effect: BLUR, values: BLUR.params, index: 1, count: 3, ...props });
  list.append(el);
  const events = [];
  list.addEventListener('effect-action', (e) => events.push(e.detail));
  list.addEventListener('field-change', (e) => events.push(e.detail));
  await waitUntil(() => el.querySelector('.effect-card-title'));
  return { el, events };
}
const key = (target, name) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
  );

describe('effect-card', () => {
  it('shows the effect by its catalog name with controls from its schema', async () => {
    const { el } = await mount();
    expect(el.querySelector('.effect-card-title').textContent.trim()).to.equal('Blur');
    await waitUntil(() =>
      el.querySelector('field-number[name="effects.fx_1.radius"] input.field-num'),
    );
    const radius = el.querySelector('field-number[name="effects.fx_1.radius"] input.field-num');
    await waitUntil(() => radius.value === '12');
    expect(el.querySelector('keyframe-control'), 'no clip, no keyframes').to.equal(null);
  });

  it('offers keyframe buttons on a clip, in their state at the playhead', async () => {
    const clip = createClip({
      clipId: 'c',
      timelineEnd: 5,
      effects: [BLUR],
      keyframes: { 'effects.fx_1.radius': [{ t: 1, v: 12, ease: 'linear' }] },
    });
    const { el } = await mount({ context: { clips: [clip], time: 1, fps: 30, locked: false } });
    await waitUntil(() => el.querySelector('keyframe-control'));
    expect(el.querySelector('keyframe-control').getAttribute('state')).to.equal('key');
  });

  it('reports switching, resetting and removing as effect actions', async () => {
    const { el, events } = await mount();
    for (const action of ['toggle', 'reset', 'remove']) {
      el.querySelector(`[data-action="${action}"]`).click();
    }
    expect(events).to.deep.equal([
      { action: 'toggle', effectId: 'fx_1' },
      { action: 'reset', effectId: 'fx_1' },
      { action: 'remove', effectId: 'fx_1' },
    ]);
    expect(el.querySelector('[data-action="toggle"]').getAttribute('aria-pressed')).to.equal(
      'true',
    );
  });

  it('collapses on its name and marks an effect that is switched off', async () => {
    const { el } = await mount({ effect: { ...BLUR, enabled: false } });
    expect(el.querySelector('.effect-card').dataset.enabled).to.equal('false');
    el.querySelector('.effect-card-title').click();
    await waitUntil(() => !el.querySelector('.effect-card-body'));
    expect(el.querySelector('.effect-card-title').getAttribute('aria-expanded')).to.equal('false');
  });

  it('moves with the arrow keys on its grip, and keeps those keys', async () => {
    const { el, events } = await mount();
    const grip = el.querySelector('.effect-card-grip');
    let leaked = 0;
    const count = () => leaked++;
    window.addEventListener('keydown', count);
    key(grip, 'ArrowUp');
    key(grip, 'End');
    key(grip, 'a');
    window.removeEventListener('keydown', count);
    expect(events).to.deep.equal([
      { action: 'move', effectId: 'fx_1', toIndex: 0 },
      { action: 'move', effectId: 'fx_1', toIndex: 2 },
    ]);
    expect(leaked, 'only the unrelated key gets out').to.equal(1);
  });

  it('says so for an effect type the catalog does not have', async () => {
    const { el } = await mount({ effect: { ...BLUR, type: 'sparkle9' }, values: {} });
    expect(el.querySelector('.effect-card-note').textContent).to.contain('sparkle9');
    expect(el.querySelectorAll('field-number').length).to.equal(0);
  });
});
