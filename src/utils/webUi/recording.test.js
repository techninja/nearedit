import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import ViewState from '#store/ViewState.js';
import { clipOf } from '#utils/edl/testkit.js';
import { updateWebRecipe } from '#utils/edl/webClip.js';
import * as session from '#utils/editor/session.js';
import { trackOf as testTrack } from '#utils/web/testkit.js';
import { recipeKey } from '#utils/web/index.js';
import * as recording from './recording.js';
import { fakeBrowser, fakeFetch, webDoc } from './testkit.js';
import * as zoom from './zoom.js';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const STEPS = [{ do: 'click', target: 'text=Go' }];
let net = { calls: [], restore: () => {} };
let leave = () => {};
let clipId = '';

const clip = () => clipOf(session.getDoc(), clipId);
const keyNow = () => recipeKey(clip().web.recipe, 30);
/** The result of a job that recorded the clip as it is now. */
function resultNow() {
  const key = keyNow();
  const rect = { x: 600, y: 300, width: 120, height: 40 };
  const track = testTrack([{ do: 'click', rect, target: 'text=Go' }], { key });
  return { file: `/p/.nearedit/web/${key}.mp4`, key, duration: 2.9, title: 'Example', track };
}
/** A server on which job `j1` is in a given state. */
function server(job, result = resultNow()) {
  return fakeFetch({
    'POST /api/web/record': [202, { jobId: 'j1' }],
    'GET /api/jobs/j1': () => ({ id: 'j1', type: 'web', progress: 0, ...job() }),
    'GET /api/jobs/j1/result': result,
    'DELETE /api/jobs/j1': [204, null],
    'GET /api/web/track': result.track,
  });
}

before(() => (leave = fakeBrowser()));
after(() => leave());
beforeEach(async () => {
  const made = webDoc(STEPS);
  clipId = made.clipId;
  session.loadDoc(made.doc);
  await store.set(ViewState, { selection: [], autoCrossfade: true });
  await store.set(ProjectState, { projectId: 'p1' });
  recording.recordingState.set({ byClip: {} });
});
afterEach(() => net.restore());

describe('recording a clip', () => {
  it('starts the job with the recipe and the frame rate, and attaches the result', async () => {
    net = server(() => ({ status: 'complete', progress: 100 }));
    const ended = await recording.recordClip(clipId);
    const { key, ...rest } = ended;
    assert.deepEqual(rest, { status: 'done', progress: 100, message: '', warnings: [] });
    assert.equal(key, keyNow());
    const [start] = net.calls;
    assert.equal(start.path, '/api/web/record');
    assert.equal(start.body.projectId, 'p1');
    assert.equal(start.body.fps, 30);
    assert.deepEqual(
      start.body.recipe.steps.map((step) => step.do),
      ['click'],
    );
    assert.equal(clip().web.key, keyNow());
    assert.match(clip().sourceFile, /\.mp4$/);
    session.undo();
    assert.equal(clip().web.key, '');
    session.redo();
    assert.equal(clip().web.title, 'Example');
  });

  it('shows progress while the browser records, and can be cancelled', async () => {
    net = server(() => ({ status: 'running', progress: 42 }));
    const ending = recording.recordClip(clipId);
    await tick(20);
    const { status, progress, message } = recording.recordingOf(clipId);
    assert.deepEqual([status, progress, message], ['running', 42, '']);
    assert.equal(await recording.recordClip(clipId), recording.recordingOf(clipId));
    assert.equal(net.calls.filter((call) => call.method === 'POST').length, 1);
    recording.cancelRecording(clipId);
    assert.equal((await ending).status, 'cancelled');
    assert.ok(net.calls.some((call) => call.method === 'DELETE' && call.path === '/api/jobs/j1'));
    assert.equal(clip().web.key, '');
  });

  it('does not attach a recording of steps that changed meanwhile', async () => {
    const stale = resultNow();
    let state = 'running';
    net = server(() => ({ status: state, progress: 50 }), stale);
    const ending = recording.recordClip(clipId);
    await tick(10);
    session.edit((doc) =>
      updateWebRecipe(doc, clipId, (recipe) => ({
        ...recipe,
        steps: [...recipe.steps, { do: 'wait' }],
      })),
    );
    state = 'complete';
    // The poll that sees the job complete is seconds away; a socket message would bring it sooner.
    const ended = await Promise.race([ending, tick(3600).then(() => null)]);
    assert.equal(ended.status, 'error');
    assert.match(ended.message, /steps changed while it was being recorded/);
    assert.equal(clip().web.key, '');
    assert.equal(clip().sourceFile, '');
  });

  it('reports what the server says when it refuses or the job fails', async () => {
    net = fakeFetch({
      'POST /api/web/record': [503, { error: 'No chrome-headless-shell was found' }],
    });
    assert.match((await recording.recordClip(clipId)).message, /No chrome-headless-shell/);
    net.restore();
    net = server(() => ({ status: 'error', error: 'Step 1: nothing shows the text "Go"' }));
    const failed = await recording.recordClip(clipId);
    assert.deepEqual(
      [failed.status, failed.message],
      ['error', 'Step 1: nothing shows the text "Go"'],
    );
    net.restore();
    net = fakeFetch({});
    session.edit((doc) =>
      updateWebRecipe(doc, clipId, (r) => ({ ...r, steps: [{ do: 'click' }] })),
    );
    assert.match((await recording.recordClip(clipId)).message, /^Step 1: click needs a target/);
    assert.equal(net.calls.length, 0);
  });

  it('keeps what the recorder had to say about a recording that was made', async () => {
    const result = resultNow();
    const skipped = 'Step 1 (click): text=Go is covered by <div#chat.bubble> "Talk to us"';
    result.track = { ...result.track, warnings: [skipped] };
    net = server(() => ({ status: 'complete', progress: 100 }), result);
    const ended = await recording.recordClip(clipId);
    assert.equal(ended.status, 'done');
    assert.deepEqual(ended.warnings, [skipped]);
    // The next recording starts with nothing said.
    session.undo();
    net.restore();
    net = server(() => ({ status: 'complete', progress: 100 }));
    assert.deepEqual((await recording.recordClip(clipId)).warnings, []);
  });

  it('records every clip that needs it, and attaches recordings other jobs finish', async () => {
    net = server(() => ({ status: 'complete', progress: 100 }));
    assert.deepEqual(await recording.recordAllStale(), { recorded: 1, failed: 0 });
    assert.deepEqual(await recording.recordAllStale(), { recorded: 0, failed: 0 });
    session.undo();
    const { file, key } = resultNow();
    recording.attachWhenIdle({ file, key, duration: 2.9 });
    assert.equal(clip().web.key, key);
  });
});

