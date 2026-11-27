import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { baseName, countOf, formatBytes, formatDuration, timeAgo } from './format.js';

describe('formatBytes', () => {
  it('picks a readable unit', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(900), '900 B');
    assert.equal(formatBytes(1536), '1.5 KB');
    assert.equal(formatBytes(12.3 * 1024 * 1024), '12.3 MB');
    assert.equal(formatBytes(250 * 1024 * 1024), '250 MB');
    assert.equal(formatBytes(3 * 1024 ** 3), '3.0 GB');
  });

  it('returns nothing for a non-size', () => {
    assert.equal(formatBytes(NaN), '');
    assert.equal(formatBytes(-1), '');
  });
});

describe('formatDuration', () => {
  it('formats seconds as m:ss and h:mm:ss', () => {
    assert.equal(formatDuration(0), '0:00');
    assert.equal(formatDuration(7.4), '0:07');
    assert.equal(formatDuration(205), '3:25');
    assert.equal(formatDuration(3723), '1:02:03');
  });

  it('rounds up into the next minute cleanly', () => {
    assert.equal(formatDuration(59.6), '1:00');
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-01-10T12:00:00Z');

  it('describes recent and older moments', () => {
    assert.equal(timeAgo('2026-01-10T11:59:40Z', now), 'just now');
    assert.equal(timeAgo('2026-01-10T11:55:00Z', now), '5 minutes ago');
    assert.equal(timeAgo('2026-01-10T11:00:00Z', now), '1 hour ago');
    assert.equal(timeAgo('2026-01-07T12:00:00Z', now), '3 days ago');
    assert.equal(timeAgo('2025-11-01T12:00:00Z', now), '2 months ago');
    assert.equal(timeAgo('2023-01-01T12:00:00Z', now), '3 years ago');
  });

  it('accepts epoch milliseconds and tolerates clocks ahead', () => {
    assert.equal(timeAgo(now - 120000, now), '2 minutes ago');
    assert.equal(timeAgo(now + 5000, now), 'just now');
  });

  it('returns nothing for a missing or broken date', () => {
    assert.equal(timeAgo('', now), '');
    assert.equal(timeAgo('yesterday-ish', now), '');
  });
});

describe('baseName / countOf', () => {
  it('takes the last path segment', () => {
    assert.equal(baseName('/media/trip/day one'), 'day one');
    assert.equal(baseName('/media/trip/'), 'trip');
    assert.equal(baseName('C:\\video\\clip'), 'clip');
    assert.equal(baseName(''), '');
  });

  it('pluralises', () => {
    assert.equal(countOf(1, 'file'), '1 file');
    assert.equal(countOf(0, 'file'), '0 files');
    assert.equal(countOf(2, 'child', 'children'), '2 children');
  });
});
