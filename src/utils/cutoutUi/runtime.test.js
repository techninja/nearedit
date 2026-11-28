import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { cutoutState, setCutout } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import { jobState, refreshJobs } from '#utils/ui/jobCenter.js';
import { clearToasts, toastState } from '#utils/ui/toast.js';
import { fakeBrowser, fakeFetch } from '#utils/webUi/testkit.js';
import { resetAvailability } from './availability.js';
import { cancelCutout, makeWaiting, retryCutout, startCutouts } from './runtime.js';
import { cutoutJobs } from './state.js';
import { SELFIE, cutoutDoc, madeFor } from './testkit.js';

const NEED = { path: SELFIE, start: 3, end: 10, fps: 30 };
const REASON = 'No model at /data/models/modnet.onnx: npm run install-cutout';
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
let net = { calls: /** @type {any[]} */ ([]), restore: () => {} };
let leave = () => {};
let stop = () => {};

/** Wait until something is true. @param {() => boolean} test */
async function until(test, what = 'the condition') {
  for (let waited = 0; !test(); waited += 5) {
    if (waited > 4000) throw new Error(`Timed out waiting for ${what}`);
    await tick(5);
  }
}
const me = () => clipOf(session.getDoc(), 'me');
const stateOf = () => cutoutState(me(), 30);
const posts = () => net.calls.filter((call) => call.method === 'POST');
const switchOn = () => session.edit((doc) => setCutout(doc, ['me'], true));

/**
 * A server on which `POST /cutout` starts job `j1`.
 * @param {() => Record<string, any>} job - Its state, asked for on every poll
 * @param {Record<string, any>} [more]
 */
function server(job, more = {}) {
  return fakeFetch({
    'GET /api/cutout/status': { available: true, reason: '' },
    'GET /api/jobs': { data: [] },
    'POST /api/cutout': [202, { jobId: 'j1' }],
    'GET /api/jobs/j1': () => ({ id: 'j1', type: 'cutout', progress: 0, log: [], ...job() }),
    'GET /api/jobs/j1/result': madeFor(NEED),
    'DELETE /api/jobs/j1': [204, null],
    ...more,
  });
}

before(() => (leave = fakeBrowser()));
after(() => leave());
beforeEach(async () => {
  session.loadDoc(cutoutDoc());
  clearToasts();
  resetAvailability();
  await store.set(ProjectState, { projectId: 'p1', adaptationId: 'a1' });
});
afterEach(() => {
  stop();
  net.restore();
});

