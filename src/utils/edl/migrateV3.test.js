import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './index.js';
import { assertValid, clipOf, deepFreeze, layout } from './testkit.js';

describe('schema v3 — migration of older documents', () => {
  const v2 = () => ({
    version: 2,
    fps: 30,
    resolution: '1280x720',
    tracks: [
      {
        trackId: 'v1',
        type: 'video',
        name: 'V',
        clips: [
          {
            clipId: 'vid',
            sourceFile: '/m/a.mp4',
            sourceIn: 3,
            sourceOut: 5,
            timelineStart: 0,
            timelineEnd: 2,
          },
          {
            clipId: 'pic',
            sourceFile: '/m/a.png',
            sourceIn: 0,
            sourceOut: 0,
            timelineStart: 2,
            timelineEnd: 6,
          },
          {
            clipId: 'ttl',
            sourceFile: '',
            sourceIn: 9,
            sourceOut: 1,
            timelineStart: 6,
            timelineEnd: 9,
            text: { content: 'Hi' },
            fadeIn: 0.5,
          },
          {
            clipId: 'ph',
            sourceFile: '',
            sourceIn: 0,
            sourceOut: 5,
            timelineStart: 9,
            timelineEnd: 10,
            placeholder: true,
          },
        ],
      },
      { trackId: 'a1', type: 'audio', name: 'A', clips: [] },
    ],
    markers: [{ markerId: 'm', time: 1, label: '', color: '' }],
  });

  it('a v2 document becomes the same picture: same clips, same times, v3 defaults', () => {
    const edl = assertValid(E.normalizeEdl(deepFreeze(v2())));
    assert.equal(edl.version, 3);
    assert.deepEqual(layout(edl).v1, ['vid 0-2', 'pic 2-6', 'ttl 6-9', 'ph 9-10']);
    const windows = edl.tracks[0].clips.map((c) => [c.sourceIn, c.sourceOut]);
    assert.deepEqual(
      windows,
      [
        [3, 5],
        [0, 4],
        [0, 3],
        [0, 1],
      ],
      'free clips get a window from 0',
    );
    const title = clipOf(edl, 'ttl');
    assert.deepEqual([title.fadeIn, title.text.content, title.fadeInCurve], [0.5, 'Hi', 'linear']);
    assert.deepEqual([title.effects, title.keyframes, title.generator.type], [[], {}, '']);
    assert.deepEqual(edl.markers, v2().markers);
    assert.deepEqual(E.normalizeEdl(edl), edl, 'and is stable from then on');
  });

  it('a v3 document keeps the source window of its free clips, also below 0', () => {
    const raw = { ...v2(), version: 3 };
    raw.tracks[0].clips[2] = { ...raw.tracks[0].clips[2], sourceIn: -2, sourceOut: 99 };
    const title = clipOf(assertValid(E.normalizeEdl(raw)), 'ttl');
    assert.deepEqual([title.sourceIn, title.sourceOut], [-2, 1], 'the timeline span stands');
    const video = { ...raw.tracks[0].clips[0], sourceIn: -1, sourceOut: 1 };
    raw.tracks[0].clips[0] = video;
    assert.equal(clipOf(E.normalizeEdl(raw), 'vid').sourceIn, 0, 'media stays inside its source');
  });

  it('a hand-written document without a version keeps the window of its v3 clips', () => {
    const keyframes = {
      'transform.x': [
        { t: 2, v: 0 },
        { t: 5, v: 300 },
      ],
    };
    const clip = (extra) => ({ timelineStart: 0, timelineEnd: 3, sourceIn: 2, ...extra });
    const raw = {
      tracks: [
        { type: 'video', clips: [clip({ clipId: 'g', generator: { type: 'solid' }, keyframes })] },
        { type: 'video', clips: [clip({ clipId: 't', text: { content: 'Hi' }, keyframes })] },
        { type: 'video', clips: [clip({ clipId: 'plain', text: { content: 'Old' } })] },
      ],
    };
    const edl = assertValid(E.normalizeEdl(raw));
    const windows = ['g', 't', 'plain'].map((id) => [
      clipOf(edl, id).sourceIn,
      clipOf(edl, id).sourceOut,
    ]);
    assert.deepEqual(windows, [
      [2, 5],
      [2, 5],
      [0, 3],
    ]);
    assert.equal(E.resolveClip(clipOf(edl, 'g'), 1.5).transform.x, 150);
  });

  it('carries regions, sanitised like markers', () => {
    const raw = {
      ...v2(),
      regions: [{ start: 4.01, end: 1 }, { regionId: 'r', start: 0, end: 0 }, 'x'],
    };
    const edl = assertValid(E.normalizeEdl(raw));
    assert.deepEqual(
      edl.regions.map((r) => [r.start, r.end, r.label]),
      [
        [0, 1 / 30, ''],
        [1, 4, ''],
      ],
    );
    assert.equal(edl.regions[0].regionId, 'r');
  });
});
