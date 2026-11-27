import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createLimiter, createSingleFlight } from '../../src/api/lib/concurrency.js';
import { run } from '../../src/api/lib/ffmpeg.js';
import { cacheEntry, produceCacheFile } from '../../src/api/lib/fileCache.js';
import { intParam, numberParam, stringParam } from '../../src/api/lib/params.js';
import { isAllowedPath, isBrowsablePath } from '../../src/api/lib/paths.js';
import { cachedProbe, clearProbeCache, probeCacheStats } from '../../src/api/lib/probeCache.js';
import { saveRegistry, writeJsonAtomic } from '../../src/api/lib/registry.js';
import { contentTypeFor } from '../../src/api/lib/sendFile.js';
import { createSandbox } from './helpers.js';

let box;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

before(() => {
  box = createSandbox('lib');
});
after(() => box?.cleanup());

describe('concurrency', () => {
  it('runs at most `limit` tasks at once, in arrival order', async () => {
    const limit = createLimiter(3);
    let active = 0;
    let peak = 0;
    const order = [];
    const task = (id) => async () => {
      peak = Math.max(peak, ++active);
      order.push(id);
      await pause(5);
      active--;
      return id * 2;
    };
    const results = await Promise.all(Array.from({ length: 10 }, (_, id) => limit(task(id))));
    assert.equal(peak, 3);
    assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(results.slice(0, 3), [0, 2, 4]);
  });

  it('keeps going after a task fails', async () => {
    const limit = createLimiter(1);
    const failed = limit(() => Promise.reject(new Error('nope')));
    const threw = limit(() => {
      throw new Error('sync nope');
    });
    await assert.rejects(failed, /nope/);
    await assert.rejects(threw, /sync nope/);
    assert.equal(await limit(() => 'still working'), 'still working');
  });

  it('shares one run between callers with the same key, then lets go of it', async () => {
    const flight = createSingleFlight();
    let runs = 0;
    const work = async () => {
      const mine = ++runs;
      await pause(5);
      return mine;
    };
    const [a, b, other] = await Promise.all([
      flight('x', work),
      flight('x', work),
      flight('y', work),
    ]);
    assert.deepEqual([a, b, other, runs], [1, 1, 2, 2]);
    assert.equal(flight.size(), 0);
    assert.equal(await flight('x', work), 3, 'a finished flight is not reused');
    await assert.rejects(flight('z', () => Promise.reject(new Error('failed flight'))));
    assert.equal(flight.size(), 0);
  });
});

describe('fileCache', () => {
  const dir = () => join(box.data, 'cache');
  const stat = (mtimeMs) => ({ mtimeMs, size: 10 });

  it('names entries by source path, revision and variant', () => {
    const a = cacheEntry(dir(), 'thumb', '/media/a.mp4', stat(1), '10x90.jpg');
    const edited = cacheEntry(dir(), 'thumb', '/media/a.mp4', stat(2), '10x90.jpg');
    const other = cacheEntry(dir(), 'thumb', '/media/b.mp4', stat(1), '10x90.jpg');
    assert.notEqual(a.file, edited.file);
    assert.equal(a.family, edited.family);
    assert.notEqual(a.family, other.family);
    assert.ok(a.file.startsWith(join(dir(), 'thumb_')) && a.file.endsWith('_10x90.jpg'));
  });

  it('renames a finished file into place and removes older revisions of the source', async () => {
    const old = cacheEntry(dir(), 'thumb', '/media/a.mp4', stat(1), '10x90.jpg');
    const sibling = cacheEntry(dir(), 'thumb', '/media/a.mp4', stat(1), '5x90.jpg');
    const unrelated = cacheEntry(dir(), 'thumb', '/media/b.mp4', stat(1), '10x90.jpg');
    for (const entry of [old, sibling, unrelated]) {
      await produceCacheFile(entry, (temp) => writeFileSync(temp, 'jpeg'));
    }
    assert.equal(readdirSync(dir()).length, 3);
    const fresh = cacheEntry(dir(), 'thumb', '/media/a.mp4', stat(2), '10x90.jpg');
    const file = await produceCacheFile(fresh, (temp) => {
      assert.ok(temp.endsWith('.jpg') && temp !== fresh.file);
      writeFileSync(temp, 'new jpeg');
    });
    assert.equal(file, fresh.file);
    const names = readdirSync(dir()).map((name) => join(dir(), name));
    assert.deepEqual(names.sort(), [fresh.file, unrelated.file].sort());
  });

  it('leaves nothing behind when production fails or produces nothing', async () => {
    const before = readdirSync(dir());
    const entry = cacheEntry(dir(), 'wave', '/media/c.mp3', stat(1), 'peaks.json');
    const halfWritten = produceCacheFile(entry, (temp) => {
      writeFileSync(temp, 'partial');
      throw new Error('ffmpeg died');
    });
    await assert.rejects(halfWritten, /ffmpeg died/);
    await assert.rejects(
      produceCacheFile(entry, () => {}),
      /No output/,
    );
    await assert.rejects(
      produceCacheFile(entry, (temp) => writeFileSync(temp, '')),
      /No output/,
    );
    assert.deepEqual(readdirSync(dir()), before);
  });
});

