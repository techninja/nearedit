import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { snapCandidates, snapTime, trimClipStart, updateClip } from '#utils/edl/index.js';
import { setMusicRendering, updateSong } from '#utils/edl/musicClip.js';
import { clipOf, testClip, testEdl } from '#utils/edl/testkit.js';
import { renderState } from '#utils/musicUi/renderState.js';
import { musicDoc, renderingOf } from '#utils/musicUi/testkit.js';
import { MIN_BEAT_PX } from './beats.js';
import * as marks from './clipMarksMusic.js';
import { drawClip } from './draw/clipBody.js';
import { clipColor, clipLabel } from './draw/clipFace.js';
import { musicSnapTimes } from './musicSnap.js';

// Two bars at 120 BPM: 4 s of music and a 2 s tail. A kick on every beat,
// hats on the eighths, two bass notes.
const made = () => musicDoc();
const rendered = (doc, clipId) =>
  setMusicRendering(doc, clipId, renderingOf(clipOf(doc, clipId).music.song));

/** A canvas context that writes down what is drawn on it. */
function fakeContext() {
  const calls = [];
  const ctx = { calls, measureText: (text) => ({ width: text.length * 5 }) };
  const names =
    'fillRect fillText beginPath rect roundRect fill stroke save restore clip moveTo lineTo';
  for (const name of names.split(' ')) ctx[name] = (...args) => void calls.push([name, ...args]);
  return ctx;
}
const PALETTE = { music: '#4f46e5', audio: '#10b981', clipText: '#fff', warning: '#d97706' };
function scene(doc, pps = 100) {
  const vp = { pps, scrollX: 0, scrollY: 0, width: 1000, height: 300 };
  const overlay = { hoverClipId: '' };
  return {
    ctx: fakeContext(),
    vp,
    doc,
    palette: PALETTE,
    selected: new Set(),
    overlay,
    durations: {},
  };
}
const texts = (ctx) => ctx.calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
const rects = (ctx) => ctx.calls.filter(([name]) => name === 'fillRect').map(([, ...box]) => box);

