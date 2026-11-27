import { fixture, expect } from '@open-wc/testing';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import UserPrefs, { USER_PREFS_KEY } from '#store/UserPrefs.js';
import { ACTIONS } from '#utils/director/actions.js';
import { directorState } from '#utils/directorUi/state.js';
import { loadDoc } from '#utils/editor/session.js';
import { createEdl } from '#utils/edl/factory.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import './director-panel.js';

const LLM_OFF = { available: false, provider: 'none', model: 'qwen3:14b', detail: 'disabled' };
const routes = (llm) => ({
  'GET /api/director/actions': { data: ACTIONS },
  'GET /api/intelligence/status': { llm },
});

describe('director-panel', () => {
  let api;
  beforeEach(async () => {
    localStorage.removeItem(USER_PREFS_KEY);
    store.clear(UserPrefs);
    directorState.set({
      actions: [],
      llm: null,
      actionId: '',
      history: [],
      scripts: null,
      run: null,
      result: null,
      error: null,
    });
    loadDoc(createEdl());
    await store.set(ProjectState, { projectId: 'p1', adaptationId: 'a1', loaded: true });
  });
  afterEach(() => api?.restore());

  it('asks for an adaptation before one is loaded', async () => {
    await store.set(ProjectState, { loaded: false });
    api = mockApi(routes(LLM_OFF));
    const el = await fixture(`<director-panel></director-panel>`);
    await settle();
    expect(el.querySelector('.empty-state').textContent).to.contain('Open an adaptation');
  });

  it('builds the action list from the server’s schemas, with the first-use hint', async () => {
    api = mockApi(routes({ available: true, provider: 'ollama', model: 'qwen3:14b' }));
    const el = await fixture(`<director-panel></director-panel>`);
    await settle(120);
    expect(api.calls.map((c) => c.path)).to.include('/api/director/actions');
    expect(el.querySelectorAll('.director-actions-item').length).to.equal(ACTIONS.length);
    expect(el.querySelector('.app-callout').textContent).to.contain('Base edit');
    expect(el.querySelector('.app-callout').textContent).to.contain('no AI needed');
    expect(el.querySelectorAll('.director-actions-item:disabled').length).to.equal(0);
  });

  it('disables AI actions and explains when no LLM is available', async () => {
    api = mockApi(routes(LLM_OFF));
    const el = await fixture(`<director-panel></director-panel>`);
    await settle(120);
    expect(el.querySelectorAll('.director-actions-item:disabled').length).to.equal(3);
    expect(el.querySelector('.director-panel-llm').textContent).to.contain(
      'No language model is set up',
    );
    expect(el.querySelector('[data-id="base_edit"]').disabled).to.equal(false);
  });

  it('opens an action as a generated form with its modes and a run button', async () => {
    api = mockApi(routes(LLM_OFF));
    const el = await fixture(`<director-panel></director-panel>`);
    await settle(120);
    el.querySelector('[data-id="base_edit"]').click();
    await settle();
    expect(el.querySelector('.director-panel-head h3').textContent).to.equal('Base edit');
    const modes = [...el.querySelectorAll('director-modes input')].map((r) => [r.value, r.checked]);
    expect(modes[0]).to.deep.equal(['replace', true]);
    expect(el.querySelector('director-form input[name="duration"]')).to.not.equal(null);
    expect(el.querySelector('.director-panel-more summary').textContent).to.contain('More options');
    expect(el.querySelector('.director-panel-run .btn').textContent.trim()).to.equal(
      'Run base edit',
    );
    expect(el.querySelector('.director-panel-prompt')).to.equal(null, 'base edit takes no prompt');
  });

  it('posts the directive with the timeline and merges the result as one undo step', async () => {
    const clip = {
      clipId: 'x',
      sourceFile: '/m/a.mp4',
      sourceIn: 0,
      sourceOut: 2,
      timelineStart: 0,
      timelineEnd: 2,
    };
    const result = {
      mode: 'replace',
      at: 0,
      range: null,
      duration: 2,
      markers: [],
      summary: '1 clip, 2s',
      notes: ['kept short'],
      tracks: [{ type: 'video', index: 0, name: 'Main', clips: [clip] }],
    };
    const done = {
      id: 'job1',
      type: 'director',
      status: 'complete',
      progress: 100,
      log: [],
      result: {},
    };
    api = mockApi({
      ...routes(LLM_OFF),
      'POST /api/director': [202, { jobId: 'job1' }],
      'GET /api/jobs/job1': done,
      'GET /api/jobs/job1/result': result,
    });
    const el = await fixture(`<director-panel></director-panel>`);
    await settle(120);
    el.querySelector('[data-id="base_edit"]').click();
    await settle();
    el.querySelector('.director-panel-run .btn').click();
    await settle(300);
    const posted = api.calls.find((c) => c.method === 'POST' && c.path === '/api/director').body;
    expect(posted.projectId).to.equal('p1');
    expect(posted.adaptationId).to.equal('a1');
    expect(posted.directive.action).to.equal('base_edit');
    expect(posted.directive.mode).to.equal('replace');
    expect(posted.edl.tracks).to.be.an('array');
    const session = await import('#utils/editor/session.js');
    expect(session.getDoc().tracks[0].clips.length).to.equal(1);
    expect(el.querySelector('.director-panel-done').textContent).to.contain('1 clip, 2s');
    expect(el.querySelector('.director-panel-done').textContent).to.contain('kept short');
    expect(session.undo()).to.equal(true);
    expect(session.getDoc().tracks[0].clips.length).to.equal(0);
    expect(session.canUndo()).to.equal(false, 'the whole run was a single step');
  });
});
