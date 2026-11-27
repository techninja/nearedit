import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { activeCount, isLong, jobOutcome, justFinished, removeJob } from './jobList.js';
import { statusText, trayJobs, upsertJob } from './jobList.js';

const job = (id, extra = {}) => ({
  id,
  type: 'render',
  status: 'running',
  projectId: 'p1',
  label: `Job ${id}`,
  progress: 0,
  error: '',
  log: [],
  createdAt: 100,
  updatedAt: 100,
  hasResult: false,
  result: {},
  ...extra,
});

describe('upsertJob', () => {
  it('adds new jobs newest first', () => {
    const list = upsertJob(upsertJob([], job('a', { createdAt: 1 })), job('b', { createdAt: 2 }));
    assert.deepEqual(
      list.map((j) => j.id),
      ['b', 'a'],
    );
  });

  it('replaces a job by id without mutating the list', () => {
    const before = [job('a')];
    const after = upsertJob(before, job('a', { progress: 50, updatedAt: 200 }));
    assert.equal(after.length, 1);
    assert.equal(after[0].progress, 50);
    assert.equal(before[0].progress, 0);
  });

  it('ignores an update older than the one held', () => {
    const held = [job('a', { status: 'complete', updatedAt: 300 })];
    assert.equal(upsertJob(held, job('a', { status: 'running', updatedAt: 200 })), held);
  });
});

describe('justFinished', () => {
  it('is true when a running job completes, fails or is cancelled', () => {
    for (const status of ['complete', 'error', 'cancelled']) {
      assert.equal(justFinished(job('a'), job('a', { status })), true, status);
    }
    assert.equal(justFinished(job('a', { status: 'queued' }), job('a', { status: 'error' })), true);
  });

  it('is false for progress, repeats and jobs first seen finished', () => {
    assert.equal(justFinished(job('a'), job('a', { progress: 60 })), false);
    assert.equal(
      justFinished(job('a', { status: 'complete' }), job('a', { status: 'complete' })),
      false,
    );
    assert.equal(justFinished(undefined, job('a', { status: 'complete' })), false);
  });
});

describe('trayJobs', () => {
  const jobs = [
    job('render'),
    job('other', { projectId: 'p2' }),
    job('wave', { type: 'waveform' }),
    job('wave-bad', { type: 'waveform', status: 'error' }),
    job('index', { type: 'index', status: 'complete' }),
    job('analyze', { type: 'analyze', status: 'complete' }),
  ];

  it('lists a project’s jobs, hiding housekeeping unless it failed', () => {
    assert.deepEqual(
      trayJobs(jobs, 'p1').map((j) => j.id),
      ['render', 'wave-bad', 'analyze'],
    );
  });

  it('lists every project when none is given', () => {
    assert.equal(
      trayJobs(jobs).some((j) => j.id === 'other'),
      true,
    );
  });

  it('counts active jobs and removes by id', () => {
    assert.equal(activeCount(trayJobs(jobs, 'p1')), 1);
    assert.deepEqual(
      removeJob(jobs, 'render').some((j) => j.id === 'render'),
      false,
    );
  });
});

describe('statusText / isLong', () => {
  it('words each status', () => {
    assert.equal(statusText(job('a', { status: 'queued' })), 'Waiting');
    assert.equal(statusText(job('a', { progress: 41.6 })), '42%');
    assert.equal(statusText(job('a', { status: 'cancelled' })), 'Cancelled');
  });

  it('treats renders, analysis and director runs as long jobs', () => {
    assert.equal(isLong(job('a')), true);
    assert.equal(isLong(job('a', { type: 'director' })), true);
    assert.equal(isLong(job('a', { type: 'waveform' })), false);
  });
});

describe('jobOutcome', () => {
  it('offers download and open for a finished render', () => {
    const result = { file: 'main.mp4', url: '/api/render/file/main.mp4', size: 12.5 * 1024 * 1024 };
    const outcome = jobOutcome(job('a', { status: 'complete', result }));
    assert.equal(outcome.kind, 'success');
    assert.equal(outcome.title, 'Render finished');
    assert.equal(outcome.detail, 'main.mp4 · 12.5 MB');
    assert.deepEqual(
      outcome.actions.map((a) => a.href),
      ['/api/render/file/main.mp4?download', '/api/render/file/main.mp4'],
    );
    assert.equal(outcome.actions[0].download, true);
  });

  it('reports analysis totals, and problems as an error', () => {
    const done = job('a', { type: 'analyze', status: 'complete', result: { total: 8, failed: 0 } });
    assert.equal(jobOutcome(done).detail, '8 files analysed');
    const partly = { ...done, result: { total: 8, failed: 2 } };
    assert.equal(jobOutcome(partly).kind, 'error');
    assert.match(jobOutcome(partly).detail, /2 with problems/);
  });

  it('uses the director summary', () => {
    const run = job('a', {
      type: 'director',
      label: 'Base edit',
      status: 'complete',
      result: { summary: '12 clips, 58.4s' },
    });
    assert.deepEqual(
      [jobOutcome(run).title, jobOutcome(run).detail],
      ['Base edit finished', '12 clips, 58.4s'],
    );
  });

  it('carries the full error of a failed job', () => {
    const failed = job('a', {
      status: 'error',
      label: 'Render: Main',
      error: 'ffmpeg exited with code 1: bad filter',
    });
    assert.deepEqual(jobOutcome(failed), {
      kind: 'error',
      title: 'Render: Main failed',
      detail: 'ffmpeg exited with code 1: bad filter',
      actions: [],
    });
  });
});