describe('cutouts in the running editor', () => {
  it('makes what a switched-on clip needs and attaches it without an undo step', async () => {
    net = server(() => ({ status: 'complete', progress: 100 }));
    stop = startCutouts({ delay: 5 });
    switchOn();
    await until(() => stateOf() === 'ready', 'the cutout');
    assert.deepEqual(posts()[0].body, { projectId: 'p1', ...NEED });
    assert.equal(me().cutout.made.file, madeFor(NEED).file);
    assert.deepEqual(cutoutJobs.get().byPath, {});
    assert.equal(toastState.get().toasts.at(-1).title, 'Cutout ready');
    session.undo();
    assert.equal(stateOf(), 'off', 'one undo: the switch');
    assert.equal(session.canUndo(), false, 'the finished job was no step of its own');
    session.redo();
    assert.equal(stateOf(), 'ready', 'redo brings the cutout back with the switch');
    await until(() => cutoutJobs.get().byPath[SELFIE] === undefined);
    assert.equal(posts().length, 1, 'and asks for nothing');
  });

  it('waits for a drag to end before it attaches', async () => {
    let status = 'running';
    net = server(() => ({ status, progress: 50 }));
    stop = startCutouts({ delay: 5 });
    switchOn();
    await until(() => cutoutJobs.get().byPath[SELFIE]?.status === 'running');
    session.beginGesture();
    status = 'complete';
    await until(() => net.calls.some((call) => call.path.endsWith('/result')), 'the result');
    await tick(150);
    assert.equal(stateOf(), 'missing', 'a drag works from the document it started with');
    session.endGesture();
    await until(() => stateOf() === 'ready');
  });

  it('shows progress, and a cancel leaves a state that can be retried', async () => {
    let status = 'running';
    net = server(() => ({ status, progress: 25, log: ['frame 52 of 210'] }));
    stop = startCutouts({ delay: 5 });
    switchOn();
    await until(() => cutoutJobs.get().byPath[SELFIE]?.status === 'running', 'progress');
    const { frame, frames, progress } = cutoutJobs.get().byPath[SELFIE];
    assert.deepEqual([frame, frames, progress], [52, 210, 25]);
    cancelCutout(SELFIE);
    await until(() => cutoutJobs.get().byPath[SELFIE]?.status === 'cancelled');
    assert.ok(
      net.calls.some((call) => call.method === 'DELETE'),
      'the job is cancelled',
    );
    status = 'complete';
    await retryCutout(SELFIE);
    await until(() => stateOf() === 'ready');
    assert.equal(posts().length, 2);
  });

  it('keeps a failure, says so, and makes it when asked again', async () => {
    let failing = true;
    net = server(() =>
      failing ? { status: 'error', error: 'The matte program stopped' } : { status: 'complete' },
    );
    stop = startCutouts({ delay: 5 });
    switchOn();
    await until(() => cutoutJobs.get().byPath[SELFIE]?.status === 'error');
    assert.equal(cutoutJobs.get().byPath[SELFIE].message, 'The matte program stopped');
    const toast = toastState.get().toasts.at(-1);
    assert.deepEqual([toast.kind, toast.title], ['error', 'No cutout of selfie.mp4']);
    failing = false;
    await makeWaiting();
    assert.equal(stateOf(), 'ready', 'makeWaiting resolves when the last one has ended');
  });

  it('explains a server without a matte program and breaks nothing', async () => {
    let status = { available: false, reason: REASON };
    net = server(() => ({ status: 'complete', progress: 100 }), {
      'GET /api/cutout/status': () => status,
    });
    stop = startCutouts({ delay: 5 });
    switchOn();
    await until(() => cutoutJobs.get().byPath[SELFIE]?.status === 'unavailable');
    assert.equal(cutoutJobs.get().byPath[SELFIE].message, REASON);
    assert.deepEqual(
      { ...cutoutJobs.get().availability },
      { known: true, available: false, reason: REASON, checking: false },
    );
    assert.equal(posts().length, 0, 'nothing is asked of a server that cannot');
    session.edit((doc) => setCutout(doc, ['me'], { feather: 1 }));
    await tick(40);
    assert.equal(net.calls.filter((call) => call.path.startsWith('/api/cutout/status')).length, 1);
    status = { available: true, reason: '' };
    await retryCutout();
    assert.ok(
      net.calls.some((call) => call.path === '/api/cutout/status?fresh'),
      'asked afresh',
    );
    await until(() => stateOf() === 'ready');
  });

  it('attaches a cutout that a job of somebody else finished', async () => {
    const theirs = { id: 'j9', type: 'cutout', projectId: 'p1', label: 'Cut out: selfie.mp4' };
    let ended = false;
    const { cached: _cached, ...result } = madeFor(NEED);
    net = fakeFetch({
      'GET /api/cutout/status': { available: false, reason: REASON },
      'GET /api/jobs': () => ({
        data: [
          ended
            ? { ...theirs, status: 'complete', updatedAt: 2, result }
            : { ...theirs, status: 'running', updatedAt: 1, result: {} },
        ],
      }),
    });
    jobState.set({ jobs: [] });
    stop = startCutouts({ delay: 5 });
    switchOn();
    await until(() => cutoutJobs.get().byPath[SELFIE]?.status === 'unavailable');
    await refreshJobs();
    ended = true;
    await refreshJobs();
    await until(() => stateOf() === 'ready', 'their cutout');
    await until(() => cutoutJobs.get().byPath[SELFIE] === undefined);
    assert.equal(posts().length, 0);
  });
});
