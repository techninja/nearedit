import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { createEdl } from '#utils/edl/factory.js';
import { deepFreeze, testClip, testEdl } from '#utils/edl/testkit.js';
import { summarize } from '#utils/editor/summary.js';

describe('summarize', () => {
  it('describes the empty document: its default tracks, no clips, no length', () => {
    assert.deepEqual(summarize(createEdl()), {
      revision: 0,
      fps: 30,
      resolution: '1920x1080',
      duration: 0,
      trackCount: 2,
      clipCount: 0,
    });
  });

  it('is what TimelineState holds before the first change', () => {
    assert.deepEqual({ ...store.get(TimelineState) }, summarize(createEdl()));
  });

  it('counts tracks and clips and measures to the end of the last clip', () => {
    const doc = testEdl(
      {
        v2: [testClip('title', 1, 3)],
        v1: [testClip('a', 0, 4), testClip('b', 4, 9.5)],
        a1: [testClip('music', 0, 8)],
      },
      { fps: 24, resolution: '1080x1920' },
    );
    assert.deepEqual(summarize(deepFreeze(doc), 7), {
      revision: 7,
      fps: 24,
      resolution: '1080x1920',
      duration: 9.5,
      trackCount: 3,
      clipCount: 4,
    });
  });

  it('carries nothing else of the document, whatever it holds', () => {
    const clip = testClip('fx', 0, 2, { effects: [{ type: 'blur', params: { radius: 8 } }] });
    const doc = testEdl({ v1: [clip] }, { background: '#101010' });
    doc.markers.push({ markerId: 'm', time: 1, label: 'x', color: '' });
    assert.deepEqual(Object.keys(summarize(doc, 1)).sort(), [
      'clipCount',
      'duration',
      'fps',
      'resolution',
      'revision',
      'trackCount',
    ]);
  });

  it('survives a document with parts missing', () => {
    const blank = { revision: 0, fps: 30, resolution: '1920x1080', duration: 0, clipCount: 0 };
    assert.deepEqual(summarize({}), { ...blank, trackCount: 0 });
    assert.deepEqual(summarize({ tracks: [{ trackId: 'v1', type: 'video' }] }), {
      ...blank,
      trackCount: 1,
    });
  });
});
