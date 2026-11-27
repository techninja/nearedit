import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { jobsRouter } from '../../src/api/jobs.js';
import { runJob } from '../../src/api/lib/jobRunner.js';
import { wavRenditionStats } from '../../src/api/media/wavRendition.js';
import { previewsRouter } from '../../src/api/previews.js';
import { createPeakReducer, peakWindow } from '../../src/api/previews/peaks.js';
import { projectsRouter } from '../../src/api/projects.js';
import { attachWebSocket } from '../../src/api/ws.js';
import { call, createSandbox, makeMedia, q, serve } from './helpers.js';

let box;
let api;
let media;
let socket;
/** @type {object[]} Every job_update received over the WebSocket */
const updates = [];
const waveform = (path) => call(api.url, 'GET', `/api/previews/waveform${q(path)}`);
const previewFiles = () => readdirSync(join(box.data, 'previews'));

/** Resolve with the first job_update (past or future) that matches. */
function jobUpdate(matches, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const found = updates.find(matches);
      if (found) return resolve(found);
      if (Date.now() - started > timeoutMs) return reject(new Error('no matching job_update'));
      setTimeout(poll, 20);
    };
    poll();
  });
}

before(async () => {
  box = createSandbox('waveform');
  media = makeMedia(box.project);
  api = await serve(projectsRouter, previewsRouter, jobsRouter);
  attachWebSocket(api.server);
  await call(api.url, 'POST', '/api/projects', { name: 'Park', path: box.project });
  socket = new WebSocket(`${api.url.replace('http', 'ws')}/ws`);
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === 'job_update') updates.push(message.job);
  });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
});
after(async () => {
  socket?.terminate();
  await api?.close();
  box?.cleanup();
});

