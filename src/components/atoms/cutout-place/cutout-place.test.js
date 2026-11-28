import { fixture, expect } from '@open-wc/testing';
import './cutout-place.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

describe('cutout-place', () => {
  it('is a button named after its placement', async () => {
    const el = await fixture(
      `<cutout-place place="circle-left" label="Circle, lower left" hint="In a round window"></cutout-place>`,
    );
    await frame();
    const button = el.querySelector('button');
    expect(button.getAttribute('aria-label')).to.equal('Circle, lower left');
    expect(button.title).to.equal('Circle, lower left — In a round window');
    expect(button.dataset.place).to.equal('circle-left');
    expect(button.getAttribute('aria-pressed')).to.equal('false');
    expect(button.querySelector('i')).to.not.equal(null);
  });

  it('shows that the selection is in this placement', async () => {
    const el = await fixture(
      `<cutout-place place="left" label="Full height, left"></cutout-place>`,
    );
    el.pressed = true;
    await frame();
    expect(el.querySelector('button').getAttribute('aria-pressed')).to.equal('true');
    expect(el.querySelector('button').title).to.equal('Full height, left');
  });

  it('lets a click through to whoever listens on the element, unless disabled', async () => {
    const el = await fixture(
      `<cutout-place place="right" label="Full height, right"></cutout-place>`,
    );
    await frame();
    let clicks = 0;
    el.addEventListener('click', () => clicks++);
    el.querySelector('button').click();
    expect(clicks).to.equal(1);
    el.disabled = true;
    await frame();
    expect(el.querySelector('button').disabled).to.equal(true);
    el.querySelector('button').click();
    expect(clicks).to.equal(1);
  });

  it('draws the person in a different place for every placement', async () => {
    const places = ['fill', 'left', 'right', 'corner-left', 'corner-right', 'circle-left'];
    const seen = new Set();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./cutout-place.css', import.meta.url).href;
    await new Promise((resolve) => {
      link.onload = resolve;
      document.head.append(link);
    });
    for (const place of [...places, 'circle-right']) {
      const el = await fixture(`<cutout-place place="${place}" label="${place}"></cutout-place>`);
      await frame();
      const box = el.querySelector('button').getBoundingClientRect();
      const person = el.querySelector('i').getBoundingClientRect();
      expect(person.width).to.be.greaterThan(2);
      expect(person.left).to.be.at.least(box.left - 1);
      expect(person.right).to.be.at.most(box.right + 1);
      seen.add([person.left - box.left, person.width, person.height].map(Math.round).join());
    }
    link.remove();
    expect(seen.size).to.equal(7);
  });
});
