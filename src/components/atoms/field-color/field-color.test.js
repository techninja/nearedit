import { fixture, expect, waitUntil } from '@open-wc/testing';
import { normalizeHex } from './field-color.js';

async function mount(props = {}) {
  const el = await fixture('<field-color name="text.color" label="Colour"></field-color>');
  Object.assign(el, { value: '#ff0000', ...props });
  const events = [];
  el.addEventListener('field-change', (e) => events.push(e.detail));
  await waitUntil(
    () => el.querySelector('.field-color-hex')?.value === (props.mixed ? '' : (el.value ?? '')),
  );
  return {
    el,
    events,
    well: el.querySelector('input[type=color]'),
    hex: el.querySelector('.field-color-hex'),
  };
}
const change = (input, value, type = 'change') => {
  input.value = value;
  input.dispatchEvent(new Event(type, { bubbles: true }));
};

describe('field-color', () => {
  it('normalises hex colours', () => {
    expect(normalizeHex('#F80')).to.equal('#ff8800');
    expect(normalizeHex('00ff7f')).to.equal('#00ff7f');
    expect(normalizeHex('red')).to.equal(null);
    expect(normalizeHex('#0F172AE6')).to.equal('#0f172ae6');
  });

  it('keeps the transparency of a colour the well cannot show', async () => {
    const { events, well, hex } = await mount({ value: '#000000b3' });
    expect(well.value).to.equal('#000000');
    expect(hex.value).to.equal('#000000b3');
    change(well, '#112233', 'input');
    change(hex, '#44556680');
    expect(events).to.deep.equal([
      { name: 'text.color', value: '#112233b3', phase: 'live' },
      { name: 'text.color', value: '#44556680', phase: 'commit' },
    ]);
  });

  it('shows the colour in the well and as hex text, with labels', async () => {
    const { well, hex } = await mount();
    expect(well.value).to.equal('#ff0000');
    expect(hex.value).to.equal('#ff0000');
    expect(well.getAttribute('aria-label')).to.equal('Colour');
  });

  it('reports the picker live and its final choice as a commit', async () => {
    const { events, well } = await mount();
    change(well, '#00ff00', 'input');
    change(well, '#0000ff', 'input');
    change(well, '#0000ff', 'change');
    expect(events.map((e) => [e.value, e.phase])).to.deep.equal([
      ['#00ff00', 'live'],
      ['#0000ff', 'live'],
      ['#0000ff', 'commit'],
    ]);
    expect(events[0].name).to.equal('text.color');
  });

  it('accepts typed hex and puts back text that is not a colour', async () => {
    const { events, hex } = await mount();
    change(hex, 'abc');
    expect(events).to.deep.equal([{ name: 'text.color', value: '#aabbcc', phase: 'commit' }]);
    change(hex, 'nope');
    expect(events.length).to.equal(1);
    expect(hex.value).to.equal('#ff0000');
  });

  it('allows "none" only for optional colours', async () => {
    const required = await mount();
    expect(required.el.querySelector('button')).to.equal(null);
    change(required.hex, '');
    expect(required.events).to.deep.equal([]);
    const optional = await mount({ optional: true });
    optional.el.querySelector('button').click();
    expect(optional.events).to.deep.equal([{ name: 'text.color', value: '', phase: 'commit' }]);
    const none = await mount({ optional: true, value: '', fallback: '#123456' });
    expect(none.well.value).to.equal('#123456');
    expect(none.hex.getAttribute('placeholder')).to.equal('none');
    expect(none.el.querySelector('button').disabled).to.equal(true);
  });
});
