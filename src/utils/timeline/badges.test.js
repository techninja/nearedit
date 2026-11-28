import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { badgesChanged, clipBadges, onBadgesChange, registerClipBadge } from './badges.js';

describe('clip badges', () => {
  it('collects what the registered features say about a clip', () => {
    const off = [
      registerClipBadge((clip) =>
        clip.captions?.on ? { id: 'captions', text: 'CC', tone: 'on' } : null,
      ),
      registerClipBadge(() => ({ id: 'cutout', text: '…', tone: 'busy' })),
    ];
    assert.deepEqual(
      clipBadges({ captions: { on: true } }).map((badge) => badge.id),
      ['captions', 'cutout'],
    );
    assert.deepEqual(
      clipBadges({}).map((badge) => badge.id),
      ['cutout'],
    );
    off.forEach((stop) => stop());
    assert.deepEqual(clipBadges({ captions: { on: true } }), []);
  });

  it('shows nothing for a feature that throws, and keeps the others', () => {
    const warn = console.warn;
    console.warn = () => {};
    const off = [
      registerClipBadge(() => {
        throw new Error('broken');
      }),
      registerClipBadge(() => ({ id: 'ok', text: 'A', tone: 'on' })),
    ];
    assert.deepEqual(
      clipBadges({}).map((badge) => badge.id),
      ['ok'],
    );
    off.forEach((stop) => stop());
    console.warn = warn;
  });

  it('tells listeners when a feature says its state changed', () => {
    let heard = 0;
    const stop = onBadgesChange(() => heard++);
    badgesChanged();
    const off = registerClipBadge(() => null);
    off();
    assert.equal(heard, 3);
    stop();
    badgesChanged();
    assert.equal(heard, 3);
  });
});
