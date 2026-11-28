import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { GENERATORS } from '#utils/compose/catalog.js';
import { kitState, standIn } from '#utils/brandUi/kitState.js';
import { CREATE_DRAG_TYPE } from '#utils/create/dragTypes.js';
import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import { findClip } from '#utils/edl/query.js';
import { getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import './create-panel.js';

const document = () =>
  createEdl({
    tracks: [
      createTrack('video', { trackId: 'v1', name: 'Video 1' }),
      createTrack('video', {
        trackId: 'v2',
        name: 'Video 2',
        clips: [createClip({ clipId: 'talk', sourceFile: '/m/talk.mp4', timelineEnd: 10 })],
      }),
      createTrack('audio', { trackId: 'a1' }),
    ],
  });
const selection = () => [...store.get(ViewState).selection];
const steps = () => {
  let n = 0;
  while (undo()) n++;
  return n;
};

async function mount() {
  loadDoc(document());
  await store.set(ViewState, { selection: [], cursorPosition: 2, playheadPosition: 2 });
  const stage = await fixture(
    '<div style="display:flex;width:380px;height:600px"><create-panel></create-panel></div>',
  );
  const el = stage.querySelector('create-panel');
  await waitUntil(() => el.querySelector('.create-panel-tile'));
  const section = async (id) => {
    el.querySelector(`[data-section="${id}"]`).click();
    await waitUntil(
      () => el.querySelector(`[data-section="${id}"]`).getAttribute('aria-pressed') === 'true',
    );
  };
  return { el, section, status: () => el.querySelector('.create-panel-status').textContent.trim() };
}

describe('create-panel', () => {
  before(() =>
    loadStyles([
      'styles/tokens.css',
      'styles/editor.css',
      'styles/fields.css',
      'styles/components-panels.css',
      'styles/components-create.css',
    ]),
  );

  it('offers a tile with a live thumbnail for every generator of the catalog', async () => {
    const { el } = await mount();
    for (const { type } of GENERATORS) {
      const tile = el.querySelector(`.create-panel-tile[data-key="${type}"]`);
      expect(tile, type).to.exist;
      expect(tile.querySelector('create-thumb canvas'), `${type} thumbnail`).to.exist;
    }
    expect(el.querySelectorAll('.field-group-title').length).to.be.at.least(3);
  });

  it('adds a background behind the picture at the cursor and selects it', async () => {
    const { el, status } = await mount();
    el.querySelector('.create-panel-tile[data-key="gradient"]').click();
    await waitUntil(() => selection().length === 1);
    const { clip, track } = findClip(getDoc(), selection()[0]);
    expect(clip.generator.type).to.equal('gradient');
    expect([clip.timelineStart, clip.timelineEnd]).to.deep.equal([2, 7]);
    expect(getDoc().tracks.indexOf(track), 'a new track under the footage').to.equal(2);
    expect(status()).to.contain('Added Gradient');
    expect(steps()).to.equal(1);
  });

  it('adds a shape in front, and a text style as an animated title', async () => {
    const { el, section } = await mount();
    el.querySelector('.create-panel-tile[data-key="shape"]').click();
    await waitUntil(() => selection().length === 1);
    expect(findClip(getDoc(), selection()[0]).track.trackId).to.equal('v1');
    await section('text');
    await waitUntil(() => el.querySelectorAll('.create-panel-tile[data-kind="text"]').length === 5);
    el.querySelector('.create-panel-tile[data-key="lower-third"]').click();
    await waitUntil(() => findClip(getDoc(), selection()[0])?.clip.text.content);
    const { clip, trackIndex } = findClip(getDoc(), selection()[0]);
    expect(clip.text.animateIn.type).to.equal('slide-right');
    expect(trackIndex, 'on a new top track: the front one is taken').to.equal(0);
    expect(getDoc().tracks.length).to.equal(4);
  });

  it('has an entry for captions under Text, which captions the speech on the timeline', async () => {
    const { el, section, status } = await mount();
    await section('text');
    const entry = el.querySelector('captions-create');
    expect(entry.querySelector('.field-group-title').textContent).to.equal('Captions');
    expect(entry.querySelector('caption-tile canvas')).to.exist;
    entry.querySelector('.captions-create-tile').click();
    // Nothing on this timeline has sound of its own to caption: the panel says so.
    await waitUntil(() => /No speech on the timeline|Nothing to caption/.test(status()));
    expect(steps()).to.equal(0);
  });

  it('plays a thumbnail under the pointer and narrows the tiles by search', async () => {
    const { el } = await mount();
    const tile = el.querySelector('.create-panel-tile[data-key="noise"]');
    tile.dispatchEvent(new PointerEvent('pointerenter'));
    await waitUntil(() => tile.querySelector('create-thumb').playing === true);
    tile.dispatchEvent(new PointerEvent('pointerleave'));
    await waitUntil(() => tile.querySelector('create-thumb').playing === false);
    const input = el.querySelector('.create-panel-search input');
    input.value = 'gradi';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await waitUntil(() => el.querySelectorAll('.create-panel-tile').length === 1);
    let leaked = 0;
    const count = () => leaked++;
    window.addEventListener('keydown', count);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
    window.removeEventListener('keydown', count);
    expect(leaked, 'typing in the search box stays there').to.equal(0);
  });

  it('applies an effect to the selected clips, or asks for a selection', async () => {
    const { el, section, status } = await mount();
    await section('effects');
    await waitUntil(() => el.querySelector('.effect-catalog-item[data-key="blur"]'));
    expect(el.querySelector('.effect-catalog-hint').textContent).to.contain('Select a clip');
    el.querySelector('.effect-catalog-item[data-key="blur"]').click();
    await waitUntil(() => status().includes('Select a clip'));
    expect(findClip(getDoc(), 'talk').clip.effects).to.deep.equal([]);
    await store.set(ViewState, { selection: ['talk'] });
    await waitUntil(
      () => el.querySelector('.effect-catalog-hint').textContent.includes('talk') === false,
    );
    el.querySelector('.effect-catalog-item[data-key="blur"]').click();
    await waitUntil(() => findClip(getDoc(), 'talk').clip.effects.length === 1);
    expect(status()).to.contain('Blur added');
    expect(steps()).to.equal(1);
  });

  it('adds music on an audio track at the cursor, selects it, and leaves it to be rendered', async () => {
    const { el, section, status } = await mount();
    await section('music');
    await waitUntil(() =>
      el.querySelector('music-create .music-create-add[data-id="beat:backbeat"]'),
    );
    el.querySelector('music-create .music-create-add[data-id="beat:backbeat"]').click();
    await waitUntil(() => selection().length === 1);
    const { clip, track } = findClip(getDoc(), selection()[0]);
    expect([track.trackId, clip.timelineStart, clip.placeholder]).to.deep.equal(['a1', 2, true]);
    expect(clip.music.song.parts[0].kit).to.equal('acoustic');
    expect(clip.label).to.equal('Backbeat');
    expect(status()).to.contain('Added Backbeat on');
    expect(steps()).to.equal(1);
  });

  it('has six sections; Brand lists the kit’s elements and adds one where its kind belongs', async () => {
    kitState.set({ ...standIn('p1', 'fallback') });
    const { el, section, status } = await mount();
    const names = [...el.querySelectorAll('.create-panel-sections button')].map(
      (b) => b.dataset.section,
    );
    expect(names).to.deep.equal(['generators', 'text', 'effects', 'web', 'music', 'brand']);
    await section('brand');
    await waitUntil(() => el.querySelectorAll('brand-create .create-panel-tile').length === 9);
    el.querySelector('brand-create [data-element="lower-third"]').click();
    await waitUntil(() => selection().length === 1);
    const { clip, track } = findClip(getDoc(), selection()[0]);
    expect([track.trackId, clip.timelineStart, clip.element.id]).to.deep.equal([
      'v1',
      2,
      'lower-third',
    ]);
    expect(clip.element.slots).to.deep.equal({ name: 'Name' });
    expect(status()).to.contain('Added Lower third on Video 1 at 00:00:02:00 — type its Name');
    expect(steps()).to.equal(1);
  });

  it('lets a tile be dragged, carrying what it stands for', async () => {
    const { el } = await mount();
    const tile = el.querySelector('.create-panel-tile[data-key="shape"]');
    expect(tile.getAttribute('draggable')).to.equal('true');
    const dataTransfer = new DataTransfer();
    tile.dispatchEvent(new DragEvent('dragstart', { dataTransfer, bubbles: true }));
    const payload = JSON.parse(dataTransfer.getData(CREATE_DRAG_TYPE));
    expect(payload).to.include({ kind: 'generator', type: 'shape', category: 'shape' });
    tile.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
  });
});
