import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, normalizeSong, renderSong } from '#utils/music/index.js';
import * as audition from './audition.js';
import { drumHit, forgetHits, noteHit, playHit } from './auditionHits.js';
import { setAuditionHost } from './auditionHost.js';
import { interleaved, renderSliced, toAudioBuffer } from './auditionRender.js';
import { FakeAudioContext, fakeHost } from './testing/fakeAudio.js';
import { testSong, turn } from './testkit.js';

const song = normalizeSong(testSong());
/** Long enough for a small song to be rendered, slice by slice. */
const rendered = async () => {
  for (let i = 0; i < 200 && audition.auditionState.get().rendering; i++) await turn();
  await turn();
};

describe('rendering in slices', () => {
  it('gives exactly the samples of one long render', async () => {
    const whole = renderSong(song);
    const made = await renderSliced(song, { slice: 0.2 });
    assert.equal(made.frames, whole.length / 2);
    assert.ok(made.slices > 20, `many slices (${made.slices})`);
    assert.deepEqual(encodeWav(made.samples), encodeWav(whole));
    const buffer = toAudioBuffer(new FakeAudioContext(), made);
    assert.deepEqual(
      [buffer.numberOfChannels, buffer.length, buffer.sampleRate],
      [2, made.frames, 48000],
    );
    assert.deepEqual(interleaved(buffer), whole, 'the buffer holds the same samples');
    assert.ok(
      whole.some((sample) => Math.abs(sample) > 0.1),
      'and they are not silence',
    );
  });

  it('fits its slices to the time each may take', async () => {
    const frames = renderSong(song).length / 2;
    /** Render on a machine where every slice takes `cost` milliseconds. */
    const slicesAt = async (cost) => {
      let clock = 0;
      let calls = 0;
      const now = () => (calls++ % 2 ? (clock += cost) : clock);
      return (await renderSliced(song, { slice: 8, now, pause: async () => {} })).slices;
    };
    assert.equal(await slicesAt(8), Math.ceil(frames / 1024), 'on budget: the size it began with');
    assert.ok((await slicesAt(2)) < 12, 'under budget: slices double until few are needed');
    const slow = await slicesAt(32);
    assert.ok(slow > frames / 1024 && slow <= Math.ceil(frames / 256) + 2, 'over budget: smaller');
  });

  it('gives up when it is told to, between two slices', async () => {
    const signal = { aborted: false };
    let slices = 0;
    const pause = async () => {
      slices += 1;
      if (slices === 3) signal.aborted = true;
    };
    assert.equal(await renderSliced(song, { slice: 0.2, signal, pause }), null);
    assert.equal(slices, 3);
  });
});

describe('audition', () => {
  let ctx;
  let host;
  beforeEach(() => {
    ctx = new FakeAudioContext('suspended');
    host = fakeHost(ctx);
    setAuditionHost(host);
    forgetHits();
  });
  afterEach(() => {
    audition.stopAudition();
    setAuditionHost();
  });

  it('starts the context from the gesture, renders the song and loops it', async () => {
    const playing = audition.playSong('editor', song, [0, 2]);
    assert.deepEqual(audition.auditionState.get(), {
      ...{ owner: 'editor', playing: true, rendering: false, problem: '' },
    });
    assert.equal(await playing, true);
    assert.equal(ctx.state, 'running');
    assert.equal(ctx.sources.length, 1);
    const [first] = ctx.sources;
    assert.deepEqual(
      interleaved(first.buffer),
      renderSong(song),
      'what plays is the engine’s song',
    );
    assert.deepEqual(first.started, { when: 10 + 0.04, offset: 0 });
    assert.equal(audition.auditionTake().buffer, first.buffer);
    ctx.currentTime = 11.04;
    assert.deepEqual(audition.auditionPosition(), { time: 1, bar: 0.5 });
  });

  it('says so when the browser will not let sound start', async () => {
    ctx.allowed = false;
    assert.equal(await audition.playSong('editor', song, [0, 2]), false);
    const state = audition.auditionState.get();
    assert.deepEqual([state.owner, state.playing], ['', false]);
    assert.match(state.problem, /press Play again/);
    assert.equal(ctx.sources.length, 0);
    ctx.allowed = true;
    assert.equal(await audition.playSong('editor', song, [0, 2]), true);
    assert.equal(audition.auditionState.get().problem, '');
  });

  it('plays one thing at a time, and gives the device back when it stops', async () => {
    await audition.playSong('starter:a', song, [0, 2]);
    const other = normalizeSong({ ...testSong(), bpm: 90 });
    await audition.playSong('editor', other, [0, 2]);
    assert.equal(audition.auditionState.get().owner, 'editor');
    assert.notEqual(ctx.sources[0].stopped, null, 'the first one was stopped');
    audition.stopAudition('starter:a');
    assert.equal(audition.auditionState.get().playing, true, 'not the owner: nothing happens');
    const idled = host.idled;
    audition.stopAudition('editor');
    assert.equal(audition.auditionState.get().owner, '');
    assert.equal(host.idled, idled + 1);
    assert.equal(audition.auditionPosition(), null);
  });

  it('renders an edited song again and lets it take over, the same song never twice', async () => {
    await audition.playSong('editor', song, [0, 2]);
    const edited = normalizeSong({ ...testSong(), swing: 0.3 });
    ctx.currentTime = 10.5;
    audition.updateAudition('editor', edited, [0, 2]);
    await new Promise((resolve) => setTimeout(resolve, 90));
    await rendered();
    assert.equal(ctx.sources.length, 2);
    assert.deepEqual(interleaved(ctx.sources[1].buffer), renderSong(edited));
    audition.updateAudition('editor', song, [0, 2]);
    await turn();
    await turn();
    assert.equal(ctx.sources[2].buffer, ctx.sources[0].buffer, 'the first buffer again, at once');
    audition.updateAudition('starter:x', edited, [0, 2]);
    await turn();
    assert.equal(ctx.sources.length, 3, 'somebody who does not play changes nothing');
  });

  it('plays a single drum and a single note once, and keeps what it made', async () => {
    const [drums, synth] = song.parts;
    const kick = drumHit(song, drums, 'kick', 'X');
    assert.deepEqual(kick.parts[0].lanes, { kick: 'X' });
    assert.equal(await playHit(kick), true);
    assert.equal(ctx.state, 'running');
    const [source] = ctx.sources;
    assert.deepEqual(source.started, { when: 0, offset: 0 });
    const samples = interleaved(source.buffer);
    assert.ok(Math.max(...samples.slice(0, 4800)) > 0.2, 'the kick is at the very start');
    await playHit(drumHit(song, drums, 'kick', 'X'));
    assert.equal(ctx.sources[1].buffer, source.buffer, 'made once');
    const note = noteHit(song, { ...synth, transpose: 12 }, 60, 0.9, 8);
    assert.deepEqual(note.parts[0].notes, [[0, 3, 60, 0.9]]);
    assert.equal(note.parts[0].transpose, 12);
    await playHit(note);
    assert.notEqual(ctx.sources[2].buffer, source.buffer);
    const idled = host.idled;
    for (const each of ctx.sources) each.onended();
    assert.equal(host.idled, idled + 1, 'the device is given back after the last one');
  });
});
