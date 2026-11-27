import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import { mapMediaPaths, renderImages } from './mediaPaths.js';
import { workerCount } from './parts.js';
import { lastPass } from './passes.js';
import { probes } from './planKit.js';
import { renderSegments } from './segments.js';

describe('render: the files a document names', () => {
  const sprite = {
    type: 'particles',
    seed: 1,
    params: { sprite: 'image', image: 'spark.png', rate: 5 },
  };
  const document = () =>
    createEdl({
      tracks: [
        createTrack('video', {
          clips: [
            createClip({ clipId: 'p', timelineEnd: 2, generator: sprite }),
            createClip({ clipId: 'f', sourceFile: 'a.mp4', timelineStart: 2, timelineEnd: 4 }),
            createClip({ clipId: 't', timelineStart: 4, timelineEnd: 5, text: { content: 'x' } }),
          ],
        }),
        createTrack('video', {
          muted: true,
          clips: [createClip({ sourceFile: 'still.png', timelineEnd: 1 })],
        }),
        createTrack('audio', { clips: [createClip({ sourceFile: 'voice.wav', timelineEnd: 1 })] }),
      ],
    });

  it('passes every path through the resolver, saying where it is', () => {
    const seen = [];
    const edl = document();
    const mapped = mapMediaPaths(edl, (path, where) => {
      seen.push([where, path]);
      return `/root/${path}`;
    });
    assert.deepEqual(seen, [
      ['tracks[0].clips[0].generator.params.image', 'spark.png'],
      ['tracks[0].clips[1].sourceFile', 'a.mp4'],
      ['tracks[1].clips[0].sourceFile', 'still.png'],
      ['tracks[2].clips[0].sourceFile', 'voice.wav'],
    ]);
    const [particles, footage, title] = mapped.tracks[0].clips;
    assert.equal(particles.generator.params.image, '/root/spark.png');
    assert.deepEqual([particles.generator.params.rate, particles.generator.seed], [5, 1]);
    assert.equal(footage.sourceFile, '/root/a.mp4');
    assert.equal(title.sourceFile, '', 'a clip without a file stays without one');
    assert.equal(edl.tracks[0].clips[0].generator.params.image, 'spark.png', 'nothing is mutated');
    assert.equal(mapped.tracks[1].clips[0].sourceFile, '/root/still.png', 'muted tracks too');
    assert.throws(() => mapMediaPaths(edl, () => assert.fail('refused')), /refused/);
  });

  it('lists the images the visible tracks draw', () => {
    assert.deepEqual(renderImages(document()), ['spark.png'], 'not the still on the muted track');
    const shown = document();
    shown.tracks[1].muted = false;
    assert.deepEqual(renderImages(shown).sort(), ['spark.png', 'still.png']);
    assert.deepEqual(renderImages({}), []);
  });

  it('bounds the number of segments rendered at once', () => {
    assert.equal(workerCount({ RENDER_WORKERS: '3' }), 3);
    assert.equal(workerCount({ RENDER_WORKERS: '99' }), 16);
    const automatic = workerCount({});
    assert.ok(automatic >= 1 && automatic <= 4, `default ${automatic}`);
    assert.equal(workerCount({ RENDER_WORKERS: 'many' }), automatic);
    assert.equal(workerCount({ RENDER_WORKERS: '0' }), automatic);
  });

  it('shows the single pass for plain footage and the joining pass otherwise', () => {
    const footage = createClip({ sourceFile: '/m/a.mp4', timelineEnd: 4 });
    const title = createClip({ timelineStart: 1, timelineEnd: 3, text: { content: 'x' } });
    const plain = createEdl({
      tracks: [createTrack('video', { clips: [footage] }), createTrack('audio')],
    });
    const single = lastPass(plain, { probes }, renderSegments(plain, { engine: 'auto' }));
    assert.ok(single.args.includes('[vout]') && single.filterComplex.includes('overlay'));
    const mixed = { ...plain, tracks: [createTrack('video', { clips: [title] }), ...plain.tracks] };
    const segments = renderSegments(mixed, { engine: 'auto' });
    assert.deepEqual(
      segments.map((s) => s.engine),
      ['ffmpeg', 'canvas', 'ffmpeg'],
    );
    const joined = lastPass(mixed, { probes, workDir: '/w' }, segments);
    assert.ok(joined.args.includes('copy') && !joined.filterComplex.includes('overlay'));
    assert.equal(
      joined.files[0].content,
      'ffconcat version 1.0\nfile segment-00000.mp4\nduration 1\nfile segment-00001.mp4\nduration 2\nfile segment-00002.mp4\nduration 1\n',
    );
    assert.equal(joined.frames, 120);
  });
});
