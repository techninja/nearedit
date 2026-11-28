import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtinKit, captionStyleOf, resolveKit } from '#utils/brand/index.js';
import {
  createClip,
  createEdl,
  createTrack,
  elementClips,
  insertElement,
} from '#utils/edl/index.js';
import { timelineDuration, validateEdl } from '#utils/edl/index.js';
import { MARKS, TRACKS, marked } from './marks.js';
import { brandPass } from './pass.js';

const clean = resolveKit(builtinKit('clean'));
const bold = resolveKit(builtinKit('bold'));
const ALL = { intro: true, outro: true, bug: true, names: true, stingers: true, chapters: true };
/** A plan with every part on, and whatever a test says. */
const plan = (more = {}) => ({
  parts: { ...ALL, captions: true, restyle: true, ...more.parts },
  ...{ title: 'Park day', subtitle: '', closing: null, speakers: [], chapters: [], items: [] },
  ...more,
  ...(more.parts && { parts: { ...ALL, captions: true, restyle: true, ...more.parts } }),
});
const shot = (file, start, end, more = {}) =>
  createClip({
    sourceFile: file,
    sourceOut: end - start,
    timelineStart: start,
    timelineEnd: end,
    ...more,
  });
/** Three shots cut at 6 and 12, their sound, and named markers on (6) and off (9) a cut. */
function timeline(more = {}) {
  const video = [shot('/m/a.mp4', 0, 6), shot('/m/b.mp4', 6, 12), shot('/m/c.mp4', 12, 18)];
  return createEdl({
    tracks: [
      createTrack('video', { trackId: 'v1', name: 'Video 1', clips: video, ...more.video }),
      createTrack('audio', { trackId: 'a1', name: 'Audio 1', clips: [shot('/m/a.wav', 0, 18)] }),
    ],
    markers: [
      { markerId: 'm1', time: 6, label: 'The river', color: '' },
      { markerId: 'm2', time: 9, label: 'Mid shot', color: '' },
      { markerId: 'm3', time: 12, label: '', color: '' },
    ],
    ...more.doc,
  });
}
const of = (edl, mark) => marked(edl, mark).map(({ clip }) => clip);
const spans = (edl, mark) => of(edl, mark).map((clip) => [clip.timelineStart, clip.timelineEnd]);
const said = (out) => out.done.map((entry) => `${entry.state} ${entry.what}`);

test('every part can be switched off, and what is off is not touched', () => {
  const full = brandPass(timeline(), clean, plan());
  assert.deepEqual(validateEdl(full.edl).problems, []);
  assert.deepEqual(said(full), [
    ...['placed Intro “Park day”', 'placed Outro “Park day”'],
    ...['placed Stinger at “The river”', 'placed Logo bug'],
  ]);
  assert.match(full.notes.join(' '), /1 named marker is not on a cut: no stinger there/);
  for (const part of Object.keys(ALL)) {
    const out = brandPass(timeline(), clean, plan({ parts: { [part]: false } }));
    const mark = { names: 'name', stingers: 'stinger', chapters: 'chapter' }[part] || part;
    assert.deepEqual(of(out.edl, MARKS[mark]), [], `${part} is off`);
  }
  const input = timeline();
  const bare = brandPass(input, clean, plan({ parts: { ...invert(ALL), captions: false } }));
  assert.equal(bare.edl, input, 'with everything off the document is the one that came in');
  assert.deepEqual([said(bare), bare.captions], [[], null]);
  // Switched off after an earlier pass: what is there stays as it is.
  const kept = brandPass(
    full.edl,
    clean,
    plan({ title: 'Other', parts: { intro: false, bug: false } }),
  );
  assert.equal(of(kept.edl, MARKS.intro)[0].element.slots.title, 'Park day');
  assert.equal(of(kept.edl, MARKS.bug).length, 1);
});
const invert = (parts) => Object.fromEntries(Object.keys(parts).map((key) => [key, false]));

