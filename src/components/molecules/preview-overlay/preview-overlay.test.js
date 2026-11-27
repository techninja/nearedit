import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import { findClip } from '#utils/edl/query.js';
import { getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { finishEdit } from '#utils/inspector/gesture.js';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import './preview-overlay.js';

/** A 960 × 540 preview of a 1920 × 1080 frame: one screen pixel is two output pixels. */
const STAGE =
  '<div style="position:fixed;left:20px;top:20px;width:960px;height:540px"><preview-overlay></preview-overlay></div>';
const document = () =>
  createEdl({
    tracks: [
      createTrack('video', {
        trackId: 'front',
        clips: [
          createClip({
            clipId: 'shape',
            timelineEnd: 10,
            generator: { type: 'shape', seed: 1, params: {} },
            transform: { scaleX: 0.5, scaleY: 0.5 },
          }),
        ],
      }),
      createTrack('video', {
        trackId: 'back',
        clips: [
          createClip({
            clipId: 'bg',
            timelineEnd: 10,
            generator: { type: 'solid', seed: 1, params: {} },
          }),
        ],
      }),
      createTrack('audio', { trackId: 'a1' }),
    ],
  });
const transform = (id = 'shape') => findClip(getDoc(), id).clip.transform;
const steps = () => {
  let n = 0;
  while (undo()) n++;
  return n;
};
const pointer = (target, type, x, y, extra = {}) =>
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      button: 0,
      pointerId: 1,
      bubbles: true,
      ...extra,
    }),
  );
const selection = () => [...store.get(ViewState).selection];

async function mount(selected = ['shape']) {
  finishEdit();
  localStorage.removeItem('nearedit_preview');
  loadDoc(document());
  await store.set(ViewState, {
    selection: selected,
    playheadPosition: 1,
    cursorPosition: 1,
    playing: false,
  });
  const stage = await fixture(STAGE);
  const el = stage.querySelector('preview-overlay');
  await waitUntil(() => el.querySelector('.preview-overlay'));
  if (selected.length) await waitUntil(() => el.querySelector('.preview-overlay-box'));
  const surface = el.querySelector('.preview-overlay');
  const drag = (from, to, extra = {}) => {
    pointer(el.querySelector(from.handle) || surface, 'pointerdown', from.x, from.y, extra);
    pointer(surface, 'pointermove', (from.x + to.x) / 2, (from.y + to.y) / 2, extra);
    pointer(surface, 'pointermove', to.x, to.y, extra);
    pointer(surface, 'pointerup', to.x, to.y, extra);
  };
  return { el, surface, drag, box: () => el.querySelector('.preview-overlay-box') };
}

describe('preview-overlay', () => {
  before(() =>
    loadStyles(['styles/tokens.css', 'styles/editor.css', 'styles/components-create.css']),
  );

  it('boxes the selected clip with the compositor geometry, scaled to the preview', async () => {
    const { el, box } = await mount();
    const rect = box().getBoundingClientRect();
    expect([rect.left, rect.top, rect.width, rect.height].map(Math.round)).to.deep.equal([
      260, 155, 480, 270,
    ]);
    expect(el.querySelectorAll('[data-handle="scale"]').length).to.equal(4);
    expect(el.querySelectorAll('[data-handle="rotate"]').length).to.equal(1);
  });

  it('moves the clip by the pointer travel over the preview scale, as one undo step', async () => {
    const { drag } = await mount();
    drag({ x: 500, y: 290 }, { x: 600, y: 340 }, { altKey: true });
    expect([transform().x, transform().y]).to.deep.equal([200, 100]);
    expect(steps()).to.equal(1);
    expect(transform().x).to.equal(0);
  });

  it('snaps to the frame centre and shows the guides while it does', async () => {
    const { el, surface } = await mount();
    pointer(surface, 'pointerdown', 500, 290);
    pointer(surface, 'pointermove', 560, 290);
    pointer(surface, 'pointermove', 502, 293);
    await waitUntil(() => el.querySelectorAll('.preview-overlay-guide').length === 2);
    pointer(surface, 'pointerup', 502, 293);
    expect([transform().x, transform().y]).to.deep.equal([0, 0]);
    await waitUntil(() => !el.querySelector('.preview-overlay-guide'));
  });

  it('scales from a corner and rotates from the round handle', async () => {
    const { drag } = await mount();
    drag({ handle: '[data-corner="se"]', x: 740, y: 425 }, { x: 980, y: 560 });
    expect(transform().scaleX).to.be.closeTo(1, 0.01);
    expect(transform().scaleY).to.be.closeTo(1, 0.01);
    drag({ handle: '.preview-overlay-rotate', x: 500, y: 0 }, { x: 800, y: 290 }, { altKey: true });
    expect(transform().rotation).to.be.closeTo(90, 0.5);
    expect(steps()).to.equal(2);
  });

  it('selects the front-most clip under a press, and nothing on a press beside every clip', async () => {
    const { surface } = await mount(['shape']);
    pointer(surface, 'pointerdown', 60, 60);
    pointer(surface, 'pointerup', 60, 60);
    await waitUntil(() => selection().join() === 'bg');
    pointer(surface, 'pointerdown', 500, 290);
    pointer(surface, 'pointerup', 500, 290);
    await waitUntil(
      () => selection().join() === 'shape',
      'a click inside the selected box picks what is on top',
    );
    expect(steps()).to.equal(0);
    loadDoc({ ...getDoc(), tracks: getDoc().tracks.filter((track) => track.trackId !== 'back') });
    pointer(surface, 'pointerdown', 60, 60);
    await waitUntil(() => selection().length === 0);
  });

  it('nudges with the arrow keys and switches the safe areas on', async () => {
    const { el, box } = await mount();
    const press = (type, key, shiftKey = false) =>
      box().dispatchEvent(
        new KeyboardEvent(type, { key, shiftKey, bubbles: true, cancelable: true }),
      );
    press('keydown', 'ArrowRight');
    press('keydown', 'ArrowUp', true);
    press('keyup', 'ArrowUp');
    expect([transform().x, transform().y]).to.deep.equal([1, -10]);
    expect(steps()).to.equal(1);
    el.querySelector('.preview-overlay-safe-toggle').click();
    await waitUntil(() => el.querySelectorAll('.preview-overlay-safe').length === 2);
    expect(JSON.parse(localStorage.getItem('nearedit_preview')).safe).to.equal(true);
  });

  it('offers no handles on a locked track and hides during playback', async () => {
    const { el, drag } = await mount();
    loadDoc({
      ...getDoc(),
      tracks: getDoc().tracks.map((track) => ({ ...track, locked: track.trackId === 'front' })),
    });
    await waitUntil(() => el.querySelector('.preview-overlay-box')?.dataset.locked === 'true');
    expect(el.querySelectorAll('[data-handle]').length).to.equal(0);
    drag({ x: 500, y: 290 }, { x: 600, y: 340 }, { altKey: true });
    expect(transform().x).to.equal(0);
    await store.set(ViewState, { playing: true });
    await waitUntil(() => !el.querySelector('.preview-overlay-box'));
    await store.set(ViewState, { playing: false });
  });
});
