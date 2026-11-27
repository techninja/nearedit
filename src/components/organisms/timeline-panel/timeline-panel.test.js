import { fixture, expect, waitUntil } from '@open-wc/testing';
import { sendMouse } from '@web/test-runner-commands';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import * as session from '#utils/editor/session.js';
import { LANE_H, RULER_H } from '#utils/timeline/layout.js';
import { timelineStage } from '#utils/timeline/stageHost.js';
import './timeline-panel.js';

const SHEETS = ['reset', 'tokens', 'shared', 'editor', 'elements', 'overlays', 'fields'];
const title = (clipId, start, end) =>
  createClip({ clipId, timelineStart: start, timelineEnd: end, text: { content: clipId } });
const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const view = () => store.get(ViewState);
const clipOf = (id) =>
  session
    .getDoc()
    .tracks.flatMap((track) => track.clips)
    .find((clip) => clip.clipId === id);

function sampleDoc() {
  return createEdl({
    tracks: [
      createTrack('video', { trackId: 'v2', name: 'Titles', clips: [title('one', 1, 3)] }),
      createTrack('video', { trackId: 'v1', name: 'Main', clips: [title('two', 2, 5)] }),
      createTrack('audio', { trackId: 'a1', name: 'Sound' }),
    ],
  });
}

async function mount(doc = sampleDoc()) {
  session.loadDoc(doc);
  await store.set(ViewState, {
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    selection: [],
    cursorPosition: 0,
    playheadPosition: 0,
    snapping: false,
    ripple: false,
    autoCrossfade: true,
    activeTrackId: '',
  });
  const box = await fixture(
    '<div style="width: 780px; height: 360px"><timeline-panel></timeline-panel></div>',
  );
  const el = box.querySelector('timeline-panel');
  const stage = () => timelineStage(el.querySelector('timeline-stage'));
  await waitUntil(() => stage()?.stats.frames > 0, 'the stage never drew');
  return { el, stage, canvas: el.querySelector('canvas') };
}

/** Client position of a time on a lane. */
function at(canvas, time, laneIndex) {
  const rect = canvas.getBoundingClientRect();
  const y = rect.top + RULER_H + laneIndex * (LANE_H + 1) + LANE_H * 0.6;
  return [Math.round(rect.left + time * 100), Math.round(y)];
}

