import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip } from '../edl/factory.js';
import { testEdl } from '../edl/testkit.js';
import { correctionPatch } from './correct.js';
import { cutSource, cutSpan } from './edits.js';
import { groupParagraphs, paragraphOf, transcriptText } from './paragraphs.js';
import { selectedRange, transcriptText as textOf, transcriptUsage } from './panelView.js';
import { firstMatchFrom, normalizeText, searchUnits, stepMatch } from './search.js';
import { resolveSubject } from './subject.js';
import { TALK, TALK_SIDECAR, talkEdl } from './testkit.js';
import { rangeText, transcriptUnits, unitAt, unitEdges } from './units.js';
import {
  FOCUS,
  OFF,
  ON,
  sourceChain,
  sourceToTimeline,
  timelineToSource,
  unitStates,
} from './usage.js';

const { units, level } = transcriptUnits(TALK_SIDECAR);

describe('transcriptUnits', () => {
  it('uses words, falls back to phrases, and drops broken entries', () => {
    assert.equal(level, 'word');
    assert.equal(units.length, 22);
    assert.deepEqual(units[3], { text: 'park.', start: 1.55, end: 1.85, index: 3 });
    const phrases = transcriptUnits({ transcript: [], segments: TALK_SIDECAR.segments });
    assert.equal(phrases.level, 'segment');
    assert.equal(phrases.units[1].text, 'It runs in the browser.');
    const messy = transcriptUnits({
      transcript: [
        { word: ' Hi ', start: 1, end: 1.2 },
        { word: '', start: 2, end: 3 },
        { word: 'x' },
        null,
      ],
    });
    assert.deepEqual(messy.units, [{ text: 'Hi', start: 1, end: 1.2, index: 0 }]);
    assert.deepEqual(transcriptUnits(null), { units: [], level: 'none' });
  });

  it('puts each region edge just before its word, inside the gap', () => {
    const edges = unitEdges(units);
    assert.ok(Math.abs(edges[0] - 0.46) < 1e-9);
    assert.ok(Math.abs(edges[1] - (units[1].start - 0.025)) < 1e-9, 'half of a 0.05 s gap');
    assert.ok(Math.abs(edges[4] - (units[4].start - 0.04)) < 1e-9, 'the full lead in a long pause');
    const touching = unitEdges([
      { text: 'a', start: 0, end: 1, index: 0 },
      { text: 'b', start: 1, end: 2, index: 1 },
    ]);
    assert.deepEqual(touching, [0, 1]);
  });

  it('finds the unit being spoken and joins text', () => {
    assert.equal(unitAt(units, 0.2), -1);
    assert.equal(unitAt(units, units[0].start), 0);
    assert.equal(unitAt(units, units[5].start + 0.1), 5);
    assert.equal(unitAt(units, units[8].end + 1), 8, 'the last word stays current through a pause');
    assert.equal(unitAt(units, 999), 21);
    assert.equal(rangeText(units, 0, 3), 'Welcome to the park.');
  });
});

describe('groupParagraphs', () => {
  it('starts a paragraph after a real pause', () => {
    const paragraphs = groupParagraphs(units);
    assert.deepEqual(
      paragraphs.map((p) => [p.first, p.last]),
      [
        [0, 8],
        [9, 18],
        [19, 21],
      ],
    );
    assert.equal(paragraphs[0].start, units[0].start);
    assert.equal(paragraphs[1].end, units[18].end);
    assert.equal(paragraphOf(paragraphs, 10), 1);
    assert.equal(paragraphOf(paragraphs, 99), -1);
    assert.equal(transcriptText(units, paragraphs).split('\n\n').length, 3);
  });

  it('breaks long unbroken speech at a sentence end, or by force', () => {
    const run = Array.from({ length: 30 }, (_, i) => ({
      text: i % 7 === 6 ? 'end.' : 'word',
      start: i * 0.4,
      end: i * 0.4 + 0.3,
      index: i,
    }));
    assert.deepEqual(
      groupParagraphs(run, { maxUnits: 10 }).map((p) => p.last),
      [13, 27, 29],
    );
    const flat = run.map((u) => ({ ...u, text: 'word' }));
    assert.deepEqual(
      groupParagraphs(flat, { maxUnits: 10 }).map((p) => p.last),
      [19, 29],
    );
    assert.deepEqual(groupParagraphs([]), []);
  });
});