describe('marks of a music clip', () => {
  beforeEach(() => renderState.set({ byClip: {} }));

  it('is called after its song until somebody names it', () => {
    const { doc, clipId } = made();
    assert.equal(clipLabel(clipOf(doc, clipId)), '808 drums, Bass');
    const named = updateClip(doc, clipId, { label: 'Theme' });
    assert.equal(clipLabel(clipOf(named, clipId)), 'Theme');
    assert.equal(marks.musicLabel({ label: '', music: { song: {} } }), 'Music');
  });

  it('says what a clip still lacks: nothing once its rendering is the song’s', () => {
    const { doc, clipId } = made();
    const clip = clipOf(doc, clipId);
    assert.equal(marks.musicMark(clip), 'stale', 'nobody is rendering it');
    renderState.set({ byClip: { [clipId]: { status: 'rendering', key: 'k', message: '' } } });
    assert.equal(marks.musicMark(clip), 'rendering');
    renderState.set({ byClip: { [clipId]: { status: 'failed', key: 'k', message: 'No' } } });
    assert.equal(marks.musicMark(clip), 'failed');
    assert.equal(marks.musicMark(clipOf(rendered(doc, clipId), clipId)), '');
    assert.equal(marks.musicMark(testClip('v', 0, 2)), '');
  });

  it('pictures the song: every hit and note at the time it is played', () => {
    const { doc, clipId } = made();
    const { song } = clipOf(doc, clipId).music;
    const picture = marks.songPicture(song);
    assert.equal(picture.hits.length, 2 * (4 + 8), 'two bars of four kicks and eight hats');
    assert.deepEqual(
      picture.hits.slice(0, 3),
      [
        [0, 0],
        [0, 1],
        [0.25, 1],
      ],
      'kick and hat on the two rows the song needs, then a hat',
    );
    assert.equal(picture.rows, 2);
    assert.deepEqual(picture.notes, [
      [0, 0.5, 36],
      [2, 0.5, 43],
    ]);
    assert.deepEqual([picture.low, picture.high, picture.longest], [36, 43, 0.5]);
    assert.equal(marks.songPicture(song), picture, 'made once for a song');
    const swung = clipOf(updateSong(doc, clipId, { ...song, swing: 0.5 }), clipId).music.song;
    assert.equal(marks.songPicture(swung).hits[2][0], 0.25, 'eighths stay where they are');
    const muted = { ...song, parts: song.parts.map((part) => ({ ...part, mute: true })) };
    assert.deepEqual(marks.songPicture(muted).hits, []);
    assert.equal(marks.firstAt(picture.hits, 1), 6);
  });

  it('gives bar and beat lines, thinned to what can be told apart', () => {
    const { doc, clipId } = made();
    const { song } = clipOf(doc, clipId).music;
    const all = marks.musicLines(song, 0, 6, 100);
    assert.deepEqual(
      all.map((line) => line.time),
      [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
    );
    assert.deepEqual(
      all.filter((line) => line.bar).map((line) => line.time),
      [0, 2, 4],
    );
    assert.deepEqual(
      marks.musicLines(song, 0, 6, 10).map((line) => line.time),
      [0, 2, 4],
      'bars only',
    );
    assert.deepEqual(
      marks.musicLines(song, 0, 6, 2).map((line) => line.time),
      [0, 4],
      'every other',
    );
    assert.deepEqual(
      marks.musicLines(song, 0.6, 1.6, 100).map((line) => line.time),
      [1, 1.5],
    );
  });
});

describe('drawing a music clip', () => {
  const lane = { y: 30, height: 70 };
  beforeEach(() => renderState.set({ byClip: {} }));

  it('draws an unrendered clip in its own colour with hatching, ticks and the picture', () => {
    const { doc, clipId } = made();
    renderState.set({ byClip: { [clipId]: { status: 'rendering', key: 'k', message: '' } } });
    const view = scene(doc);
    drawClip(view, doc.tracks[1], 0, lane);
    assert.equal(clipColor(view, doc.tracks[1].clips[0], doc.tracks[1]), '#4f46e5');
    assert.deepEqual(texts(view.ctx), ['rendering…', '808 drums, Bass']);
    assert.ok(
      view.ctx.calls.some(([name]) => name === 'lineTo'),
      'hatching',
    );
    const drawn = rects(view.ctx);
    const ticks = drawn.filter(([, y, width]) => y === 45 && width === 1);
    assert.deepEqual(ticks.map(([x, , , height]) => [x, height]).slice(0, 5), [
      [0, 7],
      [50, 3],
      [100, 3],
      [150, 3],
      [200, 7],
    ]);
    const notes = drawn.filter(([, , , height]) => height === 2);
    assert.deepEqual(
      notes.map(([x, , width]) => [x, width]),
      [
        [0, 49.5],
        [200, 49.5],
      ],
      'two bass notes',
    );
    assert.ok(notes[0][1] > notes[1][1], 'the lower note is drawn lower');
    assert.equal(drawn.length - ticks.length - notes.length, 24, 'and a dot for every drum hit');
  });

  it('says when the rendering failed, and nothing once it is there', () => {
    const { doc, clipId } = made();
    renderState.set({ byClip: { [clipId]: { status: 'failed', key: 'k', message: 'No' } } });
    const failed = scene(doc);
    drawClip(failed, doc.tracks[1], 0, lane);
    assert.ok(texts(failed.ctx).includes('not rendered'));
    const done = rendered(doc, clipId);
    const fine = scene(done);
    drawClip(fine, done.tracks[1], 0, lane);
    assert.deepEqual(texts(fine.ctx), ['808 drums, Bass']);
    assert.ok(!fine.ctx.calls.some(([name]) => name === 'lineTo'), 'no hatching');
  });

  it('keeps the picture with the sound when the clip is trimmed', () => {
    const { doc, clipId } = made();
    const trimmed = trimClipStart(doc, clipId, 1);
    const view = scene(trimmed);
    drawClip(view, trimmed.tracks[1], 0, lane);
    const notes = rects(view.ctx).filter(([, , , height]) => height === 2);
    assert.deepEqual(
      notes.map(([x]) => x),
      [200],
      'the first note is cut off, the second is where it was',
    );
  });

  it('drops the picture on a sliver and leaves other clips as they were', () => {
    const { doc } = made();
    const sliver = scene(doc, 1);
    drawClip(sliver, doc.tracks[1], 0, lane);
    assert.deepEqual(rects(sliver.ctx), []);
    const plain = testEdl({ a1: [testClip('a', 0, 4)] });
    const view = scene(plain);
    drawClip(view, plain.tracks[1], 0, lane);
    assert.deepEqual(texts(view.ctx), ['a.mp4']);
  });
});

describe('snapping to a music clip', () => {
  const wide = 100;

  it('offers its beats where they can be aimed at, else its bars, else nothing', () => {
    const { doc } = made();
    assert.deepEqual(musicSnapTimes(doc, wide), [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]);
    assert.ok(0.5 * 40 < MIN_BEAT_PX);
    assert.deepEqual(musicSnapTimes(doc, 40), [0, 2, 4]);
    assert.deepEqual(musicSnapTimes(doc, 5), []);
  });

  it('moves the lines with the clip and through its window', () => {
    const { doc, clipId } = made();
    const moved = updateSong(doc, clipId, (song) => ({ ...song, bpm: 60 }));
    assert.deepEqual(musicSnapTimes(moved, wide).slice(0, 3), [0, 1, 2]);
    const trimmed = trimClipStart(doc, clipId, 1.25);
    assert.deepEqual(musicSnapTimes(trimmed, wide), [1.5, 2, 2.5, 3, 3.5, 4]);
  });

  it('ignores the dragged clip and muted tracks, and feeds the snapping engine', () => {
    const { doc, clipId } = made();
    assert.deepEqual(musicSnapTimes(doc, wide, { exclude: [clipId] }), []);
    const muted = { ...doc, tracks: doc.tracks.map((track) => ({ ...track, muted: true })) };
    assert.deepEqual(musicSnapTimes(muted, wide), []);
    const candidates = snapCandidates(doc, { exclude: [clipId], extra: musicSnapTimes(doc, wide) });
    const hit = snapTime(doc, 2.46, { threshold: 0.08, candidates });
    assert.deepEqual([hit.snapped, hit.time, hit.target.type], [true, 2.5, 'extra']);
  });
});
