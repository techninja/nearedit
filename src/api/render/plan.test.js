import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import { RenderError } from './errors.js';
import { buildRenderPlan, renderSources } from './plan.js';

const HD = {
  hasVideo: true,
  hasAudio: true,
  width: 1920,
  height: 1080,
  channels: 2,
  pixFmt: 'yuv420p',
};
const probes = {
  '/m/a.mp4': HD,
  '/m/b.mp4': HD,
  '/m/phone.mp4': { ...HD, rotation: -90 },
  '/m/photo 100%.jpg': {
    hasVideo: true,
    hasAudio: false,
    width: 4000,
    height: 3000,
    codec: 'mjpeg',
  },
  '/m/voice.wav': { hasVideo: false, hasAudio: true, channels: 1 },
  '/m/music.mp3': { hasVideo: false, hasAudio: true, channels: 2 },
};
const clip = (file, start, end, more = {}) =>
  createClip({
    ...{ clipId: `${file.split('/').pop()}@${start}`, sourceFile: file, sourceIn: 0 },
    ...{ sourceOut: end - start, timelineStart: start, timelineEnd: end, ...more },
  });
const video = (clips, more = {}) => createTrack('video', { clips, ...more });
const audio = (clips, more = {}) => createTrack('audio', { clips, ...more });
const plan = (tracks, options = {}, more = {}) =>
  buildRenderPlan(createEdl({ tracks, ...more }), { probes, ...options });
const chains = (p) => p.filterComplex.split(';\n');
const chainOf = (p, label) => chains(p).find((chain) => chain.endsWith(`[${label}]`));
const count = (text, needle) => text.split(needle).length - 1;

