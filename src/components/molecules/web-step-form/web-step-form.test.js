import { fixture, expect, oneEvent } from '@open-wc/testing';
import { STEP_KINDS, normalizeRecipe } from '#utils/web/index.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import { recipeProblems, stepFields } from '#utils/webUi/stepForm.js';
import './web-step-form.js';

/** A form for one step, at index 3 of its recipe. */
async function mount(step) {
  const recipe = normalizeRecipe({ url: 'https://example.com', steps: [step] });
  const el = await fixture(`<web-step-form></web-step-form>`);
  el.fields = stepFields(recipe.steps[0], recipeProblems(recipe).steps[0]);
  el.index = 3;
  el.heading = 'Click';
  await settle();
  const seen = [];
  el.addEventListener('field-change', (event) => seen.push(event.detail));
  return { el, seen, box: (name) => el.querySelector(`[data-name="${name}"]`) };
}
const typeIn = (box, text) => {
  box.value = text;
  box.dispatchEvent(new Event('input', { bubbles: true }));
};
const leave = (box) => box.dispatchEvent(new Event('change', { bubbles: true }));

describe('web-step-form', () => {
  it('builds a control for every parameter of every step kind, from the table', async () => {
    for (const kind of STEP_KINDS) {
      const { el } = await mount({ do: kind.do });
      const fields = [...el.querySelectorAll('.web-step-form-field')].map((f) => f.dataset.field);
      expect(fields, kind.do).to.deep.equal([
        ...Object.keys(kind.params),
        'duration',
        'hold',
        'ease',
        'note',
      ]);
    }
  });

  it('chooses the control by the parameter’s type', async () => {
    const { box, el } = await mount({ do: 'click', target: 'text=Go' });
    expect(box('target').tagName).to.equal('INPUT');
    expect(box('button').tagName).to.equal('SELECT');
    expect([...box('button').options].map((o) => o.value)).to.deep.equal([
      'left',
      'middle',
      'right',
    ]);
    expect(box('button').options[0].textContent.trim()).to.equal('left (default)');
    expect(box('count').getAttribute('inputmode')).to.equal('decimal');
    expect(el.querySelector('.web-step-form-target .icon-btn').textContent).to.contain('Pick');
    const typed = await mount({ do: 'type', text: 'x', clear: true });
    expect(typed.box('clear').type).to.equal('checkbox');
    expect(typed.box('clear').checked).to.equal(true);
    const run = await mount({ do: 'run', js: 'go()' });
    expect(run.box('js').tagName).to.equal('TEXTAREA');
    const press = await mount({ do: 'press', modifiers: ['Shift'] });
    const held = [...press.el.querySelectorAll('[data-name="modifiers"]')];
    expect(held.map((b) => [b.value, b.checked])).to.deep.equal([
      ['Alt', false],
      ['Control', false],
      ['Meta', false],
      ['Shift', true],
    ]);
  });

  it('shows defaults as placeholders, and a value only where the step differs', async () => {
    const { box } = await mount({ do: 'click', target: 'text=Go', count: 2 });
    expect(box('count').value).to.equal('2');
    expect(box('index').value).to.equal('');
    expect(box('index').placeholder).to.equal('0');
    expect(box('duration').value).to.equal('');
    expect(box('duration').placeholder).to.equal('0.7');
    expect(box('hold').placeholder).to.equal('0.6');
    expect(box('ease').value).to.equal('ease-in-out');
  });

  it('follows typing live and commits when the box is left: one field, one name', async () => {
    const { box, seen } = await mount({ do: 'click', target: 'text=Go' });
    typeIn(box('target'), 'text=Get ');
    typeIn(box('target'), 'text=Get started');
    leave(box('target'));
    expect(seen).to.deep.equal([
      { name: 'steps.3.target', value: 'text=Get ', phase: 'live' },
      { name: 'steps.3.target', value: 'text=Get started', phase: 'live' },
      { name: 'steps.3.target', value: 'text=Get started', phase: 'commit' },
    ]);
  });

  it('keeps what is typed in the box while the recipe trims it', async () => {
    const { el, box } = await mount({ do: 'click', target: 'text=Go' });
    typeIn(box('target'), 'text=Get ');
    // The recipe stores "text=Get": the owner renders the form again with that.
    const recipe = normalizeRecipe({
      url: 'https://e.com',
      steps: [{ do: 'click', target: 'text=Get ' }],
    });
    el.fields = stepFields(recipe.steps[0]);
    await settle();
    expect(box('target').value).to.equal('text=Get ');
    leave(box('target'));
    await settle();
    expect(box('target').value).to.equal('text=Get');
  });

  it('commits numbers when the box is left; an empty timing goes back to its kind', async () => {
    const { box, seen } = await mount({ do: 'click', target: 'text=Go', duration: 2 });
    typeIn(box('duration'), '1.2');
    expect(seen).to.deep.equal([]);
    leave(box('duration'));
    typeIn(box('hold'), '');
    leave(box('hold'));
    typeIn(box('count'), 'many');
    leave(box('count'));
    typeIn(box('count'), '');
    leave(box('count'));
    expect(seen).to.deep.equal([
      { name: 'steps.3.duration', value: 1.2, phase: 'commit' },
      { name: 'steps.3.hold', value: undefined, phase: 'commit' },
      { name: 'steps.3.count', value: 1, phase: 'commit' },
    ]);
  });

  it('reports dropdowns, ticks and held keys at once', async () => {
    const { box, seen } = await mount({ do: 'click', target: 'text=Go' });
    box('button').value = 'right';
    box('button').dispatchEvent(new Event('change', { bubbles: true }));
    const typed = await mount({ do: 'type', text: 'x' });
    typed.box('clear').click();
    const press = await mount({ do: 'press', modifiers: ['Shift'] });
    press.el.querySelector('[data-name="modifiers"][value="Control"]').click();
    expect(seen).to.deep.equal([{ name: 'steps.3.button', value: 'right', phase: 'commit' }]);
    expect(typed.seen).to.deep.equal([{ name: 'steps.3.clear', value: true, phase: 'commit' }]);
    expect(press.seen[0].value).to.have.members(['Shift', 'Control']);
  });

  it('shows a problem under the field it concerns', async () => {
    const { el, box } = await mount({ do: 'type', target: 'label=Email' });
    const text = el.querySelector('[data-field="text"]');
    expect(text.querySelector('[role="alert"]').textContent).to.contain('type needs "text"');
    expect(box('text').getAttribute('aria-invalid')).to.equal('true');
    expect(el.querySelector('[data-field="target"] [role="alert"]')).to.equal(null);
    expect(box('target').getAttribute('aria-invalid')).to.equal('false');
  });

  it('asks to pick a target on the page, and shows which field is waiting', async () => {
    const { el } = await mount({ do: 'scroll' });
    const pick = el.querySelector('.web-step-form-target .icon-btn');
    setTimeout(() => pick.click());
    const { detail } = await oneEvent(el, 'web-pick-field');
    expect(detail).to.deep.equal({ name: 'to' });
    el.picking = 'to';
    await settle();
    expect(
      el.querySelector('.web-step-form-target .icon-btn').getAttribute('aria-pressed'),
    ).to.equal('true');
  });

  it('abandons an edit on Escape without letting the key out, and finishes one on Enter', async () => {
    const { el, box, seen } = await mount({ do: 'click', target: 'text=Go' });
    let escaped = 0;
    el.parentElement.addEventListener('keydown', (event) => (escaped += event.key === 'Escape'));
    typeIn(box('target'), 'text=Other');
    box('target').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(seen.at(-1)).to.deep.equal({
      name: 'steps.3.target',
      value: undefined,
      phase: 'cancel',
    });
    expect(box('target').value).to.equal('text=Go');
    expect(escaped).to.equal(0);
    // With no edit under way Escape is the dialog's.
    box('target').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(escaped).to.equal(1);
  });
});
