import { fixture, expect } from '@open-wc/testing';
import { normalizeSong } from '#utils/music/index.js';
import { stripCells } from '#utils/musicUi/barStrip.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './music-bar-strip.js';

const cells = (bars, play = []) => {
  const song = normalizeSong({ bars, parts: [{ kind: 'drums', play }] });
  return stripCells(song, song.parts[0]);
};

describe('music-bar-strip', () => {
  it('has a cell for every bar, on where the part plays', async () => {
    const el = await fixture('<music-bar-strip></music-bar-strip>');
    el.cells = cells(6, [[1, 3]]);
    await settle();
    const buttons = [...el.querySelectorAll('button')];
    expect(buttons.map((button) => button.dataset.on)).to.deep.equal([
      'false',
      'true',
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(buttons[1].getAttribute('aria-label')).to.equal('Bar 2');
    expect(buttons[1].getAttribute('aria-pressed')).to.equal('true');
    expect(buttons.filter((button) => button.tabIndex === 0).length, 'one Tab stop').to.equal(1);
  });

  it('puts several bars in a cell when the song is long', async () => {
    const long = cells(200);
    expect(long.length).to.equal(50);
    expect([long[0].from, long[0].to, long[49].to]).to.deep.equal([0, 4, 200]);
    const el = await fixture('<music-bar-strip></music-bar-strip>');
    el.cells = long;
    await settle();
    expect(el.querySelector('button').getAttribute('aria-label')).to.equal('Bars 1 to 4');
    const painted = [];
    el.addEventListener('strip-paint', (event) => painted.push(event.detail));
    el.querySelector('button').dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
    );
    el.querySelector('button').dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
    expect(painted).to.deep.equal([
      { on: false, bars: [0, 1, 2, 3], phase: 'live' },
      { on: false, bars: [0, 1, 2, 3], phase: 'cancel' },
    ]);
  });

  it('paints nothing while locked', async () => {
    const el = await fixture('<music-bar-strip locked></music-bar-strip>');
    el.cells = cells(4);
    await settle();
    const painted = [];
    el.addEventListener('strip-paint', (event) => painted.push(event.detail));
    el.querySelector('button').dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
    );
    expect(painted).to.deep.equal([]);
    expect(el.querySelector('button').disabled).to.equal(true);
  });
});
