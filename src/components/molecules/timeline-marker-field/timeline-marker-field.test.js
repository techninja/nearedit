import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { addMarker, moveMarker, renameMarker } from '#utils/edl/index.js';
import { deepFreeze, testEdl } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import './timeline-marker-field.js';

const marker = (id) => session.getDoc().markers.find((m) => m.markerId === id);
const field = (el) => el.querySelector('input');
const left = (el) => Math.round(parseFloat(field(el).style.left));

async function mount(markerId = '') {
  let doc = testEdl();
  doc = addMarker(doc, 2, { markerId: 'm1', label: 'Intro' });
  doc = addMarker(doc, 5, { markerId: 'm2', label: '' });
  session.loadDoc(deepFreeze(doc));
  await store.set(ViewState, { zoom: 1, scrollX: 0 });
  const el = await fixture('<timeline-marker-field></timeline-marker-field>');
  let done = 0;
  el.addEventListener('done', () => done++);
  if (markerId) {
    el.markerId = markerId;
    await waitUntil(() => field(el), 'the field never appeared');
  }
  return { el, done: () => done };
}

/** Type into the field and commit with a key or by leaving it. */
function type(el, text, how = 'Enter') {
  field(el).value = text;
  const event =
    how === 'blur' ? new Event('blur') : new KeyboardEvent('keydown', { key: how, bubbles: true });
  field(el).dispatchEvent(event);
}

describe('timeline-marker-field', () => {
  it('shows nothing until it is given a marker of the document', async () => {
    const { el } = await mount();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(field(el)).to.equal(null);
    el.markerId = 'nope';
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(field(el)).to.equal(null);
  });

  it('shows the marker name at the marker, selected and labelled', async () => {
    const { el } = await mount('m1');
    expect(field(el).value).to.equal('Intro');
    expect(field(el).getAttribute('aria-label')).to.equal('Marker name');
    expect(left(el)).to.equal(200); // 2 s at 100 px per second
    await waitUntil(() => document.activeElement === field(el), 'the field was not focused');
  });

  it('renames the marker on Enter, as one undo step, and reports done', async () => {
    const { el, done } = await mount('m1');
    type(el, '  Chapter 1 ');
    expect(marker('m1').label).to.equal('Chapter 1');
    expect(done()).to.equal(1);
    session.undo();
    expect(marker('m1').label).to.equal('Intro');
  });

  it('commits when the field is left and abandons on Escape', async () => {
    const blurred = await mount('m2');
    type(blurred.el, 'Outro', 'blur');
    expect(marker('m2').label).to.equal('Outro');
    expect(blurred.done()).to.equal(1);

    const escaped = await mount('m1');
    type(escaped.el, 'Never', 'Escape');
    expect(marker('m1').label).to.equal('Intro');
    expect(escaped.done()).to.equal(1);
    expect(session.canUndo()).to.equal(false);
  });

  it('follows the document while open: the marker moving, and going away', async () => {
    const { el } = await mount('m1');
    session.edit((doc) => moveMarker(doc, 'm1', 3));
    await waitUntil(() => left(el) === 300, `left was ${field(el).style.left}`);
    session.edit((doc) => renameMarker(doc, 'm1', 'Cold open'));
    await waitUntil(() => field(el).value === 'Cold open', `value was ${field(el).value}`);
    session.loadDoc(testEdl());
    await waitUntil(() => !field(el), 'the field outlived its marker');
  });
});
