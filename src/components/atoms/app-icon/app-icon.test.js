import { fixture, expect } from '@open-wc/testing';
import '../app-icon/app-icon.js';

const frame = () => new Promise((r) => requestAnimationFrame(r));

describe('app-icon', () => {
  it('renders a span with icon class', async () => {
    const el = await fixture(`<app-icon name="plus"></app-icon>`);
    await frame();
    const span = el.querySelector('.icon');
    expect(span).to.exist;
  });

  it('applies size class', async () => {
    const el = await fixture(`<app-icon name="check" size="lg"></app-icon>`);
    await frame();
    expect(el.querySelector('.icon-lg')).to.exist;
  });

  it('applies sm size class', async () => {
    const el = await fixture(`<app-icon name="check" size="sm"></app-icon>`);
    await frame();
    expect(el.querySelector('.icon-sm')).to.exist;
  });

  it('reflects name property', async () => {
    const el = await fixture(`<app-icon name="folder"></app-icon>`);
    expect(el.name).to.equal('folder');
  });

  it('follows a changed name', async () => {
    const el = await fixture(`<app-icon name="play"></app-icon>`);
    for (let i = 0; i < 20 && !el.querySelector('svg'); i++) await frame();
    const before = el.querySelector('.icon').innerHTML;
    expect(before).to.contain('<svg');
    el.name = 'pause';
    await frame();
    await frame();
    const after = el.querySelector('.icon').innerHTML;
    expect(after).to.contain('<svg');
    expect(after).to.not.equal(before);
  });
});
