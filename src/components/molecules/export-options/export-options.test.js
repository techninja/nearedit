import { fixture, expect } from '@open-wc/testing';
import { setSubtitleFormat } from '#utils/captionsUi/exportSubtitles.js';
import { talkDoc } from '#utils/captionsUi/testkit.js';
import { loadDoc } from '#utils/editor/session.js';
import { setCaptions } from '#utils/edl/index.js';
import './export-options.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const PRESETS = [
  { id: 'draft', label: 'Draft', description: 'Half resolution' },
  { id: 'standard', label: 'Standard', description: 'Full resolution' },
];
const RANGES = [
  { id: 'all', label: 'Whole timeline', hint: '1:30', available: true },
  { id: 'loop', label: 'Loop range', hint: 'Set a loop region', available: false },
];

async function mount(extra = {}) {
  const el = await fixture(`<export-options></export-options>`);
  Object.assign(el, {
    presets: PRESETS,
    preset: 'standard',
    ranges: RANGES,
    rangeId: 'all',
    filename: 'Main Edit',
    ...extra,
  });
  await frame();
  const changes = [];
  el.addEventListener('fieldchange', (event) =>
    changes.push([event.detail.key, event.detail.value]),
  );
  return { el, changes };
}

describe('export-options', () => {
  it('shows presets, ranges and the file name', async () => {
    const { el } = await mount();
    expect(el.querySelector('input[value="standard"]').checked).to.equal(true);
    expect(el.textContent).to.contain('Half resolution');
    expect(el.querySelector('input[value="loop"]').disabled).to.equal(true);
    expect(el.textContent).to.contain('Set a loop region');
    expect(el.querySelector('input[name="filename"]').value).to.equal('Main Edit');
    expect(el.querySelector('.export-options-ext').textContent).to.equal('.mp4');
  });

  it('announces every change with its key', async () => {
    const { el, changes } = await mount();
    const draft = el.querySelector('input[value="draft"]');
    draft.checked = true;
    draft.dispatchEvent(new Event('change', { bubbles: true }));
    const name = el.querySelector('input[name="filename"]');
    name.value = 'teaser';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    expect(changes).to.deep.include(['preset', 'draft']);
    expect(changes).to.deep.include(['filename', 'teaser']);
  });

  it('warns about a file name with a slash', async () => {
    const { el } = await mount({ filename: 'a/b' });
    expect(el.querySelector('[role="alert"]').textContent).to.contain('slashes');
  });

  it('offers a subtitle file when the timeline has captions, and announces the choice', async () => {
    setSubtitleFormat('vtt');
    loadDoc(setCaptions(talkDoc(), ['a']));
    const { el, changes } = await mount();
    const radios = [...el.querySelectorAll('input[name="subtitles"]')];
    expect(radios.map((r) => [r.value, r.checked, r.disabled])).to.deep.equal([
      ['', false, false],
      ['srt', false, false],
      ['vtt', true, false],
    ]);
    expect(el.querySelector('.export-options-subtitles-hint').textContent).to.contain(
      'saved beside the video',
    );
    radios[1].checked = true;
    radios[1].dispatchEvent(new Event('change', { bubbles: true }));
    expect(changes).to.deep.include(['subtitles', 'srt']);
    setSubtitleFormat('');
  });

  it('shows the subtitle choice without offering it while nothing is captioned', async () => {
    setSubtitleFormat('srt');
    loadDoc(talkDoc());
    const { el } = await mount();
    const radios = [...el.querySelectorAll('input[name="subtitles"]')];
    expect(radios.map((r) => [r.checked, r.disabled])).to.deep.equal([
      [true, true],
      [false, true],
      [false, true],
    ]);
    expect(el.querySelector('.export-options-subtitles-hint').textContent).to.contain(
      'Inspector ▸ Captions',
    );
    setSubtitleFormat('');
  });
});
