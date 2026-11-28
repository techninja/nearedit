import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip } from './factory.js';
import {
  attachCutout,
  canCutout,
  copyClips,
  cutoutNeeds,
  cutoutState,
  newClipIds,
  normalizeEdl,
  pasteClips,
  setCutout,
  slipClip,
  splitClips,
  toggleTrackLock,
  trimClipEnd,
  trimClipStart,
  updateClip,
} from './index.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from './testkit.js';

const KEY = '0a51bd39df6c629f93d1';
const OTHER = 'ffffffffffffffffffff';
const DEFAULTS = { on: false, mode: 'remove', feather: 0.4, shrink: 0.1, blur: 3 };
const ON = { ...DEFAULTS, on: true };

/** A finished job's result for `/media/me.mp4`. */
const result = (over = {}) => ({
  ...{ file: `/p/.nearedit/cutout/${KEY}.mp4`, key: KEY, source: '/media/me.mp4' },
  ...{ start: 1, end: 12, fps: 30, width: 1280, height: 720, frames: 330, cached: false },
  ...over,
});
const made = (over = {}) => {
  const { cached: _cached, ...kept } = result(over);
  return kept;
};

/** Me twice (4…9 s and 2…5 s of the same file), b-roll, a still, a title and sound. */
const timeline = () =>
  deepFreeze(
    testEdl({
      v1: [
        testClip('me', 0, 5, { sourceFile: '/media/me.mp4', sourceIn: 4, sourceOut: 9 }),
        testClip('me2', 6, 9, { sourceFile: '/media/me.mp4', sourceIn: 2, sourceOut: 5 }),
      ],
      v2: [
        testClip('broll', 0, 9),
        testClip('photo', 9, 12, { sourceFile: '/media/photo.jpg' }),
        createClip({ clipId: 'title', timelineStart: 12, timelineEnd: 14, text: { content: 'T' } }),
      ],
      a1: [testClip('sound', 0, 5, { sourceFile: '/media/me.mp4' })],
    }),
  );

describe('setCutout', () => {
  it('switches clips on in one step and changes settings, leaving the rest alone', () => {
    const start = timeline();
    const on = assertValid(setCutout(start, ['me', 'me2', 'photo', 'title', 'sound', 'nobody']));
    assert.deepEqual(clipOf(on, 'me').cutout, ON);
    assert.deepEqual(clipOf(on, 'me2').cutout, ON);
    for (const id of ['photo', 'title', 'sound', 'broll'])
      assert.equal('cutout' in clipOf(on, id), false, `${id} has no cutout`);
    assert.equal(setCutout(on, ['me', 'me2'], true), on, 'already on: the same document');
    assert.equal(on.tracks[1], start.tracks[1], 'untouched tracks are shared');

    const soft = assertValid(setCutout(on, 'me', { mode: 'blur', feather: 2, blur: 99 }));
    assert.deepEqual(clipOf(soft, 'me').cutout, { ...ON, mode: 'blur', feather: 2, blur: 20 });
    assert.equal(clipOf(soft, 'me2'), clipOf(on, 'me2'));
    const odd = setCutout(soft, 'me', { mode: 'green', feather: 'wide', shrink: null, made: 1 });
    assert.equal(odd, soft, 'what cannot be used changes nothing');
    assert.equal(setCutout(soft, 'me', /** @type {any} */ ('on')), soft);
    assert.equal(setCutout(soft, [], true), soft);
  });

  it('switching off keeps settings and what was made; a block that says nothing goes', () => {
    const on = attachCutout(setCutout(timeline(), ['me', 'me2']), result());
    const off = assertValid(setCutout(on, ['me', 'me2'], false));
    assert.deepEqual(clipOf(off, 'me').cutout, { ...DEFAULTS, made: made() });
    assert.equal(cutoutState(clipOf(off, 'me')), 'off');
    assert.equal(cutoutState(clipOf(setCutout(off, 'me'), 'me'), 30), 'ready');

    const plain = setCutout(setCutout(timeline(), 'me', { on: true, shrink: 1 }), 'me', false);
    assert.deepEqual(clipOf(plain, 'me').cutout, { ...DEFAULTS, shrink: 1 });
    const gone = assertValid(setCutout(plain, 'me', { shrink: 0.1 }));
    assert.equal('cutout' in clipOf(gone, 'me'), false);
    assert.deepEqual(gone, timeline());
  });

  it('leaves locked tracks alone, and updateClip cannot write the block', () => {
    const start = timeline();
    const locked = toggleTrackLock(start, 'v1');
    assert.equal(setCutout(locked, 'me'), locked);
    const on = setCutout(start, 'me');
    const patched = updateClip(on, 'me', { cutout: { on: false, made: made() }, label: 'Me' });
    assert.deepEqual(clipOf(patched, 'me').cutout, ON);
    assert.equal(clipOf(patched, 'me').label, 'Me');
    assert.equal(canCutout(clipOf(start, 'me'), start.tracks[0]), true);
    assert.equal(canCutout(clipOf(start, 'photo'), start.tracks[1]), false);
    assert.equal(canCutout(clipOf(start, 'sound'), start.tracks[2]), false);
  });
});

