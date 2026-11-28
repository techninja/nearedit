/**
 * The music routes, through mounted routers: `POST /music/render` answers
 * with the rendering when it exists, shares and cancels renders with the
 * requests that asked for them, and refuses what is not a song;
 * `POST /music/import` reads a MIDI file of the project.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeWav, renderSong, songKey, songToMidi } from '../../src/utils/music/index.js';
import { END, file as midiFile, track as midiTrack } from '../../src/utils/music/midi/testkit.js';
import { MIDI_TIMEOUT_MS, activeMusicRenders, importMidi } from '../../src/api/music/index.js';
import { readMusic } from '../../src/api/music/index.js';
import { musicRouter } from '../../src/api/music.js';
import * as kit from './serverKit.js';

const { KICK_HAT, heavy, sleep, watched } = kit;

describe('music routes', () => {
  let box;
  let api;
  const post = (path, body) => kit.call(api.url, 'POST', `/api/music/${path}`, body);
  /** A request that can be hung up on. */
  const dial = (song) => {
    const line = new AbortController();
    const answer = fetch(`${api.url}/api/music/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'p1', song }),
      signal: line.signal,
    });
    return { answer, hangUp: () => line.abort() };
  };
  const rendering = async () => {
    for (let i = 0; i < 2000 && !activeMusicRenders(); i++) await sleep(2);
    await sleep(50);
  };

  before(async () => {
    box = kit.musicSandbox('music-routes');
    api = await kit.serve(musicRouter);
  });
  after(async () => {
    await api.close();
    assert.ok(await kit.idle(), 'no worker thread outlives the tests');
    assert.deepEqual(kit.debris(box.project), []);
    box.cleanup();
  });

  it('renders a song into its project and answers when the file exists', async () => {
    const started = performance.now();
    const made = await post('render', { projectId: 'p1', song: KICK_HAT });
    const key = songKey(KICK_HAT);
    assert.equal(made.status, 200, made.text);
    assert.deepEqual(made.body, {
      file: join(box.music, `${key}.wav`),
      key,
      duration: 5,
      cached: false,
    });
    assert.ok(performance.now() - started < 2000, 'a typical song: well under two seconds');
    assert.ok(readFileSync(made.body.file).equals(Buffer.from(encodeWav(renderSong(KICK_HAT)))));
    const again = await post('render', { projectId: 'p1', song: KICK_HAT });
    assert.deepEqual(again.body, { ...made.body, cached: true });
  });

  it('renders once for requests that ask for one song at the same moment', async () => {
    const song = { ...KICK_HAT, bpm: 100 };
    const body = { projectId: 'p1', song };
    const { result, most } = await watched(() =>
      Promise.all([post('render', body), post('render', body), post('render', body)]),
    );
    assert.equal(most, 1);
    assert.deepEqual(
      result.map((answer) => [answer.status, answer.body.key, answer.body.cached]),
      Array(3).fill([200, songKey(song), false]),
    );
  });

  it('says what is wrong with a request before anything is rendered', async () => {
    const song = {
      bpm: 900,
      parts: [
        { kind: 'drums', kit: '707', lanes: { kick: 'X..Q' } },
        { kind: 'synth', notes: [[0, 1, 'H9']] },
      ],
    };
    const bad = await post('render', { projectId: 'p1', song });
    assert.equal(bad.status, 422);
    assert.equal(bad.body.error, 'The song cannot be rendered');
    assert.deepEqual(Object.keys(bad.body.fields), [
      'bpm',
      'parts[0].kit',
      'parts[0].lanes.kick',
      'parts[1].notes[0]',
    ]);
    assert.match(bad.body.fields.bpm, /900 must be a number 40\.\.240/);
    assert.match(bad.body.fields['parts[0].kit'], /"707" is not a kit: use one of 808, 909/);
    const none = await post('render', { projectId: 'p1' });
    assert.deepEqual([none.status, Object.keys(none.body.fields)], [422, ['song']]);
    assert.match(none.body.fields.song, /a song is an object like/);
    assert.equal((await post('render', { projectId: 'p1', song: [1, 2] })).status, 422);
    assert.deepEqual(
      [(await post('render', { song: {} })).body, (await post('render', { song: {} })).status],
      [{ error: 'projectId required' }, 400],
    );
    const unknown = await post('render', { projectId: 'nope', song: {} });
    assert.deepEqual([unknown.status, unknown.body], [404, { error: 'Project not found' }]);
    assert.equal((await post('render', { projectId: 7, song: {} })).status, 404);
    assert.equal(existsSync(join(box.music, `${songKey(song)}.wav`)), false);
  });

  it('stops the render of a client that went away', async () => {
    const song = heavy(8, 101);
    const call = dial(song);
    await rendering();
    assert.equal(activeMusicRenders(), 1);
    call.hangUp();
    await assert.rejects(call.answer, { name: 'AbortError' });
    assert.ok(await kit.idle(2000), 'the worker thread was stopped');
    assert.deepEqual([kit.debris(box.project), readMusic(box.project, songKey(song))], [[], null]);
  });

  it('goes on rendering while another request waits for the same song', async () => {
    const song = heavy(2, 102);
    const [first, second] = [dial(song), dial(song)];
    await rendering();
    first.hangUp();
    await assert.rejects(first.answer, { name: 'AbortError' });
    const answer = await second.answer;
    assert.equal(answer.status, 200);
    assert.deepEqual(await answer.json(), {
      ...readMusic(box.project, songKey(song)),
      cached: false,
    });
  });

  it('turns a MIDI file of the project into a song', async () => {
    const song = {
      bpm: 96,
      bars: 2,
      parts: [
        {
          kind: 'drums',
          kit: '909',
          bars: 1,
          lanes: { kick: 'X...x...X...x...', snare: '....X.......X...' },
        },
        {
          kind: 'synth',
          preset: 'bass',
          bars: 2,
          notes: [
            [0, 1, 33, 0.9],
            [4, 2, 36, 0.7],
          ],
        },
      ],
    };
    mkdirSync(join(box.project, 'midi'));
    writeFileSync(join(box.project, 'midi', 'tune.mid'), songToMidi(song));
    for (const path of ['midi/tune.mid', join(box.project, 'midi', 'tune.mid')]) {
      const read = await post('import', { projectId: 'p1', path });
      assert.equal(read.status, 200, read.text);
      assert.deepEqual(Object.keys(read.body), ['song', 'warnings']);
      const { parts, bpm, bars } = read.body.song;
      assert.deepEqual([bpm, bars, parts.map((part) => part.kind)], [96, 2, ['drums', 'synth']]);
      // The one-bar pattern was written out over both bars of the song.
      assert.equal(parts[0].lanes.kick, 'X...x...X...x...'.repeat(2));
      assert.deepEqual(
        parts[1].notes.map(([beat, length, pitch]) => [beat, length, pitch]),
        [
          [0, 1, 33],
          [4, 2, 36],
        ],
      );
      assert.ok(Array.isArray(read.body.warnings));
    }
    // Without a project the path must say where it is; inside the allowed folders it is read.
    const absolute = await post('import', { path: join(box.project, 'midi', 'tune.mid') });
    assert.equal(absolute.status, 200);
    // What comes back is a song the render route takes as it is.
    const made = await post('render', { projectId: 'p1', song: absolute.body.song });
    assert.equal(made.status, 200, made.text);
  });

  it('refuses what is outside the project, too big or not MIDI', async () => {
    const midi = songToMidi({ parts: [{ kind: 'synth', notes: [[0, 1, 60]] }] });
    writeFileSync(join(box.outside, 'tune.mid'), midi);
    const outside = await post('import', { projectId: 'p1', path: join(box.outside, 'tune.mid') });
    assert.deepEqual(
      [outside.status, outside.body],
      [403, { error: 'Path is outside the allowed media folders' }],
    );
    assert.equal(
      (await post('import', { projectId: 'p1', path: '../../outside/tune.mid' })).status,
      403,
    );

    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    big.set(midi);
    writeFileSync(join(box.project, 'big.mid'), big);
    const tooBig = await post('import', { projectId: 'p1', path: 'big.mid' });
    assert.equal(tooBig.status, 422);
    assert.deepEqual(tooBig.body, {
      error: 'The file cannot be imported',
      fields: { path: 'The file is 5.0 MB; a MIDI file may be at most 5 MB' },
    });
    writeFileSync(join(box.project, 'limit.mid'), big.subarray(0, 5 * 1024 * 1024));
    assert.equal((await post('import', { projectId: 'p1', path: 'limit.mid' })).status, 200);

    writeFileSync(join(box.project, 'notes.mid'), 'these are words, not notes');
    writeFileSync(join(box.project, 'tune.txt'), midi);
    mkdirSync(join(box.project, 'folder.mid'));
    const refused = {};
    for (const path of ['notes.mid', 'tune.txt', 'folder.mid', 'gone.mid']) {
      const answer = await post('import', { projectId: 'p1', path });
      refused[path] = [answer.status, answer.body.fields?.path || answer.body.error];
    }
    assert.deepEqual(refused, {
      'notes.mid': [422, 'This is not a MIDI file: it has no MIDI header'],
      'tune.txt': [422, 'Not a MIDI file: its name must end in .mid or .midi'],
      'folder.mid': [404, 'Not a file'],
      'gone.mid': [404, 'File not found'],
    });
    const relative = await post('import', { path: 'midi/tune.mid' });
    assert.deepEqual(
      [relative.status, relative.body.fields],
      [422, { path: 'A relative path needs a project: send projectId' }],
    );
    assert.deepEqual((await post('import', { projectId: 'p1' })).body, { error: 'path required' });
    assert.equal((await post('import', { projectId: 'nope', path: 'midi/tune.mid' })).status, 404);
  });

  it('reads a file with more notes than a song holds off the main thread, for a bounded time', async () => {
    // One channel, twenty thousand notes: read whole, the first four thousand kept.
    const events = Array.from({ length: 20000 }, (_, i) => [
      [1, 0x90, 36 + (i % 12), 100],
      [1, 0x80, 36 + (i % 12), 0],
    ]).flat();
    const dense = join(box.project, 'dense.mid');
    writeFileSync(dense, midiFile(1, 480, [midiTrack([...events, END])]));
    let late = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      late = Math.max(late, now - last - 10);
      last = now;
    }, 10);
    const read = await post('import', { projectId: 'p1', path: 'dense.mid' });
    clearInterval(timer);
    assert.equal(read.status, 200, read.text);
    assert.equal(read.body.song.parts[0].notes.length, 4000);
    assert.deepEqual(read.body.warnings.slice(0, 1), [
      'Channel 1 has 20000 notes; the first 4000 are kept',
    ]);
    assert.ok(late < 250, `the event loop was held up for ${late.toFixed(0)} ms`);
    // The limit is twenty seconds; with none to speak of, the file is refused.
    assert.equal(MIDI_TIMEOUT_MS, 20_000);
    await assert.rejects(importMidi(dense, { timeoutMs: 1 }), (err) => {
      assert.deepEqual([err.status, err.message], [422, 'The file cannot be imported']);
      assert.match(
        err.fields.path,
        /^The file holds too much to read: it was not a song after 0\.001 s$/,
      );
      return true;
    });
    const gone = new AbortController();
    gone.abort();
    await assert.rejects(importMidi(dense, { signal: gone.signal }), { killedBy: 'aborted' });
  });

  it('is mounted in the server', async () => {
    const { default: app } = await import('../../src/server.js');
    const server = app.listen(0, '127.0.0.1');
    await new Promise((done) => server.once('listening', done));
    try {
      const url = `http://127.0.0.1:${server.address().port}`;
      const made = await kit.call(url, 'POST', '/api/music/render', {
        projectId: 'p1',
        song: KICK_HAT,
      });
      assert.deepEqual(
        [made.status, made.body.cached, made.body.key],
        [200, true, songKey(KICK_HAT)],
      );
      assert.equal((await kit.call(url, 'POST', '/api/music/import', {})).status, 400);
    } finally {
      await new Promise((done) => server.close(done));
    }
  });
});
