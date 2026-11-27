import { fixture, expect, waitUntil } from '@open-wc/testing';
import { sendKeys, sendMouse } from '@web/test-runner-commands';
import { store } from 'hybrids';
import UserPrefs from '#store/UserPrefs.js';
import ViewState from '#store/ViewState.js';
import { addRegion, regionsOf } from '#utils/edl/regions.js';
import { testClip, testEdl } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import { setEdgeTrim } from '#utils/timeline/edgeTrim.js';
import { LANE_H, RULER_H } from '#utils/timeline/layout.js';
import { timelineStage } from '#utils/timeline/stageHost.js';
import './timeline-stage.js';

const SHEETS = [
  'reset',
  'tokens',
  'shared',
  'elements',
  'overlays',
  'fields',
  'components-timeline',
];
const src = (id, start, end, sourceIn, more = {}) =>
  testClip(id, start, end, { sourceIn, sourceOut: sourceIn + (end - start), ...more });
const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const view = () => store.get(ViewState);
const clip = (id) =>
  session
    .getDoc()
    .tracks.flatMap((track) => track.clips)
    .find((each) => each.clipId === id);
const times = (id) => {
  const c = clip(id);
  return [c.timelineStart, c.timelineEnd, c.sourceIn, c.sourceOut].map(
    (t) => Math.round(t * 100) / 100,
  );
};

/** a 0-2 | b 2-4 | c 4-6 on v1, with source to spare on both sides; a region over 1-3. */
function sampleDoc() {
  const doc = testEdl({ v1: [src('a', 0, 2, 3), src('b', 2, 4, 3), src('c', 4, 6, 3)] });
  return addRegion(doc, 1, 3, { regionId: 'r', label: 'Verse' });
}

async function mount(doc = sampleDoc()) {
  session.loadDoc(doc);
  setEdgeTrim(null);
  await store.set(UserPrefs, {
    wheelMode: 'scroll',
    snapMarkers: true,
    trackHeight: 0,
    tracksMinimized: false,
  });
  await store.set(ViewState, {
    ...{ zoom: 1, scrollX: 0, scrollY: 0, selection: [], cursorPosition: 0, playheadPosition: 0 },
    ...{
      snapping: false,
      ripple: false,
      autoCrossfade: true,
      activeTrackId: '',
      loopStart: 0,
      loopEnd: 0,
    },
  });
  const box = await fixture(
    '<div style="width: 760px; height: 240px"><timeline-stage></timeline-stage></div>',
  );
  const el = box.querySelector('timeline-stage');
  el.style.height = '240px';
  const stage = () => timelineStage(el);
  await waitUntil(() => stage()?.stats.frames > 0, 'the stage never drew');
  return { el, stage, canvas: el.querySelector('canvas') };
}

/** Client position of a time: on lane 0, or on a row of the ruler. */
function at(canvas, time, row = 'lane') {
  const rect = canvas.getBoundingClientRect();
  const y = { lane: RULER_H + LANE_H * 0.6, tags: 16, ticks: 28 }[row];
  return [Math.round(rect.left + time * 100), Math.round(rect.top + y)];
}

async function drag(canvas, from, to, keys = [], row = 'lane') {
  for (const key of keys) await sendKeys({ down: key });
  await sendMouse({ type: 'move', position: at(canvas, from, row) });
  await sendMouse({ type: 'down' });
  for (const step of [0.4, 0.8, 1]) {
    await sendMouse({ type: 'move', position: at(canvas, from + (to - from) * step, row) });
  }
  await sendMouse({ type: 'up' });
  for (const key of [...keys].reverse()) await sendKeys({ up: key });
  await tick();
}

