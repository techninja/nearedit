import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import { findClip } from '#utils/edl/query.js';
import { getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { finishEdit } from '#utils/inspector/gesture.js';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import './keyframe-strip.js';

const key = (t, v, ease = 'linear') => ({ t, v, ease });
const document = () =>
  createEdl({
    tracks: [
      createTrack('video', {
        trackId: 'v1',
        clips: [
          createClip({
            clipId: 't',
            timelineStart: 2,
            timelineEnd: 12,
            text: { content: 'Hi' },
            keyframes: {
              'transform.x': [key(1, 0), key(3, 100), key(5, 200)],
              'transform.opacity': [key(3, 0.5, 'hold'), key(7, 1)],
            },
          }),
        ],
      }),
      createTrack('audio', { trackId: 'a1' }),
    ],
  });
const clip = () => findClip(getDoc(), 't').clip;
const times = (path) => clip().keyframes[path].map((k) => k.t + 2);
const steps = () => {
  let n = 0;
  while (undo()) n++;
  return n;
};
const pointer = (target, type, x, extra = {}) =>
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: 5,
      button: 0,
      pointerId: 1,
      bubbles: true,
      ...extra,
    }),
  );

async function mount() {
  finishEdit();
  loadDoc(document());
  await store.set(ViewState, { playheadPosition: 0, cursorPosition: 0, selection: ['t'] });
  const stage = await fixture('<div style="width:400px"><keyframe-strip></keyframe-strip></div>');
  const el = stage.querySelector('keyframe-strip');
  Object.assign(el, { clip: clip(), time: 4, fps: 30 });
  await waitUntil(() => el.querySelectorAll('.keyframe-strip-key').length === 5);
  const keys = () => [...el.querySelectorAll('.keyframe-strip-key')];
  const track = el.querySelector('.keyframe-strip-track');
  const rect = track.getBoundingClientRect();
  const xOf = (time) => rect.left + ((time - 2) / 10) * rect.width;
  // the document changes under the strip: hand it the clip again, as the inspector does
  const sync = () => (el.clip = clip());
  return { el, keys, rows: el.querySelector('.keyframe-strip-rows'), xOf, sync, rect };
}

describe('keyframe-strip', () => {
  before(() =>
    loadStyles([
      'styles/tokens.css',
      'styles/editor.css',
      'styles/fields.css',
      'styles/components-panels.css',
    ]),
  );

  it('draws a row per animated property with keys at their times and the playhead', async () => {
    const { el, keys, xOf } = await mount();
    const labels = [...el.querySelectorAll('.keyframe-strip-label')].map((l) => l.textContent);
    expect(labels).to.deep.equal(['Position X', 'Opacity']);
    const box = keys()[1].getBoundingClientRect();
    expect(box.left + box.width / 2).to.be.closeTo(xOf(5), 1);
    expect(keys()[3].dataset.ease).to.equal('hold');
    const now = el.querySelector('.keyframe-strip-now').getBoundingClientRect();
    expect(now.left).to.be.closeTo(xOf(4), 1.5);
    expect(el.querySelector('.chip').textContent).to.equal('5');
  });

  it('a click selects a key and moves the playhead to it, editing nothing', async () => {
    const { keys, xOf } = await mount();
    pointer(keys()[1], 'pointerdown', xOf(5));
    pointer(keys()[1], 'pointerup', xOf(5));
    await waitUntil(() => store.get(ViewState).playheadPosition === 5);
    expect(keys()[1].getAttribute('aria-pressed')).to.equal('true');
    expect(steps()).to.equal(0);
  });

  it('dragging retimes the selected keys as one undo step', async () => {
    const { el, keys, rows, xOf, sync } = await mount();
    pointer(keys()[1], 'pointerdown', xOf(5));
    for (const time of [5.5, 6, 6.5]) pointer(rows, 'pointermove', xOf(time));
    pointer(rows, 'pointerup', xOf(6.5));
    expect(times('transform.x')).to.deep.equal([3, 6.5, 7]);
    sync();
    await waitUntil(() => el.querySelector('.keyframe-strip-key[aria-pressed="true"]'));
    expect(el.selected.length, 'the moved key stays selected').to.equal(1);
    expect(steps()).to.equal(1);
    expect(times('transform.x')).to.deep.equal([3, 5, 7]);
  });

  it('adds to the selection with Shift and moves keys of several properties together', async () => {
    const { keys, rows, xOf } = await mount();
    pointer(keys()[1], 'pointerdown', xOf(5));
    pointer(rows, 'pointerup', xOf(5));
    pointer(keys()[3], 'pointerdown', xOf(5), { shiftKey: true });
    pointer(rows, 'pointerup', xOf(5), { shiftKey: true });
    pointer(keys()[3], 'pointerdown', xOf(5));
    pointer(rows, 'pointermove', xOf(4));
    pointer(rows, 'pointerup', xOf(4));
    expect(times('transform.x')).to.deep.equal([3, 4, 7]);
    expect(times('transform.opacity')).to.deep.equal([4, 9]);
    expect(steps()).to.equal(1);
  });

  it('deletes, eases and nudges the selection from the keyboard and the toolbar', async () => {
    const { el, keys, rows, xOf, sync } = await mount();
    pointer(keys()[0], 'pointerdown', xOf(3));
    pointer(rows, 'pointerup', xOf(3));
    const ease = el.querySelector('.keyframe-strip-ease');
    await waitUntil(() => !ease.disabled);
    ease.value = 'ease-in';
    ease.dispatchEvent(new Event('change', { bubbles: true }));
    expect(clip().keyframes['transform.x'][0].ease).to.equal('ease-in');
    const press = (type, name) =>
      keys()[0].dispatchEvent(
        new KeyboardEvent(type, { key: name, bubbles: true, cancelable: true }),
      );
    press('keydown', 'ArrowRight');
    press('keydown', 'ArrowRight');
    press('keyup', 'ArrowRight');
    expect(times('transform.x')[0]).to.be.closeTo(3 + 2 / 30, 1e-6);
    sync();
    await waitUntil(() => el.querySelector('.keyframe-strip-key[aria-pressed="true"]'));
    press('keydown', 'Delete');
    expect(times('transform.x').length).to.equal(2);
    expect(steps(), 'easing, one held nudge, delete').to.equal(3);
  });

  it('scrubs the playhead on the empty track and zooms to the keys', async () => {
    const { el, keys, rows, xOf, rect } = await mount();
    pointer(el.querySelector('.keyframe-strip-track'), 'pointerdown', xOf(10));
    pointer(rows, 'pointermove', xOf(11));
    pointer(rows, 'pointerup', xOf(11));
    await waitUntil(() => store.get(ViewState).playheadPosition === 11);
    el.querySelector('[aria-label="Zoom to the keyframes"]').click();
    await waitUntil(() => keys()[0].getBoundingClientRect().left > rect.left + 10);
    expect(steps()).to.equal(0);
  });

  it('shows nothing for a clip without keyframes and edits nothing on a locked track', async () => {
    const { el, keys, rows, xOf } = await mount();
    el.locked = true;
    pointer(keys()[1], 'pointerdown', xOf(5));
    pointer(rows, 'pointermove', xOf(8));
    pointer(rows, 'pointerup', xOf(8));
    expect(times('transform.x')).to.deep.equal([3, 5, 7]);
    el.clip = createClip({ clipId: 'plain', timelineEnd: 3 });
    await waitUntil(() => !el.querySelector('.keyframe-strip'));
  });
});
