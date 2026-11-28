import { fixture, expect } from '@open-wc/testing';
import { normalizeSong } from '#utils/music/index.js';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import { BEAT, ROW, rowTop } from '#utils/musicUi/rollModel.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './music-piano-roll.js';

const song = (notes) =>
  normalizeSong({ key: 'C', scale: 'major', parts: [{ id: 's', kind: 'synth', bars: 2, notes }] });
const NOTES = [
  [0, 1, 60, 0.8],
  [1, 0.5, 64, 0.5],
  [2, 2, 67, 1],
];

async function mount(notes = NOTES) {
  const made = song(notes);
  const stage = await fixture(
    '<div style="display:flex;width:640px;height:420px"><music-piano-roll></music-piano-roll></div>',
  );
  const el = stage.querySelector('music-piano-roll');
  Object.assign(el, { shown: made.parts[0], song: made });
  const seen = [];
  for (const type of ['music-notes', 'music-select', 'music-hear', 'music-view', 'field-change']) {
    el.addEventListener(type, (event) => {
      seen.push([type, event.detail]);
      // What the music editor does: the selection and the notes come back as properties.
      if (type === 'music-select') el.selected = event.detail.keys;
      if (type === 'music-notes') {
        el.selected = event.detail.keys;
        el.shown = { ...el.shown, notes: event.detail.notes };
      }
    });
  }
  await settle();
  const area = el.querySelector('.music-piano-roll-area');
  /** A pointer event at a beat and a pitch of the roll (on `target`, default the area). */
  const pointer = (type, beat, pitch, more = {}, target = area) => {
    const box = area.getBoundingClientRect();
    const at = { clientX: box.left + beat * BEAT, clientY: box.top + rowTop(pitch) + ROW / 2 };
    target.dispatchEvent(
      new PointerEvent(type, { bubbles: true, button: 0, pointerId: 3, ...at, ...more }),
    );
  };
  const note = (key) => el.querySelector(`.music-piano-roll-note[data-key="${key}"]`);
  const of = (type) => seen.filter(([name]) => name === type).map(([, detail]) => detail);
  const key = (name, more = {}) =>
    area.dispatchEvent(
      new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...more }),
    );
  const starts = () => el.shown.notes.map(([beat, , pitch]) => `${beat}:${pitch}`);
  return { el, area, pointer, note, of, key, starts };
}

