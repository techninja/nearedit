import { fixture, expect } from '@open-wc/testing';
import { projectPageState } from '#utils/projects/projectPage.js';
import { answerConfirm, confirmState } from '#utils/ui/confirm.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import './project-renders.js';

const RENDER = {
  file: 'main draft.mp4',
  url: '/api/render/file/main%20draft.mp4',
  size: 1536 * 1024,
  createdAt: Date.now() - 60000 * 5,
  projectId: 'p1',
  adaptationId: 'a1',
  width: 960,
  height: 540,
  duration: 20,
};
const PROJECT = { id: 'p1', adaptations: [{ id: 'a1', name: 'Main Edit' }] };

describe('project-renders', () => {
  let api;
  beforeEach(() => projectPageState.set({ id: 'p1', project: PROJECT, renders: [RENDER] }));
  afterEach(() => api?.restore());

  it('says where renders come from while there are none', async () => {
    projectPageState.set({ renders: [] });
    const el = await fixture(`<project-renders></project-renders>`);
    await settle();
    expect(el.textContent).to.contain('Nothing rendered yet');
  });

  it('lists a render with its facts, open and download links', async () => {
    const el = await fixture(`<project-renders></project-renders>`);
    await settle();
    const name = el.querySelector('.project-renders-name');
    expect(name.textContent.trim()).to.equal('main draft.mp4');
    expect(name.getAttribute('href')).to.equal(RENDER.url);
    expect(name.getAttribute('target')).to.equal('_blank');
    expect(
      el.querySelector('.project-renders-facts').textContent.replace(/\s+/g, ' ').trim(),
    ).to.equal('Main Edit · 960×540 · 0:20 · 1.5 MB · 5 minutes ago');
    const download = el.querySelector('a[download]');
    expect(download.getAttribute('href')).to.equal(`${RENDER.url}?download`);
  });

  it('deletes a render after confirming', async () => {
    api = mockApi({
      'DELETE /api/render/file/main%20draft.mp4': [204, null],
      'GET /api/renders': { data: [] },
    });
    const el = await fixture(`<project-renders></project-renders>`);
    await settle();
    el.querySelector('button[aria-label="Delete main draft.mp4"]').click();
    await settle();
    expect(confirmState.get().request.danger).to.equal(true);
    answerConfirm(true);
    await settle(150);
    expect(api.calls[0].method).to.equal('DELETE');
    expect(projectPageState.get().renders).to.deep.equal([]);
  });
});
