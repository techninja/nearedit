import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { builtinKit, captionStyleOf, resolveKit } from '#utils/brand/index.js';
import { applyDirected } from '#utils/director/applyResult.js';
import { MARKS } from '#utils/director/brand/marks.js';
import { elementClips, timelineDuration, validateEdl } from '#utils/edl/index.js';
import { makeContext } from '../testing/context.js';
import { startFakeLlm } from '../testing/fakeLlm.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { clip, doc, pair } from '../testing/timeline.js';
import { applyBrand } from './brand.js';

let park;
let P;
before(async () => {
  park = await createParkProject();
  P = park.paths;
});
after(() => park?.cleanup());

const SPEAKERS = 'Ada Lovelace — Park ranger; Grace Hopper — Narrator';
/** Interview 0–8, city 8–12, the voice-over under the city, a music bed and two markers. */
function talk(extra = {}) {
  const [video, audio] = pair(P['interview.mp4'], 0, 8, 0);
  const layout = {
    video: [[video, clip(P['broll/city.mp4'], 1, 5, 8)]],
    audio: [
      [audio, clip(P['voice.wav'], 0, 4, 8)],
      [clip(P['music/bed.wav'], 0, 12, 0, { volume: 0.25, intent: 'music' })],
    ],
  };
  const markers = [
    { markerId: 'm_1', time: 8, label: 'The city', color: '' },
    { markerId: 'm_2', time: 3, label: '', color: '' },
  ];
  return doc(layout, { markers, ...extra });
}
/** Run the pass and merge its result the way the panel does. */
async function dressed(edl, directive = {}, extra = {}) {
  const ctx = await makeContext(park, { action: 'brand', ...directive }, { edl, ...extra });
  const result = await applyBrand(ctx);
  assert.deepEqual(checkResult(result, { fps: 30, roots: [park.dir] }), []);
  const out = applyDirected(edl, result);
  assert.deepEqual(validateEdl(out).problems, []);
  return { result, out, ctx };
}
const byMark = (edl, mark) =>
  elementClips(edl)
    .filter(({ clip: c }) => c.intent === mark)
    .map(({ clip: c }) => c);
const span = (c) => [c.timelineStart, c.timelineEnd];
/** A document without what differs between two merges of the same thing. */
const plain = (edl) =>
  JSON.parse(JSON.stringify(edl, (key, value) => (key === 'markerId' ? '' : value)));

test('one pass dresses a timeline: intro, outro, bug, names, a stinger, the caption style', async () => {
  const edl = talk();
  const { result, out } = await dressed(edl, { params: { title: 'Park day', speakers: SPEAKERS } });
  const [intro] = byMark(out, MARKS.intro);
  const [outro] = byMark(out, MARKS.outro);
  const [bug] = byMark(out, MARKS.bug);
  assert.deepEqual(span(intro), [0, 4], 'the intro opens the piece');
  assert.deepEqual(intro.element.slots, { title: 'Park day', subtitle: '' });
  assert.deepEqual(span(outro), [16, 21], 'the outro follows the last picture');
  assert.deepEqual(span(bug), [4, 16], 'the bug spans what lies between');
  assert.equal(timelineDuration(out), 21);
  // Everything of the editor's moved by the intro's length, and nothing else changed.
  const before = edl.tracks.flatMap((t) => t.clips);
  const after = new Map(out.tracks.flatMap((t) => t.clips).map((c) => [c.clipId, c]));
  for (const was of before) {
    const now = after.get(was.clipId);
    assert.deepEqual(now, {
      ...was,
      timelineStart: was.timelineStart + 4,
      timelineEnd: was.timelineEnd + 4,
    });
  }
  assert.deepEqual(
    out.markers.map((m) => [m.time, m.label]),
    [
      [7, ''],
      [12, 'The city'],
    ],
  );
  // Names where each speaker first speaks: the first named to the first file that speaks.
  const names = byMark(out, MARKS.name);
  assert.deepEqual(
    names.map((c) => c.element.slots),
    [
      { name: 'Ada Lovelace', role: 'Park ranger' },
      { name: 'Grace Hopper', role: 'Narrator' },
    ],
  );
  // Ada at her first word; Grace's first word (12.5) is under the stinger, so her name waits for it.
  assert.deepEqual(
    names.map((c) => c.timelineStart),
    [5, 12.8],
  );
  // The stinger covers the cut at the named marker; the unnamed marker gets none.
  const stingers = byMark(out, MARKS.stinger);
  assert.equal(stingers.length, 1);
  assert.ok(stingers[0].timelineStart < 12 && stingers[0].timelineEnd > 12);
  assert.deepEqual(out.captions.style, captionStyleOf(resolveKit(builtinKit('clean'))));
  assert.match(
    result.summary,
    /^Brand “Clean”: placed intro, outro, logo bug, 2 lower thirds and stinger; caption style Clean$/,
  );
  const notes = result.notes.join('\n');
  assert.match(
    notes,
    /Placed: Lower third “Ada Lovelace — Park ranger” at 0:05 — over interview\.mp4, the first file that speaks\./,
  );
  assert.match(
    notes,
    /Assumed: 2 speakers were matched to the files that speak in the order they were named/,
  );
  assert.match(notes, /Everything moved 4s later to make room for the intro/);
  // The pass keeps its overlays on tracks of its own, in front.
  assert.deepEqual(
    out.tracks.slice(0, 2).map((t) => t.name),
    ['Brand', 'Logo'],
  );
});

