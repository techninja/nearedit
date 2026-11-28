import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESET_NAMES } from '#utils/captions/style.js';
import { presetFromReply, presetFromText } from './captionsLook.js';

test('a description is read as a preset by rule, the same way every time', () => {
  const read = {
    'big bold captions': 'pop',
    'BIG, LOUD captions for TikTok': 'pop',
    'all caps, two words at a time': 'pop',
    karaoke: 'karaoke',
    'the lyrics, line by line': 'karaoke',
    'a sing-along': 'karaoke',
    'words on a dark box': 'boxed',
    'with a background plate behind them': 'boxed',
    'quiet subtitles like in a documentary': 'minimal',
    'small and subtle': 'minimal',
    'keep them simple and white': 'clean',
    'the standard look': 'clean',
  };
  for (const [text, preset] of Object.entries(read)) {
    assert.equal(presetFromText(text), preset, text);
    assert.equal(presetFromText(text), presetFromText(text));
  }
});

test('a preset’s own name wins over any hint; the earlier hint breaks a tie', () => {
  assert.equal(presetFromText('big bold but minimal'), 'minimal');
  assert.equal(presetFromText('Boxed, big and bold and loud'), 'boxed');
  for (const name of PRESET_NAMES) assert.equal(presetFromText(`make them ${name}`), name);
  assert.equal(presetFromText('bold, on a plate'), 'pop');
  assert.equal(presetFromText('on a plate, bold'), 'boxed');
});

test('words that point at no look give none — nothing is guessed', () => {
  for (const text of ['', '   ', 'captions please', 'add captions to the interview', 'popcorn']) {
    assert.equal(presetFromText(text), '', text);
  }
  assert.equal(presetFromText(undefined), '');
});

test('a model’s reply counts only when it names a preset', () => {
  assert.equal(presetFromReply('{"preset": "karaoke"}'), 'karaoke');
  assert.equal(presetFromReply('{ "preset" : "POP" }'), 'pop');
  assert.equal(presetFromReply('Sure! {"preset":"boxed","why":"it reads well"}'), 'boxed');
  assert.equal(presetFromReply('minimal'), 'minimal');
  for (const reply of ['{"preset": "neon"}', '{"style": "pop"}', 'I would use big letters', '']) {
    assert.equal(presetFromReply(reply), '', reply);
  }
});
