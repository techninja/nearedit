import { fixture, expect } from '@open-wc/testing';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { resetAvailability } from '#utils/cutoutUi/availability.js';
import { startCutouts } from '#utils/cutoutUi/runtime.js';
import { SELFIE, cutoutDoc, madeFor } from '#utils/cutoutUi/testkit.js';
import { cutoutState, setCutout } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import { getDoc, loadDoc } from '#utils/editor/session.js';
import { exportState } from '#utils/ui/exportController.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import '#organisms/export-dialog/export-dialog.js';

const NEED = { path: SELFIE, start: 3, end: 10, fps: 30 };
const me = () => clipOf(getDoc(), 'me');

describe('the export dialog and cutouts', () => {
  let api;
  let stop = () => {};
  let job = { status: 'error', error: 'The matte program stopped' };
  beforeEach(async () => {
    resetAvailability();
    loadDoc(setCutout(cutoutDoc(), ['me'], true));
    job = { status: 'error', error: 'The matte program stopped' };
    exportState.set({ adaptationId: '', presets: [], job: null, result: null, starting: false });
    await store.set(ProjectState, { projectId: 'p1', adaptationId: 'a1', adaptationName: 'Main' });
    api = mockApi({
      'GET /api/render/presets': { data: [{ id: 'standard', label: 'Standard', description: '' }] },
      'POST /api/render/plan': { width: 1920, height: 1080, fps: 30, duration: 12, warnings: [] },
      'GET /api/cutout/status': { available: true, reason: '' },
      'GET /api/jobs': { data: [] },
      'POST /api/cutout': [202, { jobId: 'j1' }],
      'GET /api/jobs/j1': () => ({ id: 'j1', type: 'cutout', ...job }),
      'GET /api/jobs/j1/result': madeFor(NEED),
    });
    stop = startCutouts({ delay: 5 });
  });
  afterEach(() => {
    stop();
    api.restore();
  });

  it('says which clips wait for a cutout, and makes them first when asked', async () => {
    const el = await fixture(`<export-dialog></export-dialog>`);
    el.open = true;
    await settle(250);
    const note = el.querySelector('.export-dialog-cutout');
    expect(note.querySelector('strong').textContent).to.equal(
      '1 clip is waiting for its cutout: selfie.mp4.',
    );
    expect(note.textContent).to.match(/would render with\s+their background/);
    expect(note.querySelector('.error-message').textContent).to.equal('The matte program stopped');
    expect(el.querySelector('.export-dialog-start').disabled).to.equal(false);
    job = { status: 'complete', progress: 100 };
    note.querySelector('.export-dialog-make').click();
    await settle(500);
    expect(cutoutState(me(), 30)).to.equal('ready');
    expect(el.querySelector('.export-dialog-cutout')).to.equal(null);
    // What will be rendered was asked for again, with the cutout attached.
    const plans = api.calls.filter((call) => call.path === '/api/render/plan');
    expect(plans.length).to.equal(2);
    expect(plans[1].body.edl.tracks[0].clips[0].cutout.made.source).to.equal(SELFIE);
  });

  it('shows the progress of a cutout that is being made', async () => {
    job = { status: 'running', progress: 40, log: ['frame 84 of 210'] };
    const el = await fixture(`<export-dialog></export-dialog>`);
    el.open = true;
    await settle(250);
    const note = el.querySelector('.export-dialog-cutout');
    expect(note.textContent).to.contain('Making it now — frame 84 of 210…');
    expect(note.querySelector('.export-dialog-make')).to.equal(null);
  });

  it('says nothing when every cutout is made, or none is on', async () => {
    loadDoc(cutoutDoc());
    const el = await fixture(`<export-dialog></export-dialog>`);
    el.open = true;
    await settle(250);
    expect(el.querySelector('.export-dialog-cutout')).to.equal(null);
    expect(el.querySelector('.export-dialog-summary')).to.not.equal(null);
  });
});
