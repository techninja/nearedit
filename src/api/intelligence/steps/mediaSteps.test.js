/**
 * The FFmpeg-backed steps against real generated media: probe, silence,
 * scenes and beats. Nothing is faked here.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { probeStep } from './probe.js';
import { parseSilences, silenceStep } from './silence.js';
import { buildScenes, parseCuts, scenesStep } from './scenes.js';
import { analyzeBeats, beatsStep } from './beats.js';
import { readPcm } from '../dsp/pcmStream.js';
import { clickTrack, drumPattern } from '../testing/signals.js';
import { writeWav } from '../testing/wav.js';
import {
  CUT_TIMES,
  CUTS_DURATION,
  ffmpeg,
  makeCutsVideo,
  makeToneSilenceTone,
  stepContext,
  tempDir,
} from '../testing/media.js';

const FRAME = 1 / 30;
let dir;
let cleanup;
const file = (name) => join(dir, name);

before(async () => {
  ({ dir, cleanup } = tempDir('nearedit-steps-'));
  await makeCutsVideo(file('cuts.mp4'), { withAudio: true });
  await makeToneSilenceTone(file('tones.wav'));
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=800x600:d=1',
    '-frames:v',
    '1',
    file('still.png'),
  ]);
  await ffmpeg(['-display_rotation', '90', '-i', file('cuts.mp4'), '-c', 'copy', file('rot.mp4')]);
  writeFileSync(file('notes.md'), '# Plan\n\nShoot the park scene first.\n');
});

after(() => cleanup());

test('probe: video with audio', async () => {
  const patch = await probeStep.run(file('cuts.mp4'), stepContext('video'));
  assert.equal(patch.type, 'video');
  assert.equal(patch.filename, 'cuts.mp4');
  assert.ok(patch.size > 1000);
  assert.ok(Math.abs(patch.duration - CUTS_DURATION) < 0.1, `duration ${patch.duration}`);
  assert.deepEqual(
    [patch.width, patch.height, patch.fps, patch.codec, patch.hasVideo, patch.hasAudio],
    [640, 360, 30, 'h264', true, true],
  );
  assert.equal(patch.resolution, '640x360');
  assert.equal(patch.rotation, 0);
  assert.equal(patch.audioCodec, 'aac');
  assert.equal(patch.sampleRate, 44100);
  assert.equal(patch.channels, 1);
  assert.ok(patch.bitrate > 0);
  assert.equal(probeStep.done(patch, {}), true);
  assert.deepEqual(probeStep.summary(patch), { type: 'video', duration: patch.duration });
});

test('probe: rotated video reports display dimensions', async () => {
  const patch = await probeStep.run(file('rot.mp4'), stepContext('video'));
  assert.equal(Math.abs(patch.rotation), 90);
  assert.deepEqual([patch.width, patch.height], [640, 360]);
  assert.deepEqual([patch.displayWidth, patch.displayHeight], [360, 640]);
});

test('probe: audio-only file', async () => {
  const patch = await probeStep.run(file('tones.wav'), stepContext('audio'));
  assert.equal(patch.type, 'audio');
  assert.equal(patch.hasVideo, false);
  assert.equal(patch.hasAudio, true);
  assert.ok(Math.abs(patch.duration - 6) < 0.05);
  assert.equal(patch.audioCodec, 'pcm_s16le');
  assert.equal(patch.width, undefined);
});

test('probe: still image has dimensions but no duration or streams to play', async () => {
  const patch = await probeStep.run(file('still.png'), stepContext('image'));
  assert.deepEqual([patch.width, patch.height, patch.codec], [800, 600, 'png']);
  assert.deepEqual(
    [patch.duration, patch.fps, patch.hasVideo, patch.hasAudio],
    [null, null, false, false],
  );
});

test('probe: text file is parsed, not ffprobed; unreadable media is an error', async () => {
  const patch = await probeStep.run(file('notes.md'), stepContext('text'));
  assert.equal(patch.type, 'text');
  assert.equal(patch.subtype, 'script');
  assert.equal(patch.sections[0].heading, 'Plan');
  assert.equal(probeStep.done(patch, {}), true);
  assert.equal(probeStep.done({ size: 3, type: 'video', tags: [] }, {}), false, 'legacy sidecar');

  writeFileSync(file('broken.mp4'), 'this is not a video');
  await assert.rejects(
    probeStep.run(file('broken.mp4'), stepContext('video')),
    /ffprobe could not read/,
  );
});

test('silence: tone–silence–tone gives one silence at 2–4 s', async () => {
  const fractions = [];
  const ctx = stepContext('audio', {
    sidecar: { duration: 6 },
    progress: (f) => fractions.push(f),
  });
  const patch = await silenceStep.run(file('tones.wav'), ctx);
  assert.equal(patch.silences.length, 1);
  assert.ok(Math.abs(patch.silences[0].start - 2) < 0.02, `start ${patch.silences[0].start}`);
  assert.ok(Math.abs(patch.silences[0].end - 4) < 0.02, `end ${patch.silences[0].end}`);
  assert.deepEqual([patch.silenceNoiseDb, patch.silenceMinDuration], [-30, 0.4]);
  assert.ok(fractions.length > 0 && fractions.every((f) => f >= 0 && f <= 1));

  const strict = stepContext('audio', { sidecar: { duration: 6 }, options: { minDuration: 3 } });
  assert.deepEqual((await silenceStep.run(file('tones.wav'), strict)).silences, []);
});

test('silence: done() respects the stored parameters; parser closes a trailing silence', () => {
  const sidecar = { silences: [], silenceNoiseDb: -30, silenceMinDuration: 0.4 };
  assert.equal(silenceStep.done(sidecar, {}), true);
  assert.equal(silenceStep.done(sidecar, { noiseDb: -30 }), true);
  assert.equal(silenceStep.done(sidecar, { noiseDb: -50 }), false);
  assert.equal(silenceStep.done(sidecar, { minDuration: 1 }), false);
  assert.equal(silenceStep.done({ silences: null }, {}), false);
  const lines = [
    '[silencedetect @ 0x55] silence_start: -0.00133333',
    '[silencedetect @ 0x55] silence_end: 1.5 | silence_duration: 1.50133',
    '[silencedetect @ 0x55] silence_start: 8.25',
  ];
  assert.deepEqual(parseSilences(lines, 10), [
    { start: 0, end: 1.5 },
    { start: 8.25, end: 10 },
  ]);
  assert.equal(silenceStep.unsuitable('video', { hasAudio: false }), 'no audio stream');
  assert.equal(silenceStep.unsuitable('image', null), 'not applicable to image files');
  assert.equal(silenceStep.unsuitable('video', null), '');
});

test('scenes: hard cuts are found within two frames and scenes cover the file', async () => {
  const fractions = [];
  const ctx = stepContext('video', {
    sidecar: { duration: CUTS_DURATION },
    progress: (f) => fractions.push(f),
  });
  const { scenes, sceneThreshold } = await scenesStep.run(file('cuts.mp4'), ctx);
  assert.equal(sceneThreshold, 0.3);
  assert.equal(scenes.length, CUT_TIMES.length + 1);
  CUT_TIMES.forEach((cut, i) => {
    assert.ok(
      Math.abs(scenes[i + 1].start - cut) <= 2 * FRAME,
      `cut ${cut} → ${scenes[i + 1].start}`,
    );
    assert.equal(scenes[i].end, scenes[i + 1].start, 'contiguous');
  });
  assert.equal(scenes[0].start, 0);
  assert.equal(scenes.at(-1).end, CUTS_DURATION);
  assert.ok(fractions.length > 0, 'progress was reported');

  // Without a probed duration the step finds it itself.
  const unprobed = await scenesStep.run(file('cuts.mp4'), stepContext('video'));
  assert.equal(unprobed.scenes.length, 4);
  // A stricter threshold keeps only the starkest cut (colour bars → white).
  const strict = stepContext('video', {
    sidecar: { duration: CUTS_DURATION },
    options: { threshold: 0.95 },
  });
  const fewer = await scenesStep.run(file('cuts.mp4'), strict);
  assert.equal(fewer.sceneThreshold, 0.95);
  assert.deepEqual(fewer.scenes, [
    { start: 0, end: 3.5 },
    { start: 3.5, end: 8 },
  ]);
});

test('scenes: parsing and scene building', () => {
  const out =
    'frame:0    pts:30720   pts_time:2\nlavfi.scene_score=0.73\nframe:1 pts:1 pts_time:3.5\n';
  assert.deepEqual(parseCuts(out), [2, 3.5]);
  assert.deepEqual(buildScenes([0.1, 2, 2.1, 9.9], 10), [
    { start: 0, end: 2 },
    { start: 2, end: 10 },
  ]);
  assert.deepEqual(buildScenes([], 4.2), [{ start: 0, end: 4.2 }]);
  assert.equal(scenesStep.unsuitable('audio', null), 'not applicable to audio files');
  assert.equal(scenesStep.done({ scenes: [], sceneThreshold: 0.3 }, { threshold: 0.5 }), false);
  assert.equal(scenesStep.done({ scenes: [], sceneThreshold: 0.3 }, {}), true);
});

test('beats: WAV click track decoded through FFmpeg', async () => {
  const { samples, beats: truth } = clickTrack(120, 20, { sampleRate: 44100 });
  writeWav(file('click120.wav'), samples, 44100);
  const fractions = [];
  const ctx = stepContext('audio', {
    sidecar: { duration: 20 },
    progress: (f) => fractions.push(f),
  });
  const patch = await beatsStep.run(file('click120.wav'), ctx);
  assert.ok(Math.abs(patch.bpm - 120) < 1.2, `bpm ${patch.bpm}`);
  const worst = Math.max(...patch.beats.map((b) => Math.min(...truth.map((t) => Math.abs(t - b)))));
  assert.ok(worst < 0.02, `worst ${worst}`);
  assert.ok(patch.beats.length >= truth.length - 2);
  assert.equal(fractions.at(-1), 1);
  assert.deepEqual(beatsStep.summary(patch), { beats: patch.beats.length, bpm: patch.bpm });
});

test('beats: drum pattern inside an AAC video track; pure tones have no beat', async () => {
  const { samples, beats: truth } = drumPattern(128, 20, { sampleRate: 44100 });
  writeWav(file('drums.wav'), samples, 44100);
  const video = ['-f', 'lavfi', '-i', 'color=c=gray:s=320x180:r=25:d=20', '-i', file('drums.wav')];
  await ffmpeg([
    ...video,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-c:a',
    'aac',
    '-shortest',
    file('drums.mp4'),
  ]);
  const result = await analyzeBeats(file('drums.mp4'));
  assert.ok(Math.abs(result.bpm - 128) < 1.5, `bpm ${result.bpm}`);
  const worst = Math.max(
    ...result.beats.map((b) => Math.min(...truth.map((t) => Math.abs(t - b)))),
  );
  assert.ok(worst < 0.035, `worst ${worst}`); // lossy codec + priming delay

  assert.deepEqual(await beatsStep.run(file('tones.wav'), stepContext('audio')), {
    beats: [],
    bpm: null,
  });
});

test('cancellation kills FFmpeg mid-run: scenes, silence, beats and the PCM stream', async () => {
  // Long enough that each step is still busy when the abort arrives.
  const video = file('long.mp4');
  const audio = file('long.flac');
  const picture = ['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=240'];
  await ffmpeg([...picture, '-c:v', 'libx264', '-preset', 'ultrafast', video]);
  await ffmpeg(['-f', 'lavfi', '-i', 'sine=f=220:r=8000:d=3600', '-c:a', 'flac', audio]);
  const cases = [
    { step: scenesStep, path: video, type: 'video', duration: 240 },
    { step: silenceStep, path: audio, type: 'audio', duration: 3600 },
    { step: beatsStep, path: audio, type: 'audio', duration: 3600 },
  ];
  for (const { step, path, type, duration } of cases) {
    const controller = new AbortController();
    const ctx = stepContext(type, { sidecar: { duration }, signal: controller.signal });
    const started = Date.now();
    const running = step.run(path, ctx);
    setTimeout(() => controller.abort(), 150);
    await assert.rejects(running, /aborted/, step.name);
    assert.ok(Date.now() - started < 1500, `${step.name} stopped promptly`);
  }
  const already = new AbortController();
  already.abort();
  await assert.rejects(async () => {
    for await (const chunk of readPcm(audio, { signal: already.signal }))
      assert.fail(`${chunk.length}`);
  }, /aborted/);
  await assert.rejects(async () => {
    for await (const chunk of readPcm(file('missing.wav'))) assert.fail(`${chunk.length}`);
  }, /ffmpeg exited/);
});
