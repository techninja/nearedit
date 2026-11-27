import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { previewsRouter } from '../../src/api/previews.js';
import { projectsRouter } from '../../src/api/projects.js';
import { call, createSandbox, jpegSize, makeMedia, q, rawGet, serve } from './helpers.js';

let box;
let api;
let media;
const previewDir = () => join(box.data, 'previews');
const cachedFiles = () => readdirSync(previewDir()).sort();
const image = async (route, path, query = '') => {
  const res = await fetch(`${api.url}/api/previews/${route}${q(path)}${query}`);
  const data = Buffer.from(await res.arrayBuffer());
  return { res, data, status: res.status, type: res.headers.get('content-type') };
};
const isJpeg = (data) => data[0] === 0xff && data[1] === 0xd8;
const touch = (file) => {
  const later = new Date(statSync(file).mtimeMs + 5000);
  utimesSync(file, later, later);
};

before(async () => {
  box = createSandbox('previews');
  media = makeMedia(box.project);
  api = await serve(projectsRouter, previewsRouter);
  await call(api.url, 'POST', '/api/projects', { name: 'Park', path: box.project });
});
after(async () => {
  await api?.close();
  box?.cleanup();
});

describe('GET /previews/thumbnail', () => {
  it('makes a JPEG filmstrip of `cols` frames at the asked height', async () => {
    const strip = await image('thumbnail', media.video);
    assert.deepEqual([strip.status, strip.type], [200, 'image/jpeg']);
    assert.ok(isJpeg(strip.data));
    // 320x180 scaled to 90 high is 160 wide; ten of them side by side
    assert.deepEqual(jpegSize(strip.data), { width: 1600, height: 90 });
    const small = await image('thumbnail', media.video, '&cols=4&height=60');
    assert.deepEqual(jpegSize(small.data), { width: 4 * 106, height: 60 });
    const one = await image('thumbnail', media.video, '&cols=1&height=120');
    assert.deepEqual(jpegSize(one.data), { width: 212, height: 120 });
  });

  it('samples different moments of the clip, not one frame repeated', async () => {
    const strip = await image('thumbnail', media.video, '&cols=2&height=90');
    const file = join(box.root, 'strip.jpg');
    writeFileSync(file, strip.data);
    const crop = (x) =>
      execFileSync(
        'ffmpeg',
        ['-v', 'error', '-i', file, '-vf', `crop=160:90:${x}:0`, '-f', 'rawvideo', '-'],
        {
          maxBuffer: 1 << 26,
        },
      );
    assert.ok(!crop(0).equals(crop(160)), 'the two cells show different frames');
  });

  it('scales stills instead of seeking, repeating them across the strip', async () => {
    const strip = await image('thumbnail', media.image, '&cols=3&height=60');
    assert.equal(strip.status, 200);
    assert.deepEqual(jpegSize(strip.data), { width: 300, height: 60 });
  });

  it('serves the cached file on the second request', async () => {
    const query = '&cols=5&height=90';
    await image('thumbnail', media.video, query);
    const name = cachedFiles().find((file) => file.endsWith('_5x90.jpg'));
    const made = statSync(join(previewDir(), name)).mtimeMs;
    const again = await image('thumbnail', media.video, query);
    assert.equal(again.status, 200);
    assert.equal(statSync(join(previewDir(), name)).mtimeMs, made);
  });

  it('shares one generation between concurrent requests', async () => {
    const query = '&cols=7&height=90';
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => image('thumbnail', media.video, query)),
    );
    assert.ok(results.every((r) => r.status === 200 && r.data.equals(results[0].data)));
    assert.equal(cachedFiles().filter((file) => file.endsWith('_7x90.jpg')).length, 1);
  });

  it('regenerates when the source file changes and drops the outdated entries', async () => {
    const before = cachedFiles().filter((file) => file.endsWith('_5x90.jpg'));
    touch(media.video);
    const strip = await image('thumbnail', media.video, '&cols=5&height=90');
    assert.equal(strip.status, 200);
    const now = cachedFiles().filter((file) => file.endsWith('.jpg') && file.includes('5x90'));
    assert.equal(now.length, 1);
    assert.notEqual(now[0], before[0], 'the cache key includes the source mtime');
    const family = now[0].split('_').slice(0, 2).join('_');
    const sameSource = cachedFiles().filter((file) => file.startsWith(family));
    assert.deepEqual(sameSource, now, 'strips of the old revision are gone');
  });

  it('clamps out-of-range geometry instead of failing', async () => {
    const strip = await image('thumbnail', media.image, '&cols=999&height=5');
    assert.equal(strip.status, 200);
    assert.deepEqual(jpegSize(strip.data), { width: 40 * 26, height: 16 });
    const junk = await image('thumbnail', media.image, '&cols=abc&height=');
    assert.deepEqual(jpegSize(junk.data), { width: 10 * 150, height: 90 });
  });

  it('refuses files without a picture (422) and leaves no temp files', async () => {
    const audio = await call(api.url, 'GET', `/api/previews/thumbnail${q(media.audio)}`);
    assert.equal(audio.status, 422);
    assert.equal(
      (await call(api.url, 'GET', `/api/previews/thumbnail${q(media.text)}`)).status,
      422,
    );
    const broken = join(box.project, 'broken.mp4');
    writeFileSync(broken, 'not a video at all');
    const res = await call(api.url, 'GET', `/api/previews/thumbnail${q(broken)}`);
    assert.equal(res.status, 422);
    assert.ok(res.body.error);
    assert.deepEqual(
      cachedFiles().filter((file) => file.includes('.part-')),
      [],
    );
  });

  it('refuses paths outside the allowed roots (403) and missing files (404)', async () => {
    for (const route of ['thumbnail', 'frame', 'waveform']) {
      const get = (path) => call(api.url, 'GET', `/api/previews/${route}${q(path)}`);
      assert.equal((await get(join(box.outside, 'secret.txt'))).status, 403, route);
      assert.equal((await get(join(box.project, '..', '..', 'outside', 'secret.txt'))).status, 403);
      assert.equal((await get(join(box.project, 'gone.mp4'))).status, 404, route);
      assert.equal((await call(api.url, 'GET', `/api/previews/${route}`)).status, 400, route);
    }
  });
});

