import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDirective } from '#utils/director/directive.js';
import { createClip } from '#utils/edl/factory.js';
import { DirectorError } from '../errors.js';
import { gatherMedia } from '../context/gather.js';
import { mediaLookup } from '../inplace/doc.js';
import { createParkProject } from '../testing/park.js';
import { clip, doc, pair, title } from '../testing/timeline.js';
import { findSpeech } from './speech.js';
import { cutsPerMinute, scoreSpan, turningPoints } from './timeline.js';

let park;
let P;
let lookup;
before(async () => {
  park = await createParkProject();
  P = park.paths;
  lookup = mediaLookup(await gatherMedia(park.projectId));
});
after(() => park.cleanup());

const directive = (more = {}) => {
  const normal = normalizeDirective({ action: 'score', ...more });
  if (normal.ok === false) throw new Error(JSON.stringify(normal));
  return normal.directive;
};
const picture = (at, length, extra) => clip('/media/shot.mp4', 0, length, at, extra);
const whole = (edl) => scoreSpan(edl, directive(), 30);
const span = (start, end) => ({ start, end });

test('the span: the whole timeline, the range, or from the first to the last selected clip', () => {
  const [a, b, c] = [picture(0, 10), picture(10, 6), picture(16, 14.5)];
  const edl = doc({ video: [[a, b, c]], audio: [[clip('/media/v.wav', 0, 24, 2)]] });
  assert.deepEqual(whole(edl), { start: 0, end: 30.5, seconds: 30.5, what: 'the whole timeline' });
  const ranged = directive({ mode: 'range', context: { range: { start: 4.011, end: 20.49 } } });
  // On the frame grid of the timeline.
  assert.deepEqual(scoreSpan(edl, ranged, 30), {
    ...{ start: 4, end: 20.5, seconds: 16.5 },
    what: 'the range',
  });
  const chosen = directive({ context: { selection: [b.clipId, c.clipId, 'gone'] } });
  assert.deepEqual(scoreSpan(edl, chosen, 30), {
    ...{ start: 10, end: 30.5, seconds: 20.5 },
    what: 'the 2 selected clips',
  });
  assert.equal(
    scoreSpan(edl, directive({ context: { selection: [b.clipId] } }), 30).what,
    'the selected clip',
  );
  // A selection that names nothing on the timeline is no selection; a range outranks one.
  assert.equal(scoreSpan(edl, directive({ context: { selection: ['gone'] } }), 30).seconds, 30.5);
  const both = { mode: 'range', context: { range: { start: 1, end: 3 }, selection: [c.clipId] } };
  assert.equal(scoreSpan(edl, directive(both), 30).seconds, 2);
});

test('nothing to score is a 422 that says what to do', () => {
  const refused = (edl, dir, message, hint) =>
    assert.throws(
      () => scoreSpan(edl, dir, 30),
      (err) => {
        assert.ok(err instanceof DirectorError);
        assert.equal(err.status, 422);
        assert.equal(err.message, message);
        assert.match(err.fields.edl, hint);
        return true;
      },
    );
  const nothing = 'There is nothing on the timeline to score';
  refused(doc({ video: [[]], audio: [[]] }), directive(), nothing, /Put something on the timeline/);
  refused(null, directive(), nothing, /or choose a range/);
  const blip = doc({ video: [[picture(0, 0.5)]] });
  refused(blip, directive(), 'That is too short to score', /at least 1 second/);
  const short = directive({ mode: 'range', context: { range: { start: 2, end: 2.6 } } });
  refused(doc({ video: [[picture(0, 20)]] }), short, 'That is too short to score', /longer range/);
  // An empty timeline can still be scored over a range.
  const ranged = directive({ mode: 'range', context: { range: { start: 0, end: 12 } } });
  assert.equal(scoreSpan(doc({ video: [[]] }), ranged, 30).seconds, 12);
});