test('a locked track with clips: no intro, nothing moves, and the result says why', () => {
  const locked = timeline();
  locked.tracks[1] = { ...locked.tracks[1], locked: true };
  const out = brandPass(locked, clean, plan());
  assert.deepEqual(of(out.edl, MARKS.intro), []);
  assert.match(out.notes.join(' '), /The intro was left out: a locked track holds clips/);
  assert.equal(out.opened, null);
  assert.deepEqual(out.edl.tracks.at(-1), locked.tracks[1], 'the locked track is as it was');
  assert.deepEqual(spans(out.edl, MARKS.outro), [[18, 23]]);
  assert.deepEqual(spans(out.edl, MARKS.bug), [[0, 18]], 'the bug spans the piece from its start');
  // The picture track locked: the outro and the overlays go on the pass's own tracks.
  const picture = timeline({ video: { locked: true } });
  const shut = brandPass(picture, clean, plan());
  assert.deepEqual(
    shut.edl.tracks.find((t) => t.trackId === 'v1'),
    picture.tracks[0],
  );
  const outro = marked(shut.edl, MARKS.outro)[0];
  assert.equal(outro.track.name, TRACKS.brand);
  assert.deepEqual(validateEdl(shut.edl).problems, []);
});

test('an empty timeline is not dressed; its caption style still follows the kit', () => {
  const empty = createEdl();
  const out = brandPass(
    empty,
    bold,
    plan({ speakers: [{ name: 'Ada', role: '', time: null, until: null }] }),
  );
  assert.equal(out.empty, true);
  assert.deepEqual([said(out), elementClips(out.edl).length], [[], 0]);
  assert.deepEqual(out.edl.captions.style, captionStyleOf(bold));
  assert.equal(out.captions.changed, true);
  // Only overlays and titles on it: still no picture to dress.
  const titled = createEdl({
    tracks: [
      createTrack('video', { clips: [createClip({ timelineEnd: 4, text: { content: 'Hi' } })] }),
    ],
  });
  assert.equal(brandPass(titled, clean, plan()).empty, true);
});

test('a name goes where its speaker speaks; nobody speaking, no name', () => {
  const speakers = [
    { name: 'Ada', role: 'CEO', time: 1, until: 6, why: 'over a.mp4, the first file that speaks' },
    { name: 'Grace', role: '', time: null, until: null, why: '' },
  ];
  const out = brandPass(timeline(), clean, plan({ speakers, parts: { stingers: false } }));
  // Times of the posted timeline move with the intro (4 s).
  assert.deepEqual(spans(out.edl, MARKS.name), [[5, 10]]);
  // With a stinger on the cut at the end of the shot, the name ends where the stinger begins.
  const cut = brandPass(timeline(), clean, plan({ speakers }));
  assert.deepEqual(spans(cut.edl, MARKS.name), [[5, spans(cut.edl, MARKS.stinger)[0][0]]]);
  assert.deepEqual(of(out.edl, MARKS.name)[0].element.slots, { name: 'Ada', role: 'CEO' });
  assert.equal(out.done.find((d) => /Lower third/.test(d.what)).why, speakers[0].why);
  // Too little of the speaker left once a card has passed: left out, and said.
  const tight = [{ name: 'Ada', role: '', time: 6, until: 10, why: '' }];
  const chapters = [{ title: 'The river', at: null }];
  const crowded = brandPass(timeline(), clean, plan({ speakers: tight, chapters }));
  assert.deepEqual(of(crowded.edl, MARKS.name), []);
  assert.match(
    crowded.notes.join(' '),
    /Lower third “Ada” did not fit beside another brand element/,
  );
  // With room, the name waits for the card to leave.
  const roomy = brandPass(
    timeline(),
    clean,
    plan({ chapters, speakers: [{ ...tight[0], until: 12 }] }),
  );
  assert.deepEqual(spans(roomy.edl, MARKS.chapter), [[10, 13]]);
  assert.deepEqual(spans(roomy.edl, MARKS.name), [[13.2, 16]]);
});

test('chapters get a card at a time, at the marker of that name, or at the markers in order', () => {
  const chapters = [
    { title: 'Opening', at: 0.2 },
    { title: 'the river', at: null },
    { title: 'Later', at: null },
    { title: 'Nowhere', at: null },
  ];
  const out = brandPass(timeline(), clean, plan({ chapters, parts: { intro: false } }));
  const cards = of(out.edl, MARKS.chapter);
  assert.deepEqual(
    cards.map((c) => [c.element.slots.title, c.element.slots.number, c.timelineStart]),
    [
      ['Opening', '01', 0.2],
      ['the river', '02', 6],
      ['Later', '03', 9],
    ],
  );
  assert.match(out.notes.join(' '), /Chapter card “Nowhere” has no place/);
  assert.deepEqual(of(out.edl, MARKS.stinger), [], 'a card is the turn: no stinger on its cut');
  assert.ok(cards.every((c) => c.element.design.kind === 'segment'));
  assert.equal(timelineDuration(out.edl), 23, 'a card lies over the picture: nothing moved');
  // A chapter that is no longer listed is taken away; the others stay where they are.
  const fewer = brandPass(
    out.edl,
    clean,
    plan({ chapters: [chapters[1]], parts: { intro: false } }),
  );
  assert.deepEqual(spans(fewer.edl, MARKS.chapter), [[6, 9]]);
  assert.deepEqual(of(fewer.edl, MARKS.chapter)[0].element.slots.number, '01');
  assert.ok(said(fewer).includes('removed Chapter card “Opening”'));
});

