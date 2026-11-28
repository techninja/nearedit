import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TALK, TALK_SIDECAR } from './testkit.js';
import { createWordBook } from './words.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A book over sidecars that can be changed, counting what it loads. */
function setup(sidecars = { [TALK]: TALK_SIDECAR }) {
  const io = { sidecars, loads: [], watchers: [], time: 0, fail: '' };
  const book = createWordBook({
    load: (path) => {
      io.loads.push(path);
      if (io.fail) return Promise.reject(new Error(io.fail));
      return Promise.resolve(io.sidecars[path] ?? null);
    },
    watch: (listener) => {
      io.watchers.push(listener);
      return () => io.watchers.splice(io.watchers.indexOf(listener), 1);
    },
    now: () => io.time,
  });
  let heard = 0;
  book.subscribe(() => heard++);
  return { book, io, heard: () => heard };
}

describe('the word book', () => {
  it('answers at once, loads once, and tells when the words are there', async () => {
    const { book, io, heard } = setup();
    assert.equal(book.get(TALK).state, 'loading');
    assert.equal(book.get(TALK).state, 'loading');
    await settle();
    const known = book.get(TALK);
    assert.equal(known.state, 'ready');
    assert.equal(known.words.length, 8);
    assert.deepEqual(known.words[0], [1, 1.4, 'We']);
    assert.equal(known.sidecar, TALK_SIDECAR);
    assert.deepEqual(io.loads, [TALK]);
    assert.equal(heard(), 1);
    assert.equal(book.revision(), 1);
  });

  it('knows a file without a transcript, and no file at all', async () => {
    const { book } = setup({ '/media/quiet.mp4': { tags: ['room'] }, '/media/empty.wav': null });
    book.get('/media/quiet.mp4');
    await book.ready(['/media/empty.wav', '']);
    assert.equal(book.get('/media/quiet.mp4').state, 'none');
    assert.deepEqual(book.get('/media/quiet.mp4').sidecar, { tags: ['room'] });
    assert.equal(book.get('/media/empty.wav').state, 'none');
    assert.equal(book.get('').state, 'none');
    assert.equal(book.get(undefined).state, 'none');
  });

  it('reads a file again when its sidecar changes; the old words stand meanwhile', async () => {
    const { book, io, heard } = setup({});
    await book.ready([TALK]);
    assert.equal(book.get(TALK).state, 'none');
    // A transcription finished: the cache was dropped for this file.
    io.sidecars[TALK] = TALK_SIDECAR;
    io.watchers[0](TALK);
    assert.equal(book.get(TALK).state, 'none');
    await settle();
    assert.equal(book.get(TALK).state, 'ready');
    // A word was corrected: every known file is read again.
    io.sidecars[TALK] = { transcript: [{ word: 'Hello', start: 0, end: 1 }] };
    io.watchers[0]('');
    assert.equal(book.get(TALK).words.length, 8);
    await settle();
    assert.deepEqual(book.get(TALK).words, [[0, 1, 'Hello']]);
    assert.equal(heard(), 3);
    // A file nobody asked about is not fetched.
    io.watchers[0]('/media/other.mp4');
    assert.equal(io.loads.includes('/media/other.mp4'), false);
  });

  it('asks again later for a file that could not be read', async () => {
    const warn = console.warn;
    console.warn = () => {};
    const { book, io } = setup();
    io.fail = 'offline';
    await book.ready([TALK]);
    assert.equal(book.get(TALK).state, 'failed');
    assert.equal(io.loads.length, 1, 'not on every question');
    io.fail = '';
    io.time = 6000;
    book.get(TALK);
    await settle();
    assert.equal(book.get(TALK).state, 'ready');
    console.warn = warn;
  });

  it('forgets everything when destroyed', async () => {
    const { book, io } = setup();
    await book.ready([TALK]);
    book.destroy();
    assert.equal(io.watchers.length, 0);
    assert.equal(book.get(TALK).state, 'loading');
  });
});
