import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import ViewState from '#store/ViewState.js';
import { clipOf } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import { getSelection } from '#utils/editor/view.js';
import { recipeKey } from '#utils/web/index.js';
import { addWebClip } from './addClip.js';
import { recentAddresses } from './address.js';
import { captureState, loadCaptureStatus, resetCaptureStatus } from './captureStatus.js';
import * as editor from './editorState.js';
import { addStep, editStep, retimeBlock, setField } from './edits.js';
import { resetSnapshots, showSnapshot, snapshotState } from './snapshot.js';
import { fakeFetch, testSnapshot, webDoc } from './testkit.js';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const kinds = (clipId) => clipOf(session.getDoc(), clipId).web.recipe.steps.map((step) => step.do);
let net = { calls: [], restore: () => {} };

/** Open a document with one web clip in the session. */
async function open(steps = []) {
  const { doc, clipId } = webDoc(steps);
  session.loadDoc(doc);
  await store.set(ViewState, { selection: [], cursorPosition: 0, autoCrossfade: true });
  await store.set(ProjectState, { projectId: 'p1' });
  return clipId;
}

afterEach(() => net.restore());

describe('capture status', () => {
  beforeEach(resetCaptureStatus);

  it('asks once and remembers; asks again when told to', async () => {
    net = fakeFetch({
      'GET /api/web/status': { available: true, browser: { version: 'Chrome/158' }, reason: '' },
    });
    const [a, b] = await Promise.all([loadCaptureStatus(), loadCaptureStatus()]);
    assert.equal(a, b);
    assert.equal(captureState.get().available, true);
    assert.equal(captureState.get().version, 'Chrome/158');
    await loadCaptureStatus();
    assert.equal(net.calls.length, 1);
    await loadCaptureStatus({ fresh: true });
    assert.equal(net.calls[1].path, '/api/web/status?fresh=1');
  });

  it('passes on the server’s reason, and says so when the question fails', async () => {
    const reason = 'No chrome-headless-shell was found. Run "npm run install-browser".';
    net = fakeFetch({ 'GET /api/web/status': { available: false, reason } });
    assert.deepEqual(await loadCaptureStatus(), {
      ...{ status: 'ready', available: false, reason },
      ...{ version: '', allow: [] },
    });
    net.restore();
    net = fakeFetch({ 'GET /api/web/status': [500, { error: 'boom' }] });
    const failed = await loadCaptureStatus({ fresh: true });
    assert.equal(failed.status, 'failed');
    assert.match(failed.reason, /could not say.*boom/);
  });
});

describe('web editor state and edits', () => {
  it('opens on the end of the steps, for web clips only', async () => {
    const clipId = await open([{ do: 'wait' }, { do: 'wait' }]);
    assert.equal(editor.openWebEditor('nope'), false);
    assert.equal(editor.openWebEditor(clipId), true);
    assert.deepEqual(
      { ...editor.webEditorState.get() },
      { clipId, selected: 2, tab: 'page', mode: 'page', picking: '', menu: null },
    );
    editor.selectStep(-4);
    assert.equal(editor.webEditorState.get().selected, 0);
    editor.selectStep(99);
    assert.equal(editor.webEditorState.get().selected, 2);
    assert.equal(editor.shownSelection({ selected: 5 }, { steps: [1] }), 1);
    editor.closeWebEditor();
    assert.equal(editor.webEditorState.get().clipId, '');
  });

  it('adds a step at the end and stays there, or after the selected step and goes to it', async () => {
    const clipId = await open([{ do: 'wait' }]);
    editor.openWebEditor(clipId);
    assert.equal(addStep(clipId, { do: 'click', target: '#a' }), 1);
    assert.deepEqual(kinds(clipId), ['wait', 'click']);
    assert.equal(editor.webEditorState.get().selected, 2);
    editor.selectStep(0);
    assert.equal(addStep(clipId, { do: 'hover', target: '#b' }), 1);
    assert.deepEqual(kinds(clipId), ['wait', 'hover', 'click']);
    assert.equal(editor.webEditorState.get().selected, 1);
    assert.equal(addStep('nope', { do: 'wait' }), -1);
  });

  it('removes, copies and moves steps as single undo steps, selection following', async () => {
    const clipId = await open([
      { do: 'wait' },
      { do: 'click', target: '#a' },
      { do: 'run', js: '1' },
    ]);
    editor.openWebEditor(clipId);
    editor.selectStep(1);
    assert.equal(editStep(clipId, 'move', 1, 0), true);
    assert.deepEqual(kinds(clipId), ['click', 'wait', 'run']);
    assert.equal(editor.webEditorState.get().selected, 0);
    editStep(clipId, 'duplicate', 0);
    assert.deepEqual(kinds(clipId), ['click', 'click', 'wait', 'run']);
    assert.equal(editor.webEditorState.get().selected, 1);
    editStep(clipId, 'remove', 0);
    assert.equal(editor.webEditorState.get().selected, 0);
    assert.equal(editStep(clipId, 'move', 0, 0), false);
    session.undo();
    session.undo();
    session.undo();
    assert.deepEqual(kinds(clipId), ['wait', 'click', 'run']);
  });

  it('sets a field and retimes a block; the clip’s length follows the score', async () => {
    const clipId = await open([{ do: 'click', target: '#a' }]);
    const before = clipOf(session.getDoc(), clipId).timelineEnd;
    assert.equal(setField(clipId, 'steps.0.target', 'text=Go'), true);
    assert.equal(setField(clipId, 'steps.0.target', 'text=Go'), false);
    assert.equal(retimeBlock(clipId, { part: 'hold', index: 0 }, 48), true);
    const clip = clipOf(session.getDoc(), clipId);
    assert.equal(clip.web.recipe.steps[0].hold, 1.6);
    assert.equal(Math.round((clip.timelineEnd - before) * 30), 30);
    session.undo();
    assert.equal(clipOf(session.getDoc(), clipId).timelineEnd, before);
  });

  it('adds a web clip at the cursor, selects it, opens it and remembers the address', async () => {
    const memory = new Map();
    globalThis.localStorage = /** @type {any} */ ({
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
    });
    await open();
    await store.set(ViewState, { cursorPosition: 12 });
    assert.match(addWebClip('nonsense here', 'desktop').message, /not a web address/);
    const { clipId, url } = addWebClip('example.org/pricing', 'phone');
    await tick();
    const clip = clipOf(session.getDoc(), clipId);
    assert.equal(url, 'https://example.org/pricing');
    assert.equal(clip.timelineStart, 12);
    assert.deepEqual(clip.web.recipe.viewport, { width: 390, height: 844 });
    assert.deepEqual(getSelection(), [clipId]);
    assert.equal(editor.webEditorState.get().clipId, clipId);
    assert.deepEqual(recentAddresses('p1'), [url]);
    session.undo();
    assert.equal(clipOf(session.getDoc(), clipId), undefined);
    delete globalThis.localStorage;
  });
});

