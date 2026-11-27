import { fixture, expect } from '@open-wc/testing';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { editorPageState } from '#utils/ui/editorPage.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import './app-editor-bar.js';

const OPEN = {
  projectId: 'p1',
  projectName: 'Park',
  adaptationId: 'a1',
  adaptationName: 'Main Edit',
  aspectRatio: '9:16',
  loaded: true,
  dirty: false,
  saveError: '',
};

describe('app-editor-bar', () => {
  let api;
  beforeEach(async () => {
    api = mockApi({});
    editorPageState.set({ status: 'ready', canUndo: false, canRedo: false, exportOpen: false });
    await store.set(ProjectState, OPEN);
  });
  afterEach(() => api.restore());

  it('shows what is open, its aspect ratio, and the way back to the project', async () => {
    const el = await fixture(`<app-editor-bar></app-editor-bar>`);
    await settle();
    expect(el.querySelector('.app-editor-bar-project').textContent).to.equal('Park');
    expect(el.querySelector('.app-editor-bar-adaptation').textContent).to.equal('Main Edit');
    expect(el.querySelector('.app-editor-bar-aspect').textContent).to.equal('9:16');
    expect(el.querySelector('a[aria-label="Back to the project"]').getAttribute('href')).to.equal(
      '/project/p1',
    );
  });

  it('shows saved, saving and a failed save with retry', async () => {
    const el = await fixture(`<app-editor-bar></app-editor-bar>`);
    await settle();
    const text = () =>
      el.querySelector('.app-editor-bar-save').textContent.replace(/\s+/g, ' ').trim();
    expect(text()).to.equal('Saved');
    await store.set(ProjectState, { dirty: true });
    await settle();
    expect(text()).to.equal('Saving…');
    expect(el.querySelector('.app-editor-bar-save .spinner')).to.not.equal(null);
    await store.set(ProjectState, { saveError: 'Invalid edl' });
    await settle();
    const retry = el.querySelector('button.app-editor-bar-save-error');
    expect(retry.textContent.replace(/\s+/g, ' ').trim()).to.equal('Not saved Retry');
    expect(retry.title).to.contain('Invalid edl');
  });

  it('enables undo and redo only when there is something to undo or redo', async () => {
    const el = await fixture(`<app-editor-bar></app-editor-bar>`);
    await settle();
    const undo = el.querySelector('button[aria-label="Undo"]');
    const redo = el.querySelector('button[aria-label="Redo"]');
    expect([undo.disabled, redo.disabled]).to.deep.equal([true, true]);
    editorPageState.set({ canUndo: true });
    await settle();
    expect([undo.disabled, redo.disabled]).to.deep.equal([false, true]);
  });

  it('opens the export dialog, once an adaptation is ready', async () => {
    const el = await fixture(`<app-editor-bar></app-editor-bar>`);
    await settle();
    el.querySelector('.app-editor-bar-export').click();
    expect(editorPageState.get().exportOpen).to.equal(true);
    editorPageState.set({ status: 'loading', exportOpen: false });
    await settle();
    expect(el.querySelector('.app-editor-bar-export').disabled).to.equal(true);
    expect(el.querySelector('.app-editor-bar-aspect')).to.equal(null);
  });
});
