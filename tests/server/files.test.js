import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { mediaRouter } from '../../src/api/media.js';
import { wavRenditionStats } from '../../src/api/media/wavRendition.js';
import { projectsRouter } from '../../src/api/projects.js';
import { transcodeRouter } from '../../src/api/transcode.js';
import { call, createSandbox, makeMedia, q, rawGet, serve } from './helpers.js';

let box;
let api;
let media;
const get = (route, path, headers) =>
  call(api.url, 'GET', `/api/${route}${q(path)}`, undefined, headers);
const bytes = async (route, path, headers = {}) => {
  const res = await fetch(`${api.url}/api/${route}${q(path)}`, { headers });
  return { res, data: Buffer.from(await res.arrayBuffer()) };
};

before(async () => {
  box = createSandbox('files');
  media = makeMedia(box.project);
  writeFileSync(join(box.project, 'page.html'), '<script>alert(1)</script>');
  symlinkSync(join(box.outside, 'secret.txt'), join(box.project, 'link.txt'));
  api = await serve(projectsRouter, mediaRouter, transcodeRouter);
  await call(api.url, 'POST', '/api/projects', { name: 'Park', path: box.project });
});
after(async () => {
  await api?.close();
  box?.cleanup();
});

/** Every route that takes a path must refuse these the same way. */
const refusals = (route, method = 'GET') => {
  it(`${method} /${route} refuses paths outside the allowed roots (403)`, async () => {
    const attempt = (path) =>
      call(api.url, method, `/api/${route}${q(path)}`, method === 'GET' ? undefined : {});
    assert.equal((await attempt(join(box.outside, 'secret.txt'))).status, 403);
    assert.equal(
      (await attempt(join(box.project, '..', '..', 'outside', 'secret.txt'))).status,
      403,
    );
    assert.equal((await attempt('/etc/passwd')).status, 403);
    assert.equal(
      (await attempt(join(box.project, 'link.txt'))).status,
      403,
      'symlink out of the root',
    );
    assert.equal((await attempt(`${media.video}\0.png`)).status, 403);
    assert.equal((await attempt('relative/clip.mp4')).status, 403);
  });
  it(`${method} /${route} answers 400 without a path and 404 for a missing file`, async () => {
    const body = method === 'GET' ? undefined : {};
    assert.equal((await call(api.url, method, `/api/${route}`, body)).status, 400);
    const missing = `/api/${route}${q(join(box.project, 'gone.mp4'))}`;
    assert.equal((await call(api.url, method, missing, body)).status, 404);
    const folder = `/api/${route}${q(box.project)}`;
    assert.equal((await call(api.url, method, folder, body)).status, 404);
  });
};

