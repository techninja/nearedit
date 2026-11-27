import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeFailure, failureView } from './editorFailure.js';

describe('describeFailure', () => {
  it('recognises a project the server does not know', () => {
    const err = Object.assign(new Error('Project not found'), { status: 404 });
    assert.deepEqual(describeFailure(err), { missing: 'project', message: 'Project not found' });
  });

  it('recognises a missing adaptation, also as a 404', () => {
    const local = new Error('Adaptation not found in this project');
    assert.equal(describeFailure(local).missing, 'adaptation');
    const err = Object.assign(new Error('Adaptation not found'), { status: 404 });
    assert.equal(describeFailure(err).missing, 'adaptation');
  });

  it('treats anything else as a failure to retry', () => {
    assert.deepEqual(describeFailure(new TypeError('Failed to fetch')), {
      missing: 'other',
      message: 'Failed to fetch',
    });
    assert.equal(describeFailure(undefined).missing, 'other');
  });
});

describe('failureView', () => {
  it('sends a missing project back to the project list', () => {
    const view = failureView('project', 'Project not found', 'p1');
    assert.equal(view.backUrl, '/');
    assert.equal(view.retry, false);
  });

  it('sends a missing adaptation back to its project', () => {
    const view = failureView('adaptation', 'x', 'p1');
    assert.equal(view.backUrl, '/project/p1');
    assert.equal(view.title, 'Adaptation not found');
  });

  it('offers a retry for other failures and shows the reason', () => {
    const view = failureView('other', 'Failed to fetch', 'p1');
    assert.equal(view.retry, true);
    assert.equal(view.text, 'Failed to fetch');
    assert.equal(view.backUrl, '/project/p1');
    assert.equal(failureView('other', 'x', '').backUrl, '/');
  });
});
