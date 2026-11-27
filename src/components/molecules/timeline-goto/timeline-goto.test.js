import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { testClip, testEdl } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import './timeline-goto.js';

const field = (el) => el.querySelector('input');
const type = (el, text, key = 'Enter') => {
  field(el).value = text;
  field(el).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
};
const cursor = async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  return store.get(ViewState).cursorPosition;
};

async function mount() {
  session.loadDoc(testEdl({ v1: [testClip('a', 0, 20)] }));
  await store.set(ViewState, { cursorPosition: 5, playheadPosition: 5, playing: false });
  const el = await fixture('<timeline-goto></timeline-goto>');
  let done = 0;
  el.addEventListener('done', () => done++);
  return { el, done: () => done };
}

describe('timeline-goto', () => {
  it('shows nothing until it is opened, then the current timecode, selected', async () => {
    const { el } = await mount();
    expect(field(el)).to.equal(null);
    el.open = true;
    await waitUntil(() => field(el), 'the field never appeared');
    expect(field(el).value).to.equal('00:00:05:00');
    expect(field(el).getAttribute('aria-label')).to.equal('Go to time');
    await waitUntil(() => document.activeElement === field(el), 'the field was not focused');
  });

  it('goes to the typed time on Enter and reports done', async () => {
    const { el, done } = await mount();
    el.open = true;
    await waitUntil(() => field(el));
    type(el, '12.5');
    expect(await cursor()).to.equal(12.5);
    expect(done()).to.equal(1);
    type(el, '+1:00');
    expect(await cursor()).to.equal(13.5);
    type(el, '1000');
    expect(await cursor()).to.equal(10);
  });

  it('stays open and marks the field when the text is not a time', async () => {
    const { el, done } = await mount();
    el.open = true;
    await waitUntil(() => field(el));
    type(el, 'soon');
    await waitUntil(() => field(el).getAttribute('aria-invalid') === 'true', 'not marked invalid');
    expect(done()).to.equal(0);
    expect(await cursor()).to.equal(5);
  });

  it('gives up on Escape without moving the cursor', async () => {
    const { el, done } = await mount();
    el.open = true;
    await waitUntil(() => field(el));
    type(el, '12', 'Escape');
    expect(done()).to.equal(1);
    expect(await cursor()).to.equal(5);
  });
});
