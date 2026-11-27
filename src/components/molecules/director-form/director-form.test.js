import { fixture, expect } from '@open-wc/testing';
import { getAction } from '#utils/director/actions.js';
import { initialValues } from '#utils/directorUi/form.js';
import './director-form.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

async function mount(actionId, extra = {}) {
  const action = getAction(actionId);
  const el = await fixture(`<director-form></director-form>`);
  Object.assign(el, { fields: action.fields, values: initialValues(action), ...extra });
  await frame();
  const changes = [];
  el.addEventListener('fieldchange', (event) =>
    changes.push([event.detail.key, event.detail.value]),
  );
  return { el, action, changes };
}

const input = (el, value) => {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('director-form', () => {
  it('renders one control per schema field, with the defaults', async () => {
    const { el, action } = await mount('base_edit');
    expect(el.querySelectorAll('.director-form-field').length).to.equal(action.fields.length);
    expect(el.querySelector('input[name="duration"]').type).to.equal('range');
    expect(el.querySelector('input[name="duration"]').value).to.equal('60');
    expect(el.querySelector('.director-form-range output').textContent).to.equal('60 s');
    expect(el.querySelector('select[name="style"]').value).to.equal('auto');
    expect(el.querySelector('input[name="tighten"]').checked).to.equal(true);
    expect(el.querySelector('input[name="title"]').placeholder).to.equal('Leave empty for none');
  });

  it('announces changes with values of the field type', async () => {
    const { el, changes } = await mount('base_edit');
    input(el.querySelector('input[name="duration"]'), '25');
    const music = el.querySelector('input[name="music"]');
    music.checked = false;
    music.dispatchEvent(new Event('change', { bubbles: true }));
    const style = el.querySelector('select[name="style"]');
    style.value = 'montage';
    style.dispatchEvent(new Event('change', { bubbles: true }));
    input(el.querySelector('input[name="title"]'), 'Park day');
    expect(changes).to.deep.equal([
      ['duration', 25],
      ['music', false],
      ['style', 'montage'],
      ['title', 'Park day'],
    ]);
  });

  it('offers free text with suggestion chips where the schema allows custom values', async () => {
    const { el, changes } = await mount('generate_edit');
    const style = el.querySelector('input[name="style"]');
    expect(style.type).to.equal('text');
    const chips = [...el.querySelectorAll('.director-form-ideas .chip')];
    expect(chips.map((chip) => chip.textContent.trim())).to.include('documentary');
    chips.find((chip) => chip.textContent.trim() === 'documentary').click();
    input(style, 'slow nature film');
    expect(changes).to.deep.equal([
      ['style', 'documentary'],
      ['style', 'slow nature film'],
    ]);
  });

  it('lists the project’s text files for a file field', async () => {
    const files = [{ filePath: '/p/scripts/a.md', relativePath: 'scripts/a.md' }];
    const { el, changes } = await mount('execute_script', { files });
    const select = el.querySelector('select[name="scriptPath"]');
    expect([...select.options].map((o) => o.textContent.trim())).to.deep.equal([
      'None',
      'scripts/a.md',
    ]);
    select.value = '/p/scripts/a.md';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(changes).to.deep.equal([['scriptPath', '/p/scripts/a.md']]);
  });

  it('shows what the server objected to under the field', async () => {
    const { el } = await mount('remove_silence', { problems: { threshold: 'must be a number' } });
    const field = el.querySelector('input[name="threshold"]').closest('.director-form-field');
    expect(field.querySelector('[role="alert"]').textContent).to.equal('must be a number');
  });

  it('switches off the LLM toggle when no model is available', async () => {
    const { el } = await mount('insert_broll', { llm: { available: false, provider: 'none' } });
    const toggle = el.querySelector('input[name="useLlm"]');
    expect(toggle.disabled).to.equal(true);
    expect(toggle.closest('.director-form-field').textContent).to.contain(
      'Needs the language model',
    );
    const { el: other } = await mount('insert_broll', { llm: { available: true } });
    expect(other.querySelector('input[name="useLlm"]').disabled).to.equal(false);
  });
});
