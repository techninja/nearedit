import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EFFECTS } from '#utils/compose/catalog.js';
import { EFFECT_PRESETS } from '#utils/compose/index.js';
import { createClip } from '#utils/edl/factory.js';
import { assertValid, clipOf, testEdl } from '#utils/edl/testkit.js';
import { applyEffectAction } from '#utils/inspector/effectActions.js';
import { CREATE_DRAG_TYPE, EFFECT_DRAG_TYPE, carries, readPayload } from './dragTypes.js';
import { actionFor, allEffectItems, effectChains } from './effectList.js';

const base = testEdl({
  v1: [createClip({ clipId: 't', timelineEnd: 5, text: { content: 'A' } })],
});

describe('effect list', () => {
  const library = {
    EFFECTS: [
      {
        type: 'blur',
        label: 'Blur',
        category: 'blur',
        description: 'Soften',
        presets: [{ id: 'heavy', name: 'Heavy', params: { radius: 60 } }],
      },
      { type: 'tint', label: 'Tint', category: 'color' },
    ],
    EFFECT_PRESETS: [
      {
        name: 'dream',
        label: 'Dream',
        effects: [{ type: 'blur', params: { radius: 4 } }, { type: 'tint' }],
      },
      { label: 'Broken' },
      { label: 'Empty', effects: [] },
    ],
  };

  it('lists chains first, then each effect followed by its presets', () => {
    assert.deepEqual(
      allEffectItems(library).map((item) => [item.key, item.label, item.category]),
      [
        ['chain:dream', 'Dream', 'looks'],
        ['blur', 'Blur', 'blur'],
        ['blur:heavy', 'Blur — Heavy', 'blur'],
        ['tint', 'Tint', 'color'],
      ],
    );
    assert.deepEqual(effectChains({}), []);
  });

  it('turns an item into the action that applies it', () => {
    const [chain, blur, heavy] = allEffectItems(library);
    assert.deepEqual(actionFor(chain), {
      action: 'chain',
      effects: [
        { type: 'blur', params: { radius: 4 } },
        { type: 'tint', params: {} },
      ],
    });
    assert.deepEqual(actionFor(blur), { action: 'add', type: 'blur', params: undefined });
    assert.deepEqual(actionFor(heavy), { action: 'add', type: 'blur', params: { radius: 60 } });
  });

  it('lists every effect and every look of the real catalog, looks first', () => {
    const items = allEffectItems();
    const keys = items.map((item) => item.key);
    for (const effect of EFFECTS) assert.ok(keys.includes(effect.type), effect.type);
    const looks = items.filter((item) => item.effects);
    assert.equal(looks.length, EFFECT_PRESETS.length);
    assert.deepEqual(items.slice(0, looks.length), looks);
    for (const look of looks) {
      const edl = applyEffectAction(base, { clipIds: ['t'] }, actionFor(look));
      assert.deepEqual(
        clipOf(assertValid(edl), 't').effects.map((fx) => fx.type),
        look.effects.map((fx) => fx.type),
        look.key,
      );
    }
  });
});

describe('drag payloads', () => {
  const transfer = (data) => ({ types: Object.keys(data), getData: (type) => data[type] || '' });

  it('recognises what a drag carries and reads what was dropped', () => {
    const drop = transfer({
      [CREATE_DRAG_TYPE]: JSON.stringify({ kind: 'text', preset: 'title' }),
    });
    assert.equal(carries(drop, CREATE_DRAG_TYPE), true);
    assert.equal(carries(drop, EFFECT_DRAG_TYPE), false);
    assert.equal(carries(null, CREATE_DRAG_TYPE), false);
    assert.deepEqual(readPayload(drop, CREATE_DRAG_TYPE), { kind: 'text', preset: 'title' });
    assert.equal(readPayload(drop, EFFECT_DRAG_TYPE), null);
    assert.equal(readPayload(transfer({ [EFFECT_DRAG_TYPE]: '"text"' }), EFFECT_DRAG_TYPE), null);
  });
});
