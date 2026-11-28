import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { builtinKit, resolveKit } from '#utils/brand/index.js';
import { createEdl, insertElement, normalizeEdl } from '#utils/edl/index.js';
import { catalogFindings } from './catalogCheck.js';
import { catalogCommand } from './catalogCommand.js';
import { repairFindings } from './repairs.js';

const CLEAN = resolveKit(builtinKit('clean'));
const document = () =>
  JSON.parse(
    JSON.stringify(insertElement(createEdl(), CLEAN, 'lower-third', { name: 'Ada' }, { time: 0 })),
  );
const findings = (raw) => {
  const edl = normalizeEdl(raw);
  return [...repairFindings(raw, edl), ...catalogFindings(edl)].map(
    (one) => `${one.level} ${one.path}: ${one.message}`,
  );
};

describe('nearedit: brand elements', () => {
  it('validate has nothing to say about a sound element clip', () => {
    assert.deepEqual(findings(document()), []);
  });

  it('validate reports a broken design with its path', () => {
    const raw = document();
    const { design } = raw.tracks[0].clips[0].element;
    design.layers[0].around = 'nowhere';
    design.layers.push(
      { type: 'generator', generator: 'sparkle' },
      { type: 'hologram' },
      { type: 'text', text: '{slot.missing}' },
    );
    const at = 'tracks[0].clips[0].element.design';
    const said = findings(raw);
    assert.ok(
      said.includes(`error ${at}.layers[0].around: "nowhere" is not a layer or a group`),
      said.join('\n'),
    );
    assert.ok(said.includes(`error ${at}.layers[4].generator: unknown generator "sparkle"`));
    assert.ok(
      said.some((line) => line.startsWith(`error ${at}.layers[5]: refers to {slot.missing}`)),
    );
    assert.ok(said.includes(`warning ${at}.layers: has 7 entries, 6 were usable`));
    const odd = document();
    odd.tracks[0].clips[0].element.design.layers[1].wobble = 3;
    assert.deepEqual(findings(odd), [
      `warning ${at}.layers[1].wobble: is not a field of the document and was ignored`,
    ]);
    const empty = document();
    empty.tracks[0].clips[0].element.design.layers = [];
    assert.deepEqual(findings(empty), [
      `error ${at}.layers: has no layers: the element draws nothing`,
    ]);
  });

  it('catalog lists the built-in kits, their elements and their slots', async () => {
    const lines = [];
    assert.equal(await catalogCommand([], { out: (line) => lines.push(line) }), 0);
    const text = lines.join('\n');
    assert.match(text, /Brand kits — built in/);
    for (const kit of ['clean', 'bold', 'documentary', 'playful'])
      assert.match(text, new RegExp(`builtin:${kit} — `));
    assert.match(text, /lower-third\s+overlay, 5 s\s+name, role\?/);
    assert.match(text, /stinger\s+transition, 1\.2 s\s+—/);
    const json = [];
    await catalogCommand(['--json'], { out: (line) => json.push(line) });
    const { kits, generators } = JSON.parse(json.join('\n'));
    assert.ok(generators.length > 0);
    assert.deepEqual(
      kits.map((kit) => kit.id),
      ['clean', 'bold', 'documentary', 'playful'],
    );
    assert.deepEqual(
      kits[1].elements.find((element) => element.id === 'quote').slots.map((slot) => slot.name),
      ['text', 'by'],
    );
  });
});
