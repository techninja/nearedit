import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { addMarker } from '#utils/edl/index.js';
import { testClip, testEdl } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import { LANE_H } from './layout.js';
import { contextMenu } from './menuModel.js';
import { getStageSize, onStageSize, setStageSize } from './metrics.js';
import {
  currentViewport,
  revealTime,
  scrollBy,
  scrollExtent,
  scrollTo,
  zoomBy,
  zoomToFit,
} from './scroll.js';
import { trackMenu } from './trackMenu.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const view = async () => (await tick(), getView());

async function setup(over = {}) {
  session.loadDoc(testEdl({ v1: [testClip('a', 0, 60)], a1: [testClip('s', 0, 60)] }));
  setStageSize({ width: 1000, height: 334, laneHeight: LANE_H });
  await store.set(ViewState, {
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    playheadPosition: 0,
    cursorPosition: 0,
    selection: [],
    loopStart: 0,
    loopEnd: 0,
    ...over,
  });
}

describe('stage metrics', () => {
  it('tells listeners only about real changes', () => {
    let calls = 0;
    const stop = onStageSize(() => calls++);
    setStageSize({ width: 640, height: 200, laneHeight: 72 });
    setStageSize({ width: 640, height: 200, laneHeight: 72 });
    assert.equal(calls, 1);
    assert.deepEqual(getStageSize(), { width: 640, height: 200, laneHeight: 72 });
    stop();
    setStageSize({ width: 641, height: 200, laneHeight: 72 });
    assert.equal(calls, 1);
  });
});

describe('scrolling the view', () => {
  beforeEach(() => setup());

  it('knows how far the content reaches', () => {
    const extent = scrollExtent();
    assert.equal(extent.width, 60 * 100 + 600, 'the timeline plus room to drop into');
    assert.deepEqual([extent.viewWidth, extent.viewHeight], [1000, 300]);
    assert.equal(extent.height, 2 * (LANE_H + 1) + LANE_H / 2);
    assert.deepEqual(currentViewport(), {
      pps: 100,
      scrollX: 0,
      scrollY: 0,
      width: 1000,
      height: 334,
    });
  });

  it('keeps scrolling inside the content', async () => {
    scrollTo({ x: 99999 });
    assert.equal((await view()).scrollX, 5600);
    scrollBy(-200, 50);
    assert.deepEqual(
      [(await view()).scrollX, (await view()).scrollY],
      [5400, 0],
      'tracks fit: no vertical scroll',
    );
    scrollTo({ x: -5 });
    assert.equal((await view()).scrollX, 0);
  });

  it('reveals a time a page at a time, and only when it is off screen', async () => {
    revealTime(5);
    assert.equal((await view()).scrollX, 0);
    revealTime(25);
    assert.equal((await view()).scrollX, 2400);
    revealTime(30);
    assert.equal((await view()).scrollX, 2400, 'still visible');
  });

  it('zooms about the playhead when it is on screen, else about the middle', async () => {
    await setup({ playheadPosition: 4 });
    zoomBy(2);
    let now = await view();
    assert.equal(now.zoom, 2);
    assert.equal(4 * 200 - now.scrollX, 400, 'the playhead stayed at x = 400');
    await setup({ playheadPosition: 50, scrollX: 1000 });
    zoomBy(0.5);
    now = await view();
    assert.equal(
      (now.scrollX + 500) / 50,
      15,
      'the middle of the view (15 s) stayed in the middle',
    );
  });

  it('fits the whole timeline', async () => {
    await setup({ scrollX: 3000, zoom: 4 });
    zoomToFit();
    const now = await view();
    assert.ok(Math.abs(60 * 100 * now.zoom - 940) < 1e-6);
    assert.equal(now.scrollX, 0);
  });
});

describe('menus', () => {
  const labels = (items) => items.filter((item) => !item.separator).map((item) => item.label);

  it('offers clip commands on a clip, with availability', async () => {
    await setup({ selection: ['a'], cursorPosition: 5 });
    const items = contextMenu(
      { zone: 'lane', time: 5, trackId: 'v1', clipId: 'a', part: 'body' },
      {},
    );
    assert.deepEqual(labels(items).slice(0, 5), [
      'Split at cursor',
      'Cut',
      'Copy',
      'Paste at cursor',
      'Duplicate',
    ]);
    const byLabel = Object.fromEntries(items.map((item) => [item.label, item]));
    assert.equal(byLabel['Split at cursor'].disabled, false);
    assert.equal(byLabel['Split at cursor'].shortcut, 'S');
    assert.equal(byLabel.Group.disabled, true, 'one clip cannot be grouped');
    byLabel['Split at cursor'].run();
    assert.equal(session.getDoc().tracks[0].clips.length, 2);
  });

  it('offers lane, ruler and marker menus', async () => {
    await setup();
    const lane = contextMenu({ zone: 'lane', time: 70, trackId: 'v1' }, {});
    assert.ok(
      labels(lane).includes('Add marker at cursor') && labels(lane).includes('Add video track'),
    );
    const locked = contextMenu(
      { zone: 'lane', time: 5, trackId: 'v1', clipId: 'a', locked: true },
      {},
    );
    assert.deepEqual(labels(locked), labels(lane), 'a locked clip gets the lane menu');
    const ruler = contextMenu({ zone: 'ruler', time: 5, band: 'time', markerId: '' }, {});
    assert.equal(ruler.find((item) => item.label === 'Clear loop region').disabled, true);
    assert.equal(ruler.find((item) => item.label === 'Loop playback').checked, false);
    session.edit((doc) => addMarker(doc, 5, { markerId: 'mk' }));
    let renamed = '';
    const ui = { renameMarker: (id) => (renamed = id) };
    const marker = contextMenu({ zone: 'ruler', time: 5, band: 'time', markerId: 'mk' }, ui);
    assert.deepEqual(labels(marker).slice(0, 2), ['Rename marker', 'Delete marker']);
    marker[0].run();
    assert.equal(renamed, 'mk');
    marker[1].run();
    assert.equal(session.getDoc().markers.length, 0);
  });

  it('builds the track options menu', async () => {
    await setup();
    const doc = session.getDoc();
    const items = trackMenu(doc, 'v1');
    assert.deepEqual(labels(items), [
      'Solo',
      'Lock',
      'Move up',
      'Move down',
      'Add video track',
      'Add audio track',
      'Delete track',
    ]);
    const item = (label) =>
      trackMenu(session.getDoc(), 'v1').find((entry) => entry.label === label);
    assert.equal(item('Delete track').disabled, true, 'the last video track stays');
    assert.equal(item('Move up').disabled, true);
    item('Add video track').run();
    assert.equal(item('Delete track').disabled, false);
    assert.equal(item('Move up').disabled, false);
    item('Move up').run();
    assert.equal(session.getDoc().tracks[0].trackId, 'v1');
    item('Lock').run();
    assert.equal(item('Lock').checked, true);
    assert.equal(item('Delete track').disabled, true, 'a locked track cannot be removed');
    assert.deepEqual(trackMenu(session.getDoc(), 'nope'), []);
  });
});
