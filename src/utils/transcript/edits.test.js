import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { timelineDuration } from '../edl/query.js';
import { assertValid, clipOf, deepFreeze } from '../edl/testkit.js';
import { cutClipRange } from './cutRange.js';
import {
  cutSource,
  cutSpan,
  insertSourceRange,
  keepSource,
  keepSpan,
  markSource,
} from './edits.js';
import { TALK, TALK_SIDECAR, pieces, talkEdl } from './testkit.js';
import { transcriptUnits, unitEdges } from './units.js';
import { OFF, sourceChain, unitStates } from './usage.js';

const { units } = transcriptUnits(TALK_SIDECAR);
const edges = unitEdges(units);
const durations = { [TALK]: 15 };
const chainOf = (edl, focusClipId = 'v') => sourceChain(edl, TALK, { focusClipId });
const frames = (seconds) => Math.round(seconds * 30);
/** Indexes of the units that are still in the edit. */
const remaining = (edl) =>
  unitStates(units, sourceChain(edl, TALK, { trackId: 'v1' }).segments)
    .map((state, i) => (state === OFF ? -1 : i))
    .filter((i) => i >= 0);
const except = (first, last) => units.map((_, i) => i).filter((i) => i < first || i > last);

/** Picture and sound must stay piece-for-piece identical and linked to each other. */
function assertInSync(edl) {
  const picture = pieces(edl, 'v1');
  const sound = pieces(edl, 'a1');
  assert.equal(picture.length, sound.length, 'same number of pieces');
  picture.forEach((piece, i) => {
    assert.equal(piece.span, sound[i].span, `piece ${i} timeline span`);
    assert.equal(piece.source, sound[i].source, `piece ${i} source range`);
    assert.equal(piece.link, sound[i].id, `piece ${i} picture → sound link`);
    assert.equal(sound[i].link, piece.id, `piece ${i} sound → picture link`);
  });
  assertValid(edl, { sourceDurations: durations });
}

describe('cutSource', () => {
  it('cuts a sentence out of a linked pair and closes the timeline by exactly that span', () => {
    const start = deepFreeze(talkEdl());
    const span = cutSpan(units, edges, 4, 8); // "It runs in the browser."
    const out = cutSource(start, chainOf(start), span);
    assertInSync(out);
    assert.equal(pieces(out, 'v1').length, 2);
    const removed = frames(span.end) - frames(span.start);
    assert.equal(
      frames(timelineDuration(start)) - frames(timelineDuration(out)),
      0,
      'music still ends last',
    );
    assert.equal(
      frames(clipOf(start, 'later').timelineStart - clipOf(out, 'later').timelineStart),
      removed,
    );
    assert.equal(frames(start.markers[0].time - out.markers[0].time), removed, 'markers follow');
    assert.deepEqual(remaining(out), except(4, 8));
    assert.equal(clipOf(out, 'music').timelineEnd, 40, 'a bed that spans the cut plays through');
  });

  it('keeps the pause before the cut and takes the one after it', () => {
    const span = cutSpan(units, edges, 4, 8);
    assert.ok(Math.abs(span.start - (units[4].start - 0.04)) < 1e-9);
    assert.ok(Math.abs(span.end - (units[9].start - 0.04)) < 1e-9);
    const last = cutSpan(units, edges, units.length - 2, units.length - 1);
    assert.ok(Math.abs(last.end - (units.at(-1).end + 0.12)) < 1e-9);
  });

  it('cuts again across the join of an earlier cut', () => {
    const first = cutSource(talkEdl(), chainOf(talkEdl()), cutSpan(units, edges, 4, 8));
    const out = cutSource(first, chainOf(first), cutSpan(units, edges, 2, 10));
    assertInSync(out);
    assert.deepEqual(remaining(out), except(2, 10));
    assert.equal(pieces(out, 'v1').length, 2);
  });

  it('cuts at the very start and the very end of the clip', () => {
    const edl = talkEdl();
    const head = cutSource(edl, chainOf(edl), { start: -5, end: edges[4] });
    assertInSync(head);
    assert.deepEqual(remaining(head), except(0, 3));
    assert.equal(
      pieces(head, 'v1')[0].span.split('-')[0],
      '2.0000',
      'the rest moved up to the clip start',
    );
    const tail = cutSource(edl, chainOf(edl), cutSpan(units, edges, 19, 21));
    assertInSync(tail);
    assert.deepEqual(remaining(tail), except(19, 21));
    assert.equal(pieces(tail, 'v1').length, 2, 'the silent tail after the last word stays');
  });

  it('removes the whole clip when everything is cut, and leaves locked tracks alone', () => {
    const edl = talkEdl();
    const out = cutSource(edl, chainOf(edl), { start: 0, end: 99 });
    assertValid(out);
    assert.deepEqual([pieces(out, 'v1'), pieces(out, 'a1')], [[], []]);
    assert.equal(clipOf(out, 'later').timelineStart, 2);
    const locked = {
      ...edl,
      tracks: edl.tracks.map((t) => (t.trackId === 'v1' ? { ...t, locked: true } : t)),
    };
    assert.equal(cutSource(locked, chainOf(locked), cutSpan(units, edges, 4, 8)), locked);
  });

  it('follows a slipped clip that starts mid-source on a 24 fps timeline', () => {
    const edl = talkEdl({ at: 1, sourceIn: 2.2, sourceOut: 12.2, fps: 24 });
    const out = cutSource(edl, chainOf(edl), cutSpan(units, edges, 9, 13));
    assertValid(out);
    const inClip = units.map((u, i) =>
      (u.start + u.end) / 2 >= 2.2 && (u.start + u.end) / 2 < 12.2 ? i : -1,
    );
    assert.deepEqual(
      remaining(out),
      inClip.filter((i) => i >= 0 && (i < 9 || i > 13)),
    );
  });

  it('ignores ranges shorter than a frame and clips it does not know', () => {
    const edl = talkEdl();
    assert.equal(cutClipRange(edl, 'v', 3, 3.01), edl);
    assert.equal(cutClipRange(edl, 'nope', 3, 5), edl);
    assert.equal(cutClipRange(edl, 'v', 30, 35), edl);
  });
});

