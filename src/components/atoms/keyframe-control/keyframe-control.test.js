import { fixture, expect, waitUntil } from '@open-wc/testing';
import './keyframe-control.js';

const tick = () => new Promise((r) => requestAnimationFrame(() => r()));

async function mount(props = {}) {
  const el = await fixture('<keyframe-control label="Position"></keyframe-control>');
  Object.assign(el, { paths: ['transform.x', 'transform.y'], ...props });
  const events = [];
  el.addEventListener('keyframe-action', (e) => events.push(e.detail));
  await waitUntil(() => el.querySelector('.keyframe-control-key'));
  await tick();
  return { el, events, key: () => el.querySelector('.keyframe-control-key') };
}

describe('keyframe-control', () => {
  it('shows only a quiet diamond while the property is not animated', async () => {
    const { el, events, key } = await mount();
    expect(el.getAttribute('state')).to.equal('none');
    expect(el.querySelectorAll('button').length).to.equal(1);
    expect(key().getAttribute('aria-pressed')).to.equal('false');
    expect(key().title).to.contain('Animate');
    key().click();
    expect(events).to.deep.equal([{ paths: ['transform.x', 'transform.y'], action: 'toggle' }]);
  });

  it('tells a key under the playhead from a time between keys', async () => {
    const { el, key } = await mount({ state: 'key', previous: true, next: false });
    expect(el.getAttribute('state')).to.equal('key');
    expect(key().getAttribute('aria-pressed')).to.equal('true');
    expect(key().title).to.contain('Remove');
    el.state = 'between';
    await waitUntil(() => el.getAttribute('state') === 'between');
    expect(key().getAttribute('aria-pressed')).to.equal('false');
    expect(key().title).to.contain('Add');
  });

  it('steps to the previous and next key, where there is one', async () => {
    const { el, events } = await mount({ state: 'between', previous: true, next: false });
    const [previous, next] = el.querySelectorAll('.keyframe-control-step');
    expect(next.disabled).to.equal(true);
    previous.click();
    next.click();
    expect(events.map((e) => e.action)).to.deep.equal(['previous']);
  });

  it('opens a menu that sets the easing of the current key or stops the animation', async () => {
    const { el, events } = await mount({
      state: 'key',
      current: true,
      ease: 'ease-out',
      next: true,
    });
    el.querySelector('.keyframe-control-more').click();
    await waitUntil(() => el.querySelector('[role="menu"]'));
    const checked = el.querySelector('[role="menuitemradio"][aria-checked="true"]');
    expect(checked.dataset.ease).to.equal('ease-out');
    await waitUntil(() => document.activeElement === checked, 'the current easing takes focus');
    el.querySelector('.menu-item[data-ease="hold"]').click();
    await waitUntil(() => !el.querySelector('[role="menu"]'));
    expect(events).to.deep.equal([{ paths: el.paths, action: 'ease', ease: 'hold' }]);
    el.querySelector('.keyframe-control-more').click();
    await waitUntil(() => el.querySelector('[role="menu"]'));
    el.querySelector('.menu-item[data-action="next"]').click();
    expect(el.querySelector('[role="menu"]'), 'stepping keeps the menu open').to.exist;
    el.querySelector('.menu-item[data-action="stop"]').click();
    expect(events.slice(1).map((e) => e.action)).to.deep.equal(['next', 'stop']);
  });

  it('closes the menu on Escape without letting the key out, and on a press outside', async () => {
    const { el } = await mount({ state: 'between', current: false });
    el.querySelector('.keyframe-control-more').click();
    await waitUntil(() => el.querySelector('[role="menu"]'));
    expect(el.querySelector('.menu-item[data-ease="linear"]').disabled, 'no key to ease').to.equal(
      true,
    );
    let leaked = 0;
    const count = () => leaked++;
    window.addEventListener('keydown', count);
    el.querySelector('[role="menu"]').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    window.removeEventListener('keydown', count);
    await waitUntil(() => !el.querySelector('[role="menu"]'));
    expect(leaked).to.equal(0);
    el.querySelector('.keyframe-control-more').click();
    await waitUntil(() => el.querySelector('.keyframe-control-backdrop'));
    el.querySelector('.keyframe-control-backdrop').click();
    await waitUntil(() => !el.querySelector('[role="menu"]'));
  });

  it('does nothing while disabled', async () => {
    const { key } = await mount({ state: 'key', disabled: true });
    expect(key().disabled).to.equal(true);
  });
});