describe('GET /previews/frame', () => {
  it('returns one JPEG frame at the asked height', async () => {
    const frame = await image('frame', media.video, '&time=1&height=90');
    assert.deepEqual([frame.status, frame.type], [200, 'image/jpeg']);
    assert.deepEqual(jpegSize(frame.data), { width: 160, height: 90 });
    assert.equal(frame.res.headers.get('cache-control'), 'private, no-cache');
  });

  it('returns different pictures for different times', async () => {
    const early = await image('frame', media.video, '&time=0.2&height=90');
    const late = await image('frame', media.video, '&time=2&height=90');
    assert.ok(!early.data.equals(late.data));
  });

  it('never enlarges, and clamps a time past the end to the last frame', async () => {
    const big = await image('frame', media.video, '&time=0&height=720');
    assert.deepEqual(jpegSize(big.data), { width: 320, height: 180 });
    const end = await image('frame', media.video, '&time=999');
    assert.equal(end.status, 200);
    assert.ok(isJpeg(end.data));
  });

  it('scales stills and ignores the time', async () => {
    const frame = await image('frame', media.image, '&time=5&height=60');
    assert.deepEqual(jpegSize(frame.data), { width: 100, height: 60 });
  });

  it('answers 304 to a matching ETag, and a new ETag once the file changes', async () => {
    const url = `${api.url}/api/previews/frame${q(media.video)}&time=1&height=90`;
    const first = await rawGet(url);
    assert.equal(first.status, 200);
    const etag = first.headers.etag;
    assert.match(etag, /^"frame-[0-9a-f]+"$/);
    const again = await rawGet(url, { 'If-None-Match': etag });
    assert.deepEqual([again.status, again.data.length], [304, 0]);

    touch(media.video);
    const changed = await rawGet(url, { 'If-None-Match': etag });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.etag, etag);
  });

  it('refuses files without a picture (422)', async () => {
    assert.equal((await call(api.url, 'GET', `/api/previews/frame${q(media.audio)}`)).status, 422);
  });

  it('writes nothing to disk', () => {
    assert.ok(cachedFiles().every((file) => file.startsWith('thumb_')));
  });
});
