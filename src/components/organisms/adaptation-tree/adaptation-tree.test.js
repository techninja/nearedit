import { fixture, expect } from '@open-wc/testing';
import { projectPageState } from '#utils/projects/projectPage.js';
import { confirmState, answerConfirm } from '#utils/ui/confirm.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import './adaptation-tree.js';
import '#organisms/adaptation-dialog/index.js';

const a = (id, parentAdaptationId, name, aspectRatio = '16:9') => ({
  id,
  projectId: 'p1',
  parentAdaptationId,
  name,
  aspectRatio,
  resolution: aspectRatio === '16:9' ? '1920x1080' : '1080x1920',
  fps: 30,
  status: 'draft',
});
const PROJECT = {
  id: 'p1',
  name: 'Park',
  path: '/m/park',
  mediaFolders: [],
  adaptations: [
    a('long', '', 'Long form'),
    a('podcast', '', 'Podcast'),
    a('reel', 'long', 'Reel', '9:16'),
    a('teaser', 'reel', 'Teaser', '9:16'),
  ],
};

describe('adaptation-tree', () => {
  let api;
  beforeEach(() =>
    projectPageState.set({ id: 'p1', project: PROJECT, loading: false, dialog: null }),
  );
  afterEach(() => api?.restore());

  it('shows the adaptations nested under their parents', async () => {
    const el = await fixture(`<adaptation-tree></adaptation-tree>`);
    await settle();
    const rows = [...el.querySelectorAll('adaptation-row')].map((row) => [
      row.querySelector('.adaptation-row-name').textContent,
      row.depth,
    ]);
    expect(rows).to.deep.equal([
      ['Long form', 0],
      ['Reel', 1],
      ['Teaser', 2],
      ['Podcast', 0],
    ]);
  });

  it('opens the form for a variant with a 9:16 copy of its parent proposed', async () => {
    const wrap = await fixture(
      `<div><adaptation-tree></adaptation-tree><adaptation-dialog></adaptation-dialog></div>`,
    );
    await settle();
    wrap.querySelector('adaptation-row [data-action="variant"]').click();
    await settle();
    const { dialog } = projectPageState.get();
    expect(dialog.values).to.deep.include({
      parentId: 'long',
      aspectRatio: '9:16',
      resolution: '1080x1920',
      copy: true,
    });
    expect(
      wrap.querySelector('adaptation-dialog [role="dialog"]').getAttribute('aria-label'),
    ).to.equal('New adaptation');
    expect(
      wrap.querySelector('adaptation-shapes [aria-pressed="true"] strong').textContent,
    ).to.equal('9:16');
    expect(wrap.querySelector('adaptation-options input[name="copy"]').checked).to.equal(true);
  });

  it('creates the variant as a copy and reloads the project', async () => {
    api = mockApi({
      'POST /api/projects/p1/adaptations': (body) => [201, { id: 'new', ...body }],
      'GET /api/projects/p1': PROJECT,
    });
    const wrap = await fixture(
      `<div><adaptation-tree></adaptation-tree><adaptation-dialog></adaptation-dialog></div>`,
    );
    await settle();
    wrap.querySelector('adaptation-row [data-action="variant"]').click();
    await settle();
    wrap
      .querySelector('adaptation-dialog form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle(200);
    const post = api.calls.find((c) => c.method === 'POST');
    expect(post.body).to.deep.equal({
      name: 'Long form — Vertical',
      aspectRatio: '9:16',
      resolution: '1080x1920',
      fps: 30,
      parentAdaptationId: 'long',
      copyFrom: 'long',
    });
    expect(api.calls.some((c) => c.method === 'GET' && c.path === '/api/projects/p1')).to.equal(
      true,
    );
    expect(projectPageState.get().dialog).to.equal(null);
  });

  it('tells where the children go before deleting', async () => {
    api = mockApi({
      'DELETE /api/projects/p1/adaptations/reel': [204, null],
      'GET /api/projects/p1': PROJECT,
    });
    const el = await fixture(`<adaptation-tree></adaptation-tree>`);
    await settle();
    el.querySelectorAll('adaptation-row')[1].querySelector('[data-action="delete"]').click();
    await settle();
    const { request } = confirmState.get();
    expect(request.title).to.equal('Delete “Reel”?');
    expect(request.message).to.contain('Its variant “Teaser” moves under “Long form”.');
    expect(request.danger).to.equal(true);
    answerConfirm(true);
    await settle(150);
    expect(api.calls[0]).to.include({
      method: 'DELETE',
      path: '/api/projects/p1/adaptations/reel',
    });
  });
});
