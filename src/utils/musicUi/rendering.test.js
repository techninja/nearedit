import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { duplicateClips } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import { isStaleMusic } from '#utils/music/clip.js';
import { fakeFetch } from '#utils/webUi/testkit.js';
import { changeSong } from './edits.js';
import { attachRendering, failureText, wantedRenderings } from './renderApply.js';
import * as rendering from './rendering.js';
import { setSongField } from './songEdit.js';
import { musicDoc, renderingOf, turn } from './testkit.js';

let clipId = '';
let net;
let stop;
const clip = () => clipOf(session.getDoc(), clipId);
const renders = () => net.calls.filter((call) => call.path === '/api/music/render');
const status = () => rendering.renderStatusOf(clipId);
const tempo = (bpm) => changeSong(clipId, 'bpm', (song) => setSongField(song, 'bpm', bpm));

describe('rendering a song on the server', () => {
  beforeEach(async () => {
    const made = musicDoc();
    clipId = made.clipId;
    session.loadDoc(made.doc);
    rendering.resetRenderings();
    await store.set(ProjectState, { projectId: 'p1' });
    net = fakeFetch({ 'POST /api/music/render': (body) => renderingOf(body.song) });
    stop = () => {};
  });
  afterEach(() => {
    stop();
    net.restore();
  });

  it('attaches the rendering of a new clip without an undo step', async () => {
    assert.equal(isStaleMusic(clip()), true);
    rendering.syncRenderings();
    assert.deepEqual([status().status, status().message], ['rendering', '']);
    await turn();
    assert.deepEqual(renders()[0].body, { projectId: 'p1', song: clip().music.song });
    assert.equal(isStaleMusic(clip()), false);
    assert.equal(clip().sourceFile, renderingOf(clip().music.song).file);
    assert.equal(clip().placeholder, false);
    assert.equal(status(), null);
    assert.equal(session.canUndo(), false, 'a rendering is not an edit');
    rendering.syncRenderings();
    await turn();
    assert.equal(renders().length, 1, 'nothing is asked for twice');
  });

  it('lets the latest song win: a request nobody waits for is cancelled', async () => {
    let release;
    const signals = [];
    net.restore();
    net = fakeFetch({
      'POST /api/music/render': async (body, _url, init) => {
        signals.push(init.signal);
        if (signals.length === 1) await new Promise((resolve) => (release = resolve));
        return renderingOf(body.song);
      },
    });
    rendering.syncRenderings();
    await turn();
    tempo(90);
    rendering.syncRenderings();
    assert.equal(signals[0].aborted, true, 'the first request was cancelled');
    release();
    await turn();
    assert.equal(renders().length, 2);
    assert.equal(clip().music.song.bpm, 90);
    assert.equal(isStaleMusic(clip()), false, 'the second rendering is attached');
    assert.equal(clip().sourceFile, renderingOf(clip().music.song).file);
  });

  it('keeps redo, and undo and redo walk through the edits only', async () => {
    rendering.syncRenderings();
    await turn();
    tempo(90);
    tempo(100);
    rendering.syncRenderings();
    await turn();
    session.undo();
    assert.equal(clip().music.song.bpm, 90);
    assert.equal(isStaleMusic(clip()), true, 'this song was never rendered');
    rendering.syncRenderings();
    await turn();
    assert.equal(isStaleMusic(clip()), false);
    assert.equal(session.canRedo(), true, 'attaching did not clear redo');
    session.redo();
    assert.deepEqual([clip().music.song.bpm, isStaleMusic(clip())], [100, false]);
    session.undo();
    session.undo();
    assert.deepEqual([clip().music.song.bpm, isStaleMusic(clip())], [120, false]);
    assert.equal(session.canUndo(), false);
  });

  it('keeps a failure with the sentence of the server until the song changes', async () => {
    const fields = { 'parts[0].kit': 'is not a kit', bpm: 'is too fast' };
    net.restore();
    net = fakeFetch({
      'POST /api/music/render': (body) =>
        body.song.bpm === 120
          ? [422, { error: 'The song cannot be rendered', fields }]
          : renderingOf(body.song),
    });
    rendering.syncRenderings();
    await turn();
    assert.equal(status().status, 'failed');
    assert.equal(status().message, 'The song cannot be rendered (parts[0].kit: is not a kit)');
    rendering.syncRenderings();
    await turn();
    assert.equal(renders().length, 1, 'not tried again by itself');
    rendering.retryRendering(clipId);
    await turn();
    assert.equal(renders().length, 2, 'tried again when asked');
    tempo(96);
    rendering.syncRenderings();
    await turn();
    assert.equal(status(), null);
    assert.equal(isStaleMusic(clip()), false);
  });

  it('says so when the server cannot be reached or answers for another key', async () => {
    assert.match(failureText(new TypeError('fetch failed')), /could not be reached/);
    net.restore();
    net = fakeFetch({
      'POST /api/music/render': (body) => ({ ...renderingOf(body.song), key: 'f'.repeat(20) }),
    });
    rendering.syncRenderings();
    await turn();
    assert.match(status().message, /reload the page/);
    assert.equal(isStaleMusic(clip()), true);
  });

  it('asks once for two clips with one song and attaches to both', async () => {
    session.edit((doc) => duplicateClips(doc, [clipId]));
    const wanted = wantedRenderings(session.getDoc());
    assert.equal(wanted.size, 1);
    assert.equal([...wanted.values()][0].clipIds.length, 2);
    rendering.syncRenderings();
    await turn();
    assert.equal(renders().length, 1);
    assert.equal(wantedRenderings(session.getDoc()).size, 0);
  });

  it('leaves a clip on a locked track alone', async () => {
    const locked = session.getDoc();
    session.loadDoc({
      ...locked,
      tracks: locked.tracks.map((track) => ({ ...track, locked: true })),
    });
    rendering.syncRenderings();
    await turn();
    assert.equal(renders().length, 0);
    const answer = renderingOf(clip().music.song);
    assert.equal(attachRendering(session.getDoc(), answer), session.getDoc());
  });

  it('watches the document: a change is rendered a little later, a load at once', async () => {
    stop = rendering.watchMusicRendering();
    await new Promise((resolve) => setTimeout(resolve, rendering.RENDER_DELAY + 40));
    assert.equal(renders().length, 1, 'the clip that was stale when the project opened');
    tempo(90);
    tempo(91);
    assert.equal(status().status, 'rendering', 'marked at once');
    await new Promise((resolve) => setTimeout(resolve, rendering.RENDER_DELAY + 40));
    assert.equal(renders().length, 2, 'two quick edits, one request');
    assert.equal(renders()[1].body.song.bpm, 91);
    assert.equal(isStaleMusic(clip()), false);
  });
});
