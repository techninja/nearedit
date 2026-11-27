import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseAss,
  parseCueTime,
  parseCues,
  parseMarkdown,
  parseSections,
  probeText,
} from './probeText.js';
import { tempDir } from '../testing/media.js';

test('cue timestamps: SRT commas, VTT dots, optional hours, ASS centiseconds', () => {
  assert.equal(parseCueTime('00:00:01,500'), 1.5);
  assert.equal(parseCueTime('01:02:03.250'), 3723.25);
  assert.equal(parseCueTime('02:03.500'), 123.5);
  assert.equal(parseCueTime('0:00:05.20'), 5.2);
  assert.equal(parseCueTime('100:00:00,000'), 360000);
});

test('SRT: numbered cues, multi-line text, CRLF, inline tags', () => {
  const srt =
    '1\r\n00:00:01,000 --> 00:00:03,500\r\nHello <i>there</i>\r\nsecond line\r\n\r\n' +
    '2\r\n01:00:04,000 --> 01:00:06,000\r\nLater\r\n';
  assert.deepEqual(parseCues(srt), [
    { start: 1, end: 3.5, text: 'Hello there second line' },
    { start: 3604, end: 3606, text: 'Later' },
  ]);
});

test('WebVTT: header, NOTE blocks, cue ids, settings and short timestamps', () => {
  const vtt = [
    'WEBVTT - demo',
    '',
    'NOTE this is a comment',
    '',
    'intro',
    '00:01.000 --> 00:02.500 align:start position:10%',
    '<v Ana>Hi everyone',
    '',
    '00:00:03.000 --> 00:00:04.000',
    'Bye',
  ].join('\n');
  assert.deepEqual(parseCues(vtt), [
    { start: 1, end: 2.5, text: 'Hi everyone' },
    { start: 3, end: 4, text: 'Bye' },
  ]);
});

test('ASS: dialogue lines with override tags, commas in text and line breaks', () => {
  const ass = [
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,{\\an8}Hello, world\\Nagain',
    'Comment: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,ignored',
  ].join('\n');
  assert.deepEqual(parseAss(ass), [{ start: 1, end: 2.5, text: 'Hello, world again' }]);
});

test('Markdown: heading sections with levels, preamble kept', () => {
  const md = 'Opening line\n\n# Intro\n\nHello world.\n\n## Part two\n\n- a\n- b\n';
  assert.deepEqual(parseMarkdown(md), [
    { heading: '', level: 0, text: 'Opening line' },
    { heading: 'Intro', level: 1, text: 'Hello world.' },
    { heading: 'Part two', level: 2, text: '- a\n- b' },
  ]);
});

test('plain text: paragraphs', () => {
  assert.deepEqual(parseSections('one\ntwo\n\n\nthree\n', '.txt'), [
    { index: 0, text: 'one\ntwo' },
    { index: 1, text: 'three' },
  ]);
});

test('probeText: subtype, word count and narration estimate', () => {
  const { dir, cleanup } = tempDir();
  try {
    const script = join(dir, 'script.md');
    writeFileSync(script, `﻿# Title\n\n${'word '.repeat(300)}\n`);
    const md = probeText(script);
    assert.equal(md.subtype, 'script');
    assert.equal(md.wordCount, 302); // "#", "Title" and 300 words
    assert.equal(md.estimatedDuration, 120.8); // 150 words per minute
    assert.ok(md.content.startsWith('# Title'), 'BOM stripped');
    assert.equal(md.contentTruncated, false);

    const subs = join(dir, 'subs.srt');
    writeFileSync(subs, '1\n00:00:01,000 --> 00:00:02,000\nOnly these four words\n');
    const srt = probeText(subs);
    assert.equal(srt.subtype, 'subtitle');
    assert.equal(srt.wordCount, 4, 'cue numbers and timestamps are not words');
    assert.equal(srt.sections.length, 1);

    const notes = join(dir, 'notes.txt');
    writeFileSync(notes, 'a b c');
    assert.equal(probeText(notes).subtype, 'notes');
  } finally {
    cleanup();
  }
});
