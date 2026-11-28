import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { readRecording, recordToCache, webDir } from '../../src/api/web/cache.js';
import * as kit from './kit.js';
import { startSite } from './site.js';

/**
 * Whatever ends a recording — it finished, it was cancelled, the browser
 * died, FFmpeg failed — nothing is left running and nothing half-written
 * is left on disk. And a recording that exists is not made again.
 */

const long = { do: 'wait', duration: 20 };

describe('web recorder: lifecycle', { skip: kit.SKIP }, () => {
  let site;
  let n = 0;
  const folder = () => {
    const dir = join(kit.SCRATCH, `case-${n++}`);
    mkdirSync(dir);
    return dir;
  };
  const options = () => ({
    browser: kit.BROWSER,
    noSandbox: kit.NO_SANDBOX,
    allow: site.allow,
    fps: 30,
  });
  const recipe = (steps = []) => ({ ...kit.SMALL, url: `${site.url}/`, steps });
  const clean = () => assert.deepEqual(kit.leftovers(), { processes: [], profiles: [] });
  /** The browser of the recording in flight: the process whose profile is under our scratch folder. */
  const browserPid = () => {
    const lines = execFileSync('ps', ['-eo', 'pid,args'], { encoding: 'utf8' }).split('\n');
    const main = lines.find(
      (line) => line.includes(`--user-data-dir=${kit.SCRATCH}`) && !line.includes('--type='),
    );
    return Number(main.trim().split(/\s+/)[0]);
  };

  before(async () => {
    site = await startSite();
  });
  after(async () => {
    await site.close();
    clean();
    kit.cleanup();
  });

  it('cancels mid-recording without a trace', async () => {
    const dir = folder();
    const stop = new AbortController();
    let seen = 0;
    const onFrame = (done) => {
      seen = done;
      if (done === 20) stop.abort();
    };
    await assert.rejects(
      kit.record(recipe([long]), { ...options(), dir, signal: stop.signal, onFrame }),
      (err) => err.killedBy === 'aborted' && /cancelled/.test(err.message),
    );
    assert.ok(seen >= 20 && seen < 40, `stopped at once: ${seen} frames`);
    assert.deepEqual(readdirSync(dir), []);
    clean();
    const before = new AbortController();
    before.abort();
    await assert.rejects(
      kit.record(recipe(), { ...options(), dir, signal: before.signal }),
      /cancelled/,
    );
    assert.deepEqual(readdirSync(dir), []);
  });

  it('says so when the browser dies, and leaves nothing', async () => {
    const dir = folder();
    const onFrame = (done) => done === 15 && process.kill(browserPid(), 'SIGKILL');
    await assert.rejects(
      kit.record(recipe([long]), { ...options(), dir, onFrame }),
      /The browser stopped while recording \(it crashed or was closed\)/,
    );
    assert.deepEqual(readdirSync(dir), []);
    clean();
  });

  it('says so when FFmpeg fails, and when the browser cannot start', async () => {
    const dir = folder();
    const bin = folder();
    writeFileSync(join(bin, 'ffmpeg'), '#!/bin/sh\necho "Unknown encoder libx264" >&2\nexit 1\n');
    chmodSync(join(bin, 'ffmpeg'), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${bin}${delimiter}${path}`;
    try {
      await assert.rejects(
        kit.record(recipe([{ do: 'wait', duration: 2 }]), { ...options(), dir }),
        /FFmpeg failed: Unknown encoder libx264/,
      );
    } finally {
      process.env.PATH = path;
    }
    assert.deepEqual(readdirSync(dir), []);
    clean();
    const script = join(bin, 'not-a-browser');
    writeFileSync(script, '#!/bin/sh\necho "cannot open shared object file" >&2\nexit 127\n');
    chmodSync(script, 0o755);
    await assert.rejects(kit.record(recipe(), { ...options(), dir, browser: script }), (err) => {
      assert.match(err.message, /The browser could not start: .*not-a-browser/);
      assert.match(err.detail, /cannot open shared object file/);
      return err.status === 503;
    });
    assert.deepEqual(readdirSync(dir), []);
    clean();
  });

  it('records a recipe once: a pair on disk is the recording', async () => {
    const dir = folder();
    const raw = { ...recipe([{ do: 'click', target: '#toggle', note: 'the lamp' }]), lead: 0.1 };
    let frames = 0;
    const first = await recordToCache({
      ...options(),
      folder: dir,
      recipe: raw,
      onFrame: () => frames++,
    });
    assert.equal(first.cached, false);
    assert.equal(first.file, join(webDir(dir), `${first.key}.mp4`));
    assert.match(first.key, /^[0-9a-f]{20}$/);
    assert.deepEqual(readdirSync(webDir(dir)).sort(), [`${first.key}.json`, `${first.key}.mp4`]);
    assert.deepEqual(
      [first.duration, first.fps, first.width, first.height, first.title],
      [first.track.duration, 30, 640, 360, 'NearEdit test site'],
    );
    assert.equal(frames, Math.round(first.duration * 30));

    const started = Date.now();
    const again = await recordToCache({
      ...options(),
      folder: dir,
      recipe: { ...raw, steps: [{ ...raw.steps[0], note: 'another caption' }] },
      onFrame: () => assert.fail('recorded again'),
    });
    assert.ok(Date.now() - started < 100, 'no browser was started');
    assert.deepEqual({ ...again, cached: false }, first, 'notes are not part of the key');
    assert.equal(again.cached, true);
    assert.deepEqual(readRecording(dir, first.key).track, first.track);
    const other = await recordToCache({ ...options(), folder: dir, recipe: raw, fps: 25 });
    assert.notEqual(other.key, first.key, 'another frame rate is another recording');
    assert.equal(readRecording(dir, 'f'.repeat(20)), null);
    assert.throws(() => readRecording(dir, '../../etc/passwd'), /Not a recording key/);
    clean();
  });

  it('shares one recording between requests made at the same moment', async () => {
    const dir = folder();
    const raw = recipe([{ do: 'wait', duration: 0.5 }]);
    let launches = 0;
    const count = () => (launches += kit.leftovers().profiles.length);
    const [a, b] = await Promise.all([
      recordToCache({
        ...options(),
        folder: dir,
        recipe: raw,
        onFrame: (done) => done === 5 && count(),
      }),
      recordToCache({
        ...options(),
        folder: dir,
        recipe: raw,
        onFrame: () => assert.fail('a second recording'),
      }),
    ]);
    assert.equal(launches, 1, 'one browser');
    assert.equal(a, b);
    assert.equal(a.cached, false);
    assert.equal(readdirSync(webDir(dir)).length, 2);

    // Cancelling one of two waiting requests must not take the other down with it.
    const slow = recipe([{ do: 'wait', duration: 1.5 }]);
    const stop = new AbortController();
    const first = recordToCache({
      ...{ ...options(), folder: dir, recipe: slow, signal: stop.signal },
      onFrame: (done) => done === 10 && stop.abort(),
    });
    const second = recordToCache({
      ...options(),
      folder: dir,
      recipe: slow,
      signal: new AbortController().signal,
    });
    await assert.rejects(first, /cancelled/);
    const kept = await second;
    assert.ok(existsSync(kept.file), 'the other request recorded it after all');
    clean();
  });
});
