import { fixture, expect } from '@open-wc/testing';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { createEdl } from '#utils/edl/factory.js';
import { clipOf } from '#utils/edl/testkit.js';
import { getDoc, loadDoc } from '#utils/editor/session.js';
import { exportState } from '#utils/ui/exportController.js';
import { recipeKey } from '#utils/web/index.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import { recordingState } from '#utils/webUi/recording.js';
import { webDoc } from '#utils/webUi/testkit.js';
import './export-dialog.js';

describe('export-dialog and web clips', () => {
  let api;
  let clipId = '';
  beforeEach(async () => {
    const made = webDoc([{ do: 'click', target: '#a' }]);
    clipId = made.clipId;
    loadDoc(made.doc);
    recordingState.set({ byClip: {} });
    exportState.set({ adaptationId: '', presets: [], job: null, result: null, starting: false });
    await store.set(ProjectState, { projectId: 'p1', adaptationId: 'a1', adaptationName: 'Main' });
    api = mockApi({
      'GET /api/render/presets': { data: [{ id: 'standard', label: 'Standard', description: '' }] },
      'POST /api/render/plan': { width: 1920, height: 1080, fps: 30, duration: 3, warnings: [] },
      'POST /api/web/record': [202, { jobId: 'j1' }],
      'GET /api/jobs/j1': { id: 'j1', type: 'web', status: 'complete', progress: 100 },
      'GET /api/jobs/j1/result': () => {
        const key = recipeKey(clipOf(getDoc(), clipId).web.recipe, 30);
        return { file: `/p/.nearedit/web/${key}.mp4`, key, duration: 2.9, title: 'Example' };
      },
    });
  });
  afterEach(() => api.restore());

  it('warns that a web clip is not recorded and records it first when asked', async () => {
    const el = await fixture(`<export-dialog></export-dialog>`);
    el.open = true;
    await settle(200);
    const note = el.querySelector('.export-dialog-web');
    expect(note.querySelector('strong').textContent).to.equal(
      '1 web clip is not ready: 1 not recorded yet.',
    );
    expect(el.querySelector('.export-dialog-start').disabled).to.equal(false);
    // The note comes before the options, where it is seen without scrolling.
    const options = el.querySelector('export-options');
    const after = note.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(after).to.equal(Node.DOCUMENT_POSITION_FOLLOWING);
    note.querySelector('.export-dialog-record').click();
    await settle(300);
    expect(api.calls.some((call) => call.path === '/api/web/record')).to.equal(true);
    expect(clipOf(getDoc(), clipId).web.key).to.not.equal('');
    expect(el.querySelector('.export-dialog-web')).to.equal(null);
    // What will be rendered was asked for again, with the recorded clip.
    const plans = api.calls.filter((call) => call.path === '/api/render/plan');
    expect(plans.length).to.equal(2);
    expect(plans[1].body.edl.tracks[0].clips[0].sourceFile).to.contain('.nearedit/web/');
  });

  it('says nothing when the timeline has no web clip that needs recording', async () => {
    loadDoc(createEdl());
    const el = await fixture(`<export-dialog></export-dialog>`);
    el.open = true;
    await settle(200);
    expect(el.querySelector('.export-dialog-web')).to.equal(null);
  });
});
