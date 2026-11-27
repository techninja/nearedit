import { fixture, expect, oneEvent } from '@open-wc/testing';
import './app-dialog.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const key = (key, init = {}) =>
  new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });

const CONTENT = `
  <div class="dialog">
    <button id="first">First</button>
    <input id="field" />
    <button id="last">Last</button>
  </div>`;

/** The test page has no stylesheets; visibility is this component's CSS. */
function loadStyles(href) {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`could not load ${href}`));
    document.head.append(link);
  });
}

describe('app-dialog', () => {
  before(async () => {
    await loadStyles('/src/styles/overlays.css');
    await loadStyles('/src/components/atoms/app-dialog/app-dialog.css');
  });

  it('is hidden until opened and reflects `open`', async () => {
    const el = await fixture(`<app-dialog>${CONTENT}</app-dialog>`);
    await frame();
    expect(getComputedStyle(el).display).to.equal('none');
    el.open = true;
    await frame();
    expect(el.hasAttribute('open')).to.equal(true);
    expect(getComputedStyle(el).display).to.not.equal('none');
    expect(el.classList.contains('dialog-backdrop')).to.equal(true);
  });

  it('moves focus in on open and gives it back on close', async () => {
    const wrap = await fixture(
      `<div><button id="opener">Open</button><app-dialog>${CONTENT}</app-dialog></div>`,
    );
    const opener = wrap.querySelector('#opener');
    const el = wrap.querySelector('app-dialog');
    opener.focus();
    el.open = true;
    await frame();
    await frame();
    expect(document.activeElement.id).to.equal('first');
    el.open = false;
    await frame();
    expect(document.activeElement).to.equal(opener);
  });

  it('focuses the element marked data-autofocus', async () => {
    const el = await fixture(
      `<app-dialog open><div class="dialog"><button>A</button><input id="name" data-autofocus /></div></app-dialog>`,
    );
    await frame();
    await frame();
    expect(document.activeElement.id).to.equal('name');
  });

  it('keeps Tab inside, wrapping at both ends', async () => {
    const el = await fixture(`<app-dialog open>${CONTENT}</app-dialog>`);
    await frame();
    await frame();
    el.querySelector('#last').focus();
    el.querySelector('#last').dispatchEvent(key('Tab'));
    expect(document.activeElement.id).to.equal('first');
    el.querySelector('#first').dispatchEvent(key('Tab', { shiftKey: true }));
    expect(document.activeElement.id).to.equal('last');
  });

  it('asks to close on Escape and stops keys from leaving the dialog', async () => {
    const el = await fixture(`<app-dialog open>${CONTENT}</app-dialog>`);
    await frame();
    let leaked = 0;
    const onKey = () => leaked++;
    document.addEventListener('keydown', onKey);
    setTimeout(() => el.querySelector('#field').dispatchEvent(key('Escape')));
    const event = await oneEvent(el, 'close');
    el.querySelector('#field').dispatchEvent(key(' '));
    document.removeEventListener('keydown', onKey);
    expect(event.detail.reason).to.equal('escape');
    expect(leaked).to.equal(0);
  });

  it('asks to close on a backdrop click but not on a click inside', async () => {
    const el = await fixture(`<app-dialog open>${CONTENT}</app-dialog>`);
    await frame();
    let closes = 0;
    el.addEventListener('close', () => closes++);
    const inside = el.querySelector('#field');
    inside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    inside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(closes).to.equal(0);
    // A selection dragged from inside onto the backdrop must not close either.
    inside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(closes).to.equal(0);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(closes).to.equal(1);
  });

  it('still answers Escape and Tab when focus fell out of the dialog', async () => {
    const el = await fixture(`<app-dialog open>${CONTENT}</app-dialog>`);
    await frame();
    await frame();
    let closes = 0;
    let leaked = 0;
    el.addEventListener('close', () => closes++);
    const onKey = () => leaked++;
    window.addEventListener('keydown', onKey);
    document.activeElement.blur();
    expect(document.activeElement).to.equal(document.body);
    document.body.dispatchEvent(key('Tab'));
    expect(document.activeElement.id).to.equal('first');
    document.activeElement.blur();
    document.body.dispatchEvent(key(' '));
    document.body.dispatchEvent(key('Escape'));
    window.removeEventListener('keydown', onKey);
    expect(closes).to.equal(1);
    expect(leaked).to.equal(0);
  });

  it('leaves stray keys to the dialog on top when two are open', async () => {
    const wrap = await fixture(
      `<div><app-dialog open id="below">${CONTENT}</app-dialog><app-dialog open id="above"><div class="dialog"><button>OK</button></div></app-dialog></div>`,
    );
    await frame();
    const closed = [];
    for (const el of wrap.querySelectorAll('app-dialog')) {
      el.addEventListener('close', () => closed.push(el.id));
    }
    document.activeElement.blur();
    document.body.dispatchEvent(key('Escape'));
    expect(closed).to.deep.equal(['above']);
  });
});
