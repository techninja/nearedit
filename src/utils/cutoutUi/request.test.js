import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fakeBrowser, fakeFetch } from '#utils/webUi/testkit.js';
import { followed, jobProgress, requestCutout, serverStatus } from './request.js';
import { SELFIE, madeFor } from './testkit.js';

const NEED = { path: SELFIE, start: 3, end: 10, fps: 30 };
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
let net = { calls: /** @type {any[]} */ ([]), restore: () => {} };
let leave = () => {};

/**
 * A server with no job under way on which `POST /cutout` starts job `j1`.
 * @param {() => Record<string, any>} job - Its state, asked for on every poll
 * @param {Record<string, any>} [more] - Other routes
 */
function server(job, more = {}) {
  return fakeFetch({
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
afterEach(() => net.restore());

describe('what a job update says', () => {
  it('reads the frame count from the log, and tells waiting from working', () => {
    const log = ['frame 12 of 210', 'frame 84 of 210'];
    assert.deepEqual(jobProgress({ status: 'running', progress: 39.6, log }), {
      ...{ status: 'running', progress: 40, frame: 84, frames: 210 },
    });
    assert.deepEqual(jobProgress({ status: 'queued', progress: 0, log: [] }), {
      ...{ status: 'queued', progress: 0, frame: 0, frames: 0 },
    });
    assert.equal(jobProgress({ status: 'running', log: ['Cut out /p/a.mp4'] }).frames, 0);
  });
});

describe('asking the server for a cutout', () => {
  it('posts the stretch of the file and resolves to the job result', async () => {
    net = server(() => ({ status: 'complete', progress: 100 }));
    const made = await requestCutout('p1', NEED);
    assert.equal(made.source, SELFIE);
    assert.deepEqual([made.start, made.end, made.frames], [3, 10, 210]);
    const post = net.calls.find((call) => call.method === 'POST');
    assert.equal(post.path, '/api/cutout');
    assert.deepEqual(post.body, { projectId: 'p1', path: SELFIE, start: 3, end: 10, fps: 30 });
    assert.equal(followed.has('j1'), true, 'the job is known as our own');
  });

  it('reports progress while the job runs and cancels it on the server', async () => {
    net = server(() => ({ status: 'running', progress: 25, log: ['frame 52 of 210'] }));
    const seen = [];
    const controller = new AbortController();
    const asking = requestCutout('p1', NEED, {
      signal: controller.signal,
      onProgress: (patch) => seen.push(patch),
    });
    await tick(30);
    assert.deepEqual(seen.at(-1), { status: 'running', progress: 25, frame: 52, frames: 210 });
    controller.abort();
    await assert.rejects(asking, /Cancelled/);
    await tick(10);
    assert.ok(net.calls.some((call) => call.method === 'DELETE' && call.path === '/api/jobs/j1'));
  });

  it('rejects with the reason when the job fails', async () => {
    net = server(() => ({ status: 'error', error: 'The matte program stopped' }));
    await assert.rejects(requestCutout('p1', NEED), /The matte program stopped/);
  });

  it('rejects with the server’s words when it has no matte program', async () => {
    const reason = 'No model at /data/models/modnet.onnx: npm run install-cutout';
    net = fakeFetch({
      'GET /api/jobs': { data: [] },
      'POST /api/cutout': [503, { error: reason }],
    });
    await assert.rejects(requestCutout('p1', NEED), new RegExp(reason));
  });

  it('follows a job for the file that is already under way instead of asking twice', async () => {
    const running = {
      ...{ id: 'old', type: 'cutout', status: 'running', label: 'Cut out: selfie.mp4' },
      ...{ projectId: 'p1', progress: 60, log: ['frame 126 of 210'] },
    };
    net = fakeFetch({
      'GET /api/jobs': { data: [running, { ...running, id: 'x', label: 'Cut out: other.mp4' }] },
      'GET /api/jobs/old': { ...running, status: 'complete', progress: 100 },
      'GET /api/jobs/old/result': madeFor(NEED, { cached: false }),
    });
    const made = await requestCutout('p1', NEED);
    assert.equal(made.source, SELFIE);
    assert.equal(
      net.calls.filter((call) => call.method === 'POST').length,
      0,
      'nothing was posted',
    );
    assert.equal(followed.has('old'), true);
  });

  it('does not mistake a job it started itself for one to follow', async () => {
    const own = { id: 'j1', type: 'cutout', status: 'running', label: 'Cut out: selfie.mp4' };
    net = server(() => ({ status: 'complete', progress: 100 }), {
      'GET /api/jobs': { data: [own] },
    });
    followed.add('j1');
    await requestCutout('p1', NEED);
    assert.equal(net.calls.filter((call) => call.method === 'POST').length, 1);
  });

  it('asks for its own when the job under way was for a shorter stretch', async () => {
    const running = {
      id: 'short',
      type: 'cutout',
      status: 'running',
      label: 'Cut out: selfie.mp4',
    };
    net = server(() => ({ status: 'complete', progress: 100 }), {
      'GET /api/jobs': { data: [running] },
      'GET /api/jobs/short': { ...running, status: 'complete', progress: 100 },
      'GET /api/jobs/short/result': madeFor({ ...NEED, end: 6 }),
    });
    const made = await requestCutout('p1', NEED);
    assert.equal(made.end, 10);
    assert.equal(net.calls.filter((call) => call.method === 'POST').length, 1);
    assert.ok(
      net.calls.some((call) => call.path === '/api/jobs/short/result'),
      'it waited for the other job first',
    );
  });
});

describe('asking whether the server can make cutouts', () => {
  it('passes on what is missing, and asks afresh on request', async () => {
    const reason = 'No model at /data/models/modnet.onnx: npm run install-cutout';
    net = fakeFetch({
      'GET /api/cutout/status': { available: false, provider: 'builtin', reason },
    });
    assert.deepEqual(await serverStatus(), { available: false, reason });
    assert.equal(net.calls[0].path, '/api/cutout/status');
    await serverStatus(true);
    assert.equal(net.calls[1].path, '/api/cutout/status?fresh');
    net.restore();
    net = fakeFetch({ 'GET /api/cutout/status': { available: true, reason: '' } });
    assert.deepEqual(await serverStatus(), { available: true, reason: '' });
  });
});