test('turning points: markers and regions, titles and scenes, long shots — in that order', () => {
  const scene = createClip({ timelineStart: 20, timelineEnd: 26, generator: { type: 'gradient' } });
  const edl = doc(
    {
      video: [
        [title('Meet the\n dashboard', 12, 15), { ...scene, label: 'Scene two' }],
        [picture(0, 6), picture(6, 2), picture(8, 1.5), picture(9.5, 10.5), picture(26, 14)],
      ],
      audio: [[clip('/media/v.wav', 0, 30, 3)]],
    },
    {
      markers: [
        { markerId: 'm1', time: 31, label: 'Reveal', color: '' },
        { markerId: 'm2', time: 9.55, label: '', color: '' },
      ],
      regions: [{ regionId: 'r1', start: 34, end: 38, label: 'Pricing', color: '' }],
    },
  );
  assert.deepEqual(turningPoints(edl, whole(edl)), [
    // Shots of two seconds begin nothing. The marker and the long shot that begins 50 ms
    // before it are one turning point: the marker.
    { time: 9.55, weight: 3, kind: 'marker', label: '' },
    { time: 12, weight: 2, kind: 'title', label: 'Meet the dashboard' },
    { time: 20, weight: 2, kind: 'scene', label: 'Scene two' },
    { time: 26, weight: 1, kind: 'shot', label: '' },
    { time: 31, weight: 3, kind: 'marker', label: 'Reveal' },
    { time: 34, weight: 3, kind: 'region', label: 'Pricing' },
  ]);
  // In a range: seconds from its start, and nothing within half a second of either end.
  const ranged = directive({ mode: 'range', context: { range: { start: 9.2, end: 26.3 } } });
  assert.deepEqual(
    turningPoints(edl, scoreSpan(edl, ranged, 30)).map((point) => [point.time, point.kind]),
    [
      [2.8, 'title'],
      [10.8, 'scene'],
    ],
  );
  // Hidden tracks are not part of the picture; sound never is.
  edl.tracks[1].muted = true;
  const kinds = turningPoints(edl, whole(edl)).map((point) => point.kind);
  assert.deepEqual(kinds, ['marker', 'title', 'scene', 'marker', 'region']);
});

test('the pace is the number of shots that begin in the span, per minute', () => {
  const shots = Array.from({ length: 12 }, (_, i) => picture(i * 2.5, 2.5));
  const edl = doc({ video: [[title('A', 1, 3), title('B', 5, 7)], shots], audio: [[]] });
  assert.equal(
    cutsPerMinute(edl, whole(edl)),
    22,
    'eleven cuts in thirty seconds; titles are no cuts',
  );
  const half = directive({ mode: 'range', context: { range: { start: 0, end: 15 } } });
  assert.equal(cutsPerMinute(edl, scoreSpan(edl, half, 30)), 20);
  // Two layers cut at the same moment count once.
  const layered = doc({
    video: [
      [picture(0, 10), picture(10, 10)],
      [picture(0, 10), picture(10, 10)],
    ],
  });
  assert.equal(cutsPerMinute(layered, whole(layered)), 3);
  const sound = doc({ audio: [[clip(P['voice.wav'], 0, 8, 0)]] });
  assert.equal(cutsPerMinute(sound, whole(sound)), 0);
});

test('speech is found from the words each audible clip plays', () => {
  const [video, audio] = pair(P['interview.mp4'], 0, 16, 0);
  const edl = doc({ video: [[video]], audio: [[audio]] });
  const heard = findSpeech(edl, whole(edl), lookup);
  assert.deepEqual(heard.spans, [span(1, 4.5), span(6.6, 9.3), span(10.9, 13.6)]);
  assert.equal(heard.spoken, 0.55625);
  assert.equal(heard.clips, 1);
  assert.deepEqual(heard.notes, ['Speech was found from the transcript of 1 clip.']);
  // A trimmed clip elsewhere on the timeline: only what it plays, where it plays it.
  const trimmed = doc({
    video: [[picture(0, 30)]],
    audio: [[clip(P['interview.mp4'], 6, 10, 20)]],
  });
  assert.deepEqual(findSpeech(trimmed, whole(trimmed), lookup).spans, [span(20.6, 23.3)]);
  // In a range, from the start of the range, cut at its ends.
  const ranged = directive({ mode: 'range', context: { range: { start: 8, end: 12 } } });
  assert.deepEqual(findSpeech(edl, scoreSpan(edl, ranged, 30), lookup).spans, [
    span(0, 1.3),
    span(2.9, 4),
  ]);
});

