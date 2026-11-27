import { fixture, expect, waitUntil } from '@open-wc/testing';
import './timeline-menu.js';

async function mount(items) {
  const el = await fixture('<timeline-menu></timeline-menu>');
  let closed = 0;
  el.addEventListener('menuclose', () => closed++);
  Object.assign(el, { items, x: 40, y: 30, open: true });
  await waitUntil(() => el.querySelector('.timeline-menu'), 'never opened');
  return { el, closes: () => closed, buttons: () => [...el.querySelectorAll('.menu-item')] };
}

/** A click that began with a press inside the menu, like a real one. */
function press(button) {
  button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
}

describe('timeline-menu', () => {
  it('renders nothing while closed', async () => {
    const el = await fixture('<timeline-menu></timeline-menu>');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(el.querySelector('.timeline-menu')).to.equal(null);
  });

  it('lists items with shortcuts, separators, disabled and checked states', async () => {
    const { el, buttons } = await mount([
      { label: 'Split', shortcut: 'S', run: () => {} },
      { separator: true },
      { label: 'Paste', disabled: true, run: () => {} },
      { label: 'Loop', checked: true, run: () => {} },
    ]);
    expect(el.querySelector('[role="menu"]')).to.exist;
    expect(buttons().map((b) => b.querySelector('span:nth-child(2)').textContent)).to.deep.equal([
      'Split',
      'Paste',
      'Loop',
    ]);
    expect(buttons()[0].querySelector('.kbd').textContent).to.equal('S');
    expect(el.querySelectorAll('.menu-sep').length).to.equal(1);
    expect(buttons()[1].disabled).to.equal(true);
    expect(buttons()[2].getAttribute('role')).to.equal('menuitemcheckbox');
    expect(buttons()[2].getAttribute('aria-checked')).to.equal('true');
    expect(document.activeElement).to.equal(buttons()[0]);
  });

  it('runs the chosen item and asks to be closed', async () => {
    let ran = 0;
    const { buttons, closes } = await mount([{ label: 'Split', run: () => ran++ }]);
    press(buttons()[0]);
    expect(ran).to.equal(1);
    expect(closes()).to.equal(1);
  });

  it('ignores a pointer click whose press began outside (a long-press being lifted)', async () => {
    let ran = 0;
    const { buttons, closes } = await mount([{ label: 'Split', run: () => ran++ }]);
    buttons()[0].dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(ran).to.equal(0);
    expect(closes()).to.equal(0);
    buttons()[0].click(); // a keyboard activation has no pointer: it counts
    expect(ran).to.equal(1);
  });

  it('walks items with the arrow keys and closes on Escape or an outside press', async () => {
    const { el, buttons, closes } = await mount([
      { label: 'One', run: () => {} },
      { label: 'Two', disabled: true, run: () => {} },
      { label: 'Three', run: () => {} },
    ]);
    const key = (name) =>
      document.activeElement.dispatchEvent(
        new KeyboardEvent('keydown', { key: name, bubbles: true }),
      );
    key('ArrowDown');
    expect(document.activeElement).to.equal(buttons()[2], 'skips the disabled item');
    key('ArrowDown');
    expect(document.activeElement).to.equal(buttons()[0], 'wraps around');
    key('Escape');
    expect(closes()).to.equal(1);
    el.querySelector('.timeline-menu-backdrop').dispatchEvent(new Event('pointerdown'));
    expect(closes()).to.equal(2);
    const menu = new Event('contextmenu', { cancelable: true });
    el.querySelector('.timeline-menu-backdrop').dispatchEvent(menu);
    expect(menu.defaultPrevented).to.equal(true);
    expect(closes()).to.equal(2, 'a contextmenu event outside is swallowed, not a close');
  });

  it('stays inside the window', async () => {
    const { el } = await mount([{ label: 'A fairly long menu item label', run: () => {} }]);
    Object.assign(el, { x: window.innerWidth - 5, y: window.innerHeight - 5 });
    await new Promise((resolve) => setTimeout(resolve, 60));
    const rect = el.querySelector('.timeline-menu').getBoundingClientRect();
    expect(rect.right).to.be.at.most(window.innerWidth);
    expect(rect.bottom).to.be.at.most(window.innerHeight);
  });
});
