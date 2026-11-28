/**
 * The sound of the styles, measured: nobody listens to a test run. Every
 * style is rendered by the engine as the action would render it and held
 * to the numbers DIRECTOR-SCORE.md gives.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STYLES } from '#utils/director/score/styles.js';
import { makeScore } from '#utils/director/score/testing/make.js';
import { CEILING } from '#utils/music/engine/limiter.js';
import { songSeconds } from '#utils/music/timing.js';
import { brightness, db, level, loudness, renderToWav } from './testing/measure.js';

let dir;
/** @type {Map<string, any>} Every style's score of 36 seconds, rendered and measured. */
const heard = new Map();
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'nearedit-score-sound-'));
  for (const style of STYLES) {
    const made = makeScore(style.id);
    const file = join(dir, `${style.id}.wav`);
    const mono = renderToWav(made.song, file);
    heard.set(style.id, { ...made, mono, meter: await loudness(file) });
  }
});
after(() => rmSync(dir, { recursive: true, force: true }));

const section = (made, name) => made.sections.find((entry) => entry.name === name);
const stretch = (made, part) => [part.from * made.barSeconds, part.to * made.barSeconds];

test('every style is about equally loud: −20 to −16 LUFS, true peak under −1 dBFS', () => {
  const lufs = [];
  for (const [id, { meter }] of heard) {
    assert.ok(meter.lufs >= -20 && meter.lufs <= -16, `${id}: ${meter.lufs} LUFS`);
    assert.ok(meter.peak < -1, `${id}: true peak ${meter.peak} dBFS`);
    assert.ok(meter.range < 12, `${id}: loudness range ${meter.range} LU`);
    lufs.push(meter.lufs);
  }
  assert.ok(Math.max(...lufs) - Math.min(...lufs) <= 2, `spread ${lufs}`);
});

test('nothing clips, nothing is broken: finite samples, no offset, the limiter at rest', () => {
  for (const [id, { mono, song }] of heard) {
    let [sum, peak] = [0, 0];
    for (const sample of mono) {
      assert.ok(Number.isFinite(sample), `${id}: a sample is not a number`);
      sum += sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    assert.equal(mono.length, Math.round(songSeconds(song) * 48000), id);
    assert.ok(Math.abs(sum / mono.length) < 1e-3, `${id}: offset ${sum / mono.length}`);
    // Peaks stay under the limiter's ceiling: the mix is not leaning on it.
    assert.ok(peak < CEILING * 0.95, `${id}: peak ${db(peak).toFixed(1)} dBFS`);
  }
});

test('the sections follow the arc: the lift is louder and brighter than the opening', () => {
  /** @type {string[]} */
  const flat = [];
  for (const [id, made] of heard) {
    const { mono, sections } = made;
    const lift = section(made, 'lift');
    const opening = sections[0];
    assert.ok(lift && opening.energy < lift.energy, `${id}: ${sections.map((s) => s.name)}`);
    const quiet = level(mono, ...stretch(made, opening)).rms;
    const loud = level(mono, ...stretch(made, lift)).rms;
    if (!(loud > quiet + 1.5)) flat.push(`${id}: ${quiet.toFixed(1)} dB → ${loud.toFixed(1)} dB`);
    const dull = brightness(mono, ...stretch(made, opening));
    const bright = brightness(mono, ...stretch(made, lift));
    if (!(bright.highs > dull.highs + 1.5)) {
      flat.push(`${id}: highs ${dull.highs.toFixed(1)} dB → ${bright.highs.toFixed(1)} dB`);
    }
    if (!(bright.centroid > dull.centroid)) {
      flat.push(`${id}: centroid ${dull.centroid.toFixed(0)} Hz → ${bright.centroid.toFixed(0)} Hz`);
    }
    // What comes after the lift steps back again.
    const outro = section(made, 'outro');
    const after = outro ? level(mono, ...stretch(made, outro)).rms : -Infinity;
    if (!(after < loud)) flat.push(`${id}: outro ${after.toFixed(1)} dB, lift ${loud.toFixed(1)} dB`);
  }
  assert.deepEqual(flat, []);
});

test('the ending rings out: the last chord fades inside its bar, and the tail ends in silence', () => {
  for (const [id, made] of heard) {
    const { mono, song, barSeconds } = made;
    const last = (song.bars - 1) * barSeconds;
    const struck = level(mono, last, last + barSeconds * 0.3).rms;
    const ringing = level(mono, last + barSeconds * 0.75, last + barSeconds).rms;
    assert.ok(struck > -40, `${id}: the last chord is struck (${struck.toFixed(1)} dB)`);
    assert.ok(ringing < struck - 2, `${id}: ${struck.toFixed(1)} dB → ${ringing.toFixed(1)} dB`);
    const end = mono.length / 48000;
    assert.ok(level(mono, end - 0.05, end).rms < -60, `${id}: the tail is cut off`);
  }
});

test('a calm score and a lively one of the same style stay within the same loudness', async () => {
  for (const id of ['lofi', 'house', 'cinematic']) {
    for (const energy of [0.1, 0.9]) {
      const made = makeScore(id, { energy, seed: 2, seconds: 30 });
      const file = join(dir, `${id}-${energy}.wav`);
      renderToWav(made.song, file);
      const meter = await loudness(file);
      const at = `${id} at energy ${energy}`;
      assert.ok(meter.lufs >= -21 && meter.lufs <= -16, `${at}: ${meter.lufs} LUFS`);
      assert.ok(meter.peak < -1, `${at}: true peak ${meter.peak} dBFS`);
    }
  }
});

test('brightness is heard: the same song with the filters open is brighter', () => {
  const centroid = (b) => {
    const made = makeScore('ambient', { brightness: b, seconds: 20 });
    const mono = renderToWav(made.song, join(dir, `bright-${b}.wav`));
    return brightness(mono, 0, made.fit.seconds).centroid;
  };
  const [dark, plain, bright] = [0, 0.5, 1].map(centroid);
  assert.ok(dark < plain * 0.9 && bright > plain * 1.1, `${dark} < ${plain} < ${bright} Hz`);
});
