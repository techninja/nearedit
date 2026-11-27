import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notificationPermission, notificationSwitch, shouldOffer } from './notify.js';
import { wantsSystemNotification } from './notify.js';

describe('wantsSystemNotification', () => {
  const cases = [
    // permission, preference, hidden → expected
    ['granted', 'on', true, true],
    ['granted', 'ask', true, true],
    ['granted', 'off', true, false],
    ['granted', 'on', false, false],
    ['default', 'on', true, false],
    ['default', 'ask', true, false],
    ['denied', 'on', true, false],
    ['unsupported', 'on', true, false],
  ];
  for (const [permission, preference, hidden, expected] of cases) {
    it(`${permission} / ${preference} / ${hidden ? 'hidden' : 'visible'} → ${expected}`, () => {
      assert.equal(wantsSystemNotification({ permission, preference, hidden }), expected);
    });
  }
});

describe('shouldOffer', () => {
  it('offers once while the browser has not been asked and the user has not decided', () => {
    assert.equal(shouldOffer({ permission: 'default', preference: 'ask', offered: false }), true);
    assert.equal(shouldOffer({ permission: 'default', preference: 'ask', offered: true }), false);
  });

  it('never offers after a decision, a grant, a block, or without support', () => {
    assert.equal(shouldOffer({ permission: 'default', preference: 'off', offered: false }), false);
    assert.equal(shouldOffer({ permission: 'default', preference: 'on', offered: false }), false);
    assert.equal(shouldOffer({ permission: 'granted', preference: 'ask', offered: false }), false);
    assert.equal(shouldOffer({ permission: 'denied', preference: 'ask', offered: false }), false);
    assert.equal(
      shouldOffer({ permission: 'unsupported', preference: 'ask', offered: false }),
      false,
    );
  });
});

describe('notificationSwitch', () => {
  it('is on only with permission and without an opt-out', () => {
    assert.equal(notificationSwitch('granted', 'on').on, true);
    assert.equal(notificationSwitch('granted', 'ask').on, true);
    assert.equal(notificationSwitch('granted', 'off').on, false);
    assert.equal(notificationSwitch('default', 'on').on, false);
  });

  it('cannot be toggled when blocked or unsupported, and says why', () => {
    const blocked = notificationSwitch('denied', 'on');
    assert.equal(blocked.canToggle, false);
    assert.match(blocked.hint, /blocked/);
    const none = notificationSwitch('unsupported', 'ask');
    assert.equal(none.canToggle, false);
    assert.match(none.hint, /no desktop notifications/);
  });

  it('can be toggled otherwise', () => {
    assert.equal(notificationSwitch('default', 'ask').canToggle, true);
    assert.equal(notificationSwitch('granted', 'off').canToggle, true);
  });
});

describe('notificationPermission', () => {
  it('reports "unsupported" where there is no Notification API (Node)', () => {
    assert.equal(notificationPermission(), 'unsupported');
  });
});