describe('usage', () => {
  const edl = talkEdl();

  it('picks the chain on the focus clip’s track', () => {
    assert.equal(sourceChain(edl, TALK, { focusClipId: 'a' }).trackId, 'a1');
    assert.equal(sourceChain(edl, TALK, { trackId: 'a1' }).trackId, 'a1');
    assert.equal(sourceChain(edl, TALK).trackId, 'v1', 'first track that uses the file');
    assert.deepEqual(sourceChain(edl, '/media/none.mp4'), {
      file: '/media/none.mp4',
      trackId: '',
      locked: false,
      segments: [],
    });
    assert.equal(sourceChain(edl, TALK, { focusClipId: 'later' }).trackId, 'v1');
  });

  it('maps source time to timeline time and back, through cuts', () => {
    const { segments } = sourceChain(edl, TALK);
    assert.deepEqual(sourceToTimeline(segments, 3), { time: 5, clipId: 'v' });
    assert.deepEqual(timelineToSource(segments, 5), { sourceTime: 3, clipId: 'v' });
    assert.equal(sourceToTimeline(segments, 15), null, 'the out point is exclusive');
    assert.equal(timelineToSource(segments, 1.9), null);
    const edges = unitEdges(units);
    const cut = cutSource(edl, sourceChain(edl, TALK), cutSpan(units, edges, 4, 8));
    const pieces = sourceChain(cut, TALK).segments;
    assert.equal(sourceToTimeline(pieces, units[5].start), null, 'a cut word is nowhere');
    const after = sourceToTimeline(pieces, units[9].start);
    assert.equal(after.clipId, pieces[1].clipId);
    assert.ok(Math.abs(timelineToSource(pieces, after.time).sourceTime - units[9].start) < 1e-9);
  });

  it('prefers the focus piece when a moment plays twice', () => {
    const twice = testEdl({
      v1: [
        createClip({ clipId: 'one', sourceFile: TALK, sourceOut: 5, timelineEnd: 5 }),
        createClip({
          clipId: 'two',
          sourceFile: TALK,
          sourceIn: 3,
          sourceOut: 8,
          timelineStart: 10,
          timelineEnd: 15,
        }),
      ],
    });
    const { segments } = sourceChain(twice, TALK);
    assert.deepEqual(sourceToTimeline(segments, 4), { time: 4, clipId: 'one' });
    assert.deepEqual(sourceToTimeline(segments, 4, 'two'), { time: 11, clipId: 'two' });
    const states = unitStates(units, segments, 'two');
    assert.equal(states[0], ON);
    assert.equal(states[units.findIndex((u) => u.start > 3.1)], FOCUS);
    assert.equal(states.at(-1), OFF);
  });
});

describe('resolveSubject', () => {
  const edl = talkEdl();
  const has = (file) => file === TALK;

  it('follows the selection, preferring a clip with a transcript', () => {
    assert.deepEqual(resolveSubject({ edl, selection: ['music', 'a'], hasTranscript: has }), {
      file: TALK,
      clipId: 'a',
      from: 'selection',
      note: '',
    });
    assert.equal(resolveSubject({ edl, selection: ['music'] }).file, '/media/song.mp3');
  });

  it('falls back to the clip under the cursor, then to nothing', () => {
    assert.equal(resolveSubject({ edl, cursor: 5, hasTranscript: has }).clipId, 'v');
    assert.equal(resolveSubject({ edl, cursor: 1 }).clipId, 'music');
    assert.deepEqual(resolveSubject({ edl, cursor: 50 }), {
      file: '',
      clipId: '',
      from: 'none',
      note: '',
    });
    assert.equal(resolveSubject({ edl: null }).from, 'none');
  });

  it('shows a pinned file whatever is selected, and explains clips without speech', () => {
    const pinned = resolveSubject({ edl, selection: ['music'], pinned: TALK });
    assert.deepEqual(pinned, { file: TALK, clipId: '', from: 'pinned', note: '' });
    assert.equal(resolveSubject({ edl, selection: ['v'], pinned: TALK }).clipId, 'v');
    const title = testEdl({
      v1: [createClip({ clipId: 't', timelineEnd: 3, text: { content: 'Hi' } })],
    });
    assert.equal(resolveSubject({ edl: title, selection: ['t'] }).note, 'title');
  });
});

