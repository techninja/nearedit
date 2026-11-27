import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { requestUi } from '#utils/commands/viewCommands.js';
import { addTrack, moveClips, moveTrack } from '#utils/edl/index.js';
import { deepFreeze, testClip, testEdl } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import './track-list.js';

const names = (el) =>
  [...el.querySelectorAll('track-header .track-header-name')].map((input) => input.value);
const timecode = (el) => el.querySelector('[role="timer"]').textContent.trim();
const menuItems = (el) => [...el.querySelectorAll('.menu-item')];
const label = (item) => item.querySelector('span:nth-child(2)').textContent;

async function mount(doc = testEdl({ v1: [testClip('a', 0, 4)], a1: [] })) {
  session.loadDoc(deepFreeze(doc));
  await store.set(ViewState, { playheadPosition: 1.5, scrollY: 0, activeTrackId: '' });
  const el = await fixture('<track-list></track-list>');
  await waitUntil(() => names(el).length === doc.tracks.length, 'headers never rendered');
  return el;
}

describe('track-list', () => {
  it('shows a header per track of the document and the playhead timecode', async () => {
    const el = await mount();
    expect(names(el)).to.deep.equal(['V1', 'A1']);
    expect(timecode(el)).to.equal('00:00:01:15');
    expect(el.querySelector('[role="timer"]').getAttribute('aria-label')).to.equal(
      'Playhead position',
    );
  });

  it('follows tracks being added, reordered and removed again by undo', async () => {
    const el = await mount();
    session.edit((doc) => addTrack(doc, 'video', { trackId: 'v2', name: 'Titles' }));
    await waitUntil(() => names(el).length === 3, 'the new track got no header');
    expect(names(el)).to.deep.equal(['Titles', 'V1', 'A1']);
    session.edit((doc) => moveTrack(doc, 'v2', 1));
    await waitUntil(() => names(el).join() === 'V1,Titles,A1', `order was ${names(el)}`);
    session.undo();
    session.undo();
    await waitUntil(() => names(el).join() === 'V1,A1', `after undo: ${names(el)}`);
  });

  it('counts frames at the frame rate of the document', async () => {
    const el = await mount();
    session.edit((doc) => ({ ...doc, fps: 24 }));
    await waitUntil(() => timecode(el) === '00:00:01:12', `timecode was ${timecode(el)}`);
  });

  it('keeps its headers through a drag that only moves clips', async () => {
    const el = await mount();
    const [first] = el.querySelectorAll('track-header');
    session.commit(moveClips(session.beginGesture(), ['a'], { delta: 2 }));
    session.endGesture();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(el.querySelectorAll('track-header')[0]).to.equal(first);
    expect(names(el)).to.deep.equal(['V1', 'A1']);
  });

  it('opens the options menu a header asks for, built from the current document', async () => {
    const el = await mount(testEdl({ v1: [], v2: [], a1: [] }));
    const ask = (trackId) => {
      const header = [...el.querySelectorAll('track-header')].find((h) => h.trackId === trackId);
      const detail = { trackId, x: 20, y: 30 };
      header.dispatchEvent(new CustomEvent('trackmenu', { detail, bubbles: true }));
    };
    const item = (text) => menuItems(el).find((button) => label(button) === text);
    ask('v2');
    await waitUntil(() => menuItems(el).length > 0, 'the menu never opened');
    expect(item('Move up').disabled).to.equal(false);
    expect(item('Move down').disabled).to.equal(true);
    expect(item('Delete track').disabled).to.equal(false);
    // The menu is rebuilt when the document changes under it.
    session.edit((doc) => moveTrack(doc, 'v2', 0));
    await waitUntil(() => item('Move up').disabled, 'the open menu did not follow the document');
    expect(item('Move down').disabled).to.equal(false);
    el.querySelector('timeline-menu').dispatchEvent(new CustomEvent('menuclose'));
    await waitUntil(() => menuItems(el).length === 0, 'the menu stayed open');
    ask('a1');
    await waitUntil(() => menuItems(el).length > 0, 'the menu never reopened');
    expect(item('Delete track').disabled, 'the only audio track').to.equal(true);
  });
  it('opens the go-to field in the corner when a time is asked for', async () => {
    const el = await mount();
    expect(el.querySelector('timeline-goto input')).to.equal(null);
    requestUi('goto');
    await waitUntil(() => el.querySelector('timeline-goto input'), 'the field never appeared');
    const input = el.querySelector('timeline-goto input');
    expect(input.closest('.track-list-corner')).to.exist;
    input.value = '3.';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitUntil(() => !el.querySelector('timeline-goto input'), 'the field stayed');
    await waitUntil(() => timecode(el) === '00:00:03:00', `timecode was ${timecode(el)}`);
  });
});