describe('timeline-stage — Vegas mouse', () => {
  before(async () => {
    for (const name of SHEETS) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `/src/styles/${name}.css`;
      document.head.append(link);
      await new Promise((resolve) => link.addEventListener('load', resolve));
    }
  });

  it('Ctrl-drag leaves the clip and drops a copy, which becomes the selection', async () => {
    const { canvas } = await mount(testEdl({ v1: [src('a', 0, 2, 3)] }));
    await drag(canvas, 1, 4, ['Control']);
    const clips = session.getDoc().tracks[0].clips;
    expect(clips.map((c) => [c.timelineStart, c.timelineEnd])).to.deep.equal([
      [0, 2],
      [3, 5],
    ]);
    expect(clips[0].clipId).to.equal('a');
    await waitUntil(() => view().selection.length === 1 && view().selection[0] === clips[1].clipId);
    session.undo();
    expect(session.getDoc().tracks[0].clips.length).to.equal(1);
  });

  it('Alt-drag an edge slip-trims: the dragged edge keeps its frame', async () => {
    const { canvas } = await mount();
    await drag(canvas, 3.97, 3.47, ['Alt']);
    expect(times('b')).to.deep.equal([2, 3.5, 3.5, 5]);
    session.undo();
    await drag(canvas, 3.97, 3.47);
    expect(times('b'), 'a plain trim keeps the start').to.deep.equal([2, 3.5, 3, 4.5]);
  });

  it('Ctrl+Alt-drag an edge rolls the cut; the outer edges stay', async () => {
    const { canvas } = await mount();
    await drag(canvas, 1.97, 1.47, ['Control', 'Alt']);
    expect(times('a')).to.deep.equal([0, 1.5, 3, 4.5]);
    expect(times('b')).to.deep.equal([1.5, 4, 2.5, 5]);
  });

  it('Ctrl+Alt-drag a clip slides it between its neighbours', async () => {
    const { canvas } = await mount();
    await drag(canvas, 3, 3.5, ['Control', 'Alt']);
    expect(times('a')).to.deep.equal([0, 2.5, 3, 5.5]);
    expect(times('b')).to.deep.equal([2.5, 4.5, 3, 5]);
    expect(times('c')).to.deep.equal([4.5, 6, 3.5, 5]);
  });

  it('shows what a drag would do, also when a modifier goes down over a resting pointer', async () => {
    const { canvas } = await mount();
    await sendMouse({ type: 'move', position: at(canvas, 3) });
    expect(canvas.style.cursor).to.equal('grab');
    await sendKeys({ down: 'Control' });
    expect(canvas.style.cursor).to.equal('copy');
    await sendKeys({ down: 'Alt' });
    expect(canvas.style.cursor).to.equal('all-scroll');
    await sendKeys({ up: 'Control' });
    expect(canvas.style.cursor).to.equal('ew-resize');
    await sendKeys({ up: 'Alt' });
    await sendMouse({ type: 'move', position: at(canvas, 2, 'tags') });
    expect(canvas.style.cursor, 'a region tag').to.equal('grab');
  });

  it('moves and resizes a region in the ruler, and selects it on a double-click', async () => {
    const { canvas } = await mount();
    const span = () => regionsOf(session.getDoc()).map((region) => [region.start, region.end])[0];
    await drag(canvas, 2, 3, [], 'tags');
    expect(span()).to.deep.equal([2, 4]);
    await drag(canvas, 4, 5, [], 'ticks');
    expect(span()).to.deep.equal([2, 5]);
    await drag(canvas, 2, 2.5, [], 'tags');
    expect(span()).to.deep.equal([2.5, 5]);
    await sendMouse({ type: 'click', position: at(canvas, 4, 'tags') });
    canvas.dispatchEvent(
      new MouseEvent('dblclick', {
        clientX: at(canvas, 4, 'tags')[0],
        clientY: at(canvas, 4, 'tags')[1],
        bubbles: true,
      }),
    );
    await waitUntil(() => view().loopEnd === 5, 'the region did not become the time selection');
    expect(view().loopStart).to.equal(2.5);
  });

  it('selects a clip’s span on a double-click, and the wheel zooms in Vegas mode', async () => {
    const { canvas } = await mount();
    const [x, y] = at(canvas, 3);
    canvas.dispatchEvent(new MouseEvent('dblclick', { clientX: x, clientY: y, bubbles: true }));
    await waitUntil(() => view().loopEnd === 4, 'no time selection');
    expect(view().loopStart).to.equal(2);
    const wheel = () =>
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -100,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
    wheel();
    await tick();
    expect(view().zoom, 'scroll mode does not zoom').to.equal(1);
    await store.set(UserPrefs, { wheelMode: 'vegas' });
    await store.set(ViewState, { scrollX: 0 });
    wheel();
    await waitUntil(() => view().zoom > 1.5, 'the wheel did not zoom');
    const rect = canvas.getBoundingClientRect();
    expect(
      (view().scrollX + x - rect.left) / (100 * view().zoom),
      'about the pointer',
    ).to.be.closeTo(3, 0.01);
    await store.set(UserPrefs, { wheelMode: 'scroll' });
  });

  it('offers the curves of a fade on a right-click and stores the choice', async () => {
    const { el, canvas } = await mount(testEdl({ v1: [src('a', 0, 4, 3, { fadeIn: 1.5 })] }));
    await sendMouse({ type: 'click', position: at(canvas, 0.6), button: 'right' });
    await waitUntil(() => el.querySelector('.timeline-menu'), 'no menu');
    const items = [...el.querySelectorAll('.timeline-menu .menu-item')];
    const labels = items.map((item) => item.querySelector('span:nth-child(2)').textContent);
    expect(labels.slice(0, 5)).to.deep.equal(
      ['Linear', 'Smooth', 'Fast', 'Slow', 'Sharp'].map((n) => `Fade in: ${n}`),
    );
    expect(items[0].getAttribute('aria-checked')).to.equal('true');
    items[1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    items[1].click();
    expect(clip('a').fadeInCurve).to.equal('smooth');
  });

  it('redraws for edge-trim mode and for a track-height change, and not otherwise', async () => {
    const { stage } = await mount();
    await tick(200);
    const frames = stage().stats.frames;
    await tick(250);
    expect(stage().stats.frames).to.equal(frames);
    setEdgeTrim({ clipId: 'b', edge: 'end' });
    await waitUntil(() => stage().stats.frames === frames + 1, 'no redraw for the bracket');
    await store.set(UserPrefs, { trackHeight: 96 });
    await waitUntil(() => stage().laneHeight === 96 && stage().stats.frames > frames + 1);
    setEdgeTrim(null);
    await store.set(UserPrefs, { trackHeight: 0 });
  });
});
