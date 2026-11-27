import { fixture, expect } from '@open-wc/testing';
import { folderPickState, pickFolder } from '#utils/projects/folderPick.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import './folder-browser.js';

const ROOT = '/home/me';
const listing = (path) => ({
  path,
  parent: path === ROOT ? null : ROOT,
  roots: [ROOT],
  hasProject: path.endsWith('/trip'),
  dirs:
    path === ROOT
      ? [
          { name: 'footage', path: `${ROOT}/footage`, hasProject: false },
          { name: 'trip', path: `${ROOT}/trip`, hasProject: true },
        ]
      : [],
});

describe('folder-browser', () => {
  let api;
  beforeEach(() => {
    folderPickState.set({
      request: null,
      listing: null,
      error: '',
      naming: false,
      nativeTried: true,
    });
    api = mockApi({
      'GET /api/browse': (_body, url) => listing(url.searchParams.get('path') || ROOT),
      'POST /api/browse/mkdir': (body) => [201, { path: `${body.path}/${body.name}` }],
    });
  });
  afterEach(() => api.restore());

  it('shows nothing until a folder is asked for', async () => {
    const el = await fixture(`<folder-browser></folder-browser>`);
    await settle();
    expect(el.querySelector('app-dialog')).to.equal(null);
  });

  it('lists folders, marks those holding a project, and resolves with the chosen folder', async () => {
    const el = await fixture(`<folder-browser></folder-browser>`);
    const picked = pickFolder({
      title: 'Choose the project folder',
      confirmLabel: 'Use this folder',
      projectNote: 'It will be opened.',
    });
    await settle(150);
    expect(el.querySelector('[role="dialog"]').getAttribute('aria-label')).to.equal(
      'Choose the project folder',
    );
    const rows = [...el.querySelectorAll('.folder-list-row')];
    expect(rows.map((r) => r.querySelector('.folder-list-name').textContent)).to.deep.equal([
      'footage',
      'trip',
    ]);
    expect(rows[1].querySelector('.folder-list-project')).to.not.equal(null);
    expect(rows[0].querySelector('.folder-list-project')).to.equal(null);
    rows[1].click();
    await settle(150);
    expect(el.querySelector('[aria-current="location"]').textContent.trim()).to.equal('trip');
    expect(el.querySelector('.app-dialog-note').textContent).to.equal('It will be opened.');
    expect(el.querySelector('.folder-list-up')).to.not.equal(null);
    el.querySelector('.folder-browser-choose').click();
    expect(await picked).to.deep.equal({ path: `${ROOT}/trip`, hasProject: true });
    await settle();
    expect(el.querySelector('app-dialog')).to.equal(null);
  });

  it('resolves with null when dismissed', async () => {
    const el = await fixture(`<folder-browser></folder-browser>`);
    const picked = pickFolder();
    await settle(150);
    el.querySelector('.dialog-footer .btn-secondary').click();
    expect(await picked).to.equal(null);
  });

  it('creates a folder and steps into it', async () => {
    const el = await fixture(`<folder-browser></folder-browser>`);
    pickFolder({ startPath: ROOT });
    await settle(150);
    el.querySelector('.folder-browser-add').click();
    await settle();
    const input = el.querySelector('folder-new input');
    input.value = 'new shoot';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    el.querySelector('folder-new form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await settle(200);
    const made = api.calls.find((c) => c.path === '/api/browse/mkdir');
    expect(made.body).to.deep.equal({ path: ROOT, name: 'new shoot' });
    expect(el.querySelector('[aria-current="location"]').textContent.trim()).to.equal('new shoot');
    expect(el.querySelector('folder-new')).to.equal(null);
  });

  it('moves between rows with the arrow keys and goes up with Backspace', async () => {
    const el = await fixture(`<folder-browser></folder-browser>`);
    pickFolder({ startPath: `${ROOT}/trip` });
    await settle(200);
    const up = el.querySelector('.folder-list-up');
    up.focus();
    up.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
    );
    await settle(200);
    expect(el.querySelector('[aria-current="location"]').textContent.trim()).to.equal('me');
    const rows = [...el.querySelectorAll('.folder-list-row')];
    rows[0].focus();
    rows[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).to.equal(rows[1]);
  });
});
