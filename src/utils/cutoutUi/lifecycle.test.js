import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { attachCutout, cutoutNeeds, cutoutState, setCutout } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import { NOT_ATTACHED } from './flight.js';
import { createLifecycle } from './lifecycle.js';
import { SELFIE, cutoutDoc, fakeServer } from './testkit.js';

/**
 * A lifecycle over a document held here and a server that answers on demand.
 * @param {{ attach?: boolean }} [opts] - `attach: false`: results are not taken
 */
function harness(opts = {}) {
  const state = { doc: cutoutDoc(), busy: false, available: true, reason: '' };
  const server = fakeServer();
  /** @type {Record<string, any>} */
  const notes = {};
  /** @type {any[]} */
  const announced = [];
  const life = createLifecycle({
    needs: () => cutoutNeeds(state.doc),
    busy: () => state.busy,
    make: server.make,
    attach: (made) => {
      if (opts.attach !== false) state.doc = attachCutout(state.doc, made);
    },
    available: async () => ({ available: state.available, reason: state.reason }),
    note: (path, job) => (job ? (notes[path] = job) : delete notes[path]),
    announce: (ended) => announced.push(ended),
    delay: 5,
  });
  /** Change the document as an edit would. @param {(doc: any) => any} op */
  const edit = (op) => {
    state.doc = op(state.doc);
    life.schedule();
  };
  const stateOf = (/** @type {string} */ id) => cutoutState(clipOf(state.doc, id), state.doc.fps);
  return { state, server, notes, announced, life, edit, stateOf };
}