describe('timeline-panel', () => {
  before(async () => {
    for (const name of [...SHEETS, 'components-timeline']) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `/src/styles/${name}.css`;
      document.head.append(link);
      await new Promise((resolve) => link.addEventListener('load', resolve));
    }
  });

  it('renders a toolbar, a header per track and a canvas that fills the box', async () => {
    const { el, canvas } = await mount();
    const toolbar = el.querySelector('[role="toolbar"]');
    expect(toolbar.getAttribute('aria-label')).to.equal('Timeline');
    for (const button of toolbar.querySelectorAll('button')) {
      expect(button.getAttribute('aria-label')).to.be.a('string').and.not.empty;
      expect(button.querySelector('app-icon')).to.exist;
    }
    const names = [...el.querySelectorAll('track-header .track-header-name')].map((i) => i.value);
    expect(names).to.deep.equal(['Titles', 'Main', 'Sound']);
    expect(canvas.clientWidth).to.be.greaterThan(500);
    expect(canvas.width).to.equal(Math.round(canvas.clientWidth * devicePixelRatio));
    expect(canvas.height).to.equal(Math.round(canvas.clientHeight * devicePixelRatio));
  });

  it('lines the headers up with the lanes', async () => {
    const { el, canvas } = await mount();
    const top = canvas.getBoundingClientRect().top;
    const headers = [...el.querySelectorAll('track-header')].map((h) => h.getBoundingClientRect());
    headers.forEach((rect, i) => {
      expect(Math.abs(rect.top - (top + RULER_H + i * (LANE_H + 1)))).to.be.below(1);
      expect(Math.round(rect.height)).to.equal(LANE_H + 1);
    });
  });

  it('says how to start on an empty timeline, and stops once there is a clip', async () => {
    const { el } = await mount(createEdl());
    expect(el.querySelector('.timeline-stage-empty').textContent).to.contain('Drag media here');
    session.loadDoc(sampleDoc());
    await waitUntil(() => !el.querySelector('.timeline-stage-empty'), 'the hint stayed');
  });

  it('redraws only when something changes', async () => {
    const { stage } = await mount();
    await tick(200);
    const frames = stage().stats.frames;
    await tick(300);
    expect(stage().stats.frames).to.equal(frames);
    await store.set(ViewState, { scrollX: 40 });
    await waitUntil(() => stage().stats.frames === frames + 1, 'no redraw after a view change');
  });

  it('selects a clip on click and moves the edit cursor there', async () => {
    const { canvas } = await mount();
    await sendMouse({ type: 'click', position: at(canvas, 3, 1) });
    await waitUntil(() => view().selection.length === 1, 'nothing selected');
    expect([...view().selection]).to.deep.equal(['two']);
    expect(view().cursorPosition).to.be.closeTo(3, 0.02);
    expect(view().activeTrackId).to.equal('v1');
    await sendMouse({ type: 'click', position: at(canvas, 5.5, 1) });
    await waitUntil(() => view().selection.length === 0, 'selection not cleared');
  });

  it('moves a clip by dragging, as one undo step', async () => {
    const { canvas } = await mount();
    await sendMouse({ type: 'move', position: at(canvas, 2, 0) });
    await sendMouse({ type: 'down' });
    for (const time of [2.3, 2.7, 3])
      await sendMouse({ type: 'move', position: at(canvas, time, 0) });
    expect(session.inGesture()).to.equal(true);
    expect(clipOf('one').timelineStart).to.be.closeTo(2, 1e-9);
    await sendMouse({ type: 'up' });
    expect(session.inGesture()).to.equal(false);
    session.undo();
    expect(clipOf('one').timelineStart).to.equal(1);
    expect(session.canUndo()).to.equal(false);
  });

  it('enables toolbar buttons with the selection and runs their commands', async () => {
    const { el, canvas } = await mount();
    const button = (id) => el.querySelector(`[data-command="${id}"]`);
    expect(button('edit.delete').disabled).to.equal(true);
    expect(button('edit.undo').disabled).to.equal(true);
    expect(button('mode.snapping').getAttribute('aria-pressed')).to.equal('false');
    await sendMouse({ type: 'click', position: at(canvas, 3, 1) });
    await waitUntil(() => !button('edit.delete').disabled, 'delete stayed disabled');
    button('edit.delete').click();
    expect(clipOf('two')).to.equal(undefined);
    await waitUntil(() => !button('edit.undo').disabled, 'undo stayed disabled');
    button('mode.snapping').click();
    await waitUntil(() => button('mode.snapping').getAttribute('aria-pressed') === 'true');
  });

  it('opens the shortcuts list from the toolbar', async () => {
    const { el } = await mount();
    el.querySelector('[data-command="help.shortcuts"]').click();
    await waitUntil(() => el.querySelector('.timeline-shortcuts'), 'the list never opened');
    const text = el.querySelector('.timeline-shortcuts').textContent;
    expect(text).to.contain('Split at cursor').and.to.contain('Space');
    el.querySelector('.timeline-shortcuts button[aria-label="Close"]').click();
    await waitUntil(() => !el.querySelector('.timeline-shortcuts'), 'the list never closed');
  });

  it('opens a context menu generated from the commands', async () => {
    const { el, canvas } = await mount();
    await sendMouse({ type: 'click', position: at(canvas, 3, 1), button: 'right' });
    await waitUntil(() => el.querySelector('.timeline-menu'), 'no menu');
    const labels = [...el.querySelectorAll('.timeline-menu .menu-item')].map((b) => b.textContent);
    expect(labels.some((label) => label.includes('Split at cursor'))).to.equal(true);
    expect([...view().selection]).to.deep.equal(['two']);
    el.querySelector('.timeline-menu-backdrop').dispatchEvent(new Event('pointerdown'));
    await waitUntil(() => !el.querySelector('.timeline-menu'), 'the menu stayed open');
  });

  it('tears its stage down when removed and draws again when put back', async () => {
    const { el, stage } = await mount();
    const first = stage();
    const parent = el.parentElement;
    el.remove();
    await tick();
    expect(stage()).to.equal(undefined);
    parent.append(el);
    await waitUntil(() => stage()?.stats.frames > 0, 'did not draw after reconnecting');
    expect(stage()).to.not.equal(first);
  });
});