describe('zoom', () => {
  it('needs a recording', async () => {
    net = fakeFetch({});
    assert.match(await zoom.applyZoom(clipId), /Record the clip first/);
    assert.equal(net.calls.length, 0);
    assert.equal(zoom.hasZoom(clip()), false);
  });

  it('writes keyframes from the recording’s track and removes them again', async () => {
    net = server(() => ({ status: 'complete', progress: 100 }));
    await recording.recordClip(clipId);
    const asked = () => net.calls.filter((call) => call.path.startsWith('/api/web/track')).length;
    assert.equal(await zoom.applyZoom(clipId), '');
    assert.equal(asked(), 0); // the job's result brought the track
    assert.equal(zoom.hasZoom(clip()), true);
    const scale = () => Math.max(...clip().keyframes['transform.scaleX'].map((key) => key.v));
    assert.equal(scale(), 2.2);
    assert.equal(await zoom.setZoomOption('maxZoom', 1.5, clipId), '');
    assert.equal(scale(), 1.5);
    assert.deepEqual(zoom.zoomOptions.get(), { margin: 0.35, maxZoom: 1.5 });
    assert.equal(zoom.removeZoom(clipId), true);
    assert.equal(zoom.hasZoom(clip()), false);
    await zoom.setZoomOption('maxZoom', 99);
    assert.equal(zoom.zoomOptions.get().maxZoom, 8);
    assert.equal(zoom.hasZoom(clip()), false);
    await zoom.setZoomOption('maxZoom', 2.2);
  });

  it('fetches the track of a recording it has not seen, and says when there is none', async () => {
    const result = { ...resultNow(), key: 'ab'.repeat(10) };
    result.track = { ...result.track, key: result.key };
    session.edit((doc) => {
      const next = structuredClone(doc);
      Object.assign(clipOf(next, clipId), { sourceFile: result.file, placeholder: false });
      clipOf(next, clipId).web.key = result.key;
      return next;
    });
    net = fakeFetch({ 'GET /api/web/track': result.track });
    assert.equal(await zoom.applyZoom(clipId), '');
    assert.equal(net.calls[0].path, `/api/web/track?projectId=p1&key=${result.key}`);
    net.restore();
    net = fakeFetch({});
    session.edit((doc) => {
      const next = structuredClone(doc);
      clipOf(next, clipId).web.key = 'cd'.repeat(10);
      return next;
    });
    assert.match(await zoom.applyZoom(clipId), /No fake for GET \/api\/web\/track/);
  });
});