test('overlapping voices are one stretch; muted, silent and music clips are not heard', () => {
  const voice = clip(P['voice.wav'], 0, 8, 3.5);
  const interview = clip(P['interview.mp4'], 0, 16, 0);
  const bed = clip(P['music/bed.wav'], 0, 20, 0, { intent: 'music' });
  const edl = doc({ video: [[picture(0, 20)]], audio: [[interview], [voice], [bed]] });
  // voice.wav says something at 0.5–2 and 4.1–6 of itself: 4–5.5 and 7.6–9.5 on the timeline.
  assert.deepEqual(findSpeech(edl, whole(edl), lookup).spans, [
    span(1, 5.5),
    span(6.6, 9.5),
    span(10.9, 13.6),
  ]);
  const only = (change) => {
    const copy = structuredClone(edl);
    change(copy.tracks);
    return findSpeech(copy, whole(copy), lookup).spans.length;
  };
  assert.equal(
    only((tracks) => (tracks[1].muted = true)),
    2,
    'the interview is muted',
  );
  assert.equal(
    only((tracks) => (tracks[2].solo = true)),
    2,
    'only the voice-over is soloed',
  );
  assert.equal(
    only((tracks) => (tracks[3].solo = true)),
    0,
    'only the music is soloed',
  );
  assert.equal(
    only((tracks) => (tracks[1].clips[0].volume = 0)),
    2,
    'a clip turned all the way down',
  );
  assert.equal(
    only((tracks) => (tracks[1].volume = 0)),
    2,
    'a track turned all the way down',
  );
  const none = doc({ video: [[picture(0, 20)]], audio: [[bed]] });
  assert.deepEqual(findSpeech(none, whole(none), lookup), {
    spans: [],
    spoken: 0,
    clips: 0,
    notes: [],
  });
});

test('a voice without a transcript: what is not silence — or the whole clip', () => {
  // voice-memo.wav has silences at 1.5–3.5 and 5–6 and no transcript.
  const memo = doc({ video: [[picture(0, 12)]], audio: [[clip(P['voice-memo.wav'], 0, 8, 2)]] });
  const heard = findSpeech(memo, whole(memo), lookup);
  assert.deepEqual(heard.spans, [span(2, 3.5), span(5.5, 7), span(8, 10)]);
  assert.deepEqual(heard.notes, [
    'Speech was found from the sound of 1 clip.',
    'voice-memo.wav: no transcript, so everything that is not analysed as silence counts as ' +
      'speech. Transcribe for ducking by the word.',
  ]);
  // A file taken for music is a voice when the clip is marked as narration: all of it.
  const narration = clip(P['music/bed.wav'], 2, 9, 1, { intent: 'narration' });
  const marked = doc({ video: [[picture(0, 12)]], audio: [[narration]] });
  const guessed = findSpeech(marked, whole(marked), lookup);
  assert.deepEqual(guessed.spans, [span(1, 8)]);
  assert.match(guessed.notes[1], /^bed\.wav: a voice with neither a transcript nor a silence/);
  // B-roll sound without a transcript is not speech.
  const broll = doc({ video: [[picture(0, 12)]], audio: [[clip(P['broll/beach.mp4'], 0, 8, 0)]] });
  assert.deepEqual(findSpeech(broll, whole(broll), lookup).spans, []);
});
