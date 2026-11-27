import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRANSITIONS } from '#utils/director/motion/vocab.js';
import { clipAt, keyframes, keysAt, paramKeys } from './clips.js';
import { schedule } from './shots.js';
import { MIN_FRAMES, PACE, naturalSeconds, sceneFrames, shareFrames } from './timing.js';
import { transitionFrames, wordCount } from './timing.js';
import { entrance, entranceSpan, pieceCount } from './titles.js';

const sum = (/** @type {number[]} */ list) => list.reduce((a, b) => a + b, 0);
const SCENES = [
  { title: 'One', transition: 'fade' },
  { title: 'Two words here', subtitle: 'and a line under it to read', transition: 'wipe' },
  { title: 'Three', transition: 'cut' },
  { title: 'Four', transition: 'iris' },
];

test('a scene lasts as long as its words take to read, by pacing', () => {
  assert.equal(wordCount('  two   words '), 2);
  assert.equal(wordCount(undefined), 0);
  const short = { title: 'Hi' };
  const long = { title: 'A fairly long title', subtitle: 'with a subtitle of several more words' };
  for (const pacing of /** @type {const} */ (['slow', 'medium', 'fast'])) {
    assert.ok(naturalSeconds(long, pacing) > naturalSeconds(short, pacing), pacing);
    assert.ok(naturalSeconds(short, pacing) >= PACE[pacing].min);
    const endless = { title: 'word '.repeat(200) };
    assert.equal(naturalSeconds(endless, pacing), PACE[pacing].max);
  }
  assert.ok(naturalSeconds(long, 'slow') > naturalSeconds(long, 'medium'));
  assert.ok(naturalSeconds(long, 'medium') > naturalSeconds(long, 'fast'));
  assert.equal(naturalSeconds({ title: 'x', duration: 7.5 }, 'fast'), 7.5, 'the plan decides');
  assert.equal(naturalSeconds({ title: 'x', duration: 0.2 }, 'fast'), 1, 'never under a second');
  assert.equal(naturalSeconds(long, /** @type {any} */ ('nope')), naturalSeconds(long, 'medium'));
});

test('frames are shared out exactly, in proportion, with a floor', () => {
  assert.deepEqual(shareFrames([1, 1, 1], 90, 10), [30, 30, 30]);
  assert.deepEqual(shareFrames([1, 2, 1], 100, 10), [25, 50, 25]);
  for (const total of [150, 200, 599, 1801]) {
    const frames = shareFrames([2.4, 3.3, 5.1, 2.7, 9], total, 30);
    assert.equal(sum(frames), total, `total ${total}`);
    assert.ok(frames.every((f) => Number.isInteger(f) && f >= 30));
  }
  // A floor that cannot be afforded wins over the total.
  assert.deepEqual(shareFrames([1, 1, 1], 40, 30), [30, 30, 30]);
  // One long scene pays for the floors of the short ones.
  assert.deepEqual(shareFrames([1, 1, 10], 120, 30), [30, 30, 60]);
});

test('scene lengths: natural without a target, exact with one', () => {
  const natural = sceneFrames(SCENES, { fps: 30, pacing: 'medium' });
  assert.deepEqual(natural.notes, []);
  assert.deepEqual(
    natural.frames,
    SCENES.map((scene) => Math.round(naturalSeconds(scene, 'medium') * 30)),
  );
  for (const [target, fps] of [
    [20, 30],
    [12.5, 24],
    [9, 29.97],
    [60, 60],
  ]) {
    const { frames } = sceneFrames(SCENES, { fps, pacing: 'medium', target });
    assert.equal(sum(frames), Math.round(target * fps), `${target}s at ${fps}`);
    // The longest scene stays the longest.
    assert.equal(frames.indexOf(Math.max(...frames)), 1);
  }
  const tight = sceneFrames(SCENES, { fps: 30, pacing: 'medium', target: 2 });
  assert.deepEqual(tight.frames, [30, 30, 30, 30]);
  assert.match(tight.notes[0], /4 scenes need at least 4s — the piece is longer than the 2s/);
  const stretched = sceneFrames(SCENES, { fps: 30, pacing: 'medium', target: 90 });
  assert.match(stretched.notes[0], /stretched to fill 1m 30s/);
  const squeezed = sceneFrames(SCENES, { fps: 30, pacing: 'slow', target: 6 });
  assert.match(squeezed.notes[0], /shortened to fit 6s/);
  // At a very low frame rate a scene still has room for its moves.
  assert.ok(sceneFrames(SCENES, { fps: 2, pacing: 'fast' }).frames.every((f) => f >= MIN_FRAMES));
});

test('a transition takes its pacing’s time, never more than 30% of the shorter scene', () => {
  const opts = { fps: 30, pacing: 'medium' };
  assert.equal(transitionFrames('cut', 90, 90, opts), 0);
  for (const kind of TRANSITIONS.filter((name) => name !== 'cut')) {
    assert.equal(transitionFrames(kind, 90, 120, opts), 18, kind);
  }
  assert.equal(transitionFrames('fade', 30, 120, opts), 9);
  assert.equal(transitionFrames('fade', 120, 40, opts), 12);
  assert.equal(transitionFrames('fade', 300, 300, { fps: 30, pacing: 'slow' }), 24);
  assert.equal(transitionFrames('fade', 300, 300, { fps: 30, pacing: 'fast' }), 12);
  assert.equal(transitionFrames('fade', 8, 8, opts), 2);
});

