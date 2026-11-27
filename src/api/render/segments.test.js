import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '../lib/ffmpeg.js';
import { getCapabilities } from './capabilities.js';
import { buildMuxPlan } from './mux.js';
import { encodeTimeline } from './passes.js';
import { probeSources } from './probe.js';
import { renderSources } from './scope.js';
import { planSegments, renderSegments } from './segments.js';
import * as kit from './testkit.js';
import { createTiming, snapTrack } from './timing.js';

const { createClip, createEdl, createTrack } = kit;

describe('planSegments', () => {
  const plan = (clips, limits, range) => {
    const edl = createEdl({ tracks: [createTrack('video', { clips })] });
    const timing = createTiming(edl, range);
    const tracks = edl.tracks.map((track) => snapTrack(track, timing));
    return planSegments(tracks, timing, limits).map((s) => [s.start, s.end]);
  };
  const seq = (n, length = 2) =>
    Array.from({ length: n }, (_, i) =>
      createClip({ sourceFile: '/m/a.mp4', timelineStart: i * length, timelineEnd: (i + 1) * length }),
    );

  it('keeps a short timeline in one segment', () => {
    assert.deepEqual(plan(seq(8)), [[0, 480]]);
    assert.deepEqual(plan(seq(3), { maxLayers: 3 }), [[0, 180]]);
  });

  it('cuts at clip boundaries so no segment touches more than the budget', () => {
    assert.deepEqual(plan(seq(20)), [[0, 480], [480, 960], [960, 1200]]);
    assert.deepEqual(plan(seq(5), { maxLayers: 2 }), [[0, 120], [120, 240], [240, 300]]);
  });

  it('counts a clip spanning many cuts in every segment it touches', () => {
    const bed = createClip({ sourceFile: '/m/bed.mp4', timelineStart: 0, timelineEnd: 12 });
    assert.deepEqual(plan([bed, ...seq(6)], { maxLayers: 3 }), [[0, 120], [120, 240], [240, 360]]);
  });

  it('never cuts a segment shorter than the minimum and merges a short tail', () => {
    const quick = seq(40, 0.1);
    for (const [start, end] of plan(quick, { maxLayers: 2 })) assert.ok(end - start >= 30);
    const tail = [...seq(4), createClip({ sourceFile: '/m/a.mp4', timelineStart: 8, timelineEnd: 8.5 })];
    assert.deepEqual(plan(tail, { maxLayers: 2 }), [[0, 120], [120, 255]]);
  });

  it('only covers the requested range', () => {
    assert.deepEqual(plan(seq(20), { maxLayers: 2 }, { start: 3, end: 9 }), [[90, 180], [180, 270]]);
    const edl = createEdl({ tracks: [createTrack('video', { clips: seq(20) })] });
    assert.deepEqual(renderSegments(edl, { maxLayers: 10, range: { start: 1, end: 30 } }).slice(0, 2), [
      { start: 1, end: 20, frames: 570 },
      { start: 20, end: 30, frames: 300 },
    ]);
  });

  it('builds the joining pass: copy the picture, mix the sound once', () => {
    const music = createClip({ sourceFile: '/m/music.mp3', sourceOut: 40, timelineEnd: 40 });
    const edl = createEdl({
      tracks: [createTrack('video', { clips: seq(20) }), createTrack('audio', { clips: [music] })],
    });
    const probes = { '/m/a.mp4': { hasVideo: true, width: 320, height: 180 }, '/m/music.mp3': { hasAudio: true } };
    const parts = [{ file: 'segment-00000.mp4', frames: 480 }, { file: 'segment-00001.mp4', frames: 720 }];
    const mux = buildMuxPlan(edl, { probes, parts, workDir: '/w', outputPath: '/w/out.mp4' });
    assert.equal(
      mux.files[0].content,
      'ffconcat version 1.0\nfile segment-00000.mp4\nduration 16\nfile segment-00001.mp4\nduration 24\n',
    );
    assert.deepEqual(mux.args.slice(10, 14), ['-f', 'concat', '-i', '/w/segments.ffconcat']);
    assert.match(mux.args.join(' '), /-map 0:v:0 -c:v copy -map \[aout\] -c:a aac .* -movflags \+faststart/);
    assert.match(mux.filterComplex, /^\[1:a:0\]aresample/, 'audio inputs follow the segment list');
    assert.ok(!mux.filterComplex.includes('overlay'), 'no picture work in the joining pass');
  });
});

