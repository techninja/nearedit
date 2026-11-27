import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip } from '#utils/edl/factory.js';
import { RenderError } from './errors.js';
import { audio, chainOf, chains, clip, count, plan, video } from './planKit.js';

describe('buildRenderPlan: picture', () => {
  it('builds base, one trimmed input, one overlay and a silent track for a single clip', () => {
    const p = plan([video([clip('/m/a.mp4', 0, 2, { sourceIn: 5, sourceOut: 7 })])]);
    assert.equal(p.duration, 2);
    assert.deepEqual([p.width, p.height, p.fps, p.frames], [1920, 1080, 30, 60]);
    assert.equal(p.inputs.length, 1);
    // The input opens 0.1 s early so the frame on screen at sourceIn is decoded.
    assert.deepEqual(p.inputs[0].args, [
      '-ss',
      '4.9',
      '-t',
      '2.101',
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
      /^\[0:v:0\]settb=AVTB,setpts=PTS-110000,fps=fps=30:round=up:start_time=0,tpad=[^,]+,trim=end_frame=60,scale=w=1920:h=1080:/,
    );
    assert.match(layer, /in_color_matrix=bt709:out_color_matrix=bt709:out_range=tv/);
    assert.ok(!layer.includes('fade') && !layer.includes('crop'));
    assert.ok(layer.endsWith('format=yuva444p[c0]'), 'a clip at 0 needs no timeline shift');
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

  it('passes the graph as a script file, and refuses what needs the compositor', () => {
    const footage = clip('/m/a.mp4', 0, 3);
    const p = plan([video([footage])], { workDir: '/work' });
    assert.deepEqual(p.files[0], { path: '/work/graph.txt', content: p.filterComplex });
    assert.equal(p.args[p.args.indexOf('-filter_complex_script') + 1], '/work/graph.txt');
    const newer = plan([video([footage])], {
      workDir: '/w',
      capabilities: { graphFlag: '-/filter_complex' },
    });
    assert.ok(newer.args.includes('-/filter_complex'));

    const title = createClip({
      clipId: 't',
      timelineStart: 1,
      timelineEnd: 3,
      text: { content: "it's; [drawtext=evil]" },
    });
    assert.throws(
      () => plan([video([title]), video([footage])]),
      (err) => err.status === 422 && /cannot draw clip "t": it has a title/.test(err.message),
    );
    // The same timeline is fine where the title is not on screen.
    const before = plan([video([title]), video([footage])], { range: { start: 0, end: 1 } });
    assert.ok(!before.filterComplex.includes('evil') && before.frames === 30);
    const blurred = clip('/m/b.mp4', 0, 1, { effects: [{ effectId: 'fx', type: 'blur' }] });
    assert.throws(() => plan([video([blurred])]), /it has an effect on a clip/);
    assert.throws(() => plan([video([footage], { opacity: 0.5 })]), /track opacity below 1/);
    assert.throws(
      () => plan([video([footage])], {}, { background: '#102030' }),
      /cannot draw this timeline: it has a background colour/,
    );
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
    // A moving crop bends the path: it is warped per frame and followed piecewise.
    const wipe = { enabled: true, startCropLeft: 0, endCropLeft: 0.5 };
    const cropped = plan([video([clip('/m/a.mp4', 0, 2, { transform: { kenBurns: wipe } })])]);
    const warped = chainOf(cropped, 'c0');
    assert.match(
      warped,
      /perspective=x0='\(0\+\(960\)\*clip\(\(on-\(1\)\)\/60,0,1\)\)':y0='0':x1='1920'/,
    );
    assert.equal(count(warped, '*clip(32*clip(t/2,0,1)-'), 32, 'height follows 32 samples');
    assert.deepEqual(cropped.warnings, []);
    const turned = { rotation: 30, kenBurns: wipe };
    const spun = plan([video([clip('/m/a.mp4', 0, 2, { transform: turned })])]);
    assert.ok(!spun.filterComplex.includes('perspective'));
    assert.match(spun.warnings[0], /clip "a.mp4@0": an animated crop is not applied to a rotated/);
  });
});
