import { fixture, expect } from '@open-wc/testing';
import { store } from 'hybrids';
import AppState, { APP_STATE_KEY } from '#store/AppState.js';
import './theme-toggle.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;

describe('theme-toggle', () => {
  beforeEach(() => {
    localStorage.removeItem(APP_STATE_KEY);
    store.clear(AppState);
    document.documentElement.removeAttribute('data-theme');
  });

  it('offers the look that is not showing', async () => {
    const el = await fixture(`<theme-toggle></theme-toggle>`);
    await frame();
    const button = el.querySelector('button');
    const wanted = systemDark ? 'light' : 'dark';
    expect(button.getAttribute('aria-label')).to.equal(`Switch to the ${wanted} theme`);
  });

  it('switches the page theme and stores the choice', async () => {
    const el = await fixture(`<theme-toggle></theme-toggle>`);
    await frame();
    el.querySelector('button').click();
    await frame();
    const chosen = systemDark ? 'light' : 'dark';
    expect(document.documentElement.getAttribute('data-theme')).to.equal(chosen);
    expect(JSON.parse(localStorage.getItem(APP_STATE_KEY)).theme).to.equal(chosen);
    expect(el.querySelector('button').getAttribute('aria-label')).to.equal(
      `Switch to the ${systemDark ? 'dark' : 'light'} theme`,
    );
  });

  it('goes back to following the system on the second press', async () => {
    const el = await fixture(`<theme-toggle></theme-toggle>`);
    await frame();
    el.querySelector('button').click();
    await frame();
    el.querySelector('button').click();
    await frame();
    expect(JSON.parse(localStorage.getItem(APP_STATE_KEY)).theme).to.equal('system');
    expect(document.documentElement.getAttribute('data-theme')).to.equal(
      systemDark ? 'dark' : 'light',
    );
  });
});