describe('render: segmented encode', () => {
  const tmp = kit.scratch();
  const file = (name) => join(tmp.dir, name);
  const clip = (name, start, end, more = {}) =>
    createClip({
      ...{ sourceFile: file(name), sourceIn: start, sourceOut: end },
      ...{ timelineStart: start, timelineEnd: end, ...more },
    });

  /** Encode with a job-like context, recording progress and log lines. */
  const encode = async (edl, name, limits) => {
    const workDir = file(name);
    mkdirSync(workDir);
    const seen = { progress: [], log: [] };
    const ctx = {
      job: /** @type {any} */ ({}),
      signal: new AbortController().signal,
      progress: (percent) => seen.progress.push(percent),
      log: (message) => seen.log.push(message),
    };
    const probes = await probeSources(renderSources(edl));
    const capabilities = await getCapabilities();
    const output = join(workDir, 'output.mp4');
    const options = { probes, capabilities, workDir, outputPath: output, preset: 'standard' };
    const plan = await encodeTimeline(edl, { ...options, ...limits }, ctx);
    return { output, plan, workDir, ...seen };
  };

  before(async () => {
    // A test pattern whose hue turns once a second (every frame differs clearly), with a steady tone.
    const picture = 'testsrc2=s=320x180:r=30:d=7,hue=h=t*360';
    const sources = [picture, 'aevalsrc=0.5*sin(2*PI*440*t):s=48000:d=7'];
    await kit.generate(file('moving.mp4'), sources, ['-c:a', 'aac', '-b:a', '192k']);
  });
  after(() => tmp.cleanup());

  it('matches a single-pass render frame for frame, with seamless audio', async () => {
    const caption = createClip({
      ...{ timelineStart: 0.5, timelineEnd: 5.5, fadeIn: 1, fadeOut: 1 },
      text: { content: 'ACROSS', fontSize: 30, background: '#000000' },
      transform: { y: 60, kenBurns: { enabled: true, startX: -100, endX: 100, startY: 60, endY: 60 } },
    });
    const cuts = [
      clip('moving.mp4', 0, 1.5, { fadeOut: 0.5 }),
      clip('moving.mp4', 1, 2.5, { fadeIn: 0.5 }),
      clip('moving.mp4', 2.5, 3.5),
      clip('moving.mp4', 3.5, 4.7),
      clip('moving.mp4', 4.7, 6),
    ];
    const edl = createEdl({
      resolution: '320x180',
      tracks: [
        createTrack('video', { clips: [caption] }),
        createTrack('video', { clips: cuts }),
        createTrack('audio', { clips: [clip('moving.mp4', 0, 6)] }),
      ],
    });
    const whole = await encode(edl, 'whole', { maxLayers: 99 });
    const split = await encode(edl, 'split', { maxLayers: 2, minFrames: 15 });
    assert.equal(whole.plan.segments, 1);
    assert.ok(split.plan.segments >= 3, `rendered in ${split.plan.segments} segments`);
    assert.match(split.log.join('\n'), /Encoding 180 frames in \d+ segments/);
    const leftover = readdirSync(split.workDir).filter((name) => name.startsWith('segment-'));
    assert.equal(leftover.length, split.plan.segments, 'one intermediate file per segment');

    const info = await kit.inspect(split.output);
    assert.equal(Number(info.video.nb_read_frames), 180);
    assert.equal(info.video.r_frame_rate, '30/1');
    assert.ok(Math.abs(info.duration - 6) <= 1 / 30, `duration ${info.duration}`);
    const stamps = ['-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0'];
    const times = (await run('ffprobe', [...stamps, split.output])).stdout.trim().split('\n').map(parseFloat);
    times.forEach((t, i) => assert.ok(Math.abs(t - i / 30) < 0.001, `frame ${i} is at ${t}`));

    const a = await kit.readFrames(whole.output, 320, 180);
    const b = await kit.readFrames(split.output, 320, 180);
    assert.equal(b.count, a.count);
    /** Mean absolute difference between two frames, sampled on a grid. */
    const differ = (one, n, other, m) => {
      let sum = 0;
      for (let y = 0; y < 180; y += 3)
        for (let x = 0; x < 320; x += 3)
          sum += one.at(n, x, y).reduce((d, v, i) => d + Math.abs(v - other.at(m, x, y)[i]), 0);
      return sum / (60 * 107 * 3);
    };
    let worst = 0;
    let slip = Infinity;
    for (let frame = 1; frame < a.count; frame++) {
      worst = Math.max(worst, differ(a, frame, b, frame));
      slip = Math.min(slip, differ(a, frame, a, frame - 1));
    }
    // Each frame must match its twin far better than it matches its neighbour,
    // so a frame dropped or repeated at a seam cannot hide.
    assert.ok(slip > 8, `neighbouring frames differ by at least ${slip.toFixed(2)}`);
    assert.ok(worst < 4, `worst difference between the two renders: ${worst.toFixed(2)}`);

    const sound = await kit.readAudio(split.output);
    for (let t = 0.25; t < 5.75; t += 0.25) {
      const level = kit.tone(sound.left, 440, t, t + 0.2);
      assert.ok(Math.abs(level - 0.5) < 0.03, `tone is steady at ${t}s: ${level.toFixed(3)}`);
    }
    const increasing = split.progress.every((p, i) => i === 0 || p >= split.progress[i - 1]);
    assert.ok(increasing && split.progress.at(-1) <= 99, `progress ${split.progress}`);
    assert.ok(split.progress.some((p) => p > 20 && p < 95), 'progress moves through the segments');
  });
});
