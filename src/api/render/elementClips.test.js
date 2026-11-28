import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { builtinKit, normalizeKit, resolveKit } from '#utils/brand/index.js';
import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import { insertElement } from '#utils/edl/index.js';
import { mapMediaPaths, renderImages } from './mediaPaths.js';
import { checkEngine, clipNeeds, REASONS } from './route.js';
import { renderableClips, renderSources } from './scope.js';
import { renderSegments } from './segments.js';

const footage = (start, end) =>
  createClip({
    clipId: `f${start}`,
    sourceFile: '/m/a.mp4',
    timelineStart: start,
    timelineEnd: end,
  });
const base = () =>
  createEdl({
    tracks: [
      createTrack('video', { trackId: 'v1', clips: [footage(0, 10)] }),
      createTrack('audio', { trackId: 'a1' }),
    ],
  });
const CLEAN = resolveKit(builtinKit('clean'));
const ACME = resolveKit(
  normalizeKit({
    id: 'acme',
    tokens: { logo: { mark: 'mark.png' }, font: { heading: { family: 'Acme Sans', weight: 700 } } },
    fonts: [{ family: 'Acme Sans', weight: 700, file: 'fonts/Bold.woff2' }],
  }),
);

describe('render: element clips', () => {
  it('send their stretch of the timeline to the canvas renderer', () => {
    const edl = insertElement(
      base(),
      CLEAN,
      'lower-third',
      { name: 'Ada' },
      { time: 4, duration: 2 },
    );
    const [track] = edl.tracks;
    assert.deepEqual(clipNeeds(track.clips[0], track), ['element']);
    assert.equal(REASONS.element, 'a brand element');
    assert.deepEqual(
      renderSegments(edl).map((segment) => [
        segment.start,
        segment.end,
        segment.engine,
        segment.reasons,
      ]),
      [
        [0, 4, 'ffmpeg', []],
        [4, 6, 'canvas', ['element']],
        [6, 10, 'ffmpeg', []],
      ],
    );
    assert.throws(() => checkEngine(['element'], 'ffmpeg'), /it has a brand element/);
  });

  it('are rendered, and read no file of their own', () => {
    const edl = insertElement(base(), CLEAN, 'intro', { title: 'T' }, { time: 0, duration: 3 });
    const kinds = renderableClips(edl).map(({ kind }) => kind);
    assert.deepEqual(kinds.sort(), ['element', 'video']);
    assert.deepEqual(renderSources(edl), ['/m/a.mp4']);
    assert.deepEqual(
      renderSegments(edl)[0].engine,
      'canvas',
      'a segment element alone on the timeline draws',
    );
  });

  it('pass the pictures and fonts inside their designs, and the font table, through the allow-list', () => {
    let edl = insertElement(base(), ACME, 'bug', {}, { time: 0 });
    edl = insertElement(edl, ACME, 'lower-third', { name: 'Ada' }, { time: 2 });
    const seen = [];
    const mapped = mapMediaPaths(edl, (path, where) => {
      seen.push([where, path]);
      return path.startsWith('/') ? path : `/kits/acme/${path}`;
    });
    const where = seen.map(([at]) => at.replace(/tracks\[\d\]\.clips\[\d\]/, 'CLIP'));
    assert.ok(where.includes('CLIP.element.design.layers[0].src'), 'the logo of the bug');
    assert.ok(where.includes('CLIP.element.design.fonts[0].file'), 'the font file a design names');
    assert.ok(where.includes('fonts[0].file'), "and the document's own table");
    assert.deepEqual(mapped.fonts, [
      { family: 'Acme Sans', weight: 700, style: 'normal', file: '/kits/acme/fonts/Bold.woff2' },
    ]);
    assert.deepEqual(renderImages(mapped), ['/kits/acme/mark.png']);
    const designs = mapped.tracks.flatMap((track) => track.clips).filter((clip) => clip.element);
    assert.ok(
      designs.every((clip) =>
        (clip.element.design.fonts || []).every((face) => face.file.startsWith('/kits/acme/')),
      ),
    );
    assert.equal(edl.fonts[0].file, 'fonts/Bold.woff2', 'the document itself is not changed');
    assert.throws(
      () =>
        mapMediaPaths(edl, (path) => {
          if (path.endsWith('.woff2')) throw new Error('outside');
          return path;
        }),
      /outside/,
      'a refusal stops the render',
    );
  });
});