describe('buildRenderPlan', () => {
  it('builds base, one trimmed input, one overlay and a silent track for a single clip', () => {
    const p = plan([video([clip('/m/a.mp4', 0, 2, { sourceIn: 5, sourceOut: 7 })])]);
    assert.equal(p.duration, 2);
    assert.deepEqual([p.width, p.height, p.fps, p.frames], [1920, 1080, 30, 60]);
    assert.equal(p.inputs.length, 1);
    assert.deepEqual(p.inputs[0].args, [
      '-ss',
      '5',
      '-t',
      '2.001',
      '-an',
      '-sn',
      '-dn',
      '-i',
      '/m/a.mp4',
    ]);
    assert.equal(
      chains(p)[0],
      'color=c=black:s=1920x1080:r=30,format=yuv444p,trim=end_frame=60[v0]',
    );
    const layer = chainOf(p, 'c0');
    assert.match(
      layer,
      /^\[0:v:0\]fps=fps=30:start_time=0,tpad=[^,]+,trim=end_frame=60,scale=w=1920:h=1080:/,
    );
    assert.match(layer, /in_color_matrix=bt709:out_color_matrix=bt709:out_range=tv/);
    assert.ok(!layer.includes('fade') && !layer.includes('crop') && !layer.includes('setpts'));
    assert.equal(count(p.filterComplex, 'overlay='), 1);
    assert.match(
      chainOf(p, 'v1'),
      /^\[v0\]\[c0\]overlay=x=0:y=0:format=yuv444:eof_action=pass:eval=init/,
    );
    assert.equal(chainOf(p, 'vout'), '[v1]format=yuv420p[vout]');
    assert.match(chainOf(p, 'aout'), /^anullsrc=.*atrim=end_sample=96000\[aout\]$/);
    const maps = p.args.flatMap((arg, i) => (arg === '-map' ? [p.args[i + 1]] : []));
    assert.deepEqual(maps, ['[vout]', '[aout]']);
    assert.equal(p.args[p.args.indexOf('-filter_complex') + 1], p.filterComplex);
    assert.equal(p.args.at(-1), 'output.mp4');
  });

  it('composites the last video track first and the first track on top', () => {
    const p = plan([
      video([clip('/m/a.mp4', 0, 2)], { name: 'front' }),
      video([clip('/m/b.mp4', 1, 3), clip('/m/b.mp4', 0, 1)], { name: 'back' }),
    ]);
    assert.deepEqual(
      p.inputs.map((i) => i.clipId),
      ['b.mp4@0', 'b.mp4@1', 'a.mp4@0'],
      'back track in start order, then the front track',
    );
    assert.match(chainOf(p, 'v3'), /^\[v2\]\[c2\]overlay/);
    assert.match(chainOf(p, 'c1'), /setpts=PTS\+30\[c1\]$/);
    assert.match(chainOf(p, 'v2'), /enable='between\(t,0\.983333,2\.983333\)'/);
  });

  it('dissolves a cross-fade pair: no fade-out under the incoming clip', () => {
    const pair = [
      clip('/m/a.mp4', 0, 2, { fadeOut: 1 }),
      clip('/m/b.mp4', 1, 3, { fadeIn: 1, fadeOut: 0.5 }),
    ];
    const p = plan([video(pair)]);
    assert.ok(!chainOf(p, 'c0').includes('fade='), 'outgoing clip stays opaque');
    assert.match(chainOf(p, 'c1'), /fade=t=in:st=0:d=1:alpha=1,fade=t=out:st=1\.5:d=0\.5:alpha=1/);
    // The same clips as audio: both ramp, on separate lanes, mixed without normalising.
    const a = plan([audio(pair)]);
    assert.match(chainOf(a, 'a0'), /afade=t=out:st=1:d=1/);
    assert.match(chainOf(a, 'a1'), /afade=t=in:st=0:d=1,afade=t=out:st=1\.5:d=0\.5/);
    assert.match(
      chainOf(a, 'aout'),
      /^\[a0\]\[lane1\]amix=inputs=2:normalize=0:duration=longest,alimiter=/,
    );
  });

  it('draws titles from a text file, never from graph text', () => {
    const text = {
      content: "it's; [drawtext=evil]\nline 2",
      fontFamily: 'x:y',
      color: 'red:box=1',
    };
    const title = createClip({
      clipId: 't',
      timelineStart: 1,
      timelineEnd: 3,
      text: { ...text, align: 'evil' },
    });
    const p = plan([video([title])], { workDir: '/work' });
    assert.equal(p.inputs.length, 0);
    assert.ok(!p.filterComplex.includes('evil') && !p.filterComplex.includes('line 2'));
    const layer = chainOf(p, 't0');
    assert.match(
      layer,
      /^color=c=black@0:s=1920x1080:r=30,format=gbrap,trim=end_frame=1,drawtext=/,
    );
    assert.match(layer, /fontfile=sans-serif\\\\:bold:textfile=\/work\/t0\.txt:expansion=none/);
    assert.match(layer, /fontcolor=0xffffff@1:.*text_align=center:y_align=font/);
    assert.match(layer, /unpremultiply=inplace=1,scale=w=1920:h=1080:out_color_matrix=bt709/);
    assert.deepEqual(p.files[0], { path: '/work/t0.txt', content: text.content });
    assert.deepEqual(p.files[1], { path: '/work/graph.txt', content: p.filterComplex });
    assert.equal(p.args[p.args.indexOf('-filter_complex_script') + 1], '/work/graph.txt');
    const newer = plan([video([title])], {
      workDir: '/w',
      capabilities: { graphFlag: '-/filter_complex' },
    });
    assert.ok(newer.args.includes('-/filter_complex'));
    const none = plan([video([title, clip('/m/a.mp4', 0, 1)])], {
      capabilities: { drawtext: false },
    });
    assert.ok(!none.filterComplex.includes('drawtext'));
    assert.match(none.warnings[0], /title "t" skipped/);
  });

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
  });

  it('renders a range: seeks into clips and keeps their own clock for fades', () => {
    const tracks = [
      video([clip('/m/a.mp4', 0, 4, { sourceIn: 10, sourceOut: 14, fadeIn: 3 })]),
      audio([clip('/m/music.mp3', 0, 4, { fadeIn: 3 })]),
    ];
    const p = plan(tracks, { range: { start: 2, end: 3 } });
    assert.deepEqual([p.duration, p.frames], [1, 30]);
    assert.deepEqual(p.inputs[0].args.slice(0, 4), ['-ss', '12', '-t', '1.001']);
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

  it('sizes and encodes per preset', () => {
    const tracks = [video([clip('/m/a.mp4', 0, 1)])];
    const draft = plan(tracks, { preset: 'draft' }, { resolution: '1918x1080', fps: 29.97 });
    assert.deepEqual([draft.width, draft.height], [960, 540]);
    assert.match(draft.filterComplex, /color=c=black:s=960x540:r=30000\/1001,format=yuv420p/);
    assert.match(draft.filterComplex, /format=yuva420p/);
    const args = (p) => p.args.join(' ');
    assert.match(args(draft), /-preset veryfast -crf 28 -pix_fmt yuv420p .* -r 30000\/1001 /);
    assert.match(
      args(plan(tracks)),
      /-c:v libx264 -preset medium -crf 20 .*-c:a aac -b:a 192k -ar 48000 -ac 2 -movflags \+faststart/,
    );
    assert.match(args(plan(tracks, { preset: 'high' })), /-preset slow -crf 16 .*-b:a 320k/);
    assert.throws(
      () => plan(tracks, { preset: 'nope' }),
      (err) => err instanceof RenderError && err.status === 422,
    );
  });

  it('places by displayed size and only scales what the frame shows', () => {
    const vertical = { resolution: '1080x1920' };
    // A sideways phone clip is 1080x1920 on screen: it fits a vertical frame exactly.
    const phone = plan([video([clip('/m/phone.mp4', 0, 1)])], {}, vertical);
    assert.match(chainOf(phone, 'c0'), /trim=end_frame=30,scale=w=1080:h=1920:/);
    // A 16:9 clip covering a 9:16 frame: crop the visible middle first, then scale.
    const wide = plan([video([clip('/m/a.mp4', 0, 1)])], {}, vertical);
    assert.match(chainOf(wide, 'c0'), /crop=w=608:h=1080:x=656:y=0:exact=1,scale=w=1080:h=1920:/);
    const still = createClip({ sourceFile: '/m/photo 100%.jpg', timelineStart: 0, timelineEnd: 5 });
    const photo = plan([video([still])]);
    assert.deepEqual(photo.inputs[0].args, [
      '-f',
      'image2',
      '-pattern_type',
      'none',
      '-i',
      '/m/photo 100%.jpg',
    ]);
    assert.match(
      chainOf(photo, 'c0'),
      /^\[0:v:0\]crop=w=4000:h=2250:x=0:y=375:exact=1,scale=w=1920:h=1080:in_color_matrix=bt601:.*format=yuva444p,fps=/,
    );
    assert.ok(!photo.filterComplex.includes('photo'), 'paths stay in the arguments');
  });

  it('animates ken burns with expressions between the two end placements', () => {
    const kenBurns = { enabled: true, startScale: 1, endScale: 1.5, startX: 0, endX: -100 };
    const p = plan([video([clip('/m/a.mp4', 1, 3, { transform: { kenBurns } })])]);
    const layer = chainOf(p, 'c0');
    assert.match(
      layer,
      /scale=w=2880:h=1620:in_color_matrix=bt709/,
      'scaled once to the largest size',
    );
    assert.match(
      layer,
      /scale=w='max\(1,round\(\(1920\+\(960\)\*clip\(t\/2,0,1\)\)\)\)':h='max\(1,round\(\(1080\+\(540\)\*clip\(t\/2,0,1\)\)\)\)':eval=frame/,
    );
    assert.match(
      chainOf(p, 'v1'),
      /overlay=x='round\(\(0\+\(-580\)\*clip\(\(t-\(1\)\)\/2,0,1\)\)\)':y='round\(\(0\+\(-270\)\*clip\(\(t-\(1\)\)\/2,0,1\)\)\)':.*eval=frame/,
    );
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
    assert.equal(offGrid.inputs[0].args[1], '0.013333', 'source offset follows the snapped start');
    const many = Array.from({ length: 400 }, (_, i) => clip('/m/a.mp4', i, i + 1));
    const big = plan([video(many), audio(many)], { workDir: '/w' });
    assert.equal(big.inputs.length, 800);
    assert.equal(count(big.filterComplex, 'overlay='), 400);
    assert.equal(count(big.filterComplex, 'concat='), 1, 'sequential audio is one lane');
    assert.ok(!big.args.includes(big.filterComplex), 'the graph goes to a script file');
  });
});
