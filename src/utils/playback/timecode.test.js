import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatTimecode, parseTimecode, frameAt, timecodeBase } from './timecode.js';

describe('formatTimecode', () => {
  it('formats zero and whole seconds', () => {
    assert.equal(formatTimecode(0, 30), '00:00:00:00');
    assert.equal(formatTimecode(1, 30), '00:00:01:00');
    assert.equal(formatTimecode(3661, 30), '01:01:01:00');
  });

  it('shows the frame within the second', () => {
    assert.equal(formatTimecode(0.5, 30), '00:00:00:15');
    assert.equal(formatTimecode(12.5, 24), '00:00:12:12');
    assert.equal(formatTimecode(59 + 29 / 30, 30), '00:00:59:29');
  });

  it('is immune to float error on frame boundaries', () => {
    for (let frame = 0; frame < 3000; frame++) {
      const text = formatTimecode(frame / 30, 30);
      assert.equal(text.slice(-2), String(frame % 30).padStart(2, '0'), `frame ${frame}`);
    }
    assert.equal(formatTimecode(Math.round(2.0333 * 30) / 30, 30), '00:00:02:01');
  });

  it('floors between frames (the frame on screen)', () => {
    assert.equal(formatTimecode(1.049, 30), '00:00:01:01');
    assert.equal(formatTimecode(1.0667, 30), '00:00:01:02');
  });

  it('clamps negative and non-finite input to zero', () => {
    assert.equal(formatTimecode(-3, 30), '00:00:00:00');
    assert.equal(formatTimecode(NaN, 30), '00:00:00:00');
    assert.equal(formatTimecode(Infinity, 30), '00:00:00:00');
  });

  it('counts non-drop-frame at fractional rates', () => {
    assert.equal(timecodeBase(29.97), 30);
    assert.equal(timecodeBase(23.976), 24);
    // 30 frames of 29.97 material take slightly longer than a second
    assert.equal(formatTimecode(30 / 29.97, 29.97), '00:00:01:00');
    assert.equal(formatTimecode(1, 29.97), '00:00:00:29');
  });

  it('widens the frame field for rates above 100', () => {
    assert.equal(formatTimecode(0.5, 120), '00:00:00:060');
  });

  it('falls back to 30 fps for a bad rate', () => {
    assert.equal(formatTimecode(1.5, 0), '00:00:01:15');
  });
});

describe('parseTimecode', () => {
  it('parses a full timecode', () => {
    assert.equal(parseTimecode('00:00:01:15', 30), 1.5);
    assert.equal(parseTimecode('01:01:01:00', 30), 3661);
  });

  it('accepts shortened forms and drop-frame separators', () => {
    assert.equal(parseTimecode('15', 30), 0.5);
    assert.equal(parseTimecode('2:00', 30), 2);
    assert.equal(parseTimecode('1:00:00', 30), 60);
    assert.equal(parseTimecode('00:00:01;15', 30), 1.5);
  });

  it('returns NaN for anything else', () => {
    assert.ok(Number.isNaN(parseTimecode('', 30)));
    assert.ok(Number.isNaN(parseTimecode('abc', 30)));
    assert.ok(Number.isNaN(parseTimecode('1:2:3:4:5', 30)));
    assert.ok(Number.isNaN(parseTimecode('1.5', 30)));
    assert.ok(Number.isNaN(parseTimecode(null, 30)));
  });

  it('round-trips with formatTimecode', () => {
    for (const fps of [24, 25, 30, 60, 29.97]) {
      for (const frame of [0, 1, 29, 30, 1799, 1800, 107999, 108000]) {
        const seconds = frame / fps;
        const back = parseTimecode(formatTimecode(seconds, fps), fps);
        assert.equal(frameAt(back, fps), frame, `${fps} fps frame ${frame}`);
      }
    }
  });
});
