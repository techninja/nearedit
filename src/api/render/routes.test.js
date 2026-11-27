import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cancelJob, getJob } from '../lib/jobs.js';
import { renderRouter } from '../render.js';
import * as kit from './testkit.js';

const { createClip, createEdl, createTrack } = kit;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('render: routes and job', () => {
  const tmp = kit.scratch();
  const media = join(tmp.dir, 'media');
  const renders = join(tmp.dir, 'data', 'renders');
  const env = { ...process.env };
  let server;
  let base;

  const clip = (name, start, end, more = {}) =>
    createClip({
      ...{ sourceFile: join(media, name), sourceIn: 0, sourceOut: end - start },
      ...{ timelineStart: start, timelineEnd: end, ...more },
    });
  const edl = (clips, more = {}) =>
    createEdl({ resolution: '320x180', tracks: [createTrack('video', { clips })], ...more });
  const post = (path, body) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const finished = async (jobId) => {
    for (let i = 0; i < 600; i++) {
      const job = getJob(jobId);
      if (['complete', 'error', 'cancelled'].includes(job.status)) return job;
      await sleep(50);
    }
    throw new Error('job did not finish');
  };
  const leftovers = () => readdirSync(renders).filter((name) => name.startsWith('.work-'));
  const movies = () => readdirSync(renders).filter((name) => name.endsWith('.mp4'));

  before(async () => {
    process.env.NEAREDIT_DATA_DIR = join(tmp.dir, 'data');
    process.env.NEAREDIT_MEDIA_DIR = media;
    process.env.GLOBAL_MEDIA_PATHS = '';
    for (const dir of [media, renders, join(tmp.dir, 'outside'), join(tmp.dir, 'project', '.nearedit')])
      mkdirSync(dir, { recursive: true });
    await kit.generate(join(media, 'red.mp4'), ['color=red:s=320x180:r=30:d=2']);
    await kit.generate(join(media, 'busy.mp4'), ['testsrc2=s=640x360:r=30:d=4']);
    await kit.generate(join(tmp.dir, 'outside', 'secret.mp4'), ['color=blue:s=320x180:r=30:d=1']);
    writeFileSync(join(media, 'broken.mp4'), 'this is not a video');
    // A registered project whose saved adaptation can be rendered without posting an EDL.
    const saved = { id: 'a1', name: 'Main Edit', edl: edl([clip('red.mp4', 0, 1)]) };
    writeFileSync(
      join(tmp.dir, 'project', '.nearedit', 'project.json'),
      JSON.stringify({ name: 'Park', adaptations: [saved] }),
    );
    const registry = { p1: { path: join(tmp.dir, 'project'), name: 'Park' } };
    writeFileSync(join(tmp.dir, 'data', 'registry.json'), JSON.stringify(registry));
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api', renderRouter);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    process.env = env;
    tmp.cleanup();
  });

  it('lists the presets', async () => {
    const { data } = await (await fetch(`${base}/render/presets`)).json();
    assert.deepEqual(data.map((p) => p.id), ['draft', 'standard', 'high']);
    assert.ok(data.every((p) => p.label && p.description));
  });

  it('returns the plan without running it', async () => {
    const res = await post('/render/plan', { edl: edl([clip('red.mp4', 0, 2)]), preset: 'draft' });
    const plan = await res.json();
    assert.equal(res.status, 200);
    assert.equal(plan.duration, 2);
    assert.ok(plan.args.includes('-filter_complex') && plan.args.includes('libx264'));
    assert.match(plan.filterComplex, /color=c=black:s=160x90/);
    assert.equal(plan.inputs[0].file, join(media, 'red.mp4'));
    assert.deepEqual(readdirSync(renders), [], 'nothing was rendered or left behind');
  });

  it('renders as a job, then lists, streams and deletes the file', async () => {
    const body = { projectId: 'p1', adaptationId: 'a1', edl: edl([clip('red.mp4', 0, 2)]) };
    const res = await post('/render', { ...body, preset: 'draft', filename: 'My Cut' });
    assert.equal(res.status, 202);
    const job = await finished((await res.json()).jobId);
    assert.equal(job.status, 'complete', job.error);
    assert.equal(job.type, 'render');
    assert.equal(job.label, 'Render: Main Edit');
    const { result } = job;
    assert.equal(result.file, 'My Cut.mp4');
    assert.equal(result.output, join(renders, 'My Cut.mp4'));
    assert.equal(result.url, '/api/render/file/My%20Cut.mp4');
    assert.deepEqual(
      [result.duration, result.width, result.height, result.fps],
      [2, 160, 90, 30],
    );
    const info = await kit.inspect(result.output);
    assert.equal(Number(info.format?.size ?? result.size), result.size);
    assert.deepEqual(leftovers(), [], 'work directory removed after success');

    const again = await finished((await (await post('/render', { ...body, filename: 'My Cut' })).json()).jobId);
    assert.equal(again.result.file, 'My Cut-2.mp4', 'an existing render is never overwritten');

    const mine = await (await fetch(`${base}/renders?projectId=p1`)).json();
    assert.equal(mine.total, 2);
    const listed = mine.data.find((r) => r.file === 'My Cut.mp4');
    assert.equal(listed.url, result.url);
    assert.deepEqual([listed.projectId, listed.adaptationId, listed.preset], ['p1', 'a1', 'draft']);
    assert.ok(listed.size === result.size && listed.createdAt > 0 && listed.duration === 2);
    assert.equal((await (await fetch(`${base}/renders?projectId=other`)).json()).total, 0);

    const whole = await fetch(`http://127.0.0.1:${server.address().port}${result.url}`);
    assert.equal(whole.status, 200);
    assert.equal(whole.headers.get('content-type'), 'video/mp4');
    assert.equal((await whole.arrayBuffer()).byteLength, result.size);
    const part = await fetch(`${base}/render/file/My%20Cut.mp4`, { headers: { range: 'bytes=10-109' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 10-109/${result.size}`);
    assert.equal((await part.arrayBuffer()).byteLength, 100);
    const download = await fetch(`${base}/render/file/My%20Cut.mp4?download=1`);
    assert.match(download.headers.get('content-disposition'), /attachment; filename="My Cut.mp4"/);
    await download.arrayBuffer();

    for (const name of ['My%20Cut.mp4', 'My%20Cut-2.mp4'])
      assert.equal((await fetch(`${base}/render/file/${name}`, { method: 'DELETE' })).status, 204);
    assert.equal((await fetch(`${base}/render/file/My%20Cut.mp4`)).status, 404);
    assert.deepEqual(readdirSync(renders), [], 'file and record are both gone');
  });

  it('renders the saved EDL when none is posted', async () => {
    const res = await post('/render', { projectId: 'p1', adaptationId: 'a1', preset: 'draft' });
    const job = await finished((await res.json()).jobId);
    assert.equal(job.status, 'complete', job.error);
    assert.equal(job.result.duration, 1);
    assert.match(job.result.file, /^Main Edit-\d{8}-\d{6}\.mp4$/);
    assert.equal((await post('/render', { projectId: 'p1', adaptationId: 'nope' })).status, 404);
    assert.equal((await post('/render', {})).status, 400);
  });

  it('refuses bad requests with a clear status and message', async () => {
    const good = edl([clip('red.mp4', 0, 1)]);
    const cases = [
      [{ edl: edl([]) }, 422, /empty/i],
      [{ edl: edl([createClip({ timelineEnd: 2, placeholder: true })]) }, 422, /empty/i],
      [{ edl: good, preset: 'ultra' }, 422, /preset/],
      [{ edl: good, range: { start: 2, end: 1 } }, 422, /range/],
      [{ edl: good, range: { start: 5, end: 9 } }, 422, /outside the timeline/],
      [{ edl: good, filename: '../../evil' }, 422, /path separators/],
      [{ edl: edl([clip('missing.mp4', 0, 1)]) }, 422, /missing\.mp4/],
      [{ edl: { tracks: 'nope' } }, 422, /edl/],
      [{ edl: edl([clip('../outside/secret.mp4', 0, 1)]) }, 403, /outside the allowed/],
      [{ edl: edl([createClip({ sourceFile: '/etc/passwd', timelineEnd: 1 })]) }, 403, /allowed/],
    ];
    for (const [body, status, message] of cases) {
      for (const path of ['/render', '/render/plan']) {
        const res = await post(path, body);
        const text = JSON.stringify(await res.json());
        assert.equal(res.status, status, `${path} ${text}`);
        assert.match(text, message);
      }
    }
    // A muted track may point anywhere on disk — it is still refused.
    const hidden = createTrack('video', { muted: true, clips: [clip('../outside/secret.mp4', 0, 1)] });
    const sneaky = createEdl({ tracks: [createTrack('video', { clips: [clip('red.mp4', 0, 1)] }), hidden] });
    assert.equal((await post('/render', { edl: sneaky })).status, 403);
  });

  it('only serves and deletes plain render names', async () => {
    writeFileSync(join(renders, 'note.txt'), 'x');
    for (const name of ['..%2Fregistry.json', '..%2F..%2Fmedia%2Fred.mp4', 'note.txt', '.hidden.mp4']) {
      assert.equal((await fetch(`${base}/render/file/${name}`)).status, 400, name);
      const del = await fetch(`${base}/render/file/${name}`, { method: 'DELETE' });
      assert.equal(del.status, 400, name);
    }
    assert.equal((await fetch(`${base}/render/file/nothing.mp4`)).status, 404);
    assert.ok(existsSync(join(tmp.dir, 'data', 'registry.json')) && existsSync(join(renders, 'note.txt')));
  });

  it('reports progress, and cancelling kills FFmpeg and removes the partial file', async () => {
    const before = movies().length;
    const clips = Array.from({ length: 15 }, (_, i) => clip('busy.mp4', i * 4, i * 4 + 4));
    const long = createEdl({ resolution: '1280x720', tracks: [createTrack('video', { clips })] });
    const { jobId } = await (await post('/render', { edl: long, preset: 'high' })).json();
    for (let i = 0; i < 400 && getJob(jobId).progress < 2; i++) await sleep(50);
    const job = getJob(jobId);
    assert.equal(job.status, 'running');
    assert.ok(job.progress >= 2 && job.progress < 100, `progress ${job.progress}`);
    assert.equal(leftovers().length, 1, 'a work directory exists while rendering');
    assert.ok(existsSync(join(renders, leftovers()[0], 'output.mp4')), 'partial output exists');
    assert.ok(cancelJob(jobId));
    for (let i = 0; i < 100 && leftovers().length; i++) await sleep(50);
    assert.equal(getJob(jobId).status, 'cancelled');
    assert.deepEqual(leftovers(), [], 'partial file and temp files are removed');
    assert.equal(movies().length, before, 'no render was published');
  });

  it('fails the job with the file name when a source cannot be decoded', async () => {
    const { jobId } = await (await post('/render', { edl: edl([clip('broken.mp4', 0, 1)]) })).json();
    const job = await finished(jobId);
    assert.equal(job.status, 'error');
    assert.match(job.error, /Cannot read source file: .*broken\.mp4/);
    assert.deepEqual(leftovers(), [], 'temp files are removed after a failure');
  });
});