/** Wait until something is true. @param {() => boolean} test */
async function until(test, what = 'the condition') {
  for (let waited = 0; !test(); waited += 2) {
    if (waited > 3000) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}
/** Trim a clip's end in the source. @param {string} id @param {number} sourceOut */
const trimTo = (id, sourceOut) => (/** @type {any} */ doc) => ({
  ...doc,
  tracks: doc.tracks.map((/** @type {any} */ track) => ({
    ...track,
    clips: track.clips.map((/** @type {any} */ clip) => {
      if (clip.clipId !== id) return clip;
      const timelineEnd = clip.timelineStart + (sourceOut - clip.sourceIn);
      return { ...clip, sourceOut, timelineEnd };
    }),
  })),
});
const on =
  (/** @type {string[]} */ ...ids) =>
  (/** @type {any} */ doc) =>
    setCutout(doc, ids, true);
const off =
  (/** @type {string[]} */ ...ids) =>
  (/** @type {any} */ doc) =>
    setCutout(doc, ids, false);

describe('the life of a cutout', () => {
  it('asks for what the clip needs, shows progress and attaches the result', async () => {
    const { server, notes, announced, life, edit, stateOf } = harness();
    edit(on('me'));
    await until(() => server.calls.length === 1, 'the request');
    const [call] = server.calls;
    assert.deepEqual(
      { path: call.need.path, start: call.need.start, end: call.need.end, fps: call.need.fps },
      { path: SELFIE, start: 3, end: 10, fps: 30 },
      'the clip plays 4…9 s: a second of margin each side',
    );
    assert.equal(notes[SELFIE].status, 'starting');
    call.progress({ status: 'running', progress: 40, frame: 84, frames: 210 });
    assert.deepEqual(
      { ...notes[SELFIE] },
      { status: 'running', progress: 40, frame: 84, frames: 210, message: '', start: 3, end: 10 },
    );
    assert.equal(stateOf('me'), 'missing');
    call.finish();
    await until(() => life.idle(), 'the end');
    assert.equal(stateOf('me'), 'ready');
    assert.equal(notes[SELFIE], undefined, 'nothing left to say');
    assert.equal(server.calls.length, 1, 'and nothing more to ask');
    assert.equal(announced.length, 1);
    assert.equal(announced[0].made.cached, false);
  });

  it('takes a cutout the server already has at once', async () => {
    const { server, announced, life, edit, stateOf } = harness();
    edit(on('me'));
    await until(() => server.calls.length === 1);
    server.calls[0].finish({ cached: true });
    await until(() => life.idle());
    assert.equal(stateOf('me'), 'ready');
    assert.equal(announced[0].made.cached, true, 'the caller can tell it cost nothing');
  });

  it('starts no job while the document keeps changing or a drag is under way', async () => {
    const { state, server, life, edit } = harness();
    state.busy = true;
    edit(on('me'));
    for (let length = 6; length <= 15; length++) edit(trimTo('me', 4 + length));
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(server.calls.length, 0, 'a drag asks for nothing');
    state.busy = false;
    await until(() => server.calls.length > 0);
    assert.equal(server.calls.length, 1, 'ten changes, one request');
    assert.equal(server.calls[0].need.end, 20, 'for the clip as it ended up');
    server.calls[0].finish();
    await until(() => life.idle());
  });

  it('keeps a failure as a state with a retry', async () => {
    const { server, notes, announced, life, edit, stateOf } = harness();
    edit(on('me'));
    await until(() => server.calls.length === 1);
    server.calls[0].fail('The matte program stopped');
    await until(() => life.idle());
    assert.equal(notes[SELFIE].status, 'error');
    assert.equal(notes[SELFIE].message, 'The matte program stopped');
    assert.equal(announced[0].error, 'The matte program stopped');
    edit((doc) => ({ ...doc }));
    await until(() => life.idle());
    assert.equal(server.calls.length, 1, 'not asked again by itself');
    life.retry(SELFIE);
    await until(() => server.calls.length === 2, 'the retry');
    assert.equal(notes[SELFIE].status, 'starting');
    server.calls[1].finish();
    await until(() => life.idle());
    assert.equal(stateOf('me'), 'ready');
    assert.equal(notes[SELFIE], undefined);
  });

  it('cancels on request, and makes it after all when asked again', async () => {
    const { server, notes, announced, life, edit, stateOf } = harness();
    edit(on('me'));
    await until(() => server.calls.length === 1);
    life.cancel(SELFIE);
    await until(() => life.idle());
    assert.equal(server.calls[0].signal.aborted, true, 'the job is cancelled on the server');
    assert.equal(notes[SELFIE].status, 'cancelled');
    assert.equal(announced.length, 0, 'nobody is told what they did themselves');
    assert.equal(server.calls.length, 1);
    life.retry();
    await until(() => server.calls.length === 2);
    server.calls[1].finish();
    await until(() => life.idle());
    assert.equal(stateOf('me'), 'ready');
  });

  it('asks again when a trim outgrows the cutout', async () => {
    const { server, notes, life, edit, stateOf } = harness();
    edit(on('me'));
    await until(() => server.calls.length === 1);
    server.calls[0].finish();
    await until(() => life.idle());
    edit(trimTo('me', 9.5));
    await until(() => life.idle());
    assert.equal(server.calls.length, 1, 'inside the margin: nothing to do');
    edit(trimTo('me', 14));
    await until(() => server.calls.length === 2, 'the wider request');
    assert.equal(stateOf('me'), 'stale', 'the part that is made keeps playing');
    assert.equal(server.calls[1].need.end, 15);
    assert.equal(notes[SELFIE].status, 'starting');
    server.calls[1].finish();
    await until(() => life.idle());
    assert.equal(stateOf('me'), 'ready');
  });

  it('replaces a running request that no longer covers the clip, one at a time', async () => {
    const { server, life, edit, stateOf } = harness();
    edit(on('me'));
    await until(() => server.calls.length === 1);
    edit(trimTo('me', 14));
    await until(() => server.calls.length === 2);
    assert.equal(server.calls[0].signal.aborted, true, 'the first job is cancelled');
    assert.equal(server.open().length, 1, 'never two at once for one file');
    assert.equal(server.calls[1].need.end, 15);
    server.calls[1].finish();
    await until(() => life.idle());
    assert.equal(stateOf('me'), 'ready');
  });

  it('makes one cutout for two clips of one file', async () => {
    const { server, life, edit, stateOf } = harness();
    edit(on('me', 'me2', 'photo', 'sound'));
    await until(() => server.calls.length === 1);
    const { need } = server.calls[0];
    assert.deepEqual([need.path, need.start, need.end], [SELFIE, 3, 24]);
    assert.deepEqual(need.clips, ['me', 'me2'], 'a still and sound are not cut out');
    server.calls[0].finish();
    await until(() => life.idle());
    assert.deepEqual([stateOf('me'), stateOf('me2')], ['ready', 'ready']);
    edit(on('other'));
    await until(() => server.calls.length === 2);
    assert.equal(server.calls[1].need.path, '/media/guest.mp4', 'another file, another request');
    server.calls[1].finish();
    await until(() => life.idle());
    assert.equal(server.calls.length, 2);
  });

  it('says what the server is missing and asks for nothing', async () => {
    const { state, server, notes, life, edit, stateOf } = harness();
    Object.assign(state, { available: false, reason: 'No model at /models/modnet.onnx' });
    edit(on('me'));
    await until(() => life.idle() && Boolean(notes[SELFIE]));
    assert.equal(notes[SELFIE].status, 'unavailable');
    assert.equal(notes[SELFIE].message, 'No model at /models/modnet.onnx');
    assert.equal(server.calls.length, 0);
    state.available = true;
    life.retry();
    await until(() => server.calls.length === 1, 'the request once the model is there');
    server.calls[0].finish();
    await until(() => life.idle());
    assert.equal(stateOf('me'), 'ready');
  });

  it('stops a job nobody needs any more', async () => {
    const { server, notes, life, edit } = harness();
    edit(on('me'));
    await until(() => server.calls.length === 1);
    edit(off('me'));
    await until(() => life.idle());
    assert.equal(server.calls[0].signal.aborted, true);
    assert.equal(notes[SELFIE], undefined, 'and says nothing about it');
    assert.equal(server.calls.length, 1);
  });

  it('does not loop when the document does not take a result', async () => {
    const { server, notes, life, edit } = harness({ attach: false });
    edit(on('me'));
    await until(() => server.calls.length === 1);
    server.calls[0].finish();
    await until(() => life.idle());
    assert.equal(notes[SELFIE].status, 'error');
    assert.equal(notes[SELFIE].message, NOT_ATTACHED);
    assert.equal(server.calls.length, 1);
  });

  it('does nothing more once stopped, and leaves the job running', async () => {
    const { server, notes, life, edit, stateOf } = harness();
    edit(on('me'));
    await until(() => server.calls.length === 1);
    life.stop();
    assert.equal(server.calls[0].signal.aborted, false, 'the server carries on');
    server.calls[0].finish();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(stateOf('me'), 'missing', 'nothing is attached behind a closed editor');
    assert.equal(notes[SELFIE].status, 'starting', 'and nothing more is said');
  });
});