describe('GET /media/file', () => {
  it('streams a whole file with the right content type', async () => {
    const { res, data } = await bytes('media/file', media.video);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'video/mp4');
    assert.equal(res.headers.get('accept-ranges'), 'bytes');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(data.equals(readFileSync(media.video)));
    const types = { audio: 'audio/mpeg', image: 'image/png', text: 'text/markdown; charset=utf-8' };
    for (const [kind, type] of Object.entries(types)) {
      assert.equal((await bytes('media/file', media[kind])).res.headers.get('content-type'), type);
    }
  });

  it('answers range requests with 206 and exactly the bytes asked for', async () => {
    const whole = readFileSync(media.video);
    const first = await bytes('media/file', media.video, { Range: 'bytes=0-99' });
    assert.equal(first.res.status, 206);
    assert.equal(first.res.headers.get('content-range'), `bytes 0-99/${whole.length}`);
    assert.ok(first.data.equals(whole.subarray(0, 100)));

    const tail = await bytes('media/file', media.video, { Range: `bytes=${whole.length - 50}-` });
    assert.equal(tail.res.status, 206);
    assert.ok(tail.data.equals(whole.subarray(whole.length - 50)));

    const beyond = await get('media/file', media.video, { Range: `bytes=${whole.length + 10}-` });
    assert.equal(beyond.status, 416);
    assert.equal(beyond.headers.get('content-range'), `bytes */${whole.length}`);
    assert.ok(beyond.body.error);
  });

  it('supports HEAD and conditional requests', async () => {
    const head = await fetch(`${api.url}/api/media/file${q(media.video)}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get('content-length')), statSync(media.video).size);
    const etag = head.headers.get('etag');
    const url = `${api.url}/api/media/file${q(media.video)}`;
    const again = await rawGet(url, { 'If-None-Match': etag });
    assert.deepEqual([again.status, again.data.length], [304, 0]);
  });

  it('never serves an unknown file type as a page', async () => {
    const { res } = await bytes('media/file', join(box.project, 'page.html'));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/octet-stream');
    assert.match(res.headers.get('content-disposition'), /^attachment/);
  });

  refusals('media/file');
});

describe('sidecar routes', () => {
  it('reports a missing sidecar', async () => {
    const res = await get('sidecar', media.video);
    assert.deepEqual([res.status, res.body], [200, { exists: false, stale: false }]);
  });

  it('merges patches into the sidecar and stamps freshness', async () => {
    const put = (body) => call(api.url, 'PUT', `/api/sidecar${q(media.video)}`, body);
    const first = await put({ tags: ['park'], description: 'Kids at the park', _sourceMtime: 1 });
    assert.equal(first.status, 200);
    assert.equal(
      first.body._sourceMtime,
      statSync(media.video).mtimeMs,
      'client stamps are ignored',
    );
    const words = [{ word: 'hello', start: 0.5, end: 0.8 }];
    const second = await put({ tags: ['park', 'dog'], transcript: words });
    assert.deepEqual(second.body.tags, ['park', 'dog']);
    const stored = (await get('sidecar', media.video)).body;
    assert.deepEqual(
      [stored.tags, stored.description, stored.transcript],
      [['park', 'dog'], 'Kids at the park', words],
    );
    const leftovers = readdirSync(box.project).filter((name) => name.includes('.tmp'));
    assert.deepEqual(leftovers, []);
  });

  it('reports a sidecar made stale by an edit of the source', async () => {
    const later = new Date(statSync(media.video).mtimeMs + 5000);
    utimesSync(media.video, later, later);
    assert.deepEqual((await get('sidecar', media.video)).body, { exists: false, stale: true });
  });

  it('validates patches', async () => {
    const put = (path, body) => call(api.url, 'PUT', `/api/sidecar${q(path)}`, body);
    const bad = await put(media.audio, { tags: 'park,dog', transcript: [{ word: 'x' }] });
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['tags', 'transcript']);
    assert.equal((await put(media.audio, ['tags'])).status, 400);
    assert.equal((await put(join(box.project, 'page.html'), { tags: [] })).status, 400);
    assert.ok(!existsSync(`${media.audio}.nearedit.json`));
    assert.equal((await put(media.audio, { beats: null, constructor: 1 })).status, 200);
  });

  refusals('sidecar');
  refusals('sidecar', 'PUT');
});

describe('GET /transcode', () => {
  const cached = () => readdirSync(join(box.data, 'transcode'));

  it('shares one ffmpeg run between concurrent requests for the same file', async () => {
    const before = wavRenditionStats().runs;
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => bytes('transcode', media.audio)));
    assert.equal(wavRenditionStats().runs - before, 1);
    for (const { res, data } of [a, b, c]) {
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'audio/wav');
      assert.equal(data.subarray(0, 4).toString(), 'RIFF');
      assert.equal(data.subarray(8, 12).toString(), 'WAVE');
    }
    assert.ok(a.data.equals(b.data));
    // 2 s of 44.1 kHz 16-bit stereo, give or take encoder padding
    assert.ok(Math.abs(a.data.length - 2 * 44100 * 4) < 44100, `${a.data.length} bytes`);
    assert.equal(cached().length, 1);
  });

  it('serves the cached rendition afterwards, with range support', async () => {
    const before = wavRenditionStats().runs;
    const part = await bytes('transcode', media.audio, { Range: 'bytes=0-43' });
    assert.equal(part.res.status, 206);
    assert.equal(part.data.length, 44);
    assert.equal(wavRenditionStats().runs, before);
  });

  it('makes a new rendition when the source changes and drops the old one', async () => {
    const [old] = cached();
    const later = new Date(statSync(media.audio).mtimeMs + 5000);
    utimesSync(media.audio, later, later);
    assert.equal((await bytes('transcode', media.audio)).res.status, 200);
    assert.equal(cached().length, 1);
    assert.notEqual(cached()[0], old);
  });

  it('streams files that need no rendition as they are', async () => {
    const { res, data } = await bytes('transcode', media.video);
    assert.equal(res.headers.get('content-type'), 'video/mp4');
    assert.equal(data.length, statSync(media.video).size);
  });

  it('answers 422 for audio it cannot decode and leaves nothing behind', async () => {
    const broken = join(box.project, 'broken.mp3');
    writeFileSync(broken, 'this is not audio');
    const before = cached();
    const res = await get('transcode', broken);
    assert.equal(res.status, 422);
    assert.ok(res.body.detail);
    assert.deepEqual(cached(), before);
  });

  refusals('transcode');
});
