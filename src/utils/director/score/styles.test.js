import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRUM_NAMES } from '#utils/music/catalog/drums.js';
import { KITS } from '#utils/music/catalog/kits.js';
import { PRESETS } from '#utils/music/catalog/presets.js';
import { SYNTH_PARAMS } from '#utils/music/catalog/synthParams.js';
import { SONG_LIMITS, STEP_COUNTS } from '#utils/music/limits.js';
import { paramValue } from '#utils/music/params.js';
import { BASS_STYLES } from '#utils/music/theory/bass.js';
import { ARP_MODES } from '#utils/music/theory/chordParts.js';
import { KEY_NAMES } from '#utils/music/theory/names.js';
import { degree, progression } from '#utils/music/theory/roman.js';
import { SCALES } from '#utils/music/theory/scales.js';
import { tonicNumeral } from './harmony.js';
import { AUTO, STYLES, STYLE_IDS, findStyle, getStyle, styleInText } from './styles.js';

const ROLES = ['bass', 'chords', 'arp', 'lead'];

test('there are at least eight styles, each with its own name and a one-line description', () => {
  assert.ok(STYLES.length >= 8, `${STYLES.length} styles`);
  assert.equal(new Set(STYLE_IDS).size, STYLES.length);
  assert.equal(new Set(STYLES.map((style) => style.label)).size, STYLES.length);
  for (const style of STYLES) {
    assert.match(style.id, /^[a-z]+$/, style.id);
    assert.ok(style.id !== AUTO && style.label, style.id);
    assert.ok(style.description.length > 30 && style.description.length < 110, style.id);
    assert.ok(!style.description.includes('\n'), style.id);
    assert.equal(getStyle(style.id), style);
  }
  assert.equal(getStyle('polka'), null);
});

test('every style is different in character: tempo, metre, scale, kit or instruments', () => {
  const sketch = (style) =>
    JSON.stringify([
      style.bpm,
      style.beatsPerBar,
      style.scale,
      style.kit,
      style.swing,
      style.parts.map((part) => `${part.role}:${part.preset}`),
      style.drums.map((layer) => layer.lanes),
    ]);
  assert.equal(new Set(STYLES.map(sketch)).size, STYLES.length);
  // Between them they cover slow and fast, major and minor, straight and swung, three and four.
  assert.ok(Math.min(...STYLES.map((s) => s.bpm[0])) <= 70);
  assert.ok(Math.max(...STYLES.map((s) => s.bpm[1])) >= 160);
  assert.ok(STYLES.some((s) => s.beatsPerBar === 3) && STYLES.some((s) => s.swing > 0));
  assert.ok(STYLES.some((s) => tonicNumeral(s.scale) === 'I'));
  assert.ok(STYLES.some((s) => tonicNumeral(s.scale) === 'i'));
  assert.ok(STYLES.some((s) => s.drums.length === 0), 'one has no drums at all');
});

test('tempo, metre, scale and keys of every style are the engine’s', () => {
  for (const style of STYLES) {
    const [low, high] = style.bpm;
    assert.ok(low >= SONG_LIMITS.bpm[0] && high <= SONG_LIMITS.bpm[1] && high - low >= 8, style.id);
    assert.ok(style.beatsPerBar >= 2 && style.beatsPerBar <= 12, style.id);
    assert.ok(Object.hasOwn(SCALES, style.scale), `${style.id}: scale ${style.scale}`);
    assert.ok(style.keys.length >= 3, style.id);
    for (const key of style.keys) assert.ok(KEY_NAMES.includes(key), `${style.id}: key ${key}`);
    assert.ok(style.swing >= SONG_LIMITS.swing[0] && style.swing <= SONG_LIMITS.swing[1]);
    assert.ok(style.master.volume > 0.3 && style.master.volume <= 1, style.id);
  }
});

test('every progression reads as one chord per bar, and no chord has a semitone inside', () => {
  for (const style of STYLES) {
    assert.ok(style.progressions.length >= 3, style.id);
    const numerals = [...style.progressions, style.turn, tonicNumeral(style.scale)];
    for (const key of style.keys) {
      for (const written of numerals) {
        const names = written.split('-');
        const chords = progression(key, style.scale, written);
        assert.equal(chords.length, names.length, `${style.id}: ${written} in ${key}`);
        for (const chord of chords) {
          const classes = chord.steps.map((step) => (chord.root + step) % 12);
          for (const a of classes) {
            for (const b of classes) {
              assert.notEqual((a - b + 12) % 12, 1, `${style.id}: ${chord.name} grinds`);
            }
          }
        }
      }
    }
    for (const written of style.progressions) {
      assert.ok([4, 8].includes(written.split('-').length), `${style.id}: ${written}`);
    }
    assert.ok(degree(style.keys[0], style.scale, style.turn), style.id);
  }
});