describe('GET /previews/waveform', () => {
  it('answers 202 while generating, then 200 once the job completes over the WebSocket', async () => {
    const first = await waveform(media.video);
    assert.equal(first.status, 202);
    assert.equal(first.body.status, 'generating');
    assert.ok(first.body.jobId);

    const done = await jobUpdate((job) => job.id === first.body.jobId && job.status === 'complete');
    assert.equal(done.type, 'waveform');
    assert.equal(done.result.path, media.video, 'clients match the job to the file by path');
    assert.equal(done.progress, 100);
    const seen = updates.filter((job) => job.id === first.body.jobId).map((job) => job.status);
    assert.deepEqual([...new Set(seen)], ['queued', 'running', 'complete']);

    const ready = await waveform(media.video);
    assert.equal(ready.status, 200);
    const { peaks, samples, duration, peaksPerSecond } = ready.body;
    assert.equal(peaks.length, samples);
    assert.equal(samples, done.result.samples);
    assert.ok(Math.abs(duration - 2.5) < 0.1, `duration ${duration}`);
    assert.equal(peaksPerSecond, 100);
    assert.ok(Math.abs(samples - duration * peaksPerSecond) <= 1);
    assert.ok(peaks.every((peak) => peak >= 0 && peak <= 1));
    // a 440 Hz sine at ffmpeg's default 1/8 amplitude
    assert.ok(Math.max(...peaks) > 0.05 && Math.max(...peaks) < 0.3, `peak ${Math.max(...peaks)}`);
  });

  it('exposes the finished job through the jobs routes', async () => {
    const job = updates.find((entry) => entry.status === 'complete');
    const summary = await call(api.url, 'GET', `/api/jobs/${job.id}`);
    assert.equal(summary.body.result.path, media.video);
    const result = await call(api.url, 'GET', `/api/jobs/${job.id}/result`);
    assert.deepEqual(Object.keys(result.body).sort(), ['duration', 'path', 'samples']);
  });

  it('starts one job for concurrent requests for the same file', async () => {
    const before = wavRenditionStats().runs;
    const answers = await Promise.all([1, 2, 3, 4].map(() => waveform(media.audio)));
    assert.deepEqual(
      answers.map((res) => res.status),
      [202, 202, 202, 202],
    );
    assert.equal(new Set(answers.map((res) => res.body.jobId)).size, 1);
    const { jobId } = answers[0].body;
    await jobUpdate((job) => job.id === jobId && job.status === 'complete');
    const started = updates.filter(
      (job) => job.status === 'queued' && job.label.includes('tone.mp3'),
    );
    assert.equal(started.length, 1);
    // Compressed audio is measured from the WAV rendition the audio engine plays.
    assert.equal(wavRenditionStats().runs - before, 1);
    assert.equal(readdirSync(join(box.data, 'transcode')).length, 1);
  });

  it('matches the length of the WAV rendition, so peaks line up with playback', async () => {
    const [wav] = readdirSync(join(box.data, 'transcode'));
    const probed = execFileSync('ffprobe', [
      ...['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0'],
      join(box.data, 'transcode', wav),
    ]);
    const { duration, peaks } = (await waveform(media.audio)).body;
    assert.ok(Math.abs(duration - parseFloat(probed.toString())) < 0.001);
    assert.ok(Math.max(...peaks) > 0.05);
  });

  it('caches peaks on disk and leaves no temp files', async () => {
    const files = previewFiles();
    assert.equal(files.filter((name) => name.startsWith('wave_')).length, 2);
    assert.deepEqual(
      files.filter((name) => name.includes('.part-')),
      [],
    );
    const before = updates.length;
    assert.equal((await waveform(media.video)).status, 200);
    assert.equal(updates.length, before, 'a cached waveform starts no job');
  });

  it('regenerates after the source file changes', async () => {
    const later = new Date(statSync(media.video).mtimeMs + 5000);
    utimesSync(media.video, later, later);
    const res = await waveform(media.video);
    assert.equal(res.status, 202, 'the cache key includes the source mtime');
    await jobUpdate((job) => job.id === res.body.jobId && job.status === 'complete');
    assert.equal((await waveform(media.video)).status, 200);
    assert.equal(previewFiles().filter((name) => name.startsWith('wave_')).length, 2);
  });

  it('answers an empty waveform for a file without audio, with no job', async () => {
    const silent = join(box.project, 'silent.mp4');
    const source = ['-f', 'lavfi', '-i', 'color=c=blue:size=64x64:rate=10:duration=1'];
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...source, '-pix_fmt', 'yuv420p', silent]);
    const res = await waveform(silent);
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.peaks, res.body.samples], [[], 0]);
  });

  /** Occupy both slots of the default job lane so new jobs wait in the queue. */
  const holdLane = () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    for (let i = 0; i < 2; i++) runJob('index', {}, { label: 'lane blocker' }, () => gate);
    return release;
  };
  /** A copy of the video with a whole-second mtime that later writes can restore exactly. */
  const copyWithFixedMtime = (name) => {
    const file = join(box.project, name);
    copyFileSync(media.video, file);
    const stamp = new Date(Math.floor(Date.now() / 1000) * 1000 - 60000);
    utimesSync(file, stamp, stamp);
    return { file, stamp };
  };

  it('fails the job for undecodable audio, then answers 422 without retrying', async () => {
    const { file, stamp } = copyWithFixedMtime('victim.mp4');
    const release = holdLane();
    const first = await waveform(file);
    assert.equal(first.status, 202);
    // Same size and mtime, so the same cache key — but no longer decodable.
    writeFileSync(file, Buffer.alloc(statSync(file).size, 7));
    utimesSync(file, stamp, stamp);
    release();
    const failed = await jobUpdate((job) => job.id === first.body.jobId && job.status === 'error');
    assert.ok(failed.error);

    const before = updates.length;
    const second = await waveform(file);
    assert.equal(second.status, 422);
    assert.ok(second.body.detail);
    assert.equal(updates.length, before, 'no new job for a file known to fail');
    assert.deepEqual(
      previewFiles().filter((name) => name.includes('.part-')),
      [],
    );
  });

  it('starts a fresh job after one was cancelled while still queued', async () => {
    const { file } = copyWithFixedMtime('queued.mp4');
    const release = holdLane();
    const first = await waveform(file);
    assert.equal((await call(api.url, 'DELETE', `/api/jobs/${first.body.jobId}`)).status, 204);
    const second = await waveform(file);
    assert.equal(second.status, 202);
    assert.notEqual(second.body.jobId, first.body.jobId);
    release();
    await jobUpdate((job) => job.id === second.body.jobId && job.status === 'complete');
    assert.equal((await waveform(file)).status, 200);
  });

  it('answers 422 for a file that is not media at all', async () => {
    const junk = join(box.project, 'junk.wav');
    writeFileSync(junk, 'not audio');
    assert.equal((await waveform(junk)).status, 422);
  });
});

describe('peak reduction', () => {
  const pcm = (...values) => {
    const buffer = Buffer.alloc(values.length * 2);
    values.forEach((value, index) => buffer.writeInt16LE(value, index * 2));
    return buffer;
  };

  it('takes the loudest sample of each window, whatever the chunk boundaries', () => {
    const whole = pcm(100, -16384, 50, 8192, -32768, 0, 300);
    for (const cut of [1, 2, 3, 5, 7, 13]) {
      const reducer = createPeakReducer(2);
      reducer.push(whole.subarray(0, cut));
      reducer.push(whole.subarray(cut));
      assert.deepEqual(reducer.finish(), [0.5, 0.25, 1, 0.009], `cut at byte ${cut}`);
      assert.equal(reducer.samples(), 7);
    }
  });

  it('uses finer windows for short clips and stays under the peak limit for long ones', () => {
    assert.equal(peakWindow(10), 441);
    assert.equal(peakWindow(120), 882);
    assert.equal(peakWindow(1800), 1470);
    const threeHours = 3 * 3600;
    assert.ok((threeHours * 44100) / peakWindow(threeHours) <= 100000);
  });
});
