import { fixture, expect } from '@open-wc/testing';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { resetAvailability } from '#utils/cutoutUi/availability.js';
import { cutoutJobs } from '#utils/cutoutUi/state.js';
import { SELFIE, cutoutDoc, madeFor } from '#utils/cutoutUi/testkit.js';
import { cutoutState, setCutout } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import { edit, getDoc, loadDoc } from '#utils/editor/session.js';
import { clipBadges } from '#utils/timeline/badges.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import './cutout-watch.js';

const NEED = { path: SELFIE, start: 3, end: 10, fps: 30 };
const me = () => clipOf(getDoc(), 'me');
const badge = () => clipBadges(me(), getDoc().tracks[0])[0];

/** Wait until something is true. @param {() => boolean} test */
async function until(test) {
  for (let waited = 0; !test() && waited < 4000; waited += 20) await settle(20);
  expect(test(), String(test)).to.equal(true);
}

describe('cutout-watch', () => {
  let api;
  let job = { status: 'running', progress: 40, log: ['frame 84 of 210'] };
  beforeEach(async () => {
    resetAvailability();
    loadDoc(setCutout(cutoutDoc(), ['me'], true));
    job = { status: 'running', progress: 40, log: ['frame 84 of 210'] };
    await store.set(ProjectState, { projectId: 'p1', adaptationId: 'a1' });
    api = mockApi({
      'GET /api/cutout/status': { available: true, reason: '' },
      'GET /api/jobs': { data: [] },
      'POST /api/cutout': [202, { jobId: 'j1' }],
      'GET /api/jobs/j1': () => ({ id: 'j1', type: 'cutout', ...job }),
      'GET /api/jobs/j1/result': madeFor(NEED),
      'DELETE /api/jobs/j1': [204, null],
    });
  });
  afterEach(() => api.restore());

  it('makes the cutouts of the open document while it is on the page', async function () {
    this.timeout(8000); // the job is polled every three seconds
    expect(badge()).to.equal(undefined);
    const el = await fixture(`<cutout-watch></cutout-watch>`);
    await until(() => cutoutJobs.get().byPath[SELFIE]?.status === 'running');
    const post = api.calls.find((call) => call.method === 'POST');
    expect(post.body).to.deep.equal({ projectId: 'p1', ...NEED });
    expect(badge().text).to.equal('Cutout 40%');
    expect(badge().tone).to.equal('busy');
    await settle();
    const live = el.querySelector('[role="status"]');
    expect(live.textContent).to.equal('Cutting out the person in selfie.mp4');
    expect(live.classList.contains('sr-only')).to.equal(true);
    job = { status: 'complete', progress: 100 };
    cutoutJobs.set({}); // nothing changed: the next poll brings the news
    await until(() => cutoutState(me(), 30) === 'ready');
    expect(badge().text).to.equal('Cutout');
    expect(badge().tone).to.equal('on');
    await settle();
    expect(live.textContent).to.equal('');
  });

  it('makes nothing more once it has left the page', async function () {
    this.timeout(8000);
    job = { status: 'complete', progress: 100 };
    const el = await fixture(`<cutout-watch></cutout-watch>`);
    await until(() => cutoutState(me(), 30) === 'ready');
    expect(api.calls.filter((call) => call.method === 'POST').length).to.equal(1);
    el.remove();
    await settle();
    expect(badge()).to.equal(undefined);
    edit((doc) => setCutout(doc, ['other'], true));
    await settle(900);
    expect(api.calls.filter((call) => call.method === 'POST').length).to.equal(1);
    expect(cutoutState(clipOf(getDoc(), 'other'), 30)).to.equal('missing');
  });
});
