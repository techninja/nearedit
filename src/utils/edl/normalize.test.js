import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEdl } from './factory.js';
import { normalizeEdl } from './normalize.js';
import { fromSavedDocument, toSavedDocument } from './savedDocument.js';
import { assertValid, clipOf, deepFreeze, layout } from './testkit.js';

const xform = {
  x: 10,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  anchorX: 0.5,
  anchorY: 0.5,
};

/** What the previous version of the app saved. */
const v1 = () =>
  deepFreeze({
    fps: 30,
    resolution: '1280x720',
    playheadPosition: 4.2,
    zoom: 2,
    scrollX: 150,
    tracks: [
      {
        trackId: 'a1',
        type: 'audio',
        name: 'Audio 1',
        muted: false,
        solo: false,
        clips: [
          {
            clipId: 'narr_1',
            sourceFile: '/m/talk.wav',
            sourceIn: 12.5,
            sourceOut: 15.5,
            timelineStart: 3,
            timelineEnd: 6,
            fadeIn: 0,
            fadeOut: 0,
            linkedClipId: 'broll_1',
            placeholder: false,
            label: 'second',
            transform: xform,
          },
          {
            clipId: 'narr_0',
            sourceFile: '/m/talk.wav',
            sourceIn: 1,
            sourceOut: 4,
            timelineStart: 0,
            timelineEnd: 3,
            fadeIn: 0,
            fadeOut: 0,
            linkedClipId: 'broll_0',
            label: 'first',
            transform: xform,
          },
        ],
      },
      {
        trackId: 'v1',
        type: 'video',
        name: 'Video 1',
        clips: [
          {
            clipId: 'broll_0',
            sourceFile: '/m/park.mp4',
            sourceIn: 0,
            sourceOut: 3,
            timelineStart: 0,
            timelineEnd: 3,
            linkedClipId: 'narr_0',
            transform: {
              ...xform,
              kenBurns: { startScale: 1, endScale: 1.3, startX: 0, endX: -50 },
            },
          },
          {
            clipId: 'broll_1',
            sourceFile: '',
            sourceIn: 0,
            sourceOut: 3,
            timelineStart: 3,
            timelineEnd: 6,
            linkedClipId: 'narr_1',
            placeholder: true,
            prompt: 'dog',
            transform: { ...xform, kenBurns: { startScale: 1, endScale: 1 } },
          },
        ],
      },
    ],
  });

describe('normalizeEdl — v1 migration', () => {
  it('produces a valid v3 document', () => {
    const edl = assertValid(normalizeEdl(v1()));
    assert.deepEqual([edl.version, edl.fps, edl.resolution], [3, 30, '1280x720']);
    assert.deepEqual(Object.keys(edl), [
      'version',
      'fps',
      'resolution',
      'background',
      'tracks',
      'markers',
      'regions',
    ]);
    assert.deepEqual(
      edl.tracks.map((t) => t.trackId),
      ['v1', 'a1'],
      'video tracks first',
    );
    assert.deepEqual(layout(edl).a1, ['narr_0 0-3', 'narr_1 3-6'], 'clips sorted');
  });

  it('fills every missing field with its default', () => {
    const edl = normalizeEdl(v1());
    const track = edl.tracks[1];
    assert.deepEqual([track.locked, track.volume, track.muted], [false, 1, false]);
    const clip = clipOf(edl, 'narr_0');
    assert.deepEqual(
      [clip.volume, clip.groupId, clip.prompt, clip.placeholder],
      [1, '', '', false],
    );
    assert.deepEqual([clip.text.content, clip.text.fontSize], ['', 72]);
    assert.deepEqual(
      [clip.transform.fit, clip.transform.x, clip.transform.cropTop],
      ['cover', 10, 0],
    );
    assert.equal(clip.transform.kenBurns.enabled, false);
  });

  it('enables ken burns when a v1 block has differing start/end values', () => {
    const edl = normalizeEdl(v1());
    const moving = clipOf(edl, 'broll_0').transform.kenBurns;
    assert.deepEqual(
      [moving.enabled, moving.endScale, moving.endX, moving.endCropLeft],
      [true, 1.3, -50, 0],
    );
    assert.equal(
      clipOf(edl, 'broll_1').transform.kenBurns.enabled,
      false,
      'identical values stay off',
    );
    const explicit = normalizeEdl({
      tracks: [
        {
          type: 'video',
          clips: [
            {
              timelineStart: 0,
              timelineEnd: 1,
              transform: { kenBurns: { enabled: false, endScale: 2 } },
            },
          ],
        },
      ],
    });
    assert.equal(
      explicit.tracks[0].clips[0].transform.kenBurns.enabled,
      false,
      'an explicit flag wins',
    );
  });

  it('accepts the early draft shape: project header, `id` keys, a bare track array', () => {
    const draft = normalizeEdl({
      project: { fps: 24, resolution: '1080x1920' },
      tracks: [
        {
          id: 'main',
          type: 'video',
          clips: [
            { id: 'c8', sourceFile: 'p.mp4', sourceIn: 12.5, sourceOut: 18, timelineStart: 0 },
          ],
        },
      ],
    });
    assert.deepEqual(
      [draft.fps, draft.resolution, draft.tracks[0].trackId],
      [24, '1080x1920', 'main'],
    );
    const clip = clipOf(assertValid(draft), 'c8');
    assert.equal(clip.timelineEnd, 5.5, 'timelineEnd derived from the source range');
    const bare = assertValid(normalizeEdl([{ type: 'audio', clips: [] }]));
    assert.deepEqual(
      bare.tracks.map((t) => t.type),
      ['video', 'audio'],
    );
  });

  it('is idempotent and leaves a valid document deep-equal', () => {
    const once = normalizeEdl(v1());
    assert.deepEqual(normalizeEdl(once), once);
    const fresh = createEdl();
    assert.deepEqual(normalizeEdl(fresh), fresh);
  });
});

describe('saved document', () => {
  it('splits a loaded document into EDL and view, and merges them back', () => {
    const { edl, view } = fromSavedDocument(v1());
    assert.deepEqual(view, { playheadPosition: 4.2, cursorPosition: 0, zoom: 2, scrollX: 150 });
    assert.equal(edl.playheadPosition, undefined);
    const saved = toSavedDocument(edl, {
      ...view,
      playheadPosition: 9,
      selection: ['x'],
      playing: true,
    });
    assert.deepEqual(Object.keys(saved), [
      'version',
      'fps',
      'resolution',
      'background',
      'tracks',
      'markers',
      'regions',
      'playheadPosition',
      'cursorPosition',
      'zoom',
      'scrollX',
    ]);
    assert.equal(saved.tracks, edl.tracks);
    const again = fromSavedDocument(JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(again.edl, edl);
    assert.equal(again.view.playheadPosition, 9);
  });

  it('sanitises view fields', () => {
    assert.deepEqual(
      fromSavedDocument({ zoom: 0, scrollX: -5, playheadPosition: 'x', cursorPosition: '2.5' })
        .view,
      { playheadPosition: 0, cursorPosition: 2.5, zoom: 1, scrollX: 0 },
    );
    assert.deepEqual(fromSavedDocument(null).view, {
      playheadPosition: 0,
      cursorPosition: 0,
      zoom: 1,
      scrollX: 0,
    });
    assert.equal(
      fromSavedDocument({ project: { playheadPosition: 45.2 } }).view.playheadPosition,
      45.2,
    );
    assert.deepEqual(toSavedDocument(createEdl()).zoom, 1);
  });
});