test('the schedule is gapless, alternates rows and keeps the words inside their scene', () => {
  for (const fps of [30, 24, 60, 12, 5]) {
    const { shots, totalF, notes } = schedule(SCENES, { fps, pacing: 'medium' });
    assert.deepEqual(notes, []);
    assert.equal(shots[0].startF, 0);
    assert.equal(shots.at(-1).endF, totalF);
    shots.forEach((shot, i) => {
      const next = shots[i + 1];
      assert.equal(shot.index, i);
      assert.equal(shot.front, i % 2 === 1);
      assert.equal(shot.endF, next ? next.startF : totalF);
      assert.equal(shot.tailF, next ? next.inF : 0);
      assert.equal(shot.outF > 0, !next, 'only the last scene fades to nothing');
      assert.ok(shot.textF > shot.startF && shot.textF < shot.textEndF, `fps ${fps} scene ${i}`);
      assert.ok(shot.textEndF <= shot.endF);
      assert.ok(shot.textEndF - shot.textF >= 5, 'room for title, subtitle and accent');
      assert.ok(shot.inSeconds > 0 && shot.inSeconds <= (shot.textEndF - shot.textF) / fps / 2);
      for (const key of ['startF', 'endF', 'inF', 'tailF', 'outF', 'textF', 'textEndF']) {
        assert.ok(Number.isInteger(shot[key]), `${key} is a whole frame`);
      }
    });
    assert.equal(shots[2].inF, 0, 'a cut takes no time');
    assert.equal(shots[1].outSeconds, 0, 'words stay up to a cut');
    assert.ok(shots[0].outSeconds > 0 && shots[3].outSeconds > 0);
  }
});

test('an entrance fills the time it is given, however many pieces there are', () => {
  assert.equal(pieceCount('Made from nothing', 'char', 1), 15);
  assert.equal(pieceCount('Made from nothing', 'word', 1), 3);
  assert.equal(pieceCount('Made from nothing', 'line', 2), 2);
  assert.equal(pieceCount('Made from nothing', 'block', 2), 1);
  assert.equal(pieceCount('', 'char', 1), 1);
  for (const type of ['fade', 'slide-up', 'scale', 'blur']) {
    for (const [by, count] of [
      ['char', 4],
      ['char', 90],
      ['word', 12],
      ['line', 3],
      ['block', 1],
    ]) {
      const anim = entrance(type, by, count, 0.9);
      const span = entranceSpan(anim, count);
      assert.ok(span <= 0.9 + 1e-9, `${type}/${by}×${count} takes ${span}`);
      assert.ok(anim.duration >= 0.2 && anim.stagger >= 0);
      assert.equal(anim.by, by);
    }
  }
  assert.equal(entrance('scale', 'char', 5, 1).ease, 'back-out');
  const typed = entrance('typewriter', 'block', 40, 0.8);
  assert.equal(typed.by, 'char');
  assert.ok(Math.abs(entranceSpan(typed, 40) - 0.8) < 0.05);
  assert.ok(
    entrance('typewriter', 'char', 3, 2).stagger <= 0.06,
    'a short word is not typed slowly',
  );
  assert.equal(entranceSpan(entrance('none', 'char', 9, 1), 9), 0);
});

test('clip helpers: whole frames, source time from zero, keys that survive a squeeze', () => {
  const clip = clipAt(45, 105, 30, { label: 'x' });
  assert.deepEqual(
    [clip.timelineStart, clip.timelineEnd, clip.sourceIn, clip.sourceOut, clip.label],
    [1.5, 3.5, 0, 2, 'x'],
  );
  const brief = clipAt(0, 6, 30, { fadeIn: 0.3, fadeOut: 0.1 });
  assert.ok(Math.abs(brief.fadeIn - 0.15) < 1e-9 && Math.abs(brief.fadeOut - 0.05) < 1e-9);
  assert.deepEqual(
    keysAt(
      [
        [0, 0, 'ease-out'],
        [15, 1],
      ],
      30,
    ),
    [
      { t: 0, v: 0, ease: 'ease-out' },
      { t: 0.5, v: 1, ease: 'linear' },
    ],
  );
  // Keys landing on one frame: the later value stands.
  const squeezed = [
    [0, 0],
    [0.2, 5],
    [3, 9],
  ];
  assert.deepEqual(keysAt(/** @type {any} */ (squeezed), 30), [
    { t: 0, v: 5, ease: 'linear' },
    { t: 0.1, v: 9, ease: 'linear' },
  ]);
  const map = keyframes(
    {
      moves: [
        [0, 1],
        [30, 2],
      ],
      still: [
        [0, 1],
        [0, 2],
      ],
    },
    30,
  );
  assert.deepEqual(Object.keys(map), ['moves']);
  assert.deepEqual(Object.keys(paramKeys({ angle: [], 'center.x': [] })), [
    'generator.params.angle',
    'generator.params.center.x',
  ]);
});
