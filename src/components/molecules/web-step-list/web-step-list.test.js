import { fixture, expect } from '@open-wc/testing';
import { normalizeRecipe } from '#utils/web/index.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import { stepRows } from '#utils/webUi/stepRows.js';
import './web-step-list.js';

const STEPS = [{ do: 'wait' }, { do: 'click', target: 'text=Go' }, { do: 'type', target: '#q' }];
const rowsOf = (steps) =>
  stepRows(normalizeRecipe({ url: 'https://example.com', steps }), 30, {
    2: { text: 'type needs "text"' },
  }).rows;

async function mount(selected = 1, steps = STEPS) {
  const el = await fixture(`<web-step-list></web-step-list>`);
  el.rows = rowsOf(steps);
  el.selected = selected;
  await settle();
  const seen = [];
  for (const name of ['web-select', 'web-step', 'web-step-menu'])
    el.addEventListener(name, (event) => seen.push([name, event.detail]));
  return {
    el,
    seen,
    row: (index) => el.querySelector(`.web-step-list-row[data-index="${index}"]`),
  };
}
const key = (target, name, more = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...more }));

describe('web-step-list', () => {
  it('lists every step with its label, start and length, then the end', async () => {
    const { el, row } = await mount();
    const rows = [...el.querySelectorAll('.web-step-list-row')];
    expect(rows.length).to.equal(4);
    expect(row(1).querySelector('.web-step-list-label').textContent).to.equal('Click: text=Go');
    expect(row(1).querySelector('.web-step-list-time').textContent).to.equal('0:01.6 · 1.3 s');
    expect(row(3).textContent).to.contain('End');
    expect(row(1).getAttribute('aria-selected')).to.equal('true');
    expect(row(1).tabIndex).to.equal(0);
    expect(row(0).tabIndex).to.equal(-1);
  });

  it('shows what is wrong with a step', async () => {
    const { row } = await mount();
    expect(row(2).classList.contains('has-problem')).to.equal(true);
    expect(row(2).title).to.equal('type needs "text"');
    expect(row(2).querySelector('app-icon')).to.not.equal(null);
    expect(row(0).classList.contains('has-problem')).to.equal(false);
  });

  it('selects on a press and with the arrow keys, the end included', async () => {
    const { seen, row } = await mount();
    row(0).click();
    key(row(1), 'ArrowDown');
    key(row(2), 'ArrowDown');
    key(row(3), 'ArrowDown');
    key(row(1), 'Home');
    expect(seen).to.deep.equal([
      ['web-select', { index: 0 }],
      ['web-select', { index: 2 }],
      ['web-select', { index: 3 }],
      ['web-select', { index: 0 }],
    ]);
  });

  it('moves a step with Alt+arrows, deletes with Delete and copies with Ctrl+D', async () => {
    const { seen, row } = await mount();
    key(row(1), 'ArrowUp', { altKey: true });
    key(row(1), 'ArrowDown', { altKey: true });
    key(row(0), 'ArrowUp', { altKey: true });
    key(row(1), 'Delete');
    key(row(1), 'd', { ctrlKey: true });
    key(row(3), 'Delete');
    expect(seen).to.deep.equal([
      ['web-step', { action: 'move', index: 1, to: 0 }],
      ['web-step', { action: 'move', index: 1, to: 2 }],
      ['web-step', { action: 'remove', index: 1 }],
      ['web-step', { action: 'duplicate', index: 1 }],
    ]);
  });

  it('gives the selected row buttons to move, copy and delete it', async () => {
    const { el, seen, row } = await mount(0);
    const buttons = [...row(0).querySelectorAll('.web-step-list-actions button')];
    expect(buttons.map((b) => b.dataset.action)).to.deep.equal([
      'up',
      'down',
      'duplicate',
      'remove',
    ]);
    expect(buttons[0].disabled).to.equal(true);
    buttons[1].click();
    buttons[2].click();
    buttons[3].click();
    expect(seen).to.deep.equal([
      ['web-step', { action: 'move', index: 0, to: 1 }],
      ['web-step', { action: 'duplicate', index: 0 }],
      ['web-step', { action: 'remove', index: 0 }],
    ]);
    expect(row(1).querySelector('.web-step-list-actions')).to.equal(null);
    el.locked = true;
    await settle();
    expect(row(0).querySelector('.web-step-list-actions')).to.equal(null);
    expect(row(0).getAttribute('draggable')).to.equal('false');
  });

  it('asks for the menu of step kinds under its add button, which says where the step goes', async () => {
    const { el, seen } = await mount(3);
    const add = el.querySelector('.web-step-list-add');
    expect(add.tagName).to.equal('BUTTON');
    expect(add.textContent).to.contain('Add a step at the end');
    add.click();
    const box = add.getBoundingClientRect();
    expect(seen).to.deep.equal([['web-step-menu', { x: box.left, y: box.bottom }]]);
    el.selected = 0;
    await settle();
    expect(el.querySelector('.web-step-list-add').textContent).to.contain('after step 1');
  });

  it('reorders by dragging a row to a gap between rows', async () => {
    const { el, seen, row } = await mount();
    const transfer = new DataTransfer();
    row(0).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    const last = row(2).getBoundingClientRect();
    const list = el.querySelector('.web-step-list-rows');
    const over = {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
      clientY: last.bottom - 1,
    };
    list.dispatchEvent(new DragEvent('dragover', over));
    await settle();
    expect(row(2).dataset.drop).to.equal('after');
    list.dispatchEvent(new DragEvent('drop', over));
    expect(seen).to.deep.equal([['web-step', { action: 'move', index: 0, to: 2 }]]);
    expect(el.dragged).to.equal(-1);
  });

  it('keeps the keyboard focus on the selection as it moves', async () => {
    const { el, row } = await mount();
    row(1).focus();
    el.selected = 2;
    await settle(120);
    expect(document.activeElement === row(2)).to.equal(true);
  });

  it('puts the focus back on the selected row after a key removed the row it was on', async () => {
    const { el, row } = await mount(2);
    row(2).focus();
    key(row(2), 'Delete');
    // The owner removes the step: two rows are left and the end is selected.
    el.rows = rowsOf(STEPS.slice(0, 2));
    el.selected = 2;
    await settle(150);
    expect(document.activeElement === row(2)).to.equal(true);
    expect(row(2).classList.contains('web-step-list-end')).to.equal(true);
  });
});
