import { fixture, expect } from '@open-wc/testing';
import { projectPageState } from '#utils/projects/projectPage.js';
import { jobState } from '#utils/ui/jobCenter.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import './project-media.js';

const item = (type, extra = {}) => ({
  filename: `${type}.x`,
  filePath: `/m/${type}.x`,
  type,
  hasAudio: type !== 'image',
  indexed: false,
  duration: type === 'image' ? null : 30,
  size: 1000,
  analysis: {},
  ...extra,
});
const MEDIA = [
  item('video'),
  item('audio', { indexed: true, analysis: { beats: true } }),
  item('image'),
];
const STATUS = {
  ffmpeg: { available: true },
  transcription: { available: false },
  vision: { available: false },
  llm: { available: false },
};

describe('project-media', () => {
  let api;
  beforeEach(() => {
    jobState.set({ jobs: [] });
    projectPageState.set({
      id: 'p1',
      project: { id: 'p1', path: '/m', mediaFolders: [], adaptations: [] },
      media: MEDIA,
      mediaLoading: false,
      mediaError: '',
      status: STATUS,
    });
  });
  afterEach(() => api?.restore());

  it('sums up the media and shows the coverage of each analysis step', async () => {
    const el = await fixture(`<project-media></project-media>`);
    await settle();
    expect(el.querySelector('.project-media-summary').textContent.replace(/\s+/g, ' ')).to.contain(
      '3 files — 1 video, 1 audio file, 1 image · 1:00 of footage',
    );
    const steps = Object.fromEntries(
      [...el.querySelectorAll('[data-step]')].map((row) => [
        row.dataset.step,
        row.querySelector('.project-coverage-count').textContent,
      ]),
    );
    expect(steps).to.deep.equal({
      probe: '1/3',
      scenes: '0/1',
      silences: '0/2',
      beats: '1/2',
      transcript: '0/2',
      tags: '0/2',
    });
    expect(
      el.querySelector('[data-step="transcript"] .project-coverage-note').textContent,
    ).to.contain('Needs a provider');
    expect(el.querySelector('[data-step="beats"] .project-coverage-note')).to.equal(null);
  });

  it('starts an analysis of the project', async () => {
    api = mockApi({ 'POST /api/intelligence/analyze': [202, { jobId: 'j1' }] });
    const el = await fixture(`<project-media></project-media>`);
    await settle();
    const button = el.querySelector('.project-media-analyse');
    expect(button.classList.contains('btn-primary')).to.equal(true, 'analysis is pending');
    button.click();
    await settle();
    expect(api.calls[0].body).to.deep.equal({ projectId: 'p1' });
  });

  it('shows the running analysis with progress and disables the button', async () => {
    const el = await fixture(`<project-media></project-media>`);
    jobState.set({
      jobs: [
        {
          id: 'j1',
          type: 'analyze',
          status: 'running',
          projectId: 'p1',
          label: 'Analyze: 3 files',
          progress: 40,
          log: ['video.x: scenes ok'],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    await settle();
    expect(el.querySelector('.project-media-job strong').textContent).to.equal('Analysing… 40%');
    expect(el.querySelector('.project-media-job .progress-bar').style.width).to.equal('40%');
    expect(el.querySelector('.project-media-job-log').textContent).to.equal('video.x: scenes ok');
    expect(el.querySelector('.project-media-analyse').disabled).to.equal(true);
  });

  it('explains an empty project folder', async () => {
    projectPageState.set({ media: [] });
    const el = await fixture(`<project-media></project-media>`);
    await settle();
    expect(el.querySelector('.empty-state').textContent).to.contain('No media found yet');
    expect(el.querySelector('.project-media-analyse').disabled).to.equal(true);
  });
});
