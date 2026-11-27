import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEdl } from './factory.js';
import {
  addMarker,
  moveMarker,
  removeMarker,
  renameMarker,
  retimeMarkers,
  updateMarker,
} from './markers.js';
import { assertValid, deepFreeze } from './testkit.js';

const three = () => {
  let edl = createEdl();
  edl = addMarker(edl, 12.5, { markerId: 'chorus', label: 'Chorus', color: '#f00' });
  edl = addMarker(edl, 3, { markerId: 'intro' });
  edl = addMarker(edl, 20, { markerId: 'end' });
  return deepFreeze(edl);
};
const order = (edl) => edl.markers.map((marker) => marker.markerId);

describe('markers', () => {
  it('adds markers sorted by time, on the frame grid, never below 0', () => {
    const edl = assertValid(three());
    assert.deepEqual(order(edl), ['intro', 'chorus', 'end']);
    assert.deepEqual(edl.markers[1], {
      markerId: 'chorus',
      time: 12.5,
      label: 'Chorus',
      color: '#f00',
    });
    const snapped = addMarker(edl, 1.01);
    assert.equal(snapped.markers[0].time, 1);
    assert.ok(snapped.markers[0].markerId, 'gets an id of its own');
    assert.equal(addMarker(edl, -3).markers[0].time, 0);
    assert.equal(addMarker(edl, NaN), edl);
  });

  it('never duplicates a marker id', () => {
    const edl = addMarker(three(), 5, { markerId: 'intro' });
    assert.equal(new Set(order(edl)).size, 4);
    assertValid(edl);
  });

  it('moves a marker and keeps the list sorted', () => {
    const edl = assertValid(moveMarker(three(), 'intro', 15.02));
    assert.deepEqual(order(edl), ['chorus', 'intro', 'end']);
    assert.ok(Math.abs(edl.markers[1].time - 15 - 1 / 30) < 1e-9);
    const start = three();
    assert.equal(moveMarker(start, 'intro', 3), start, 'same time: same document');
    assert.equal(moveMarker(start, 'ghost', 9), start);
    assert.equal(moveMarker(start, 'intro', Infinity), start);
  });

  it('renames and recolours', () => {
    const start = three();
    const edl = renameMarker(start, 'intro', 'Cold open');
    assert.equal(edl.markers[0].label, 'Cold open');
    assert.equal(edl.markers[1], start.markers[1], 'other markers are shared');
    assert.equal(updateMarker(edl, 'intro', { color: '#0f0' }).markers[0].color, '#0f0');
    assert.equal(renameMarker(start, 'chorus', 'Chorus'), start);
    assert.equal(updateMarker(start, 'chorus', { label: 5 }), start, 'wrong types are ignored');
  });

  it('removes', () => {
    const start = three();
    assert.deepEqual(order(removeMarker(start, 'chorus')), ['intro', 'end']);
    assert.equal(removeMarker(start, 'ghost'), start);
  });

  it('retimeMarkers shifts or drops markers (used by ripple edits)', () => {
    const edl = retimeMarkers(three(), (time) =>
      time > 10 ? (time < 15 ? null : time - 5) : time,
    );
    assert.deepEqual(
      edl.markers.map((m) => [m.markerId, m.time]),
      [
        ['intro', 3],
        ['end', 15],
      ],
    );
    const start = three();
    assert.equal(
      retimeMarkers(start, (time) => time),
      start,
    );
  });
});