describe('snapshots', () => {
  beforeEach(resetSnapshots);
  const steps = [{ do: 'click', target: '#a' }, { do: 'wait' }];

  it('plays only the steps before the selected one, once per page', async () => {
    const clipId = await open(steps);
    const { recipe } = clipOf(session.getDoc(), clipId).web;
    net = fakeFetch({ 'POST /api/web/snapshot': () => testSnapshot() });
    showSnapshot(recipe, 1, { delay: 0 });
    assert.equal(snapshotState.get().busy, true);
    showSnapshot(recipe, 1, { delay: 0 });
    await tick(10);
    assert.equal(net.calls.length, 1);
    assert.equal(net.calls[0].body.until, 1);
    assert.equal(net.calls[0].body.projectId, 'p1');
    assert.deepEqual(
      net.calls[0].body.recipe.steps.map((step) => step.do),
      ['click'],
    );
    assert.equal(snapshotState.get().busy, false);
    assert.equal(snapshotState.get().snapshot.title, 'Example');
    assert.equal(
      snapshotState.get().key,
      recipeKey({ ...recipe, steps: recipe.steps.slice(0, 1) }, 30),
    );
    // A step after the played ones changes nothing; going back is remembered.
    showSnapshot({ ...recipe, steps: [recipe.steps[0], { do: 'wait', duration: 9 }] }, 1, {
      delay: 0,
    });
    showSnapshot(recipe, 0, { delay: 0 });
    await tick(10);
    showSnapshot(recipe, 1, { delay: 0 });
    assert.equal(net.calls.length, 2);
    assert.equal(snapshotState.get().busy, false);
    showSnapshot(recipe, 1, { delay: 0, fresh: true });
    await tick(10);
    assert.equal(net.calls.length, 3);
  });

  it('lets a newer request replace one that is waiting, and reports failures in words', async () => {
    const clipId = await open(steps);
    const { recipe } = clipOf(session.getDoc(), clipId).web;
    net = fakeFetch({
      'POST /api/web/snapshot': (body) =>
        body.until === 2 ? [503, { error: 'No browser', detail: 'Install one' }] : testSnapshot(),
    });
    showSnapshot(recipe, 0, { delay: 5 });
    showSnapshot(recipe, 2, { delay: 0 });
    await tick(20);
    assert.deepEqual(
      net.calls.map((call) => call.body.until),
      [2],
    );
    assert.equal(snapshotState.get().error, 'No browser — Install one');
    assert.equal(snapshotState.get().busy, false);
  });

  it('does not ask for a page whose played steps cannot play', async () => {
    const clipId = await open([{ do: 'click' }, { do: 'wait' }]);
    const { recipe } = clipOf(session.getDoc(), clipId).web;
    net = fakeFetch({ 'POST /api/web/snapshot': () => testSnapshot() });
    showSnapshot(recipe, 2, { delay: 0 });
    await tick(10);
    assert.equal(net.calls.length, 0);
    assert.match(snapshotState.get().error, /^Step 1: click needs a target/);
    showSnapshot(recipe, 0, { delay: 0 });
    await tick(10);
    assert.equal(net.calls.length, 1);
    assert.equal(snapshotState.get().error, '');
  });
});