describe('path safety', () => {
  it('follows symlinks, including for paths that do not exist yet', () => {
    mkdirSync(join(box.home, 'real'));
    symlinkSync(box.outside, join(box.home, 'escape'));
    assert.equal(isBrowsablePath(join(box.home, 'real', 'new', 'deeper')), true);
    assert.equal(isBrowsablePath(join(box.home, 'escape')), false);
    assert.equal(isBrowsablePath(join(box.home, 'escape', 'new-folder')), false);
    assert.equal(isBrowsablePath(join(box.home, 'escape', 'a', 'b', 'c')), false);
    assert.equal(isBrowsablePath(`${box.home}-sibling`), false, 'a prefix is not a parent');
    assert.equal(isBrowsablePath(''), false);
    assert.equal(isBrowsablePath(42), false);
  });

  it('picks up a changed mediaFolders list without a restart', () => {
    const footage = join(box.root, 'footage');
    const file = join(footage, 'a.mp4');
    saveRegistry({ p1: { path: box.project, name: 'P' } });
    const projectFile = join(box.project, '.nearedit', 'project.json');
    writeJsonAtomic(projectFile, { id: 'p1', mediaFolders: [] });
    assert.equal(isAllowedPath(file), false);
    writeJsonAtomic(projectFile, { id: 'p1', mediaFolders: [footage] });
    assert.equal(isAllowedPath(file), true);
    writeJsonAtomic(projectFile, { id: 'p1', mediaFolders: [42, null, ''] });
    assert.equal(isAllowedPath(file), false, 'junk entries are ignored, not fatal');
    assert.equal(isAllowedPath(join(box.project, 'clip.mp4')), true);
  });
});

describe('writeJsonAtomic', () => {
  it('replaces the file in one step and leaves no temp file, even when it fails', () => {
    const dir = join(box.root, 'atomic');
    const file = join(dir, 'state.json');
    writeJsonAtomic(file, { a: 1 });
    writeJsonAtomic(file, { a: 2 });
    assert.deepEqual(readdirSync(dir), ['state.json']);
    // Renaming onto a non-empty directory fails after the temp file was written.
    const blocked = join(dir, 'blocked.json');
    mkdirSync(join(blocked, 'child'), { recursive: true });
    assert.throws(() => writeJsonAtomic(blocked, { a: 3 }));
    assert.deepEqual(readdirSync(dir).sort(), ['blocked.json', 'state.json']);
  });
});

describe('probeCache', () => {
  it('retries a failed probe only after the file changes', async () => {
    clearProbeCache();
    const file = join(box.project, 'growing.mp4');
    writeFileSync(file, 'still copying');
    assert.equal(await cachedProbe(file), null);
    assert.equal(await cachedProbe(file), null);
    assert.equal(probeCacheStats().probes, 1, 'the failure is remembered');
    const later = new Date(Date.now() + 5000);
    utimesSync(file, later, later);
    await cachedProbe(file);
    assert.equal(probeCacheStats().probes, 2);
    assert.equal(await cachedProbe(join(box.project, 'missing.mp4')), null);
    assert.equal(probeCacheStats().probes, 2, 'a missing file is never probed');
  });
});

describe('small helpers', () => {
  it('reads query values defensively', () => {
    assert.equal(stringParam(['a', 'b']), 'a');
    assert.equal(stringParam({ nested: 'x' }), '');
    assert.equal(stringParam(undefined), '');
    assert.equal(intParam('12', 10, 1, 40), 12);
    assert.equal(intParam('12.6', 10, 1, 40), 13);
    assert.equal(intParam('abc', 10, 1, 40), 10);
    assert.equal(intParam('', 10, 1, 40), 10);
    assert.equal(intParam('-5', 10, 1, 40), 1);
    assert.equal(intParam('Infinity', 10, 1, 40), 10);
    assert.equal(numberParam('1.25', 0, 0, 100), 1.25);
    assert.equal(numberParam(['7', '8'], 0, 0, 5), 5);
  });

  it('knows the content type of every listed media format', () => {
    assert.equal(contentTypeFor('/a/B.MP4'), 'video/mp4');
    assert.equal(contentTypeFor('/a/b.m4a'), 'audio/mp4');
    assert.equal(contentTypeFor('/a/b.vtt'), 'text/vtt');
    assert.equal(contentTypeFor('/a/b.html'), null);
    assert.equal(contentTypeFor('/a/b'), null);
  });

  it('streams process output to onStdout instead of buffering it', async () => {
    const chunks = [];
    const script = 'process.stdout.write("a".repeat(100000))';
    const result = await run(process.execPath, ['-e', script], {
      onStdout: (chunk) => chunks.push(chunk),
    });
    assert.equal(Buffer.concat(chunks).length, 100000);
    assert.equal(result.stdout, '');
    const buffered = await run(process.execPath, ['-e', 'process.stdout.write("hi")']);
    assert.equal(buffered.stdout, 'hi');
  });
});
