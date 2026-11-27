import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip, createEdl } from '#utils/edl/factory.js';
import { clipsInside, directorContext, directorRange, insertTime } from './context.js';
import { isEmptyTimeline } from './context.js';

function sampleDoc() {
  const doc = createEdl();
  const clip = (clipId, timelineStart, timelineEnd) =>
    createClip({
      clipId,
      sourceFile: '/m/a.mp4',
      sourceOut: timelineEnd - timelineStart,
      timelineStart,
      timelineEnd,
    });
  doc.tracks[0].clips.push(clip('a', 0, 4), clip('b', 4, 9), clip('c', 12, 15));
  doc.tracks[1].clips.push(clip('d', 2, 20));
  return doc;
}

describe('directorRange', () => {
  const doc = sampleDoc();

  it('uses the loop region when one is set', () => {
    const range = directorRange({ loopStart: 3, loopEnd: 8, selection: ['c'] }, doc);
    assert.deepEqual(range, { start: 3, end: 8, source: 'loop' });
  });

  it('falls back to the span of the selected clips', () => {
    assert.deepEqual(directorRange({ loopStart: 0, loopEnd: 0, selection: ['b', 'c'] }, doc), {
      start: 4,
      end: 15,
      source: 'selection',
    });
    assert.deepEqual(directorRange({ selection: ['a'] }, doc), {
      start: 0,
      end: 4,
      source: 'selection',
    });
  });

  it('is null with neither a loop region nor a usable selection', () => {
    assert.equal(directorRange({ loopStart: 5, loopEnd: 5, selection: [] }, doc), null);
    assert.equal(directorRange({ selection: ['gone'] }, doc), null);
    assert.equal(directorRange({}, doc), null);
  });
});

describe('insertTime', () => {
  it('is the playhead while paused and the cursor while playing', () => {
    const view = { playheadPosition: 7.5, cursorPosition: 2 };
    assert.equal(insertTime(view, false), 7.5);
    assert.equal(insertTime(view, true), 2);
    assert.equal(insertTime({}, false), 0);
  });
});

describe('directorContext', () => {
  it('carries cursor, selection and the range when there is one', () => {
    const view = {
      playheadPosition: 6,
      cursorPosition: 6,
      loopStart: 1,
      loopEnd: 3,
      selection: ['a'],
    };
    assert.deepEqual(directorContext(view, sampleDoc(), false), {
      playheadPosition: 6,
      selection: ['a'],
      range: { start: 1, end: 3 },
    });
  });

  it('leaves the range out when there is none', () => {
    const context = directorContext({ playheadPosition: 1, selection: [] }, sampleDoc(), false);
    assert.equal('range' in context, false);
  });
});

describe('timeline facts', () => {
  it('knows an empty timeline', () => {
    assert.equal(isEmptyTimeline(createEdl()), true);
    assert.equal(isEmptyTimeline(sampleDoc()), false);
    assert.equal(isEmptyTimeline(null), true);
  });

  it('counts clips touching a range, skipping locked tracks', () => {
    const doc = sampleDoc();
    assert.equal(clipsInside(doc, { start: 3, end: 5 }), 3, 'a, b and d');
    assert.equal(clipsInside(doc, { start: 9, end: 12 }), 1, 'only d: touching edges do not count');
    doc.tracks[1].locked = true;
    assert.equal(clipsInside(doc, { start: 9, end: 12 }), 0);
  });
});
