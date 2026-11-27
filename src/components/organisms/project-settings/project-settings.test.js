import { fixture, expect } from '@open-wc/testing';
import { projectPageState } from '#utils/projects/projectPage.js';
import { answerConfirm, confirmState } from '#utils/ui/confirm.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import './project-settings.js';

const PROJECT = {
  id: 'p1',
  name: 'Park',
  description: 'A walk.',
  path: '/m/park',
  mediaFolders: ['/mnt/music'],
  adaptations: [],
};

describe('project-settings', () => {
  let api;
  beforeEach(() => {
    projectPageState.set({ id: 'p1', project: PROJECT });
    api = mockApi({
      'PUT /api/projects/p1': (body) => ({ ...PROJECT, ...body }),
      'GET /api/media': { data: [], total: 0 },
    });
  });
  afterEach(() => api.restore());

  it('shows name, description and the media folders', async () => {
    const el = await fixture(`<project-settings></project-settings>`);
    await settle();
    expect(el.querySelector('input[name="name"]').value).to.equal('Park');
    expect(el.querySelector('textarea[name="description"]').value).to.equal('A walk.');
    const folders = [...el.querySelectorAll('.project-settings-path')].map((n) => n.textContent);
    expect(folders).to.deep.equal(['/m/park', '/mnt/music']);
    expect(el.querySelector('.project-settings-folders .chip').textContent).to.equal(
      'Project folder',
    );
    expect(el.querySelector('button[type="submit"]').disabled).to.equal(
      true,
      'nothing to save yet',
    );
  });

  it('saves an edited name and description', async () => {
    const el = await fixture(`<project-settings></project-settings>`);
    await settle();
    const name = el.querySelector('input[name="name"]');
    name.value = 'Park day';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(el.querySelector('button[type="submit"]').disabled).to.equal(false);
    el.querySelector('form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await settle(150);
    expect(api.calls[0].body).to.deep.equal({ name: 'Park day', description: 'A walk.' });
    expect(projectPageState.get().project.name).to.equal('Park day');
    expect(el.querySelector('button[type="submit"]').disabled).to.equal(true);
  });

  it('removes an extra media folder after saying nothing is deleted', async () => {
    const el = await fixture(`<project-settings></project-settings>`);
    await settle();
    el.querySelector('button[aria-label="Stop using /mnt/music"]').click();
    await settle();
    expect(confirmState.get().request.message).to.contain('nothing is deleted');
    answerConfirm(true);
    await settle(150);
    expect(api.calls.find((c) => c.method === 'PUT').body).to.deep.equal({ mediaFolders: [] });
  });
});
