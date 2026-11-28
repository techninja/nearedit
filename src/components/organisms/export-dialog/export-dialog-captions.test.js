import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { talkDoc } from '#utils/captionsUi/testkit.js';
import { setCaptions } from '#utils/edl/index.js';
import { loadDoc } from '#utils/editor/session.js';
import { exportState, setExportOption } from '#utils/ui/exportController.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import './export-dialog.js';

const DONE = {
  output: '/renders/Main.mp4',
  file: 'Main.mp4',
  url: '/api/render/file/Main.mp4',
  ...{ duration: 10, size: 1000, width: 1920, height: 1080, fps: 30 },
};

describe('export-dialog and subtitles', () => {
  let api;
  let result;
  let job;
  async function open(doc) {
    loadDoc(doc);
    const el = await fixture(`<export-dialog></export-dialog>`);
    el.open = true;
    await settle(200);
    return el;
  }
  const choice = (el, value) => el.querySelector(`input[name="subtitles"][value="${value}"]`);
  const pick = (el, value) => {
    choice(el, value).checked = true;
    choice(el, value).dispatchEvent(new Event('change', { bubbles: true }));
  };
  const posted = () => api.calls.find((c) => c.method === 'POST' && c.path === '/api/render');

  beforeEach(async () => {
    setExportOption('subtitles', '');
    result = { ...DONE, warnings: [] };
    job = { id: 'r1', type: 'render', status: 'complete', progress: 100 };
    exportState.set({ adaptationId: '', presets: [], job: null, result: null, starting: false });
    await store.set(ProjectState, { projectId: 'p1', adaptationId: 'a1', adaptationName: 'Main' });
    await store.set(ProjectState, { dirty: false, saveError: '' });
    api = mockApi({
      'GET /api/render/presets': { data: [{ id: 'standard', label: 'Standard', description: '' }] },
      'POST /api/render/plan': { width: 1920, height: 1080, fps: 30, duration: 10, warnings: [] },
      'POST /api/render': [202, { jobId: 'r1' }],
      'GET /api/jobs/r1': () => job,
      'DELETE /api/jobs/r1': [204, null],
      'GET /api/jobs/r1/result': () => result,
    });
  });
  afterEach(() => api.restore());

  it('offers a subtitle file once captions are on, and remembers the choice', async () => {
    const el = await open(setCaptions(talkDoc(), ['a']));
    expect([...el.querySelectorAll('input[name="subtitles"]')].map((r) => r.value)).to.deep.equal([
      '',
      'srt',
      'vtt',
    ]);
    expect(choice(el, '').checked).to.equal(true);
    expect(choice(el, 'srt').disabled).to.equal(false);
    pick(el, 'srt');
    await settle();
    expect(exportState.get().subtitles).to.equal('srt');
    expect(choice(el, 'srt').checked).to.equal(true);
    expect(JSON.parse(localStorage.getItem('nearedit_captions')).exportSubtitles).to.equal('srt');
    // Choosing a subtitle file does not change what will be rendered.
    expect(api.calls.filter((c) => c.path === '/api/render/plan').length).to.equal(1);
  });

  it('sends the choice with the render and shows the file that was saved', async () => {
    const el = await open(setCaptions(talkDoc(), ['a']));
    pick(el, 'vtt');
    await settle();
    Object.assign(result, {
      subtitles: 'Main.vtt',
      subtitlesUrl: '/api/render/file/Main.vtt',
      warnings: ['memo.wav has no transcript: its captions were left out'],
    });
    el.querySelector('.export-dialog-start').click();
    await waitUntil(() => el.querySelector('.export-dialog-done'), 'the render finishes');
    expect(posted().body.subtitles).to.equal('vtt');
    expect(posted().body.preset).to.equal('standard');
    const saved = el.querySelector('.export-dialog-subtitle-file');
    expect(saved.querySelector('.export-dialog-file').textContent).to.equal('Main.vtt');
    const link = saved.querySelector('a');
    expect(link.getAttribute('href')).to.equal('/api/render/file/Main.vtt?download');
    expect(link.hasAttribute('download')).to.equal(true);
    expect(el.querySelector('.export-dialog-subtitles li').textContent).to.contain('memo.wav');
  });

  it('asks for no file when none was chosen, and says nothing after', async () => {
    const el = await open(setCaptions(talkDoc(), ['a']));
    el.querySelector('.export-dialog-start').click();
    await waitUntil(() => el.querySelector('.export-dialog-done'));
    expect('subtitles' in posted().body).to.equal(false);
    expect(el.querySelector('.export-dialog-subtitles')).to.equal(null);
  });

  it('does not offer the choice without captions, and does not send a remembered one', async () => {
    setExportOption('subtitles', 'srt');
    const el = await open(talkDoc());
    expect(choice(el, 'srt').disabled).to.equal(true);
    expect(choice(el, '').checked).to.equal(true);
    expect(el.querySelector('.export-options-subtitles-hint').textContent).to.contain(
      'No captions are switched on',
    );
    el.querySelector('.export-dialog-start').click();
    await waitUntil(() => el.querySelector('.export-dialog-done'));
    expect('subtitles' in posted().body).to.equal(false);
  });

  it('keeps the choice when another adaptation is opened', async () => {
    const el = await open(setCaptions(talkDoc(), ['a']));
    pick(el, 'vtt');
    await settle();
    el.open = false;
    await store.set(ProjectState, { adaptationId: 'a2', adaptationName: 'Tall' });
    el.open = true;
    await settle(200);
    expect(el.querySelector('input[name="filename"]').value).to.equal('Tall');
    expect(choice(el, 'vtt').checked).to.equal(true);
    el.querySelector('.export-dialog-start').click();
    await waitUntil(() => el.querySelector('.export-dialog-done'));
    expect(posted().body.adaptationId).to.equal('a2');
    expect(posted().body.subtitles).to.equal('vtt');
  });

  it('cancels a render that carries a subtitle file, and is back at the options', async () => {
    job = { ...job, status: 'running', progress: 40 };
    const el = await open(setCaptions(talkDoc(), ['a']));
    pick(el, 'srt');
    await settle();
    el.querySelector('.export-dialog-start').click();
    await waitUntil(() => el.querySelector('.export-dialog-running'), 'the render is running');
    expect(posted().body.subtitles).to.equal('srt');
    const cancel = [...el.querySelectorAll('.dialog-footer button')].find((button) =>
      button.textContent.includes('Cancel render'),
    );
    cancel.click();
    await waitUntil(() => el.querySelector('export-options'), 'the options are back');
    expect(api.calls.some((c) => c.method === 'DELETE' && c.path === '/api/jobs/r1')).to.equal(
      true,
    );
    expect(choice(el, 'srt').checked).to.equal(true);
    expect(el.querySelector('.export-dialog-blocked')).to.equal(null);
  });
});
