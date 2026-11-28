import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getJob } from '../lib/jobs.js';
import { writeSidecar } from '../lib/sidecar.js';
import { renderRouter } from '../render.js';
import { renderStill } from './canvas/still.js';
import { prepareRender } from './prepare.js';
import * as kit from './testkit.js';

/** Captions through the render routes: routing, pixels, frame accuracy, subtitle files. */

const { createClip, createEdl, createTrack } = kit;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const [W, H, FPS] = [320, 180, 30];
/** A word every 0.7 s from 1.05 s — between two frames — for 10 s of speech. */
const WORDS = 'one two three four five six seven eight nine ten eleven twelve thirteen'
  .split(' ')
  .map((word, i) => ({ word, start: 1.05 + i * 0.7, end: 1.5 + i * 0.7 }));

describe('render: captions', () => {
  const tmp = kit.scratch();
  const media = join(tmp.dir, 'media');
  const renders = join(tmp.dir, 'data', 'renders');
  const env = { ...process.env };
  const talk = join(media, 'talk.mp4');
  const mute = join(media, 'mute.mp4');
  let server;
  let base;

  /** The talk's picture on a video track, linked to its sound, captions on. */
  const spoken = (file = talk, length = 10, more = {}) => {
    const span = { sourceFile: file, timelineStart: 0, timelineEnd: length };
    const picture = createClip({ clipId: 'pic', ...span, linkedClipId: 'snd' });
    const sound = createClip({ clipId: 'snd', ...span, linkedClipId: 'pic', captions: { on: true } });
    const tracks = [createTrack('video', { clips: [picture] }), createTrack('audio', { clips: [sound] })];
    return createEdl({ resolution: `${W}x${H}`, fps: FPS, tracks, ...more });
  };
  const post = (path, body) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const rendered = async (body) => {
    const res = await post('/render', body);
    const started = await res.json();
    assert.equal(res.status, 202, JSON.stringify(started));
    for (let i = 0; i < 2400; i++) {
      const job = getJob(started.jobId);
      if (['complete', 'error', 'cancelled'].includes(job.status)) return job;
      await sleep(50);
    }
    throw new Error('job did not finish');
  };
  /**
   * Letters are the only bright thing over the dark footage (its green is
   * 42 of 255): count the pixels brighter than a level.
   */
  const lit = (frames, n, level = 150) => {
    let count = 0;
    for (let y = 100; y < H; y++) {
      for (let x = 0; x < W; x++) if (frames.at(n, x, y)[1] > level) count++;
    }
    return count;
  };

  before(async () => {
    process.env.NEAREDIT_DATA_DIR = join(tmp.dir, 'data');
    process.env.NEAREDIT_MEDIA_DIR = media;
    process.env.GLOBAL_MEDIA_PATHS = '';
    delete process.env.RENDER_ENGINE;
    for (const dir of [media, renders]) mkdirSync(dir, { recursive: true });
    const sources = [`color=c=0x1c2a44:s=${W}x${H}:r=${FPS}:d=12`, 'sine=f=330:r=48000:d=12'];
    for (const file of [talk, mute]) await kit.generate(file, sources, ['-c:a', 'aac']);
    writeSidecar(talk, { transcript: WORDS, segments: [], language: 'en' });
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

  it('sends a captioned stretch to the compositor, and says why', async () => {
    const res = await post('/render/plan', { edl: spoken(), preset: 'standard' });
    const plan = await res.json();
    assert.equal(res.status, 200, JSON.stringify(plan));
    assert.deepEqual(
      plan.segments.map((s) => [s.start, s.end, s.engine, s.reasons]),
      [
        [0, 4, 'canvas', ['captions']],
        [4, 8, 'canvas', ['captions']],
        [8, 10, 'canvas', ['captions']],
      ],
    );
    const off = spoken();
    off.tracks[1].clips[0].captions = { on: false };
    const plain = await (await post('/render/plan', { edl: off })).json();
    assert.deepEqual(plain.segments.map((s) => s.engine), ['ffmpeg']);
  });

  it('refuses a subtitle format it does not write', async () => {
    const res = await post('/render', { edl: spoken(), subtitles: 'ass' });
    assert.equal(res.status, 422);
    assert.deepEqual((await res.json()).fields, { subtitles: 'Must be one of: srt, vtt' });
  });

  it('renders the captions the compositor draws, from the frame each word starts on', async () => {
    const edl = spoken();
    const job = await rendered({ edl, filename: 'spoken', subtitles: 'srt' });
    assert.equal(job.status, 'complete', job.error);
    const { result } = job;
    assert.deepEqual(result.warnings, []);
    assert.ok(job.log.some((line) => /3 segments, 3 drawn by the compositor/.test(line.message ?? line)));
    const frames = await kit.readFrames(result.output, W, H);
    assert.equal(frames.count, 300);
    // "one" starts at 1.05 s — between frames 31 and 32: on screen from frame 32.
    assert.equal(lit(frames, 30), 0, 'nothing before the first word');
    assert.equal(lit(frames, 31), 0, 'the frame before the word');
    assert.ok(lit(frames, 32) > 40, `the frame of the word: ${lit(frames, 32)} lit pixels`);
    // "eight" starts at 5.95 s, in the second chunk — drawn by another worker pass.
    assert.ok(lit(frames, Math.ceil(5.95 * FPS)) > 40, 'captions in every chunk');
    // The same instants from the compositor itself: the frame the render shows.
    const { probes, words } = await prepareRender(edl);
    for (const n of [32, 60, 179, 250]) {
      const still = await renderStill(edl, n / FPS, { probes, words });
      const drawn = still.canvas.getContext('2d').getImageData(0, 0, W, H).data;
      let sum = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const video = frames.at(n, x, y);
          for (let c = 0; c < 3; c++) sum += Math.abs(video[c] - drawn[(y * W + x) * 4 + c]);
        }
      }
      const mean = sum / (W * H * 3);
      assert.ok(mean < 3, `frame ${n} is ${mean.toFixed(2)} levels from the compositor's`);
    }
  });

  it('saves the subtitle file beside the video, names it in the result and serves it', async () => {
    const job = await rendered({ edl: spoken(), filename: 'subbed', subtitles: 'vtt' });
    const { subtitles, file } = job.result;
    assert.deepEqual(subtitles, { file: 'subbed.vtt', url: '/api/render/file/subbed.vtt', format: 'vtt', cues: 2 });
    assert.equal(file, 'subbed.mp4');
    const text = readFileSync(join(renders, 'subbed.vtt'), 'utf8');
    const cues = [
      '00:00:01.050 --> 00:00:05.950\none two three four five six seven\n',
      '00:00:05.950 --> 00:00:10.000\neight nine ten eleven twelve thirteen\n',
    ];
    assert.equal(text, `WEBVTT\n\n${cues.join('\n')}`);
    const served = await fetch(`${base}/render/file/subbed.vtt`);
    assert.equal(served.status, 200);
    assert.equal(await served.text(), text);
    const listed = (await (await fetch(`${base}/renders`)).json()).data.find((r) => r.file === file);
    assert.deepEqual(listed.subtitles, subtitles);
    const gone = await fetch(`${base}/render/file/subbed.mp4`, { method: 'DELETE' });
    assert.equal(gone.status, 204);
    assert.equal(existsSync(join(renders, 'subbed.vtt')), false, 'deleted with its video');
  });

  it('times the subtitles of a range render from the start of the range', async () => {
    const job = await rendered({ edl: spoken(), filename: 'part', subtitles: 'srt', range: { start: 2, end: 5 } });
    const text = readFileSync(join(renders, job.result.subtitles.file), 'utf8');
    assert.match(text, /^1\n00:00:00,000 --> 00:00:03,000\n/);
    assert.equal(job.result.duration, 3);
  });

  it('renders a captioned clip without words as plain footage, with a warning', async () => {
    const job = await rendered({ edl: spoken(mute, 4), filename: 'wordless', subtitles: 'srt' });
    assert.equal(job.status, 'complete', job.error);
    assert.equal(job.result.warnings.length, 2);
    assert.match(job.result.warnings[0], /mute\.mp4, which has no transcript.*without captions/);
    assert.match(job.result.warnings[1], /Subtitles were asked for, but no clip/);
    assert.equal(job.result.subtitles, undefined);
    assert.ok(job.log.some((line) => /^Warning: Captions are on for/.test(line.message ?? line)));
    assert.ok(!job.log.some((line) => /drawn by the compositor/.test(line.message ?? line)));
    assert.equal(existsSync(join(renders, 'wordless.srt')), false);
    const frames = await kit.readFrames(job.result.output, W, H);
    assert.equal(frames.count, 120);
    assert.equal(lit(frames, 60), 0);
  });

  it('draws the words written on a clip that has no transcript', async () => {
    const edl = spoken(mute, 4);
    edl.tracks[1].clips[0].captions = { on: true, words: [[1, 3, 'written']] };
    const job = await rendered({ edl, filename: 'own' });
    assert.deepEqual(job.result.warnings, []);
    const frames = await kit.readFrames(job.result.output, W, H);
    // The word starts on frame 30 exactly: there it arrives, small and faint;
    // two frames on it is whole.
    const counts = [lit(frames, 29, 70), lit(frames, 30, 70), lit(frames, 32)];
    assert.ok(counts[0] === 0 && counts[1] > 20 && counts[2] > 40, `lit pixels ${counts}`);
  });
});