test('running it twice doubles nothing; a changed request changes only what it says', async () => {
  const params = { title: 'Park day', speakers: SPEAKERS };
  const once = await dressed(talk(), { params });
  const twice = await dressed(once.out, { params });
  assert.deepEqual(plain(twice.out), plain(once.out), 'the second pass changes nothing');
  assert.equal(
    applyDirected(once.out, twice.result),
    once.out,
    'the very document: nothing to undo',
  );
  assert.doesNotMatch(
    twice.result.notes.join('\n'),
    /Assumed:/,
    'nothing was placed by assumption',
  );
  assert.match(
    twice.result.summary,
    /nothing to change — the timeline already carries it \(intro, outro, logo bug, 2 lower thirds and stinger\)/,
  );
  // The editor moves a name and trims the intro: the pass leaves both where they are.
  const moved = structuredClone(once.out);
  const ada = moved.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.element?.slots.name === 'Ada Lovelace');
  Object.assign(ada, { timelineStart: 6, timelineEnd: 9, sourceOut: 3 });
  const again = await dressed(moved, {
    params: { title: 'A day at the park', speakers: 'Ada Lovelace — Head ranger' },
  });
  const [intro] = byMark(again.out, MARKS.intro);
  assert.equal(intro.element.slots.title, 'A day at the park');
  assert.deepEqual(span(intro), [0, 4]);
  const names = byMark(again.out, MARKS.name);
  assert.deepEqual(
    names.map((c) => [c.element.slots.role, ...span(c)]),
    [['Head ranger', 6, 9]],
  );
  assert.equal(timelineDuration(again.out), 21, 'no second intro, nothing moved');
  assert.match(again.result.summary, /updated intro, outro and lower third; removed lower third/);
});

test('who speaks where: a time wins, then the order; nobody speaking is said plainly', async () => {
  // A time in the request is taken as it is; the others take the speaking files in order.
  const mixed = await dressed(talk(), {
    params: {
      speakers: 'Grace Hopper — Narrator at 0:09; Ada Lovelace; Alan Turing',
      intro: false,
    },
  });
  const names = byMark(mixed.out, MARKS.name);
  assert.deepEqual(
    names.map((c) => [c.element.slots.name, c.timelineStart]),
    [
      ['Ada Lovelace', 1],
      ['Grace Hopper', 9],
    ],
  );
  const notes = mixed.result.notes.join('\n');
  assert.match(notes, /Lower third “Grace Hopper — Narrator” at 0:09 — at the time asked for/);
  assert.match(notes, /Assumed: 2 speakers were matched to the files that speak in the order/);
  assert.match(
    notes,
    /Lower third “Alan Turing” did not fit beside another brand element while they speak/,
  );
  // A timeline on which nobody speaks: picture and music only.
  const silent = doc({
    video: [[clip(P['broll/city.mp4'], 0, 5, 0), clip(P['broll/beach.mp4'], 0, 4, 5)]],
    audio: [[clip(P['music/bed.wav'], 0, 9, 0, { intent: 'music' })]],
  });
  const quiet = await dressed(silent, { params: { speakers: SPEAKERS } });
  assert.deepEqual(byMark(quiet.out, MARKS.name), []);
  assert.match(
    quiet.result.notes.join('\n'),
    /No lower third for Ada Lovelace, Grace Hopper: no clip on the timeline speaks\./,
  );
  assert.match(quiet.result.summary, /placed intro, outro and logo bug; caption style Clean$/);
  assert.equal(
    quiet.result.plan.title,
    'Director test',
    'the project’s name, when no title is given',
  );
});

