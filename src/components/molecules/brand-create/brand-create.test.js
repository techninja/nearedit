import { fixture, expect, oneEvent, waitUntil } from '@open-wc/testing';
import { brandDialog, closeBrandDialog } from '#utils/brandUi/dialogState.js';
import { kitState, standIn } from '#utils/brandUi/kitState.js';
import { elementDoc, kitOf } from '#utils/brandUi/testkit.js';
import { CREATE_DRAG_TYPE, draggedPayload, endDrag } from '#utils/create/dragTypes.js';
import { getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './brand-create.js';

const use = (kit, more = {}) =>
  kitState.set({ ...standIn('p1', 'fallback'), effective: kit, ...more });
const mount = async () => {
  const el = await fixture('<brand-create style="display:block;width:280px"></brand-create>');
  await settle();
  return el;
};

describe('brand-create', () => {
  beforeEach(() => {
    loadDoc(elementDoc([]).doc);
    use(kitOf('clean'));
  });
  afterEach(closeBrandDialog);

  it('shows the kit and its elements as tiles, grouped', async () => {
    const el = await mount();
    expect(el.querySelector('.brand-create-name strong').textContent).to.equal('Clean');
    expect(el.querySelectorAll('.brand-swatches i').length).to.equal(5);
    const titles = [...el.querySelectorAll('.field-group-title')].map((t) => t.textContent);
    expect(titles).to.deep.equal(['Overlays', 'Segments', 'Transitions']);
    const tiles = [...el.querySelectorAll('.create-panel-tile')];
    expect(tiles.map((t) => t.dataset.element)).to.deep.equal(
      'lower-third title caption quote bug chapter intro outro stinger'.split(' '),
    );
    expect(tiles[0].querySelector('brand-frame canvas')).to.exist;
    expect(tiles[0].title).to.contain('Lower third goes over the picture');
  });

  it('asks to add the element of the tile that was pressed', async () => {
    const el = await mount();
    const tile = el.querySelector('[data-element="quote"]');
    setTimeout(() => tile.click());
    const { detail } = await oneEvent(el, 'brand-add');
    expect(detail).to.deep.equal({ element: 'quote' });
  });

  it('carries the element when a tile is dragged, and plays the tile under the keyboard', async () => {
    const el = await mount();
    const tile = el.querySelector('[data-element="title"]');
    tile.dispatchEvent(
      new DragEvent('dragstart', { dataTransfer: new DataTransfer(), bubbles: true }),
    );
    expect(draggedPayload(CREATE_DRAG_TYPE)).to.deep.equal({
      kind: 'element',
      element: 'title',
      label: 'Title',
    });
    endDrag();
    tile.focus();
    await waitUntil(() => tile.querySelector('brand-frame').playing === true);
  });

  it('opens the Brand dialog', async () => {
    const el = await mount();
    el.querySelector('.brand-create-open').click();
    expect(brandDialog.get().open).to.equal(true);
  });

  it('says how many clips are out of date and updates them when asked — never by itself', async () => {
    const made = elementDoc([
      ['lower-third', { name: 'Ada' }, 1],
      ['title', { title: 'T' }, 9],
    ]);
    loadDoc(made.doc);
    const el = await mount();
    expect(el.querySelector('.brand-stale')).to.equal(null);
    use(kitOf('bold'));
    await waitUntil(() => el.querySelector('.brand-stale'));
    expect(el.querySelector('.brand-stale').textContent).to.contain('2 elements');
    expect(getDoc()).to.equal(made.doc);
    el.querySelector('.brand-stale-update').click();
    await waitUntil(() => el.querySelector('.brand-stale-done'));
    expect(el.querySelector('.brand-stale-done').textContent).to.contain('Updated 2 elements');
    expect(undo() && !undo()).to.equal(true);
  });

  it('says plainly when the chosen kit is gone', async () => {
    const problems = [
      {
        path: 'choice',
        message: 'Kit "acme" was not found: builtin:clean is used',
        level: 'error',
      },
    ];
    use(kitOf('clean'), { problems, status: 'ready', choice: 'acme' });
    const el = await mount();
    expect(el.querySelector('.brand-trouble').textContent).to.contain('Kit "acme" was not found');
  });
});