describe('music-piano-roll', () => {
  before(() =>
    loadStyles([
      'styles/tokens.css',
      'styles/fields.css',
      'styles/buttons.css',
      'styles/components-create.css',
    ]),
  );

  it('draws every note where it sounds, with its velocity, on rows that show the scale', async () => {
    const { el, area, note } = await mount();
    expect(el.querySelectorAll('.music-piano-roll-note').length).to.equal(3);
    const box = note('1:64').getBoundingClientRect();
    const origin = area.getBoundingClientRect();
    expect(Math.round(box.left - origin.left)).to.equal(BEAT);
    expect(Math.round(box.top - origin.top)).to.equal(rowTop(64));
    expect(Math.round(box.width)).to.equal(BEAT / 2 - 1);
    expect(note('1:64').querySelector('i').style.width).to.equal('50%');
    expect(Math.round(origin.width)).to.equal(8 * BEAT);
    const keys = el.querySelectorAll('music-keys button');
    expect(keys.length).to.equal(128);
    const c4 = el.querySelector('music-keys [data-pitch="60"]');
    expect([c4.textContent.trim(), c4.dataset.scale, c4.dataset.black]).to.deep.equal([
      'C4',
      'true',
      'false',
    ]);
    expect(el.querySelector('music-keys [data-pitch="61"]').dataset.scale).to.equal('false');
    expect(area.style.getPropertyValue('--roll-bands')).to.contain('var(--roll-out)');
    const view = el.querySelector('.music-piano-roll-scroll');
    expect(view.scrollTop, 'scrolled to the notes').to.be.greaterThan(rowTop(80));
  });

  it('adds a note where empty space is clicked, on the grid, and lets it be heard', async () => {
    const { pointer, of, starts } = await mount();
    pointer('pointerdown', 4.6, 62);
    pointer('pointerup', 4.6, 62);
    expect(starts()).to.include('4.5:62');
    const [added] = of('music-notes');
    expect([added.phase, added.keys]).to.deep.equal(['commit', ['4.5:62']]);
    expect(of('music-hear')[0]).to.include({ pitch: 62 });
  });

  it('moves a dragged note by grid steps and semitones: live, then one commit', async () => {
    const { pointer, note, of, starts } = await mount();
    pointer('pointerdown', 0.2, 60, {}, note('0:60'));
    expect(of('music-select')).to.deep.equal([{ keys: ['0:60'] }]);
    pointer('pointermove', 0.2 + 0.55, 62);
    pointer('pointermove', 0.2 + 1.05, 63);
    pointer('pointerup', 0.2 + 1.05, 63);
    expect(of('music-notes').map((each) => each.phase)).to.deep.equal(['live', 'live', 'commit']);
    expect(starts()).to.deep.equal(['1:63', '1:64', '2:67']);
    expect(of('music-notes')[2].keys).to.deep.equal(['1:63']);
  });

  it('settles a moved note on the scale when asked', async () => {
    const { el, pointer, note, starts } = await mount();
    el.snapScale = true;
    await settle();
    pointer('pointerdown', 0.2, 60, {}, note('0:60'));
    pointer('pointermove', 0.2, 61);
    pointer('pointerup', 0.2, 61);
    expect(starts()[0], 'C sharp is not in C major').to.equal('0:60');
  });

  it('resizes from the end of a note, and new notes take that length', async () => {
    const { el, pointer, note } = await mount();
    pointer('pointerdown', 1.45, 64, {}, note('1:64').querySelector('.music-piano-roll-grip'));
    pointer('pointermove', 1.45 + 0.5, 64);
    pointer('pointerup', 1.45 + 0.5, 64);
    expect(el.shown.notes[1][1]).to.equal(1);
    expect(el.length).to.equal(1);
  });

  it('selects with a box dragged over empty space, and removes with Delete or a double click', async () => {
    const { el, pointer, note, key, starts } = await mount();
    pointer('pointerdown', 0.8, 70);
    pointer('pointermove', 3, 62);
    await settle();
    expect(el.querySelector('.music-piano-roll-box')).to.exist;
    pointer('pointerup', 3, 62);
    await settle();
    expect(el.selected).to.deep.equal(['1:64', '2:67']);
    expect(note('2:67').dataset.selected).to.equal('true');
    expect(el.querySelector('.music-piano-roll-box')).to.not.exist;
    key('Delete');
    expect(starts()).to.deep.equal(['0:60']);
    await settle();
    note('0:60').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(starts()).to.deep.equal([]);
  });

  it('nudges the selection with the arrows — one undo step for a held key', async () => {
    const { el, area, key, of, starts } = await mount();
    el.selected = ['0:60'];
    await settle();
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowUp', { shiftKey: true });
    expect(starts()).to.deep.equal(['0.5:72', '1:64', '2:67']);
    expect(of('music-notes').every((each) => each.phase === 'live')).to.equal(true);
    area.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', bubbles: true }));
    expect(of('music-notes').at(-1).phase).to.equal('commit');
    key('ArrowRight', { shiftKey: true });
    expect(
      el.shown.notes.find((note) => note[2] === 72)[1],
      'Shift and → makes it longer',
    ).to.equal(1.25);
    key('Escape');
    expect(el.selected).to.deep.equal([]);
  });

  it('works without a pointer: a cursor, Enter to add or select, comma and full stop to walk', async () => {
    const { el, key, of, starts } = await mount();
    key('ArrowRight');
    key('ArrowUp');
    await settle();
    expect(el.cursor).to.deep.equal({ beat: 0.25, pitch: 61 });
    key('Enter');
    expect(starts()).to.include('0.25:61');
    expect(el.selected).to.deep.equal(['0.25:61']);
    key('.');
    expect(el.selected).to.deep.equal(['1:64']);
    key(',');
    key(',');
    expect(el.selected).to.deep.equal(['0:60']);
    expect(of('music-hear').length).to.be.at.least(4);
    key('a', { ctrlKey: true });
    expect(el.selected.length).to.equal(4);
  });

  it('plays a key of the keyboard, sets the velocity of the selection, and opens Write', async () => {
    const { el, of } = await mount();
    el.querySelector('music-keys [data-pitch="72"]').dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    );
    expect(of('music-hear')).to.deep.equal([{ pitch: 72, velocity: 0.8, length: 0.25 }]);
    el.selected = ['2:67'];
    await settle();
    const slider = el.querySelector('.music-piano-roll-velocity input');
    expect(slider.value).to.equal('100');
    slider.value = '40';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    expect(el.shown.notes[2][3]).to.equal(0.4);
    expect(of('music-notes').map((each) => each.phase)).to.deep.equal(['live', 'commit']);
    el.querySelector('.music-piano-roll-bar .btn').click();
    expect(of('music-view')).to.deep.equal([{ writing: true }]);
    const grid = el.querySelector('.music-piano-roll-bar select');
    grid.value = '0.5';
    grid.dispatchEvent(new Event('change', { bubbles: true }));
    expect(of('field-change')).to.deep.equal([{ name: 'grid', value: '0.5', phase: 'commit' }]);
  });
});
