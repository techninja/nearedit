import { fixture, expect } from '@open-wc/testing';
import { homeState } from '#utils/projects/home.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import './project-list.js';

const project = (id, extra = {}) => ({
  id,
  name: `Project ${id}`,
  description: '',
  path: `/media/${id}`,
  available: true,
  mediaFolders: [],
  adaptations: [{ id: 'a' }],
  updatedAt: '',
  ...extra,
});

describe('project-list', () => {
  let api;
  beforeEach(() => homeState.set({ projects: [], loading: true, error: '', create: null }));
  afterEach(() => api.restore());

  it('explains the three steps while there are no projects', async () => {
    api = mockApi({ 'GET /api/projects': { data: [], total: 0 } });
    const el = await fixture(`<project-list></project-list>`);
    await settle(120);
    const steps = [...el.querySelectorAll('.project-list-steps strong')].map((n) => n.textContent);
    expect(steps).to.deep.equal(['1. Pick a folder of footage', '2. Analyse', '3. Edit']);
    el.querySelector('.project-list-welcome .btn-primary').click();
    expect(homeState.get().create).to.not.equal(null);
  });

  it('lists projects as cards', async () => {
    api = mockApi({
      'GET /api/projects': { data: [project('one'), project('two', { available: false })] },
    });
    const el = await fixture(`<project-list></project-list>`);
    await settle(150);
    const names = [...el.querySelectorAll('project-card .project-card-name')].map(
      (n) => n.textContent,
    );
    expect(names).to.deep.equal(['Project one', 'Project two']);
    expect(el.querySelectorAll('.project-card-missing').length).to.equal(1);
    expect(el.querySelector('.project-list-header .btn-primary').textContent).to.contain(
      'New project',
    );
  });

  it('shows why the list could not be loaded and retries', async () => {
    let fail = true;
    api = mockApi({
      'GET /api/projects': () =>
        fail ? [500, { error: 'Registry unreadable' }] : { data: [project('one')] },
    });
    const el = await fixture(`<project-list></project-list>`);
    await settle(120);
    expect(el.querySelector('[role="alert"]').textContent).to.contain('Registry unreadable');
    fail = false;
    el.querySelector('[role="alert"] button').click();
    await settle(150);
    expect(el.querySelectorAll('project-card').length).to.equal(1);
  });
});
