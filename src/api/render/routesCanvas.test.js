import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import express from 'express';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cancelJob, getJob } from '../lib/jobs.js';
import { renderRouter } from '../render.js';
import * as kit from './testkit.js';

/** The render routes for documents that need the compositor. */

const { createClip, createEdl, createTrack } = kit;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('render: routes with the canvas path', () => {
  const tmp = kit.scratch();
  const media = join(tmp.dir, 'media');
  const renders = join(tmp.dir, 'data', 'renders');
  const env = { ...process.env };
  let server;
  let base;

  const clip = (name, start, end, more = {}) =>
    createClip({ sourceFile: join(media, name), timelineStart: start, timelineEnd: end, ...more });
  const title = (start, end) =>
    createClip({
      timelineStart: start,
      timelineEnd: end,
      text: { content: 'Title', fontSize: 40 },
    });
  const generator = (start, end, type = 'gradient', params = {}) =>
    createClip({ timelineStart: start, timelineEnd: end, generator: { type, params } });
  const edl = (tracks, more = {}) =>
    createEdl({
      resolution: '320x180',
      tracks: tracks.map((clips) => createTrack('video', { clips })),
      ...more,
    });
  /** Footage for 8 s; a title over seconds 2-4; a generator in place of seconds 6-8. */
  const mixed = () => edl([[title(2, 4)], [clip('busy.mp4', 0, 6), generator(6, 8)]]);
  const post = (path, body) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const finished = async (jobId) => {
    for (let i = 0; i < 1200; i++) {
      const job = getJob(jobId);
      if (['complete', 'error', 'cancelled'].includes(job.status)) return job;
      await sleep(50);
    }
    throw new Error('job did not finish');
  };
  const leftovers = () => readdirSync(renders).filter((name) => name.startsWith('.work-'));
  const strays = () =>
    execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.startsWith('ffmpeg') && line.includes(tmp.dir));

  before(async () => {
    process.env.NEAREDIT_DATA_DIR = join(tmp.dir, 'data');
    process.env.NEAREDIT_MEDIA_DIR = media;
    process.env.GLOBAL_MEDIA_PATHS = '';
    delete process.env.RENDER_ENGINE;
    for (const dir of [media, renders, join(tmp.dir, 'outside')])
      mkdirSync(dir, { recursive: true });
    const sources = ['testsrc2=s=640x360:r=30:d=30', 'aevalsrc=0.4*sin(2*PI*330*t):s=48000:d=30'];
    await kit.generate(join(media, 'busy.mp4'), sources, ['-c:a', 'aac']);
    await kit.generate(join(media, 'spark.png'), ['color=white:s=16x16'], ['-frames:v', '1']);
    await kit.generate(
      join(tmp.dir, 'outside', 'secret.png'),
      ['color=red:s=16x16'],
      ['-frames:v', '1'],
    );
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

  it('says in the plan which renderer each segment takes', async () => {
    const res = await post('/render/plan', { edl: mixed(), preset: 'draft' });
    const plan = await res.json();
    assert.equal(res.status, 200, JSON.stringify(plan));
    assert.equal(plan.engine, 'auto');
    assert.deepEqual(
      plan.segments.map((s) => [s.start, s.end, s.frames, s.engine, s.reasons]),
      [
        [0, 2, 60, 'ffmpeg', []],
        [2, 4, 60, 'canvas', ['title']],
        [4, 6, 60, 'ffmpeg', []],
        [6, 8, 60, 'canvas', ['generator']],
      ],
    );
    assert.deepEqual([plan.duration, plan.width, plan.height, plan.fps], [8, 160, 90, 30]);
    // The pass it shows is the one that finishes the render: join and mix.
    assert.ok(plan.args.includes('concat') && plan.args.includes('copy'));
    assert.match(
      plan.files[0].content,
      /file segment-00000\.mp4\nduration 2\nfile segment-00001\.mp4/,
    );
    assert.deepEqual(readdirSync(renders), [], 'nothing was rendered or left behind');

    const voice = clip('busy.mp4', 0, 4, {
      keyframes: {
        volume: [
          { t: 0, v: 0 },
          { t: 4, v: 1 },
        ],
      },
    });
    const ducked = createEdl({
      tracks: [
        createTrack('video', { clips: [clip('busy.mp4', 0, 4)] }),
        createTrack('audio', { clips: [voice] }),
      ],
    });
    const single = await (await post('/render/plan', { edl: ducked })).json();
    assert.deepEqual(
      single.segments.map((s) => s.engine),
      ['ffmpeg'],
    );
    const envelope = single.files.find((f) => f.path.endsWith('.f32'));
    assert.match(envelope.content, /^<\d+ bytes>$/, 'a control track is described, not sent');
  });

  it('renders a mixed timeline as a job and lists the result', async () => {
    const { jobId } = await (await post('/render', { edl: mixed(), filename: 'Mixed' })).json();
    let seen = 0;
    for (let i = 0; i < 600 && !['complete', 'error'].includes(getJob(jobId).status); i++) {
      seen = Math.max(seen, getJob(jobId).progress);
      await sleep(25);
    }
    const job = await finished(jobId);
    assert.equal(job.status, 'complete', job.error);
    assert.ok(seen > 0 && seen < 100, `progress was reported on the way: ${seen}`);
    assert.match(
      job.log.join('\n'),
      /Encoding 240 frames in 4 segments, 2 drawn by the compositor/,
    );
    const { result } = job;
    assert.deepEqual(
      [result.file, result.duration, result.width, result.height, result.fps],
      ['Mixed.mp4', 8, 320, 180, 30],
    );
    const info = await kit.inspect(result.output);
    assert.equal(Number(info.video.nb_read_frames), 240);
    assert.equal(info.video.codec_name, 'h264');
    assert.equal(info.audio.codec_name, 'aac');
    assert.ok(Math.abs(info.duration - 8) < 0.05);
    const frames = await kit.readFrames(result.output, 320, 180);
    const lit = (n) => frames.at(n, 160, 90).reduce((sum, v) => sum + v, 0);
    assert.ok(
      lit(30) > 100 && lit(90) > 100 && lit(210) > 100,
      'footage, title and generator all drew',
    );
    const listed = await (await fetch(`${base}/renders`)).json();
    assert.equal(listed.data[0].file, 'Mixed.mp4');
    assert.equal(listed.data[0].duration, 8);
    assert.deepEqual(leftovers(), [], 'work directory removed after success');
    assert.equal((await fetch(`${base}/render/file/Mixed.mp4`, { method: 'DELETE' })).status, 204);
  });

  it('checks image parameters against the allow-list like any source file', async () => {
    const sparks = (image) => edl([[generator(0, 1, 'particles', { sprite: 'image', image })]]);
    const outside = await post('/render/plan', {
      edl: sparks(join(tmp.dir, 'outside', 'secret.png')),
    });
    assert.equal(outside.status, 403);
    assert.match((await outside.json()).error, /outside the allowed media folders/);
    assert.equal((await post('/render', { edl: sparks('/etc/hostname') })).status, 403);
    const missing = await post('/render', { edl: sparks(join(media, 'nope.png')) });
    assert.equal(missing.status, 422);
    assert.match((await missing.json()).error, /Source file not found: .*nope\.png/);
    const blurred = clip('busy.mp4', 0, 1);
    blurred.effects = [{ effectId: 'fx', type: 'blur', enabled: true, params: {} }];
    const fine = await post('/render/plan', {
      edl: edl([
        [generator(0, 1, 'particles', { sprite: 'image', image: 'spark.png' })],
        [blurred],
      ]),
    });
    assert.equal(fine.status, 200, 'a relative sprite resolves against the media folder');
    assert.deepEqual((await fine.json()).segments[0].reasons.sort(), ['effect', 'generator']);
  });

  it('refuses at once what RENDER_ENGINE=ffmpeg cannot draw', async () => {
    process.env.RENDER_ENGINE = 'ffmpeg';
    try {
      for (const path of ['/render', '/render/plan']) {
        const res = await post(path, { edl: mixed() });
        assert.equal(res.status, 422, path);
        assert.match(
          (await res.json()).error,
          /RENDER_ENGINE=ffmpeg cannot render this timeline: it has a title, a generator clip/,
        );
      }
      const plain = await post('/render/plan', { edl: edl([[clip('busy.mp4', 0, 1)]]) });
      assert.equal((await plain.json()).engine, 'ffmpeg');
      process.env.RENDER_ENGINE = 'opengl';
      const res = await post('/render', { edl: mixed() });
      assert.equal(res.status, 500);
      assert.match((await res.json()).error, /RENDER_ENGINE must be auto, canvas or ffmpeg/);
    } finally {
      delete process.env.RENDER_ENGINE;
    }
    assert.deepEqual(readdirSync(renders), []);
  });

  it('cancels a canvas render: workers and FFmpeg stop, nothing is left', async () => {
    const long = edl([[title(0, 30)], [clip('busy.mp4', 0, 30)]], { resolution: '1280x720' });
    const { jobId } = await (await post('/render', { edl: long, preset: 'high' })).json();
    for (let i = 0; i < 600 && getJob(jobId).progress < 3; i++) await sleep(50);
    assert.equal(getJob(jobId).status, 'running');
    assert.equal(leftovers().length, 1, 'a work directory exists while rendering');
    assert.ok(cancelJob(jobId));
    for (let i = 0; i < 100 && (leftovers().length || strays().length); i++) await sleep(50);
    assert.equal(getJob(jobId).status, 'cancelled');
    assert.deepEqual(leftovers(), [], 'segments and temp files are removed');
    assert.deepEqual(strays(), [], 'no FFmpeg keeps running');
    assert.deepEqual(
      readdirSync(renders).filter((name) => name.endsWith('.mp4')),
      [],
    );
  });
});
