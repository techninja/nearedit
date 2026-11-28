import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderSong } from './renderer.js';
import { eightParts } from './testSongs.js';

/**
 * How many times faster than it plays a song renders: the best of a few
 * runs, by the processor time the run used — what other programs on the
 * machine take is not counted against it.
 */
function speed(song, runs = 3) {
  let best = 0;
  for (let run = 0; run < runs; run++) {
    const before = process.cpuUsage();
    const samples = renderSong(song);
    const { user, system } = process.cpuUsage(before);
    best = Math.max(best, samples.length / 2 / 48000 / ((user + system) / 1e6));
  }
  return best;
}

describe('speed', () => {
  it('renders eight parts at least 20 times faster than they play', () => {
    const times = speed(eightParts(16), 4);
    console.log(`    eight parts: ${times.toFixed(1)} × real time`);
    assert.ok(times >= 20, `${times.toFixed(1)} × real time`);
  });

  it('does not crawl through silence: a long tail after a reverberated hit stays fast', () => {
    const hit = {
      kind: 'drums',
      kit: '808',
      reverb: 1,
      delay: 1,
      play: [[0, 1]],
      lanes: { snare: 'X', kick: 'X' },
    };
    const song = {
      bars: 1,
      tail: 30,
      master: { reverb: { size: 0.2, decay: 0 }, delay: { feedback: 0.1 } },
    };
    const times = speed({ ...song, parts: [hit] });
    console.log(`    a hit and half a minute of tail: ${times.toFixed(0)} × real time`);
    assert.ok(times > 150, `${times.toFixed(0)} × real time`);
    const samples = renderSong({ ...song, parts: [hit] });
    assert.ok(
      samples.subarray(samples.length / 2).every((x) => x === 0),
      'and what is left is exactly silence',
    );
  });
});
