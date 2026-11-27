import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addMarker } from './markers.js';
import { addRegion, regionsOf } from './regions.js';
import { rippleDelete, rippleDeleteRange, rippleInsert } from './ripple.js';
import { assertValid, deepFreeze, testClip, testEdl } from './testkit.js';

/** v1: a 0–4, b 4–8, c 8–12. Regions: "early" 1–3, "over-b" 5–7, "late" 9–11. Marker at 10. */
function doc() {
  let edl = testEdl({
    v1: [testClip('a', 0, 4), testClip('b', 4, 8), testClip('c', 8, 12)],
    a1: [],
  });
  edl = addRegion(edl, 1, 3, { label: 'early' });
  edl = addRegion(edl, 5, 7, { label: 'over-b' });
  edl = addRegion(edl, 9, 11, { label: 'late' });
  return deepFreeze(addMarker(edl, 10, { markerId: 'm' }));
}
const spans = (edl) => Object.fromEntries(regionsOf(edl).map((r) => [r.label, [r.start, r.end]]));

describe('regions follow ripple edits, as markers do', () => {
  it('ripple insert pushes the regions after the gap', () => {
    const out = assertValid(rippleInsert(doc(), 4, 2));
    assert.deepEqual(spans(out), { early: [1, 3], 'over-b': [7, 9], late: [11, 13] });
    assert.equal(out.markers[0].time, 12);
  });

  it('ripple insert inside a region stretches it', () => {
    const out = assertValid(rippleInsert(doc(), 6, 2));
    assert.deepEqual(spans(out)['over-b'], [5, 9]);
  });

  it('ripple delete of a range pulls later regions back and drops one that is gone', () => {
    const out = assertValid(rippleDeleteRange(doc(), 4, 8));
    assert.deepEqual(spans(out), { early: [1, 3], late: [5, 7] });
    assert.equal(out.markers[0].time, 6);
  });

  it('a region only partly inside the removed range keeps what is left of it', () => {
    const out = assertValid(rippleDeleteRange(doc(), 6, 10));
    assert.deepEqual(spans(out), { early: [1, 3], 'over-b': [5, 6], late: [6, 7] });
    assert.equal(out.markers.length, 1, 'the marker at the range end survives');
  });

  it('ripple delete of a clip on all tracks moves regions with the timeline', () => {
    const out = assertValid(rippleDelete(doc(), ['b'], { scope: 'all' }));
    assert.deepEqual(spans(out).late, [5, 7]);
    assert.equal(spans(out).early[0], 1);
  });

  it('a ripple limited to one track leaves regions and markers alone', () => {
    const out = assertValid(rippleDelete(doc(), ['b'], { scope: 'track' }));
    assert.deepEqual(spans(out), spans(doc()));
    assert.equal(out.markers[0].time, 10);
  });
});
