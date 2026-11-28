import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { kitState, standIn } from '#utils/brandUi/kitState.js';
import { requestSlotFocus } from '#utils/brandUi/slotFocus.js';
import { elementDoc, kitOf } from '#utils/brandUi/testkit.js';
import { clipOf } from '#utils/edl/testkit.js';
import { getDoc, loadDoc, onDocChange, undo } from '#utils/editor/session.js';
import { inspectorModel } from '#utils/inspector/model.js';
import { answerConfirm, confirmState } from '#utils/ui/confirm.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './element-inspector.js';

let ids = [];
let stop = () => {};
const type = (input, text) => {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const leave = (input) => input.dispatchEvent(new Event('change', { bubbles: true }));

async function mount(elements, selected, kit = kitOf('clean')) {
  const made = elementDoc(elements, kitOf('clean'));
  ids = made.clipIds;
  loadDoc(made.doc);
  kitState.set({ ...standIn('p1', 'fallback'), effective: kit });
  const selection = selected.map((i) => ids[i] || 'talk');
  await store.set(ViewState, { selection });
  const el = await fixture(
    '<element-inspector style="display:block;width:280px"></element-inspector>',
  );
  const show = () => (el.model = inspectorModel(getDoc(), selection, 0));
  stop = onDocChange(show);
  show();
  await settle();
  return el;
}

describe('element-inspector', () => {
  afterEach(() => stop());

  it('shows which element of which kit, and its slots as fields', async () => {
    const el = await mount([['lower-third', { name: 'Ada', role: '' }, 1]], [0]);
    expect(el.querySelector('.element-inspector-what').textContent).to.contain('Lower third');
    expect(el.querySelector('.element-inspector-kit').textContent).to.contain('Clean');
    const fields = [...el.querySelectorAll('[data-slot]')];
    expect(fields.map((f) => `${f.dataset.slot}=${f.value}|${f.placeholder}`)).to.deep.equal([
      'name=Ada|Ada Lovelace',
      'role=|Optional',
    ]);
    expect(fields[0].getAttribute('aria-label')).to.equal('Name');
    expect(el.querySelector('.element-inspector-current').textContent).to.contain(
      'Matches the brand',
    );
  });

  it('shows nothing for other clips', async () => {
    const el = await mount([['lower-third', { name: 'Ada' }, 1]], [9]);
    expect(el.querySelector('.element-inspector')).to.equal(null);
  });

  it('fills a slot live as it is typed; a visit to a field is one undo step', async () => {
    const el = await mount([['lower-third', { name: 'Ada' }, 1]], [0]);
    const name = el.querySelector('[data-slot="name"]');
    type(name, 'Grace');
    type(name, 'Grace Hopper');
    expect(clipOf(getDoc(), ids[0]).element.slots.name).to.equal('Grace Hopper');
    expect(clipOf(getDoc(), ids[0]).label).to.equal('Grace Hopper');
    leave(name);
    expect(undo()).to.equal(true);
    expect(clipOf(getDoc(), ids[0]).element.slots.name).to.equal('Ada');
    expect(undo()).to.equal(false);
  });

  it('Escape puts back what the field held; an empty slot that must be filled is marked', async () => {
    const el = await mount([['lower-third', { name: 'Ada' }, 1]], [0]);
    const name = el.querySelector('[data-slot="name"]');
    type(name, '');
    await waitUntil(() => name.getAttribute('aria-invalid') === 'true');
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(clipOf(getDoc(), ids[0]).element.slots.name).to.equal('Ada');
    await waitUntil(() => name.value === 'Ada');
  });

  it('edits the slots several clips share together', async () => {
    const el = await mount(
      [
        ['lower-third', { name: 'A' }, 1],
        ['lower-third', { name: 'B' }, 9],
      ],
      [0, 1],
    );
    expect(el.querySelector('.element-inspector-what').textContent).to.contain('2 brand elements');
    const [name, role] = el.querySelectorAll('[data-slot]');
    expect(name.placeholder).to.equal('Mixed');
    type(role, 'Speaker');
    leave(role);
    expect(ids.map((id) => clipOf(getDoc(), id).element.slots.role)).to.deep.equal([
      'Speaker',
      'Speaker',
    ]);
    expect(undo() && !undo()).to.equal(true);
  });

  it('says when it is out of date and updates this clip, or all of them', async () => {
    const el = await mount(
      [
        ['lower-third', { name: 'A' }, 1],
        ['title', { title: 'T' }, 9],
      ],
      [0],
      kitOf('bold'),
    );
    expect(el.querySelector('.element-inspector-stale').textContent).to.contain('Out of date');
    expect(el.querySelector('[data-action="update-all"]').textContent).to.contain('Update all 2');
    el.querySelector('[data-action="update"]').click();
    await waitUntil(() => el.querySelector('.element-inspector-current'));
    expect(clipOf(getDoc(), ids[0]).element.kit.id).to.equal('bold');
    expect(clipOf(getDoc(), ids[1]).element.kit.id).to.equal('clean');
    expect(clipOf(getDoc(), ids[0]).element.slots.name).to.equal('A');
  });

  it('detaches only after saying what that means', async () => {
    const el = await mount([['lower-third', { name: 'Ada' }, 1]], [0]);
    el.querySelector('[data-action="detach"]').click();
    await waitUntil(() => confirmState.get().request);
    expect(confirmState.get().request.message).to.contain('no longer follow the brand');
    answerConfirm(false);
    await settle();
    expect(clipOf(getDoc(), ids[0])).to.exist;
    el.querySelector('[data-action="detach"]').click();
    await waitUntil(() => confirmState.get().request);
    answerConfirm(true);
    await waitUntil(() => !getDoc().tracks.some((t) => t.clips.some((c) => c.clipId === ids[0])));
    expect(
      getDoc()
        .tracks.flatMap((t) => t.clips)
        .filter((c) => c.groupId).length,
    ).to.be.at.least(3);
  });

  it('gives a clip that was just added the keyboard, its starting text selected', async () => {
    const made = elementDoc([['lower-third', { name: 'Name' }, 1]]);
    requestSlotFocus(made.clipIds[0]);
    loadDoc(made.doc);
    kitState.set({ ...standIn('p1', 'fallback'), effective: kitOf('clean') });
    const el = await fixture('<element-inspector></element-inspector>');
    el.model = inspectorModel(getDoc(), made.clipIds, 0);
    await waitUntil(() => document.activeElement?.dataset?.slot === 'name');
    expect([
      document.activeElement.selectionStart,
      document.activeElement.selectionEnd,
    ]).to.deep.equal([0, 4]);
  });
});
