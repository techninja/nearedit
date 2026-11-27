import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip, createEdl } from '#utils/edl/factory.js';
import { RenderError } from './errors.js';
import { renderSources } from './plan.js';
import { audio, chainOf, chains, clip, count, plan, video } from './planKit.js';

describe('buildRenderPlan: sound, ranges and limits', () => {
  it('leaves out muted tracks, non-solo tracks and placeholders', () => {
    const tracks = (front, back, sound) => [
      video([clip('/m/a.mp4', 0, 2)], front),
      video([clip('/m/b.mp4', 0, 2), createClip({ timelineEnd: 9, placeholder: true })], back),
      audio([clip('/m/voice.wav', 0, 2)], sound),
      audio([clip('/m/music.mp3', 0, 2)]),
    ];
    const files = (p) => p.inputs.map((i) => i.file.split('/').pop());
    assert.deepEqual(files(plan(tracks({}, {}, {}))), ['b.mp4', 'a.mp4', 'voice.wav', 'music.mp3']);
    assert.deepEqual(files(plan(tracks({ muted: true }, {}, {}))), [
      'b.mp4',
      'voice.wav',
      'music.mp3',
    ]);
    assert.deepEqual(files(plan(tracks({}, { solo: true }, { solo: true }))), [
      'b.mp4',
      'voice.wav',
    ]);
    assert.deepEqual(
      renderSources(createEdl({ tracks: tracks({ muted: true }, {}, { muted: true }) })),
      ['/m/b.mp4', '/m/music.mp3'],
    );
    assert.equal(
      plan(tracks({}, {}, {})).duration,
      9,
      'a trailing placeholder still counts as length',
    );
  });

  it('builds audio lanes: gain, mono upmix, gaps as padding, one concat per lane', () => {
    const voice = [
      clip('/m/voice.wav', 1, 2, { volume: 0.5 }),
      clip('/m/voice.wav', 3, 4, { sourceIn: 10, sourceOut: 11 }),
    ];
    const p = plan([audio(voice, { volume: 0.5 }), audio([clip('/m/music.mp3', 0, 4)])]);
    assert.deepEqual(p.inputs[1].args, [
      '-ss',
      '0',
      '-t',
      '1.001',
      '-vn',
      '-sn',
      '-dn',
      '-i',
      '/m/voice.wav',
    ]);
    const first = chainOf(p, 'a1');
    assert.match(
      first,
      /^\[1:a:0\]aresample=sample_rate=48000:async=1:first_pts=0,pan=stereo\|c0=c0\|c1=c0,aformat=/,
    );
    assert.match(first, /atrim=end_sample=48000,volume=volume=0\.25,apad=whole_len=96000\[a1\]$/);
    assert.match(chainOf(p, 'a2'), /volume=volume=0\.5,apad=whole_len=48000\[a2\]$/);
    assert.ok(!/volume=|pan=/.test(chainOf(p, 'a0')), 'unity gain and stereo need no filter');
    assert.match(chainOf(p, 'gap1'), /atrim=end_sample=48000\[gap1\]$/);
    assert.equal(chainOf(p, 'lane1'), '[gap1][a1][a2]concat=n=3:v=0:a=1[lane1]');
    assert.match(
      chainOf(p, 'aout'),
      /alimiter=limit=0\.891:level=0:latency=1,apad=whole_len=192000,atrim=end_sample=192000/,
    );
    const old = plan([audio(voice)], { capabilities: { limiterLatency: false } });
    assert.match(chainOf(old, 'aout'), /alimiter=limit=0\.891:level=0,apad=/, 'FFmpeg before 5.1');
  });

  it('renders a range: seeks into clips and keeps their own clock for fades', () => {
    const tracks = [
      video([clip('/m/a.mp4', 0, 4, { sourceIn: 10, sourceOut: 14, fadeIn: 3 })]),
      audio([clip('/m/music.mp3', 0, 4, { fadeIn: 3 })]),
    ];
    const p = plan(tracks, { range: { start: 2, end: 3 } });
    assert.deepEqual([p.duration, p.frames], [1, 30]);
    assert.deepEqual(p.inputs[0].args.slice(0, 4), ['-ss', '11.9', '-t', '1.101']);
    assert.match(
      chainOf(p, 'c0'),
      /trim=end_frame=30,setpts=PTS\+60,.*fade=t=in:st=0:d=3:alpha=1,setpts=PTS-60\[c0\]$/,
    );
    assert.match(chainOf(p, 'v1'), /enable='between\(t,-0\.016667,0\.983333\)'/);
    assert.match(
      chainOf(p, 'a1'),
      /atrim=end_sample=48000,asetpts=PTS\+96000,afade=t=in:st=0:d=3,apad=whole_len=48000\[a1\]$/,
    );
    assert.deepEqual(p.inputs[1].args.slice(0, 4), ['-ss', '2', '-t', '1.001']);
    assert.equal(
      plan(tracks, { range: { start: 3.5, end: 99 } }).duration,
      0.5,
      'range is clamped',
    );
    assert.ok(!plan(tracks, { range: { start: 3.5, end: 4 } }).filterComplex.includes('fade='));
  });

  it('skips what cannot be seen or heard and refuses what cannot be rendered', () => {
    const away = clip('/m/a.mp4', 0, 1, { transform: { x: 5000 } });
    const clear = clip('/m/a.mp4', 0, 1, { transform: { opacity: 0 } });
    const soundOnly = clip('/m/voice.wav', 0, 1);
    const mute = clip('/m/music.mp3', 0, 1, { volume: 0 });
    const p = plan([video([away, clear, soundOnly]), audio([mute])]);
    assert.equal(p.inputs.length, 0);
    assert.equal(chains(p).length, 3, 'base, output format and silence only');
    const refused = (tracks, pattern, options) =>
      assert.throws(
        () => plan(tracks, options),
        (err) => err instanceof RenderError && err.status === 422 && pattern.test(err.message),
      );
    refused([], /empty/);
    refused([video([]), audio([])], /empty/);
    refused([video([createClip({ timelineEnd: 5, placeholder: true })])], /empty/);
    refused([video([clip('/m/a.mp4', 0, 1)], { muted: true })], /empty/);
    refused([video([clip('/m/a.mp4', 0, 1)])], /outside the timeline/, {
      range: { start: 5, end: 6 },
    });
    refused([video([clip('/m/unknown.mp4', 0, 1)])], /Cannot read source file: \/m\/unknown\.mp4/);
  });

  it('snaps clip times to frames and stays buildable for long timelines', () => {
    const offGrid = plan([video([clip('/m/a.mp4', 1.02, 2.99)])]);
    assert.match(chainOf(offGrid, 'c0'), /trim=end_frame=59,.*setpts=PTS\+31\[c0\]$/);
    assert.deepEqual(offGrid.inputs[0].args.slice(0, 2), ['-ss', '0']);
    assert.match(
      chainOf(offGrid, 'c0'),
      /setpts=PTS-23333,fps=/,
      'source offset follows the snapped start: 13.3 ms in, plus the 10 ms tolerance',
    );
    const many = Array.from({ length: 400 }, (_, i) => clip('/m/a.mp4', i, i + 1));
    const big = plan([video(many), audio(many)], { workDir: '/w' });
    assert.equal(big.inputs.length, 800);
    assert.equal(count(big.filterComplex, 'overlay='), 400);
    assert.equal(count(big.filterComplex, 'concat='), 1, 'sequential audio is one lane');
    assert.ok(!big.args.includes(big.filterComplex), 'the graph goes to a script file');
  });
});