test('drums: a kit of the engine, lanes of its drums, one bar each, quietest layer first', () => {
  for (const style of STYLES) {
    assert.ok(Object.hasOwn(KITS, style.kit), `${style.id}: kit ${style.kit}`);
    assert.ok(STEP_COUNTS.includes(style.steps), style.id);
    const bars = [...style.drums.map((layer) => layer.lanes), style.fill, style.hit];
    for (const lanes of bars) {
      for (const [drum, lane] of Object.entries(lanes)) {
        assert.ok(DRUM_NAMES.includes(drum), `${style.id}: ${drum}`);
        assert.equal(lane.length, style.steps, `${style.id}: ${drum} ${lane}`);
        assert.match(lane, /^[.oxX]+$/, `${style.id}: ${drum}`);
        assert.match(lane, /[oxX]/, `${style.id}: ${drum} is silent`);
      }
    }
    const from = style.drums.map((layer) => layer.from);
    assert.deepEqual(
      from,
      [...from].sort((a, b) => a - b),
      style.id,
    );
    for (const layer of style.drums) {
      assert.ok(layer.from > 0.3 && layer.from < 1, `${style.id}: ${layer.name} is not in an intro`);
      assert.ok(layer.volume > 0 && layer.volume <= 1 && layer.reverb >= 0 && layer.reverb <= 1);
    }
    if (style.drums.length) {
      assert.ok(Object.keys(style.fill).length && Object.keys(style.hit).length, style.id);
      // The downbeat a fill lands on never doubles the kick of the beat that starts with it.
      assert.equal(style.hit.kick, undefined, style.id);
    } else assert.deepEqual([style.fill, style.hit], [{}, {}], style.id);
  }
});

test('instruments: presets and parameters of the engine, a part for the chords and the bass', () => {
  for (const style of STYLES) {
    const names = [...style.parts.map((part) => part.name), ...style.drums.map((l) => l.name)];
    assert.equal(new Set(names).size, names.length, `${style.id}: two parts share a name`);
    assert.ok(names.length + 3 <= SONG_LIMITS.parts, `${style.id}: too many parts`);
    for (const part of style.parts) {
      const at = `${style.id}: ${part.name}`;
      assert.ok(ROLES.includes(part.role), at);
      assert.ok(Object.hasOwn(PRESETS, part.preset), `${at}: preset ${part.preset}`);
      assert.ok(part.from >= 0 && part.from < 1, at);
      assert.ok(part.volume > 0 && part.volume <= SONG_LIMITS.volume[1], at);
      assert.ok(Math.abs(part.pan) <= 1 && part.reverb >= 0 && part.reverb <= 1, at);
      assert.ok(part.delay >= 0 && part.delay <= 1, at);
      for (const [name, value] of Object.entries(part.params)) {
        assert.ok(Object.hasOwn(SYNTH_PARAMS, name), `${at}: parameter ${name}`);
        assert.equal(paramValue(name, value, NaN), value, `${at}: ${name} out of range`);
      }
      if (part.role === 'bass') assert.ok(BASS_STYLES.includes(part.write.style), at);
      if (part.role === 'arp') assert.ok(ARP_MODES.includes(part.write.mode), at);
      if (part.write.scale) assert.ok(Object.hasOwn(SCALES, part.write.scale), at);
      for (const [beat, length] of part.write.hits || []) {
        assert.ok(beat >= 0 && beat < style.beatsPerBar && length > 0, `${at}: hit ${beat}`);
      }
    }
    const first = (role) => style.parts.find((part) => part.role === role);
    assert.equal(first('chords')?.from, 0, `${style.id}: the chords play from the first bar`);
    assert.ok(first('bass'), `${style.id}: no bass`);
    assert.ok(first('lead'), `${style.id}: no melody`);
    assert.ok(style.parts.some((part) => part.from >= 0.7), `${style.id}: nothing is kept for a lift`);
  }
});

test('a style is found by its id, its label and the words people use for it', () => {
  assert.equal(findStyle('lofi')?.id, 'lofi');
  assert.equal(findStyle(' Lo-Fi ')?.id, 'lofi');
  assert.equal(findStyle('Bossa Nova')?.id, 'bossa');
  assert.equal(findStyle('hip hop')?.id, 'hiphop');
  assert.equal(findStyle('Hip-Hop')?.id, 'hiphop');
  assert.equal(findStyle('upbeat_corporate')?.id, 'corporate');
  assert.equal(findStyle('Drum and Bass')?.id, 'breakbeat');
  for (const style of STYLES) {
    assert.equal(findStyle(style.label)?.id, style.id);
    assert.equal(findStyle(style.id.toUpperCase())?.id, style.id);
  }
  for (const nothing of ['polka', '', 'auto', null, 7, {}]) assert.equal(findStyle(nothing), null);
});

test('the first style a brief names is found in it; ordinary words are not styles', () => {
  assert.equal(styleInText('a lo-fi bed, calm and warm')?.id, 'lofi');
  assert.equal(styleInText('Something cinematic that turns into house at the end')?.id, 'cinematic');
  assert.equal(styleInText('retro, like a night drive')?.id, 'synthwave');
  assert.equal(styleInText('BOSSA NOVA please')?.id, 'bossa');
  assert.equal(styleInText('a gentle waltz.')?.id, 'waltz');
  for (const plain of ['', 'calm, hopeful, picks up at the reveal', 'a household film', 'wrap up'])
    assert.equal(styleInText(plain), null, plain);
});
