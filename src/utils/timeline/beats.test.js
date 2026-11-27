import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip, createEdl } from '#utils/edl/factory.js';
import { snapCandidates, snapTime } from '#utils/edl/index.js';
import { beatSnapTimes, MIN_BEAT_PX } from './beats.js';

/** 120 BPM: a beat every half second for 16 s. */
const BEATS = Array.from({ length: 33 }, (_, i) => i * 0.5);
const lookup = (path) => (path === '/m/music.mp3' ? BEATS : []);

/** Music from source 2 s..10 s placed at 4 s on the second audio track. */
function doc(extra = {}) {
  const edl = createEdl();
  const music = createClip({
    clipId: 'music',
    sourceFile: '/m/music.mp3',
    sourceIn: 2,
    sourceOut: 10,
    timelineStart: 4,
    timelineEnd: 12,
  });
  edl.tracks[1].clips.push(
    createClip({ clipId: 'talk', sourceFile: '/m/talk.mp4', sourceOut: 5, timelineEnd: 5 }),
  );
  edl.tracks.push({ ...edl.tracks[1], trackId: 'a2', name: 'Music', clips: [music], ...extra });
  return edl;
}

describe('beat snap times', () => {
  it('maps the beats inside a clip from source time to timeline time', () => {
    const times = beatSnapTimes(doc(), 100, { lookup });
    assert.equal(times[0], 4, 'source 2.0 s is the clip start');
    assert.equal(times[1], 4.5);
    assert.equal(times[times.length - 1], 12, 'source 10.0 s is the clip end');
    assert.equal(times.length, 17);
  });

  it('offers nothing when beats would be too close together to aim at', () => {
    const spacingPx = 0.5 * 40; // 20 px at 40 px/s
    assert.ok(spacingPx < MIN_BEAT_PX);
    assert.deepEqual(beatSnapTimes(doc(), 40, { lookup }), []);
    assert.ok(beatSnapTimes(doc(), 48, { lookup }).length > 0, '24 px apart is enough');
  });

  it('ignores muted tracks, the dragged clip and files without beats', () => {
    assert.deepEqual(beatSnapTimes(doc({ muted: true }), 100, { lookup }), []);
    assert.deepEqual(beatSnapTimes(doc(), 100, { lookup, exclude: ['music'] }), []);
    assert.deepEqual(beatSnapTimes(doc(), 100, { lookup: () => [] }), []);
  });

  it('feeds the snapping engine as extra candidates', () => {
    const edl = doc();
    const extra = beatSnapTimes(edl, 100, { lookup });
    const candidates = snapCandidates(edl, { exclude: ['talk'], extra });
    const hit = snapTime(edl, 6.46, { threshold: 0.1, candidates });
    assert.deepEqual([hit.snapped, hit.time, hit.target.type], [true, 6.5, 'extra']);
    const miss = snapTime(edl, 6.25, { threshold: 0.1, candidates });
    assert.equal(miss.snapped, false, 'halfway between two beats is left alone');
  });
});
