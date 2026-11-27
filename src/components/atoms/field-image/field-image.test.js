import { fixture, expect, waitUntil } from '@open-wc/testing';
import './field-image.js';

const IMAGES = [
  { path: '/media/logo.png', name: 'logo.png' },
  { path: '/media/sun set.jpg', name: 'sun set.jpg' },
];

async function mount(props = {}) {
  const el = await fixture(
    '<field-image name="generator.params.sprite" label="Picture"></field-image>',
  );
  Object.assign(el, { images: IMAGES, ...props });
  const events = [];
  el.addEventListener('field-change', (e) => events.push(e.detail));
  await waitUntil(() => el.querySelectorAll('option').length > IMAGES.length);
  return { el, events, select: el.querySelector('select') };
}

describe('field-image', () => {
  it('lists the stills with "None" first and reports the chosen path', async () => {
    const { events, select } = await mount();
    expect([...select.options].map((o) => o.textContent.trim())).to.deep.equal([
      'None',
      'logo.png',
      'sun set.jpg',
    ]);
    expect(select.value).to.equal('');
    select.value = '/media/logo.png';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(events).to.deep.equal([
      { name: 'generator.params.sprite', value: '/media/logo.png', phase: 'commit' },
    ]);
  });

  it('shows a preview of the chosen image, also one that is no longer in the project', async () => {
    const { el, select } = await mount({ value: '/media/sun set.jpg' });
    await waitUntil(() => el.querySelector('img'));
    expect(el.querySelector('img').getAttribute('src')).to.contain(
      encodeURIComponent('/media/sun set.jpg'),
    );
    expect(select.value).to.equal('/media/sun set.jpg');
    el.value = '/gone/old.png';
    await waitUntil(() => select.value === '/gone/old.png');
    expect(select.selectedOptions[0].textContent.trim()).to.equal('old.png');
  });

  it('says so when the project has no stills', async () => {
    const el = await fixture('<field-image label="Picture"></field-image>');
    await waitUntil(() => el.querySelector('.field-image-hint'));
    expect(el.querySelector('.field-image-hint').textContent).to.contain('No stills');
  });
});
