import { fixture, expect } from '@open-wc/testing';
import { homeState, openCreate } from '#utils/projects/home.js';
import { NAVIGATE_EVENT } from '#utils/ui/routes.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import './project-create.js';

const form = (extra) => ({
  path: '',
  hasProject: false,
  name: '',
  nameTouched: false,
  busy: false,
  error: '',
  ...extra,
});

describe('project-create', () => {
  let api;
  beforeEach(() => homeState.set({ projects: [], loading: false, error: '', create: null }));
  afterEach(() => api?.restore());

  it('is closed until asked for', async () => {
    const el = await fixture(`<project-create></project-create>`);
    await settle();
    expect(el.querySelector('app-dialog')).to.equal(null);
  });

  it('needs a folder before it can create', async () => {
    const el = await fixture(`<project-create></project-create>`);
    openCreate();
    await settle();
    expect(el.querySelector('.project-create-path').textContent.trim()).to.equal(
      'No folder chosen yet',
    );
    expect(el.querySelector('.project-create-submit').disabled).to.equal(true);
  });

  it('creates a project with the folder and the typed name', async () => {
    api = mockApi({
      'POST /api/projects': (body) => [
        201,
        { id: 'p9', name: body.name, path: body.path, adaptations: [] },
      ],
    });
    const el = await fixture(`<project-create></project-create>`);
    homeState.set({ create: form({ path: '/media/park', name: 'park' }) });
    await settle();
    const name = el.querySelector('input[name="name"]');
    expect(name.value).to.equal('park');
    name.value = 'Park adventure';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    const submit = el.querySelector('.project-create-submit');
    expect(submit.textContent.trim()).to.equal('Create project');
    expect(submit.disabled).to.equal(false);
    // The app now goes to the project page; here the navigation is caught.
    const visited = [];
    const catchNavigation = (event) => {
      event.preventDefault();
      visited.push(event.detail.path);
    };
    window.addEventListener(NAVIGATE_EVENT, catchNavigation);
    el.querySelector('form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await settle(150);
    window.removeEventListener(NAVIGATE_EVENT, catchNavigation);
    expect(visited).to.deep.equal(['/project/p9']);
    expect(homeState.get().create).to.equal(null, 'the form closes');
    expect(api.calls[0].body).to.deep.equal({ name: 'Park adventure', path: '/media/park' });
  });

  it('says a folder that holds a project will be opened, not created', async () => {
    const el = await fixture(`<project-create></project-create>`);
    homeState.set({ create: form({ path: '/media/old', hasProject: true }) });
    await settle();
    expect(el.querySelector('.project-create-existing').textContent).to.contain('opened');
    expect(el.querySelector('input[name="name"]')).to.equal(null);
    expect(el.querySelector('.project-create-submit').textContent.trim()).to.equal('Open project');
    expect(el.querySelector('.project-create-submit').disabled).to.equal(false);
  });

  it('shows the server’s refusal', async () => {
    const el = await fixture(`<project-create></project-create>`);
    homeState.set({
      create: form({
        path: '/etc',
        name: 'x',
        error: 'Path is outside the folders this server may browse',
      }),
    });
    await settle();
    expect(el.querySelector('[role="alert"]').textContent).to.contain('outside the folders');
  });
});
