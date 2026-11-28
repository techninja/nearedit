import { fixture, expect } from '@open-wc/testing';
import { normalizeSong } from '#utils/music/index.js';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './music-drum-grid.js';

const part = (lanes = { kick: 'X...x...X...x...', openHat: '..o.............' }, more = {}) =>
  normalizeSong({ parts: [{ id: 'd', kind: 'drums', lanes, ...more }] }).parts[0];

async function mount(shown = part()) {
  const stage = await fixture('<div style="width:640px"><music-drum-grid></music-drum-grid></div>');
  const el = stage.querySelector('music-drum-grid');
  el.shown = shown;
  const seen = [];
  for (const type of [
    'music-steps',
    'music-lane',
    'music-beat',
    'music-hear',
    'music-view',
    'field-change',
  ]) {
    el.addEventListener(type, (event) => seen.push([type, event.detail]));
  }
  await settle();
  const row = (drum) => el.querySelector(`.music-drum-grid-steps[data-drum="${drum}"]`);
  const cell = (drum, step) => row(drum).querySelector(`[data-step="${step}"]`);
  /** A pointer event over the middle of a step. */
  const pointer = (type, drum, step, more = {}) => {
    const box = cell(drum, step).getBoundingClientRect();
    const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
    row(drum).dispatchEvent(
      new PointerEvent(type, { bubbles: true, button: 0, pointerId: 7, ...at, ...more }),
    );
  };
  const of = (type) => seen.filter(([name]) => name === type).map(([, detail]) => detail);
  return { el, seen, row, cell, pointer, of };
}

