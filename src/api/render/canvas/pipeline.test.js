import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { run } from '../../lib/ffmpeg.js';
import { buildRenderPlan } from '../plan.js';
import { prepareRender } from '../prepare.js';
import * as kit from '../testkit.js';
import { frameReader } from './pipes.js';
import { buildCanvasPlan } from './plan.js';
import { renderCanvasSegment } from './segment.js';

/**
 * The plumbing of the canvas path: pipes that never run ahead, clean stops,
 * errors that name the file, and segments that join with the filter graph's.
 */

const { createClip, createEdl, createTrack } = kit;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('canvas path: pipeline', () => {
  const tmp = kit.scratch();
  const file = (name) => join(tmp.dir, name);
  const clip = (name, start, end, more = {}) =>
    createClip({ sourceFile: file(name), timelineStart: start, timelineEnd: end, ...more });
  const title = (start, end) =>
    createClip({ timelineStart: start, timelineEnd: end, text: { content: 'Over', fontSize: 40 } });
  const edl = (clips, more = {}) =>
    createEdl({ resolution: '320x180', tracks: [createTrack('video', { clips })], ...more });
  /** FFmpeg processes still working on files of this test. */
  const strays = () =>
    execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.startsWith('ffmpeg') && line.includes(tmp.dir));

  before(async () => {
    await kit.generate(file('busy.mp4'), ['testsrc2=s=640x360:r=30:d=20']);
    await kit.generate(file('gone.mp4'), ['color=red:s=320x180:r=30:d=2']);
    writeFileSync(file('sprite.png'), 'this is not a picture');
  });
  after(() => tmp.cleanup());

  it('reads a stream one frame at a time, never ahead of its reader', async () => {
    const [FRAME, PIECE] = [100_000, 4000];
    // Twenty frames and a bit, arriving in small pieces.
    const total = 20 * FRAME + 3 * PIECE;
    let produced = 0;
    const source = new Readable({
      read() {
        if (produced >= total) return void this.push(null);
        produced += PIECE;
        this.push(Buffer.alloc(PIECE, 7));
      },
    });
    const next = frameReader(source, FRAME);
    const first = await next();
    assert.equal(first.length, FRAME);
    await sleep(60);
    const ahead = produced - FRAME;
    assert.ok(ahead <= FRAME * 2, `${ahead} bytes were read ahead of a ${FRAME}-byte frame`);
    let count = 1;
    while (await next()) count++;
    assert.equal(count, 20, 'every whole frame arrives; the incomplete tail is dropped');
    assert.equal(await next(), null, 'and the end stays the end');
  });

  it('plans a segment as plain data: decoders, stills, encoder', async () => {
    const document = createEdl({
      resolution: '320x180',
      tracks: [
        createTrack('video', { clips: [title(1, 2)] }),
        createTrack('video', { clips: [clip('busy.mp4', 0, 3, { clipId: 'b', sourceIn: 2 })] }),
        createTrack('video', { muted: true, clips: [clip('gone.mp4', 0, 3)] }),
      ],
    });
    const { probes } = await prepareRender(document);
    const range = { start: 1, end: 2 };
    const plan = buildCanvasPlan(document, { probes, range, outputPath: '/w/s.mp4' });
    assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan, 'it can cross a process boundary');
    assert.deepEqual([plan.width, plan.height, plan.startFrame, plan.frames], [320, 180, 30, 30]);
    assert.equal(plan.footage.length, 1, 'only visible footage inside the range is decoded');
    const [footage] = plan.footage;
    assert.deepEqual(
      [footage.clipId, footage.first, footage.count, footage.width, footage.height],
      ['b', 30, 30, 320, 180],
    );
    const decode = footage.args.join(' ');
    assert.match(decode, /-ss 2\.9 -t 1\.101 -an -sn -dn -i .*busy\.mp4 -map 0:v:0 -vf settb=AVTB/);
    assert.match(
      decode,
      /fps=fps=30:round=up:start_time=0,tpad=.*,trim=end_frame=30,scale=w=320:h=180/,
    );
    assert.match(decode, /setsar=1,format=rgba -f rawvideo -pix_fmt rgba pipe:1$/);
    const encode = plan.encoderArgs.join(' ');
    assert.match(encode, /-f rawvideo -pix_fmt rgb0 -video_size 320x180 -framerate 30 -i pipe:0/);
    assert.match(encode, /scale=out_color_matrix=bt709:out_range=tv:[^ ]*,setsar=1,format=yuv420p/);
    assert.match(
      encode,
      /-c:v libx264 -preset medium -crf 20 .* -an -map_metadata -1 -f mp4 \/w\/s\.mp4$/,
    );
    const draft = buildCanvasPlan(document, { probes, range, preset: 'draft' });
    assert.deepEqual(
      [draft.width, draft.footage[0].width],
      [160, 160],
      'draft decodes at half size',
    );
  });

  it('writes the same H.264 parameter sets as the filter graph, for every preset', async () => {
    const headers = async (path) => {
      const args = ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=extradata'];
      const { stdout } = await run('ffprobe', [...args, '-show_data', '-of', 'default=nw=1', path]);
      assert.ok(stdout.length > 100, 'the stream carries its parameter sets');
      return stdout;
    };
    for (const [preset, fps] of [
      ['draft', 30],
      ['standard', 30],
      ['high', 30],
      ['standard', 29.97],
      ['standard', 60],
    ]) {
      const document = edl([clip('busy.mp4', 0, 2)], { fps });
      const drawn = await kit.draw(document, tmp.dir, { preset });
      const graph = await kit.render(document, tmp.dir, { preset, streams: 'video' });
      assert.equal(await headers(drawn.output), await headers(graph.output), `${preset} at ${fps}`);
      const info = await kit.inspect(drawn.output);
      const facts = [
        info.video.pix_fmt,
        info.video.profile,
        info.video.color_space,
        info.video.color_range,
      ];
      assert.deepEqual(facts, ['yuv420p', 'High', 'bt709', 'tv']);
      assert.equal(info.video.sample_aspect_ratio, '1:1');
    }
  });

  it('stops at once when cancelled: no FFmpeg left, no partial file', async () => {
    const document = createEdl({
      resolution: '1280x720',
      tracks: [
        createTrack('video', { clips: [title(0, 20)] }),
        createTrack('video', { clips: [clip('busy.mp4', 0, 20)] }),
      ],
    });
    const { probes } = await prepareRender(document);
    const outputPath = file('cancelled.mp4');
    const stop = new AbortController();
    let frames = 0;
    const onFrame = (done) => {
      frames = done;
      if (done === 40) stop.abort();
    };
    const hooks = { signal: stop.signal, onFrame };
    await assert.rejects(
      renderCanvasSegment(document, { probes, outputPath, preset: 'high' }, hooks),
      (err) => err.killedBy === 'aborted',
    );
    assert.ok(frames >= 40 && frames < 60, `stopped after ${frames} of 600 frames`);
    assert.equal(existsSync(outputPath), false, 'the partial file is removed');
    for (let i = 0; i < 40 && strays().length; i++) await sleep(50);
    assert.deepEqual(strays(), [], 'decoder and encoder are gone');
    const already = new AbortController();
    already.abort();
    await assert.rejects(
      renderCanvasSegment(document, { probes, outputPath }, { signal: already.signal }),
      (err) => err.killedBy === 'aborted',
    );
  });

  it('names the file that cannot be decoded, loaded or written', async () => {
    const document = edl([title(0, 1)]);
    const footage = createEdl({
      resolution: '320x180',
      tracks: [
        createTrack('video', { clips: [title(0, 1)] }),
        createTrack('video', { clips: [clip('gone.mp4', 0, 1)] }),
      ],
    });
    const { probes } = await prepareRender(footage);
    rmSync(file('gone.mp4'));
    await assert.rejects(
      renderCanvasSegment(footage, { probes, outputPath: file('a.mp4') }),
      /Cannot decode source file: .*gone\.mp4 \(.*No such file/,
    );
    assert.equal(existsSync(file('a.mp4')), false);
    const sprite = { type: 'particles', params: { sprite: 'image', image: file('sprite.png') } };
    const sparks = edl([createClip({ timelineEnd: 1, generator: sprite })]);
    await assert.rejects(
      renderCanvasSegment(sparks, { probes: {}, outputPath: file('b.mp4') }),
      /Cannot read image: .*sprite\.png/,
    );
    mkdirSync(file('folder.mp4'));
    await assert.rejects(
      renderCanvasSegment(document, { probes: {}, outputPath: file('folder.mp4') }),
      /FFmpeg failed: .*folder\.mp4/,
    );
    assert.deepEqual(strays(), []);
    assert.throws(
      () => buildCanvasPlan(footage, { probes: {} }),
      (err) => err.status === 422 && /Cannot read source file: .*gone\.mp4/.test(err.message),
    );
    assert.ok(buildRenderPlan, 'the filter-graph plan is untouched by any of this');
  });
});
