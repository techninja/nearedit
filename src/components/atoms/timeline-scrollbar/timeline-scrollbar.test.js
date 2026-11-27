import { fixture, expect, waitUntil } from '@open-wc/testing';
import { sendMouse } from '@web/test-runner-commands';
import { thumbGeometry } from './timeline-scrollbar.js';

const STYLE = `
  timeline-scrollbar { display: block; }
  .timeline-scrollbar { position: relative; width: 400px; height: 12px; }
  .timeline-scrollbar.vertical { width: 12px; height: 300px; }
  .timeline-scrollbar-thumb { position: absolute; top: 0; bottom: 0; }
  .vertical .timeline-scrollbar-thumb { left: 0; right: 0; bottom: auto; }
`;

async function mount(props) {
  const box = await fixture(
    `<div><style>${STYLE}</style><timeline-scrollbar></timeline-scrollbar></div>`,
  );
  const el = box.querySelector('timeline-scrollbar');
  Object.assign(el, props);
  const asked = [];
  el.addEventListener('scrollto', (event) => asked.push(event.detail));
  await waitUntil(() => el.querySelector('.timeline-scrollbar-thumb'), 'never rendered');
  await new Promise((resolve) => requestAnimationFrame(resolve));
  return { el, asked, thumb: () => el.querySelector('.timeline-scrollbar-thumb') };
}
const centre = (rect) => [
  Math.round(rect.left + rect.width / 2),
  Math.round(rect.top + rect.height / 2),
];

describe('timeline-scrollbar', () => {
  it('sizes and places the thumb from the scroll position', () => {
    expect(thumbGeometry({ value: 0, page: 100, total: 400 })).to.deep.equal({
      at: 0,
      size: 25,
      idle: false,
    });
    expect(thumbGeometry({ value: 300, page: 100, total: 400 }).at).to.equal(75);
    expect(thumbGeometry({ value: 150, page: 100, total: 400 }).at).to.equal(37.5);
    expect(thumbGeometry({ value: 999, page: 100, total: 400 }).at).to.equal(75, 'clamped');
    expect(thumbGeometry({ value: 0, page: 1000, total: 14_000_000 }).size).to.equal(
      6,
      'never tiny',
    );
    expect(thumbGeometry({ value: 0, page: 400, total: 400 }).idle).to.equal(true);
    expect(thumbGeometry({ value: 0, page: 0, total: 0 }).idle).to.equal(true);
  });

  it('hides the thumb when everything fits', async () => {
    const { el } = await mount({ value: 0, page: 500, total: 500 });
    expect(el.querySelector('.timeline-scrollbar').classList.contains('idle')).to.equal(true);
  });

  it('asks for a scroll position while the thumb is dragged', async () => {
    const { thumb, asked } = await mount({ value: 0, page: 400, total: 1600 });
    const [x, y] = centre(thumb().getBoundingClientRect());
    await sendMouse({ type: 'move', position: [x, y] });
    await sendMouse({ type: 'down' });
    await sendMouse({ type: 'move', position: [x + 150, y] });
    await sendMouse({ type: 'up' });
    // the thumb is 100 px of a 400 px track: 150 px of travel is half the range
    expect(asked[asked.length - 1]).to.be.closeTo(600, 8);
    await sendMouse({ type: 'move', position: [x + 300, y] });
    expect(asked.length).to.be.at.most(2, 'released: no more requests');
  });

  it('pages towards a press on the track', async () => {
    const { el, asked } = await mount({ value: 0, page: 400, total: 1600 });
    const track = el.querySelector('.timeline-scrollbar').getBoundingClientRect();
    await sendMouse({
      type: 'click',
      position: [Math.round(track.right - 20), Math.round(track.top + 6)],
    });
    expect(asked).to.deep.equal([360]);
  });

  it('works vertically', async () => {
    const { el, thumb, asked } = await mount({ axis: 'y', value: 100, page: 300, total: 600 });
    await waitUntil(() => el.querySelector('.vertical'), 'not vertical');
    expect(thumb().style.top).to.equal('16.6667%');
    const [x, y] = centre(thumb().getBoundingClientRect());
    await sendMouse({ type: 'move', position: [x, y] });
    await sendMouse({ type: 'down' });
    await sendMouse({ type: 'move', position: [x, y + 500] });
    await sendMouse({ type: 'up' });
    expect(asked[asked.length - 1]).to.equal(300, 'clamped to the end');
  });
});