describe('search', () => {
  it('finds text inside and across words, ignoring case and punctuation', () => {
    assert.deepEqual(searchUnits(units, 'the'), [
      { first: 2, last: 2 },
      { first: 7, last: 7 },
      { first: 14, last: 14 },
    ]);
    assert.deepEqual(searchUnits(units, 'THE PAR'), [{ first: 2, last: 3 }]);
    assert.deepEqual(searchUnits(units, 'park it runs'), [{ first: 3, last: 5 }]);
    assert.deepEqual(searchUnits(units, 'zebra'), []);
    assert.deepEqual(searchUnits(units, '  '), []);
    assert.equal(normalizeText('Hello, World! It’s'), 'hello world it s');
  });

  it('steps through matches with wrap-around', () => {
    assert.equal(stepMatch(3, -1, 1), 0);
    assert.equal(stepMatch(3, -1, -1), 2);
    assert.equal(stepMatch(3, 2, 1), 0);
    assert.equal(stepMatch(3, 0, -1), 2);
    assert.equal(stepMatch(0, 0, 1), -1);
    const matches = searchUnits(units, 'the');
    assert.equal(firstMatchFrom(matches, 5), 1);
    assert.equal(firstMatchFrom(matches, 19), 0);
    assert.equal(firstMatchFrom([], 0), -1);
  });
});

describe('correctionPatch', () => {
  it('changes the word, keeps the timing and rebuilds the phrase', () => {
    const patch = correctionPatch(TALK_SIDECAR, units[3], 'word', ' lake. ');
    assert.deepEqual(patch.transcript[3], { word: 'lake.', start: 1.55, end: 1.85 });
    assert.equal(patch.transcript.length, 22);
    assert.equal(patch.segments[0].text, 'Welcome to the lake.');
    assert.equal(patch.segments[1], TALK_SIDECAR.segments[1], 'other phrases are untouched');
    assert.equal(TALK_SIDECAR.transcript[3].word, 'park.', 'the sidecar is not mutated');
  });

  it('keeps a leading space, and refuses empty or unchanged text', () => {
    const spaced = { transcript: [{ word: ' helo', start: 0, end: 1 }], segments: [] };
    const [unit] = transcriptUnits(spaced).units;
    assert.deepEqual(correctionPatch(spaced, unit, 'word', 'hello'), {
      transcript: [{ word: ' hello', start: 0, end: 1 }],
    });
    assert.equal(correctionPatch(spaced, unit, 'word', '  '), null);
    assert.equal(correctionPatch(spaced, unit, 'word', 'helo'), null);
  });

  it('corrects a phrase when there are no word timings', () => {
    const sidecar = { transcript: [], segments: TALK_SIDECAR.segments };
    const phrase = transcriptUnits(sidecar).units[4];
    const patch = correctionPatch(sidecar, phrase, 'segment', 'Thanks for reading.');
    assert.deepEqual(Object.keys(patch), ['segments']);
    assert.equal(patch.segments[4].text, 'Thanks for reading.');
    assert.equal(patch.segments[4].start, TALK_SIDECAR.segments[4].start);
  });
});

describe('panel view', () => {
  it('derives text once per sidecar and keeps word states until the chain changes', () => {
    const text = textOf(TALK_SIDECAR);
    assert.equal(textOf(TALK_SIDECAR), text, 'remembered per sidecar');
    assert.deepEqual([text.units.length, text.paragraphs.length, text.level], [22, 3, 'word']);
    assert.deepEqual(textOf(null), { units: [], level: 'none', edges: [], paragraphs: [] });
    const edl = talkEdl();
    const first = transcriptUsage(edl, TALK, text.units, { focusClipId: 'v' });
    const again = transcriptUsage({ ...edl, markers: [] }, TALK, text.units, { focusClipId: 'v' });
    assert.equal(again.states, first.states, 'same array while the clips are the same');
    const cut = cutSource(edl, first.chain, cutSpan(text.units, text.edges, 4, 8));
    const after = transcriptUsage(cut, TALK, text.units, { focusClipId: 'v' });
    assert.notEqual(after.states, first.states);
    assert.deepEqual([after.states[3], after.states[5], after.states[9]], [FOCUS, OFF, ON]);
  });

  it('turns anchor and head into a range, and nothing when out of bounds', () => {
    assert.deepEqual(selectedRange(7, 3), { first: 3, last: 7 });
    assert.deepEqual(selectedRange(2, 2, 22), { first: 2, last: 2 });
    assert.equal(selectedRange(-1, 4), null);
    assert.equal(selectedRange(3, 30, 22), null);
  });
});
