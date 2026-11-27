import { fixture, expect } from '@open-wc/testing';
import { ACTIONS } from '#utils/director/actions.js';
import './director-actions.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

async function mount(llm) {
  const el = await fixture(`<director-actions></director-actions>`);
  el.actions = ACTIONS;
  if (llm) el.llm = llm;
  await frame();
  return el;
}
const ids = (el, selector) => [...el.querySelectorAll(selector)].map((b) => b.dataset.id);

describe('director-actions', () => {
  it('lists every action of the schema, marking those that use AI', async () => {
    const el = await mount();
    expect(ids(el, '.director-actions-item')).to.deep.equal(ACTIONS.map((a) => a.id));
    const badge = (id) => el.querySelector(`[data-id="${id}"] .chip`)?.textContent.trim();
    expect(badge('generate_edit')).to.equal('AI');
    expect(badge('insert_broll')).to.equal('AI optional');
    expect(badge('base_edit')).to.equal(undefined);
  });

  it('blocks nothing while the LLM status is unknown', async () => {
    const el = await mount();
    expect(ids(el, '.director-actions-item:disabled')).to.deep.equal([]);
  });

  it('disables the AI actions, with the reason, when the model is unavailable', async () => {
    const el = await mount({
      available: false,
      provider: 'ollama',
      model: 'qwen3:14b',
      detail: 'connection refused',
    });
    expect(ids(el, '.director-actions-item:disabled')).to.deep.equal([
      'generate_edit',
      'generate_script',
      'execute_script',
    ]);
    const note = el.querySelector('[data-id="generate_edit"] .director-actions-note').textContent;
    expect(note).to.contain('ollama · qwen3:14b');
    expect(note).to.contain('connection refused');
    expect(el.querySelector('[data-id="base_edit"]').disabled).to.equal(false);
  });

  it('announces a picked action', async () => {
    const el = await mount({ available: true });
    const picked = [];
    el.addEventListener('actionpick', (event) => picked.push(event.detail.id));
    el.querySelector('[data-id="remove_silence"]').click();
    expect(picked).to.deep.equal(['remove_silence']);
  });
});
