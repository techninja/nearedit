import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasTranscript } from '#utils/captions/index.js';
import { createWordSource } from './captionWords.js';

/** A sidecar store whose answers the test hands out by hand. */
function fakeIo() {
  /** @type {{ path: string, resolve: Function, reject: Function }[]} */
  const pending = [];
  /** @type {Set<(path: string) => void>} */
  const listeners = new Set();
  return {
    pending,
    clock: 0,
    load: (path) => new Promise((resolve, reject) => pending.push({ path, resolve, reject })),
    watch(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    changed: (path = '') => listeners.forEach((listener) => listener(path)),
    watching: () => listeners.size,
  };
}
const settled = () => new Promise((resolve) => setImmediate(resolve));
const talk = { sourceFile: '/p/talk.mp4' };
const said = (text) => ({ transcript: [{ word: text, start: 0, end: 1 }], segments: [] });

describe('caption word source', () => {
  it('loads a file once, gives nothing meanwhile and tells when the words are there', async () => {
    const io = fakeIo();
    let arrived = 0;
    const source = createWordSource(() => arrived++, io);
    assert.equal(source.state('/p/talk.mp4'), 'unknown');
    assert.equal(source.get(talk), null);
    assert.equal(source.get(talk), null);
    assert.equal(io.pending.length, 1, 'asked once, however many frames ask');
    assert.equal(source.state('/p/talk.mp4'), 'loading');
    const sidecar = said('hello');
    io.pending[0].resolve(sidecar);
    await settled();
    assert.equal(arrived, 1);
    assert.equal(source.get(talk), sidecar, 'the sidecar itself: the same object every frame');
    assert.equal(source.state('/p/talk.mp4'), 'ready');
    assert.equal(source.get({ sourceFile: '' }), null);
    assert.equal(source.get({}), null);
  });

  it('knows a file without a transcript from one that is loading', async () => {
    const io = fakeIo();
    let arrived = 0;
    const source = createWordSource(() => arrived++, io);
    source.get(talk);
    io.pending[0].resolve(null);
    await settled();
    assert.equal(source.state('/p/talk.mp4'), 'none');
    assert.equal(source.get(talk), null);
    assert.equal(arrived, 1, 'an interface may want to say so');
    source.get({ sourceFile: '/p/music.mp3' });
    io.pending[1].resolve({ beats: [1, 2], transcript: [], segments: null });
    await settled();
    assert.equal(source.state('/p/music.mp3'), 'none');
    assert.equal(hasTranscript({ segments: [{ start: 0, end: 1, text: 'hi' }] }), true);
  });

  it('follows a correction without dropping the caption in between', async () => {
    const io = fakeIo();
    let arrived = 0;
    const source = createWordSource(() => arrived++, io);
    source.get(talk);
    const first = said('helo');
    io.pending[0].resolve(first);
    await settled();
    io.changed('/p/other.mp4');
    assert.equal(io.pending.length, 1, 'another file’s change is not ours');
    io.changed('/p/talk.mp4');
    assert.equal(io.pending.length, 2);
    assert.equal(source.get(talk), first, 'the old words stay until the new ones are there');
    const corrected = said('hello');
    io.pending[1].resolve(corrected);
    await settled();
    assert.equal(source.get(talk), corrected);
    assert.equal(arrived, 2);
  });

  it('fetches everything it holds again when every sidecar changed, newest answer wins', async () => {
    const io = fakeIo();
    const source = createWordSource(() => {}, io);
    source.get(talk);
    io.pending[0].resolve(said('one'));
    await settled();
    io.changed();
    io.changed();
    assert.equal(io.pending.length, 3);
    const newest = said('three');
    io.pending[2].resolve(newest);
    io.pending[1].resolve(said('two'));
    await settled();
    assert.equal(source.get(talk), newest, 'a late answer to an older request is dropped');
  });

  it('keeps going when the server cannot be reached, and asks again later', async () => {
    const io = fakeIo();
    io.now = () => io.clock;
    const warn = console.warn;
    const warned = [];
    console.warn = (message) => warned.push(message);
    try {
      const source = createWordSource(() => {}, io);
      source.get(talk);
      io.pending[0].reject(new Error('offline'));
      await settled();
      assert.equal(source.state('/p/talk.mp4'), 'failed');
      assert.match(warned[0], /talk\.mp4: offline/);
      io.clock = 4000;
      assert.equal(source.get(talk), null);
      assert.equal(io.pending.length, 1, 'not on every frame');
      io.clock = 5000;
      source.get(talk);
      assert.equal(io.pending.length, 2);
      const sidecar = said('back');
      io.pending[1].resolve(sidecar);
      await settled();
      assert.equal(source.get(talk), sidecar);
    } finally {
      console.warn = warn;
    }
  });

  it('stops listening when it is destroyed', async () => {
    const io = fakeIo();
    let arrived = 0;
    const source = createWordSource(() => arrived++, io);
    source.get(talk);
    assert.equal(io.watching(), 1);
    source.destroy();
    assert.equal(io.watching(), 0);
    io.pending[0].resolve(said('late'));
    await settled();
    assert.equal(arrived, 0, 'an answer that comes after is ignored');
    assert.equal(source.state('/p/talk.mp4'), 'unknown');
  });
});