describe('attachCutout and cutoutState', () => {
  it('attaches a job result to every clip of that file it covers: one shared cutout', () => {
    const on = setCutout(timeline(), ['me', 'me2']);
    assert.deepEqual(
      ['me', 'me2', 'broll'].map((id) => cutoutState(clipOf(on, id), 30)),
      ['missing', 'missing', 'off'],
    );
    const ready = assertValid(attachCutout(on, result()));
    assert.deepEqual(clipOf(ready, 'me').cutout, { ...ON, made: made() });
    assert.equal(clipOf(ready, 'me').cutout.made, clipOf(ready, 'me2').cutout.made, 'shared');
    assert.equal(cutoutState(clipOf(ready, 'me'), 30), 'ready');
    assert.equal(cutoutState(clipOf(ready, 'me2')), 'ready');
    assert.equal(attachCutout(ready, result({ cached: true })), ready, 'the same again');
    assert.equal(ready.tracks[1], on.tracks[1]);
    // A description of a cutout file names its source as { path, size, mtime }.
    const described = attachCutout(on, { ...result(), source: { path: '/media/me.mp4' } });
    assert.deepEqual(described, ready);
  });

  it('attaches nothing that is not a whole result, or is of another file', () => {
    const on = setCutout(timeline(), ['me', 'broll']);
    for (const bad of [
      ...[null, {}, result({ source: undefined }), result({ key: 'nope' }), result({ file: '' })],
      ...[result({ end: 1 }), result({ frames: 0 }), result({ width: 1.5 }), result({ fps: 0 })],
    ])
      assert.equal(attachCutout(on, bad), on);
    const other = attachCutout(on, result({ source: '/media/broll.mp4', start: 0 }));
    assert.equal(cutoutState(clipOf(other, 'broll')), 'ready');
    assert.equal(cutoutState(clipOf(other, 'me')), 'missing');
    const plain = timeline();
    assert.equal(attachCutout(plain, result()), plain, 'no clip has cutout on');
  });

  it('a clip trimmed beyond its cutout is stale; the newest covering cutout wins', () => {
    const on = setCutout(timeline(), ['me', 'me2']);
    const short = attachCutout(on, result({ start: 3, end: 10, frames: 210 }));
    assert.equal(cutoutState(clipOf(short, 'me')), 'ready');
    assert.equal(cutoutState(clipOf(short, 'me2')), 'stale', 'the part from 3 s plays');
    assert.equal(clipOf(short, 'me2').cutout.made.key, KEY, 'better than nothing');
    const narrow = attachCutout(short, result({ key: OTHER, start: 4, end: 5, frames: 30 }));
    assert.equal(narrow, short, 'holds less of either clip than what they have');
    const whole = attachCutout(short, result({ key: OTHER }));
    assert.deepEqual(
      ['me', 'me2'].map((id) => [clipOf(whole, id).cutout.made.key, cutoutState(clipOf(whole, id))]),
      Array(2).fill([OTHER, 'ready']),
    );
    assert.equal(cutoutState(clipOf(whole, 'me'), 25), 'stale', 'made at another frame rate');
    assert.equal(cutoutState(clipOf(whole, 'me'), 29.97), 'stale');
    const relinked = updateClip(whole, 'me', { sourceFile: '/media/other.mp4' });
    assert.equal(cutoutState(clipOf(relinked, 'me')), 'missing', 'the cutout is of another file');
    assertValid(relinked);
  });

  it('reaches clips on locked tracks', () => {
    const locked = toggleTrackLock(setCutout(timeline(), 'me'), 'v1');
    assert.equal(cutoutState(clipOf(attachCutout(locked, result()), 'me')), 'ready');
  });
});

