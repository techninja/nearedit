import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertValid, clipOf, deepFreeze } from '../edl/testkit.js';
import { cutSource, cutSpan } from './edits.js';
import { planSilenceRemoval, removeSilences, silenceSpans } from './silences.js';
import { TALK, TALK_SIDECAR, pieces, talkEdl } from './testkit.js';
import { transcriptUnits, unitEdges } from './units.js';
import { OFF, sourceChain, unitStates } from './usage.js';

const { units } = transcriptUnits(TALK_SIDECAR);
const source = { words: units };
const chainOf = (edl) => sourceChain(edl, TALK, { focusClipId: 'v' });
const near = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

describe('silenceSpans', () => {
  it('finds the pauses longer than the threshold and keeps the padding', () => {
    const { spans, basis } = silenceSpans(source, 0, 15, { threshold: 0.8, padding: 0.1 });
    assert.equal(basis, 'words');
    // Pauses of 1.4 s (after word 8), 2.0 s (after word 18) and the silent tail of the clip.
    assert.equal(spans.length, 3);
    assert.ok(near(spans[0].start, units[8].end + 0.1) && near(spans[0].end, units[9].start - 0.1));
    assert.ok(
      near(spans[1].start, units[18].end + 0.1) && near(spans[1].end, units[19].start - 0.1),
    );
    assert.ok(near(spans[2].start, units[21].end + 0.1) && near(spans[2].end, 15));
  });

  it('treats the head of the clip as a pause only when it is long enough', () => {
    assert.equal(
      silenceSpans(source, 0, 4.5, { threshold: 0.8 }).spans.length,
      0,
      '0.5 s lead-in stays',
    );
    const tight = silenceSpans(source, 0, 4.5, { threshold: 0.4, padding: 0.1 });
    assert.ok(
      near(tight.spans[0].start, 0) && near(tight.spans[0].end, 0.4),
      'lead-in cut to the padding',
    );
    assert.equal(tight.spans.length, 2, 'and the 0.6 s pause after the first sentence');
  });

  it('falls back to detected silences, and to nothing', () => {
    const detected = {
      silences: [
        { start: 4, end: 6 },
        { start: 9, end: 9.3 },
      ],
    };
    const { spans, basis } = silenceSpans(detected, 0, 12, { threshold: 0.8, padding: 0.1 });
    assert.equal(basis, 'silences');
    assert.deepEqual(
      spans.map((s) => [s.start, s.end]),
      [[4.1, 5.9]],
    );
    assert.deepEqual(silenceSpans({}, 0, 12), { spans: [], basis: 'none' });
    assert.equal(silenceSpans(source, 13, 15).basis, 'none', 'no words in the range');
  });
});

describe('planSilenceRemoval', () => {
  it('previews the cuts and the time they save, on whole frames', () => {
    const edl = talkEdl();
    const plan = planSilenceRemoval(chainOf(edl), source, {
      threshold: 0.8,
      padding: 0.1,
      fps: 30,
    });
    assert.equal(plan.count, 3);
    assert.equal(plan.basis, 'words');
    for (const cut of plan.cuts) {
      assert.equal(cut.clipId, 'v');
      assert.ok(
        near(cut.from * 30, Math.round(cut.from * 30)) &&
          near(cut.to * 30, Math.round(cut.to * 30)),
      );
    }
    // The 1.4 s and 2.0 s pauses lose all but 0.1 s either side, rounded inward to frames.
    const lengths = plan.cuts.map((cut) => cut.to - cut.from);
    assert.ok(lengths[0] <= 1.2 + 1e-9 && lengths[0] > 1.2 - 2 / 30, `first cut ${lengths[0]}`);
    assert.ok(lengths[1] <= 1.8 + 1e-9 && lengths[1] > 1.8 - 2 / 30, `second cut ${lengths[1]}`);
    assert.ok(near(plan.seconds, lengths[0] + lengths[1] + lengths[2]));
    const looser = planSilenceRemoval(chainOf(edl), source, { threshold: 1.6, padding: 0.1 });
    assert.equal(looser.count, 2, 'only the 2.0 s pause and the tail');
    const padded = planSilenceRemoval(chainOf(edl), source, { threshold: 0.8, padding: 0.3 });
    assert.ok(padded.seconds < plan.seconds, 'more padding saves less');
  });

  it('plans nothing without data or without pauses', () => {
    const edl = talkEdl();
    assert.equal(planSilenceRemoval(chainOf(edl), {}, {}).count, 0);
    assert.equal(planSilenceRemoval(chainOf(edl), source, { threshold: 5 }).count, 0);
    assert.equal(planSilenceRemoval(sourceChain(edl, '/media/none.mp4'), source).count, 0);
  });
});

describe('removeSilences', () => {
  it('tightens a linked pair by exactly the previewed time and keeps every word', () => {
    const start = deepFreeze(talkEdl());
    const plan = planSilenceRemoval(chainOf(start), source, { threshold: 0.8, padding: 0.1 });
    const out = assertValid(removeSilences(start, plan), { sourceDurations: { [TALK]: 15 } });
    const picture = pieces(out, 'v1');
    const sound = pieces(out, 'a1');
    assert.equal(
      picture.length,
      3,
      'two inner pauses split the clip in three; the tail is trimmed',
    );
    picture.forEach((piece, i) => {
      assert.deepEqual([piece.span, piece.source], [sound[i].span, sound[i].source]);
      assert.deepEqual([piece.link, sound[i].link], [sound[i].id, piece.id]);
    });
    const saved = clipOf(start, 'later').timelineStart - clipOf(out, 'later').timelineStart;
    assert.ok(near(saved, plan.seconds), `moved ${saved}, planned ${plan.seconds}`);
    const states = unitStates(units, sourceChain(out, TALK, { trackId: 'v1' }).segments);
    assert.ok(
      states.every((state) => state !== OFF),
      'no word was lost',
    );
    assert.equal(planSilenceRemoval(sourceChain(out, TALK, { trackId: 'v1' }), source).count, 0);
  });

  it('works on a chain that was already cut by text', () => {
    const edges = unitEdges(units);
    const cut = cutSource(talkEdl(), chainOf(talkEdl()), cutSpan(units, edges, 4, 8));
    const chain = chainOf(cut);
    const plan = planSilenceRemoval(chain, source, { threshold: 0.8, padding: 0.1 });
    assert.deepEqual(
      new Set(plan.cuts.map((c) => c.clipId)).size,
      1,
      'both pauses left are in the second piece',
    );
    const out = assertValid(removeSilences(cut, plan));
    assert.deepEqual(
      pieces(out, 'v1').map((p) => p.span),
      pieces(out, 'a1').map((p) => p.span),
    );
  });
});
