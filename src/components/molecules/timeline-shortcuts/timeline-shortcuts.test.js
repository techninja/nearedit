import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import UserPrefs from '#store/UserPrefs.js';
import { getPreset, setKeymap } from '#utils/keyboard/index.js';
import './timeline-shortcuts.js';

const keysOf = (el, label) => {
  const rows = [...el.querySelectorAll('.timeline-shortcuts-row')];
  const row = rows.find((each) => each.firstElementChild.textContent.trim() === label);
  return row ? [...row.querySelectorAll('kbd')].map((key) => key.textContent) : null;
};
const pressed = (el) =>
  [...el.querySelectorAll('timeline-shortcut-prefs [aria-pressed="true"]')].map((b) =>
    b.textContent.trim(),
  );
const segment = (el, text) =>
  [...el.querySelectorAll('timeline-shortcut-prefs .seg button')].find((b) =>
    b.textContent.includes(text),
  );

async function mount() {
  setKeymap({});
  await store.set(UserPrefs, { keymapPreset: 'nearedit', wheelMode: 'scroll' });
  const el = await fixture('<timeline-shortcuts open></timeline-shortcuts>');
  await waitUntil(() => el.querySelector('.timeline-shortcuts-row'), 'the list never rendered');
  return el;
}

describe('timeline-shortcuts', () => {
  after(() => {
    setKeymap({});
    return store.set(UserPrefs, { keymapPreset: 'nearedit', wheelMode: 'scroll' });
  });

  it('lists every command of the registry with the keys of the active layout', async () => {
    const el = await mount();
    expect(pressed(el)).to.deep.equal(['NearEdit', 'Scrolls']);
    expect(keysOf(el, 'Go to start')).to.deep.equal(['Home']);
    expect(keysOf(el, 'Snapping')).to.deep.equal(['N']);
    expect(keysOf(el, 'Shuttle forwards (again: faster)')).to.deep.equal([]);
    expect(keysOf(el, 'Paste repeat…')).to.deep.equal(['Ctrl+B']);
    expect(el.querySelector('[role="dialog"]').getAttribute('aria-label')).to.equal(
      'Keyboard shortcuts',
    );
  });

  it('switches to the Vegas layout, saves the choice and redraws the list', async () => {
    const el = await mount();
    segment(el, 'Vegas').click();
    await waitUntil(
      () => keysOf(el, 'Go to start')?.[0] === 'Ctrl+Home',
      'the list did not follow',
    );
    expect(pressed(el)).to.deep.equal(['Vegas', 'Scrolls']);
    expect(getPreset()).to.equal('vegas');
    expect(keysOf(el, 'Go to start')).to.deep.equal(['Ctrl+Home', 'W']);
    expect(keysOf(el, 'Snapping')).to.deep.equal(['F8']);
    expect(keysOf(el, 'Shuttle forwards (again: faster)')).to.deep.equal(['L']);
    expect(keysOf(el, 'Trim to the time selection')).to.deep.equal(['Ctrl+T', 'Alt+T']);
    expect(keysOf(el, 'Nudge 1 pixel earlier')).to.deep.equal(['Num 4', 'Alt+,']);
    segment(el, 'NearEdit').click();
    await waitUntil(() => keysOf(el, 'Go to start')?.[0] === 'Home', 'did not switch back');
  });

  it('switches the wheel mode and describes the wheel accordingly', async () => {
    const el = await mount();
    expect(keysOf(el, 'Zoom about the pointer')).to.deep.equal(['Ctrl + wheel, or pinch']);
    segment(el, 'Zooms').click();
    await waitUntil(() => store.get(UserPrefs).wheelMode === 'vegas', 'the choice was not saved');
    await waitUntil(() => keysOf(el, 'Move the cursor'), 'the gesture list did not follow');
    expect(keysOf(el, 'Zoom about the pointer')).to.deep.equal(['Wheel, or pinch']);
    expect(pressed(el)).to.deep.equal(['NearEdit', 'Zooms (Vegas)']);
  });

  it('flags a remapped key that collides with another command, in either layout', async () => {
    const el = await mount();
    expect(el.querySelector('.timeline-shortcut-prefs-conflicts')).to.equal(null);
    setKeymap({ 'Ctrl+B': 'edit.split' });
    for (const preset of ['vegas', 'nearedit']) {
      await store.set(UserPrefs, { keymapPreset: preset });
      await waitUntil(() => el.querySelector('.timeline-shortcut-prefs-conflicts'), 'no warning');
      const warning = el.querySelector('.timeline-shortcut-prefs-conflicts').textContent;
      expect(warning.replace(/\s+/g, ' ')).to.match(
        /Ctrl\+B is now “Split at cursor”.*“Paste repeat…”/,
      );
      const clashing = [...el.querySelectorAll('.timeline-shortcuts-row.clash')].map((row) =>
        row.firstElementChild.textContent.trim(),
      );
      expect(clashing.sort()).to.deep.equal(['Paste repeat…', 'Split at cursor']);
      expect(keysOf(el, 'Paste repeat…')).to.deep.equal([]);
    }
    setKeymap({ 'edit.split': 'C' });
    await store.set(UserPrefs, { keymapPreset: 'vegas' });
    await waitUntil(() => !el.querySelector('.timeline-shortcut-prefs-conflicts'), 'stale warning');
    expect(keysOf(el, 'Split at cursor')).to.deep.equal(['C']);
  });

  it('closes on Escape, on the button and on the backdrop', async () => {
    const el = await mount();
    let closed = 0;
    el.addEventListener('close', () => closed++);
    el.querySelector('button[aria-label="Close"]').click();
    el.querySelector('.dialog').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    el.querySelector('.dialog-backdrop').click();
    expect(closed).to.equal(3);
  });
});