test('with the LLM: it says whose file is whose; without a usable answer the order decides', async () => {
  const fake = await startFakeLlm();
  try {
    const answer = {
      speakers: [
        { name: 'Grace Hopper', role: 'Narrator', file: 'voice.wav', segment: 2 },
        { name: 'Ada Lovelace', file: 'interview.mp4' },
      ],
    };
    fake.setReply(() => `Here you go:\n${JSON.stringify(answer)}`);
    const params = {
      speakers: 'Ada Lovelace — Park ranger; Grace Hopper',
      useLlm: true,
      intro: false,
    };
    const told = await dressed(talk(), { params }, { llmUrl: fake.url });
    const asked = fake.requests.at(-1).body.messages;
    assert.match(asked[0].content, /say who speaks where[\s\S]*Never write times\./);
    assert.match(asked[1].content, /SPEAKING FILES[\s\S]*interview\.mp4[\s\S]*voice\.wav/);
    assert.doesNotMatch(asked[1].content, /bed\.wav|city\.mp4/, 'only the files that speak');
    assert.match(asked[1].content, /PEOPLE\n- Ada Lovelace — Park ranger\n- Grace Hopper/);
    const names = byMark(told.out, MARKS.name);
    // Ada where her file first speaks; Grace at the second sentence of the voice-over (the role is the model's).
    assert.deepEqual(
      names.map((c) => [c.element.slots, c.timelineStart > 8.5]),
      [
        [{ name: 'Ada Lovelace', role: 'Park ranger' }, false],
        [{ name: 'Grace Hopper', role: 'Narrator' }, true],
      ],
    );
    assert.match(
      told.result.notes.join('\n'),
      /read from the transcripts by the LLM \(test-model\)/,
    );
    assert.doesNotMatch(told.result.notes.join('\n'), /Assumed:/);
    // A reply that is not the JSON asked for: the order decides, and the first note says so.
    fake.setReply(() => 'I think Ada speaks first.');
    const lost = await dressed(talk(), { params }, { llmUrl: fake.url });
    assert.match(lost.result.notes.join('\n'), /The LLM could not say who speaks where/);
    assert.match(lost.result.notes.join('\n'), /Assumed: 2 speakers were matched/);
    assert.equal(byMark(lost.out, MARKS.name).length, 2);
    // Asked for while none is configured: the same, and the job is not refused.
    const none = await dressed(talk(), { params }, { provider: 'none' });
    assert.equal(byMark(none.out, MARKS.name).length, 2);
  } finally {
    await fake.close();
  }
});

test('an empty timeline, a locked track and a kit of its own: the result says what happened', async () => {
  const empty = await dressed(doc({ video: [[]], audio: [[]] }), {
    params: { speakers: SPEAKERS },
  });
  assert.equal(empty.result.summary, 'Brand “Clean”: caption style Clean');
  assert.match(empty.result.notes.join('\n'), /There is no picture on the timeline to dress yet\./);
  assert.deepEqual(elementClips(empty.out), []);
  const locked = talk();
  locked.tracks[2] = { ...locked.tracks[2], locked: true };
  const kept = await dressed(locked, { params: { title: 'Park day' } });
  assert.match(kept.result.notes.join('\n'), /The intro was left out: a locked track holds clips/);
  assert.deepEqual(kept.out.tracks.at(-1), locked.tracks[2], 'the locked track is untouched');
  assert.equal(timelineDuration(kept.out), 17, 'nothing moved: only the outro was added');
  // The same request under another kit comes out in that kit.
  const bold = resolveKit(builtinKit('bold'));
  const other = await dressed(talk(), { params: { title: 'Park day' } }, { kit: bold });
  assert.match(other.result.summary, /^Brand “Bold”: placed .*; caption style Boxed$/);
  assert.ok(elementClips(other.out).every(({ clip: c }) => c.element.kit.id === 'bold'));
  assert.deepEqual(other.out.captions.style, captionStyleOf(bold));
  // …and a pass with the first kit again brings every clip back, without adding one.
  const back = await dressed(other.out, { params: { title: 'Park day' } });
  assert.match(back.result.summary, /caption style Clean; 4 clips brought up to date$/);
  assert.equal(elementClips(back.out).length, elementClips(other.out).length);
});