test('single elements asked for by a line are placed once, and swept when no longer asked for', () => {
  const quote = {
    id: 'quote',
    kind: 'overlay',
    label: 'Quote',
    slots: { text: 'Hi', by: 'me' },
    at: 2,
  };
  const first = brandPass(timeline(), clean, plan({ items: [quote, { ...quote, at: 3 }] }));
  // At 0:02 of the posted timeline, as long as a quote lasts — up to the stinger on the cut at 0:10.
  assert.deepEqual(spans(first.edl, MARKS.item), [[6, spans(first.edl, MARKS.stinger)[0][0]]]);
  assert.match(first.notes.join(' '), /Quote “Hi” did not fit beside another brand element/);
  const again = brandPass(first.edl, clean, plan({ items: [quote] }));
  assert.deepEqual(again.edl, first.edl);
  const gone = brandPass(first.edl, clean, plan());
  assert.deepEqual(of(gone.edl, MARKS.item), []);
});

test('it is idempotent, follows the piece as it grows, and leaves the editor’s own elements alone', () => {
  const own = insertElement(timeline(), clean, 'bug', {}, { time: 0, duration: 18 });
  const speakers = [{ name: 'Ada', role: 'CEO', time: 1, until: 6, why: '' }];
  const once = brandPass(own, clean, plan({ speakers }));
  const mine = elementClips(own)[0].clip;
  const still = elementClips(once.edl).find(({ clip }) => clip.clipId === mine.clipId).clip;
  assert.deepEqual([still.timelineStart, still.timelineEnd, still.intent], [4, 22, mine.intent]);
  assert.equal(of(once.edl, MARKS.bug).length, 1, 'the pass has a bug of its own');
  const twice = brandPass(
    once.edl,
    clean,
    plan({ speakers: [{ ...speakers[0], time: 5, until: 10 }] }),
  );
  assert.deepEqual(twice.edl, once.edl, 'a second pass changes nothing');
  assert.ok(twice.done.every((entry) => entry.state === 'kept'));
  // The edit grows by a shot: the outro stays where the editor has it, the bug still ends on it.
  const grown = structuredClone(once.edl);
  const track = grown.tracks.find((t) => t.trackId === 'v1');
  const outro = track.clips.find((c) => c.intent === MARKS.outro);
  Object.assign(outro, { timelineStart: 28, timelineEnd: 33 });
  track.clips.push(shot('/m/d.mp4', 22, 28));
  const third = brandPass(grown, clean, plan({ speakers }));
  assert.deepEqual(spans(third.edl, MARKS.bug), [[4, 28]]);
  assert.deepEqual(
    said(third).filter((line) => line.startsWith('updated')),
    ['updated Logo bug'],
  );
});

test('out-of-date elements are restyled — all of them, or only the pass’s own', () => {
  const old = brandPass(
    insertElement(timeline(), bold, 'title', { title: 'Hi' }, { time: 1 }),
    bold,
    plan(),
  );
  const keys = (edl) => [...new Set(elementClips(edl).map(({ clip }) => clip.element.kit.id))];
  assert.deepEqual(keys(old.edl), ['bold']);
  const all = brandPass(old.edl, clean, plan());
  assert.deepEqual([keys(all.edl), all.restyled], [['clean'], 5]);
  assert.deepEqual(all.edl.captions.style, captionStyleOf(clean));
  const mine = brandPass(old.edl, clean, plan({ parts: { restyle: false } }));
  assert.deepEqual(
    keys(mine.edl).sort(),
    ['bold', 'clean'],
    'the editor’s title is left on its kit',
  );
  assert.equal(mine.restyled, 4);
  // What was filled in, and where each clip sits, is unchanged by a restyle.
  const place = (edl) =>
    elementClips(edl).map(({ clip }) => [clip.timelineStart, clip.element.slots]);
  assert.deepEqual(place(all.edl), place(old.edl));
});