describe('keepSource', () => {
  it('trims the pair to the selection, keeps the clip ids and closes up', () => {
    const start = deepFreeze(talkEdl());
    const out = keepSource(start, chainOf(start), keepSpan(units, edges, 9, 13), {
      sourceDurations: durations,
    });
    assertInSync(out);
    assert.deepEqual(
      pieces(out, 'v1').map((p) => p.id),
      ['v'],
    );
    assert.deepEqual(remaining(out), [9, 10, 11, 12, 13]);
    const kept = clipOf(out, 'v');
    assert.equal(kept.timelineStart, 2, 'the clip stays where it started');
    assert.equal(clipOf(out, 'later').timelineStart, kept.timelineEnd, 'later clips close up');
  });

  it('drops pieces outside the range after earlier cuts', () => {
    const cut = cutSource(talkEdl(), chainOf(talkEdl()), cutSpan(units, edges, 4, 8));
    const out = keepSource(cut, chainOf(cut), keepSpan(units, edges, 0, 3));
    assertInSync(out);
    assert.deepEqual(remaining(out), [0, 1, 2, 3]);
    assert.equal(pieces(out, 'v1').length, 1);
  });

  it('never reaches into the next word', () => {
    const span = keepSpan(units, edges, 0, 0);
    assert.ok(span.end <= edges[1]);
    assert.ok(span.end > units[0].end);
  });
});

describe('insertSourceRange and markSource', () => {
  const item = {
    filename: 'talk.mp4',
    filePath: TALK,
    type: 'video',
    duration: 15,
    hasAudio: true,
  };

  it('inserts the words as a new linked clip at a time', () => {
    const edl = talkEdl();
    const span = keepSpan(units, edges, 14, 18);
    const out = assertValid(insertSourceRange(edl, item, span, { time: 30 }));
    const added = out.tracks[0].clips.find((c) => c.timelineStart === 30);
    assert.ok(Math.abs(added.sourceIn - span.start) < 1e-9);
    assert.ok(span.end - added.sourceOut < 1 / 30 && added.sourceOut <= span.end + 1e-9);
    const partner = clipOf(out, added.linkedClipId);
    assert.deepEqual([partner.timelineStart, partner.sourceIn], [30, added.sourceIn]);
  });

  it('marks where a word plays, and nothing when it was cut', () => {
    const edl = talkEdl();
    const out = markSource(edl, chainOf(edl), units[9].start, 'First we look at trees.');
    const marker = out.markers.find((m) => m.label.startsWith('First'));
    assert.equal(frames(marker.time), frames(2 + units[9].start));
    const cut = cutSource(edl, chainOf(edl), cutSpan(units, edges, 9, 13));
    assert.equal(markSource(cut, chainOf(cut), units[10].start, 'gone'), cut);
    const long = markSource(edl, chainOf(edl), 1, 'x'.repeat(80));
    assert.equal(long.markers.find((m) => m.label.startsWith('x')).label.length, 48);
  });
});
