import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as kit from './testkit.js';

const { createClip, createEdl, createTrack } = kit;
const sine = (hz, amp = 0.5) => `${amp}*sin(2*PI*${hz}*t)`;

/** Assert a level is within a relative tolerance (AAC shifts levels slightly). */
function isLevel(actual, expected, label, tolerance = 0.06) {
  const ok = Math.abs(actual - expected) <= Math.max(0.004, expected * tolerance);
  assert.ok(ok, `${label}: got ${actual.toFixed(4)} expected ~${expected}`);
}

const peak = (samples, from = 0, to = Infinity) => {
  let max = 0;
  const end = Math.min(samples.length, to * kit.RATE);
  for (let i = Math.round(from * kit.RATE); i < end; i++) max = Math.max(max, Math.abs(samples[i]));
  return max;
};

describe('render: audio mix', () => {
  const tmp = kit.scratch();
  const file = (name) => join(tmp.dir, name);
  const edl = (...tracks) => createEdl({ resolution: '160x90', fps: 30, tracks });
  const clip = (name, start, end, more = {}) =>
    createClip({
      ...{ sourceFile: file(name), sourceIn: 0, sourceOut: end - start },
      ...{ timelineStart: start, timelineEnd: end, ...more },
    });
  const audio = (clips, more = {}) => createTrack('audio', { clips, ...more });
  const mix = async (document, options) => {
    const { output, plan } = await kit.render(document, tmp.dir, { preset: 'draft', ...options });
    return { output, plan, ...(await kit.readAudio(output)) };
  };

  before(async () => {
    // Mono 48 kHz, stereo 44.1 kHz, and one that changes pitch after 1 s.
    await kit.generate(file('a440.wav'), [`aevalsrc=${sine(440)}:s=48000:d=3`]);
    await kit.generate(file('a880.wav'), [`aevalsrc=${sine(880)}|${sine(880)}:s=44100:d=3`]);
    const steps = [`aevalsrc=${sine(440)}:s=48000:d=1`, `aevalsrc=${sine(880)}:s=48000:d=2`];
    await kit.generate(file('steps.wav'), steps, ['-filter_complex', '[0][1]concat=n=2:v=0:a=1']);
    const talk = ['color=red:s=160x90:r=30:d=2', `aevalsrc=${sine(660)}:s=48000:d=2`];
    await kit.generate(file('talk.mp4'), talk, ['-c:a', 'aac', '-b:a', '192k']);
    await kit.generate(file('silent.mp4'), ['color=blue:s=160x90:r=30:d=2']);
  });
  after(() => tmp.cleanup());

  it('applies track volume x clip volume and sums tracks without normalising', async () => {
    const { left, right, output } = await mix(
      edl(
        audio([clip('a440.wav', 0, 2, { volume: 0.5 })], { volume: 0.5 }),
        audio([clip('a880.wav', 0, 2)]),
      ),
    );
    isLevel(kit.tone(left, 440, 0.5, 1.5), 0.125, '440 Hz at 0.5 x 0.5');
    isLevel(kit.tone(left, 880, 0.5, 1.5), 0.5, '880 Hz at unity, untouched by the second track');
    isLevel(kit.tone(right, 440, 0.5, 1.5), 0.125, 'mono source reaches the right channel');
    isLevel(kit.tone(right, 880, 0.5, 1.5), 0.5, 'stereo 44.1 kHz source, right channel');
    const info = await kit.inspect(output);
    assert.ok(Math.abs(left.length - 2 * kit.RATE) <= 2048, `${left.length} samples for 2 s`);
    assert.ok(Math.abs(Number(info.audio.duration) - 2) <= 0.03, `audio ${info.audio.duration}s`);
  });

  it('ramps fades linearly', async () => {
    const fading = clip('a440.wav', 0, 2, { fadeIn: 1, fadeOut: 0.5 });
    const { left } = await mix(edl(audio([fading])));
    isLevel(kit.tone(left, 440, 0.2, 0.3), 0.125, 'fade-in at 25%', 0.1);
    isLevel(kit.tone(left, 440, 0.45, 0.55), 0.25, 'fade-in midpoint');
    isLevel(kit.tone(left, 440, 1.1, 1.4), 0.5, 'full level between the fades');
    isLevel(kit.tone(left, 440, 1.7, 1.8), 0.25, 'fade-out midpoint');
  });

  it('cross-fades with equal gain: both clips ramp', async () => {
    const pair = [clip('a440.wav', 0, 2, { fadeOut: 1 }), clip('a880.wav', 1, 3, { fadeIn: 1 })];
    const { left } = await mix(edl(audio(pair)));
    isLevel(kit.tone(left, 440, 0.4, 0.9), 0.5, 'outgoing before the overlap');
    isLevel(kit.tone(left, 440, 1.45, 1.55), 0.25, 'outgoing at the midpoint');
    isLevel(kit.tone(left, 880, 1.45, 1.55), 0.25, 'incoming at the midpoint');
    isLevel(kit.tone(left, 880, 2.2, 2.8), 0.5, 'incoming after the overlap');
    isLevel(kit.tone(left, 440, 2.2, 2.8), 0, 'outgoing is gone');
  });

  it('places clips on the timeline and reads from sourceIn', async () => {
    // Starts at 1.0 s, reading the source from 1.0 s where it switches to 880 Hz.
    const late = clip('steps.wav', 1, 2.5, { sourceIn: 1, sourceOut: 2.5 });
    const { left } = await mix(edl(audio([late])));
    assert.ok(peak(left, 0, 0.95) < 0.003, `silence before the clip: ${peak(left, 0, 0.95)}`);
    const first = left.findIndex((v) => Math.abs(v) > 0.05);
    assert.ok(Math.abs(first - kit.RATE) <= 600, `starts at sample ${first}, expected ~48000`);
    isLevel(kit.tone(left, 880, 1.1, 2.4), 0.5, 'plays the part after sourceIn');
    isLevel(kit.tone(left, 440, 1.1, 2.4), 0, 'not the start of the file');
  });

  it('only audio tracks make sound; mute and solo are honoured', async () => {
    const picture = createTrack('video', { clips: [clip('talk.mp4', 0, 2)] });
    const silent = await mix(edl(picture));
    assert.equal(peak(silent.left), 0, 'a video-track clip is silent');
    const info = await kit.inspect(silent.output);
    assert.equal(info.audio.codec_name, 'aac', 'the output still has an audio stream');
    const linked = await mix(edl(picture, audio([clip('talk.mp4', 0, 2)])));
    isLevel(kit.tone(linked.left, 660, 0.5, 1.5), 0.5, 'its audio clip on an audio track', 0.1);
    const tracks = (a, b) =>
      edl(audio([clip('a440.wav', 0, 1)], a), audio([clip('a880.wav', 0, 1)], b));
    const muted = await mix(tracks({ muted: true }, {}));
    isLevel(kit.tone(muted.left, 440, 0.2, 0.8), 0, 'muted track');
    isLevel(kit.tone(muted.left, 880, 0.2, 0.8), 0.5, 'other track');
    const solo = await mix(tracks({ solo: true }, {}));
    isLevel(kit.tone(solo.left, 440, 0.2, 0.8), 0.5, 'solo track');
    isLevel(kit.tone(solo.left, 880, 0.2, 0.8), 0, 'non-solo track');
  });

  it('skips sources without an audio stream', async () => {
    const tracks = edl(audio([clip('silent.mp4', 0, 1), clip('a440.wav', 1, 2)]));
    const { left, plan } = await mix(tracks);
    assert.equal(plan.inputs.filter((i) => i.kind === 'audio').length, 1);
    assert.ok(peak(left, 0, 0.95) < 0.003, 'the stream-less clip is silence');
    isLevel(kit.tone(left, 440, 1.2, 1.8), 0.5, 'the next clip plays');
  });

  it('limits a hot mix instead of clipping, leaving normal levels alone', async () => {
    const loud = (name) => audio([clip(name, 0, 2, { volume: 2 })]);
    const { left } = await mix(edl(loud('a440.wav'), loud('a880.wav')));
    // 2 x 0.5 + 2 x 0.5 would peak at 2.0.
    const max = peak(left, 0.3, 1.7);
    assert.ok(max <= 0.97, `peak ${max} stays under full scale`);
    assert.ok(max >= 0.7, `peak ${max} is limited, not turned down`);
    let flat = 0;
    for (let i = 20000; i < 70000; i++) if (Math.abs(left[i]) >= 0.999) flat++;
    assert.equal(flat, 0, 'no samples pinned at full scale');
  });

  it('picks up fades part-way in a range render', async () => {
    const fading = clip('a440.wav', 0, 2, { fadeIn: 2 });
    const { left, plan } = await mix(edl(audio([fading])), { range: { start: 1, end: 2 } });
    assert.equal(plan.duration, 1);
    assert.ok(Math.abs(left.length - kit.RATE) <= 2048, `${left.length} samples for 1 s`);
    isLevel(kit.tone(left, 440, 0.45, 0.55), 0.375, 'timeline 1.5 s is 75% up the fade');
  });
});
