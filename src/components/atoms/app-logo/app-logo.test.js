import { fixture, expect } from '@open-wc/testing';
import { emulateMedia } from '@web/test-runner-commands';
import './app-logo.js';
import { COLORS, ICON, MARK, WORDMARK } from './shapes.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** The atom's own stylesheet, as the app loads it. */
function loadStyles() {
  if (document.querySelector('link[data-app-logo]')) return Promise.resolve();
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.appLogo = '';
  link.href = new URL('./app-logo.css', import.meta.url).href;
  document.head.append(link);
  return new Promise((resolve, reject) => {
    link.addEventListener('load', () => resolve());
    link.addEventListener('error', () => reject(new Error('app-logo.css did not load')));
  });
}

async function logo(markup) {
  const el = await fixture(markup);
  await frame();
  return el;
}

/** A part in its place: no transform, or the one that changes nothing. */
const AT_REST = ['none', 'matrix(1, 0, 0, 1, 0, 0)'];

/** The running animations of a logo's parts. */
const animationsOf = (el) =>
  document.getAnimations().filter((animation) => el.contains(animation.effect.target));

describe('app-logo', () => {
  before(loadStyles);

  it('draws the wordmark as an image named NearEdit', async () => {
    const el = await logo(`<app-logo></app-logo>`);
    const svg = el.querySelector('svg.app-logo-svg');
    expect(svg.getAttribute('role')).to.equal('img');
    expect(svg.getAttribute('aria-label')).to.equal('NearEdit');
    expect(svg.getAttribute('viewBox')).to.equal(WORDMARK.viewBox);
    expect(el.querySelectorAll('.app-logo-letter')).to.have.length(7);
    expect(el.querySelectorAll('.app-logo-clip')).to.have.length(3);
    expect(el.querySelectorAll('.app-logo-playhead')).to.have.length(1);
    expect(el.querySelector('text'), 'outlines, not text').to.equal(null);
  });

  it('draws the icon and the mark', async () => {
    const icon = await logo(`<app-logo variant="icon"></app-logo>`);
    expect(icon.querySelector('svg').getAttribute('viewBox')).to.equal(ICON.viewBox);
    expect(icon.querySelector('rect').getAttribute('fill'), 'the navy tile').to.equal(COLORS.navy);
    expect(icon.querySelectorAll('.app-logo-letter'), 'its N').to.have.length(1);
    const mark = await logo(`<app-logo variant="mark"></app-logo>`);
    expect(mark.querySelector('svg').getAttribute('viewBox')).to.equal(MARK.viewBox);
    expect(mark.querySelectorAll('.app-logo-letter')).to.have.length(0);
    expect(mark.querySelectorAll('.app-logo-clip')).to.have.length(3);
  });

  it('follows a changed variant', async () => {
    const el = await logo(`<app-logo></app-logo>`);
    el.variant = 'mark';
    await frame();
    await frame();
    expect(el.querySelector('svg').getAttribute('viewBox')).to.equal(MARK.viewBox);
  });

  it('gives its letters the colour of the text around it, and keeps its own', async () => {
    const el = await logo(`<span style="color: rgb(1, 2, 3)"><app-logo></app-logo></span>`);
    const fill = (selector) => getComputedStyle(el.querySelector(selector)).fill;
    expect(fill('.app-logo-letter')).to.equal('rgb(1, 2, 3)');
    expect(fill('.app-logo-playhead')).to.equal('rgb(239, 68, 68)');
    const clips = [...el.querySelectorAll('.app-logo-clip')].map((c) => getComputedStyle(c).fill);
    expect(clips).to.deep.equal(['rgb(59, 130, 246)', 'rgb(245, 158, 11)', 'rgb(16, 185, 129)']);
  });

  it('has four heights', async () => {
    const heights = [];
    for (const size of ['sm', 'md', 'lg', 'xl']) {
      const el = await logo(`<app-logo size="${size}"></app-logo>`);
      expect(el.querySelector('.app-logo').classList.contains(`app-logo-${size}`)).to.equal(true);
      heights.push(el.querySelector('svg').getBoundingClientRect().height);
    }
    expect(heights).to.deep.equal([20, 28, 48, 80]);
  });

  it('keeps its clips inside a window that ends at the middle of the playhead', async () => {
    const el = await logo(`<app-logo variant="mark"></app-logo>`);
    const window = el.querySelector('svg svg');
    expect(window.getAttribute('x')).to.equal('7');
    expect([...window.children].every((c) => c.classList.contains('app-logo-clip'))).to.equal(true);
  });

  it('stands still unless it is animated', async () => {
    const el = await logo(`<app-logo></app-logo>`);
    expect(el.querySelector('.app-logo-animated')).to.equal(null);
    expect(animationsOf(el)).to.have.length(0);
  });

  it('builds itself once, in well under a second and a half', async () => {
    const el = await logo(`<app-logo animated></app-logo>`);
    const running = animationsOf(el);
    // The playhead, three clips, seven letters.
    expect(running).to.have.length(11);
    const timing = running.map((animation) => animation.effect.getComputedTiming());
    expect(
      timing.every((t) => t.iterations === 1),
      'once',
    ).to.equal(true);
    const end = Math.max(...timing.map((t) => t.endTime));
    expect(end).to.be.within(600, 1100);
    // In order: the playhead first, then the clips one after another, then the letters.
    const delay = (selector) =>
      running
        .filter((animation) => animation.effect.target.matches(selector))
        .map((animation) => animation.effect.getComputedTiming().delay);
    expect(delay('.app-logo-playhead')).to.deep.equal([0]);
    const clips = delay('.app-logo-clip');
    expect(clips).to.deep.equal([...clips].sort((a, b) => a - b));
    expect(new Set(clips).size).to.equal(3);
    expect(Math.min(...delay('.app-logo-letter'))).to.be.above(clips[0]);
    // When it has run, everything is in its place.
    for (const animation of running) animation.finish();
    await frame();
    const moved = [...el.querySelectorAll('.app-logo-clip, .app-logo-playhead, .app-logo-letter')]
      .map((part) => getComputedStyle(part))
      .filter((style) => !AT_REST.includes(style.transform) || style.opacity !== '1');
    expect(moved).to.have.length(0);
  });

  it('does not move at all for people who prefer reduced motion', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    try {
      const el = await logo(`<app-logo animated></app-logo>`);
      expect(el.querySelector('.app-logo-animated')).to.not.equal(null);
      expect(animationsOf(el)).to.have.length(0);
      const part = getComputedStyle(el.querySelector('.app-logo-playhead'));
      expect([part.opacity, part.transform]).to.deep.equal(['1', 'none']);
    } finally {
      await emulateMedia({ reducedMotion: 'no-preference' });
    }
  });
});
