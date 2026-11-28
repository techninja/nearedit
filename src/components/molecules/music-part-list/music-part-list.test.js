import { fixture, expect } from '@open-wc/testing';
import { normalizeSong } from '#utils/music/index.js';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import { testSong } from '#utils/musicUi/testkit.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './music-part-list.js';

async function mount(song = normalizeSong({ ...testSong(), bars: 8 })) {
  const stage = await fixture('<div style="width:300px"><music-part-list></music-part-list></div>');
  const el = stage.querySelector('music-part-list');
  Object.assign(el, { song, selected: 'd' });
  const seen = [];
  for (const type of ['music-part', 'music-play', 'field-change']) {
    el.addEventListener(type, (event) => seen.push([type, event.detail]));
  }
  await settle();
  const of = (type) => seen.filter(([name]) => name === type).map(([, detail]) => detail);
  const row = (id) => el.querySelector(`.music-part-list-row[data-part="${id}"]`);
  return { el, of, row };
}

describe('music-part-list', () => {
  before(() =>
    loadStyles([
      'styles/tokens.css',
      'styles/fields.css',
      'styles/buttons.css',
      'styles/components-create.css',
    ]),
  );

  it('has a row for every part, and shows the rest of the open one', async () => {
    const { el, row } = await mount();
    expect(
      [...el.querySelectorAll('.music-part-list-pick')].map((pick) => pick.textContent.trim()),
    ).to.deep.equal(['808 drums', 'Bass']);
    expect(row('d').dataset.open).to.equal('true');
    expect(row('d').querySelector('.music-part-list-details')).to.exist;
    expect(row('s').querySelector('.music-part-list-details')).to.not.exist;
    expect(row('d').querySelectorAll('music-bar-strip button').length).to.equal(8);
    expect(row('d').querySelector('field-number[name="part.d.pan"]')).to.exist;
    expect(
      row('d').querySelector('field-number[name="part.d.bars"] input.field-num').value,
    ).to.equal('1');
    expect(
      row('s').querySelector('field-number[name="part.s.volume"] input[type="range"]').value,
    ).to.equal('0.8');
  });

  it('chooses, mutes and solos a part — and says that solo is for listening only', async () => {
    const { el, of, row } = await mount();
    row('s').querySelector('.music-part-list-pick').click();
    const [mute, solo] = row('s').querySelectorAll('.music-part-list-flag');
    mute.click();
    solo.click();
    expect(of('music-part')).to.deep.equal([
      { action: 'select', partId: 's', kind: undefined, by: 0 },
      { action: 'solo', partId: 's', kind: undefined, by: 0 },
    ]);
    expect(of('field-change')).to.deep.equal([
      { name: 'part.s.mute', value: true, phase: 'commit' },
    ]);
    expect(solo.title).to.contain('for listening here only');
    expect(el.querySelector('.music-part-list-note')).to.not.exist;
    el.solo = ['s'];
    await settle();
    expect(el.querySelector('.music-part-list-note').textContent).to.contain(
      'the clip plays every part that is not muted',
    );
    expect(
      row('s').querySelectorAll('.music-part-list-flag')[1].getAttribute('aria-pressed'),
    ).to.equal('true');
  });

  it('adds, copies, moves and deletes parts, and renames the open one', async () => {
    const { el, of, row } = await mount();
    const [drums, synth] = el.querySelectorAll('.music-part-list-add .btn');
    drums.click();
    synth.click();
    const tools = [...row('d').querySelectorAll('.music-part-list-tools button')];
    expect(tools[0].disabled, 'the first part cannot move up').to.equal(true);
    tools.forEach((tool) => tool.click());
    expect(
      of('music-part').map((each) => [each.action, each.partId || each.kind, each.by]),
    ).to.deep.equal([
      ['add', 'drums', 0],
      ['add', 'synth', 0],
      ['move', 'd', 1],
      ['duplicate', 'd', 0],
      ['remove', 'd', 0],
    ]);
    const name = row('d').querySelector('input[aria-label="Name of the part"]');
    name.value = 'Kit';
    name.dispatchEvent(new Event('change', { bubbles: true }));
    expect(of('field-change')).to.deep.equal([
      { name: 'part.d.name', value: 'Kit', phase: 'commit' },
    ]);
  });

  it('paints the bars a part plays in: a press switches a bar, a drag paints on', async () => {
    const { of, row } = await mount();
    const cells = [...row('d').querySelectorAll('music-bar-strip button')];
    expect(
      cells.every((cell) => cell.dataset.on === 'true'),
      'it plays everywhere',
    ).to.equal(true);
    const at = (cell) => {
      const box = cell.getBoundingClientRect();
      return { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
    };
    const send = (type, cell) =>
      cell.dispatchEvent(
        new PointerEvent(type, { bubbles: true, button: 0, pointerId: 2, ...at(cell) }),
      );
    send('pointerdown', cells[5]);
    send('pointermove', cells[6]);
    send('pointermove', cells[7]);
    send('pointerup', cells[7]);
    expect(of('music-play')).to.deep.equal([
      { partId: 'd', on: false, bars: [5], phase: 'live' },
      { partId: 'd', on: false, bars: [5, 6], phase: 'live' },
      { partId: 'd', on: false, bars: [5, 6, 7], phase: 'live' },
      { partId: 'd', on: false, bars: [5, 6, 7], phase: 'commit' },
    ]);
    cells[0].focus();
    cells[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).to.equal(cells[1]);
    cells[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(of('music-play').at(-1)).to.deep.equal({
      partId: 'd',
      on: false,
      bars: [1],
      phase: 'commit',
    });
  });

  it('says so when there is no part yet, and stops adding at sixteen', async () => {
    const full = normalizeSong({ parts: Array.from({ length: 16 }, () => ({ kind: 'synth' })) });
    const { el } = await mount(full);
    expect(
      [...el.querySelectorAll('.music-part-list-add .btn')].every((button) => button.disabled),
    ).to.equal(true);
    el.song = normalizeSong({});
    await settle();
    expect(el.querySelector('.music-part-list-empty').textContent).to.contain('No parts yet');
  });
});
