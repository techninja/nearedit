import { fixture, expect } from '@open-wc/testing';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import { normalizeRecipe } from '#utils/web/index.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import { stripBlocks } from '#utils/webUi/scoreStrip.js';
import './web-score-strip.js';

// lead 0.6 s (18 frames) | click 21 + 18 | goto 0 + 30 | tail 30 = 117 frames, 3.9 s
const recipe = normalizeRecipe({
  url: 'https://example.com',
  steps: [
    { do: 'click', target: '#a' },
    { do: 'goto', url: '/next' },
  ],
});

async function mount(props = {}) {
  const wrap = await fixture(`<div style="width:780px"><web-score-strip></web-score-strip></div>`);
  const el = wrap.querySelector('web-score-strip');
  Object.assign(el, { strip: stripBlocks(recipe, 30), selected: 0, ...props });
  await settle();
  const seen = [];
  for (const name of ['web-select', 'web-retime', 'web-seek'])
    el.addEventListener(name, (event) => seen.push([name, event.detail]));
  const block = (part, index) =>
    el.querySelector(`.web-score-strip-block[data-part="${part}"][data-index="${index}"]`);
  const handle = (part, index) => block(part, index).querySelector('.web-score-strip-handle');
  return { el, seen, block, handle };
}
const pointer = (target, type, clientX, more = {}) =>
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerId: 1,
      clientX,
      clientY: 5,
      buttons: 1,
      ...more,
    }),
  );

describe('web-score-strip', () => {
  before(() =>
    loadStyles(['styles/tokens.css', 'styles/editor.css', 'styles/components-create.css']),
  );

  it('lays the recording out to scale and says how long it is', async () => {
    const { el, block } = await mount();
    const track = el.querySelector('.web-score-strip-blocks').getBoundingClientRect();
    const px = (part, index) => block(part, index).getBoundingClientRect().width;
    const perFrame = track.width / 117;
    expect(px('lead', -1) / perFrame).to.be.closeTo(18, 0.5);
    expect(px('duration', 0) / perFrame).to.be.closeTo(21, 0.5);
    expect(px('duration', 1)).to.equal(0);
    expect(px('tail', -1) / perFrame).to.be.closeTo(30, 0.5);
    expect(el.querySelector('.web-score-strip-total').textContent).to.equal(
      '3.9 s · 117 frames at 30 fps',
    );
    expect(block('duration', 0).classList.contains('is-selected')).to.equal(true);
    expect(block('hold', 0).classList.contains('is-selected')).to.equal(true);
    expect(block('duration', 1).classList.contains('is-selected')).to.equal(false);
  });

  it('selects the step of a pressed block; the lead and the tail select nothing', async () => {
    const { seen, block } = await mount();
    block('hold', 1).click();
    block('lead', -1).click();
    expect(seen).to.deep.equal([['web-select', { index: 1 }]]);
  });

  it('retimes a block while its end is dragged, in whole frames, as one edit', async () => {
    const { el, seen, handle } = await mount();
    const grip = handle('hold', 0);
    const pps = el.querySelector('.web-score-strip-track').getBoundingClientRect().width / 3.9;
    pointer(grip, 'pointerdown', 300);
    expect(el.frozen).to.be.closeTo(pps, 0.01);
    pointer(grip, 'pointermove', 300 + pps / 2); // half a second: 15 frames
    pointer(grip, 'pointermove', 300 + pps);
    pointer(grip, 'pointerup', 300 + pps);
    const retimes = seen.filter(([name]) => name === 'web-retime').map(([, detail]) => detail);
    expect(retimes).to.deep.equal([
      { block: { part: 'hold', index: 0 }, frames: 33, phase: 'live' },
      { block: { part: 'hold', index: 0 }, frames: 48, phase: 'live' },
      { block: { part: 'hold', index: 0 }, frames: 48, phase: 'commit' },
    ]);
    expect(el.frozen).to.equal(0);
  });

  it('never drags a block below nothing, and abandons a drag that is cancelled', async () => {
    const { seen, handle } = await mount();
    const grip = handle('duration', 0);
    pointer(grip, 'pointerdown', 300);
    pointer(grip, 'pointermove', -5000);
    pointer(grip, 'pointercancel', -5000);
    const phases = seen
      .filter(([name]) => name === 'web-retime')
      .map(([, d]) => [d.frames, d.phase]);
    expect(phases).to.deep.equal([
      [0, 'live'],
      [0, 'cancel'],
    ]);
  });

  it('retimes with the arrow keys on a handle: a frame, or ten with Shift', async () => {
    const { seen, handle } = await mount();
    const grip = handle('duration', 1);
    expect(grip.getAttribute('role')).to.equal('slider');
    expect(grip.getAttribute('aria-valuenow')).to.equal('0');
    expect(grip.getAttribute('aria-label')).to.equal('Length of the action of step 2');
    const key = (type, name, more = {}) =>
      grip.dispatchEvent(new KeyboardEvent(type, { key: name, bubbles: true, ...more }));
    key('keydown', 'ArrowRight');
    key('keydown', 'ArrowRight', { shiftKey: true });
    key('keyup', 'ArrowRight');
    expect(seen.map(([, d]) => [d.frames, d.phase])).to.deep.equal([
      [1, 'live'],
      [11, 'live'],
      [11, 'commit'],
    ]);
  });

  it('is a scrubber for the recording while there is one', async () => {
    const { el, seen } = await mount({ scrub: true, playhead: 1.95 });
    const ruler = el.querySelector('.web-score-strip-ruler');
    const box = ruler.getBoundingClientRect();
    pointer(ruler, 'pointerdown', box.left + box.width / 3.9);
    expect(seen).to.deep.equal([['web-seek', { time: 1 }]]);
    expect(el.querySelector('.web-score-strip-playhead').style.left).to.equal('50%');
    el.scrub = false;
    el.playhead = -1;
    await settle();
    pointer(ruler, 'pointerdown', box.left + 10);
    expect(seen.length).to.equal(1);
    expect(el.querySelector('.web-score-strip-playhead')).to.equal(null);
  });

  it('cannot be retimed on a locked track', async () => {
    const { seen, handle } = await mount({ locked: true });
    pointer(handle('hold', 0), 'pointerdown', 300);
    pointer(handle('hold', 0), 'pointermove', 400);
    handle('hold', 0).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(seen).to.deep.equal([]);
    expect(handle('hold', 0).tabIndex).to.equal(-1);
  });
});
