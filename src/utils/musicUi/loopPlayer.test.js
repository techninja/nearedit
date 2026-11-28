import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AHEAD, LEAD, barAt, createLoopPlayer } from './loopPlayer.js';
import { FADE } from './loopVoices.js';
import { FakeAudioContext } from './testing/fakeAudio.js';

/** A four-bar song at 120 BPM (2 s a bar) with a 2 s tail. */
const take = (ctx, barSeconds = 2, bars = 4) => ({
  buffer: ctx.createBuffer(2, (bars * barSeconds + 2) * 48000, 48000),
  bars: Array.from({ length: bars + 1 }, (_, bar) => bar * barSeconds),
});
const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} ≈ ${expected}`);

describe('loop player', () => {
  let ctx;
  let player;
  let tick;
  /** What each source's own gain was told, by source. */
  const gainOf = (index) => player.voices().find((v) => v.source === ctx.sources[index])?.gain.gain;
  const at = (seconds) => {
    ctx.currentTime = seconds;
    tick?.();
  };
  beforeEach(() => {
    ctx = new FakeAudioContext();
    tick = null;
    const timers = { every: (run) => ((tick = run), 1), cancel: () => (tick = null) };
    player = createLoopPlayer(ctx, ctx.destination, timers);
  });

  it('says where a time is in bars, whatever their length', () => {
    assert.equal(barAt([0, 2, 4], 3), 1.5);
    assert.equal(barAt([0, 2, 4], 5), 2.5, 'past the last line it keeps counting');
    assert.equal(barAt([0, 1, 4], 2.5), 1.5);
  });

  it('starts on the first bar of the loop and says where the music is', () => {
    player.start(take(ctx), [0, 4]);
    assert.equal(player.playing(), true);
    assert.deepEqual(ctx.sources[0].started, { when: 10 + LEAD, offset: 0 });
    assert.equal(player.position(), null, 'not yet: it starts in a moment');
    at(11 + LEAD);
    assert.deepEqual(player.position(), { time: 1, bar: 0.5 });
  });

  it('puts the next pass on the clock ahead of time, to the sample, and lets the tail ring', () => {
    player.start(take(ctx), [0, 4]);
    const start = 10 + LEAD;
    at(start + 8 - AHEAD - 0.1);
    assert.equal(ctx.sources.length, 1, 'not yet');
    at(start + 8 - AHEAD + 0.01);
    assert.equal(ctx.sources.length, 2);
    near(ctx.sources[1].started.when, start + 8, 'the second pass starts where the loop ends');
    assert.equal(ctx.sources[1].started.offset, 0);
    assert.deepEqual(
      gainOf(0).events,
      [{ type: 'set', value: 1, time: start }],
      'no fade: it rings out',
    );
    at(start + 8 + 1);
    near(player.position().time, 1, 'the playhead is in the new pass');
    at(start + 16 - 1);
    near(ctx.sources[2].started.when, start + 16, 'and the third follows the second');
    at(start + 8 + 10.2);
    assert.equal(player.voices().length, 2, 'a pass that has rung out is swept away');
    assert.equal(ctx.sources[0].connected, 0);
  });

  it('cross-fades at the end of a loop inside the song', () => {
    player.start(take(ctx), [1, 3]);
    const start = 10 + LEAD;
    near(ctx.sources[0].started.when, start - FADE, 'it fades in from just before bar 2');
    near(ctx.sources[0].started.offset, 2 - FADE, 'offset');
    at(start + 4 - 1);
    const [first, second] = ctx.sources;
    near(second.started.when, start + 4 - FADE, 'second pass');
    near(second.started.offset, 2 - FADE, 'from just before the loop’s first bar');
    const out = gainOf(0).events.slice(-2);
    assert.deepEqual(
      out.map((event) => [event.type, event.value]),
      [
        ['set', 1],
        ['ramp', 0],
      ],
    );
    near(out[1].time, start + 4, 'the first pass is silent where the loop ends');
    const into = gainOf(1).events;
    assert.deepEqual(
      into.map((event) => [event.type, event.value]),
      [
        ['set', 0],
        ['ramp', 1],
      ],
    );
    near(into[1].time, start + 4, 'and the second is up by then');
    assert.equal(first.stopped, null, 'stopped only once it has been silent for a moment');
    at(start + 4 + 0.2);
    assert.notEqual(first.stopped, null);
  });

  it('lets a new buffer take over at the next bar line with a short cross-fade', () => {
    player.start(take(ctx), [0, 4]);
    const start = 10 + LEAD;
    at(start + 2.5);
    const edited = take(ctx);
    player.replan(edited);
    const [, next] = ctx.sources;
    assert.equal(next.buffer, edited.buffer);
    near(next.started.when, start + 4 - FADE, 'at the line of bar 3');
    near(next.started.offset, 4 - FADE, 'from the same bar of the new buffer');
    near(gainOf(0).events.at(-1).time, start + 4, 'the old one is out by the bar line');
    at(start + 5);
    near(player.position().bar, 2.5, 'the music kept its place');
    at(start + 8 - 1);
    near(ctx.sources[2].started.when, start + 8, 'and the loop still ends where it did');
  });

  it('keeps its place in bars when the tempo changes', () => {
    player.start(take(ctx), [0, 4]);
    const start = 10 + LEAD;
    at(start + 2.5);
    player.replan(take(ctx, 1)); // twice as fast: a bar is one second
    near(ctx.sources[1].started.when, start + 4 - FADE, 'still at the old bar line');
    near(ctx.sources[1].started.offset, 2 - FADE, 'bar 3 of the faster song');
    at(start + 4.5);
    near(player.position().bar, 2.5, 'half a bar later, half a bar further');
    at(start + 5.5);
    near(ctx.sources[2].started.when, start + 6, 'the loop ends after two more bars of one second');
  });

  it('skips a bar line that is too close to plan for', () => {
    player.start(take(ctx), [0, 4]);
    const start = 10 + LEAD;
    at(start + 2 - LEAD / 2);
    player.replan(take(ctx));
    near(ctx.sources[1].started.when, start + 4 - FADE, 'the line after the next');
  });

  it('replaces a pass that was already on the clock but is not heard yet', () => {
    player.start(take(ctx), [0, 4]);
    const start = 10 + LEAD;
    at(start + 7.2);
    const planned = ctx.sources[1];
    near(planned.started.when, start + 8, 'the next pass is planned');
    const edited = take(ctx);
    player.replan(edited);
    assert.notEqual(planned.stopped, null, 'the planned pass will never sound');
    assert.equal(ctx.sources[2].buffer, edited.buffer);
    near(ctx.sources[2].started.when, start + 8, 'the new buffer starts where the loop does');
    assert.equal(ctx.sources[2].started.offset, 0);
    assert.equal(player.voices().length, 2);
  });

  it('follows other bars to loop: on, or back to the start at the next bar line', () => {
    player.start(take(ctx), [0, 4]);
    const start = 10 + LEAD;
    at(start + 4.5);
    player.replan(undefined, [2, 4]);
    near(ctx.sources[1].started.offset, 6 - FADE, 'inside the new loop: it plays on');
    at(start + 6.5);
    player.replan(undefined, [0, 2]);
    near(ctx.sources[2].started.when, start + 8, 'outside the new loop: at the next line');
    assert.equal(ctx.sources[2].started.offset, 0, 'back to its first bar');
    at(start + 11);
    near(ctx.sources[3].started.when, start + 12, 'and round again after two bars');
    assert.equal(gainOf(2).events.at(-1).value, 0, 'cut short with a fade: more music follows it');
  });

  it('fades out and stops, and plans nothing more', () => {
    player.start(take(ctx), [0, 4]);
    at(12);
    player.stop();
    assert.equal(player.playing(), false);
    assert.equal(player.position(), null);
    near(ctx.sources[0].stopped, 12 + FADE + 0.005, 'stopped after a short fade');
    player.replan(take(ctx));
    assert.equal(ctx.sources.length, 1, 'a buffer for later starts nothing');
    player.start(take(ctx), [0, 4]);
    assert.equal(ctx.sources.length, 2);
  });
});
