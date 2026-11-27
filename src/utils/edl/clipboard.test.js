import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyClips, duplicateClips, pasteClips } from './clipboard.js';
import { expandSelection, newClipIds } from './selection.js';
import { toggleTrackLock } from './trackOps.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

const spans = (edl, trackId) => layout(edl)[trackId].map((s) => s.split(' ')[1]);

const doc = () =>
  deepFreeze(
    testEdl({
      v2: [testClip('t', 3, 5, { sourceFile: '', text: { content: 'Title' }, groupId: 'g' })],
      v1: [testClip('a', 2, 6, { sourceIn: 1, sourceOut: 5, linkedClipId: 'a_s', groupId: 'g' })],
      a1: [testClip('a_s', 2, 6, { sourceIn: 1, sourceOut: 5, linkedClipId: 'a' })],
    }),
  );

describe('copyClips', () => {
  it('captures clips relative to the earliest one, with track type and row', () => {
    const clipboard = copyClips(doc(), ['a', 'a_s', 't']);
    assert.equal(clipboard.kind, 'nearedit/clips');
    assert.deepEqual([clipboard.start, clipboard.duration], [2, 4]);
    assert.deepEqual(
      clipboard.items.map((i) => [
        i.type,
        i.row,
        i.clip.clipId,
        i.clip.timelineStart,
        i.clip.timelineEnd,
      ]),
      [
        ['video', 0, 't', 1, 3],
        ['video', 1, 'a', 0, 4],
        ['audio', 0, 'a_s', 0, 4],
      ],
    );
    assert.equal(clipboard.items[1].clip.sourceIn, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(clipboard)), clipboard, 'plain JSON');
  });

  it('returns null when nothing matches', () => {
    assert.equal(copyClips(doc(), ['ghost']), null);
  });
});

describe('pasteClips', () => {
  it('pastes with fresh ids, keeping layout, links and groups inside the payload', () => {
    const start = doc();
    const out = assertValid(pasteClips(start, copyClips(start, ['a', 'a_s', 't']), { time: 10 }));
    assert.deepEqual(spans(out, 'v2'), ['3-5', '11-13']);
    assert.deepEqual(spans(out, 'v1'), ['2-6', '10-14']);
    assert.deepEqual(spans(out, 'a1'), ['2-6', '10-14']);
    const [title, picture, sound] = newClipIds(start, out).map((id) => clipOf(out, id));
    assert.equal(picture.linkedClipId, sound.clipId);
    assert.equal(sound.linkedClipId, picture.clipId);
    assert.ok(title.groupId && title.groupId === picture.groupId && title.groupId !== 'g');
    assert.deepEqual([picture.sourceIn, picture.sourceOut], [1, 5]);
    assert.equal(clipOf(out, 'a'), clipOf(start, 'a'), 'originals untouched');
  });

  it('drops links that point outside the payload', () => {
    const start = doc();
    const out = assertValid(pasteClips(start, copyClips(start, ['a']), { time: 10 }));
    const [copy] = newClipIds(start, out).map((id) => clipOf(out, id));
    assert.equal(copy.linkedClipId, '');
    assert.equal(clipOf(out, 'a').linkedClipId, 'a_s');
  });

  it('targets a track: rows shift with it and missing tracks are created', () => {
    const start = doc();
    const clipboard = copyClips(start, ['a', 't']);
    // The top copied video row (v2) lands on v1, so "a" needs a new track below.
    const out = assertValid(pasteClips(start, clipboard, { time: 20, trackId: 'v1' }));
    assert.equal(out.tracks.filter((track) => track.type === 'video').length, 3);
    assert.deepEqual(spans(out, 'v1'), ['2-6', '21-23']);
    assert.deepEqual(spans(out, out.tracks[2].trackId), ['20-24']);
    assert.equal(out.tracks[2].name, 'Video 3');
  });

  it('pasting onto a full track follows the overlap rules', () => {
    const start = deepFreeze(
      testEdl({ v1: [testClip('x', 0, 4), testClip('y', 4, 8), testClip('z', 8, 12)] }),
    );
    const clipboard = copyClips(start, ['y']);
    const faded = assertValid(pasteClips(start, clipboard, { time: 2 }));
    // The pasted 4 s clip sits over x's tail and y's head: cross-fade on both sides.
    assert.deepEqual(spans(faded, 'v1'), ['0-4', '2-6', '4-8', '8-12']);
    const pasted = clipOf(faded, newClipIds(start, faded)[0]);
    assert.deepEqual([pasted.fadeIn, pasted.fadeOut], [2, 2]);
    const hard = assertValid(pasteClips(start, clipboard, { time: 2, autoCrossfade: false }));
    assert.deepEqual(spans(hard, 'v1'), ['0-2', '2-6', '6-8', '8-12']);
    const exact = assertValid(pasteClips(start, clipboard, { time: 4 }));
    assert.deepEqual(
      spans(exact, 'v1'),
      ['0-4', '4-8', '8-12'],
      'the copy replaces what it covers',
    );
    assert.equal(clipOf(exact, 'y'), undefined);
  });

  it('ripple: opens a gap for the payload instead', () => {
    const start = deepFreeze(testEdl({ v1: [testClip('x', 0, 4), testClip('y', 4, 8)] }));
    const out = assertValid(pasteClips(start, copyClips(start, ['y']), { time: 2, ripple: true }));
    assert.deepEqual(spans(out, 'v1'), ['0-2', '2-6', '6-8', '8-12']);
    assert.equal(clipOf(out, 'y').timelineStart, 8);
  });

  it('skips clips aimed at a locked track and unlinks their partners', () => {
    const start = deepFreeze(toggleTrackLock(doc(), 'a1'));
    const unlocked = doc();
    const clipboard = copyClips(unlocked, expandSelection(unlocked, ['a'], { grouped: false }));
    const out = assertValid(pasteClips(start, clipboard, { time: 10 }));
    assert.equal(out.tracks[2], start.tracks[2]);
    const [copy] = newClipIds(start, out).map((id) => clipOf(out, id));
    assert.equal(copy.linkedClipId, '');
  });

  it('ignores an empty clipboard and clamps the time at 0', () => {
    const start = doc();
    assert.equal(pasteClips(start, null), start);
    assert.equal(
      pasteClips(start, { kind: 'nearedit/clips', start: 0, duration: 0, items: [] }),
      start,
    );
    const out = pasteClips(start, copyClips(start, ['t']), { time: -4 });
    assert.deepEqual(spans(out, 'v2'), ['0-2', '3-5']);
  });
});

describe('duplicateClips', () => {
  it('places the copies right after the selection on the same tracks', () => {
    const start = doc();
    const out = assertValid(duplicateClips(start, ['a', 'a_s']));
    assert.deepEqual(spans(out, 'v1'), ['2-6', '6-10']);
    assert.deepEqual(spans(out, 'a1'), ['2-6', '6-10']);
    const [picture, sound] = newClipIds(start, out).map((id) => clipOf(out, id));
    assert.equal(picture.linkedClipId, sound.clipId);
  });

  it('or at a given time', () => {
    const out = duplicateClips(doc(), ['t'], { time: 30 });
    assert.deepEqual(spans(out, 'v2'), ['3-5', '30-32']);
    const start = doc();
    assert.equal(duplicateClips(start, ['ghost']), start);
  });
});
