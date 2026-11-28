/**
 * `renderMusic` — a song rendered in a worker thread into a project's
 * `.nearedit/music/`, cached by key: the file is the engine's samples to
 * the byte, a render is shared, limited, cancellable and bounded in time,
 * and whatever goes wrong leaves nothing behind.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { truncateSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eightParts } from '../../src/utils/music/engine/testSongs.js';
import { encodeWav, renderSong, songKey, songSeconds } from '../../src/utils/music/index.js';
import * as music from '../../src/api/music/index.js';
import * as kit from './serverKit.js';

const { KICK_HAT, heavy, sleep, watched } = kit;
const { renderMusic, readMusic, activeMusicRenders } = music;

/** A worker script that is not the renderer, as a `data:` address. */
const script = (code) => new URL(`data:text/javascript,${encodeURIComponent(code)}`);
const HALF = `import { writeFileSync } from 'node:fs';
  import { workerData } from 'node:worker_threads';
  writeFileSync(workerData.file, 'half a file');`;

describe('renderMusic', () => {
  let box;
  let folder;
  const rendering = async () => {
    for (let i = 0; i < 2000 && !kit.debris(folder).length; i++) await sleep(2);
    return kit.debris(folder);
  };

  before(() => {
    box = kit.musicSandbox('music-render');
    folder = box.project;
  });
  after(async () => {
    assert.ok(await kit.idle(), 'no worker thread outlives the tests');
    assert.deepEqual(kit.debris(folder), [], 'nothing but renderings in the music folder');
    box.cleanup();
  });

  it("writes exactly the engine's samples: 16-bit PCM, 48 kHz, stereo", async () => {
    for (const song of [KICK_HAT, eightParts(2), {}]) {
      const made = await renderMusic({ folder, song });
      const key = songKey(song);
      assert.deepEqual(made, {
        file: join(box.music, `${key}.wav`),
        key,
        duration: songSeconds(song),
        cached: false,
      });
      const bytes = readFileSync(made.file);
      assert.ok(bytes.equals(Buffer.from(encodeWav(renderSong(song)))), 'byte for byte');
      assert.deepEqual(
        [bytes.readUInt16LE(22), bytes.readUInt32LE(24), bytes.readUInt16LE(34)],
        [2, 48000, 16],
      );
    }
    // And it is that song: a low thump at the start, a bright tick at 2 s, nothing between.
    const { left, right, frames } = kit.readWav(readMusic(folder, songKey(KICK_HAT)).file);
    assert.equal(frames, 5 * 48000);
    assert.ok(kit.level(left, 0, 0.2) > 0.1 && kit.brightness(left, 0, 0.2) < 200, 'the kick');
    assert.ok(kit.level(left, 2, 2.05) > 0.005 && kit.brightness(left, 2, 2.05) > 3000, 'the hat');
    for (const [from, to] of [
      [1, 2],
      [2.5, 5],
    ])
      assert.equal(kit.level(left, from, to) + kit.level(right, from, to), 0, 'silence');
  });

  it('returns a rendering that exists at once, and reads it by key', async () => {
    const key = songKey(KICK_HAT);
    const before = statSync(join(box.music, `${key}.wav`)).mtimeMs;
    const { result, most } = await watched(() => renderMusic({ folder, song: KICK_HAT }));
    assert.deepEqual(result, { ...readMusic(folder, key), cached: true });
    assert.deepEqual([most, statSync(result.file).mtimeMs], [0, before], 'nothing was rendered');
    // Names and the key and scale hints change nothing that is heard: the same rendering.
    const renamed = {
      ...KICK_HAT,
      key: 'F#',
      parts: KICK_HAT.parts.map((p) => ({ ...p, name: 'x' })),
    };
    assert.equal((await renderMusic({ folder, song: renamed })).cached, true);
    assert.equal(readMusic(folder, songKey({ bpm: 77 })), null);
    assert.throws(() => readMusic(folder, '../../secret'), /Not a rendering key/);
  });

  it('renders again what was cut short or is not a rendering', async () => {
    const { file, key } = await renderMusic({ folder, song: KICK_HAT });
    const whole = readFileSync(file);
    truncateSync(file, 100000);
    assert.equal(readMusic(folder, key), null, 'a file shorter than its header says');
    assert.equal((await renderMusic({ folder, song: KICK_HAT })).cached, false);
    assert.ok(readFileSync(file).equals(whole));
    writeFileSync(file, 'not a wav at all, but long enough to hold a header of 44 bytes');
    assert.equal(readMusic(folder, key), null);
    await renderMusic({ folder, song: KICK_HAT });
    assert.ok(readFileSync(file).equals(whole));
  });

  it('renders one key once, however many ask', async () => {
    const song = { ...eightParts(2), bpm: 111 };
    const seen = [];
    const { result, most } = await watched(() =>
      Promise.all([
        renderMusic({ folder, song, onProgress: (done, total) => seen.push(done / total) }),
        renderMusic({ folder, song: structuredClone(song) }),
        renderMusic({ folder, song }),
      ]),
    );
    assert.equal(most, 1, 'one worker thread');
    assert.deepEqual(
      result.map((made) => [made.key, made.cached]),
      Array(3).fill([songKey(song), false]),
    );
    // Progress is frames done, about once per second of sound, up to all of them.
    assert.ok(seen.length >= 5 && seen.every((part, i) => i === 0 || part > seen[i - 1]));
    assert.equal(seen.at(-1), 1);
    assert.deepEqual(
      readdirSync(box.music).filter((name) => name.includes(songKey(song))).length,
      1,
    );
  });

  it('renders at most MUSIC_RENDER_CONCURRENCY songs at a time', async () => {
    const songs = (bpm, count) =>
      Array.from({ length: count }, (_, i) => ({ ...eightParts(4), bpm: bpm + i }));
    const two = await watched(() =>
      Promise.all(songs(90, 5).map((song) => renderMusic({ folder, song }))),
    );
    assert.equal(two.most, 2, 'the default: two at a time, the rest wait');
    assert.ok(two.result.every((made) => existsSync(made.file) && !made.cached));
    process.env.MUSIC_RENDER_CONCURRENCY = '1';
    try {
      const one = await watched(() =>
        Promise.all(songs(100, 3).map((song) => renderMusic({ folder, song }))),
      );
      assert.equal(one.most, 1);
      assert.equal(one.result.length, 3);
    } finally {
      delete process.env.MUSIC_RENDER_CONCURRENCY;
    }
  });

  it('stays out of the way of the event loop, and stops when told to', async () => {
    // A heavy song: seconds of rendering. A timer on this thread must not notice.
    const song = heavy(4);
    let late = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      late = Math.max(late, now - last - 10);
      last = now;
    }, 10);
    const started = performance.now();
    const made = await renderMusic({ folder, song });
    clearInterval(timer);
    const took = performance.now() - started;
    console.log(
      `    heavy song: ${took.toFixed(0)} ms in the worker, a 10 ms timer at most ${late.toFixed(1)} ms late`,
    );
    // Rendered on this thread, the timer would be late by all of it.
    assert.ok(took > 300, `the song is heavy enough to tell (${took.toFixed(0)} ms)`);
    assert.ok(late < took / 3, `the event loop was held up for ${late.toFixed(0)} ms`);
    assert.equal(made.duration, songSeconds(song));

    // Cancelled while it renders: the thread ends, the partial file goes, no rendering appears.
    const stop = new AbortController();
    const cancelled = renderMusic({ folder, song: heavy(8, 121), signal: stop.signal });
    const [partial] = await rendering();
    assert.match(partial, /^[0-9a-f]{20}\.wav\.\d+-[0-9a-z]+-\d+\.part$/);
    stop.abort();
    await assert.rejects(cancelled, { killedBy: 'aborted' });
    assert.deepEqual([kit.debris(folder), activeMusicRenders()], [[], 0], 'gone when it answers');
    assert.equal(readMusic(folder, songKey(heavy(8, 121))), null);
    await assert.rejects(renderMusic({ folder, song: {}, signal: stop.signal }), {
      killedBy: 'aborted',
    });
  });

  it('keeps a shared render going until the last one who asked has left', async () => {
    const song = heavy(2, 122);
    const [first, second] = [new AbortController(), new AbortController()];
    const one = renderMusic({ folder, song, signal: first.signal });
    const two = renderMusic({ folder, song, signal: second.signal });
    await rendering();
    first.abort();
    await assert.rejects(one, { killedBy: 'aborted' });
    assert.equal(activeMusicRenders(), 1, 'the other still waits: the render goes on');
    assert.equal((await two).cached, false);
    // Both leave: it stops — and whoever asks afterwards gets a render of their own.
    const again = heavy(2, 123);
    const [a, b] = [new AbortController(), new AbortController()];
    const left = [
      renderMusic({ folder, song: again, signal: a.signal }),
      renderMusic({ folder, song: again, signal: b.signal }),
    ];
    await rendering();
    // Who leaves when is not this test's business: every answer is awaited from the start.
    const gone = Promise.all(left.map((one) => assert.rejects(one, { killedBy: 'aborted' })));
    a.abort();
    b.abort();
    const fresh = renderMusic({ folder, song: again });
    await gone;
    assert.equal((await fresh).cached, false);
    assert.ok(readMusic(folder, songKey(again)));
  });

  it('answers at once when a render that is still waiting its turn is cancelled', async () => {
    const stops = [0, 1, 2].map(() => new AbortController());
    const asked = stops.map((stop, i) =>
      renderMusic({ folder, song: heavy(8, 130 + i), signal: stop.signal }),
    );
    await rendering();
    const started = performance.now();
    stops[2].abort();
    await assert.rejects(asked[2], { killedBy: 'aborted' });
    assert.ok(performance.now() - started < 200, 'it did not wait for a free place');
    assert.equal(activeMusicRenders(), 2, 'the two that render are not disturbed');
    const rest = asked.slice(0, 2).map((one) => assert.rejects(one, { killedBy: 'aborted' }));
    stops[0].abort();
    stops[1].abort();
    await Promise.all(rest);
  });

  it('gives up on a song that takes too long, saying it is too heavy', async () => {
    assert.equal(music.RENDER_TIMEOUT_MS, 10 * 60_000, 'ten minutes, unless a test says otherwise');
    const song = heavy(8, 140);
    await assert.rejects(renderMusic({ folder, song, timeoutMs: 150 }), (err) => {
      assert.equal(err.status, 422);
      assert.match(
        err.message,
        /^The song is too heavy to render: it was not finished after 0\.15 s\./,
      );
      assert.match(err.message, /fewer parts, fewer notes at once or less unison/);
      return true;
    });
    assert.deepEqual([kit.debris(folder), activeMusicRenders()], [[], 0]);
    assert.equal(readMusic(folder, songKey(song)), null);
  });

  it('reports a renderer that crashes, and leaves nothing of it', async () => {
    const song = { bpm: 150 };
    const thrown = renderMusic({
      folder,
      song,
      workerFile: script(`${HALF} throw new Error('boom');`),
    });
    await assert.rejects(thrown, (err) => {
      assert.deepEqual(
        [err.status, err.message],
        [500, 'The music renderer stopped unexpectedly (boom)'],
      );
      return true;
    });
    const quit = renderMusic({ folder, song, workerFile: script(`${HALF} process.exit(3);`) });
    await assert.rejects(quit, /The music renderer stopped unexpectedly \(exit code 3\)/);
    const silent = renderMusic({ folder, song, workerFile: script('') });
    await assert.rejects(silent, /stopped unexpectedly \(exit code 0\)/);
    assert.deepEqual([kit.debris(folder), readMusic(folder, songKey(song))], [[], null]);
    // The key is not poisoned: the real renderer makes it afterwards.
    assert.equal((await renderMusic({ folder, song })).cached, false);
  });

  it('removes what a killed process left half-written, and only that', async () => {
    const old = new Date(Date.now() - 2 * 3600_000);
    const names = [
      '0123456789abcdef0123.wav.4242-abc-0.part',
      'fresh.wav.1-a-0.part',
      'notes.part',
    ];
    for (const name of names) writeFileSync(join(box.music, name), 'left behind');
    for (const name of [names[0], names[2]]) utimesSync(join(box.music, name), old, old);
    await renderMusic({ folder, song: { bpm: 151 } });
    // A young one may still be written by another process; other files are not ours.
    assert.deepEqual(kit.debris(folder).sort(), ['fresh.wav.1-a-0.part', 'notes.part']);
    for (const name of kit.debris(folder)) rmSync(join(box.music, name));
  });

  it(
    'says so when the folder cannot be written',
    { skip: process.platform !== 'linux' },
    async () => {
      // A folder even root may not create things in.
      await assert.rejects(renderMusic({ folder: '/sys/kernel', song: {} }), (err) => {
        assert.equal(err.status, 403);
        assert.match(
          err.message,
          /^Music cannot be rendered into \/sys\/kernel\/\.nearedit\/music: the folder is not writable$/,
        );
        return true;
      });
    },
  );
});
