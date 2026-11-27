import { fixture, expect } from '@open-wc/testing';
import { projectPageState } from '#utils/projects/projectPage.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './project-providers.js';

const STATUS = {
  ffmpeg: { available: true, detail: '6.1.1' },
  transcription: { provider: 'whisper-cpp', model: 'base', available: true, detail: '' },
  vision: { provider: 'ollama', model: 'llava:7b', available: false, detail: 'connection refused' },
  llm: {
    provider: 'none',
    model: 'qwen3:14b',
    available: false,
    detail: 'disabled (LLM_PROVIDER=none)',
  },
};

describe('project-providers', () => {
  it('waits for the status', async () => {
    projectPageState.set({ status: null });
    const el = await fixture(`<project-providers></project-providers>`);
    await settle();
    expect(el.textContent).to.contain('Checking what is set up');
  });

  it('shows at a glance what is set up and where to read about what is not', async () => {
    projectPageState.set({ status: STATUS });
    const el = await fixture(`<project-providers></project-providers>`);
    await settle();
    const rows = Object.fromEntries(
      [...el.querySelectorAll('[data-provider]')].map((row) => [row.dataset.provider, row]),
    );
    expect(Object.keys(rows)).to.deep.equal(['ffmpeg', 'transcription', 'vision', 'llm']);
    expect(rows.ffmpeg.querySelector('.project-providers-state').textContent).to.equal('Ready');
    expect(rows.ffmpeg.querySelector('.chip').textContent).to.equal('6.1.1');
    expect(rows.transcription.querySelector('.chip').textContent).to.equal('whisper-cpp · base');
    expect(rows.vision.querySelector('.project-providers-state').textContent).to.equal(
      'Not set up',
    );
    expect(rows.vision.querySelector('.project-providers-setup').textContent).to.contain(
      'connection refused',
    );
    expect(rows.llm.querySelector('.project-providers-setup').textContent).to.contain(
      'docs/app-spec/CONFIGURATION.md',
    );
    expect(el.querySelector('.project-providers-summary').textContent).to.contain(
      'Visual tagging, Director LLM',
    );
  });

  it('flags a missing FFmpeg as blocking', async () => {
    projectPageState.set({
      status: { ...STATUS, ffmpeg: { available: false, detail: 'ffmpeg not found on PATH' } },
    });
    const el = await fixture(`<project-providers></project-providers>`);
    await settle();
    expect(el.querySelector('.project-providers-blocked').textContent).to.contain(
      'FFmpeg is missing',
    );
    expect(
      el.querySelector('[data-provider="ffmpeg"] .project-providers-state').textContent,
    ).to.equal('Missing');
  });
});
