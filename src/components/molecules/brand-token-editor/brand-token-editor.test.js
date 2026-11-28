import { fixture, expect, oneEvent, waitUntil } from '@open-wc/testing';
import { TOKEN_SCHEMA } from '#utils/brand/index.js';
import { kitOf } from '#utils/brandUi/testkit.js';
import { contrastNotes } from '#utils/brandUi/tokenFields.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './brand-token-editor.js';

const kit = kitOf('clean');

async function mount(props = {}) {
  const el = await fixture(
    '<brand-token-editor style="display:block;width:400px"></brand-token-editor>',
  );
  Object.assign(el, { tokens: kit.tokens, changed: {}, fonts: [], notes: {}, ...props });
  await settle();
  return el;
}

describe('brand-token-editor', () => {
  it('is generated from the token schema: every group, every token', async () => {
    const el = await mount();
    const groups = [...el.querySelectorAll('.brand-token-group')];
    expect(groups.map((group) => group.dataset.group)).to.deep.equal(Object.keys(TOKEN_SCHEMA));
    const headings = [...el.querySelectorAll('h3')].map((h) => h.textContent);
    expect(headings.slice(0, 4)).to.deep.equal(['Colours', 'Fonts', 'Logo', 'Shape']);
    expect(headings.length).to.equal(Object.keys(TOKEN_SCHEMA).length);
    expect(el.querySelectorAll('field-color').length).to.equal(
      Object.keys(TOKEN_SCHEMA.color).length,
    );
    expect(el.querySelector('field-color[name="color.primary"]').value).to.equal(
      kit.tokens.color.primary,
    );
    expect(el.querySelector('field-color[name="color.onPrimary"]').value).to.equal(
      kit.tokens.color.onPrimary,
    );
    expect(el.querySelectorAll('.brand-token-font').length).to.equal(2);
    expect(el.querySelector('select[data-name="motion.enter"]').value).to.equal('slide-up');
    expect(el.querySelector('field-number[name="shape.radius"]').value).to.equal(1.2);
  });

  it('reports a change with the token’s path', async () => {
    const el = await mount();
    const hex = el.querySelector('field-color[name="color.accent"] .field-color-hex');
    hex.value = '#ff0000';
    setTimeout(() => hex.dispatchEvent(new Event('change', { bubbles: true })));
    expect((await oneEvent(el, 'field-change')).detail).to.deep.equal({
      name: 'color.accent',
      value: '#ff0000',
      phase: 'commit',
    });
    const ease = el.querySelector('select[data-name="motion.ease"]');
    ease.value = 'linear';
    setTimeout(() => ease.dispatchEvent(new Event('change', { bubbles: true })));
    expect((await oneEvent(el, 'field-change')).detail.name).to.equal('motion.ease');
    const weight = el.querySelector('select[data-name="font.heading.weight"]');
    weight.value = '900';
    setTimeout(() => weight.dispatchEvent(new Event('change', { bubbles: true })));
    expect((await oneEvent(el, 'field-change')).detail).to.deep.equal({
      name: 'font.heading.weight',
      value: 900,
      phase: 'commit',
    });
    const caps = el.querySelector('input[data-name="font.body.upper"]');
    setTimeout(() => caps.click());
    expect((await oneEvent(el, 'field-change')).detail).to.deep.equal({
      name: 'font.body.upper',
      value: true,
      phase: 'commit',
    });
  });

  it('marks what the customisation sets and lets it follow the kit again', async () => {
    const el = await mount({
      changed: { color: { primary: '#22d3ee' }, font: { heading: { weight: 900 } } },
    });
    const shown = (path) =>
      el.querySelector(`.brand-token-reset[data-path="${path}"]`).dataset.shown;
    expect([shown('color.primary'), shown('color.accent'), shown('font.heading')]).to.deep.equal([
      'true',
      'false',
      'true',
    ]);
    const reset = el.querySelector('.brand-token-reset[data-path="color.primary"]');
    expect(getComputedStyle(reset).display).to.not.equal('none');
    setTimeout(() => reset.click());
    expect((await oneEvent(el, 'token-reset')).detail).to.deep.equal({ path: 'color.primary' });
  });

  it('remarks plainly on a colour that would be hard to read — and does not block', async () => {
    const tokens = { ...kit.tokens, color: { ...kit.tokens.color, text: '#1a1a1a' } };
    const el = await mount({ tokens, notes: contrastNotes(tokens) });
    const note = el.querySelector('.brand-token-row[data-path="color.text"] .brand-token-note');
    expect(note.textContent).to.match(
      /^Hard to read on the background \(contrast 1\.\d, aim for 4\.5\)/,
    );
    expect(el.querySelector('field-color[name="color.text"] input').disabled).to.equal(false);
  });

  it('lists the kit’s own font files beside the bundled families', async () => {
    const fonts = [{ family: 'Acme Sans', weight: 700, style: 'normal', file: '/k/Acme.ttf' }];
    const tokens = {
      ...kit.tokens,
      font: { ...kit.tokens.font, heading: { family: 'Acme Sans', weight: 700 } },
    };
    const el = await mount({ tokens, fonts });
    const family = el.querySelector('select[data-name="font.heading.family"]');
    expect(family.value).to.equal('Acme Sans');
    expect([...family.options].map((o) => o.textContent.trim())).to.include(
      'Acme Sans (your file)',
    );
    expect(
      [...el.querySelector('select[data-name="font.heading.weight"]').options].map((o) => o.value),
    ).to.deep.equal(['700']);
    expect(
      [...el.querySelector('select[data-name="font.body.weight"]').options].map((o) => o.value),
    ).to.deep.equal(['400', '700', '900']);
  });

  it('takes a logo or a font file through its buttons, and says when a file cannot be used', async () => {
    const el = await mount({ problem: 'A logo must be a png, jpg, webp or gif picture' });
    expect(el.querySelector('[role="alert"]').textContent).to.contain('A logo must be');
    const input = el.querySelector('input[type="file"][data-path="logo.main"]');
    expect([input.accept, input.hidden]).to.deep.equal(['.png,.jpg,.jpeg,.webp,.gif', true]);
    expect(el.querySelector('input[type="file"][data-path="font.heading"]').accept).to.equal(
      '.woff2,.woff,.ttf,.otf',
    );
    const picked = new DataTransfer();
    picked.items.add(new File(['x'], 'logo.png', { type: 'image/png' }));
    input.files = picked.files;
    setTimeout(() => input.dispatchEvent(new Event('change', { bubbles: true })));
    const { detail } = await oneEvent(el, 'token-file');
    expect([detail.path, detail.file.name]).to.deep.equal(['logo.main', 'logo.png']);
    el.tokens = { ...kit.tokens, logo: { ...kit.tokens.logo, main: 'blob:http://x/1#logo.png' } };
    await waitUntil(() => el.querySelector('.brand-token-logo[data-path="logo.main"] img'));
    expect(
      el.querySelector('.brand-token-logo[data-path="logo.main"] .brand-token-file').textContent,
    ).to.equal('logo.png');
    const remove = el.querySelector(
      '.brand-token-logo[data-path="logo.main"] .icon-btn[aria-label="Remove the logo"]',
    );
    setTimeout(() => remove.click());
    expect((await oneEvent(el, 'field-change')).detail).to.deep.equal({
      name: 'logo.main',
      value: '',
      phase: 'commit',
    });
  });
});
