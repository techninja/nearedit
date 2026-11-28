import { fixture, expect, oneEvent } from '@open-wc/testing';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import { testSnapshot } from '#utils/webUi/testkit.js';
import './web-page-map.js';

async function mount(extra = {}, mark = '') {
  const el = await fixture(
    `<div style="display:flex;width:640px;height:360px"><web-page-map></web-page-map></div>`,
  );
  const map = el.querySelector('web-page-map');
  map.snapshot = testSnapshot(extra);
  map.mark = mark;
  await settle(120);
  return map;
}
const outline = (map, label) => map.querySelector(`.web-page-map-el[aria-label="${label}"]`);

describe('web-page-map', () => {
  before(() =>
    loadStyles(['styles/tokens.css', 'styles/editor.css', 'styles/components-create.css']),
  );

  it('draws the whole page: the picture where the viewport is, outlines for everything', async () => {
    const map = await mount();
    const area = map.querySelector('.web-page-map-area').getBoundingClientRect();
    const shot = map.querySelector('.web-page-map-shot').getBoundingClientRect();
    // 1280 × 2000 page; the 1280 × 720 picture fits the 360 px high view exactly.
    expect(Math.round(area.width)).to.be.within(636, 640);
    expect(Math.round(area.height / area.width / (2000 / 1280))).to.equal(1);
    expect(Math.round(shot.height / area.height / (720 / 2000))).to.equal(1);
    expect(map.querySelectorAll('.web-page-map-el').length).to.equal(5);
    expect(map.querySelector('.web-page-map-fold').textContent).to.contain('Below the picture');
  });

  it('names what has no picture, and leaves what has one to the picture', async () => {
    const map = await mount();
    const email = outline(map, 'input: Email');
    expect(email.classList.contains('is-out')).to.equal(true);
    expect(email.textContent.trim()).to.equal('Email');
    const button = outline(map, 'button: Get started');
    expect(button.classList.contains('is-out')).to.equal(false);
    expect(button.textContent.trim()).to.equal('');
    expect(button.dataset.label).to.equal('button: Get started');
  });

  it('puts what lies inside a section on top of it, also while the section is hovered', async () => {
    const map = await mount();
    const box = outline(map, 'button: Get started').getBoundingClientRect();
    const at = [box.left + box.width / 2, box.top + box.height / 2];
    // Compared as a boolean: a failed comparison of two elements prints the whole page.
    expect(document.elementFromPoint(...at) === outline(map, 'button: Get started')).to.equal(true);
    expect(getComputedStyle(outline(map, 'section: Hero')).zIndex).to.equal('auto');
  });

  it('marks the element the selected step aims at, or its point', async () => {
    const map = await mount({}, 'text=Get started');
    expect(map.querySelectorAll('.is-marked').length).to.equal(1);
    expect(outline(map, 'button: Get started').classList.contains('is-marked')).to.equal(true);
    map.mark = 'point=640,360';
    await settle();
    expect(map.querySelector('.is-marked')).to.equal(null);
    const point = map.querySelector('.web-page-map-point');
    expect(point.style.left).to.equal('50%');
    expect(point.style.top).to.equal('18%');
  });

  it('announces a press on an element with the page point under it', async () => {
    const map = await mount();
    const button = outline(map, 'button: Get started');
    const box = button.getBoundingClientRect();
    const [clientX, clientY] = [Math.round(box.left + 2), Math.round(box.top + 2)];
    setTimeout(() =>
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX, clientY, detail: 1 })),
    );
    const { detail } = await oneEvent(map, 'web-pick');
    expect(detail.pick.element.target).to.equal('text=Get started');
    expect(Math.round(detail.pick.point.x)).to.be.within(100, 110);
    expect(Math.round(detail.pick.point.y)).to.be.within(300, 310);
    expect([detail.x, detail.y]).to.deep.equal([clientX, clientY]);
  });

  it('announces a key press on an element with its middle, and a press on empty page as a point', async () => {
    const lone = { kind: 'button', name: 'Go', target: '#go', visible: true };
    const map = await mount({
      elements: [{ ...lone, rect: { x: 100, y: 100, width: 80, height: 40 } }],
    });
    const button = outline(map, 'button: Go');
    setTimeout(() => button.click());
    const byKey = await oneEvent(map, 'web-pick');
    expect(byKey.detail.pick.point).to.deep.equal({ x: 140, y: 120 });
    const area = map.querySelector('.web-page-map-area');
    const box = area.getBoundingClientRect();
    const [clientX, clientY] = [box.left + box.width / 2, box.top + box.height / 4];
    setTimeout(() =>
      area.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX, clientY })),
    );
    const empty = await oneEvent(map, 'web-pick');
    expect(empty.detail.pick.element).to.equal(null);
    expect(Math.round(empty.detail.pick.point.x)).to.be.within(637, 643);
    expect(Math.round(empty.detail.pick.point.y)).to.be.within(497, 503);
  });

  it('scrolls to the picture when the page was scrolled, and renders nothing without a snapshot', async () => {
    const map = await mount({ scrollY: 1000 });
    await settle(120);
    const area = map.querySelector('.web-page-map-area');
    expect(Math.round(map.scrollTop)).to.equal(Math.round(area.offsetHeight / 2));
    map.snapshot = null;
    await settle();
    expect(map.querySelector('.web-page-map-area')).to.equal(null);
  });
});