describe('music-drum-grid', () => {
  before(() =>
    loadStyles([
      'styles/tokens.css',
      'styles/fields.css',
      'styles/buttons.css',
      'styles/components-create.css',
    ]),
  );

  it('has a row for every drum that plays and the ones at hand, and a button for every step', async () => {
    const { el, cell } = await mount();
    const names = [...el.querySelectorAll('.music-drum-grid-name')].map((name) =>
      name.textContent.trim(),
    );
    expect(names).to.deep.equal(['Kick', 'Snare', 'Clap', 'Closed hat', 'Open hat']);
    expect(
      el.querySelectorAll('.music-drum-grid-steps[data-drum="kick"] [data-step]').length,
    ).to.equal(16);
    expect(cell('kick', 0).dataset.char).to.equal('X');
    expect(cell('kick', 0).getAttribute('aria-label')).to.equal('Kick, bar 1 step 1: accent');
    expect(cell('kick', 4).dataset.place).to.equal('beat');
    expect(cell('kick', 0).dataset.place).to.equal('bar');
    expect(el.querySelector('.music-drum-grid-more').textContent).to.contain('More drums (8)');
    expect(getComputedStyle(cell('kick', 0)).backgroundColor).to.not.equal(
      getComputedStyle(cell('kick', 1)).backgroundColor,
    );
  });

  it('cycles the pressed step and lets its drum be heard: one live change, then the step', async () => {
    const { pointer, of } = await mount();
    pointer('pointerdown', 'snare', 4);
    pointer('pointerup', 'snare', 4);
    expect(of('music-steps')).to.deep.equal([
      { drum: 'snare', steps: [4], char: 'x', phase: 'live' },
      { drum: 'snare', steps: [4], char: 'x', phase: 'commit' },
    ]);
    expect(of('music-hear')).to.deep.equal([{ drum: 'snare', char: 'x' }]);
    pointer('pointerdown', 'kick', 0);
    pointer('pointerup', 'kick', 0);
    expect(of('music-steps')[3]).to.include({ drum: 'kick', char: 'o' }, 'an accent becomes soft');
  });

  it('paints what the first step became across a drag, as one gesture', async () => {
    const { pointer, of } = await mount();
    pointer('pointerdown', 'clap', 2);
    pointer('pointermove', 'clap', 3);
    pointer('pointermove', 'clap', 3);
    pointer('pointermove', 'clap', 5);
    pointer('pointerup', 'clap', 5);
    const steps = of('music-steps');
    expect(steps.map((each) => each.phase)).to.deep.equal(['live', 'live', 'live', 'commit']);
    expect(steps[3]).to.deep.equal({ drum: 'clap', steps: [2, 3, 5], char: 'x', phase: 'commit' });
  });

  it('waits for a finger to lift, and forgets a press that became a scroll', async () => {
    const { pointer, of } = await mount();
    pointer('pointerdown', 'snare', 1, { pointerType: 'touch' });
    expect(of('music-steps')).to.deep.equal([]);
    pointer('pointercancel', 'snare', 1, { pointerType: 'touch' });
    expect(of('music-steps')).to.deep.equal([]);
    pointer('pointerdown', 'snare', 1, { pointerType: 'touch' });
    pointer('pointerup', 'snare', 1, { pointerType: 'touch' });
    expect(of('music-steps')).to.deep.equal([
      { drum: 'snare', steps: [1], char: 'x', phase: 'commit' },
    ]);
    expect(of('music-hear').length).to.equal(1);
  });

  it('walks the grid with the arrow keys; Enter cycles and Delete rests the step in focus', async () => {
    const { el, cell, of } = await mount();
    const key = (target, name) =>
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
      );
    expect(el.querySelectorAll('[data-step][tabindex="0"]').length, 'one Tab stop').to.equal(1);
    cell('kick', 0).focus();
    key(cell('kick', 0), 'ArrowRight');
    key(document.activeElement, 'ArrowDown');
    expect(document.activeElement).to.equal(cell('snare', 1));
    key(document.activeElement, 'End');
    expect(document.activeElement).to.equal(cell('snare', 15));
    key(document.activeElement, 'Enter');
    key(cell('kick', 0), 'Delete');
    expect(of('music-steps')).to.deep.equal([
      { drum: 'snare', steps: [15], char: 'x', phase: 'commit' },
      { drum: 'kick', steps: [0], char: '.', phase: 'commit' },
    ]);
    await settle();
    expect(el.lane).to.equal('kick');
  });

  it('plays a drum from its name and works on that lane with the tools', async () => {
    const { el, of } = await mount();
    el.querySelector('.music-drum-grid-name[data-drum="openHat"]').click();
    await settle();
    expect(of('music-hear')).to.deep.equal([{ drum: 'openHat', char: 'x' }]);
    expect(el.querySelector('.music-drum-grid-lane').textContent).to.equal('Open hat');
    const tools = [...el.querySelectorAll('.music-drum-grid-tools button')];
    tools.find((tool) => tool.title === 'Clear the Open hat lane').click();
    tools.find((tool) => tool.title.includes('one step later')).click();
    tools.find((tool) => tool.title.includes('every 4 steps')).click();
    expect(of('music-lane')).to.deep.equal([
      { action: 'clear', drum: 'openHat', by: 0 },
      { action: 'shift', drum: 'openHat', by: 1 },
      { action: 'fill', drum: 'openHat', by: 4 },
    ]);
  });

  it('chooses the kit and the grid, a named beat and its fill, and unfolds the other drums', async () => {
    const { el, of } = await mount();
    const [kit, steps, beat] = el.querySelectorAll('.music-drum-grid-bar select');
    kit.value = 'lofi';
    kit.dispatchEvent(new Event('change', { bubbles: true }));
    steps.value = '32';
    steps.dispatchEvent(new Event('change', { bubbles: true }));
    expect(of('field-change')).to.deep.equal([
      { name: 'kit', value: 'lofi', phase: 'commit' },
      { name: 'steps', value: '32', phase: 'commit' },
    ]);
    expect([...beat.options].map((option) => option.value)).to.include.members([
      'backbeat',
      'trap',
    ]);
    beat.value = 'trap';
    beat.dispatchEvent(new Event('change', { bubbles: true }));
    [...el.querySelectorAll('.music-drum-grid-bar .btn')]
      .find((b) => b.textContent.trim() === 'Fill')
      .click();
    expect(of('music-beat')).to.deep.equal([{ action: 'beat', name: 'trap' }, { action: 'fill' }]);
    el.querySelector('.music-drum-grid-more').click();
    expect(of('music-view')).to.deep.equal([{ allLanes: true }]);
    el.all = true;
    await settle();
    expect(el.querySelectorAll('.music-drum-grid-row').length).to.equal(13);
  });

  it('keeps the row of a drum that was just emptied, and changes nothing when locked', async () => {
    const { el, pointer, of } = await mount();
    pointer('pointerdown', 'openHat', 2);
    pointer('pointerup', 'openHat', 2);
    el.shown = part({ kick: 'X...x...X...x...' });
    await settle();
    expect(el.querySelector('.music-drum-grid-steps[data-drum="openHat"]'), 'still there').to.exist;
    el.locked = true;
    await settle();
    pointer('pointerdown', 'kick', 1);
    expect(of('music-steps').length).to.equal(2);
  });
});