describe('cutoutNeeds', () => {
  it('lists the stretches no attached cutout covers, with the clips that wait', () => {
    assert.deepEqual(cutoutNeeds(timeline()), []);
    const on = setCutout(timeline(), ['me', 'me2']);
    const need = { path: '/media/me.mp4', start: 1, end: 10, fps: 30, frames: 270 };
    assert.deepEqual(cutoutNeeds(on), [
      { ...need, clips: ['me', 'me2'], waiting: ['me', 'me2'] },
    ]);
    const half = attachCutout(on, result({ start: 3, end: 10, frames: 210 }));
    assert.deepEqual(cutoutNeeds(half), [{ ...need, clips: ['me', 'me2'], waiting: ['me2'] }]);
    const ready = attachCutout(half, result({ key: OTHER, start: 1, end: 10, frames: 270 }));
    assert.deepEqual(cutoutNeeds(ready), []);
    assert.equal(cutoutNeeds({ ...ready, fps: 25 }).length, 1, 'another rate: made again');
    assert.deepEqual(cutoutNeeds(setCutout(ready, ['me', 'me2'], false)), []);
  });
});

describe('the cutout field in a document', () => {
  const stored = { ...ON, made: made() };

  it('is normalised: kept on video clips, repaired, dropped where it says nothing', () => {
    const raw = JSON.parse(JSON.stringify(attachCutout(setCutout(timeline(), 'me'), result())));
    const clips = raw.tracks[0].clips;
    clips[0].cutout = { ...stored, feather: 99, mode: 'x', extra: 1 };
    clips[1].cutout = { on: 'true', made: { ...made(), frames: 'many' } };
    raw.tracks[1].clips[1].cutout = stored; // a still
    raw.tracks[2].clips[0].cutout = stored; // sound
    raw.tracks[1].clips[0].cutout = { on: false };
    const edl = assertValid(normalizeEdl(raw));
    assert.deepEqual(clipOf(edl, 'me').cutout, { ...ON, feather: 5, made: made() });
    assert.deepEqual(clipOf(edl, 'me2').cutout, ON, 'a broken "made" is dropped');
    for (const id of ['photo', 'sound', 'broll']) assert.equal('cutout' in clipOf(edl, id), false);
    const again = normalizeEdl(JSON.parse(JSON.stringify(edl)));
    assert.deepEqual(again, edl, 'saved and loaded: the same document');
    const clean = normalizeEdl(edl);
    assert.equal(clipOf(clean, 'me').cutout, clipOf(edl, 'me').cutout, 'a clean block is kept');
  });

  it('survives split, trim, slip and copy; trimming past what was made goes stale', () => {
    const ready = attachCutout(setCutout(timeline(), 'me'), result());
    const cut = assertValid(splitClips(ready, 2, { clipIds: ['me'] }));
    const [right] = newClipIds(ready, cut);
    assert.equal(clipOf(cut, right).cutout, clipOf(cut, 'me').cutout, 'both halves, one block');
    assert.deepEqual([cutoutState(clipOf(cut, 'me'), 30), cutoutState(clipOf(cut, right))], [
      'ready',
      'ready',
    ]);
    // The file holds 1…12 s; the clip plays 4…9 s of it.
    const slipped = assertValid(slipClip(ready, 'me', 2.5));
    assert.equal(cutoutState(clipOf(slipped, 'me')), 'ready', '6.5…11.5 s');
    assert.equal(cutoutState(clipOf(slipClip(ready, 'me', 4), 'me')), 'stale', '8…13 s');
    assert.equal(cutoutState(clipOf(slipClip(ready, 'me', -3.5), 'me')), 'stale', '0.5…5.5 s');
    const shorter = trimClipEnd(trimClipStart(ready, 'me', 1), 'me', 4);
    assert.equal(cutoutState(clipOf(shorter, 'me')), 'ready');
    const longer = assertValid(trimClipEnd(ready, 'me', 5.9));
    assert.equal(cutoutState(clipOf(longer, 'me')), 'ready', 'inside the second of margin');
    const pasted = assertValid(pasteClips(ready, copyClips(ready, ['me']), { time: 20 }));
    const [copy] = newClipIds(ready, pasted);
    assert.deepEqual(clipOf(pasted, copy).cutout, clipOf(ready, 'me').cutout);
    assert.equal(cutoutState(clipOf(pasted, copy), 30), 'ready');
  });
});
