import { fixture, expect } from '@open-wc/testing';
import { PRESETS, SYNTH_PARAMS, normalizeSong } from '#utils/music/index.js';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './music-sound.js';

const parts = normalizeSong({
  parts: [
    { kind: 'synth', preset: 'bass', params: { cutoff: 900 } },
    { kind: 'drums', kit: 'lofi' },
  ],
}).parts;

async function mount(shown = parts[0]) {
  const stage = await fixture('<div style="width:320px"><music-sound></music-sound></div>');
  const el = stage.querySelector('music-sound');
  el.shown = shown;
  const changes = [];
  el.addEventListener('field-change', (event) => changes.push(event.detail));
  await settle();
  return { el, changes };
}

describe('music-sound', () => {
  before(() =>
    loadStyles([
      'styles/tokens.css',
      'styles/fields.css',
      'styles/buttons.css',
      'styles/components-create.css',
    ]),
  );

  it('offers every preset by category and describes the chosen one', async () => {
    const { el, changes } = await mount();
    const preset = el.querySelector('select[data-name="preset"]');
    expect([...preset.querySelectorAll('optgroup')].map((group) => group.label)).to.deep.equal([
      'Bass',
      'Keys',
      'Pads',
      'Leads',
    ]);
    expect(preset.querySelectorAll('option').length).to.equal(Object.keys(PRESETS).length);
    expect(preset.value).to.equal('bass');
    expect(el.querySelector('.music-sound-about').textContent).to.equal(PRESETS.bass.description);
    preset.value = 'pad';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    expect(changes).to.deep.equal([{ name: 'preset', value: 'pad', phase: 'commit' }]);
  });

  it('builds a control for every parameter of the schema, in the schema’s groups', async () => {
    const { el } = await mount();
    const groups = [...new Set(Object.values(SYNTH_PARAMS).map((spec) => spec.group))];
    const titles = [...el.querySelectorAll('details summary span:first-child')].map(
      (title) => title.textContent,
    );
    expect(titles).to.deep.equal(groups);
    for (const [name, spec] of Object.entries(SYNTH_PARAMS)) {
      const control =
        spec.type === 'select'
          ? el.querySelector(`select[data-name="params.${name}"]`)
          : el.querySelector(`field-number[name="params.${name}"]`);
      expect(control, name).to.exist;
    }
    const cutoff = el.querySelector('field-number[name="params.cutoff"]');
    expect(cutoff.value).to.equal(900);
    expect(cutoff.spec).to.include({ min: 20, max: 20000, unit: 'Hz' });
    expect(el.querySelector('select[data-name="params.filterType"]').value).to.equal('lowpass24');
    const filter = [...el.querySelectorAll('details')].find((section) =>
      section.textContent.includes('Cutoff'),
    );
    expect(filter.querySelector('.chip').textContent, 'what the part changed').to.equal('1 set');
  });

  it('reports a changed parameter by its name, and resets to the preset', async () => {
    const { el, changes } = await mount();
    const wave = el.querySelector('select[data-name="params.osc1Wave"]');
    wave.value = 'pulse';
    wave.dispatchEvent(new Event('change', { bubbles: true }));
    const slider = el.querySelector('field-number[name="params.resonance"] input[type="range"]');
    slider.value = '0.7';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(changes.slice(0, 2)).to.deep.equal([
      { name: 'params.osc1Wave', value: 'pulse', phase: 'commit' },
      { name: 'params.resonance', value: 0.7, phase: 'live' },
    ]);
    const reset = el.querySelector('.music-sound-reset .btn');
    expect(reset.disabled).to.equal(false);
    reset.click();
    expect(changes.at(-1)).to.include({ name: 'params', phase: 'commit' });
    el.shown = { ...parts[0], params: {} };
    await settle();
    expect(reset.disabled, 'nothing to reset').to.equal(true);
    expect(el.querySelector('.music-sound-reset span').textContent).to.equal(
      'As the preset has it',
    );
  });

  it('shows the kit of a drum part, and says what to do without a part', async () => {
    const { el, changes } = await mount(parts[1]);
    const kit = el.querySelector('select[data-name="kit"]');
    expect(kit.value).to.equal('lofi');
    expect([...kit.options].map((option) => option.value)).to.deep.equal([
      '808',
      '909',
      'acoustic',
      'lofi',
    ]);
    expect(el.querySelector('details')).to.not.exist;
    kit.value = '909';
    kit.dispatchEvent(new Event('change', { bubbles: true }));
    expect(changes).to.deep.equal([{ name: 'kit', value: '909', phase: 'commit' }]);
    el.shown = {};
    await settle();
    expect(el.textContent).to.contain('Choose a part');
    el.locked = true;
    el.shown = parts[0];
    await settle();
    expect(el.querySelector('select[data-name="preset"]').disabled).to.equal(true);
  });
});
