/**
 * The cutout routes, through mounted routers: the status, a request that
 * becomes a `cutout` job in its own lane, everything that is refused before
 * a job exists, the description of a cutout, and cancelling.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cutoutRouter } from '../../src/api/cutout.js';
import { jobsRouter } from '../../src/api/jobs.js';
import * as kit from './kit.js';

describe('cutout routes', () => {
  let box;
  let api;
  let video;
  const get = (path) => kit.call(api.url, 'GET', `/api/${path}`);
  const post = (body) => kit.call(api.url, 'POST', '/api/cutout', body);
  const ask = (more = {}) =>
    post({ projectId: 'p1', path: video, start: 0.5, end: 1.5, fps: 30, ...more });
  const finished = (id) =>
    kit.until(async () => {
      const { body } = await get(`jobs/${id}`);
      return ['complete', 'error', 'cancelled'].includes(body.status) && body;
    }, 20_000);

  before(async () => {
    box = kit.cutoutSandbox('cutout-routes');
    kit.useFake(box);
    video = kit.numbered(join(box.project, 'n30.mp4'), { fps: 30, frames: 90 });
    kit.ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=64x64',
      '-frames:v',
      '1',
      join(box.project, 'still.png'),
    ]);
    kit.ffmpeg(['-f', 'lavfi', '-i', 'sine=duration=1', join(box.project, 'tone.mp3')]);
    writeFileSync(join(box.project, 'notes.mp4'), 'not a video');
    api = await kit.serve(cutoutRouter, jobsRouter);
  });
  after(async () => {
    await api.close();
    delete process.env.CUTOUT_COMMAND;
    delete process.env.CUTOUT_CONCURRENCY;
    assert.deepEqual(kit.debris(box.project), []);
    assert.deepEqual(kit.leftovers(box.root), []);
    box.cleanup();
  });

  it('GET /cutout/status says which matte program there is', async () => {
    const { status, body } = await get('cutout/status');
    const command = process.env.CUTOUT_COMMAND;
    assert.equal(status, 200);
    assert.deepEqual(body, {
      ...{ available: true, provider: 'command', model: `command:${command}`, reason: '' },
      ...{ detail: `CUTOUT_COMMAND: ${command}`, python: '', file: '', command },
    });
    assert.equal((await get('cutout/status?fresh')).body.available, true);
  });

  it('refuses what cannot be cut out before a job exists', async () => {
    const refused = async (body, status, error, field) => {
      const answer = await post(body);
      assert.equal(answer.status, status, `${JSON.stringify(body)} → ${answer.text}`);
      assert.match(answer.body.error, error);
      if (field) assert.ok(answer.body.fields[field], `names ${field}: ${answer.text}`);
    };
    const good = { projectId: 'p1', path: video, start: 0, end: 1 };
    await refused({}, 400, /^projectId required$/);
    await refused({ ...good, projectId: 'nope' }, 404, /^Project not found$/);
    await refused({ ...good, path: undefined }, 400, /^path required$/);
    await refused({ ...good, path: join(box.outside, 'secret.txt') }, 403, /outside the allowed/);
    await refused({ ...good, path: join(box.project, 'gone.mp4') }, 404, /^File not found$/);
    await refused({ ...good, path: 'still.png' }, 422, /^Invalid path$/, 'path');
    await refused({ ...good, path: 'tone.mp3' }, 422, /^Invalid path$/, 'path');
    await refused({ ...good, path: 'notes.mp4' }, 422, /^Invalid path$/, 'path');
    await refused({ ...good, start: -1 }, 422, /^Invalid start$/, 'start');
    await refused({ ...good, start: '0' }, 422, /^Invalid start$/, 'start');
    await refused({ ...good, end: 0 }, 422, /^Invalid end$/, 'end');
    await refused({ ...good, end: undefined }, 422, /^Invalid end$/, 'end');
    await refused({ ...good, end: 1801 }, 422, /^Invalid end$/, 'end');
    await refused({ ...good, start: 3, end: 4 }, 422, /^Invalid start$/, 'start');
    await refused({ ...good, fps: 0 }, 422, /^Invalid fps$/, 'fps');
    await refused({ ...good, fps: 1000 }, 422, /^Invalid fps$/, 'fps');
    const command = process.env.CUTOUT_COMMAND;
    process.env.CUTOUT_COMMAND = join(box.root, 'no-such-program');
    await refused(good, 503, /^CUTOUT_COMMAND cannot be started/);
    process.env.CUTOUT_COMMAND = command;
    assert.equal((await get('jobs?projectId=p1')).body.total, 0, 'no job was made');
  });

  it('POST /cutout starts a cutout job and its result says where the file is', async () => {
    const started = await ask();
    assert.equal(started.status, 202, started.text);
    const job = await finished(started.body.jobId);
    assert.deepEqual(
      [job.type, job.status, job.label, job.projectId, job.progress, job.error],
      ['cutout', 'complete', 'Cut out: n30.mp4', 'p1', 100, ''],
    );
    const { body: result } = await get(`jobs/${job.id}/result`);
    assert.match(result.key, /^[0-9a-f]{20}$/);
    assert.deepEqual(result, {
      ...{ file: join(box.cutouts, `${result.key}.mp4`), source: video },
      ...{ key: result.key, start: 0.5, end: 1.5, width: 320, height: 180, frames: 30, fps: 30 },
      cached: false,
    });
    assert.deepEqual(job.result, result, 'small enough to travel in the summary');
    assert.ok(existsSync(result.file));
    assert.match(job.log.join('\n'), /frame \d+ of 30\n.*Cut out .*\.mp4$/);

    const again = await finished((await ask({ path: 'n30.mp4', fps: undefined })).body.jobId);
    assert.deepEqual(again.result, { ...result, cached: true }, 'a path in the project; 30 fps');
    assert.match(again.log.at(-1), /^Already cut out: /);
  });

  it('GET /cutout/meta gives the description of a cutout', async () => {
    const { result } = await finished((await ask()).body.jobId);
    const { status, body } = await get(`cutout/meta?projectId=p1&key=${result.key}`);
    assert.equal(status, 200);
    assert.deepEqual(
      [body.version, body.key, body.source.path, body.start, body.end, body.frames, body.fps],
      [1, result.key, video, 0.5, 1.5, 30, 30],
    );
    assert.deepEqual(
      [body.width, body.height, body.model],
      [320, 180, `command:${process.env.CUTOUT_COMMAND}`],
    );
    assert.equal((await get('cutout/meta?projectId=p1&key=../x')).status, 400);
    assert.equal((await get(`cutout/meta?projectId=nope&key=${result.key}`)).status, 404);
    assert.equal((await get(`cutout/meta?projectId=p1&key=${'0'.repeat(20)}`)).status, 404);
  });

  it('runs cutout jobs in a lane of their own, and cancelling one leaves nothing', async () => {
    process.env.CUTOUT_CONCURRENCY = '1';
    kit.useFake(box, '--delay 40');
    const first = (await ask({ start: 1, end: 3 })).body.jobId;
    const second = (await ask({ start: 0, end: 0.4 })).body.jobId;
    const running = await kit.until(async () => {
      const { body } = await get(`jobs/${first}`);
      return body.progress > 3 && body;
    });
    assert.equal(running.status, 'running');
    assert.match(running.log.at(-1), /^frame \d+ of 60$/);
    assert.equal((await get(`jobs/${second}`)).body.status, 'queued', 'one at a time');
    if (kit.canList)
      assert.equal(kit.leftovers(box.root).length, 3, 'two FFmpegs and the matte program');

    assert.equal((await kit.call(api.url, 'DELETE', `/api/jobs/${first}`)).status, 204);
    assert.equal((await finished(first)).status, 'cancelled');
    const done = await finished(second);
    assert.deepEqual([done.status, done.result.frames], ['complete', 12], 'the next one runs');
    assert.deepEqual(await kit.until(() => kit.leftovers(box.root).length === 0 && []), []);
    assert.deepEqual(kit.debris(box.project), [], 'the cancelled one left no partial file');
  });
});
